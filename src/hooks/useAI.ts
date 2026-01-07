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

    // 实时更新 Ref
    useEffect(() => {
        stateRef.current = { game, enemyHand, enemyBench, playerBench, combatField };
    }, [game, enemyHand, enemyBench, playerBench, combatField]);

    useEffect(() => {
        const { game: currGame } = stateRef.current;

        // 只有在轮到敌方、且非动画阶段、且游戏未结束时思考
        if (currGame.gameResult || currGame.turnOwner === 'player' || currGame.phase === 'animating') return;

        const timer = setTimeout(() => {
            const freshState = stateRef.current;
            const { game: g, enemyHand: hand, enemyBench: bench, combatField: field } = freshState;

            if (!actions || !setMessage) return;
            if (g.turnOwner !== 'enemy') return;

            // --- 阶段 A: 防守/格挡阶段 (Block Phase) ---
            if (g.phase === 'block_declare') {
                setMessage("敌方正在思考格挡...");

                // 1. 获取所有待分配的阻挡者 (复制一份备战席)
                let availableBlockers = [...bench];
                // 2. 创建新的战场状态 (复制一份当前战场)
                const newCombatField = field.map(f => ({ ...f }));
                // 3. 玩家备战席 (用于判断威胁? 这里主要是处理 field 里的 attacker)

                // 遍历每一个战斗槽位进行决策
                newCombatField.forEach((fight) => {
                    const attacker = fight.attacker;
                    if (!attacker) return;

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
                        actions.resolveCombatAnimation();
                    }, 500);
                }
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
                        if (unit.power === 0) return;

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
                        setMessage("敌方发起进攻！");
                        if (actions.setGame && actions.setCombatField && actions.setEnemyBench) {
                            actions.setGame((prev: any) => ({ ...prev, phase: 'block_declare', turnOwner: 'player', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
                            const newCombat = attackers.map((c: CardData) => ({ attacker: c, blocker: null, owner: 'enemy' }));
                            const remainingBench = bench.filter(b => !attackers.some(a => a.id === b.id));
                            actions.setEnemyBench(remainingBench);
                            actions.setCombatField(newCombat);
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