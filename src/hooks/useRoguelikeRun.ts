// ==========================================
// 悖论迷宫 · 整局状态管理
// 管理全局 HP/金币/遗物/牌组/层数/位置/悖论点
// ⚠️ 简化规则（框架阶段）：
//   - 战斗失败 → 死亡结算
//   - 战斗胜利 → 推进
//   - 全局 HP 仅作展示（战斗内水晶 HP 衔接是细节，后续完善）
// ==========================================
import { useCallback, useRef, useState } from 'react';
import { ROGUE_MAPS, generateMapLayout, type RogueAct } from '../data/roguelike/mapLayout'; // [2026-08-28] 三张难度图按难度取 · [2026-09-01] 预分配地图（含敌人）存 run 防放弃战斗刷新
import { MAZE_ENHANCEMENTS } from '../data/roguelike/enhancements';
import { PLAYER_ENHANCEMENTS } from '../data/roguelike/buffs'; // [2026-08-31 莉莉子 开发者] 全量玩家强化池（含通行证锁定，开发者任意选测试用）
import type { RogueDifficulty } from '../data/roguelike/difficulties'; // [2026-08-07 难度系统]
import type { RogueInvestment } from '../data/roguelike/events'; // [2026-08-28] 事件投资标记
import { CARD_DB } from '../data/cards';
import { getEquipPoolForCard } from '../data/equipment'; // [2026-08-29 休整·探路] 回归随机装备
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils'; // [2026-08-28 对局持久化] 未结算对局暂离存档

export type RoguelikeRunStatus = 'active' | 'won' | 'dead';

export interface RoguelikeRunState {
    heroKey: string;
    difficulty: RogueDifficulty; // [2026-08-07] 本局难度（普通/机密/绝密，影响敌人/地图/BUFF）
    deck: string[];
    hp: number;
    maxHp: number;
    gold: number;
    enhancements: string[]; // [2026-08-05] 迷宫强化（原"遗物"改名）
    act: number; // 当前 Act (1~3)
    currentNodeId: string | null;
    paradoxPoints: number;
    refreshCount: number; // [新增] 刷新次数
    reviveCount: number;  // [新增] 复活次数
    defeated: string[];   // [2026-08-10] 已击败的战斗节点 id（地图显示红叉）
    missed: string[];     // [2026-08-10] 错过的节点 id（走过分支未选择，地图显示灰色）
    visited: string[];    // [2026-08-27] 走过的节点 id（离开即记录，地图灰显不可回退）
    status: RoguelikeRunStatus;
    heroLevel?: number;       // [2026-08-12 天启者养成] 开局英雄等级（展示用）
    equippedCards?: Record<string, string[]>; // [2026-08-12 商店经济] 带装备的卡：卡 key → 装备 id 列表（英雄卡 + 商店购买，战斗构建时 attachEquipment 应用）
    rarityBonus?: { rare: number; epic: number; legendary: number }; // [2026-08-12 天启者养成] 高稀有度概率加成（强化/装备抽选用）
    pendingInvestments?: RogueInvestment[]; // [2026-08-28 事件] 跨节点投资标记（battleWinGold 战斗胜利返 / restHeal 休息翻倍 / enhancementRank 强化品质+1）
    pendingFightDebuff?: { enemyHpBonus: number; fights: number } | null; // [2026-08-28 事件] 未来 N 场战斗敌人水晶 +生命（饥渴的虚空）
    // [2026-08-29 经验重构] 局内渐进经验 + 速通时长 + 效率加成
    startedAt: number;            // 对局开始时间戳（速通计时）
    expFromNodes: number;         // 本局已发放的节点经验累计（结算时补差额）
    expGrantedNodes: string[];    // 已发过经验的节点 id（按节点去重）
    armaments?: string[];         // 本局开局武装快照（碳原子板"通关经验翻倍"判断）
    expRateBonus?: number;        // 天启者等级经验效率加成（%）
    passUnlockedEnhancements?: string[]; // [2026-08-29 通行证] 本局已解锁的通行证专属强化 id（强化抽选加入池）
    equipRarityBonus?: number; // [2026-08-29 程拍板] 天启者等级装备稀有度加成（%，战斗奖励抽选紫金加权）
    scout?: { cardKey: string; remaining: number } | null; // [2026-08-29 休整·探路] 探路中的卡（暂时移出牌组，2 节点后回归带随机装备）
    devEnemyEnhancements?: string[]; // [2026-08-31 莉莉子 开发者] 开发者账号在本局任意强化节点选的敌方强化，注入下一场战斗（便于地毯式测试敌方强化）
    layout: RogueAct[]; // [2026-09-01 莉莉子] 本局预分配地图（含节点敌人/强化/BUFF）：startRun 生成一次存 run，放弃战斗返回地图不再重随（此前 RogueMapScreen 每次挂载重新 generateMapLayout 随机敌人）
    heroRecruitDone?: boolean; // [2026-09-04 首战英雄招募] 首战天启者三选一已结算过（pick/skip 后置 true，防重复触发）
}

// [2026-08-12 天启者养成] startRun 可选的等级加成（由 useHeroProgression.getHeroLevelBonus 提供，数值为"加成量"）
export interface RoguelikeStartBonus {
    maxHp?: number;              // 生命上限加成（基础 30 之上）
    gold?: number;               // 金币加成（基础 50 之上）
    reviveCount?: number;        // 复活次数加成（基础 1 之上）
    refreshCount?: number;       // 刷新次数加成（基础 1 之上）
    extraEnhancements?: string[]; // 开局自动获得的迷宫强化 id
    extraEquipments?: string[];   // 开局自动挂载的装备 id
    grantedSpellEquips?: string[]; // [2026-08-29] 开局随机一张初始牌组法术卡挂的装备 id（海基的推演手记，原微缩回路）
    grantedUnitEquips?: string[];  // [2026-08-29] 开局随机一个初始牌组非英雄单位挂的装备 id（均衡增补/强攻模板）
    armaments?: string[];         // [2026-08-29] 本局开局武装快照（碳原子板经验翻倍）
    expRateBonus?: number;        // [2026-08-29] 天启者等级经验效率加成（%）
    passUnlockedEnhancements?: string[]; // [2026-08-29 通行证] 已解锁的通行证专属强化 id
    equipRarityBonus?: number;   // [2026-08-29] 天启者等级装备稀有度加成（%）
    heroLevel?: number;          // 开局英雄等级
    rarityBonus?: { rare: number; epic: number; legendary: number }; // 高稀有度概率加成（%）
}

const DEFAULT_MAX_HP = 20; // [2026-08-28] 玩家水晶基础生命 20（+ 等级四节点各 +5 → 满级 40）
const DEFAULT_GOLD = 50;

export const useRoguelikeRun = () => {
    const [run, setRun] = useState<RoguelikeRunState | null>(null);
    // [2026-08-28 对局持久化] 同步最新 run 到 ref，供 savePendingRun 读取（避免闭包过期）
    const runRef = useRef(run);
    runRef.current = run;

    const startRun = useCallback((heroKey: string, starterDeck: string[], difficulty: RogueDifficulty, bonus?: RoguelikeStartBonus) => {
        // [2026-08-12 天启者养成] 等级加成：生命/金币/复活/刷新 + 开局迷宫强化（即时型应用效果、战斗型进 enhancements）+ 装备（战斗构建时挂英雄卡）
        let maxHp = DEFAULT_MAX_HP + (bonus?.maxHp ?? 0);
        let hp = maxHp;
        let gold = DEFAULT_GOLD + (bonus?.gold ?? 0);
        let deck = [...starterDeck];

        const extraEnh = bonus?.extraEnhancements ?? [];
        for (const id of extraEnh) {
            const def = MAZE_ENHANCEMENTS.find(e => e.id === id);
            if (!def || def.effect.type === 'passive') continue;
            switch (def.effect.type) {
                case 'max_hp': {
                    const v = def.effect.value || 0;
                    maxHp += v;
                    hp = Math.min(maxHp, hp + v);
                    break;
                }
                case 'gold':
                    gold += def.effect.value || 0;
                    break;
                case 'add_card': {
                    const pool = Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);
                    const pick = def.effect.cardKey ?? (pool.length ? pool[Math.floor(Math.random() * pool.length)].key : null);
                    if (pick) deck.push(pick);
                    break;
                }
            }
        }

        // [2026-08-29 程拍板] 开局装备挂载：extraEquipments → 起始英雄卡；
        //   grantedSpellEquips → 随机一张初始牌组法术卡；grantedUnitEquips → 随机一个初始牌组非英雄单位（牌组无此类卡则跳过容错）
        const equippedCards: Record<string, string[]> = {};
        if ((bonus?.extraEquipments?.length ?? 0) > 0) equippedCards[heroKey] = [...bonus!.extraEquipments!];
        const grantCardEquips = (list: string[] | undefined, isSpell: boolean) => {
            if (!list?.length) return;
            const pool = deck.filter(k => {
                const c = CARD_DB[k];
                if (!c) return false;
                return isSpell ? c.type.startsWith('spell') : (!c.isChampion && c.type === 'unit');
            });
            if (!pool.length) return;
            for (const eq of list) {
                const pick = pool[Math.floor(Math.random() * pool.length)];
                equippedCards[pick] = [...(equippedCards[pick] ?? []), eq];
            }
        };
        grantCardEquips(bonus?.grantedSpellEquips, true);
        grantCardEquips(bonus?.grantedUnitEquips, false);

        // [2026-09-01 莉莉子 修复] 预分配地图（含节点敌人/强化/BUFF）存 run：
        // 放弃本场战斗返回地图不再重新 generateMapLayout 随机敌人（此前 RogueMapScreen useMemo 随组件重挂载失效）
        const layout = generateMapLayout(difficulty);

        setRun({
            heroKey,
            difficulty,
            layout,
            deck,
            hp,
            maxHp,
            gold,
            enhancements: [...extraEnh], // 等级给的强化都记录（即时型开局已生效；战斗型由 battleEffect 分发）
            act: 1,
            currentNodeId: ROGUE_MAPS[difficulty][0]?.nodes[0]?.id ?? null, // [2026-08-04] 初始定位到第一重起点 [2026-08-28] 按难度取图
            paradoxPoints: 0,
            refreshCount: 1 + (bonus?.refreshCount ?? 0),
            reviveCount: 1 + (bonus?.reviveCount ?? 0),
            defeated: [], // [2026-08-10]
            missed: [],   // [2026-08-10]
            visited: [],  // [2026-08-27] 走过的节点
            status: 'active',
            heroLevel: bonus?.heroLevel,
            equippedCards,
            rarityBonus: bonus?.rarityBonus,
            pendingInvestments: [], // [2026-08-28 事件] 跨节点投资标记
            pendingFightDebuff: null, // [2026-08-28 事件] 未来敌人强化
            startedAt: Date.now(), // [2026-08-29] 对局开始计时（速通时长倍率）
            expFromNodes: 0,       // [2026-08-29] 节点经验累计
            expGrantedNodes: [],   // [2026-08-29] 已发经验节点去重
            armaments: bonus?.armaments,       // [2026-08-29] 开局武装快照
            expRateBonus: bonus?.expRateBonus, // [2026-08-29] 经验效率加成
            passUnlockedEnhancements: bonus?.passUnlockedEnhancements, // [2026-08-29 通行证] 已解锁强化
            equipRarityBonus: bonus?.equipRarityBonus, // [2026-08-29] 装备稀有度加成
            scout: null, // [2026-08-29 休整·探路]
        });
    }, []);

    // [2026-08-29 休整·探路] 派出单位卡探路：暂时移出牌组，2 节点后回归带随机装备
    const startScout = useCallback((cardKey: string) => {
        setRun(prev => {
            if (!prev) return prev;
            return { ...prev, scout: { cardKey, remaining: 2 }, deck: prev.deck.filter(k => k !== cardKey) };
        });
    }, []);

    // [2026-08-29 休整·探路] 移动节点时推进；到 0 回归（卡回牌组 + 随机装备）
    const advanceScout = useCallback((): { returned: boolean; cardKey: string; equipId?: string } | null => {
        const sc = run?.scout;
        if (!sc) return null;
        const remaining = sc.remaining - 1;
        if (remaining > 0) {
            setRun(prev => prev ? { ...prev, scout: { ...prev.scout!, remaining } } : prev);
            return null;
        }
        // 回归：随机佩戴一件装备 + 卡回牌组
        const cardDef = CARD_DB[sc.cardKey];
        const pool = cardDef ? getEquipPoolForCard(cardDef) : [];
        const equipId = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : undefined;
        setRun(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                scout: null,
                deck: [...prev.deck, sc.cardKey],
                equippedCards: equipId ? { ...(prev.equippedCards ?? {}), [sc.cardKey]: [...(prev.equippedCards?.[sc.cardKey] ?? []), equipId] } : prev.equippedCards,
            };
        });
        return { returned: true, cardKey: sc.cardKey, equipId };
    }, [run]);

    const moveTo = useCallback((nodeId: string): { returned: boolean; cardKey: string; equipId?: string } | null => {
        // [2026-08-29 休整·探路] 移动推进探路（到 0 回归带装备）
        const scoutRet = advanceScout();
        setRun(prev => {
            if (!prev) return prev;
            // [2026-08-10] 记录错过：从当前节点移动时，当前节点 next 中未选择的分支 → 永久错过（地图灰色）
            // 用静态布局查 next（generateMapLayout 只改 type，id/next 与静态一致）
            const curNode = ROGUE_MAPS[prev.difficulty].flatMap(a => a.nodes).find(n => n.id === prev.currentNodeId); // [2026-08-28] 按难度取图
            const missed = new Set(prev.missed ?? []);
            curNode?.next.forEach(nid => { if (nid !== nodeId) missed.add(nid); });
            // [2026-08-27] 走过的节点记录：离开当前节点即已走过（地图灰显，不可回退）
            const visited = new Set(prev.visited ?? []);
            if (prev.currentNodeId) visited.add(prev.currentNodeId);
            return { ...prev, currentNodeId: nodeId, missed: [...missed], visited: [...visited] };
        });
        return scoutRet;
    }, [advanceScout]);

    // [2026-08-10] 标记节点已击败（战斗胜利后调用，地图显示红叉）
    const markDefeated = useCallback((nodeId: string) => {
        setRun(prev => {
            if (!prev || prev.defeated?.includes(nodeId)) return prev;
            return { ...prev, defeated: [...(prev.defeated ?? []), nodeId] };
        });
    }, []);

    // 战斗结算：失败 → 死亡；胜利 → 仅推进（HP/金币由奖励流程单独处理）
    const completeBattle = useCallback((win: boolean) => {
        setRun(prev => {
            if (!prev) return prev;
            if (!win) {
                return { ...prev, status: 'dead' as const, paradoxPoints: prev.paradoxPoints + 5 };
            }
            return prev;
        });
    }, []);

    const heal = useCallback((amount: number) => {
        setRun(prev => prev ? { ...prev, hp: Math.min(prev.maxHp, prev.hp + amount) } : prev);
    }, []);

    // [2026-08-11 全局 HP 衔接战斗] 战斗写回：把剩余战斗水晶写回全局 HP（clamp 到 [0, maxHp]，函数式更新读最新 maxHp）
    const setHp = useCallback((hp: number) => {
        setRun(prev => prev ? { ...prev, hp: Math.max(0, Math.min(prev.maxHp, hp)) } : prev);
    }, []);

    const addGold = useCallback((amount: number) => {
        setRun(prev => prev ? { ...prev, gold: prev.gold + amount } : prev);
    }, []);

    const addCard = useCallback((key: string) => {
        setRun(prev => prev ? { ...prev, deck: [...prev.deck, key] } : prev);
    }, []);

    // [2026-09-04 首战英雄招募] 标记首战天启者三选一已结算（pick/skip 后置 true）
    const markHeroRecruited = useCallback(() => {
        setRun(prev => prev ? { ...prev, heroRecruitDone: true } : prev);
    }, []);

    // [2026-08-12 商店经济] 花金币（金币不足返回 false）
    const spendGold = useCallback((amount: number) => {
        if (!run || run.gold < amount) return false;
        setRun(prev => prev ? { ...prev, gold: prev.gold - amount } : prev);
        return true;
    }, [run]);

    // [2026-08-12 商店经济] 消耗一次刷新（refreshCount>0 才扣，返回是否成功）
    const useRefresh = useCallback(() => {
        if (!run || run.refreshCount <= 0) return false;
        setRun(prev => prev ? { ...prev, refreshCount: prev.refreshCount - 1 } : prev);
        return true;
    }, [run]);

    // [2026-08-12 商店经济] 给某张卡挂装备（写 equippedCards[key]，合并去重）
    const addEquippedCard = useCallback((key: string, equipId: string) => {
        setRun(prev => {
            if (!prev) return prev;
            const cur = prev.equippedCards?.[key] ?? [];
            if (cur.includes(equipId)) return prev;
            return { ...prev, equippedCards: { ...(prev.equippedCards ?? {}), [key]: [...cur, equipId] } };
        });
    }, []);

    // [2026-08-12 商店经济] 从牌组移除一张卡（删卡）
    const removeCard = useCallback((key: string) => {
        setRun(prev => {
            if (!prev) return prev;
            const idx = prev.deck.indexOf(key);
            if (idx < 0) return prev;
            const deck = [...prev.deck];
            deck.splice(idx, 1);
            return { ...prev, deck };
        });
    }, []);

    // [2026-08-12 宝箱节点] 复活次数 +n
    const addRevive = useCallback((n: number) => {
        setRun(prev => prev ? { ...prev, reviveCount: prev.reviveCount + n } : prev);
    }, []);

    // [2026-08-12 宝箱节点] 刷新次数 +n
    const addRefresh = useCallback((n: number) => {
        setRun(prev => prev ? { ...prev, refreshCount: prev.refreshCount + n } : prev);
    }, []);

    // [2026-08-12 宝箱节点] 生命上限变化（下限 10），hp 同步 clamp 到 [0, maxHp]
    const adjustMaxHp = useCallback((delta: number) => {
        setRun(prev => {
            if (!prev) return prev;
            const maxHp = Math.max(10, prev.maxHp + delta);
            return { ...prev, maxHp, hp: Math.max(0, Math.min(maxHp, prev.hp)) };
        });
    }, []);

    // [2026-08-05 莉莉子] 迷宫强化：获得强化并即时应用效果
    const applyEnhancement = useCallback((key: string) => {
        setRun(prev => {
            if (!prev) return prev;
            // [2026-08-31 莉莉子 开发者] 兜底全量池：开发者任意选可能选到通行证锁定的强化（基础池已剔除），须同样可应用
            const def = MAZE_ENHANCEMENTS.find(e => e.id === key)
                ?? PLAYER_ENHANCEMENTS.find(b => b.id === key);
            if (!def?.effect || prev.enhancements.includes(key)) return prev;
            let next: RoguelikeRunState = { ...prev, enhancements: [...prev.enhancements, key] };
            switch (def.effect.type) {
                case 'max_hp': {
                    const v = def.effect.value || 0;
                    next = { ...next, maxHp: next.maxHp + v, hp: Math.min(next.maxHp, next.hp + v) };
                    break;
                }
                case 'heal': {
                    const pct = def.effect.value || 0;
                    next = { ...next, hp: Math.min(next.maxHp, next.hp + Math.floor(next.maxHp * pct / 100)) };
                    break;
                }
                case 'gold':
                    next = { ...next, gold: next.gold + (def.effect.value || 0) };
                    break;
                case 'add_card': {
                    const pool = Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);
                    const pick = def.effect.cardKey ?? (pool.length ? pool[Math.floor(Math.random() * pool.length)].key : null);
                    if (pick) next = { ...next, deck: [...next.deck, pick] };
                    break;
                }
                case 'passive':
                    // [2026-08-11] 纯战斗内被动强化（第一批 LOR 移植）：即时无操作，战斗内由 battleEffect 分发
                    break;
            }
            return next;
        });
    }, []);

    // [2026-08-31 莉莉子 开发者] 任意强化选择器：多选叠加应用玩家强化（循环复用 applyEnhancement，自带去重）
    const applyDevEnhancements = useCallback((ids: string[]) => {
        ids.forEach(id => applyEnhancement(id));
    }, [applyEnhancement]);

    // [2026-08-31 莉莉子 开发者] 设置敌方强化注入（开发者在任意强化节点选的敌方强化，注入下一场战斗）
    const setDevEnemyEnhancements = useCallback((ids: string[]) => {
        setRun(prev => prev ? { ...prev, devEnemyEnhancements: ids } : prev);
    }, []);

    // 推进到下一 Act；若已过最后一 Act → 通关
    const advanceAct = useCallback(() => {
        setRun(prev => {
            if (!prev) return prev;
            const nextAct = prev.act + 1;
            if (nextAct > ROGUE_MAPS[prev.difficulty].length) {
                return { ...prev, status: 'won' as const, paradoxPoints: prev.paradoxPoints + 20 };
            }
            // [2026-08-04] 推进后定位到下一重迷宫起点
            const nextStart = ROGUE_MAPS[prev.difficulty][nextAct - 1]?.nodes[0]?.id ?? null; // [2026-08-28] 按难度取图
            return { ...prev, act: nextAct, currentNodeId: nextStart };
        });
    }, []);

    const endRun = useCallback((status: RoguelikeRunStatus) => {
        setRun(prev => prev ? { ...prev, status } : prev);
    }, []);

    const resetRun = useCallback(() => {
        setRun(null);
    }, []);

    // ═══ [2026-08-28 对局持久化] 暂离/继续：把当前对局存 localStorage，可跨刷新恢复 ═══
    const getPendingKey = () => `${STORAGE_KEYS.ROGUE_PENDING_RUN}_${StorageUtils.getOrCreateUserId()}`;

    /** 暂离：保存当前对局（未结算）到 localStorage */
    const savePendingRun = useCallback(() => {
        const cur = runRef.current;
        if (!cur) return;
        StorageUtils.save(getPendingKey(), { run: cur, savedAt: Date.now() });
    }, []);

    /** 恢复：读回未结算对局（有则 setRun 并返回；无则返回 null） */
    const loadPendingRun = useCallback((): RoguelikeRunState | null => {
        const saved = StorageUtils.load<{ run: RoguelikeRunState } | null>(getPendingKey(), null);
        if (saved?.run) { setRun(saved.run); return saved.run; }
        return null;
    }, []);

    /** 结算/开新局：清除未结算对局存档 */
    const clearPendingRun = useCallback(() => {
        StorageUtils.remove(getPendingKey());
    }, []);

    // ═══ [2026-08-28 事件] 跨节点投资 / 未来敌人强化 ═══

    /** 追加投资标记（播种希望 / 托付遗物 / 牺牲祝福） */
    const addInvestment = useCallback((inv: RogueInvestment) => {
        setRun(prev => prev ? { ...prev, pendingInvestments: [...(prev.pendingInvestments ?? []), inv] } : prev);
    }, []);

    /** 取出并消费某类投资标记（返回匹配的列表，供结算点回报） */
    const consumeInvestments = useCallback((kind: RogueInvestment['kind']): RogueInvestment[] => {
        if (!run) return [];
        const list = run.pendingInvestments ?? [];
        const matched = list.filter(i => i.kind === kind);
        if (matched.length === 0) return [];
        setRun(prev => prev ? { ...prev, pendingInvestments: (prev.pendingInvestments ?? []).filter(i => i.kind !== kind) } : prev);
        return matched;
    }, [run]);

    /** 叠加未来敌人强化（饥渴的虚空，可多次叠加场数/加成） */
    const addFightDebuff = useCallback((debuff: { enemyHpBonus: number; fights: number }) => {
        setRun(prev => {
            if (!prev) return prev;
            const cur = prev.pendingFightDebuff;
            return { ...prev, pendingFightDebuff: {
                enemyHpBonus: (cur?.enemyHpBonus ?? 0) + debuff.enemyHpBonus,
                fights: (cur?.fights ?? 0) + debuff.fights,
            } };
        });
    }, []);

    /** 每打一场战斗消耗一层未来强化，返回生效的加成（没有则 null） */
    const consumeFightDebuff = useCallback((): { enemyHpBonus: number } | null => {
        if (!run?.pendingFightDebuff || run.pendingFightDebuff.fights <= 0) return null;
        const { enemyHpBonus, fights } = run.pendingFightDebuff;
        const next = fights - 1;
        setRun(prev => prev ? { ...prev, pendingFightDebuff: next <= 0 ? null : { enemyHpBonus, fights: next } } : prev);
        return { enemyHpBonus };
    }, [run]);

    /** 交出随机一件装备（投资型托付遗物）：从 equippedCards 随机取一件移除，返回装备 id（无装备返回 null） */
    const removeRandomEquipment = useCallback((): string | null => {
        if (!run) return null;
        const eq = run.equippedCards ?? {};
        const all: { cardKey: string; equipId: string }[] = [];
        for (const [cardKey, list] of Object.entries(eq)) {
            for (const equipId of list) all.push({ cardKey, equipId });
        }
        if (all.length === 0) return null;
        const pick = all[Math.floor(Math.random() * all.length)];
        const nextList = (eq[pick.cardKey] ?? []).filter(id => id !== pick.equipId);
        const nextEq = { ...eq };
        if (nextList.length === 0) delete nextEq[pick.cardKey]; else nextEq[pick.cardKey] = nextList;
        setRun(prev => prev ? { ...prev, equippedCards: nextEq } : prev);
        return pick.equipId;
    }, [run]);

    /** [2026-08-29 经验重构] 发放节点经验（按节点去重；已发过返回 false） */
    const grantNodeExp = useCallback((nodeId: string, amount: number): boolean => {
        const cur = runRef.current;
        if (!cur || cur.expGrantedNodes.includes(nodeId)) return false;
        setRun(prev => {
            if (!prev || prev.expGrantedNodes.includes(nodeId)) return prev;
            return { ...prev, expFromNodes: (prev.expFromNodes ?? 0) + amount, expGrantedNodes: [...prev.expGrantedNodes, nodeId] };
        });
        return true;
    }, []);

    /** [2026-08-29 经验重构] 重置对局计时（暂离恢复时排除离线时长，速通计时只算在场时间） */
    const resetStartedAt = useCallback(() => {
        setRun(prev => prev ? { ...prev, startedAt: Date.now() } : prev);
    }, []);

    return { run, startRun, moveTo, completeBattle, heal, setHp, addGold, addCard, markHeroRecruited, applyEnhancement, applyDevEnhancements, setDevEnemyEnhancements, advanceAct, endRun, resetRun, markDefeated, spendGold, useRefresh, addEquippedCard, removeCard, addRevive, addRefresh, adjustMaxHp, addInvestment, consumeInvestments, addFightDebuff, consumeFightDebuff, removeRandomEquipment, grantNodeExp, resetStartedAt, startScout, advanceScout, savePendingRun, loadPendingRun, clearPendingRun };
};
