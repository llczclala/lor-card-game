import { useEffect, useRef } from 'react';
import type { CardData, GameState } from '../types';
import { canAffordCard } from '../utils/gameRules';
import { evaluate } from '../logic/aiSpellStrategies';
import { getPower, getHealth } from '../logic/keywords'; // [2026-08-29 莉莉子] 真实面板数值（含 buffs/roundBuffs/伤害）——AI 攻血判定必须用它，否则 buff 后的单位被当成白板
import { resolveAIConfig } from '../data/aiDifficulty';
import type { AIDifficultyLevel, AIDifficultyConfig } from '../data/aiDifficulty';
import type { EnemyArchetype } from '../data/enemies/archetypes';

type AIProps = {
    game: GameState;
    enemyHand: CardData[];
    enemyBench: CardData[];
    playerBench: CardData[]; // [新增] 玩家备战席
    combatField: any[];
    actions: any;
    setMessage: (msg: string) => void;
    disabled?: boolean; // ★ 教程模式禁用AI自动行动
    paused?: boolean; // [2026-08-30 莉莉子] 局内暂停冻结 AI（暂停时 effect 直接 return 不建 timer）
    difficulty?: AIDifficultyLevel; // [2026-08-06] AI 难度档位（默认 normal）
    personality?: EnemyArchetype['aiPersonality']; // [2026-08-06] AI 流派性格（默认 balanced）
};

export const useAI = ({ game, enemyHand, enemyBench, playerBench, combatField, actions, setMessage, disabled = false, paused = false, difficulty = 'normal', personality = 'balanced' }: AIProps) => {
    // [修改] 将 playerBench 加入 Ref
    const stateRef = useRef({ game, enemyHand, enemyBench, playerBench, combatField });
    // [新增] 法术冷却标记：刚打出法术后跳过一轮判断，防止 async commitSpell 期间重复施法
    const spellCooldownRef = useRef(false);
    // [2026-08-06] 解析最终生效的 AI 参数（难度 × 性格）
    const aiConfig: AIDifficultyConfig = resolveAIConfig(difficulty, personality);
    const aiConfigRef = useRef(aiConfig);
    aiConfigRef.current = aiConfig;

    // 实时更新 Ref
    useEffect(() => {
        stateRef.current = { game, enemyHand, enemyBench, playerBench, combatField };
    }, [game, enemyHand, enemyBench, playerBench, combatField]);

    useEffect(() => {
        // ★ 教程模式：AI 不自动行动，由剧本控制
        if (disabled) return;
        // [2026-08-30 莉莉子] 局内暂停：冻结 AI（paused 变化时 effect 重跑会 clearTimeout 掉旧 timer）
        if (paused) return;
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
                const cfg = aiConfigRef.current;

                // 1. 获取所有待分配的阻挡者 (复制一份备战席)
                let availableBlockers = bench.filter((c: CardData) => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
                // 2. 创建新的战场状态 (复制一份当前战场)
                const newCombatField = field.map(f => ({ ...f }));
                // 3. 玩家备战席 (用于判断威胁? 这里主要是处理 field 里的 attacker)

                // [2026-08-06 莉莉子 格挡增强] 致命伤害预防：
                // 计算敌方（玩家）本回合总潜在伤害，判断是否对我方水晶构成致命威胁。
                // 威胁感知高的困难 AI 会优先格挡高攻进攻者防止被杀；
                // 简单 AI（threatAwareness 低）可能漏判，放血水过去。
                const lethalThreat = g.enemyNexus <= field.reduce((s, f) => s + (f.attacker ? getPower(f.attacker) : 0), 0); // [2026-08-29] 真实攻血
                const cfg_threatAware = cfg.threatAwareness >= 0.6;

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
                        const bPower = getPower(b); // [2026-08-29] 真实攻血
                        if (attacker.keywords.includes('Fearsome') && bPower < 3) return false;
                        return true;
                    });

                    if (validBlockers.length === 0) return; // 无人可挡

                    let chosenBlocker: CardData | null = null;

                    // [2026-07-09] 格挡关键词辅助函数
                    const canSurvive = (b: CardData, atkPower: number) => {
                        if (b.keywords.includes('Barrier')) return true;
                        const hp = getHealth(b) + (b.keywords.includes('Tough') ? 1 : 0); // [2026-08-29] 真实面板
                        return hp > atkPower;
                    };
                    const canKillAtk = (b: CardData, atkHealth: number) => {
                        const p = getPower(b) + (b.keywords.includes('Thorns') ? 1 : 0); // [2026-08-29] 真实面板
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
                            const survivors = validBlockers.filter(b => canSurvive(b, getPower(attacker)));
                            if (survivors.length > 0) {
                                chosenBlocker = survivors.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 没人能抗住，选有效血量最高的当肉盾 (考虑坚韧)
                                chosenBlocker = validBlockers.sort((a, b) => {
                                    const hpB = getHealth(b) + (b.keywords.includes('Tough') ? 1 : 0);
                                    const hpA = getHealth(a) + (a.keywords.includes('Tough') ? 1 : 0);
                                    return hpB - hpA;
                                })[0];
                            }
                        }
                    }
                    // --- 决策逻辑 2: 智能止损逻辑 (Smart Mitigation) ---
                    else {
                        // 策略A: 完美白吃 (我活，敌死) - 最优解
                        const perfectKillers = validBlockers.filter(b =>
                            canSurvive(b, getPower(attacker)) && canKillAtk(b, getHealth(attacker))
                        );

                        // 策略B: 免费格挡 (我活，敌不死) - 拖延/蹭血
                        const survivors = validBlockers.filter(b => canSurvive(b, getPower(attacker)));

                        // 策略C: 牺牲格挡 (我死) - 包含互换(Trade)和填旋(Chump Block)
                        // [关键修改] 只有满足特定价值公式，AI 才愿意牺牲单位
                        const sacrificeCandidates = validBlockers.filter(b => {
                            // 能活就不算牺牲
                            if (canSurvive(b, getPower(attacker))) return false;
                            // [2026-07-09] 幻象(Ephemeral)：回合结束必死，无脑填入
                            if (b.keywords.includes('Ephemeral')) return true;
                            // 斩杀保护：如果不挡水晶就炸了
                            if (g.enemyNexus <= getPower(attacker)) return true;
                            // 价值公式：挽回的水晶伤害 >= 2倍 损失的单位生命值（[2026-08-29] 均用真实面板）
                            if (getPower(attacker) >= 2 * getHealth(b)) return true;
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
                            const traders = sacrificeCandidates.filter(b => canKillAtk(b, getHealth(attacker)));

                            if (traders.length > 0) {
                                // 能换掉对手，选最便宜的
                                chosenBlocker = traders.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 换不掉对手 (纯填旋)，选最便宜且血最少的 (止损)
                                chosenBlocker = sacrificeCandidates.sort((a, b) => a.cost - b.cost || getHealth(a) - getHealth(b))[0];
                            }
                        }
                        // 4. 如果以上都不满足 (会死，且不满足价值公式)
                        // [2026-08-06 莉莉子 格挡增强] 致命威胁兜底：若本回合不挡就会水晶被爆，
                        // 威胁感知高的 AI 即使亏也强行填旋阻挡，保水晶优先
                        if (!chosenBlocker && lethalThreat && cfg_threatAware) {
                            // 从牺牲候选人里强制选一个填旋（哪怕纯止损）
                            const lastResort = [...sacrificeCandidates].sort((a, b) => getHealth(a) - getHealth(b))[0];
                            if (lastResort) chosenBlocker = lastResort;
                        }
                        // 否则不格挡，脸接伤害
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
                                const result = evaluate(spell, g, bench, pBench, hand, {
                                    conservation: aiConfigRef.current.conservation,
                                    mistakeRate: aiConfigRef.current.mistakeRate,
                                    planningDepth: aiConfigRef.current.planningDepth,
                                });
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
                    const cfg = aiConfigRef.current;
                    const attackers: CardData[] = [];

                    // [2026-08-06] 斩杀线检测：敌方水晶已在所有攻击者总攻击力之下 → 困难AI全力进攻
                    // 简单AI可能忽略（mistakeRate 高），难度越高越重视斩杀
                    // ═══ [2026-08-28 莉莉子 重构] 进攻决策：阻挡者容量 + 总攻收益 ═══
                    // 旧逻辑问题：逐单位问"会不会被对手白吃"（isSuicide），却忽略"对手一次只能挡几个"。
                    // 例：AI 铺 6 单位、玩家只有 1 个里芙能白吃大部分 → 旧 AI 判定 5 个都是"自杀"不敢上，
                    // 实际里芙只能挡 1 路，其余 4 个会穿过去打脸 → 观感"铺满场却只打 1 点"。
                    // 修复：① 引入阻挡者容量（超容量 = 必打脸）② 算全压净收益（脸伤 vs 损失）按 aggression 权衡。
                    // 本函数被标准对战 + 肉鸽共用（都经 GameSession → useAI），全模式生效，非肉鸽专属。
                    const playerBlockers = pBench.filter((b: CardData) =>
                        !b.isDead && !b.animState?.startsWith('dying') && !b.keywords.includes('CantBlock')
                    );
                    const capacity = playerBlockers.length; // 对手最多能合法阻挡几个

                    const sureHitUnits: CardData[] = [];  // 必打脸（无合法阻挡者，如隐秘无对应阻挡）
                    const safeUnits: CardData[] = [];     // 不会被白吃（对手挡了也不亏）
                    const doomedUnits: CardData[] = [];   // 会被白吃（受容量 + aggression 约束）

                    bench.forEach(unit => {
                        if (unit.isDead || unit.animState === 'dying' || unit.animState === 'ephemeral_dying') return;
                        if (getPower(unit) === 0) return; // [2026-08-29] 真实攻血
                        if (unit.keywords.includes('CantAttack')) return; // [CantAttack] 无法造成伤害，不派去进攻

                        // [2026-07-09] 幻象(Ephemeral) → 回合结束必死，无脑进攻
                        if (unit.keywords.includes('Ephemeral')) { attackers.push(unit); return; }

                        // 该单位的合法阻挡者（含 Elusive / Fearsome 规则过滤）
                        const blockers = playerBlockers.filter(b => {
                            // [2026-07-09] 隐秘(Elusive) → 只有隐秘才能阻挡隐秘
                            if (unit.keywords.includes('Elusive') && !b.keywords.includes('Elusive')) return false;
                            // [2026-07-09] 凶恶(Fearsome) → 只有攻击力≥3才能阻挡
                            const bPower = getPower(b); // [2026-08-29] 真实攻血
                            if (unit.keywords.includes('Fearsome') && bPower < 3) return false;
                            return true;
                        });
                        if (blockers.length === 0) { sureHitUnits.push(unit); return; } // 挡不住 → 必打脸

                        const isSuicide = blockers.some(b =>
                            getPower(b) >= getHealth(unit) && getHealth(b) > getPower(unit)
                        ); // [2026-08-29] 真实攻血
                        if (isSuicide) doomedUnits.push(unit);
                        else safeUnits.push(unit);
                    });

                    // —— 总攻收益账 ——
                    // 全压候选；sureHit 伤害必中；blockable（safe+doomed）按对手挡"攻击力最高 capacity 个"估损失
                    const allInUnits = [...sureHitUnits, ...safeUnits, ...doomedUnits];
                    const sureHitDmg = sureHitUnits.reduce((s, u) => s + getPower(u), 0);
                    const blockableUnits = [...safeUnits, ...doomedUnits].sort((a, b) => getPower(b) - getPower(a));
                    const blockableDmg = blockableUnits.reduce((s, u) => s + getPower(u), 0);
                    const blockedDmg = blockableUnits.slice(0, Math.min(capacity, blockableUnits.length))
                        .reduce((s, u) => s + getPower(u), 0);
                    const guaranteedFace = sureHitDmg + Math.max(0, blockableDmg - blockedDmg); // 全压时至少打这么多脸
                    const allInDamage = allInUnits.reduce((s, u) => s + getPower(u), 0);
                    const lethalAllIn = allInDamage >= g.playerNexus;
                    const lossValue = blockableUnits.slice(0, Math.min(capacity, blockableUnits.length))
                        .reduce((s, u) => s + (u.cost || 0), 0); // 被挡单位的损失价值（费用）

                    // 决策①：全压可斩杀 → 果断全压（aggression 越高越果断）
                    if (lethalAllIn && cfg.aggression >= 0.6) {
                        attackers.push(...allInUnits);
                    }
                    // 决策②：全压收益评估——脸伤价值 ≥ 被挡损失的 aggression 加权 → 值就全压。
                    //   aggression 高（困难/激进性格）越愿意为脸伤送单位；低（保守）越惜命。
                    else if (guaranteedFace >= lossValue * cfg.aggression) {
                        attackers.push(...allInUnits);
                    }
                    // 决策③：保守但带容量意识——必打脸 + 安全单位全派；doomed 里超容量部分必打脸也派；
                    //   被挡住的 doomed 按 aggression 决定（换子不亏/极端激进才送）。
                    else {
                        attackers.push(...sureHitUnits, ...safeUnits);
                        const doomedByPow = [...doomedUnits].sort((a, b) => getPower(b) - getPower(a));
                        const surplus = Math.max(0, doomedUnits.length - capacity); // 挡不完 → 必打脸
                        attackers.push(...doomedByPow.slice(0, surplus));
                        const blockedDoomed = doomedByPow.slice(surplus);
                        // 换子不亏（能拼掉对方至少一个）→ 高侵略愿意送
                        const tradeable = blockedDoomed.filter(u =>
                            pBench.some(b => getPower(b) >= getHealth(u) && getHealth(b) <= getPower(u))
                        ); // [2026-08-29] 真实攻血
                        if (cfg.aggression >= 0.7) attackers.push(...tradeable);
                        // 极端侵略（困难 + 激进性格）→ 纯送逼血也打
                        if (cfg.aggression >= 0.85) attackers.push(...blockedDoomed.filter(u => !tradeable.includes(u)));
                        // 简单 AI 失误兜底：本该缩的也随机冲 1-2 个（mistakeRate 高）
                        if (attackers.length === 0 && allInUnits.length > 0 && Math.random() < cfg.mistakeRate) {
                            attackers.push(...blockableUnits.slice(0, Math.min(2, blockableUnits.length)));
                        }
                    }

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
                                        getPower(c) * 3 +
                                        (c.keywords.includes('QuickAttack') ? 15 : 0) +
                                        (c.keywords.includes('Overwhelm') ? 15 : 0) +
                                        (c.keywords.includes('Channel') ? 10 : 0) +
                                        getHealth(c);
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
        paused,                  // [2026-08-30 莉莉子] 暂停/恢复时重跑 effect，清掉旧 timer
    ]);
};