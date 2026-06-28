import { useEffect, useRef } from 'react';
import type { CardData, GameState } from '../types';
import { canAffordCard } from '../utils/gameRules';

type AIProps = {
    game: GameState;
    enemyHand: CardData[];
    enemyBench: CardData[];
    playerBench: CardData[]; // [新增] 玩家备战席
    combatField: any[];
    actions: any;
    setMessage: (msg: string) => void;
};

export const useAI = ({ game, enemyHand, enemyBench, playerBench, combatField, actions, setMessage }: AIProps) => {
    // [修改] 将 playerBench 加入 Ref
    const stateRef = useRef({ game, enemyHand, enemyBench, playerBench, combatField });
    // [新增] 法术冷却标记：刚打出法术后跳过一轮判断，防止 async commitSpell 期间重复施法
    const spellCooldownRef = useRef(false);

    // 实时更新 Ref
    useEffect(() => {
        stateRef.current = { game, enemyHand, enemyBench, playerBench, combatField };
    }, [game, enemyHand, enemyBench, playerBench, combatField]);

    useEffect(() => {
        const { game: currGame } = stateRef.current;

        // [核心修改] 植入 AI 逻辑锁：增加对 pendingLevelUps 队列的监控。
        // 只要有人排队等升级，或者正在播动画，AI 的时间就会被完全冻结！
        if (
            currGame.gameResult ||
            currGame.turnOwner === 'player' ||
            currGame.phase === 'animating' ||
            (currGame.pendingLevelUps && currGame.pendingLevelUps.length > 0)
        ) return;

        const timer = setTimeout(() => {
            const freshState = stateRef.current;
            const { game: g, enemyHand: hand, enemyBench: bench, combatField: field } = freshState;

            if (!actions || !setMessage) return;
            if (g.gameResult) return; // [新增] 游戏已结束，AI 停止行动
            if (g.turnOwner !== 'enemy') return;

            // --- 阶段 A: 防守/格挡阶段 (Block Phase) ---
            if (g.phase === 'block_declare') {
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
                        // 如果攻击者有隐秘，必须用隐秘阻挡 (这里简单判断，如果还没实现Elusive逻辑可先忽略)
                        if (attacker.keywords.includes('Elusive') && !b.keywords.includes('Elusive')) return false;
                        return true;
                    });

                    if (validBlockers.length === 0) return; // 无人可挡

                    let chosenBlocker: CardData | null = null;

                    // --- 决策逻辑 1: 应对碾压 (Overwhelm) ---
                    // 规则: 如果玩家派出高攻碾压，而场上没有生命值比该攻击力更高的单位，派出生命值最高的单位尽可能减伤
                    const hasOverwhelm = attacker.keywords.includes('Overwhelm');

                    if (hasOverwhelm) {
                        // 尝试找能完美扛住的 (HP > Atk)
                        const survivors = validBlockers.filter(b => b.health > attacker.power);
                        if (survivors.length > 0) {
                            // 有人能抗住，选最便宜的/最弱的去抗
                            chosenBlocker = survivors.sort((a, b) => a.cost - b.cost)[0];
                        } else {
                            // 没人能抗住，选血量最高的当肉盾 (减少水晶伤害)
                            chosenBlocker = validBlockers.sort((a, b) => b.health - a.health)[0];
                        }
                    }
                    // --- 决策逻辑 2: 智能止损逻辑 (Smart Mitigation) ---
                    else {
                        // 策略A: 完美白吃 (我活，敌死) - 最优解
                        const perfectKillers = validBlockers.filter(b => b.health > attacker.power && b.power >= attacker.health);

                        // 策略B: 免费格挡 (我活，敌不死) - 拖延/蹭血
                        const survivors = validBlockers.filter(b => b.health > attacker.power);

                        // 策略C: 牺牲格挡 (我死) - 包含互换(Trade)和填旋(Chump Block)
                        // [关键修改] 只有满足特定价值公式，AI 才愿意牺牲单位
                        const sacrificeCandidates = validBlockers.filter(b => {
                            // 已经被策略A/B涵盖的存活情况排除掉
                            if (b.health > attacker.power) return false;

                            // 1. 斩杀保护：如果不挡水晶就炸了 -> 必须挡，无视价值
                            if (g.enemyNexus <= attacker.power) return true;

                            // 2. 价值公式：挽回的水晶伤害 >= 2倍 损失的单位生命值
                            // 例如：用 1血怪挡 1点伤害 -> 1 < 2*1 -> 不挡 (亏)
                            // 例如：用 1血怪挡 2点伤害 -> 2 >= 2*1 -> 挡 (不亏)
                            // 例如：用 1血怪挡 18点伤害 -> 18 >= 2*1 -> 挡 (血赚)
                            if (attacker.power >= 2 * b.health) return true;

                            return false;
                        });

                        // --- 优先级执行 ---
                        if (perfectKillers.length > 0) {
                            // 1. 能白吃，选最便宜的去吃
                            chosenBlocker = perfectKillers.sort((a, b) => a.cost - b.cost)[0];
                        } else if (survivors.length > 0) {
                            // 2. 能存活，选最便宜的去抗
                            chosenBlocker = survivors.sort((a, b) => a.cost - b.cost)[0];
                        } else if (sacrificeCandidates.length > 0) {
                            // 3. 必须牺牲时，在“愿意牺牲”的名单里挑
                            // 优先选能换掉对手的 (Traders)
                            const traders = sacrificeCandidates.filter(b => b.power >= attacker.health);

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
                setMessage("敌方让过（不响应格挡）。");
                // 因为目前 AI 还没有被教导如何在战斗中打出法术，所以直接交还优先权/确认物理结算
                actions.passTurn();
                return;
            }
            // --- 阶段 B: 进攻确认 (Attack Declare) ---
            if (g.phase === 'attack_declare') {
                // AI 已经发起进攻，现在是确认阶段 (通常由 initiateAttack 后的逻辑触发)
                actions.commitAttack();
                return;
            }

            // --- 阶段 C: 主阶段 (Main Phase) ---
            if (g.phase === 'main') {
                // 1. 处理法术堆叠 (目前逻辑：如果有法术，直接让过/结算)
                if (g.spellStack.length > 0) {
                    setMessage("敌方让过（结算法术）。");
                    actions.passTurn();
                    return;
                }

                // ==========================================
                // [核心新增] AI 法术决策脑 (Spell Casting Logic)
                // 优先级：特定法术 > 打出单位 > 进攻
                // ==========================================

                // [新增] 法术冷却：刚打出法术后跳过一轮，等 async commitSpell 结算完再重新判断
                const onCooldown = spellCooldownRef.current;
                spellCooldownRef.current = false;

                let castedSpell = false;

                // [新增] 冷却中时跳过整个法术判断，避免 async commitSpell 期间重复施法
                if (!onCooldown) {

                // 遍历手牌中的所有法术，按顺序进行条件判断
                const playableSpells = hand.filter(c => c && c.type.includes('spell') && canAffordCard(c, g.enemyMana, g.enemySpellMana));

                for (const spell of playableSpells) {
                    // 1. destruction (破坏) / inspire (振奋): 无脑扔
                    if (spell.key === 'destruction' || spell.key === 'inspire') {
                        setMessage(`敌方打出法术：${spell.name}`);
                        actions.playCard(spell, 'enemy', []); // 自动目标
                        castedSpell = true; break;
                    }

                    // 2. focus (专注): 只有在 AI 没拿到进攻权时才打 (用来防守反击或屯牌)
                    if (spell.key === 'focus' && !g.attackToken.enemy) {
                        setMessage(`敌方打出法术：${spell.name}`);
                        actions.playCard(spell, 'enemy', []);
                        castedSpell = true; break;
                    }

                    // 3. hidden_arrow (暗箭): 斩杀扫描
                    if (spell.key === 'hidden_arrow') {
                        // 目标 A：玩家水晶只剩 1 滴血
                        if (g.playerNexus <= 1) {
                            setMessage("敌方企图绝杀水晶！");
                            actions.playCard(spell, 'enemy', [{ type: 'player_nexus' }]);
                            castedSpell = true; break;
                        }
                        // 目标 B：玩家场上有 1 滴血的单位
                        const { playerBench: pBench } = stateRef.current;
                        const dyingUnit = pBench.find(u => (u.health + (u.buffs?.health || 0) - (u.damageTaken || 0)) <= 1);
                        if (dyingUnit) {
                            setMessage(`敌方瞄准了脆弱的 ${dyingUnit.name}！`);
                            actions.playCard(spell, 'enemy', [{ type: 'enemy', id: dyingUnit.id }]);
                            castedSpell = true; break;
                        }
                    }

                    // 4. single_combat (单挑): 白吃扫描
                    if (spell.key === 'single_combat') {
                        const { playerBench: pBench } = stateRef.current;
                        let foundCombo = false;

                        // 双重循环找机会
                        for (const myUnit of bench) {
                            const myHp = myUnit.health + (myUnit.buffs?.health || 0) - (myUnit.damageTaken || 0);
                            const myAtk = myUnit.power + (myUnit.buffs?.power || 0);
                            if (myHp <= 0 || myAtk <= 0) continue;

                            for (const enemyUnit of pBench) {
                                const enHp = enemyUnit.health + (enemyUnit.buffs?.health || 0) - (enemyUnit.damageTaken || 0);
                                const enAtk = enemyUnit.power + (enemyUnit.buffs?.power || 0);

                                // 条件：我能打死它，且它打不死我 (白吃)
                                if (myAtk >= enHp && myHp > enAtk) {
                                    setMessage("敌方发起了单挑！");
                                    // 传参：第一目标是自己人(ally)，第二目标是敌人(enemy)。对 AI 来说，自己人是 enemy，敌人是 player
                                    actions.playCard(spell, 'enemy', [
                                        { type: 'ally', id: myUnit.id },
                                        { type: 'enemy', id: enemyUnit.id }
                                    ]);
                                    foundCombo = true;
                                    break;
                                }
                            }
                            if (foundCombo) break;
                        }
                        if (foundCombo) { castedSpell = true; break; }
                    }
                }

                if (castedSpell) {
                    spellCooldownRef.current = true; // 冷却标记：下一轮跳过法术判断
                    return;
                }

                } // end of cooldown check

                // 2. 尝试打出单位
                // 策略：有费就打，铺场优先
                const playableUnit = hand.find((c: CardData) =>
                    c && c.type && c.type.includes('unit') && canAffordCard(c, g.enemyMana, g.enemySpellMana)
                );

                if (playableUnit && bench.length < 6) {
                    setMessage(`敌方打出：${playableUnit.name}`);
                    actions.playCard(playableUnit, 'enemy');
                    return;
                }

                // 3. 尝试发起进攻
                if (g.attackToken.enemy && bench.length > 0) {
                    const { playerBench: pBench } = stateRef.current;
                    const attackers: CardData[] = [];

                    bench.forEach(unit => {
                        if (unit.isDead || unit.animState === 'dying' || unit.animState === 'ephemeral_dying') return;
                        if (unit.power === 0) return;
                        if (unit.keywords.includes('CantAttack')) return; // [CantAttack] 无法造成伤害，不派去进攻

                        // 畏惧逻辑
                        const isSuicide = pBench.some(blocker => {
                            // 忽略无法格挡的单位
                            if (blocker.keywords.includes('CantBlock')) return false;

                            const canKillAttacker = blocker.power >= unit.health;
                            const willSurvive = blocker.health > unit.power;
                            return canKillAttacker && willSurvive;
                        });

                        if (!isSuicide) {
                            attackers.push(unit);
                        }
                    });

                    if (attackers.length > 0) {
                        // [战场上限 6 格] AI 进攻最多 6 个单位
                        const cappedAttackers = attackers.slice(0, 6);
                        if (attackers.length > 6) {
                            console.log(`[AI] 进攻单位超过 6 个，截取前 6 个上场。`);
                        }

                        setMessage("敌方发起进攻！");
                        if (actions.setCombatField && actions.setEnemyBench && actions.commitAttack) {
                            const newCombat = cappedAttackers.map((c: CardData) => ({ attacker: c, blocker: null, owner: 'enemy' }));
                            const remainingBench = bench.filter(b => !cappedAttackers.some(a => a.id === b.id));

                            // 1. 先将卡牌实体状态推入战场
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
                setMessage("敌方过。");
                actions.passTurn();
            }

        }, 1500); // 思考时间 1.5s

        return () => clearTimeout(timer);
    }, [
        game.turnOwner,
        game.phase,
        game.lastActionTimestamp,
        enemyHand.length, // 监听手牌变化
        combatField.length // 监听战场变化
    ]);
};