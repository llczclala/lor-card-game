// ==========================================
// 悖论迷宫 · 地图节点布局
// 背景：src/image/map/map_zero.png（3168×1344 横向长画卷）
// [2026-08-04 莉莉子] 整局只做 1 重迷宫；结构（两轮循环 + BOSS）：
//   战旗(start) → 强化(enhance) → [战斗×2] → [事件/商店/宝箱×3] → [战斗×2] → 休息 → 精英
//   → 强化(enhance) → [战斗×2] → [事件/商店/宝箱×3] → [战斗×2] → 休息 → 精英 → BOSS
// ⚠️ 坐标为占位，细节阶段用「肉鸽地图编辑器」精调
// ==========================================

import type { RogueDifficulty } from './difficulties'; // [2026-08-07 难度系统]
import { ENEMY_ARCHETYPES } from '../enemies/archetypes'; // [2026-08-10] 预分配敌人流派
import { CARD_DB } from '../cards'; // [2026-08-10] 敌人头像从流派池子选代表卡
import { rollEnemyBuffs } from './buffs'; // [2026-08-11] 预分配敌人实际携带的迷宫强化

export type RogueNodeType = 'start' | 'enhance' | 'battle' | 'elite' | 'boss' | 'rest' | 'shop' | 'event' | 'treasure';

export interface RogueNode {
    id: string;
    type: RogueNodeType;
    x: number; // 地图原始坐标 (0~3168)
    y: number; // 地图原始坐标 (0~1344)
    size?: number; // [2026-08-04] 节点尺寸（px），编辑器可调
    next: string[]; // 可达的下一节点 id（真实路径关系）
    enemyKey?: string;         // [2026-08-10] 战斗节点预分配敌人（英雄卡 key，用于地图头像）
    enemyArchetypeId?: string; // [2026-08-10] 战斗节点预分配敌人流派 id（用于战斗生成）
    enemyBuffs?: string[];     // [2026-08-11] 预分配该敌人实际携带的迷宫强化 id（情报 + 未来战斗）
}

export interface RogueAct {
    index: number; // 1
    name: string;
    nodes: RogueNode[];
}

// 每重迷宫的列 x 基准
const ACT1_COLS = [100, 210, 320, 430, 540, 650, 760, 870, 980, 1090, 1200, 1310, 1420, 1530];
const Y_SINGLE = 672;       // 单节点（战旗/强化/休息/精英/Boss）
const Y_PAIR = [450, 894];   // 两路战斗
const Y_TRIPLE = [330, 672, 1014]; // 三选一（事件/商店/宝箱）

// [2026-08-11 迷宫深度] 节点列位置 = 该节点 x 最接近的列下标（地图被 x 分 14 列，越靠后越深）
export const nodeColumnIndex = (n: RogueNode, cols: number[] = ACT1_COLS): number => {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < cols.length; i++) {
        const d = Math.abs(cols[i] - n.x);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
};

// [2026-08-11 迷宫深度] 列下标 → 深度比例 depthFrac ∈ [0,1]（0=起点，1=终点/Boss）
export const nodeDepthFrac = (colIndex: number, totalCols: number = ACT1_COLS.length): number =>
    totalCols <= 1 ? 0 : Math.max(0, Math.min(1, colIndex / (totalCols - 1)));

export const ROGUE_MAP_LAYOUT: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫',
        nodes: [
            { id: 'a1_start', type: 'start', x: ACT1_COLS[0], y: Y_SINGLE, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: ACT1_COLS[1], y: Y_SINGLE, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: ACT1_COLS[2], y: Y_PAIR[0], next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: ACT1_COLS[2], y: Y_PAIR[1], next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: ACT1_COLS[3], y: Y_TRIPLE[0], next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: ACT1_COLS[3], y: Y_TRIPLE[1], next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: ACT1_COLS[3], y: Y_TRIPLE[2], next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'battle', x: ACT1_COLS[4], y: Y_PAIR[0], next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: ACT1_COLS[4], y: Y_PAIR[1], next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: ACT1_COLS[5], y: Y_SINGLE, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: ACT1_COLS[6], y: Y_SINGLE, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: ACT1_COLS[7], y: Y_SINGLE, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: ACT1_COLS[8], y: Y_PAIR[0], next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: ACT1_COLS[8], y: Y_PAIR[1], next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: ACT1_COLS[9], y: Y_TRIPLE[0], next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: ACT1_COLS[9], y: Y_TRIPLE[1], next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: ACT1_COLS[9], y: Y_TRIPLE[2], next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'battle', x: ACT1_COLS[10], y: Y_PAIR[0], next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'battle', x: ACT1_COLS[10], y: Y_PAIR[1], next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: ACT1_COLS[11], y: Y_SINGLE, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'elite', x: ACT1_COLS[12], y: Y_SINGLE, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'boss', x: ACT1_COLS[13], y: Y_SINGLE, next: [] },
        ],
    },
];

// [2026-08-10 敌人头像] 从流派自身池子（coreCards + preferredPool）随机选单位/法术卡，
// 排除天启者英雄（敌人头像/预览卡面不该是玩家英雄）。战斗仍用 enemyArchetypeId 生成完整敌人。
// [2026-08-11 节点预览] 提升到模块作用域并导出，供 NodePreviewPanel 兜底敌人卡面复用。
export const pickEnemyAvatarKey = (archetypeId: string): string => {
    const arch = ENEMY_ARCHETYPES[archetypeId];
    const raw = [
        ...(Array.isArray(arch?.coreCards) ? arch.coreCards : []),
        ...(arch?.preferredPool ?? []),
    ];
    const keys = raw
        .map((c: any) => (typeof c === 'string' ? c : c?.key))
        .filter((k: unknown): k is string => typeof k === 'string' && !!k);
    const valid = keys.filter(k => {
        const card = CARD_DB[k];
        return card && !card.isChampion; // 排除天启者英雄
    });
    if (valid.length) return valid[Math.floor(Math.random() * valid.length)];
    return arch?.champion || 'lyfe'; // 极端兜底：流派池子无有效卡才用 champion
};

// [2026-08-07 难度地图构造] 按难度微调节点类型：机密/绝密把部分 battle 升级成 elite（精英更多）
// 普通 = 标准布局原样；后续多 Act 扩展时在此叠加差异
export const generateMapLayout = (difficulty: RogueDifficulty): RogueAct[] => {
    const layout = ROGUE_MAP_LAYOUT.map(act => ({
        ...act,
        nodes: act.nodes.map(n => ({ ...n })),
    }));
    // [2026-08-10 预分配敌人] 为战斗/精英/Boss 节点随机分配敌人流派，
    // 保证地图上的敌人头像与实际战斗对手一致（RogueMapScreen 按 difficulty useMemo 生成一次，稳定不重随）
    const archetypeIds = Object.keys(ENEMY_ARCHETYPES);
    layout.forEach(act => {
        act.nodes.forEach(n => {
            if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
                const id = archetypeIds[Math.floor(Math.random() * archetypeIds.length)];
                n.enemyArchetypeId = id;
                n.enemyKey = pickEnemyAvatarKey(id);
                // [2026-08-11 敌方迷宫强化] 预分配实际携带：按节点深度从流派配置库随机抽（整局稳定，预览/未来战斗一致）
                n.enemyBuffs = rollEnemyBuffs(ENEMY_ARCHETYPES[id]?.rogueBuffs, nodeDepthFrac(nodeColumnIndex(n)));
            }
        });
    });
    if (difficulty === 'normal') return layout;

    const eliteUpgradeIds: Record<RogueDifficulty, string[]> = {
        normal: [],
        secret: ['b3', 'b7'],
        topsecret: ['b3', 'b4', 'b7', 'b8'],
    };
    const targets = eliteUpgradeIds[difficulty] || [];
    layout.forEach(act => {
        act.nodes.forEach(n => {
            if (targets.some(t => n.id.includes(t))) {
                n.type = 'elite';
            }
        });
    });
    return layout;
};

// 地图原始尺寸常量（画布 / 背景图共用）
export const MAP_WIDTH = 3168;
export const MAP_HEIGHT = 1344;
