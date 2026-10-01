// ==========================================
// 悖论迷宫 · 神格神经（天启者专属强化 · 局外永久成长）
// [2026-09-28 程拍板设计 · 莉莉子实装]
//
// 结构：**6 个节点（左 3 / 右 3）**，每个节点 = 1 颗星（点满 6 星）
//   ① 基调 A   ② 基调 B   ③ A 的升级   ④ B 的升级
//   ⑤ 固定槽（开局法力 +1，**所有天启者相同**）  ⑥ 决胜能力
//
// 性质（程原话）：
//   · 提供【天启者专属强化】，影响 / 辅助卡组的游戏玩法
//   · **不能在游戏中任何节点获取** —— 唯一获取途径就是本系统
//
// 解锁规则（程 2026-09-28 定 · 货币 2026-09-29 改版）：
//   · **严格顺序**：③ 需 ①；④ 需 ②；⑤ 需 ①②③④；⑥ 需 ⑤
//   · 每节点 1 星（点满 6 星）
//   · 消耗**神格碎片**（专属 + 万能组合，见 `divinityShards.ts`）
//     ⚠️ [2026-09-29 程拍板] 原「悖论点」货币已**整体废弃** —— 改为神格碎片体系
//        （每英雄专属碎片 + 万能碎片；10/20/30/40/40/60 = 满级 200 片）
//
// 载体：注入 `MAZE_BUFFS` 里 `playerEligible: false` 的 `divfx_*` 条目
//   → 借道迷宫强化管线（分发 / 面板展示全部复用），**不另开执行器**（与武装线同一决策）
//   · ③④ 是【升级覆盖】：解锁后**不再注入** ①② 的载体（同槽只取最高档）
//     ⇒ 覆盖逻辑在 resolveDivinityEffects 一处收口，引擎无需感知
// ==========================================

import { DIVINITY_SHARD_COST, MAX_DIVINITY_LEVEL } from './divinityShards';

/** 神格神经节点数 = 卡面星槽数（0-6 星） —— 单一真源在 divinityShards */
export { MAX_DIVINITY_LEVEL };

// ── [2026-09-29 程拍板 · 已移除] 悖论点体系 ──
//   原导出（DIVINITY_NODE_COST / PARADOX_WIN_REWARD / PARADOX_DEFEAT_BASE /
//   PARADOX_PER_NODE / computeParadoxOnDefeat）已**全部废弃并删除**。
//   货币改为「神格碎片」：专属碎片（每英雄各一种）+ 万能碎片（可全额替代），
//   点亮价格 10/20/30/40/40/60（满级 200 片）→ 见 `divinityShards.ts` 的 DIVINITY_SHARD_COST。

export interface DivinityNode {
    id: string;
    heroKey: string;          // 归属天启者；'common' = 全英雄共用的固定槽（⑤）
    slot: 1 | 2 | 3 | 4 | 5 | 6;
    name: string;
    description: string;
    requires: string[];       // **前置**（解锁顺序门槛，严格顺序）——只影响"能不能点"，不影响效果
    upgrades?: string;        // **升级覆盖**：本节点解锁后，被它升级的那个节点**不再注入**（同槽只取最高档）
    grants: string[];         // 注入的 MAZE_BUFFS 载体 id（可多条：如 ⑥ 的开局+召唤+每回合）
    /**
     * [2026-09-29 程拍板] 节点图标 = **天启者技能图标**（引用 `SPELL_IMAGES` 的 key）。
     *   分配规则（程定）：
     *     ①③ ← **小技能**（`*_rush`；芬妮例外为 `fenny_strike`）
     *     ②④ ← **大招**  （`*_ultimate`）
     *     ⑤   ← **支援技**（`*_support`）
     *     ⑥   ← **天启者法术**（`*_spell`，即英雄本体那张法术的卡面）
     *   ⚠️ 用 key 而非直接 import 图片 URL —— 数据层不重复引图，由 UI 侧从 `SPELL_IMAGES[icon]` 取。
     */
    icon: string;
}

// ── ⑥ 的"此后召唤也带"与"开局全体"共用同一批数值，集中在这里方便调 ──
export const DIVINITY_LYFE_6 = { power: 0, health: 1, keyword: 'Regeneration' as const };

/** 里芙的 6 个节点（程给的样板） */
export const LYFE_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_lyfe_1', heroKey: 'lyfe', slot: 1,
        name: '决意·凝锋',
        description: '我方单位打击后，获得 +1/+1。',
        requires: [],
        grants: ['divfx_lyfe_1'],
        icon: 'lyfe_rush',
    },
    {
        id: 'div_lyfe_2', heroKey: 'lyfe', slot: 2,
        name: '决意·邀战',
        description: '回合开始时，在手牌中生成一张瞬逝的「单挑」。',
        requires: [],
        grants: ['divfx_lyfe_2'],
        icon: 'lyfe_ultimate',
    },
    {
        id: 'div_lyfe_3', heroKey: 'lyfe', slot: 3,
        name: '决意·锋锐',
        description: '【升级】我方单位打击后，获得 +2/+2。',
        requires: ['div_lyfe_1'],
        upgrades: 'div_lyfe_1',   // 升级覆盖：解锁后不再注入 ①（否则 BUFF_SELF 叠加成 +3/+3）
        grants: ['divfx_lyfe_3'],
        icon: 'lyfe_rush',
    },
    {
        id: 'div_lyfe_4', heroKey: 'lyfe', slot: 4,
        name: '决意·驰援',
        description: '【升级】回合开始时，在手牌中生成一张 0 费、瞬逝的「单挑」。',
        requires: ['div_lyfe_2'],
        upgrades: 'div_lyfe_2',
        grants: ['divfx_lyfe_4'],
        icon: 'lyfe_ultimate',
    },
    {
        id: 'div_lyfe_5', heroKey: 'lyfe', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_lyfe_1', 'div_lyfe_2', 'div_lyfe_3', 'div_lyfe_4'],
        // ⚠️ 刻意**没有** upgrades：⑤ 是在 ③④ 之上【再加一条】，不是取代它们
        grants: ['divfx_common_5'],
        icon: 'lyfe_support',
    },
    {
        id: 'div_lyfe_6', heroKey: 'lyfe', slot: 6,
        name: '决意·不退之阵',
        description: '我方所有单位获得 +0/+1 与【再生】（含此后召唤的单位）；且每回合在手牌中生成一张 0 费、瞬逝的「专注」。',
        requires: ['div_lyfe_5'],
        // ⚠️ 同样没有 upgrades：⑥ 是在前几条之上【再加一条】完整效果
        grants: ['divfx_lyfe_6'], // 一条强化三个效果（battleEffects），不是三条
        icon: 'lyfe_spell',
    },
];

/** 安卡希雅（飞剑纵横 · 高操作）的 6 个节点 —— 程 2026-09-28 设计（**全格零引擎**） */
export const ACACIA_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_acacia_1', heroKey: 'acacia_chrono_echo', slot: 1,
        name: '月轮·引剑',
        description: '我方召唤单位时，本回合给予其 +1/+0。',
        requires: [],
        grants: ['divfx_acacia_1'],
        icon: 'acacia_chrono_echo_rush',
    },
    {
        id: 'div_acacia_2', heroKey: 'acacia_chrono_echo', slot: 2,
        name: '残月·拾遗',
        description: '我方单位阵亡时，随机一张手牌费用 -1。',
        requires: [],
        grants: ['divfx_acacia_2'],
        icon: 'acacia_chrono_echo_ultimate',
    },
    {
        id: 'div_acacia_3', heroKey: 'acacia_chrono_echo', slot: 3,
        name: '满月·锋芒',
        description: '【升级】我方召唤单位时，本回合给予其 +2/+0。',
        requires: ['div_acacia_1'],
        upgrades: 'div_acacia_1',
        grants: ['divfx_acacia_3'],
        icon: 'acacia_chrono_echo_rush',
    },
    {
        id: 'div_acacia_4', heroKey: 'acacia_chrono_echo', slot: 4,
        name: '朔望·减耗',
        description: '【升级】我方单位阵亡时，随机一张手牌费用 -2。',
        requires: ['div_acacia_2'],
        upgrades: 'div_acacia_2',
        grants: ['divfx_acacia_4'],
        icon: 'acacia_chrono_echo_ultimate',
    },
    {
        id: 'div_acacia_5', heroKey: 'acacia_chrono_echo', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_acacia_1', 'div_acacia_2', 'div_acacia_3', 'div_acacia_4'],
        grants: ['divfx_common_5'],
        icon: 'acacia_chrono_echo_support',
    },
    {
        id: 'div_acacia_6', heroKey: 'acacia_chrono_echo', slot: 6,
        name: '剑舞长空',
        description: '回合开始时，在手牌中生成一张 0 费的「安卡希雅的剑舞」，且我方所有单位获得【先攻】。',
        requires: ['div_acacia_5'],
        grants: ['divfx_acacia_6'],
        icon: 'acacia_chrono_echo_spell',
    },
];

/** 芬妮（偶像爆发 · 快攻铺场）的 6 个节点 —— 程 2026-09-28 设计 */
export const FENNY_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_fenny_1', heroKey: 'fenny', slot: 1,
        name: '聚光灯下',
        description: '每回合首个打出的单位获得 +2/+0。',
        requires: [],
        grants: ['divfx_fenny_1'],
        icon: 'fenny_strike', // 芬妮小技能在图集里叫 strike（不是 rush）
    },
    {
        id: 'div_fenny_2', heroKey: 'fenny', slot: 2,
        name: '万人合唱',
        description: '发起进攻时，若我方进攻单位攻击力总和超过 15，则进行备战。',
        requires: [],
        grants: ['divfx_fenny_2'],
        icon: 'fenny_ultimate',
    },
    {
        id: 'div_fenny_3', heroKey: 'fenny', slot: 3,
        name: '全场焦点',
        description: '【升级】每回合首个打出的单位获得 +4/+0 与【碾压】。',
        requires: ['div_fenny_1'],
        upgrades: 'div_fenny_1',
        grants: ['divfx_fenny_3'],
        icon: 'fenny_strike',
    },
    {
        id: 'div_fenny_4', heroKey: 'fenny', slot: 4,
        name: '安可返场',
        description: '【升级】发起进攻时，若我方进攻单位攻击力总和超过 10，则进行备战。',
        requires: ['div_fenny_2'],
        upgrades: 'div_fenny_2',
        grants: ['divfx_fenny_4'],
        icon: 'fenny_ultimate',
    },
    {
        id: 'div_fenny_5', heroKey: 'fenny', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_fenny_1', 'div_fenny_2', 'div_fenny_3', 'div_fenny_4'],
        grants: ['divfx_common_5'],
        icon: 'fenny_support',
    },
    {
        id: 'div_fenny_6', heroKey: 'fenny', slot: 6,
        name: '聚光灯不落',
        description: '每回合一次：任意我方单位阵亡时，以满血复活，并获得【凶恶】与【坚韧】。',
        requires: ['div_fenny_5'],
        grants: ['divfx_fenny_6'],
        icon: 'fenny_spell',
    },
];

/** 卜卜（镜阵控场）的 6 个节点 —— 程 2026-09-28 设计 */
export const BUBU_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_bubu_1', heroKey: 'pupu_specular_soul', slot: 1,
        name: '镜爻随征',
        description: '每次我方进攻时，随机召唤一个进攻中的复制单位，并赋予【瞬逝】。',
        requires: [],
        grants: ['divfx_bubu_1'],
        icon: 'pupu_specular_soul_rush',
    },
    {
        id: 'div_bubu_2', heroKey: 'pupu_specular_soul', slot: 2,
        name: '卜骨遗响',
        description: '我方单位阵亡时，其攻击力随机加成到手牌中的一个单位。',
        requires: [],
        grants: ['divfx_bubu_2'],
        icon: 'pupu_specular_soul_ultimate',
    },
    {
        id: 'div_bubu_3', heroKey: 'pupu_specular_soul', slot: 3,
        name: '万象镜身',
        description: '【升级】每次我方进攻时，召唤一个进攻中的攻击力最高的复制单位，并赋予 +2/+0 和【瞬逝】。',
        requires: ['div_bubu_1'],
        upgrades: 'div_bubu_1',
        grants: ['divfx_bubu_3'],
        icon: 'pupu_specular_soul_rush',
    },
    {
        id: 'div_bubu_4', heroKey: 'pupu_specular_soul', slot: 4,
        name: '龟甲承魂',
        description: '【升级】我方单位阵亡时，其攻击力和生命值随机加成到战场 / 备战席 / 手牌中的一个单位。',
        requires: ['div_bubu_2'],
        upgrades: 'div_bubu_2',
        grants: ['divfx_bubu_4'],
        icon: 'pupu_specular_soul_ultimate',
    },
    {
        id: 'div_bubu_5', heroKey: 'pupu_specular_soul', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_bubu_1', 'div_bubu_2', 'div_bubu_3', 'div_bubu_4'],
        grants: ['divfx_common_5'],
        icon: 'pupu_specular_soul_support',
    },
    {
        id: 'div_bubu_6', heroKey: 'pupu_specular_soul', slot: 6,
        name: '镜阵回响',
        description: '我方每次打击敌方水晶时：回合结束时，我方备战席上攻击力最高的单位再次打击敌方水晶。',
        requires: ['div_bubu_5'],
        grants: ['divfx_bubu_6'],
        icon: 'pupu_specular_soul_spell',
    },
];

/** 猫汐尔（莲驱曲线 · 后期成长）的 6 个节点 —— 程 2026-09-28 设计 */
export const MAUXIR_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_mauxir_1', heroKey: 'mauxir_lotus_drive', slot: 1,
        name: '莲池计数',
        description: '回合开始时，我方备战席上每有 1 个召唤衍生物，本回合最大法力 +1。',
        requires: [],
        grants: ['divfx_mauxir_1'],
        icon: 'mauxir_lotus_rush',
    },
    {
        id: 'div_mauxir_2', heroKey: 'mauxir_lotus_drive', slot: 2,
        name: '梦莲投递',
        description: '回合开始时，在手牌中生成一张「梦莲无人机」。',
        requires: [],
        grants: ['divfx_mauxir_2'],
        icon: 'mauxir_lotus_ultimate',
    },
    {
        id: 'div_mauxir_3', heroKey: 'mauxir_lotus_drive', slot: 3,
        name: '莲脉增殖',
        description: '【升级】我方每召唤 1 个召唤衍生物，本场战斗最大法力永久 +1。',
        requires: ['div_mauxir_1'],
        upgrades: 'div_mauxir_1',
        grants: ['divfx_mauxir_3'],
        icon: 'mauxir_lotus_rush',
    },
    {
        id: 'div_mauxir_4', heroKey: 'mauxir_lotus_drive', slot: 4,
        name: '双莲速递',
        description: '【升级】回合开始时，在手牌中生成两张「梦莲无人机」。',
        requires: ['div_mauxir_2'],
        upgrades: 'div_mauxir_2',
        grants: ['divfx_mauxir_4'],
        icon: 'mauxir_lotus_ultimate',
    },
    {
        id: 'div_mauxir_5', heroKey: 'mauxir_lotus_drive', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_mauxir_1', 'div_mauxir_2', 'div_mauxir_3', 'div_mauxir_4'],
        grants: ['divfx_common_5'],
        icon: 'mauxir_lotus_support',
    },
    {
        id: 'div_mauxir_6', heroKey: 'mauxir_lotus_drive', slot: 6,
        name: '莲台无垠',
        description: '我方所有法术费用 -1；「臆莲基座」的攻击力不再有上限限制。',
        requires: ['div_mauxir_5'],
        grants: ['divfx_mauxir_6'],
        icon: 'mauxir_lotus_spell',
    },
];

/** 茉莉安（信标猎场 · 中速控场）的 6 个节点 —— 程 2026-09-28 设计（①③ 语义经程确认） */
export const MARIAN_DIVINITY_NODES: DivinityNode[] = [
    {
        id: 'div_marian_1', heroKey: 'marian', slot: 1,
        name: '猎影援护',
        description: '我方拉取暴露单位时，本回合给予发起拉取的我方单位 +2/+0。',
        requires: [],
        grants: ['divfx_marian_1'],
        icon: 'marian_rush',
    },
    {
        id: 'div_marian_2', heroKey: 'marian', slot: 2,
        name: '猎场哨戒',
        description: '回合开始时，暴露一个敌人，并对随机敌人造成 2 点伤害。',
        requires: [],
        grants: ['divfx_marian_2'],
        icon: 'marian_ultimate',
    },
    {
        id: 'div_marian_3', heroKey: 'marian', slot: 3,
        name: '猎影疾袭',
        description: '【升级】我方拉取暴露单位时，本回合给予发起拉取的我方单位 +3/+0 与【快速攻击】。',
        requires: ['div_marian_1'],
        upgrades: 'div_marian_1',
        grants: ['divfx_marian_3'],
        icon: 'marian_rush',
    },
    {
        id: 'div_marian_4', heroKey: 'marian', slot: 4,
        name: '猎场锁定',
        description: '【升级】回合开始时，暴露一个敌人，并对血量最多的敌人造成 4 点伤害。',
        requires: ['div_marian_2'],
        upgrades: 'div_marian_2',
        grants: ['divfx_marian_4'],
        icon: 'marian_ultimate',
    },
    {
        id: 'div_marian_5', heroKey: 'marian', slot: 5,
        name: '神格·潮汐',
        description: '本场战斗，我方最大法力 +1。',
        requires: ['div_marian_1', 'div_marian_2', 'div_marian_3', 'div_marian_4'],
        grants: ['divfx_common_5'],
        icon: 'marian_support',
    },
    {
        id: 'div_marian_6', heroKey: 'marian', slot: 6,
        name: '猎场收网',
        description: '敌方（我方埋在对方席位的）獠牙信标造成的伤害翻倍。',
        requires: ['div_marian_5'],
        grants: ['divfx_marian_6'],
        icon: 'marian_spell',
    },
];

/** 全部 6 位天启者的神格神经节点（里芙 / 安卡希雅 / 芬妮 / 卜卜 / 猫汐尔 / 茉莉安） */
export const DIVINITY_NODES: DivinityNode[] = [
    ...LYFE_DIVINITY_NODES,
    ...ACACIA_DIVINITY_NODES,
    ...FENNY_DIVINITY_NODES,
    ...BUBU_DIVINITY_NODES,
    ...MAUXIR_DIVINITY_NODES,
    ...MARIAN_DIVINITY_NODES,
];

const NODE_BY_ID: Record<string, DivinityNode> = Object.fromEntries(DIVINITY_NODES.map(n => [n.id, n]));

export const getDivinityNode = (id: string): DivinityNode | undefined => NODE_BY_ID[id];

/** 各英雄的⑤「神格·潮汐」支援技图标 key（前缀差异在此收口） */
export const DIVINITY_SUPPORT_ICON: Record<string, string> = {
    lyfe: 'lyfe_support',
    fenny: 'fenny_support',
    pupu_specular_soul: 'pupu_specular_soul_support',
    mauxir_lotus_drive: 'mauxir_lotus_support',
    acacia_chrono_echo: 'acacia_chrono_echo_support',
    marian: 'marian_support',
};

/**
 * [2026-09-29 程拍板] 取节点图标 key（**取图标时的统一入口**）。
 *   ⚠️ ⑤ 的**数据条目**是 6 英雄共用的一条（`divfx_common_5`），无法在数据层表达"每人不同图标"；
 *      所以 ⑤ 在这里按 heroKey 改写成该英雄的支援技图标。
 *      别把本函数当成"数据层有 6 条 ⑤"的证据。
 */
export const getDivinityIconKey = (node: DivinityNode): string =>
    node.slot === 5 ? (DIVINITY_SUPPORT_ICON[node.heroKey] ?? 'abc_spell') : node.icon;

/** 某天启者的 6 个节点（按槽位排序；未设计的英雄 → 空表，UI 显示占位） */
export const getDivinityNodes = (heroKey: string): DivinityNode[] =>
    DIVINITY_NODES.filter(n => n.heroKey === heroKey).sort((a, b) => a.slot - b.slot);

/** 是否已解锁 */
export const isNodeUnlocked = (nodeId: string, unlocked: string[] | undefined): boolean =>
    (unlocked ?? []).includes(nodeId);

/** 前置是否都满足 */
export const isNodeAvailable = (node: DivinityNode, unlocked: string[] | undefined): boolean =>
    !isNodeUnlocked(node.id, unlocked) && node.requires.every(r => isNodeUnlocked(r, unlocked));

/** 神格神经等级（星数）= 已解锁节点数（0-6） */
export const getDivinityLevel = (heroKey: string, unlocked: string[] | undefined): number =>
    getDivinityNodes(heroKey).filter(n => isNodeUnlocked(n.id, unlocked)).length;

/** 节点价格（神格碎片；专属 + 万能可组合）—— 数据源 divinityShards.DIVINITY_SHARD_COST */
export const getNodeCost = (node: DivinityNode): number => DIVINITY_SHARD_COST[node.slot] ?? 0;

/**
 * 本场要注入的战斗内效果 id。
 *
 * **升级覆盖**（③④）只由 `upgrades` 声明，**与 `requires`（前置门槛）是两件事**：
 *   · `requires`：解锁顺序（例：⑤ 需 ①②③④ 都开）——**不影响效果是否注入**
 *   · `upgrades`：本节点是"某个节点的升级版"（③→① / ④→②）——被升级的那个**不再注入**
 *
 * ⚠️ [2026-09-28 修复] 曾错误地用 `requires` 反推覆盖集合：
 *   ⑤ 的前置含 ①②③④ ⇒ 一点 ⑤ 就把 ③④ 一起"覆盖"掉，界面上表现为"③④ 消失了"；
 *   ⑥ 同理再把 ⑤ 吃掉。程实测发现。**覆盖只能来自 `upgrades`。**
 */
export const resolveDivinityEffects = (heroKey: string, unlocked: string[] | undefined): string[] => {
    const nodes = getDivinityNodes(heroKey);
    const owned = nodes.filter(n => isNodeUnlocked(n.id, unlocked));
    // 被"升级版"取代的节点（只有 upgrades 声明的关系才算）
    const replaced = new Set(owned.map(n => n.upgrades).filter((v): v is string => !!v));
    const ids: string[] = [];
    for (const n of owned) {
        if (replaced.has(n.id)) continue; // 已被它的升级版取代
        ids.push(...n.grants);
    }
    return Array.from(new Set(ids));
};

// ==========================================
// 同步快照（给纯展示 / 排序用的只读视图）
//   [2026-09-28] `useHeroDivinity`（hooks 层）是唯一真源；它每次加载 / 落盘时把当前
//   解锁表写进这里，data 层就能提供**同步**的 getHeroDivinityLevel（排序、星槽渲染要用），
//   而无需 data → hooks 反向依赖（避免循环导入）。
// ==========================================
let unlockedSnapshot: Record<string, string[]> = {};

export const setDivinityUnlockedSnapshot = (map: Record<string, string[]>): void => {
    unlockedSnapshot = map;
};

/** 某天启者的神格神经等级（星数 0-6）—— 排序 / 星槽渲染用（同步读快照） */
export const getHeroDivinityLevel = (heroKey: string): number =>
    getDivinityLevel(heroKey, unlockedSnapshot[heroKey]);

/** 某天启者已解锁的节点 id（同步快照；组件内请优先用 useHeroDivinity 以获得响应式） */
export const getUnlockedNodes = (heroKey: string): string[] => unlockedSnapshot[heroKey] ?? [];

// ── 天启者状态筛选（占位接口，本次纵切未涉及）──
export type HeroStatus = 'unlocked' | 'locked' | 'upgradable' | 'inCampaign';

export const HERO_STATUS_LABELS: Record<HeroStatus, string> = {
    unlocked: '已解锁',
    locked: '未解锁',
    upgradable: '可升级',
    inCampaign: '战役中',
};

/**
 * 获取某天启者的当前状态。
 * ⚠️ 仍为占位：本次只实装神格神经的**解锁与激活**，「已解锁/未解锁」的账号级判定与
 *   「战役中」的进行态判定属于肉鸽任务 / 解锁体系，恒返回 null（「未判定」）。
 *   ⚠️ 「可升级」这一态将来可直接由神格神经派生：有可用节点且碎片够。
 */
export const getHeroStatus = (_heroKey: string): HeroStatus | null => null;
