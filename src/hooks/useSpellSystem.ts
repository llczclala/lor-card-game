import { useState } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { CardData, GameState, SpellStackItem, Race } from '../types';
import { EFFECT_DB } from '../data/effectRegistry';
import type { TargetType } from '../data/effectRegistry';
import { eventBus, GameEvents } from '../utils/eventBus';
import { executeSpellEffect } from '../logic/spells';
import { applyEchoOnPlay } from '../logic/keywords'; // [2026-08-06 莉莉子] Echo 回响
import { CARD_DB } from '../data/cards';
import { calculateNewMana, getEffectiveSpellCost, buffTopUnitInDeck } from '../utils/gameRules';
import { StrikeEvents } from '../utils/eventBus'; // [新增] 引入全新的打击信号总线
import { getCurrentHP } from '../logic/combat'; // [新增] 引入真实血量探针

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

/** [2026-07-30 AI抉择] 根据效果定义自动选取合法目标 */
function findAITargetsForEffect(
    effectDef: typeof EFFECT_DB[string],
    owner: 'player' | 'enemy',
    state: {
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        combatField: any[];
    }
): any[] {
    const targets: any[] = [];
    if (!effectDef.targetRequirements || effectDef.targetRequirements.length === 0) return targets;

    const isAI = owner === 'enemy';
    const friendlyBench = isAI ? state.enemyBench : state.playerBench;
    const hostileBench = isAI ? state.playerBench : state.enemyBench;

    for (const req of effectDef.targetRequirements) {
        const type = req.type;
        const filterKey = req.filterKey;
        const count = req.count || 1;
        let candidates: CardData[] = [];

        if (type === 'ALLY_CHAMPION' || type === 'ALLY_UNIT') {
            candidates = [...friendlyBench];
            state.combatField.forEach(f => {
                if (f.owner === owner && f.attacker) candidates.push(f.attacker);
                if (f.blocker) {
                    // blocker belongs to whoever controls it — check field ownership
                    // Actually, blocker is assigned to the non-attacker side
                    if (f.owner !== owner && f.blocker) candidates.push(f.blocker);
                }
            });
            if (filterKey) {
                candidates = candidates.filter(c => c.key?.toLowerCase().includes(filterKey.toLowerCase()));
            }
            if (type === 'ALLY_CHAMPION') {
                candidates = candidates.filter(c => c.isChampion);
            }
        } else if (type === 'ENEMY_UNIT' || type === 'ENEMY_CHAMPION') {
            candidates = [...hostileBench];
            state.combatField.forEach(f => {
                if (f.owner !== owner && f.attacker) candidates.push(f.attacker);
                if (f.blocker && f.owner === owner) candidates.push(f.blocker);
            });
            if (type === 'ENEMY_CHAMPION') {
                candidates = candidates.filter(c => c.isChampion);
            }
        } else if (type === 'ANY_UNIT') {
            candidates = [...friendlyBench, ...hostileBench];
            state.combatField.forEach(f => {
                if (f.attacker && !candidates.some(c => c.id === f.attacker!.id)) candidates.push(f.attacker);
                if (f.blocker && !candidates.some(c => c.id === f.blocker!.id)) candidates.push(f.blocker);
            });
        }

        // 去重 + 取前 count 个
        const seen = new Set<string>();
        const picked = candidates.filter(c => {
            if (seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        }).slice(0, count).map(c => ({
            id: c.id,
            key: c.key,
            type: c.type,
            entityType: type,
        }));
        targets.push(...picked);

        if (picked.length < count) {
            console.warn(`[AI抉择] 目标类型 ${type} 仅找到 ${picked.length}/${count} 个合法目标`);
        }
    }

    return targets;
}

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
        stateRef, game,
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

    // [2026-07-21] 根据 ID 在全场查找单位（备战席/战场/手牌）
    const findUnitById = (id: string): CardData | null => {
        const { playerBench, enemyBench, combatField, playerHand, enemyHand } = stateRef.current;
        let unit: CardData | undefined;
        unit = playerBench.find(c => c.id === id); if (unit) return unit;
        unit = enemyBench.find(c => c.id === id); if (unit) return unit;
        if (combatField) {
            for (const fight of combatField) {
                if (fight.attacker?.id === id) return fight.attacker;
                if (fight.blocker?.id === id) return fight.blocker;
            }
        }
        unit = playerHand?.find(c => c.id === id); if (unit) return unit;
        unit = enemyHand?.find(c => c.id === id); if (unit) return unit;
        return null;
    };

    // [2026-07-21] 判断某个 ID 的单位属于哪一方
    const getUnitOwner = (id: string): 'player' | 'enemy' => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        if (playerBench.some(c => c.id === id)) return 'player';
        if (enemyBench.some(c => c.id === id)) return 'enemy';
        if (combatField) {
            for (const f of combatField) {
                if (f.attacker?.id === id) return f.owner;
                if (f.blocker?.id === id) return f.owner === 'player' ? 'enemy' : 'player';
            }
        }
        return 'player';
    };

    // [2026-07-21] 卡牌状态快照
    const captureSnapshot = (card: CardData) => ({
        power: card.power || 0,
        health: card.health || 0,
        maxHealth: card.maxHealth || card.health || 0,
        damageTaken: card.damageTaken || 0,
        buffs: card.buffs ? { health: card.buffs.health, power: card.buffs.power } : undefined,
        roundBuffs: card.roundBuffs ? { health: card.roundBuffs.health, power: card.roundBuffs.power } : undefined,
    });

    // [2026-07-21] 扫描全场单位 ID（备战席 + 战场）
    const collectFieldUnitIds = (): string[] => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        const ids: string[] = [];
        playerBench.forEach(c => { if (c.id) ids.push(c.id); });
        enemyBench.forEach(c => { if (c.id) ids.push(c.id); });
        if (combatField) {
            combatField.forEach((f: any) => {
                if (f.attacker?.id) ids.push(f.attacker.id);
                if (f.blocker?.id) ids.push(f.blocker.id);
            });
        }
        return ids;
    };

    // [2026-07-21] 从快照 Map 计算所有变化 → 生成实体数组
    const computeChangesFromMap = (
        map: Map<string, { damageTaken: number; buffsH: number; buffsP: number; roundH: number; roundP: number; keywords: string[] }>
    ): import('../types').RecordEntity[] => {
        const entities: import('../types').RecordEntity[] = [];
        for (const [id, before] of map) {
            const after = findUnitById(id);
            if (!after) continue;

            const changes: import('../types').RecordChange[] = [];
            const dmgDelta = (after.damageTaken || 0) - before.damageTaken;
            if (dmgDelta > 0) changes.push({ type: 'damage', value: dmgDelta });
            const healDelta = before.damageTaken - (after.damageTaken || 0);
            if (healDelta > 0) changes.push({ type: 'heal', value: healDelta });

            const nowH = (after.buffs?.health || 0) + (after.roundBuffs?.health || 0);
            const befH = before.buffsH + before.roundH;
            if (nowH - befH > 0) changes.push({ type: 'buff_health', value: nowH - befH });

            const nowP = (after.buffs?.power || 0) + (after.roundBuffs?.power || 0);
            const befP = before.buffsP + before.roundP;
            const pwD = nowP - befP;
            if (pwD > 0) changes.push({ type: 'buff_power', value: pwD });
            if (pwD < 0) changes.push({ type: 'debuff_power', value: Math.abs(pwD) });

            const newKws = (after.keywords || []).filter(k => !before.keywords.includes(k));
            for (const kw of newKws) changes.push({ type: 'gain_keyword', keyword: kw });

            if (changes.length > 0) {
                entities.push({
                    cardKey: after.key,
                    owner: getUnitOwner(id),
                    damageTaken: dmgDelta > 0 ? dmgDelta : undefined,
                    died: after.isDead || after.animState === 'dying' || getCurrentHP(after) <= 0,
                    snapshot: captureSnapshot(after),
                    changes,
                });
            }
        }
        return entities;
    };

    // [2026-07-21] 全单位快照类型
    type UnitSnapshot = { damageTaken: number; buffsH: number; buffsP: number; roundH: number; roundP: number; keywords: string[] };

    // [2026-07-21] 捕获全场单位的快照 Map
    const snapshotAllFieldUnits = (): Map<string, UnitSnapshot> => {
        const map = new Map<string, UnitSnapshot>();
        for (const id of collectFieldUnitIds()) {
            const u = findUnitById(id);
            if (u) map.set(id, {
                damageTaken: u.damageTaken || 0,
                buffsH: u.buffs?.health || 0, buffsP: u.buffs?.power || 0,
                roundH: u.roundBuffs?.health || 0, roundP: u.roundBuffs?.power || 0,
                keywords: [...(u.keywords || [])],
            });
        }
        return map;
    };

    // --- 1. 开始施法 ---
    // ★ 选择模式基础框架 — 每个选择模式都通过此函数激活 spellSystem 视觉层
    //    有效果定义的卡：进入目标选择模式（瞄准线/高亮）
    //    无效果定义的卡（如 select_bench 的单位）：仅激活视觉层（卡牌居中/播报文字/瞄准线）
    const startCasting = (card: CardData, skipAutoComplete?: boolean) => {
        const effect = getEffectDef(card);
        if (!effect) {
            // [2026-07-20] 无效果定义的卡（如替换打出的单位）：仍然激活视觉层
            setCastingCard(card);
            setCurrentStepIndex(0);
            setSelectedTargets([]);
            return;
        }

        // 如果没有目标需求，直接完成 (自动施法)
        // 但 skipAutoComplete 时跳过，由调用方控制完成时机
        if (effect.targetRequirements.length === 0 && !skipAutoComplete) {
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
        raceFilter?: Race[],       // [新增] 种族过滤器
        keywordFilter?: string[],   // [2026-07-07] 关键词过滤
        stackCostBelow?: number,    // [2026-08-05 莉莉子] SPELL_ON_STACK 目标费用上限（不含）
        stackSpeedFilter?: string[] // [2026-08-05 莉莉子] SPELL_ON_STACK 目标速度白名单
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
        // [2026-08-08 莉莉子修复] 仅单位需要存活判定——法术卡 health=0 会被 getCurrentHP 误判为死亡，
        // 导致 SPELL_ON_STACK（反制栈上法术）等以法术为目标的选择永远被拦下（点不动敌方法术）
        if (card.type?.includes('unit') && (card.isDead || getCurrentHP(card) <= 0)) return false;

        // =====================================
        // [核心新增] 种族拦截器 (Race Filter)
        // =====================================
        if (raceFilter && raceFilter.length > 0) {
            if (!card.race || !card.race.some(r => raceFilter.includes(r))) {
                return false; // 种族不符，不可选
            }
        }

        // =====================================
        // [2026-07-07 新增] 关键词过滤器 (Keyword Filter)
        // =====================================
        if (keywordFilter && keywordFilter.length > 0) {
            // 目标必须拥有 keywordFilter 中的至少一个关键词
            const hasKeyword = keywordFilter.some(kw => card.keywords?.includes(kw));
            if (!hasKeyword) return false;
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
            case 'ALLY_UNIT': return isAlly && (!filterKey || card.key === filterKey);
            case 'ENEMY_UNIT': return isEnemy;
            case 'ANY_UNIT': return true;
            case 'ANY_TARGET': return true; // 单位也是 Target
            case 'ALLY_CHAMPION': return isAlly && card.isChampion && (!filterKey || card.key === filterKey);
            case 'HAND_CARD': return true; // [2026-06-27] 手牌卡，来源由 handleTargetClick 前置拦截保障
            case 'SPELL_ON_STACK': {
                // [2026-08-05 莉莉子] 反制目标：堆叠中的敌方法术（来源由 handleTargetClick 前置拦截为 'stack'）
                // [LILITH-DEBUG] 反制目标校验诊断
                const _isAlly = isAlly, _type = card.type, _cost = card.cost || 0, _costBelow = stackCostBelow, _spdF = stackSpeedFilter;
                let _onStack = true;
                if (stateRef) _onStack = stateRef.current.game.spellStack.some(s => s.card.id === card.id);
                const _pass = !_isAlly && (_type === 'spell-fast' || _type === 'spell-slow' || _type === 'spell-burst')
                    && !(_costBelow !== undefined && _cost >= _costBelow)
                    && !(_spdF && _spdF.length > 0 && !_spdF.includes(_type))
                    && _onStack;
                console.log(`[LILITH-DEBUG][NEGATE] 校验目标 ${card.key}(${card.name}) type=${_type} cost=${_cost} owner=${owner} stackCostBelow=${_costBelow} speedFilter=${JSON.stringify(_spdF)} onStack=${_onStack} → ${_pass ? '✅可反制' : '❌拒绝'}`);
                return _pass;
            }
            default: return false;
        }
    };

    // --- 4. 处理点击交互 ---
    // [2026-06-27 暗箱操作] 新增 source 参数区分手牌点击 vs 场上点击
    const handleTargetClick = (target: CardData | 'nexus', owner: 'player' | 'enemy', source?: 'hand' | 'field' | 'stack') => {
        // [2026-07-09 瓦莱莉] 支持 select_discard 模式（无 castingCard，直接读写 game.spellCasting）
        // 注：此分支只有 useGameState 层的 useSpellSystem 有 stateRef，UI 层的走 GameSession.handleCardClick
        if (stateRef) {
            const sc = stateRef.current.game.spellCasting;
            if (!castingCard && sc?.step === 'select_discard') {
                if (source !== 'hand' || target === 'nexus') return;
                const targetObj = { type: 'ally' as const, id: target.id };
                const currentIds = sc.targets.map((t: any) => t.id);
                const newTargets = currentIds.includes(target.id)
                    ? sc.targets.filter((t: any) => t.id !== target.id)
                    : [...sc.targets, targetObj];
                updateSpellCasting({ ...sc, targets: newTargets });
                eventBus.emit(GameEvents.SFX_SELECT_UNIT);
                return;
            }
        }

        if (!castingCard) return;

        const effect = getEffectDef(castingCard);
        if (!effect) return;

        // 获取当前步骤的需求
        const requirement = effect.targetRequirements[currentStepIndex];
        if (!requirement) return;

        // [2026-06-27 HAND_CARD] 来源隔离：手牌操作只能由点击手牌触发
        if (requirement.type === 'HAND_CARD' && source !== 'hand') return;
        if (requirement.type !== 'HAND_CARD' && source === 'hand') return;
        // [2026-08-05 SPELL_ON_STACK] 来源隔离：堆叠法术只能由点击堆叠卡触发
        if (requirement.type === 'SPELL_ON_STACK' && source !== 'stack') return;
        if (source === 'stack' && requirement.type !== 'SPELL_ON_STACK') return;

        // [2026-07-09 修复] 手牌弃牌：不能选正在打出的卡牌自身（按实例 ID 排，同名不同 ID 可以选）
        if (requirement.type === 'HAND_CARD' && target !== 'nexus' && castingCard && target.id === castingCard.id) {
            console.log("[HAND_CARD] 不能选择正在施放的卡牌自身作为弃牌目标");
            return;
        }

        // [2026-08-08 莉莉子修复] HAND_CARD 类型/费用过滤（战术闪击等：只能选指定类型、费用上限的手牌）
        if (requirement.type === 'HAND_CARD' && target !== 'nexus') {
            if (requirement.cardTypeFilter === 'unit' && !target.type?.includes('unit')) {
                setMessage?.("只能选择单位卡牌！");
                return;
            }
            if (requirement.cardTypeFilter === 'spell' && !target.type?.includes('spell')) {
                setMessage?.("只能选择法术卡牌！");
                return;
            }
            const maxCost = effect?.params?.maxCost;
            if (maxCost !== undefined && (target.cost || 0) >= maxCost) {
                setMessage?.(`只能选择费用低于${maxCost}的卡牌！`);
                return;
            }
        }

        // [2026-08-05 莉莉子 法术16] 多目标选择去重：同一单位不可重复选（防止三连选天启者选中同一个）
        if (target !== 'nexus' && selectedTargets.some(t => t.id === target.id)) {
            console.log("[目标选择] 该单位已选过，不能重复选择");
            return;
        }

        // 验证合法性：将法术配置中的高级暗号和种族过滤器传给雷达
        if (isValidTarget(target, owner, requirement.type, requirement.filterKey, effect.params?.targetCondition, requirement.raceFilter, requirement.keywordFilter, requirement.stackCostBelow, requirement.stackSpeedFilter)) {
            // [新增] 目标合法，成功锁定！播放清脆的确认音
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);

            // 构建目标数据结构 (标准化)
            // [核心修复 BUG 4]：为水晶目标补齐虚拟的 DOM 锚点 ID，防止特效层取不到坐标而卡死
            const targetObj = target === 'nexus'
                ? { type: owner === 'player' ? 'player_nexus' : 'enemy_nexus', id: owner === 'player' ? 'nexus_player' : 'nexus_enemy' }
                : requirement.type === 'SPELL_ON_STACK'
                    ? { type: 'spell_on_stack', spellId: target.id, id: target.id } // [2026-08-05 莉莉子] 反制目标：指向堆叠法术实例；[2026-08-15] 补 id 让 VFXLayer 确认/持久线能按 data-entity-id 定位 DOM（此前缺 id 导致线不渲染）
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

    // =============================================
    // [2026-07-11 绿灵·艾娃] 光环检测：打出快速法术时触发牌库BUFF
    // =============================================
    const checkEvaAura = (card: CardData, owner: 'player' | 'enemy', logPrefix: string) => {
        if (card.type !== 'spell-fast') return;
        const benchToCheck = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
        const aliveFilter = (c: CardData) =>
            c.key === 'Green_Spirit_Squad_Eva' && !c.isDead &&
            c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
        const evaCount = benchToCheck.filter(aliveFilter).length;
        console.log(`[Green_Debug] 🔍 ${logPrefix} 艾娃光环检测: card=${card.name}(${card.cost}费), type=${card.type}, owner=${owner}, evaCount=${evaCount}, benchLen=${benchToCheck.length}`);
        if (evaCount === 0) return;

        let deckCopy = [...(owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck)];
        let totalBuffed = 0;
        for (let i = 0; i < evaCount; i++) {
            const result = buffTopUnitInDeck(deckCopy, 1, 1);
            if (result.buffed) {
                deckCopy = result.deck;
                totalBuffed++;
                console.log(`[Green_Debug] 🌟 艾娃光环 #${i + 1} 触发！${owner}打出快速法术=${card.name}，牌库顶单位=${result.buffedUnit?.name} 获得+1+1`);
            }
        }
        if (totalBuffed > 0) {
            if (owner === 'player') {
                setPlayerDeck(deckCopy);
                stateRef.current.playerDeck = deckCopy;
            } else {
                setEnemyDeckState(deckCopy);
                stateRef.current.enemyDeck = deckCopy;
            }
            setMessage(`艾娃的光环${evaCount > 1 ? '们' : ''}滋养了牌库！`);
        } else {
            console.log(`[Green_Debug] 🌟 艾娃光环：${owner}牌库中无单位可BUFF`);
        }
    };

    const commitSpell = async (card: CardData, owner: 'player' | 'enemy', targets: any[], originalPhase?: any) => {
        // [2026-07-20 对局记录修复] 使用 setTimeout 将事件推入宏任务队列，
        // 确保它在 commitSpell 后续所有的 setGame(cleanSnapshot) 同步状态覆盖完成后再执行
        setTimeout(() => {
            eventBus.emit('spell_record', { card, owner, targets });
        }, 0);

        const existingPending = stateRef.current.game.pendingSpell;
        let cleanSnapshot = { ...stateRef.current.game };
        const safePhase = originalPhase || (cleanSnapshot.phase === 'animating' ? 'main' : cleanSnapshot.phase);

        // [2026-08-06 莉莉子 Echo 回响] 法术打出并结算后：在手牌生成一张该牌的瞬逝复制品
        if (card.keywords.includes('Echo')) {
            const echoOwnerHand = owner === 'player'
                ? stateRef.current.playerHand
                : stateRef.current.enemyHand;
            const echoResult = applyEchoOnPlay(card, echoOwnerHand, owner);
            if (echoResult.echoedCards.length > 0) {
                if (owner === 'player') {
                    setPlayerHand(echoResult.hand);
                    stateRef.current.playerHand = echoResult.hand;
                } else {
                    setEnemyHand(echoResult.hand);
                    stateRef.current.enemyHand = echoResult.hand;
                }
                echoResult.echoedCards.forEach(echoCard => {
                    const animId = `echo-${echoCard.id}-${Date.now()}`;
                    eventBus.emit(GameEvents.DRAW_START, {
                        animId, card: echoCard, owner,
                        skipHandAdd: true,
                        skipDeckAnim: true,
                    });
                });
            }
        }

        if (card.type === 'spell-burst') {
            if (!card.parentCard) {
                // [2026-07-10 诗人] 凯特琳减费影响实际扣费（双方均适配）
                const benchForCost = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                const effectiveCost = getEffectiveSpellCost(card, benchForCost, cleanSnapshot.playerMaxMana);
                const { newMana, newSpellMana } = calculateNewMana(
                    effectiveCost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = Math.min(cleanSnapshot.playerMaxMana, newMana);
                    cleanSnapshot.playerSpellMana = Math.min(3, newSpellMana);
                } else {
                    cleanSnapshot.enemyMana = Math.min(cleanSnapshot.enemyMaxMana, newMana);
                    cleanSnapshot.enemySpellMana = Math.min(3, newSpellMana);
                }
            }

            setGame(cleanSnapshot);
            setMessage("极速法术准备就绪...");

            if (owner === 'enemy') {
                // [2026-07-07 重构] AI 法术三段式演出: 悬念 → 锁定 → 飞弹
                // Phase 1: 入堆栈无 targets → 大圆盘出现，无瞄准线（悬念期）
                // [2026-08-07 莉莉子修复] 清空抉择残留状态（对齐下方 enemy 慢速分支），
                // 防止 AI 打出天启者抉择法术（如里芙的决意）后 activeCard/spellCasting 残留导致抉择界面卡死
                setGame(prev => ({
                    ...prev,
                    activeCard: null,
                    spellCasting: null,
                    spellStack: [{ card, owner, targets: [] }, ...prev.spellStack],
                    phase: 'animating',
                }));
                setMessage("敌方正在施法...");
                await wait(1200);

                // Phase 2: 补充 targets → 瞄准线出现（锁定期）
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.map(s =>
                        s.card.id === card.id ? { ...s, targets } : s
                    )
                }));
                setMessage("敌方法术锁定目标！");
                await wait(400);
            } else {
                await wait(1000);

                const currentActiveCard = stateRef.current.game.activeCard;
                // [修复] 容错抉择法术：card.parentCard 指向抉择卡，此时 currentActiveCard 可能还是抉择卡的旧 ID
                const matchesActiveCard = currentActiveCard && (
                    currentActiveCard.id === card.id ||
                    currentActiveCard.id === (card as any).parentCard?.id
                );
                // [LILITH-DEBUG] 极速法术熔断诊断
                console.log(`[LILITH-DEBUG][BURST] 1秒悬停检查: card=${card.key}(${card.id}) currentActiveCard=${currentActiveCard ? currentActiveCard.key + '(' + currentActiveCard.id + ')' : 'null'} matches=${!!matchesActiveCard} spellCasting=${stateRef.current.game.spellCasting?.step ?? 'null'}`);
                if (owner === 'player' && !matchesActiveCard) {
                    console.log("[SpellSystem] 极速法术在 1 秒悬停期内被撤回，执行链已安全熔断！");
                    return;
                }

                setGame(prev => ({ ...prev, spellCasting: null, activeCard: null }));
                console.log(`[LILITH-DEBUG][BURST] 已清除 spellCasting/activeCard`);
            }

            // Phase 3: AI 弹道飞行前清除瞄准线
            if (owner === 'enemy') {
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.map(s => ({ ...s, targets: [] }))
                }));
            }

            // [2026-07-21 对局记录] 极速法术 — 执行前扫全场快照
            const burstBeforeMap = snapshotAllFieldUnits();

            // [核心升级] 极速法术弹道接入通用管线！
            eventBus.emit(StrikeEvents.COMMAND, {
                sourceId: card.id,
                spellKey: card.key,
                bullets: (targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                interval: 0
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
                setMessage,
                // [2026-07-08 修复] 补传 enemyHand，DISCARD 需要它来找到要弃的牌
                enemyHand: stateRef.current.enemyHand,
                setEnemyHand,
            }, card); // [2026-07-28] 传入法术卡牌实例（供 FLYING_SWORD 读取 customProgress 模式）

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            // [2026-07-11 绿灵·艾娃] 极速法术触发艾娃光环
            checkEvaAura(card, owner, '[BURST]');

            // [2026-07-21 对局记录] 极速法术 — 全量对比发射
            {
                const burstEntities = computeChangesFromMap(burstBeforeMap);
                let burstSummary = '';
                if (card.effects) {
                    for (const effId of card.effects) {
                        const effDef = EFFECT_DB[effId];
                        if (!effDef) continue;
                        if (effDef.class === 'STRIKE' || effDef.class === 'HEAL') {
                            if (effDef.record?.summary) {
                                burstSummary = effDef.record.summary.replace(/\{(\w+)\}/g, (_, k) =>
                                    String(effDef.params[k as keyof typeof effDef.params] ?? `{${k}}`));
                            } else if (effDef.class === 'STRIKE' && effDef.params.value) {
                                burstSummary = `造成 ${effDef.params.value} 点伤害`;
                            } else if (effDef.class === 'HEAL' && effDef.params.value) {
                                burstSummary = `恢复 ${effDef.params.value} 点生命`;
                            }
                        }
                    }
                }
                if (burstEntities.length > 0 || burstSummary) {
                    eventBus.emit('spell_effect_record', {
                        owner, spellCardKey: card.key, summary: burstSummary, entities: burstEntities,
                    } as any);
                }
            }

            setGame(prev => ({
                ...prev,
                phase: safePhase,
                lastActionTimestamp: Date.now(),
                // [教程方案] AI 极速法术：从堆叠移除已结算的法术
                spellStack: owner === 'enemy' ? prev.spellStack.filter(s => s.card.id !== card.id) : prev.spellStack,
            }));
            setMessage("极速法术生效");
        } else {
            if (!card.parentCard) {
                // [2026-07-15 梵音] 慢速法术也应用减费（觉悟/凯特琳）
                const benchForCost = owner === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                const effectiveCost = getEffectiveSpellCost(card, benchForCost, cleanSnapshot.playerMaxMana);
                const { newMana, newSpellMana } = calculateNewMana(
                    effectiveCost,
                    owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                    owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                    false
                );
                if (owner === 'player') {
                    cleanSnapshot.playerMana = Math.min(cleanSnapshot.playerMaxMana, newMana);
                    cleanSnapshot.playerSpellMana = Math.min(3, newSpellMana);
                } else {
                    cleanSnapshot.enemyMana = Math.min(cleanSnapshot.enemyMaxMana, newMana);
                    cleanSnapshot.enemySpellMana = Math.min(3, newSpellMana);
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
                // [2026-07-07 重构] AI 非极速法术悬念期: 大圆盘 → 瞄准线 → 交响应
                // Phase 1: 入堆栈无 targets → 大圆盘出现，悬念（animating 防 AI 计时器捣乱）
                setGame({
                    ...cleanSnapshot,
                    activeCard: null,
                    spellCasting: null,
                    spellStack: [{ card, owner, targets: [] }, ...cleanSnapshot.spellStack],
                    phase: 'animating',
                });
                setMessage("敌方正在施法...");
                await wait(1200);

                // Phase 2: 补充 targets → 瞄准线出现 → 交给玩家响应
                setGame(prev => ({
                    ...prev,
                    turnOwner: 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                    phase: safePhase,
                    spellStack: prev.spellStack.map(s =>
                        s.card.id === card.id ? { ...s, targets } : s
                    )
                }));
                setMessage("敌方打出法术，请响应");
            }
        }
    };

    // ★ 选择模式接入点 ⑩ — 每个 select_* step 在取消时需处理退卡退费
    //    已实现: select_bench
    //    未来: select_enemy_bench | select_enemy_hand
    const cancelChoice = () => {
        // [2026-08-02 莉莉子] 同步清理施法视觉状态（castingCard / 目标选择 / 连线渲染）
        // 防止取消抉择后残留施法层，导致界面看起来"取消不掉"
        cancelCasting();
        const sc = stateRef.current.game.spellCasting;
        const currentActive = stateRef.current.game.activeCard;

        // [2026-07-20 替换打出] 取消替换：退回手牌 + 退还法力
        if (sc?.step === 'select_bench' && currentActive) {
            const cost = currentActive.cost || 0;
            setPlayerHand(prev => [...prev, currentActive]);
            setGame(prev => {
                let newMana = prev.playerMana + cost;
                let newSpellMana = prev.playerSpellMana;
                if (newMana > prev.playerMaxMana) {
                    newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                    newMana = prev.playerMaxMana;
                }
                return {
                    ...prev,
                    activeCard: null,
                    spellCasting: null,
                    playerMana: newMana,
                    playerSpellMana: newSpellMana,
                };
            });
            setMessage("已取消替换");
            return;
        }

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

        // [2026-07-30 飞剑减费] 抉择确认时应用飞剑折扣（朔望之期 + 剑痕时空）
        const SWORD_DISCOUNT_KEYS = ['acacia_chrono_echo_ultimate', 'acacia_sword_timeline'];
        if (SWORD_DISCOUNT_KEYS.includes(chosenCardKey)) {
            const choiceOwner = game.turnOwner === 'enemy' ? 'enemy' : 'player';
            const gameState = stateRef.current.game;
            const fsTotal = choiceOwner === 'player'
                ? (gameState.playerFlyingSwordsTotal || 0)
                : (gameState.enemyFlyingSwordsTotal || 0);
            if (fsTotal > 0) {
                transformed.cost = Math.max(0, (transformed.cost || 0) - fsTotal);
            }
        }

        // [新增] 触发天启者技能语音
        const heroKey = originalCard.associatedChampionKey;
        if (heroKey) {
            const isUltimate = chosenCardKey.includes('ultimate');
            eventBus.emit(GameEvents.SPELL_CHOICE, {
                hero: { key: heroKey, id: `voice-${heroKey}` } as CardData,
                choice: isUltimate ? 'ultimate' : 'small'
            });
        }

        const choiceOwner = game.turnOwner === 'enemy' ? 'enemy' : 'player';
        const { newMana, newSpellMana } = calculateNewMana(
            transformed.cost,
            choiceOwner === 'player' ? game.playerMana : game.enemyMana,
            choiceOwner === 'player' ? game.playerSpellMana : game.enemySpellMana,
            false
        );
        if (choiceOwner === 'player') {
            setGame(prev => ({ ...prev, playerMana: Math.min(prev.playerMaxMana, newMana), playerSpellMana: Math.min(3, newSpellMana) }));
        } else {
            setGame(prev => ({ ...prev, enemyMana: Math.min(prev.enemyMaxMana, newMana), enemySpellMana: Math.min(3, newSpellMana) }));
        }

        const effectId = transformed.effects && transformed.effects.length > 0 ? transformed.effects[0] : null;
        const effectDef = effectId ? EFFECT_DB[effectId] : null;
        const needsTargets = effectDef && effectDef.targetRequirements && effectDef.targetRequirements.some(req => req.count > 0);

        // [千莲叠绽特判] 猫汐尔未格挡时直接召唤，不需要选目标
        const finalNeedsTargets = effectId === 'effect_mauxir_lotus_rush'
            ? needsTargets && stateRef.current.combatField?.some(f =>
                f.blocker?.key === 'mauxir_lotus_drive' && f.owner === 'enemy'
              )
            : needsTargets;

        // [修复] 将 activeCard 更新为选中的技能卡，确保后续流程使用正确的卡牌效果
        if (finalNeedsTargets) {
            // [2026-07-30 AI抉择] 敌方抉择法术需选目标时，AI自动选目标入栈
            if (choiceOwner === 'enemy') {
                const autoTargets = findAITargetsForEffect(effectDef!, choiceOwner, stateRef.current);
                if (autoTargets.length > 0) {
                    setGame(prev => ({ ...prev, activeCard: transformed }));
                    commitSpell(transformed, 'enemy', autoTargets, originalPhase);
                } else {
                    console.warn(`[AI抉择] 找不到 ${transformed.name} 的合法目标，取消施法`);
                    // 直接清理状态，不调用 cancelChoice（后者会错误地归还手牌到玩家侧）
                    setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                }
            } else {
                const reqType = effectDef!.targetRequirements[0].type;
                let step: 'select_ally' | 'select_enemy' | 'select_any' = 'select_any';
                if (reqType.includes('ALLY')) step = 'select_ally';
                else if (reqType.includes('ENEMY')) step = 'select_enemy';

                setGame(prev => ({
                    ...prev,
                    activeCard: transformed,  // [修复] 替换 activeCard 为技能卡（含 effects）
                    phase: originalPhase === 'animating' ? 'main' : originalPhase,
                    spellCasting: {
                        cardId: transformed.id,
                        step: step,
                        targets: [],
                        allyId: undefined
                    }
                }));
                setMessage(`请选择 ${transformed.name} 的施放目标`);
            }
        } else {
            // [修复] 先更新 activeCard 再 commit，防止 commitSpell 中 ID 检查失败
            setGame(prev => ({ ...prev, activeCard: transformed }));
            commitSpell(transformed, choiceOwner, [], originalPhase);
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
        const isBlockDeclare = stateRef.current.game.phase === 'block_declare';
        setGame(prev => {
            if (!prev.pendingSpell) return prev;
            return {
                ...prev,
                spellStack: [prev.pendingSpell, ...prev.spellStack],
                pendingSpell: null,
                // [修复] block_declare 阶段确认法术不转优先权，让玩家继续部署格挡
                turnOwner: isBlockDeclare ? prev.turnOwner : 'enemy',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });
        setMessage(isBlockDeclare ? "法术入栈，继续部署防线" : "法术入栈，等待对方响应");
    };

    // ★ 选择模式接入点 ⑪ — 每个 select_* step 的取消按钮路由到对应的退卡退费逻辑
    //    已实现: select_bench → cancelChoice | select_discard → 退费退卡
    //    未来: select_enemy_bench → cancelChoice | select_enemy_hand → cancelChoice
    const cancelPendingSpell = () => {
        // [2026-07-09 瓦莱莉] 取消弃牌选择：退回瓦莱莉并归还法力
        const sc = stateRef.current.game.spellCasting;

        // [2026-07-20 替换打出] 取消替换：同样退回卡牌并归还法力
        if (sc?.step === 'select_bench') {
            cancelChoice();
            return;
        }

        if (sc?.step === 'select_discard') {
            const activeCard = stateRef.current.game.activeCard;
            if (activeCard) {
                setPlayerHand(prev => [...prev, activeCard]);
                const costToRefund = activeCard.cost;
                setGame(prev => {
                    let newMana = prev.playerMana + costToRefund;
                    let newSpellMana = prev.playerSpellMana;
                    if (newMana > prev.playerMaxMana) {
                        newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                        newMana = prev.playerMaxMana;
                    }
                    return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana, activeCard: null, spellCasting: null };
                });
            } else {
                setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
            }
            setMessage("已取消");
            return;
        }

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
            // [2026-08-05 NEGATE] 法术可能已在堆叠中被无效化移除（法术8/6/7），跳过不再结算
            const stillOnStack = stateRef.current.game.spellStack.some(s => s.card.id === spell.card.id);
            if (!stillOnStack) {
                setMessage(`${spell.card.name} 已被无效化`);
                console.log(`[resolveStack] ${spell.card.name} 已被无效化，跳过结算`);
                continue;
            }
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

            // [2026-07-21 对局记录] 执行前 — 扫全场快照
            const beforeSnapshotMap = snapshotAllFieldUnits();

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
                triggerShake, setMessage,
                // [2026-07-08 修复] 补传 enemyHand，DISCARD 需要它来找到要弃的牌
                enemyHand: stateRef.current.enemyHand,
                setEnemyHand,
            }, spell.card); // [2026-07-28] 传入法术卡牌实例（供 FLYING_SWORD 读取 customProgress 模式）
            setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));

            await wait(50);
            const isQueueProcessed = flushMicroQueue();
            if (isQueueProcessed) await wait(50);

            // [2026-07-11 绿灵·艾娃] 栈内法术触发艾娃光环
            checkEvaAura(spell.card, spell.owner, '[STACK]');

            while (
                stateRef.current.game.levelUpCard !== null ||
                (stateRef.current.game.pendingLevelUps && stateRef.current.game.pendingLevelUps.length > 0)
            ) {
                await wait(200);
            }

            // [2026-07-21 对局记录] 全量对比发射
            {
                const effectEntities = computeChangesFromMap(beforeSnapshotMap);
                let effectSummary = '';
                const cardDef = CARD_DB[spell.card.key];
                if (cardDef?.effects) {
                    for (const effId of cardDef.effects) {
                        const effDef = EFFECT_DB[effId];
                        if (!effDef) continue;
                        if (effDef.class === 'STRIKE' || effDef.class === 'HEAL') {
                            if (effDef.record?.summary) {
                                effectSummary = effDef.record.summary.replace(/\{(\w+)\}/g, (_, k) =>
                                    String(effDef.params[k as keyof typeof effDef.params] ?? `{${k}}`));
                            } else if (effDef.class === 'STRIKE' && effDef.params.value) {
                                effectSummary = `造成 ${effDef.params.value} 点伤害`;
                            } else if (effDef.class === 'HEAL' && effDef.params.value) {
                                effectSummary = `恢复 ${effDef.params.value} 点生命`;
                            }
                        }
                    }
                }
                if (effectEntities.length > 0 || effectSummary) {
                    eventBus.emit('spell_effect_record', {
                        owner: spell.owner,
                        spellCardKey: spell.card.key,
                        summary: effectSummary,
                        entities: effectEntities,
                    } as any);
                }
            }
        }
        // [SBA] 法术结算后同步清尸
        judgeLifeAndDeath();
        const nextPhase = originalPhase === 'react_to_block' ? 'react_to_block' : 'main';
        setGame(prev => ({
            ...prev,
            phase: nextPhase,
            spellStack: [],
            // 【机制修复】如果是从防守响应阶段结算的法术，将让过次数设为 1
            // 这样接力调用的 passTurn 看到 >=1 就会立刻无缝触发 resolveCombatAnimation()！
            consecutivePasses: nextPhase === 'react_to_block' ? 1 : 0
        }));

        // 【致命核心修复】强制让出主线程 50ms，确保上述的 setGame 被 React 批处理刷入 stateRef！
        // 防止外层的 .then(() => passTurn()) 同步执行时，读到滞后的 'animating' 阶段而导致回合被错误跳过
        await wait(50);
        setMessage("法术结算完毕");
    };

    // --- 5. 导出状态供 UI 使用 ---
    const currentRequirement = castingCard ? getEffectDef(castingCard)?.targetRequirements[currentStepIndex] : null;

    return {
        // 原有 UI 目标选择层
        isCasting: !!castingCard,
        isSelectionComplete: !!castingCard && selectedTargets.length >= (getEffectDef(castingCard)?.targetRequirements.length || 0),
        activeCard: castingCard,
        currentRequirement, // [2026-08-05 莉莉子] 暴露当前目标需求（SPELL_ON_STACK 判断用）
        selectedTargets,
        instruction: currentRequirement?.label,
        selectedIds: selectedTargets.map(t => t.id).filter(Boolean),
        checkIsTargetable: (card: CardData | 'nexus', owner: 'player' | 'enemy') => {
            if (!currentRequirement || !castingCard) return false;
            // [2026-06-27 HAND_CARD] 手牌选择不高亮场上目标
            if (currentRequirement.type === 'HAND_CARD') return false;
            const effect = getEffectDef(castingCard);
            return isValidTarget(card, owner, currentRequirement.type, currentRequirement.filterKey, effect?.params?.targetCondition, currentRequirement.raceFilter, currentRequirement.keywordFilter, currentRequirement.stackCostBelow, currentRequirement.stackSpeedFilter);
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