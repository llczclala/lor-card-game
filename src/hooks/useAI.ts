import { useEffect, useRef } from 'react';
import type { CardData, GameState } from '../types';
import { canAffordCard } from '../utils/gameRules';
import { evaluate } from '../logic/aiSpellStrategies';

type AIProps = {
    game: GameState;
    enemyHand: CardData[];
    enemyBench: CardData[];
    playerBench: CardData[]; // [新增] 玩家备战席
    combatField: any[];
    actions: any;
    setMessage: (msg: string) => void;
    disabled?: boolean; // ★ 教程模式禁用AI自动行动
};

export const useAI = ({ game, enemyHand, enemyBench, playerBench, combatField, actions, setMessage, disabled = false }: AIProps) => {
    // [修改] 将 playerBench 加入 Ref
    const stateRef = useRef({ game, enemyHand, enemyBench, playerBench, combatField });
    // [新增] 法术冷却标记：刚打出法术后跳过一轮判断，防止 async commitSpell 期间重复施法
    const spellCooldownRef = useRef(false);

    // 实时更新 Ref
    useEffect(() => {
        stateRef.current = { game, enemyHand, enemyBench, playerBench, combatField };
    }, [game, enemyHand, enemyBench, playerBench, combatField]);

    useEffect(() => {
        // ★ 教程模式：AI 不自动行动，由剧本控制
        if (disabled) return;
        const { game: currGame } = stateRef.current;

        // [核心修改] 植入 AI 逻辑锁：增加对 pendingLevelUps 队列的监控。
        // 只要有人排队等升级，或者正在播动画，AI 的时间就会被完全冻结！
        if (
            currGame.gameResult ||
            currGame.turnOwner === 'player' ||
            currGame.phase === 'animating' ||
            (currGame.pendingLevelUps && currGame.pendingLevelUps.length > 0) ||
            (currGame.spellCasting?.step === 'choose_mode') ||     // [2026-07-20] AI 命运抉择中，暂停等待
            (currGame.calibratePending?.owner === 'enemy')         // [2026-07-20] AI 校准中，暂停等待
        ) return;

        const timer = setTimeout(() => {
            try { // [try-catch 保护] 任何未捕获异常都不会让 AI 卡死
            const freshState = stateRef.current;
            const { game: g, enemyHand: hand, enemyBench: bench, combatField: field } = freshState;

            console.log(`[AI] ⏰ 行动 tick — phase=${g.phase} turnOwner=${g.turnOwner} hand=${hand.length} bench=${bench.length} mana=${g.enemyMana}`);

            if (!actions || !setMessage) return;
            if (g.gameResult) return; // [新增] 游戏已结束，AI 停止行动
            if (g.turnOwner !== 'enemy') return;
            if (g.spellCasting?.step === 'choose_mode') return;       // [2026-07-20] 二次守卫：AI 命运抉择中
            if (g.calibratePending?.owner === 'enemy') return;         // [2026-07-20] 二次守卫：AI 校准中

            // --- 阶段 A: 防守/格挡阶段 (Block Phase) ---
            if (g.phase === 'block_declare') {
                console.log(`[AI] 🛡️ 进入格挡阶段 — field=${field.length} bench=${bench.length}`);
                // 🛡️ [修复] 检查进攻方归属——如果战场上是敌方在进攻，说明是敌方的进攻回合，AI 不应该格挡！
                const isPlayerAttacking = field.some(f => f.attacker && f.owner === 'player');
                if (!isPlayerAttacking) {
                    setMessage('敌方无须格挡，确认防线。');
                    actions.confirmBlock(); // 强制推进到响应阶段，绝不能调用 passTurn
                    return;
                }

                setMessage("敌方正在思考格挡...");

                // 1. 获取所有待分配的阻挡者 (复制一份备战席)
                let availableBlockers = bench.filter((c: CardData) => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
                // 2. 创建新的战场状态 (复制一份当前战场)
                const newCombatField = field.map(f => ({ ...f }));
                // 3. 玩家备战席 (用于判断威胁? 这里主要是处理 field 里的 attacker)

                // 遍历每一个战斗槽位进行决策
                newCombatField.forEach((fight) => {
                    const attacker = fight.attacker;
                    if (!attacker) return;
                    if (fight.isChallenged) return;
                    // 筛选出所有能阻挡该单位的候选人 (处理隐秘等逻辑)
                    const validBlockers = availableBlockers.filter(b => {
                        if (b.keywords.includes('CantBlock')) return false;
                        // 如果攻击者有隐秘，必须用隐秘阻挡
                        if (attacker.keywords.includes('Elusive') && !b.keywords.includes('Elusive')) return false;
                        // [2026-07-08 修复] 凶恶：只能被攻击力3或以上的单位阻挡
                        const bPower = (b.power || 0) + (b.buffs?.power || 0);
                        if (attacker.keywords.includes('Fearsome') && bPower < 3) return false;
                        return true;
                    });

                    if (validBlockers.length === 0) return; // 无人可挡

                    let chosenBlocker: CardData | null = null;

                    // [2026-07-09] 格挡关键词辅助函数
                    const canSurvive = (b: CardData, atkPower: number) => {
                        if (b.keywords.includes('Barrier')) return true;
                        const hp = b.health + (b.keywords.includes('Tough') ? 1 : 0);
                        return hp > atkPower;
                    };
                    const canKillAtk = (b: CardData, atkHealth: number) => {
                        const p = b.power + (b.keywords.includes('Thorns') ? 1 : 0);
                        return p >= atkHealth;
                    };

                    // --- 决策逻辑 1: 应对碾压 (Overwhelm) ---
                    // 规则: 如果玩家派出高攻碾压，而场上没有生命值比该攻击力更高的单位，派出生命值最高的单位尽可能减伤
                    const hasOverwhelm = attacker.keywords.includes('Overwhelm');

                    if (hasOverwhelm) {
                        // 1. 屏障 blocker? 完美吸收，最优先派出
                        const barrierBlockers = validBlockers.filter(b => b.keywords.includes('Barrier'));
                        if (barrierBlockers.length > 0) {
                            chosenBlocker = barrierBlockers.sort((a, b) => a.cost - b.cost)[0];
                        } else {
                            // 尝试找能完美扛住的 (有效HP > Atk)
                            const survivors = validBlockers.filter(b => canSurvive(b, attacker.power));
                            if (survivors.length > 0) {
                                chosenBlocker = survivors.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 没人能抗住，选有效血量最高的当肉盾 (考虑坚韧)
                                chosenBlocker = validBlockers.sort((a, b) => {
                                    const hpB = b.health + (b.keywords.includes('Tough') ? 1 : 0);
                                    const hpA = a.health + (a.keywords.includes('Tough') ? 1 : 0);
                                    return hpB - hpA;
                                })[0];
                            }
                        }
                    }
                    // --- 决策逻辑 2: 智能止损逻辑 (Smart Mitigation) ---
                    else {
                        // 策略A: 完美白吃 (我活，敌死) - 最优解
                        const perfectKillers = validBlockers.filter(b =>
                            canSurvive(b, attacker.power) && canKillAtk(b, attacker.health)
                        );

                        // 策略B: 免费格挡 (我活，敌不死) - 拖延/蹭血
                        const survivors = validBlockers.filter(b => canSurvive(b, attacker.power));

                        // 策略C: 牺牲格挡 (我死) - 包含互换(Trade)和填旋(Chump Block)
                        // [关键修改] 只有满足特定价值公式，AI 才愿意牺牲单位
                        const sacrificeCandidates = validBlockers.filter(b => {
                            // 能活就不算牺牲
                            if (canSurvive(b, attacker.power)) return false;
                            // [2026-07-09] 幻象(Ephemeral)：回合结束必死，无脑填入
                            if (b.keywords.includes('Ephemeral')) return true;
                            // 斩杀保护：如果不挡水晶就炸了
                            if (g.enemyNexus <= attacker.power) return true;
                            // 价值公式：挽回的水晶伤害 >= 2倍 损失的单位生命值
                            if (attacker.power >= 2 * b.health) return true;
                            return false;
                        });

                        // --- 优先级执行 ---
                        if (perfectKillers.length > 0) {
                            // 1. 能白吃，优先让再生单位去 (反正下回合回满)
                            chosenBlocker = perfectKillers.sort((a, b) => {
                                const aRegen = a.keywords.includes('Regeneration') ? -1 : 0;
                                const bRegen = b.keywords.includes('Regeneration') ? -1 : 0;
                                return (a.cost - b.cost) || (aRegen - bRegen);
                            })[0];
                        } else if (survivors.length > 0) {
                            // 2. 能存活，同理优先再生
                            chosenBlocker = survivors.sort((a, b) => {
                                const aRegen = a.keywords.includes('Regeneration') ? -1 : 0;
                                const bRegen = b.keywords.includes('Regeneration') ? -1 : 0;
                                return (a.cost - b.cost) || (aRegen - bRegen);
                            })[0];
                        } else if (sacrificeCandidates.length > 0) {
                            // 3. 必须牺牲时，在“愿意牺牲”的名单里挑
                            // 优先选能换掉对手的 (Traders)
                            const traders = sacrificeCandidates.filter(b => canKillAtk(b, attacker.health));

                            if (traders.length > 0) {
                                // 能换掉对手，选最便宜的
                                chosenBlocker = traders.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 换不掉对手 (纯填旋)，选最便宜且血最少的 (止损)
                                chosenBlocker = sacrificeCandidates.sort((a, b) => a.cost - b.cost || a.health - b.health)[0];
                            }
                        }
                        // 4. 如果以上都不满足 (会死，且不满足价值公式，且不致死) -> 不格挡，脸接伤害
                    }

                    // 如果选中了阻挡者
                    if (chosenBlocker) {
                        fight.blocker = chosenBlocker;
                        // 从可用列表中移除，防止一人挡多路
                        availableBlockers = availableBlockers.filter(b => b.id !== chosenBlocker!.id);
                    }
                });

                // 应用格挡结果
                if (actions.setCombatField && actions.setEnemyBench) {
                    actions.setEnemyBench(availableBlockers); // 剩下的回备战席
                    actions.setCombatField(newCombatField);

                    // 稍微延迟一下确认，展示格挡意图
                    setTimeout(() => {
                        actions.confirmBlock(); // [核心修复] 调用 confirmBlock，切入 react_to_block 阶段
                    }, 500);
                }
                return;
            }
            // --- 阶段 A.5: 格挡后响应阶段 (React to Block Phase) ---
            if (g.phase === 'react_to_block') {
                console.log(`[AI] ⏭️ 格挡后响应阶段，不响应 (手牌中法术将在主阶段打出)`);
                setMessage("敌方让过（不响应格挡）。");
                // 因为目前 AI 还没有被教导如何在战斗中打出法术，所以直接交还优先权/确认物理结算
                actions.passTurn();
                return;
            }
            // --- 阶段 B: 进攻确认 (Attack Declare) ---
            if (g.phase === 'attack_declare') {
                console.log(`[AI] ✅ 进攻确认阶段 — commitAttack`);
                // AI 已经发起进攻，现在是确认阶段 (通常由 initiateAttack 后的逻辑触发)
                actions.commitAttack();
                return;
            }

            // --- 阶段 C: 主阶段 (Main Phase) ---
            if (g.phase === 'main') {
                console.log(`[AI] ==== AI 主阶段开始 ==== round=${g.round} mana=${g.enemyMana}/${g.enemySpellMana} bench=${bench.length}/${g.enemyNexus}hp hand=${hand.length} tok=${g.attackToken.enemy}`);
                // 1. 处理法术堆叠 (目前逻辑：如果有法术，直接让过/结算)
                if (g.spellStack.length > 0) {
                    console.log(`[AI] 📚 法术堆叠有 ${g.spellStack.length} 个待结算 — 让过`);
                    setMessage("敌方让过（结算法术）。");
                    actions.passTurn();
                    return;
                }

                // ==========================================
                // [重构] AI 法术决策 — 数据驱动模式 (Pattern Engine)
                // 不再为每张法术硬编码 if-else，改为根据 spell.ai 配置
                // 路由到 aiSpellStrategies.ts 中的对应 Handler
                // ==========================================

                // [新增] 法术冷却：刚打出法术后跳过一轮，等 async commitSpell 结算完再重新判断
                const onCooldown = spellCooldownRef.current;
                spellCooldownRef.current = false;

                let castedSpell = false;

                // [已恢复] AI 法术决策 — 数据驱动模式 (Pattern Engine)
                if (!onCooldown) {
                    // ============================================
                    // 🎯 [LOG] 进入法术评估
                    // ============================================
                    console.log(`[AI-SPELL] ====== 开始法术评估 ====== state.phase=${g.phase} cooldown=${onCooldown}`);
                    console.log(`[AI-SPELL] 手牌数=${hand.length} 法力=${g.enemyMana}/${g.enemySpellMana} 敌方水晶=${g.playerNexus}`);

                    // 遍历手牌中的所有法术，按优先级评分选出最佳选择
                    const playableSpells = hand.filter(c => c && c.type.includes('spell') && canAffordCard(c, g.enemyMana, g.enemySpellMana, bench));
                    console.log(`[AI-SPELL] 可打出法术数=${playableSpells.length}`, playableSpells.map(s => `${s.key}(${s.name})`));

                    // 用策略引擎评估所有可打出的法术，选评分最高的
                    const evaluated = playableSpells
                        .map(spell => {
                            // ⚠️ 每个法术独立 try-catch，一个挂了不影响其他
                            try {
                                const { playerBench: pBench } = stateRef.current;
                                const result = evaluate(spell, g, bench, pBench, hand);
                                const adjustedScore = result.shouldPlay ? (result.score + (spell.ai?.priority ?? 0) * 5) : 0;
                                console.log(`[AI-SPELL]   🔍 ${spell.key}(${spell.name}) → shouldPlay=${result.shouldPlay} score=${adjustedScore} debug="${result.debug}" targets=`, result.targets);
                                return { spell, result, adjustedScore };
                            } catch (err) {
                                console.error(`[AI-SPELL]   ❌ ${spell.key}(${spell.name}) evaluate 抛出异常:`, err);
                                return { spell, result: { shouldPlay: false, score: 0, debug: `异常: ${err}` }, adjustedScore: 0 };
                            }
                        })
                        .filter(entry => entry.result.shouldPlay)
                        .sort((a, b) => b.adjustedScore - a.adjustedScore);

                    console.log(`[AI-SPELL] 筛选后候选法术数=${evaluated.length}`, evaluated.map(e => `${e.spell.key}(${e.adjustedScore}分)`));

                    if (evaluated.length > 0) {
                        const best = evaluated[0];
                        console.log(`[AI-SPELL] ✅ 选中: ${best.spell.key}(${best.spell.name}) 目标=`, best.result.targets);
                        setMessage(`敌方打出法术：${best.spell.name}`);
                        try {
                            actions.playCard(best.spell, 'enemy', best.result.targets);
                            castedSpell = true;
                            console.log(`[AI-SPELL] ✅ playCard 调用完成`);
                        } catch (err) {
                            console.error(`[AI-SPELL] ❌ playCard 抛出异常:`, err);
                            // playCard 异常时不要卡死，让 AI 继续后续逻辑
                        }
                    } else {
                        console.log(`[AI-SPELL] ⏭️ 无可用的法术，继续后续逻辑`);
                    }

                    if (castedSpell) {
                        console.log(`[AI-SPELL] 🚀 已打出法术，设置 cooldown，提前 return`);
                        spellCooldownRef.current = true; // 冷却标记：下一轮跳过法术判断
                        return;
                    }

                } // end of cooldown check

                // 2. 尝试打出单位
                // 策略：有费就打，铺场优先
                // [2026-07-08 新增日志] 打出全手牌详情
                console.log(`[AI] 👋 全手牌详情:`, hand.map(c =>
                    `${c.key}(${c.name}) type=${c.type} cost=${c.cost} 可购买=${canAffordCard(c, g.enemyMana, g.enemySpellMana, bench)}`
                ));
                const playableUnit = hand.find((c: CardData) =>
                    c && c.type && c.type.includes('unit') && canAffordCard(c, g.enemyMana, g.enemySpellMana, bench)
                );

                if (playableUnit && bench.length < 6) {
                    console.log(`[AI] 🃏 打出单位: ${playableUnit.key}(${playableUnit.name})`);
                    setMessage(`敌方打出：${playableUnit.name}`);
                    actions.playCard(playableUnit, 'enemy');
                    return;
                }
                console.log(`[AI] ⏭️ 无单位可打 (playableUnit=${!!playableUnit} bench=${bench.length}/6)`);

                // 3. 尝试发起进攻
                if (g.attackToken.enemy && bench.length > 0) {
                    const { playerBench: pBench } = stateRef.current;
                    const attackers: CardData[] = [];

                    bench.forEach(unit => {
                        if (unit.isDead || unit.animState === 'dying' || unit.animState === 'ephemeral_dying') return;
                        if (unit.power === 0) return;
                        if (unit.keywords.includes('CantAttack')) return; // [CantAttack] 无法造成伤害，不派去进攻

                        // [2026-07-09] 幻象(Ephemeral) → 回合结束必死，无脑进攻
                        if (unit.keywords.includes('Ephemeral')) {
                            attackers.push(unit);
                            return;
                        }

                        // 畏惧逻辑 — 考虑关键词过滤有效阻挡者
                        const isSuicide = pBench.some(blocker => {
                            // 忽略无法格挡的单位
                            if (blocker.keywords.includes('CantBlock')) return false;

                            // [2026-07-09] 隐秘(Elusive) → 只有隐秘才能阻挡隐秘
                            if (unit.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) return false;

                            // [2026-07-09] 凶恶(Fearsome) → 只有攻击力≥3才能阻挡
                            const bPower = (blocker.power || 0) + (blocker.buffs?.power || 0);
                            if (unit.keywords.includes('Fearsome') && bPower < 3) return false;

                            const canKillAttacker = blocker.power >= unit.health;
                            const willSurvive = blocker.health > unit.power;
                            return canKillAttacker && willSurvive;
                        });

                        if (!isSuicide) {
                            attackers.push(unit);
                        }
                    });

                    if (attackers.length > 0) {
                        console.log(`[AI] ⚔️ 发起进攻: ${attackers.length} 个单位 (截取前 ${Math.min(attackers.length, 6)})`);
                        // [战场上限 6 格] AI 进攻最多 6 个单位
                        const cappedAttackers = attackers.slice(0, 6);
                        if (attackers.length > 6) {
                            console.log(`[AI] 进攻单位超过 6 个，截取前 6 个上场。`);
                        }
                        // [AI挑战者] 处理挑战者：选择高价值目标强制格挡
                        const challengedIds: string[] = [];
                        const challengerTargets = new Map<string, CardData>();

                        cappedAttackers.forEach(attacker => {
                            if (attacker.keywords.includes('Challenger') && playerBench.length > 0) {
                                const available = playerBench.filter(t => !challengedIds.includes(t.id));
                                if (available.length === 0) return;
                                const target = available.sort((a, b) => {
                                    const score = (c: CardData) =>
                                        (c.isChampion ? 100 : 0) +
                                        (c.power || 0) * 3 +
                                        (c.keywords.includes('QuickAttack') ? 15 : 0) +
                                        (c.keywords.includes('Overwhelm') ? 15 : 0) +
                                        (c.keywords.includes('Channel') ? 10 : 0) +
                                        (c.health || 0);
                                    return score(b) - score(a);
                                })[0];
                                challengerTargets.set(attacker.id, target);
                                challengedIds.push(target.id);
                                console.log('[AI] ⚡ 挑战者 ' + attacker.name + ' => 拉取 ' + target.name);
                            }
                        });

                        setMessage("敌方发起进攻！");
                        if (actions.setCombatField && actions.setEnemyBench && actions.commitAttack) {
                            const newCombat = cappedAttackers.map((c: CardData) => {
                                const target = challengerTargets.get(c.id);
                                return { attacker: c, blocker: target || null, owner: 'enemy', isChallenged: !!target };
                            });
                            const remainingBench = bench.filter(b => !cappedAttackers.some(a => a.id === b.id));

                            // 1. 从玩家备战席移除被挑战的单位
                            if (challengedIds.length > 0 && actions.setPlayerBench) {
                                actions.setPlayerBench((prev: CardData[]) => prev.filter(c => !challengedIds.includes(c.id)));
                            }
                            // 2. 先将卡牌实体状态推入战场
                            actions.setEnemyBench(remainingBench);
                            actions.setCombatField(newCombat);

                            // 2. 延迟 50ms 确保 React 完成 DOM 与 State 渲染后，调用标准发车指令触发所有特效
                            setTimeout(() => {
                                actions.commitAttack();
                            }, 50);
                        }
                        return;
                    }
                }

                // 4. 无事可做，让过
                console.log(`[AI] ⏭️ 无事可做，让过 (phase=${g.phase} hand=${hand.length} bench=${bench.length} mana=${g.enemyMana} tok=${g.attackToken.enemy})`);
                if (hand.length > 0) {
                    console.log(`[AI] ⏭️ 手牌剩余原因分析:`, hand.map(c =>
                        `${c.key}(${c.name}) type=${c.type} cost=${c.cost} afford=${canAffordCard(c, g.enemyMana, g.enemySpellMana, bench)} isUnit=${c.type?.includes('unit')} isSpell=${c.type?.includes('spell')}`
                    ));
                }
                setMessage("敌方过。");
                actions.passTurn();
            } // ← 主阶段 if 结束

            // ========== AI 行动完整保护 ==========
            } catch (err) {
                console.error(`[AI] 💥 未捕获异常导致 AI 逻辑崩溃:`, err);
                // 崩溃时尝试让过，避免 AI 永久卡死
                try { actions?.passTurn(); } catch (_) {}
            }

        }, 1500); // 思考时间 1.5s

        return () => clearTimeout(timer);
    }, [
        game.turnOwner,
        game.phase,
        game.lastActionTimestamp,
        enemyHand.length, // 监听手牌变化
        combatField.length, // 监听战场变化
        game.spellCasting?.step, // [2026-07-20] AI 抉择结束/开始时唤醒/暂停
        game.calibratePending,   // [2026-07-20] AI 校准结束/开始时唤醒/暂停
    ]);
};