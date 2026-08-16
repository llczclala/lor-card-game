// ==========================================
// 悖论迷宫 · 整局状态管理
// 管理全局 HP/金币/遗物/牌组/层数/位置/悖论点
// ⚠️ 简化规则（框架阶段）：
//   - 战斗失败 → 死亡结算
//   - 战斗胜利 → 推进
//   - 全局 HP 仅作展示（战斗内水晶 HP 衔接是细节，后续完善）
// ==========================================
import { useCallback, useState } from 'react';
import { ROGUE_MAP_LAYOUT } from '../data/roguelike/mapLayout';
import { MAZE_ENHANCEMENTS } from '../data/roguelike/enhancements';
import type { RogueDifficulty } from '../data/roguelike/difficulties'; // [2026-08-07 难度系统]
import { CARD_DB } from '../data/cards';

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
    status: RoguelikeRunStatus;
    heroLevel?: number;       // [2026-08-12 天启者养成] 开局英雄等级（展示用）
    equippedCards?: Record<string, string[]>; // [2026-08-12 商店经济] 带装备的卡：卡 key → 装备 id 列表（英雄卡 + 商店购买，战斗构建时 attachEquipment 应用）
    rarityBonus?: { rare: number; epic: number; legendary: number }; // [2026-08-12 天启者养成] 高稀有度概率加成（强化/装备抽选用）
}

// [2026-08-12 天启者养成] startRun 可选的等级加成（由 useHeroProgression.getHeroLevelBonus 提供，数值为"加成量"）
export interface RoguelikeStartBonus {
    maxHp?: number;              // 生命上限加成（基础 30 之上）
    gold?: number;               // 金币加成（基础 50 之上）
    reviveCount?: number;        // 复活次数加成（基础 1 之上）
    refreshCount?: number;       // 刷新次数加成（基础 1 之上）
    extraEnhancements?: string[]; // 开局自动获得的迷宫强化 id
    extraEquipments?: string[];   // 开局自动挂载的装备 id
    heroLevel?: number;          // 开局英雄等级
    rarityBonus?: { rare: number; epic: number; legendary: number }; // 高稀有度概率加成（%）
}

const DEFAULT_MAX_HP = 30;
const DEFAULT_GOLD = 50;

export const useRoguelikeRun = () => {
    const [run, setRun] = useState<RoguelikeRunState | null>(null);

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

        setRun({
            heroKey,
            difficulty,
            deck,
            hp,
            maxHp,
            gold,
            enhancements: [...extraEnh], // 等级给的强化都记录（即时型开局已生效；战斗型由 battleEffect 分发）
            act: 1,
            currentNodeId: ROGUE_MAP_LAYOUT[0]?.nodes[0]?.id ?? null, // [2026-08-04] 初始定位到第一重起点
            paradoxPoints: 0,
            refreshCount: 1 + (bonus?.refreshCount ?? 0),
            reviveCount: 1 + (bonus?.reviveCount ?? 0),
            defeated: [], // [2026-08-10]
            missed: [],   // [2026-08-10]
            status: 'active',
            heroLevel: bonus?.heroLevel,
            equippedCards: (bonus?.extraEquipments?.length ?? 0) > 0 ? { [heroKey]: [...bonus!.extraEquipments!] } : {},
            rarityBonus: bonus?.rarityBonus,
        });
    }, []);

    const moveTo = useCallback((nodeId: string) => {
        setRun(prev => {
            if (!prev) return prev;
            // [2026-08-10] 记录错过：从当前节点移动时，当前节点 next 中未选择的分支 → 永久错过（地图灰色）
            // 用静态布局查 next（generateMapLayout 只改 type，id/next 与静态一致）
            const curNode = ROGUE_MAP_LAYOUT.flatMap(a => a.nodes).find(n => n.id === prev.currentNodeId);
            const missed = new Set(prev.missed ?? []);
            curNode?.next.forEach(nid => { if (nid !== nodeId) missed.add(nid); });
            return { ...prev, currentNodeId: nodeId, missed: [...missed] };
        });
    }, []);

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
            const def = MAZE_ENHANCEMENTS.find(e => e.id === key);
            if (!def || prev.enhancements.includes(key)) return prev;
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

    // 推进到下一 Act；若已过最后一 Act → 通关
    const advanceAct = useCallback(() => {
        setRun(prev => {
            if (!prev) return prev;
            const nextAct = prev.act + 1;
            if (nextAct > ROGUE_MAP_LAYOUT.length) {
                return { ...prev, status: 'won' as const, paradoxPoints: prev.paradoxPoints + 20 };
            }
            // [2026-08-04] 推进后定位到下一重迷宫起点
            const nextStart = ROGUE_MAP_LAYOUT[nextAct - 1]?.nodes[0]?.id ?? null;
            return { ...prev, act: nextAct, currentNodeId: nextStart };
        });
    }, []);

    const endRun = useCallback((status: RoguelikeRunStatus) => {
        setRun(prev => prev ? { ...prev, status } : prev);
    }, []);

    const resetRun = useCallback(() => {
        setRun(null);
    }, []);

    return { run, startRun, moveTo, completeBattle, heal, setHp, addGold, addCard, applyEnhancement, advanceAct, endRun, resetRun, markDefeated, spendGold, useRefresh, addEquippedCard, removeCard, addRevive, addRefresh, adjustMaxHp };
};
