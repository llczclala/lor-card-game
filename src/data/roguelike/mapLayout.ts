// ==========================================
// 悖论迷宫 · 地图节点布局
// 背景：src/image/map/map_zero.png（3168×1344 横向长画卷）
// [2026-08-04 莉莉子] 整局只做 1 重迷宫；结构（两轮循环 + BOSS）：
//   战旗(start) → 强化(enhance) → [战斗×2] → [事件/商店/宝箱×3] → [战斗×2] → 休息 → 精英
//   → 强化(enhance) → [战斗×2] → [事件/商店/宝箱×3] → [战斗×2] → 休息 → 精英 → BOSS
// ⚠️ 坐标为占位，细节阶段用「肉鸽地图编辑器」精调
// [2026-08-28 莉莉子] 三张独立难度地图（普通/机密/绝密）：ROGUE_MAP_NORMAL / SECRET / TOPSECRET
//   分别编辑保存（「肉鸽地图编辑器」按难度导出覆盖对应常量）；ROGUE_MAPS 供运行时按难度取图。
//   机密/绝密初始以普通为底，按原自动升级规则预置精英（b3/b7、b3/b4/b7/b8），此后由编辑器直接编辑
// ==========================================

import type { RogueDifficulty } from './difficulties'; // [2026-08-07 难度系统]
import { ENEMY_ARCHETYPES } from '../enemies/archetypes'; // [2026-08-10] 预分配敌人流派
import { CARD_DB } from '../cards'; // [2026-08-10] 敌人头像从流派池子选代表卡
import { rollEnemyBuffs } from './buffs'; // [2026-08-11] 预分配敌人实际携带的迷宫强化

export type RogueNodeType = 'start' | 'enhance' | 'battle' | 'elite' | 'boss' | 'rest' | 'shop' | 'event' | 'treasure' | 'random';

/**
 * [2026-10-09 莉莉子 · 随机节点] 「未知节点」可以掷出的**真身白名单**（程拍板：只掷内容型）。
 * 唯一真源 —— 运行时预掷（`generateMapLayout`）与编辑器提示都读这里，禁止各写一份。
 * 刻意排除：`elite` / `boss`（程明确要求不掷硬仗）、`rest` / `enhance`（软收益＝白送，同属"不该随机给"）、`start`。
 */
export const RANDOM_NODE_POOL: RogueNodeType[] = ['battle', 'event', 'shop', 'treasure'];

/** [2026-10-09] 随机节点在地图/预览面板上的占位文案（程指定：名称３个问号、描述４个问号） */
export const RANDOM_NODE_NAME = '？？？';
export const RANDOM_NODE_DESC = '？？？？';

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
    dialogueBg?: string;       // [2026-08-27] 进入面板背景图 key（'1'~'8'，编辑器可指定；未指定进入时随机）
    /**
     * [2026-10-09 莉莉子 · 事件指定] 该事件节点**固定**使用的事件 id（缺省＝进入时随机抽取）。
     * 指定则**必出**（绕开「最近 8 个不重复」去重，见 `RogueMapScreen` 事件抽取处）。
     */
    eventId?: string;
    /**
     * [2026-10-09 莉莉子 · 随机节点] **开局预掷标记**：仅运行时产生，**不进源码常量**。
     * `type: 'random'` 的节点在 `generateMapLayout` 里被就地改写成真身，并打上本标记 ⇒ UI 据此掩码。
     * ⚠️ 为什么改写真身而不是保留 `'random'`：运行时按 `type` 分流的地方很多（进节点/节点渲染/预览面板），
     *    保留假类型等于要求每一处都改读"有效类型"，漏一处就是"节点进去了但什么都没发生"。
     */
    wasRandom?: boolean;
}

/** [2026-10-09 莉莉子 · 图池] 一张地图 = act 数组（当前惯例：只放 1 个 act，`index: 1`） */
export type RogueMap = RogueAct[];

export interface RogueAct {
    index: number; // 1
    name: string;
    nodes: RogueNode[];
}

// 每重迷宫的列 x 基准
const ACT1_COLS = [100, 210, 320, 430, 540, 650, 760, 870, 980, 1090, 1200, 1310, 1420, 1530];

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

// [2026-08-11 迷宫深度] ⚠️ 2026-08-28 废弃：此函数按 x 坐标列分桶算深度，与"迷宫路径深度"语义不符，已不再用于强化/生命预分配。
// 保留导出仅兼容历史引用（nodeColumnIndex 仍被 RogueMapScreen 用于推演开场视觉排序——仅视觉，非深度）。
export const nodeDepthFrac = (colIndex: number, totalCols: number = ACT1_COLS.length): number =>
    totalCols <= 1 ? 0 : Math.max(0, Math.min(1, colIndex / (totalCols - 1)));

// [2026-08-28 莉莉子 修复] 迷宫深度 = 节点在整条迷宫路径中的位置（BFS 从起点到该节点的层数 / 总层数）。
// 程定义：从起点一路走到 Boss 共 N 层，第一个节点深度 1/N、Boss 深度 1。
// 同一岔路的节点（如 b1/b2）同层同深度——深度描述"从入口走了多远"，与 x 坐标/列分桶无关。
// 返回 Map<nodeId, frac>（0=起点，1=Boss/最深）。
export const computeGraphDepth = (layout: RogueAct[]): Map<string, number> => {
    const all = layout.flatMap(act => act.nodes);
    const byId = new Map(all.map(n => [n.id, n]));
    const layer = new Map<string, number>();
    const queue: string[] = [];
    for (const n of all) {
        if (n.type === 'start') { layer.set(n.id, 0); queue.push(n.id); }
    }
    let maxLayer = 0;
    while (queue.length) {
        const id = queue.shift()!;
        const cur = byId.get(id);
        if (!cur) continue;
        const l = layer.get(id) ?? 0;
        for (const nid of cur.next) {
            if (layer.has(nid)) continue;
            layer.set(nid, l + 1);
            maxLayer = Math.max(maxLayer, l + 1);
            queue.push(nid);
        }
    }
    const map = new Map<string, number>();
    for (const n of all) {
        map.set(n.id, maxLayer > 0 ? (layer.get(n.id) ?? 0) / maxLayer : 0);
    }
    return map;
};

// [2026-09-15 莉莉子 修复] 战斗进度深度：只沿「战斗节点」推进，跳过 start/enhance/event/shop/treasure/rest。
// 程定义：玩家一局实际打几场就是几层——普通图 b1/b2 第 1 战 · b3/b4 第 2 战 · Boss 第 3 战（岔路二选一算同一场）。
// frac = 战斗序号 / 最大战斗序号（第一战 0，最深战斗节点 1）；同岔路同深度。
// 用途：敌人强化数量 / 生命强化判定。⚠️ 经验系统仍用 computeGraphDepth 的「全节点路径深度」，二者口径不同。
export const computeCombatDepth = (layout: RogueAct[]): Map<string, number> => {
    const all = layout.flatMap(act => act.nodes);
    const byId = new Map(all.map(n => [n.id, n]));
    const isCombat = (t: RogueNodeType) => t === 'battle' || t === 'elite' || t === 'boss';

    // ① BFS 层号：地图是无环 DAG，边必由低层指向高层，故层号序即拓扑序
    const layer = new Map<string, number>();
    const queue: string[] = [];
    for (const n of all) {
        if (n.type === 'start') { layer.set(n.id, 0); queue.push(n.id); }
    }
    while (queue.length) {
        const id = queue.shift()!;
        const cur = byId.get(id);
        if (!cur) continue;
        const l = layer.get(id) ?? 0;
        for (const nid of cur.next) {
            if (layer.has(nid)) continue;
            layer.set(nid, l + 1);
            queue.push(nid);
        }
    }

    // ② 按层升序 DP：战斗计数 = max over 前驱(前驱计数 + 前驱是否战斗节点)
    const ordered = [...all].sort((a, b) => (layer.get(a.id) ?? 0) - (layer.get(b.id) ?? 0));
    const count = new Map<string, number>();
    for (const n of ordered) {
        if (n.type === 'start' || !layer.has(n.id)) { count.set(n.id, 0); continue; }
        let best = 0;
        for (const p of all) {
            if (!p.next.includes(n.id)) continue; // 前驱 = 指向当前节点的节点
            best = Math.max(best, (count.get(p.id) ?? 0) + (isCombat(p.type) ? 1 : 0));
        }
        count.set(n.id, best);
    }

    // ③ 归一化：以最深战斗节点的计数为分母（第一战 0，最深战斗节点 1）
    let maxCount = 0;
    for (const n of all) {
        if (isCombat(n.type)) maxCount = Math.max(maxCount, count.get(n.id) ?? 0);
    }
    const map = new Map<string, number>();
    for (const n of all) {
        map.set(n.id, maxCount > 0 ? (count.get(n.id) ?? 0) / maxCount : 0);
    }
    return map;
};

// ===== NORMAL 难度 · 共 4 张地图（肉鸽地图编辑器导出） =====

export const ROGUE_MAP_NORMAL: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫',
        nodes: [
            { id: 'a1_start', type: 'start', x: 388, y: 1214, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 548, y: 1014, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 832, y: 744, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 954, y: 1200, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 1401, y: 759, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 1405, y: 893, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 1658, y: 1168, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'battle', x: 1815, y: 787, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: 2063, y: 981, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 2194, y: 789, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'boss', x: 2440, y: 694, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_NORMAL_2: RogueAct[] = [
    {
        index: 1,
        name: '我们这是要去哪？',
        nodes: [
            { id: 'a1_start', type: 'start', x: 411, y: 930, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'random', x: 631, y: 939, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'random', x: 682, y: 682, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'random', x: 854, y: 1263, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'random', x: 989, y: 603, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'random', x: 1060, y: 997, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'random', x: 1237, y: 1266, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'random', x: 1429, y: 716, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'random', x: 1637, y: 1179, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'boss', x: 1797, y: 847, next: [] },
        ],
    },
];

export const ROGUE_MAP_NORMAL_3: RogueAct[] = [
    {
        index: 1,
        name: '战斗',
        nodes: [
            { id: 'a1_start', type: 'start', x: 1062, y: 954, next: ['a1_enh1', 'a1_b1'] },
            { id: 'a1_enh1', type: 'enhance', x: 877, y: 971, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 945, y: 765, next: ['a1_e1'] },
            { id: 'a1_b2', type: 'event', x: 933, y: 1252, next: ['a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'battle', x: 1343, y: 560, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'treasure', x: 1412, y: 885, next: ['a1_b3'] },
            { id: 'a1_e3', type: 'battle', x: 1464, y: 1190, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'elite', x: 1845, y: 710, next: ['a1_rest1', 'a1_elite1'] },
            { id: 'a1_b4', type: 'battle', x: 2063, y: 981, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 2160, y: 843, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'boss', x: 2440, y: 694, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_NORMAL_4: RogueAct[] = [
    {
        index: 1,
        name: '战斗爽',
        nodes: [
            { id: 'a1_start', type: 'start', x: 430, y: 625, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 532, y: 785, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 655, y: 1037, next: ['a1_e1', 'a1_e3'] },
            { id: 'a1_b2', type: 'elite', x: 802, y: 571, next: ['a1_e2'] },
            { id: 'a1_e1', type: 'battle', x: 1016, y: 913, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'enhance', x: 1253, y: 592, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'battle', x: 928, y: 1189, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'elite', x: 1559, y: 731, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: 1513, y: 1130, next: ['a1_elite1'] },
            { id: 'a1_rest1', type: 'enhance', x: 1753, y: 825, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'boss', x: 2040, y: 904, size: 76, next: [] },
        ],
    },
];


// ===== SECRET 难度 · 共 5 张地图（肉鸽地图编辑器导出） =====

export const ROGUE_MAP_SECRET: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫',
        nodes: [
            { id: 'a1_start', type: 'start', x: 547, y: 1296, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 473, y: 1142, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 334, y: 933, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 748, y: 986, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 449, y: 724, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 696, y: 631, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 908, y: 865, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'battle', x: 1042, y: 628, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: 1186, y: 814, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1446, y: 685, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1589, y: 571, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1703, y: 525, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1885, y: 485, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1788, y: 648, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 2215, y: 515, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1957, y: 841, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 2074, y: 627, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'battle', x: 2413, y: 625, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'battle', x: 2379, y: 861, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2559, y: 620, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2671, y: 530, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_SECRET_2: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫1',
        nodes: [
            { id: 'a1_start', type: 'start', x: 864, y: 1289, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 702, y: 1210, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 546, y: 1115, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 821, y: 1045, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 396, y: 830, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'event', x: 648, y: 862, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'event', x: 881, y: 927, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'battle', x: 752, y: 524, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: 950, y: 760, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1102, y: 655, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1321, y: 594, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1541, y: 560, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1668, y: 419, next: ['a1_e4', 'a1_e5'] },
            { id: 'a1_b6', type: 'battle', x: 1623, y: 848, next: ['a1_e4', 'a1_e5'] },
            { id: 'a1_e4', type: 'event', x: 1945, y: 473, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'event', x: 1901, y: 884, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'battle', x: 2158, y: 528, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'battle', x: 2149, y: 914, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2299, y: 713, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2497, y: 658, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_SECRET_3: RogueAct[] = [
    {
        index: 1,
        name: '我们这是要去哪？',
        nodes: [
            { id: 'a1_start', type: 'start', x: 1082, y: 1314, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 920, y: 1235, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'random', x: 764, y: 1140, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'random', x: 1039, y: 1070, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'random', x: 614, y: 855, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'random', x: 866, y: 887, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'random', x: 1099, y: 952, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'random', x: 1047, y: 628, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'random', x: 1142, y: 798, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1446, y: 685, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1589, y: 571, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1703, y: 525, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'random', x: 1892, y: 558, next: ['a1_e4', 'a1_e5'] },
            { id: 'a1_b6', type: 'random', x: 1758, y: 718, next: ['a1_e4', 'a1_e5'] },
            { id: 'a1_e4', type: 'random', x: 2222, y: 588, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'random', x: 1964, y: 914, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'random', x: 2420, y: 698, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'random', x: 2386, y: 934, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2566, y: 693, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2678, y: 603, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_SECRET_4: RogueAct[] = [
    {
        index: 1,
        name: '大赛召开',
        nodes: [
            { id: 'a1_start', type: 'start', x: 281, y: 1189, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 545, y: 1052, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 484, y: 818, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 683, y: 1001, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 798, y: 765, next: ['a1_b3'] },
            { id: 'a1_e2', type: 'shop', x: 696, y: 631, next: ['a1_b3'] },
            { id: 'a1_e3', type: 'treasure', x: 908, y: 865, next: ['a1_b3'] },
            { id: 'a1_b3', type: 'battle', x: 1042, y: 628, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1446, y: 685, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1589, y: 570, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1703, y: 525, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1885, y: 485, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1788, y: 648, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 2215, y: 515, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1957, y: 841, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 2074, y: 627, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'event', x: 2413, y: 624, eventId: 'ev_valkyrie_arena', next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'event', x: 2379, y: 861, eventId: 'ev_valkyrie_arena', next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2559, y: 620, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2671, y: 530, size: 76, next: [] },
        ],
    },
];

export const ROGUE_MAP_SECRET_5: RogueAct[] = [
    {
        index: 1,
        name: '更进一步',
        nodes: [
            { id: 'a1_enh1', type: 'enhance', x: 473, y: 1142, next: ['a1_b1', 'a1_b2', 'node_1791596489734'] },
            { id: 'a1_b1', type: 'battle', x: 334, y: 933, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 748, y: 986, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 449, y: 724, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 696, y: 631, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 908, y: 865, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'battle', x: 1042, y: 628, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'battle', x: 1186, y: 814, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1446, y: 685, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1589, y: 571, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1703, y: 525, next: ['a1_b5', 'a1_b6', 'node_1791596438914'] },
            { id: 'a1_b5', type: 'battle', x: 1885, y: 485, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1788, y: 648, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 2215, y: 515, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1957, y: 841, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 2074, y: 627, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'battle', x: 2413, y: 625, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'battle', x: 2379, y: 861, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2559, y: 620, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2671, y: 530, size: 76, next: [] },
            { id: 'node_1791596438914', type: 'elite', x: 2050, y: 281, size: 89, next: ['node_1791596464246'] },
            { id: 'node_1791596464246', type: 'enhance', x: 2310, y: 323, size: 44, next: ['a1_rest2'] },
            { id: 'node_1791596489734', type: 'elite', x: 990, y: 1146, size: 44, next: ['node_1791596502977'] },
            { id: 'node_1791596502977', type: 'enhance', x: 1275, y: 1032, size: 44, next: ['a1_rest1'] },
        ],
    },
];

// ── 图池（把本难度这一行替换进 mapLayout.ts 的 ROGUE_MAPS）──
// secret: [ROGUE_MAP_SECRET, ROGUE_MAP_SECRET_2, ROGUE_MAP_SECRET_3, ROGUE_MAP_SECRET_4, ROGUE_MAP_SECRET_5],


// ===== TOPSECRET 难度 · 共 5 张地图（肉鸽地图编辑器导出） =====

export const ROGUE_MAP_TOPSECRET: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫',
        nodes: [
            { id: 'a1_start', type: 'start', x: 2688, y: 524, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 2581, y: 604, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 2439, y: 690, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 2437, y: 939, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 2225, y: 733, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 2172, y: 561, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 2143, y: 869, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'elite', x: 1798, y: 683, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'elite', x: 1985, y: 552, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1827, y: 551, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1708, y: 505, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1547, y: 524, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1413, y: 718, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1317, y: 587, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 1062, y: 604, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1377, y: 872, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 1221, y: 725, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'elite', x: 1204, y: 967, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'elite', x: 955, y: 849, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 1078, y: 1101, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'elite', x: 1261, y: 1142, size: 76, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'elite', x: 1427, y: 1163, size: 75, next: ['node_1788510549750'] },
            { id: 'node_1788510549750', type: 'boss', x: 1677, y: 1191, size: 100, next: [] },
        ],
    },
];

export const ROGUE_MAP_TOPSECRET_2: RogueAct[] = [
    {
        index: 1,
        name: '更近一步',
        nodes: [
            { id: 'a1_start', type: 'start', x: 2061, y: 238, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 2196, y: 410, next: ['a1_b1', 'a1_b2', 'node_1791596725294'] },
            { id: 'a1_b1', type: 'battle', x: 2272, y: 510, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 2571, y: 514, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 2387, y: 709, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 2531, y: 758, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 2165, y: 665, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'elite', x: 2171, y: 1037, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'elite', x: 2121, y: 801, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1944, y: 917, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1752, y: 759, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1660, y: 703, next: ['a1_b5', 'a1_b6', 'node_1791596854207'] },
            { id: 'a1_b5', type: 'battle', x: 1550, y: 633, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1469, y: 468, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 1214, y: 485, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1529, y: 753, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 1373, y: 606, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'elite', x: 1258, y: 852, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'elite', x: 1067, y: 672, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 961, y: 832, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'elite', x: 785, y: 902, size: 76, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'elite', x: 598, y: 1042, size: 75, next: ['node_1788510549750'] },
            { id: 'node_1788510549750', type: 'boss', x: 458, y: 1222, size: 100, next: [] },
            { id: 'node_1791596725294', type: 'elite', x: 2100, y: 485, size: 44, next: ['node_1791596751273'] },
            { id: 'node_1791596751273', type: 'enhance', x: 2006, y: 533, size: 73, next: ['node_1791596783137'] },
            { id: 'node_1791596782981', type: 'enhance', x: 1910, y: 772, size: 65, next: ['a1_rest1'] },
            { id: 'node_1791596783137', type: 'elite', x: 1920, y: 637, size: 73, next: ['node_1791596782981'] },
            { id: 'node_1791596853010', type: 'enhance', x: 1074, y: 1086, size: 72, next: ['a1_rest2'] },
            { id: 'node_1791596853426', type: 'elite', x: 1247, y: 1030, size: 87, next: ['node_1791596853010'] },
            { id: 'node_1791596853939', type: 'enhance', x: 1390, y: 994, size: 81, next: ['node_1791596853426'] },
            { id: 'node_1791596854207', type: 'elite', x: 1552, y: 921, size: 81, next: ['node_1791596853939'] },
        ],
    },
];

export const ROGUE_MAP_TOPSECRET_3: RogueAct[] = [
    {
        index: 1,
        name: '我们这是要去哪？',
        nodes: [
            { id: 'a1_start', type: 'start', x: 2688, y: 524, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 2581, y: 604, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'random', x: 2439, y: 689, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'random', x: 2437, y: 940, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'random', x: 2225, y: 733, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'random', x: 2172, y: 561, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'random', x: 2143, y: 869, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'random', x: 1807, y: 682, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'random', x: 1985, y: 552, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1827, y: 551, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'random', x: 1708, y: 505, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1547, y: 524, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'random', x: 1413, y: 717, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'random', x: 1317, y: 587, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'random', x: 1062, y: 604, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'random', x: 1377, y: 872, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'random', x: 1224, y: 725, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'random', x: 1204, y: 967, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'random', x: 955, y: 849, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 1078, y: 1101, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'random', x: 1261, y: 1142, size: 76, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'random', x: 1427, y: 1163, size: 75, next: ['node_1788510549750'] },
            { id: 'node_1788510549750', type: 'boss', x: 1677, y: 1191, size: 100, next: [] },
        ],
    },
];

export const ROGUE_MAP_TOPSECRET_4: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫好多事件',
        nodes: [
            { id: 'a1_start', type: 'start', x: 2688, y: 524, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 2581, y: 604, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 2439, y: 690, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 2437, y: 939, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'event', x: 2225, y: 733, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'event', x: 2172, y: 560, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'event', x: 2144, y: 868, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'elite', x: 1798, y: 683, next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'elite', x: 1985, y: 552, next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1827, y: 551, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1689, y: 460, size: 76, next: ['a1_enh2'] },
            { id: 'a1_enh2', type: 'enhance', x: 1547, y: 524, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1413, y: 718, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1317, y: 587, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 1062, y: 604, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'event', x: 1377, y: 872, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'event', x: 1221, y: 725, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'elite', x: 1204, y: 967, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'elite', x: 955, y: 849, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 1035, y: 1034, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'elite', x: 907, y: 1161, size: 76, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'elite', x: 686, y: 1176, size: 75, next: ['node_1788510549750'] },
            { id: 'node_1788510549750', type: 'boss', x: 415, y: 1231, size: 100, next: [] },
        ],
    },
];

export const ROGUE_MAP_TOPSECRET_5: RogueAct[] = [
    {
        index: 1,
        name: '大赛',
        nodes: [
            { id: 'a1_start', type: 'start', x: 2688, y: 524, next: ['a1_enh1'] },
            { id: 'a1_enh1', type: 'enhance', x: 2581, y: 604, next: ['a1_b1', 'a1_b2'] },
            { id: 'a1_b1', type: 'battle', x: 2439, y: 690, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_b2', type: 'battle', x: 2437, y: 939, next: ['a1_e1', 'a1_e2', 'a1_e3'] },
            { id: 'a1_e1', type: 'treasure', x: 2193, y: 699, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e2', type: 'shop', x: 2172, y: 561, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_e3', type: 'treasure', x: 2060, y: 856, next: ['a1_b3', 'a1_b4'] },
            { id: 'a1_b3', type: 'event', x: 1798, y: 683, eventId: 'ev_valkyrie_arena', next: ['a1_rest1'] },
            { id: 'a1_b4', type: 'event', x: 1985, y: 551, eventId: 'ev_valkyrie_arena', next: ['a1_rest1'] },
            { id: 'a1_rest1', type: 'rest', x: 1827, y: 551, next: ['a1_elite1'] },
            { id: 'a1_elite1', type: 'elite', x: 1708, y: 504, size: 76, next: ['a1_enh2', 'node_1788510549750'] },
            { id: 'a1_enh2', type: 'enhance', x: 1547, y: 524, next: ['a1_b5', 'a1_b6'] },
            { id: 'a1_b5', type: 'battle', x: 1413, y: 718, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_b6', type: 'battle', x: 1317, y: 587, next: ['a1_e4', 'a1_e5', 'a1_e6'] },
            { id: 'a1_e4', type: 'event', x: 1062, y: 604, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e5', type: 'shop', x: 1377, y: 872, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_e6', type: 'treasure', x: 1221, y: 725, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'elite', x: 1204, y: 967, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'elite', x: 955, y: 849, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 1078, y: 1101, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'elite', x: 1477, y: 1164, size: 76, next: ['a1_boss'] },
            { id: 'a1_boss', type: 'elite', x: 1590, y: 963, size: 75, next: ['node_1788510549750'] },
            { id: 'node_1788510549750', type: 'boss', x: 1650, y: 759, size: 100, next: [] },
        ],
    },
];

// ── 图池（把本难度这一行替换进 mapLayout.ts 的 ROGUE_MAPS）──
//


/**
 * [2026-10-09 莉莉子 · 图池] 每难度的**地图池**（程拍板：由"每难度一张"升为"一个池、开局随机抽一张"）。
 * ⚠️ 形状由 `Record<难度, RogueAct[]>` 升级为 `Record<难度, RogueMap[]>`：
 *    外层 = 难度；内层 = 该难度的**多张地图**，每张仍是 `RogueAct[]`（现惯例只含 1 个 act）。
 * 导出/粘贴工作流不变 —— 编辑器按「难度 + 序号」导出常量（序号 0 沿用原常量名 `ROGUE_MAP_<难度>`，
 * 新增地图为 `ROGUE_MAP_<难度>_2` / `_3` …）。
 * 消费方只有两处：本文件的 `generateMapLayout` 与 `RogueMapEditor`（改动波及面刻意保持很小）。
 */
export const ROGUE_MAPS: Record<RogueDifficulty, RogueMap[]> = {
    normal: [ROGUE_MAP_NORMAL, ROGUE_MAP_NORMAL_2, ROGUE_MAP_NORMAL_3, ROGUE_MAP_NORMAL_4],
    secret: [ROGUE_MAP_SECRET, ROGUE_MAP_SECRET_2, ROGUE_MAP_SECRET_3, ROGUE_MAP_SECRET_4, ROGUE_MAP_SECRET_5],
    // [2026-10-10 莉莉子 · 修复] **补回 `topsecret` 键**。
    //   ── 症状：`mapLayout.ts(588,14): TS2741 Property 'topsecret' is missing in type '{normal; secret}'`
    //      ⇒ `npm run build`（= `tsc -b && vite build`）会被直接打断。
    //   ── 常量 `ROGUE_MAP_TOPSECRET` ~ `ROGUE_MAP_TOPSECRET_5` **本来就在本文件里**（绝密 5 张图），
    //      所以这里是**恢复引用**、不是新建数据；寻常量/机密同款形状。
    topsecret: [ROGUE_MAP_TOPSECRET, ROGUE_MAP_TOPSECRET_2, ROGUE_MAP_TOPSECRET_3, ROGUE_MAP_TOPSECRET_4, ROGUE_MAP_TOPSECRET_5],
};

/** [2026-10-09 莉莉子 · 图池] 从该难度图池随机抽一张（`run.layout` 在开局固化它，整局不再重随） */
export const pickMapForDifficulty = (difficulty: RogueDifficulty): RogueMap => {
    const pool = ROGUE_MAPS[difficulty] ?? [];
    if (pool.length === 0) return [];
    return pool[Math.floor(Math.random() * pool.length)];
};

// [2026-08-10 敌人头像] 从流派自身池子（coreCards + preferredPool）随机选单位/法术卡，
// 排除天启者英雄（敌人头像/预览卡面不该是玩家英雄）。战斗仍用 enemyArchetypeId 生成完整敌人。
// [2026-08-11 节点预览] 提升到模块作用域并导出，供 NodePreviewPanel 兜底敌人卡面复用。
export const pickEnemyAvatarKey = (archetypeId: string): string => {
    const arch = ENEMY_ARCHETYPES[archetypeId];
    // [2026-08-29 程拍板] 编辑器固定头像优先（肉鸽遇到该流派显示固定头像，不再随机）
    if (arch?.avatarKey && CARD_DB[arch.avatarKey]) return arch.avatarKey;
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
export const generateMapLayout = (difficulty: RogueDifficulty, mapIndex?: number): RogueAct[] => {
    // [2026-10-09 莉莉子 · 图池] 指定 mapIndex → 用指定那张；否则从该难度图池里**随机抽一张**
    const pool = ROGUE_MAPS[difficulty] ?? [];
    const picked = pool.length === 0 ? [] : (pool[mapIndex ?? Math.floor(Math.random() * pool.length)] ?? pool[0]);
    const layout = picked.map(act => ({
        ...act,
        nodes: act.nodes.map(n => ({ ...n })),
    }));

    // [2026-10-09 莉莉子 · 随机节点] **开局预掷真身**（程拍板：开局定死 / 对玩家隐藏 / 同局稳定）
    //   ── 做法：把 `type` 就地改写成真身，另打 `wasRandom: true` 供 UI 掩码（类型注释见 `RogueNode.wasRandom`）
    //   ── ⚠️ 必须在下面「敌人预分配」**之前**：掷成 battle 的随机节点同样要吃到流派/头像/强化预分配
    layout.forEach(act => act.nodes.forEach(n => {
        if (n.type !== 'random') return;
        n.type = RANDOM_NODE_POOL[Math.floor(Math.random() * RANDOM_NODE_POOL.length)];
        n.wasRandom = true;
    }));
    // [2026-08-10 预分配敌人] 为战斗/精英/Boss 节点随机分配敌人流派，
    // 保证地图上的敌人头像与实际战斗对手一致（RogueMapScreen 按 difficulty useMemo 生成一次，稳定不重随）
    const archetypeIds = Object.keys(ENEMY_ARCHETYPES);
    // [2026-08-28 莉莉子 修复] 深度 = 迷宫路径层数（BFS 从起点数层），与 x 坐标无关；同一岔路同深度
    // [2026-09-15 莉莉子 修复] 改用「战斗进度深度」（computeCombatDepth）：只沿战斗节点推进，跳过 start/enhance/event 等非战斗节点。
    //   旧口径把非战斗节点也算进层数 —— 普通图共 7 层，第一战 frac=2/6 恰好等于 1/3 边界 → 开局第一战就吃到 +10 生命强化。
    const depthByNode = computeCombatDepth(layout);
    layout.forEach(act => {
        act.nodes.forEach(n => {
            if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
                const id = archetypeIds[Math.floor(Math.random() * archetypeIds.length)];
                n.enemyArchetypeId = id;
                n.enemyKey = pickEnemyAvatarKey(id);
                // [2026-08-11 敌方迷宫强化] 预分配实际携带：按迷宫路径深度从流派配置库随机抽（整局稳定，预览/未来战斗一致）
                // [2026-08-28 莉莉子] 传 difficulty：品质权重表按本局难度分层（普通禁红 / 机密深层红 1 / 绝密深层红 2）
                // [2026-08-28 莉莉子 修复] depthFrac 用迷宫路径层深度，不再按 x 列分桶
                // [2026-09-15 莉莉子 修复] depthFrac 改由 computeCombatDepth 提供（战斗进度口径，跳过非战斗节点）
                const depthFrac = depthByNode.get(n.id) ?? 0;
                n.enemyBuffs = rollEnemyBuffs(ENEMY_ARCHETYPES[id]?.rogueBuffs, depthFrac, difficulty);
                // [2026-08-28 莉莉子] 敌方水晶生命强化（程拍板）：前 1/3 敌人为基础生命值；后 2/3 敌人 +10；Boss +20
                // 追加在抽选结果后，作为节点必带强化（NodePreviewPanel 敌人详情可见，encounterBuilder 折算进水晶初值）
                n.enemyBuffs = n.type === 'boss'
                    ? [...n.enemyBuffs, 'enemy_nexus_boost_20']
                    : depthFrac >= 1 / 3
                        ? [...n.enemyBuffs, 'enemy_nexus_boost_10']
                        : n.enemyBuffs;
            }
        });
    });
    // [2026-08-28] 删除运行时 battle→elite 自动升级（程拍板：精英由各难度图编辑器直接编辑，避免冲突）
    return layout;
};

// 地图原始尺寸常量（画布 / 背景图共用）
export const MAP_WIDTH = 3168;
export const MAP_HEIGHT = 1344;


