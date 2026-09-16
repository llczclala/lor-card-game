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
    dialogueBg?: string;       // [2026-08-27] 进入面板背景图 key（'1'~'8'，编辑器可指定；未指定进入时随机）
}

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

// [2026-09-04 程排版] 普通难度地图（编辑器重排：短程，4 战斗 + 3 事件 + 终局 Boss）
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

// [2026-09-04 程排版] 机密难度地图（双段推进：精英前置 + 长程收尾 Boss）
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
            { id: 'a1_e6', type: 'treasure', x: 2069, y: 643, next: ['a1_b7', 'a1_b8'] },
            { id: 'a1_b7', type: 'battle', x: 2413, y: 625, next: ['a1_rest2'] },
            { id: 'a1_b8', type: 'battle', x: 2379, y: 861, next: ['a1_rest2'] },
            { id: 'a1_rest2', type: 'rest', x: 2559, y: 620, next: ['a1_elite2'] },
            { id: 'a1_elite2', type: 'boss', x: 2671, y: 530, size: 76, next: [] },
        ],
    },
];

// [2026-09-04 程排版] 绝密难度地图（反向右→左推进，多精英，Boss 收尾）
// 整合修正：① a1_boss 原为 elite → 改 boss（否则最终 Boss 胜利不触发整局通关）；② 移除孤立的游离节点 node_1788508749881
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

export const ROGUE_MAPS: Record<RogueDifficulty, RogueAct[]> = {
    normal: ROGUE_MAP_NORMAL,
    secret: ROGUE_MAP_SECRET,
    topsecret: ROGUE_MAP_TOPSECRET,
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
export const generateMapLayout = (difficulty: RogueDifficulty): RogueAct[] => {
    // [2026-08-28 莉莉子] 三张独立难度地图，按难度取图深拷贝（节点类型已由各难度图编辑决定，运行时不再自动升级）
    const layout = ROGUE_MAPS[difficulty].map(act => ({
        ...act,
        nodes: act.nodes.map(n => ({ ...n })),
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


