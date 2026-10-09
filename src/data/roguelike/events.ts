// ==========================================
// 悖论迷宫 · 事件系统（数据层）
// [2026-08-28 莉莉子] 基于《参考-肉鸽事件设计.md》拟定第一批 23 个事件（8 类）。
//   结果用 RogueEventEffect 声明式表达，由 App 层 handleRogueEvent 执行（映射到 useRoguelikeRun API）。
//   特殊类型：gamble 概率赌注 / forced 强制随机（无 Leave）/ invest 跨节点回报 /
//   fight 触发战斗 / fightDebuff 未来 N 场敌人强化。
//
// [2026-10-05 莉莉子 · 方案 P2] **内容层改版**（机制一行未动）：
//   ① 叙事定稿：全部 23 条 name/desc 从「（占位叙事）」换成正式文案
//      基调 = **冷静 · 克制 · 带诡谲**（一句场景 + 一句钩子，30~60 字，不解释机制）
//   ② 单选项补「中间档」：13 条单选项各补一个**小收益小代价**的安全档
//      （原选项 = 大收益带大代价；补完单选项只剩 2 条强制型 ⇒ 满足方案"≤3"的目标）
//   ③ 稀有度分层：weight 1.0 普通 / 0.45 稀有 / 0.15 传说（弹窗按 weight 显示档位标签）
// ==========================================

// [2026-10-08 莉莉子 · 瓦尔基里大赛] 「按难度整档替换奖励」需要难度枚举（只读类型，无循环依赖）
import type { RogueDifficulty } from './difficulties';

export type RogueEventType = 'gift' | 'trade' | 'tradeoff' | 'gamble' | 'forced' | 'investment' | 'fight' | 'edit' | 'deep';

/** 事件稀有度（由 weight 推导，供 UI 标签用） */
export type RogueEventRarity = 'common' | 'rare' | 'legend';

// 事件效果（声明式，可组合多个）
export interface RogueEventEffect {
    // 即时资源
    gold?: number;             // 金币增减
    hp?: number;               // 生命增减（绝对）
    hpPct?: number;            // 生命增减（% 当前 maxHp）
    maxHp?: number;            // 生命上限增减
    revive?: number;           // 复活次数增减
    refresh?: number;          // 刷新次数增减
    // 卡牌
    addRandomCard?: boolean;   // 加一张随机可收集卡
    addEquippedCard?: boolean; // 加一张带随机装备的卡
    polluteDeck?: boolean;     // 污染牌组（加一张不可收集的衍生物/测试卡）
    removeCards?: number;      // 删 N 张卡（自选，触发删卡子步骤）
    upgradeCard?: boolean;     // 随机一张牌组卡挂一件随机装备（升级变强）
    // 强化 / 装备
    addEnhancement?: boolean;  // 加随机迷宫强化
    addEquipment?: boolean;    // 加随机装备
    removeEquipment?: boolean; // 交出一件随机装备（投资型）
    // 特殊
    gamble?: { prob: number; win: RogueEventEffect[]; lose: RogueEventEffect[] };   // 概率赌注
    forced?: RogueEventEffect[][];                                                    // 强制随机取一组（无 Leave）
    invest?: { kind: 'battleWinGold' | 'restHeal' | 'enhancementRank'; value?: number }; // 跨节点投资
    fight?: {
        reward: 'enhancement' | 'choose2';
        // ── [2026-10-08 莉莉子 · 瓦尔基里大赛] 指定敌方（缺省 = 沿用旧的随机流派，老事件零影响）──
        /** 敌方天启者 key **列表** ⇒ 决定敌人卡组（如 `['fenny']` / `['lyfe']` / 双人 `['lyfe','fenny']`） */
        opponentHeroKeys?: string[];
        /** 敌方携带的强化 id 列表（按难度各写一份 ⇒ 放在 `effectsByDifficulty` 里） */
        enemyEnhancements?: string[];
    };
    fightDebuff?: { enemyHpBonus: number; fights: number };                           // 未来 N 场战斗敌人水晶 +生命
    // ── [2026-10-08 莉莉子 · 瓦尔基里大赛] 新增两种「确定性」奖励 ──
    /** 从**指定 id 列表**里随机取一个强化（区别于 `addEnhancement` 的随机池）。
     *  用途：「瓦尔基里大赛」三档给不同强化 —— 那是**整档替换**，不是倍率关系 */
    addEnhancementFrom?: string[];
    /** 固定赠送指定天启者卡，并给她挂 `equipCount` 件随机装备
     *  （品质走现成的 `equipWeightsFor(difficulty)` 难度加权表） */
    grantHeroCard?: { heroKey: string; equipCount: number };
}

export type RogueInvestment = NonNullable<RogueEventEffect['invest']>; // 跨节点投资标记

export interface RogueEventChoice {
    label: string;       // 选项文案
    effects: RogueEventEffect[];
    /** [2026-10-08 莉莉子 · 瓦尔基里大赛] **选择后播出的剧情**；缺省则不播剧情，走现有「选择 → 结果」流程 */
    story?: string;
    /**
     * [2026-10-08 莉莉子 · 瓦尔基里大赛] **按难度整档替换**的奖励。
     * ⚠️ 存在时**优先于** `effects`（用于"三档给不同强化"这类**整档分支** —— 不是倍率关系）。
     * ⚠️ 取用**必须**走唯一出口 `resolveChoiceEffects()`：提示（NodeEventModal）与执行（App）
     *    两处都要用它，否则又会回到"选项写一套、实际给另一套"的老病（见 eventAppliers.ts 头注释）。
     */
    effectsByDifficulty?: Partial<Record<RogueDifficulty, RogueEventEffect[]>>;
}

export interface RogueEvent {
    id: string;
    type: RogueEventType;
    name: string;        // 标题
    desc: string;        // 描述
    weight?: number;     // 事件池抽取权重（默认 1 = 普通档；0.45 稀有；0.15 传说）
    choices: RogueEventChoice[];
    allowLeave?: boolean; // 是否提供无惩罚离开（默认 true；强制型 false）
    /**
     * [2026-10-08 莉莉子 · 瓦尔基里大赛] **本事件指定 CG 图**（优先级高于随机背景）。
     * 缺省 = 沿用 `getDialogueBg()` 的一局内固定随机背景 ⇒ 老事件零影响。
     */
    cg?: string;
    /**
     * [2026-10-05 莉莉子 · 方案 P4 §3] **自愿·渐进风险**（push-your-luck）配置。
     * 参考《参考-肉鸽事件设计》§1「Dead Adventurer」：反复深入、代价递增、随时可退。
     * ⚠️ 整个过程都在**同一次进入之内**完成（弹窗内的多步），**不给节点开重复进入的口子**（反刷取红线）。
     */
    deepEcho?: {
        /** 最多深入几层（costPctByLayer 的长度即上限） */
        layers: number;
        /** 第 N 层成功率（1 = 必成功） */
        probByLayer: number[];
        /** 第 N 层的代价（% maxHp，进入该层时付出） */
        costPctByLayer: number[];
    };
}

/**
 * [2026-10-08 莉莉子 · 瓦尔基里大赛] **选项效果的唯一取用出口**。
 *
 * 为什么必须收成一个函数：本文件与 `eventAppliers.ts` 的头注释记过同一条教训 ——
 * "同一套语义两处各写一遍 ⇒ 必然漏"。整档难度奖励若在「提示」与「执行」各取一次，
 * 迟早出现"选项写凝锋、实际给锋锐"。
 *
 * 取用优先级：`effectsByDifficulty[当前难度]` > `effects`
 * （缺省回落旧口径 ⇒ **老事件零影响**）
 */
export const resolveChoiceEffects = (
    choice: RogueEventChoice,
    difficulty?: RogueDifficulty,
): RogueEventEffect[] => {
    if (!choice.effectsByDifficulty) return choice.effects;
    const byDiff = difficulty ? choice.effectsByDifficulty[difficulty] : undefined;
    return byDiff ?? choice.effects;
};

/** 由权重推导稀有度（单一真源：不在数据里再写一份 rarity） */
export const rarityOfEvent = (ev: RogueEvent): RogueEventRarity => {
    const w = ev.weight ?? 1;
    if (w >= 1) return 'common';
    if (w >= 0.3) return 'rare';
    return 'legend';
};

export const ROGUE_EVENTS: RogueEvent[] = [
    // ═══════════════ ① 赠礼型 Gift（免费纯收益 · 普通档） ═══════════════
    {
        id: 'ev_mystery_box', type: 'gift', name: '无人认领的补给箱', weight: 1,
        desc: '箱体上还留着上一支小队的编号，锁扣已经锈死——他们显然没能带走里面的东西。',
        choices: [
            { label: '撬开锁扣', effects: [{ addEquipment: true }] },
            { label: '整箱搬走', effects: [{ addRandomCard: true }] },
            { label: '靠着它歇一会儿', effects: [{ hpPct: 25 }] },
        ],
    },
    {
        id: 'ev_lucky_fountain', type: 'gift', name: '不冻的泉', weight: 1,
        desc: '水在零下的空气里仍冒着热气。你听见水底有很轻的、像是感谢的声音。',
        choices: [
            { label: '畅饮', effects: [{ hpPct: 30 }] },
            { label: '向水底致意', effects: [{ maxHp: 3 }] },
        ],
    },
    {
        id: 'ev_passing_merchant', type: 'gift', name: '匆匆的货郎', weight: 1,
        desc: '他不停看表，也看你的身后。「随便挑一样，」他说，「我得在天黑前离开这条道。」',
        choices: [
            { label: '收下赠礼', effects: [{ addRandomCard: true }] },
            { label: '婉言谢绝', effects: [{ gold: 40 }] },
        ],
    },

    // ═══════════════ ② 交易型 Trade（付资源换资源 · 普通档） ═══════════════
    {
        id: 'ev_black_market', type: 'trade', name: '屏息的黑市', weight: 1,
        desc: '摊主压着嗓子报价，货都蒙着布。他收钱很快，找零更快——他不想让你看清任何一件。',
        choices: [
            { label: '花 150 金买强化', effects: [{ gold: -150, addEnhancement: true }] },
            { label: '花 120 金买装备', effects: [{ gold: -120, addEquipment: true }] },
            { label: '花 80 金买卡牌', effects: [{ gold: -80, addRandomCard: true }] },
        ],
    },
    {
        id: 'ev_life_altar', type: 'trade', name: '换血的祭坛', weight: 1,
        desc: '祭坛边缘刻着一行小字：「给我你的，我给你我的。」凹槽里还留着上一位的痕迹。',
        choices: [
            { label: '献祭 6 点生命', effects: [{ hp: -6, addEnhancement: true }] },
            { label: '献祭 10 点生命', effects: [{ hp: -10, addEquipment: true }] },
        ],
    },
    {
        id: 'ev_mercenary', type: 'trade', name: '待价而沽', weight: 1,
        desc: '他打量你的队伍，然后报了个价。「先付钱，」他说，「我不赊账，也不问你要去哪。」',
        choices: [
            { label: '花 50 金招募', effects: [{ gold: -50, addEquippedCard: true }] },
            // [P2 中间档] 小收益小代价
            { label: '听他讲完价（花 20 金）', effects: [{ gold: -20, addRandomCard: true }] },
        ],
    },
    {
        id: 'ev_card_for_gold', type: 'trade', name: '回收商', weight: 1,
        desc: '「什么都收，」他敲了敲秤盘，「尤其是你舍不得的那张。」',
        choices: [
            { label: '卖出一张卡', effects: [{ removeCards: 1, gold: 80 }] },
            // [P2 中间档] 少拿钱，换一次刷新
            { label: '只卖边角料', effects: [{ removeCards: 1, gold: 35, refresh: 1 }] },
        ],
    },

    // ═══════════════ ③ 代价型 Trade-off（强奖励带负担 · 稀有档） ═══════════════
    {
        id: 'ev_corrupt_chest', type: 'tradeoff', name: '渗液的箱子', weight: 0.45,
        desc: '锁眼在往外渗东西，气味说不上是甜还是腐。它明明是死的，却像还在呼吸。',
        choices: [
            { label: '强行开启', effects: [{ addEquipment: true, polluteDeck: true }] },
            // [P2 中间档] 不污染，但也拿不到装备
            { label: '只取表层', effects: [{ addRandomCard: true }] },
        ],
    },
    {
        id: 'ev_demon_pact', type: 'tradeoff', name: '灼手的契约', weight: 0.45,
        desc: '「签在这里。」它说。你注意到它的手也在烧——它似乎并不介意。',
        choices: [
            { label: '签下契约', effects: [{ gold: 60, addEnhancement: true, maxHp: -4 }] },
            // [P2 中间档] 少拿金、少削上限
            { label: '只借不签', effects: [{ gold: 30, maxHp: -2 }] },
        ],
    },
    {
        id: 'ev_blood_gift', type: 'tradeoff', name: '回响的血契', weight: 0.45,
        desc: '你在自己的血里听见了未来的声音。它说可以给你更多——只要你现在就少一点。',
        choices: [
            { label: '接受馈赠', effects: [{ addEquipment: true, addEnhancement: true, hpPct: -40 }] },
            // [P2 中间档] 只要一件，代价减半
            { label: '只取一件', effects: [{ addEquipment: true, hpPct: -20 }] },
        ],
    },
    {
        id: 'ev_void_hunger', type: 'tradeoff', name: '饥饿的虚空', weight: 0.45,
        desc: '有什么东西在裂隙里咀嚼。它停下来，转向你——它闻到了「以后」的味道。',
        choices: [
            { label: '献上祭品', effects: [{ gold: 100, fightDebuff: { enemyHpBonus: 1, fights: 2 } }] },
            // [P2 中间档] 少拿金，负担只持续一场
            { label: '小祭品', effects: [{ gold: 50, fightDebuff: { enemyHpBonus: 1, fights: 1 } }] },
        ],
    },

    // ═══════════════ ④ 赌注型 Gamble（概率赌一把 · 稀有档） ═══════════════
    {
        id: 'ev_gambler_wheel', type: 'gamble', name: '静止的轮盘', weight: 0.45,
        desc: '轮盘停着，指针卡在两格之间。庄家早已不在，规则却还在运转——它仍旧收取代价。',
        choices: [
            { label: '下注转轮', effects: [{ gamble: { prob: 0.5, win: [{ gold: 100 }], lose: [{ hp: -12 }] } }] },
            // [P2 中间档] 小注：胜率更高、输赢都更小
            { label: '只押小注', effects: [{ gamble: { prob: 0.6, win: [{ gold: 40 }], lose: [{ hp: -6 }] } }] },
        ],
    },
    {
        id: 'ev_unknown_potion', type: 'gamble', name: '没有标签的瓶子', weight: 0.45,
        desc: '液体在瓶里缓慢地转向你。它没有标签，但瓶身上有用指甲刻的两个字：「值得。」',
        choices: [
            { label: '一饮而尽', effects: [{ gamble: { prob: 0.6, win: [{ addEnhancement: true }], lose: [{ hpPct: -20 }] } }] },
            // [P2 中间档] 高胜率、低收益
            { label: '浅尝一口', effects: [{ gamble: { prob: 0.75, win: [{ gold: 40 }], lose: [{ hpPct: -10 }] } }] },
        ],
    },
    {
        id: 'ev_tottering_statue', type: 'gamble', name: '将倾的石像', weight: 0.45,
        desc: '石像向你倾斜了几度，像是在低头。基座下压着东西，也压着它的重量。',
        choices: [
            { label: '伸手触摸', effects: [{ gamble: { prob: 0.4, win: [{ addEnhancement: true }], lose: [{ gold: -60 }] } }] },
            // [P2 中间档] 只摸底座：风险与收益都小
            { label: '只摸底座', effects: [{ gamble: { prob: 0.6, win: [{ gold: 30 }], lose: [{ gold: -20 }] } }] },
        ],
    },

    // ═══════════════ ⑤ 强制型 Forced（无选择纯结果 · **保持单选**：这正是它的设计价值） ═══════════════
    {
        id: 'ev_time_vortex', type: 'forced', name: '逆流的裂隙', weight: 0.45, allowLeave: false,
        desc: '风从四面八方往里吹，碎屑却向外飞。你已经没有可以后退的方向了。',
        choices: [
            { label: '（被迫卷入）', effects: [{ forced: [[{ gold: 60 }], [{ addRandomCard: true }], [{ addEnhancement: true }]] }] },
        ],
    },
    {
        id: 'ev_wheel_of_fate', type: 'forced', name: '不可回避的转盘', weight: 0.15, allowLeave: false,
        desc: '转盘自己转了起来。它并不问你要不要参与——它只是需要有人在上面。',
        choices: [
            { label: '（被迫转动）', effects: [{ forced: [
                [{ hpPct: 30 }], [{ hpPct: -15 }], [{ gold: 80 }],
                [{ removeCards: 1 }], [{ polluteDeck: true }], [{ addEnhancement: true }],
            ] }] },
        ],
    },

    // ═══════════════ ⑥ 投资型 Investment（先付后赚·跨节点回报 · 稀有档） ═══════════════
    {
        id: 'ev_plant_hope', type: 'investment', name: '埋下的种子', weight: 0.45,
        desc: '你把金子埋进土里。没有人保证这里会长出东西——但土是温的。',
        choices: [
            { label: '付出 40 金播种', effects: [{ gold: -40, invest: { kind: 'battleWinGold', value: 80 } }] },
            // [P2 中间档] 少投少收
            { label: '只播一点点', effects: [{ gold: -20, invest: { kind: 'battleWinGold', value: 40 } }] },
        ],
    },
    {
        id: 'ev_entrust_relic', type: 'investment', name: '托付', weight: 0.45,
        desc: '「我现在拿不走它。」你说。那东西没有回答，只是收下了。',
        choices: [
            { label: '交出随机装备', effects: [{ removeEquipment: true, invest: { kind: 'enhancementRank' } }] },
            // [P2 中间档] 换成更直接的现金回报（不改机制：用现成的 battleWinGold）
            { label: '换一笔现金', effects: [{ removeEquipment: true, invest: { kind: 'battleWinGold', value: 60 } }] },
        ],
    },
    {
        id: 'ev_sacrifice_blessing', type: 'investment', name: '削身的祝祷', weight: 0.45,
        desc: '祷词要求你先变小一点。念完之后，你会比现在更轻，也更亮。',
        choices: [
            { label: '牺牲 6 点上限', effects: [{ maxHp: -6, invest: { kind: 'restHeal' } }] },
            // [P2 中间档] 少削上限，休息回血 ×1.5（[P4 残项] `invest.restHeal` 现已支持 value 倍率）
            { label: '只削 3 点', effects: [{ maxHp: -3, invest: { kind: 'restHeal', value: 1.5 } }] },
        ],
    },

    // ═══════════════ ⑦ 战斗型 Fight（可选挑战 · 传说档） ═══════════════
    {
        id: 'ev_ambush', type: 'fight', name: '早就等着的刀', weight: 0.15,
        desc: '寒光先到，人才到。他们没打算谈，只打算算账。',
        choices: [
            { label: '迎战强敌', effects: [{ fight: { reward: 'enhancement' } }] },
            { label: '贿赂绕开', effects: [{ gold: -60 }] },
        ],
    },
    {
        id: 'ev_arena', type: 'fight', name: '震耳的看台', weight: 0.15,
        desc: '欢呼声从四面压下来。宝座是空的——它在等人坐上去，或者等人被抬下去。',
        choices: [
            { label: '上台挑战', effects: [{ fight: { reward: 'choose2' } }] },
            // [P2 中间档] 不战斗，花小钱直接拿卡
            { label: '交 40 金入场费', effects: [{ gold: -40, addRandomCard: true }] },
        ],
    },

    // ═══════════════ ⑧ 改造型 Edit（牌组管理服务 · 普通档） ═══════════════
    {
        id: 'ev_camp_smith', type: 'edit', name: '篝火旁的匠人', weight: 1,
        desc: '「别急。」他敲了敲手里的东西，「我能让它多扛一次。也能让它不再占地方。」',
        choices: [
            { label: '花 30 金加固一张卡', effects: [{ gold: -30, upgradeCard: true }] },
            { label: '重铸（删一张卡）', effects: [{ removeCards: 1 }] },
        ],
    },
    {
        id: 'ev_purify_spring', type: 'edit', name: '洗牌的水', weight: 1,
        desc: '水面映出的牌组比手里少一张。你伸手进去，指尖凉得像被删掉了什么。',
        choices: [
            { label: '净化（扣 8 生命删卡）', effects: [{ removeCards: 1, hp: -8 }] },
            { label: '深度净化（扣 20% 生命删两张）', effects: [{ removeCards: 2, hpPct: -20 }] },
        ],
    },

    // ═══════════════ ⑨ 渐进风险型 Deep Echo（**新玩法** · 传说档）
    //   [2026-10-05 莉莉子 · 方案 P4 §3] 把参考里的 Dead Adventurer 做成"一次进入内的 push-your-luck"：
    //   · 每层代价递增（−8 / −12 / −16 / −20 % 上限生命），成功率递减（100 / 75 / 55 / 35 %）
    //   · **随时可收手**（收手即结算已积累的回声）；失手 ⇒ 只保底第 1 层
    //   · 每层回声 = 1 件装备；≥3 层时其中 1 件升级为迷宫强化
    //   · ⚠️ 全程在同一次进入内（节点照旧"完成即锁"）⇒ 不产生任何新的刷取路径
    {
        id: 'ev_deep_echo', type: 'deep', name: '深层回响', weight: 0.15,
        desc: '通道向下延伸，回声一层比一层清晰。你听见自己的名字被越念越近。',
        choices: [
            { label: '（回响会自动结算）', effects: [] },
        ],
        deepEcho: { layers: 4, probByLayer: [1, 0.75, 0.55, 0.35], costPctByLayer: [8, 12, 16, 20] },
    },

    // ═══════════════ ⑩ [2026-10-08 莉莉子] 瓦尔基里大赛（三选一 · **按难度整档**奖励）
    //   规格全文：技术手册/设计-瓦尔基里大赛事件.md
    //   ⚠️ 三档奖励是**整档替换**（走 `effectsByDifficulty`），不是倍率 —— 所以这里 `effects: []`
    //   ⚠️ 涉及的 9 个强化**全部已存在**（里芙/芬妮的神格神经载体 `divfx_lyfe_*` / `divfx_fenny_*`）
    //   ⚠️ 敌方强化**三档都有**（不是只有高难度），按程的表逐档写死
    {
        id: 'ev_valkyrie_arena', type: 'fight', name: '瓦尔基里大赛', weight: 0.45,
        desc: '瓦尔基里大赛的擂台中央还留着焦痕。两侧的应援灯牌已经同时亮起——芬妮和里芙打到第三局，裁判的旗子迟迟没有落下。',
        cg: 'valkyrie_arena', // [2026-10-08 莉莉子] 专属 CG（PlotCG_003.png，见 dialogueBg.EVENT_CG_IMAGES）
        choices: [
            {
                label: '支持里芙',
                story: '你举起了蓝色那块牌子。里芙没有回头，只把重心又压低了一点——接下来站在她对面的，是芬妮。',
                effects: [],
                effectsByDifficulty: {
                    normal: [
                        { addEnhancementFrom: ['divfx_lyfe_1', 'divfx_lyfe_2'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['fenny'], enemyEnhancements: ['divfx_fenny_1', 'divfx_fenny_2'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 1 } },
                    ],
                    secret: [
                        { addEnhancementFrom: ['divfx_lyfe_3', 'divfx_lyfe_4'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['fenny'], enemyEnhancements: ['divfx_fenny_3', 'divfx_fenny_4'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 2 } },
                    ],
                    topsecret: [
                        { addEnhancementFrom: ['divfx_lyfe_6'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['fenny'], enemyEnhancements: ['divfx_fenny_3', 'divfx_fenny_4', 'divfx_fenny_6'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 3 } },
                    ],
                },
            },
            {
                label: '支持芬妮',
                story: '你举起了金色那块牌子。芬妮朝观众席挥了挥手，聚光灯顺着她的手转了过去——接下来站在她对面的，是里芙。',
                effects: [],
                effectsByDifficulty: {
                    normal: [
                        { addEnhancementFrom: ['divfx_fenny_1', 'divfx_fenny_2'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe'], enemyEnhancements: ['divfx_lyfe_1', 'divfx_lyfe_2'] } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 1 } },
                    ],
                    secret: [
                        { addEnhancementFrom: ['divfx_fenny_3', 'divfx_fenny_4'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe'], enemyEnhancements: ['divfx_lyfe_3', 'divfx_lyfe_4'] } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 2 } },
                    ],
                    topsecret: [
                        { addEnhancementFrom: ['divfx_fenny_6'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe'], enemyEnhancements: ['divfx_lyfe_3', 'divfx_lyfe_4', 'divfx_lyfe_6'] } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 3 } },
                    ],
                },
            },
            {
                label: '在哪里参赛？',
                story: '你把牌子放回了兜里。既然两边都想赢，那就谁都不站——你走向擂台边的报名台，在自己的名字后面签了字。\n裁判终于落旗：下一个上场的，是你。',
                effects: [],
                effectsByDifficulty: {
                    normal: [
                        { addEnhancementFrom: ['divfx_lyfe_1', 'divfx_lyfe_2'] },
                        { addEnhancementFrom: ['divfx_fenny_1', 'divfx_fenny_2'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe', 'fenny'], enemyEnhancements: ['divfx_lyfe_1', 'divfx_lyfe_2', 'divfx_fenny_1', 'divfx_fenny_2'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 1 } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 1 } },
                    ],
                    secret: [
                        { addEnhancementFrom: ['divfx_lyfe_3', 'divfx_lyfe_4'] },
                        { addEnhancementFrom: ['divfx_fenny_3', 'divfx_fenny_4'] },
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe', 'fenny'], enemyEnhancements: ['divfx_lyfe_3', 'divfx_lyfe_4', 'divfx_fenny_3', 'divfx_fenny_4'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 2 } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 2 } },
                    ],
                    topsecret: [
                        { addEnhancementFrom: ['divfx_lyfe_6'] },
                        { addEnhancementFrom: ['divfx_fenny_6'] },
                        { addEnhancementFrom: ['enhance_century_reconciliation'] },   // 🎁 世纪和解（仅此可得）
                        { fight: { reward: 'choose2', opponentHeroKeys: ['lyfe', 'fenny'], enemyEnhancements: ['divfx_lyfe_3', 'divfx_lyfe_4', 'divfx_lyfe_6', 'divfx_fenny_3', 'divfx_fenny_4', 'divfx_fenny_6', 'enhance_century_reconciliation'] } },
                        { grantHeroCard: { heroKey: 'lyfe', equipCount: 3 } },
                        { grantHeroCard: { heroKey: 'fenny', equipCount: 3 } },
                    ],
                },
            },
        ],
    },
];

export const ROGUE_EVENT_BY_ID: Record<string, RogueEvent> = Object.fromEntries(ROGUE_EVENTS.map(e => [e.id, e]));

// 按类型分组（UI / 调试用）
export const ROGUE_EVENTS_BY_TYPE: Record<RogueEventType, RogueEvent[]> = Object.fromEntries(
    (['gift', 'trade', 'tradeoff', 'gamble', 'forced', 'investment', 'fight', 'edit', 'deep'] as RogueEventType[])
        .map(t => [t, ROGUE_EVENTS.filter(e => e.type === t)]),
) as Record<RogueEventType, RogueEvent[]>;

/** 事件类型 → 中文标签（弹窗标题用） */
export const ROGUE_EVENT_TYPE_LABELS: Record<RogueEventType, string> = {
    gift: '赠礼', trade: '交易', tradeoff: '抉择', gamble: '赌局',
    forced: '命运', investment: '投资', fight: '挑战', edit: '匠作', deep: '回响',
};

/** 稀有度 → 弹窗标签文案（[P2] 与 `rarityOfEvent` 配套） */
export const ROGUE_EVENT_RARITY_LABELS: Record<RogueEventRarity, string> = {
    common: '',        // 普通档不显示标签（避免弹窗噪音）
    rare: '✦ 稀有事件',
    legend: '✦✦ 传说事件',
};

/** 事件池抽取（去重：排除最近 seen 个，支持权重） */
export const rollRogueEvent = (seenIds: string[] = [], exclude: string[] = []): RogueEvent => {
    const pool = ROGUE_EVENTS.filter(e => !exclude.includes(e.id) && !seenIds.includes(e.id));
    const candidates = pool.length > 0 ? pool : ROGUE_EVENTS.filter(e => !exclude.includes(e.id));
    const total = candidates.reduce((s, e) => s + (e.weight ?? 1), 0);
    let roll = Math.random() * total;
    for (const e of candidates) {
        roll -= (e.weight ?? 1);
        if (roll < 0) return e;
    }
    return candidates[candidates.length - 1];
};
