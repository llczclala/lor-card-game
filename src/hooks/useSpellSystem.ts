import { useState, MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { CardData, GameState, SpellStackItem, Race } from '../types';
import { EFFECT_DB } from '../data/effectRegistry';
import type { TargetType } from '../data/effectRegistry';
import { eventBus, GameEvents } from '../utils/eventBus';
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor'; // [核心修复] 严格声明这是一个类型导入
import { executeSpellEffect } from '../logic/spells';
import { calculateNewMana } from '../utils/gameRules';
import { StrikeEvents } from '../utils/eventBus'; // [新增] 引入全新的打击信号总线
import { getCurrentHP } from '../logic/combat'; // [新增] 引入真实血量探针
import { getPower } from '../logic/keywords'; // [新增] 引入真实攻击力探针

// ==========================================
// [时间管理器] 独立封装的纯函数，等待通用打击特效播完
// ==========================================
export const waitForStrikeComplete = (timeoutMs: number = 3000): Promise<void> => {
    return new Promise((resolve) => {
        let resolved = false;
        const onEnd = () => {
            if (resolved) return;
            resolved = true;
            eventBus.off(StrikeEvents.COMPLETE, onEnd);
            resolve();
        };
        eventBus.on(StrikeEvents.COMPLETE, onEnd);
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                eventBus.off(StrikeEvents.COMPLETE, onEnd);
                resolve();
            }
        }, timeoutMs);
    });
};

export interface UseSpellSystemParams {
    stateRef: MutableRefObject<{
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        combatField: any[];
        playerHand: CardData[];
        enemyHand: CardData[];
        playerDeck: CardData[];
        enemyDeck: CardData[];
    }>;
    game: GameState;
    playerBench: CardData[];

    setGame: Dispatch<SetStateAction<GameState>>;
    setPlayerBench: Dispatch<SetStateAction<CardData[]>>;
    setEnemyBench: Dispatch<SetStateAction<CardData[]>>;
    setCombatField: Dispatch<SetStateAction<any[]>>;
    setPlayerHand: Dispatch<SetStateAction<CardData[]>>;
    setEnemyHand: Dispatch<SetStateAction<CardData[]>>;
    setPlayerDeck: Dispatch<SetStateAction<CardData[]>>;
    setEnemyDeckState: Dispatch<SetStateAction<CardData[]>>;
    setMessage: Dispatch<SetStateAction<string>>;

    createFullCard: (key: string) => CardData;
    flushMicroQueue: () => boolean;
    judgeLifeAndDeath: () => void;  // [SBA] 生死簿同步判决
    wait: (ms: number) => Promise<void>;
    triggerShake: () => void;

    onComplete: (card: CardData, targets: any[]) => void;
}

export const useSpellSystem = (params: UseSpellSystemParams) => {
    const {
        stateRef, game, playerBench,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setEnemyHand, setPlayerDeck, setEnemyDeckState,
        setMessage, createFullCard, flushMicroQueue, judgeLifeAndDeath, wait, triggerShake, onComplete
    } = params;
    // 正在施放的卡牌
    const [castingCard, setCastingCard] = useState<CardData | null>(null);
    // 当前处于第几步 (从 0 开始)
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    // 已选定的目标列表
    const [selectedTargets, setSelectedTargets] = useState<any[]>([]);

    // 辅助：获取当前卡牌的效果定义
    const getEffectDef = (card: CardData) => {
        if (!card.effects || card.effects.length === 0) return null;
        return EFFECT_DB[card.effects[0]];
    };

    // --- 1. 开始施法 ---
    const startCasting = (card: CardData) => {
        const effect = getEffectDef(card);
        if (!effect) return;

        // 如果没有目标需求，直接完成 (自动施法)
        if (effect.targetRequirements.length === 0) {
            onComplete(card, []);
        } else {
            // 进入选择模式
            setCastingCard(card);
            setCurrentStepIndex(0);
            setSelectedTargets([]);
        }
    };

    // --- 2. 取消施法 ---
    const cancelCasting = () => {
        setCastingCard(null);
        setCurrentStepIndex(0);
        setSelectedTargets([]);
    };

    // --- 3. 核心：验证目标是否合法 ---
    // 这是一个纯逻辑判断，用于决定点击是否有效，以及是否显示高亮框
    const isValidTarget = (
        card: CardData | 'nexus',
        owner: 'player' | 'enemy',
        reqType: TargetType,
        filterKey?: string,
        targetCondition?: string, // [核心新增] 接收目标高级过滤暗号
        raceFilter?: Race[]       // [新增] 种族过滤器
    ): boolean => {
        if (card === 'nexus') {
            // [2026-06-27 生机补充] ally_only 时我方水晶可被选，敌方不可
            if (targetCondition === 'ally_only') {
                return (reqType === 'PLAYER_NEXUS' && owner === 'player') ||
                       (reqType === 'ENEMY_NEXUS' && owner === 'enemy') ||
                       (reqType === 'ANY_TARGET' && owner === 'player');
            }
            if (targetCondition) return false; // 其他条件水晶不参与判定
            return (reqType === 'PLAYER_NEXUS' && owner === 'player') ||
                   (reqType === 'ENEMY_NEXUS' && owner === 'enemy') ||
                   reqType === 'ANY_TARGET';
        }

        const isAlly = owner === 'player';
        const isEnemy = owner === 'enemy';

		// [2026-06-27 暗箱操作] HAND_CARD 跳过存活检查（手牌法术 health=0 会误杀）
		if (reqType === 'HAND_CARD') {
			return true;
		}

// [SBA] 基础存活检查 (尸体不能作为目标)
        if (card.isDead || getCurrentHP(card) <= 0) return false;

        // =====================================
        // [核心新增] 种族拦截器 (Race Filter)
        // =====================================
        if (raceFilter && raceFilter.length > 0) {
            if (!card.race || !card.race.some(r => raceFilter.includes(r))) {
                return false; // 种族不符，不可选
            }
        }

        // =====================================
        // [核心新增] 高级条件拦截器 (Advanced Radar)
        // =====================================
        if (targetCondition) {
            if (targetCondition === 'ally_only') {
                // [2026-06-27 生机补充] 只能选我方单位（水晶已在上面拦截层放过）
                if (!isAlly) return false;
            }
            else if (targetCondition === 'injured') {
                // 必须掉血才能被选中
                if ((card.damageTaken || 0) <= 0) return false;
            }
            else if (targetCondition === 'power_less_than_3') {
                // 计算当前真实攻击力
                const currentPower = (card.power || 0) + (card.buffs?.power || 0);
                if (currentPower >= 3) return false;
            }
            else if (targetCondition === 'in_combat') {
                // [物理探针] 利用 DOM 结构扫描，判断该实体是否位于交战槽位中！
                const el = document.querySelector(`[data-entity-id="${card.id}"]`);
                if (!el || !el.closest('[data-combat-index]')) return false;
            }
        }

        switch (reqType) {
            case 'ALLY_UNIT': return isAlly;
            case 'ENEMY_UNIT': return isEnemy;
            case 'ANY_UNIT': return true;
            case 'ANY_TARGET': return true; // 单位也是 Target
            case 'ALLY_CHAMPION': return isAlly && card.isChampion && (!filterKey || card.key === filterKey);
            case 'HAND_CARD': return true; // [2026-06-27] 手牌卡，来源由 handleTargetClick 前置拦截保障
            default: return false;
        }
    };

    // --- 4. 处理点击交互 ---
    // [2026-06-27 暗箱操作] 新增 source 参数区分手牌点击 vs 场上点击
    const handleTargetClick = (target: CardData | 'nexus', owner: 'player' | 'enemy', source?: 'hand' | 'field') => {
        if (!castingCard) return;

        const effect = getEffectDef(castingCard);
        if (!effect) return;

        // 获取当前步骤的需求
        const requirement = effect.targetRequirements[currentStepIndex];
        if (!requirement) return;

        // [2026-06-27 HAND_CARD] 来源隔离：手牌操作只能由点击手牌触发
        if (requirement.type === 'HAND_CARD' && source !== 'hand') return;
        if (requirement.type !== 'HAND_CARD' && source === 'hand') return;

        // 验证合法性：将法术配置中的高级暗号和种族过滤器传给雷达
        if (isValidTarget(target, owner, requirement.type, requirement.filterKey, effect.params?.targetCondition, requirement.raceFilter)) {
            // [新增] 目标合法，成功锁定！播放清脆的确认音
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);

            // 构建目标数据结构 (标准化)
            // [核心修复 BUG 4]：为水晶目标补齐虚拟的 DOM 锚点 ID，防止特效层取不到坐标而卡死
            const targetObj = target === 'nexus'
                ? { type: owner === 'player' ? 'player_nexus' : 'enemy_nexus', id: owner === 'player' ? 'nexus_player' : 'nexus_enemy' }
                : { type: owner === 'player' ? 'ally' : 'enemy', id: target.id };

            const newTargets = [...selectedTargets, targetObj];

            // 检查是否选完了
            if (currentStepIndex + 1 >= effect.targetRequirements.length) {
                // [核心修复 BUG 1]：完成目标选择后，绝不主动销毁前台 UI 连线！
                // 将新目标存入状态以维持连线渲染，并向上层大脑汇报。由底层（useGameState）控制何时真正 cancel
                setSelectedTargets(newTargets);
                onComplete(castingCard, newTargets);
            } else {
                // 还没完 -> 存入并进下一步
                setSelectedTargets(newTargets);
                setCurrentStepIndex(prev => prev + 1);
            }
        } else {
            // 点了不合法的目标 -> 可选：播放错误音效或提示
            console.log("Invalid target");
        }
    };
    // ==========================================
    // [搬迁] 游戏核心法术与堆叠逻辑
    // ==========================================

    const startSpellCasting = (card: CardData) => {
        setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        setGame(prev => ({
            ...prev, activeCard: card,
            spellCasting: { cardId: card.id, step: 'select_ally', targets: [], allyId: undefined }
        }));
        setMessage("选择目标");
    };

    const updateSpellCasting = (newState: any) => setGame(prev => ({ ...prev, spellCasting: newState }));

    const commitSpell = async (card: CardData, owner: 'player' | 'enemy', targets: any[], originalPhase?: any) => {
        const existingPending = stateRef.current.game.pendingSpell;
        let cleanSnapshot = { ...stateRef.current.game };
        const safePhase = originalPhase || (cleanSnapshot.phase === 'animating' ? 'main' : cleanSnapshot.phase);

        if (card.type === 'spell-burst') {
            if (!card.parentCard) {
                const { newMana, newSpellMana } = calculateNewMana(
                    card.cost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = newMana;
                    cleanSnapshot.playerSpellMana = newSpellMana;
                } else {
                    cleanSnapshot.enemyMana = newMana;
                    cleanSnapshot.enemySpellMana = newSpellMana;
                }
            }

            setGame(cleanSnapshot);
            setMessage("极速法术准备就绪...");

            if (owner === 'enemy') {
                setGame(prev => ({
                    ...prev,
                    activeCard: card,
                    spellCasting: { cardId: card.id, step: 'select_target', targets: targets || [] }
                }));
            }

            await wait(1000);

            const currentActiveCard = stateRef.current.game.activeCard;
            if (owner === 'player' && (!currentActiveCard || currentActiveCard.id !== card.id)) {
                console.log("[SpellSystem] 极速法术在 1 秒悬停期内被撤回，执行链已安全熔断！");
                return;
            }

            setGame(prev => ({ ...prev, spellCasting: null, activeCard: null }));

            // [核心升级] 极速法术弹道接入通用管线！
            // [核心修复] 放宽限制！即使没有具体目标，也必须发出施法指令以触发屏幕中央的法阵特效！
            eventBus.emit(StrikeEvents.COMMAND, {
                sourceId: card.id, // 用法术卡牌自身的 ID 作为起点
                spellKey: card.key,
                bullets: (targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                interval: 0 // 法术默认齐射
            });
            await waitForStrikeComplete();

            executeSpellEffect(card.key, owner, targets, {
                game: stateRef.current.game,
                setGame,
                playerBench: stateRef.current.playerBench, setPlayerBench,
                enemyBench: stateRef.current.enemyBench, setEnemyBench,
                combatField: stateRef.current.combatField, setCombatField,
                playerHand: stateRef.current.playerHand, setPlayerHand,
                playerDeck: stateRef.current.playerDeck, setPlayerDeck, // [核心修复] 喂入我方牌库快照与写权限
                enemyDeck: stateRef.current.enemyDeck, setEnemyDeck: setEnemyDeckState, // [核心修复] 喂入敌方牌库快照与写权限
                triggerShake,
                setMessage
            });

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            setGame(prev => ({ ...prev, phase: safePhase, lastActionTimestamp: Date.now() }));
            setMessage("极速法术生效");
        } else {
            if (!card.parentCard) {
                const { newMana, newSpellMana } = calculateNewMana(
                    card.cost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = newMana;
                    cleanSnapshot.playerSpellMana = newSpellMana;
                } else {
                    cleanSnapshot.enemyMana = newMana;
                    cleanSnapshot.enemySpellMana = newSpellMana;
                }
            }

            cleanSnapshot.spellCasting = null;
            cleanSnapshot.activeCard = null;

            const stackItem: SpellStackItem = { card, owner, targets };
            if (owner === 'player') {
                setGame({
                    ...cleanSnapshot,
                    spellStack: existingPending ? [existingPending, ...cleanSnapshot.spellStack] : cleanSnapshot.spellStack,
                    pendingSpell: stackItem,
                    phase: safePhase
                });
                setMessage("请确认是否打出该法术");
            } else {
                setGame({
                    ...cleanSnapshot,
                    spellStack: [stackItem, ...cleanSnapshot.spellStack],
                    turnOwner: 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                    phase: safePhase
                });
                setMessage("敌方打出法术，请响应");
            }
        }
    };

    const cancelChoice = () => {
        const currentActive = stateRef.current.game.activeCard;
        if (currentActive) {
            const cardToReturn = currentActive.parentCard || currentActive;
            setPlayerHand(prev => [...prev, cardToReturn]);
        }
        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
    };

    const resolveChoice = async (chosenCardKey: string) => {
        const originalPhase = stateRef.current.game.phase;
        const originalCard = game.activeCard;
        if (!originalCard || !game.spellCasting || game.spellCasting.step !== 'choose_mode') return;

        const transformed = createFullCard(chosenCardKey);
        transformed.parentCard = originalCard;

        // [新增] 触发天启者技能语音
        const heroKey = originalCard.associatedChampionKey;
        if (heroKey) {
            const isUltimate = chosenCardKey.includes('ultimate');
            eventBus.emit(GameEvents.SPELL_CHOICE, {
                hero: { key: heroKey, id: `voice-${heroKey}` } as CardData,
                choice: isUltimate ? 'ultimate' : 'small'
            });
        }

        const { newMana, newSpellMana } = calculateNewMana(transformed.cost, game.playerMana, game.playerSpellMana, false);
        setGame(prev => ({ ...prev, playerMana: newMana, playerSpellMana: newSpellMana }));

        setGame(prev => ({
            ...prev,
            spellCasting: null,
            pendingSpell: null,
            activeCard: transformed,
            phase: 'animating'
        }));

        await wait(800);

        const effectId = transformed.effects && transformed.effects.length > 0 ? transformed.effects[0] : null;
        const effectDef = effectId ? EFFECT_DB[effectId] : null;
        const needsTargets = effectDef && effectDef.targetRequirements && effectDef.targetRequirements.some(req => req.count > 0);

        // [千莲叠绽特判] 猫汐尔未格挡时直接召唤，不需要选目标
        const finalNeedsTargets = effectId === 'effect_mauxir_lotus_rush'
            ? needsTargets && stateRef.current.combatField?.some(f =>
                f.blocker?.key === 'mauxir_lotus_drive' && f.owner === 'enemy'
              )
            : needsTargets;

        if (finalNeedsTargets) {
            const reqType = effectDef.targetRequirements[0].type;
            let step: 'select_ally' | 'select_enemy' | 'select_any' = 'select_any';
            if (reqType.includes('ALLY')) step = 'select_ally';
            else if (reqType.includes('ENEMY')) step = 'select_enemy';

            setGame(prev => ({
                ...prev,
                phase: originalPhase === 'animating' ? 'main' : originalPhase,
                spellCasting: {
                    cardId: transformed.id,
                    step: step,
                    targets: [],
                    allyId: undefined
                }
            }));
            setMessage(`请选择 ${transformed.name} 的施放目标`);
        } else {
            commitSpell(transformed, 'player', [], originalPhase);
        }
    };

    const withdrawSpellFromStack = (cardId: string) => {
        const stackItem = stateRef.current.game.spellStack.find(s => s.card.id === cardId);
        if (!stackItem || stackItem.owner !== 'player') return;

        setGame(prev => ({
            ...prev,
            spellStack: prev.spellStack.filter(s => s.card.id !== cardId)
        }));

        const cardToReturn = stackItem.card.parentCard || stackItem.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        const costToRefund = stackItem.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana };
        });
        setMessage("法术已撤回");
    };

    const confirmPendingSpell = () => {
        setGame(prev => {
            if (!prev.pendingSpell) return prev;
            return {
                ...prev,
                spellStack: [prev.pendingSpell, ...prev.spellStack],
                pendingSpell: null,
                turnOwner: 'enemy',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });
        setMessage("法术入栈，等待对方响应");
    };

    const cancelPendingSpell = () => {
        const pending = stateRef.current.game.pendingSpell;
        if (!pending || pending.owner !== 'player') return;

        setGame(prev => ({ ...prev, pendingSpell: null }));

        const cardToReturn = pending.card.parentCard || pending.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        const costToRefund = pending.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return {
                ...prev,
                playerMana: newMana,
                playerSpellMana: newSpellMana,
                phase: prev.phase === 'animating' ? 'main' : prev.phase
            };
        });
        setMessage("法术已取消打出");
    };

    const resolveStack = async () => {
        const originalPhase = stateRef.current.game.phase; // [修正] 用 stateRef 防闭包
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const stack = [...stateRef.current.game.spellStack];
        for (const spell of stack) {
            setMessage(`结算: ${spell.card.name}`);
            await new Promise(r => setTimeout(r, 300));

            setGame(prev => ({
                ...prev,
                spellStack: prev.spellStack.map(s => s.card.id === spell.card.id ? { ...s, targets: [] } : s)
            }));

            // [新增] 拦截猫汐尔大招——顷刻莲潮
            if (spell.card.key === 'mauxir_lotus_ultimate') {
                setMessage("顷刻莲潮！全基座发动双倍打击！");
                eventBus.emit('MAUXIR_ULTIMATE', { owner: spell.owner });
                await waitForStrikeComplete();

                // 基座攻击力减半（对总攻击力 base + buffs 减半）
                const halvePower = (c: CardData) => {
                    const baseP = c.power || 0;
                    const totalP = baseP + (c.buffs?.power || 0);
                    const halfP = Math.floor(totalP / 2);
                    return { ...c, buffs: { ...(c.buffs || {}), power: halfP - baseP } };
                };
                setPlayerBench(prev => prev.map(c => {
                    if (c.key === 'mauxir_lotus_pedestal') return halvePower(c);
                    return c;
                }));
                setCombatField(prev => {
                    if (!prev) return prev;
                    return prev.map(f => {
                        const newF = { ...f };
                        if (newF.attacker?.key === 'mauxir_lotus_pedestal') newF.attacker = halvePower(newF.attacker);
                        if (newF.blocker?.key === 'mauxir_lotus_pedestal') newF.blocker = halvePower(newF.blocker);
                        return newF;
                    });
                });

                setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));
                setMessage("顷刻莲潮！全基座攻击力已减半");

                await wait(50);
                const isQueueProcessed = flushMicroQueue();
                if (isQueueProcessed) await wait(50);
                continue; // 跳过常规 executeSpellEffect
            }

            // [核心升级] 栈内法术弹道接入通用管线！
            // [核心修复] 放宽限制！即使没有具体目标，也必须发出施法指令以触发屏幕中央的法阵特效！
            eventBus.emit(StrikeEvents.COMMAND, {
                sourceId: spell.card.id,
                spellKey: spell.card.key,
                bullets: (spell.targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                interval: 0 // 法术默认齐射
            });
            await waitForStrikeComplete();

            executeSpellEffect(spell.card.key, spell.owner, spell.targets, {
                game: stateRef.current.game, setGame,
                playerBench: stateRef.current.playerBench, setPlayerBench,
                enemyBench: stateRef.current.enemyBench, setEnemyBench,
                combatField: stateRef.current.combatField, setCombatField,
                playerHand: stateRef.current.playerHand, setPlayerHand,
                playerDeck: stateRef.current.playerDeck, setPlayerDeck, // [核心修复] 同步传给堆栈法术系统
                enemyDeck: stateRef.current.enemyDeck, setEnemyDeck: setEnemyDeckState, // [核心修复] 同步传给堆栈法术系统
                triggerShake, setMessage
            });
            setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            while (
                stateRef.current.game.levelUpCard !== null ||
                (stateRef.current.game.pendingLevelUps && stateRef.current.game.pendingLevelUps.length > 0)
            ) {
                await wait(200);
            }
        }
        // [SBA] 法术结算后同步清尸
        judgeLifeAndDeath();
        setGame(prev => ({ ...prev, phase: originalPhase === 'react_to_block' ? 'react_to_block' : 'main', spellStack: [], consecutivePasses: 0 }));
        setMessage("法术结算完毕");
    };

    // --- 5. 导出状态供 UI 使用 ---
    const currentRequirement = castingCard ? getEffectDef(castingCard)?.targetRequirements[currentStepIndex] : null;

    return {
        // 原有 UI 目标选择层
        isCasting: !!castingCard,
        isSelectionComplete: !!castingCard && selectedTargets.length >= (getEffectDef(castingCard)?.targetRequirements.length || 0),
        activeCard: castingCard,
        selectedTargets,
        instruction: currentRequirement?.label,
        selectedIds: selectedTargets.map(t => t.id).filter(Boolean),
        checkIsTargetable: (card: CardData | 'nexus', owner: 'player' | 'enemy') => {
            if (!currentRequirement || !castingCard) return false;
            // [2026-06-27 HAND_CARD] 手牌选择不高亮场上目标
            if (currentRequirement.type === 'HAND_CARD') return false;
            const effect = getEffectDef(castingCard);
            return isValidTarget(card, owner, currentRequirement.type, currentRequirement.filterKey, effect?.params?.targetCondition, currentRequirement.raceFilter);
        },
        startCasting,
        cancelCasting,
        handleTargetClick,

        // 搬迁过来的游戏逻辑层
        startSpellCasting,
        updateSpellCasting,
        commitSpell,
        resolveChoice,
        cancelChoice,
        withdrawSpellFromStack,
        confirmPendingSpell,
        cancelPendingSpell,
        resolveStack,
    };
};