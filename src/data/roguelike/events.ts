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
    /**
     * [2026-10-10 莉莉子 · 程实测] 选项提示的**手写覆盖**。
     *   给了就用它，不再走 `previewEffects` 自动生成。
     *   两个用途（都是程实测点名要的）：
     *     ① 一个选项里挂了多个同类奖励时，自动生成会把「可能获得丰厚的奖励」重复写好几次
     *        （瓦尔基里大赛就是 3 个效果）⇒ 这里写成**一句概括**；
     *     ② **同事件不同选项难度分档**（前两个"较难/丰厚" vs 第三个"极难/极其罕见"），
     *        自动生成只认效果、分不出这种差别。
     */
    hint?: string;
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
            { label: '撬开锁扣', effects: [{ addEquipment: true }],
              story: '锁扣断得很干脆。箱子里垫着旧衣物，最上面那件被单独包了三层——像是有人特意留给下一个人的。' },
            { label: '整箱搬走', effects: [{ addRandomCard: true }],
              story: '你把整箱扛上肩。走出很远才想起，你始终没看清箱底那行编号的最后两位。' },
            { label: '靠着它歇一会儿', effects: [{ hpPct: 25 }],
              story: '你背靠着箱子坐下。呼吸慢下来的时候，里面有什么轻轻挪动了一下——也可能是风。' },
        ],
    },
    {
        id: 'ev_lucky_fountain', type: 'gift', name: '不冻的泉', weight: 1,
        desc: '水在零下的空气里仍冒着热气。你听见水底有很轻的、像是感谢的声音。',
        choices: [
            { label: '畅饮', effects: [{ hpPct: 30 }],
              story: '水是甜的，甜得不像水。伤口边缘开始发烫、收拢，像被人从里面缝了起来。' },
            { label: '向水底致意', effects: [{ maxHp: 3 }],
              story: '你低下头。水面晃了一下，像是回礼。有什么东西从此留在你身上了——很轻，但一直在。' },
        ],
    },
    {
        id: 'ev_passing_merchant', type: 'gift', name: '匆匆的货郎', weight: 1,
        desc: '他不停看表，也看你的身后。「随便挑一样，」他说，「我得在天黑前离开这条道。」',
        choices: [
            { label: '收下赠礼', effects: [{ addRandomCard: true }],
              story: '他随手塞给你一样东西，转身就走，连谢都没让你说完。你摊开手，那东西比看上去重。' },
            { label: '婉言谢绝', effects: [{ gold: 40 }],
              story: '他愣了一下，然后笑了：「那就换点实在的。」几枚金币落进你掌心，还带着他手心的温度。' },
        ],
    },

    // ═══════════════ ② 交易型 Trade（付资源换资源 · 普通档） ═══════════════
    {
        id: 'ev_black_market', type: 'trade', name: '屏息的黑市', weight: 1,
        desc: '摊主压着嗓子报价，货都蒙着布。他收钱很快，找零更快——他不想让你看清任何一件。',
        choices: [
            { label: '买下蒙布最深的那件', effects: [{ gold: -150, addEnhancement: true }],
              story: '你把钱推过去，他把布掀开一条缝——刚好够你看清，又刚好不够你记住。' },
            { label: '买下那件硬的', effects: [{ gold: -120, addEquipment: true }],
              story: '这次是硬物。他让你隔着布掂了掂，才肯松手。' },
            { label: '买下唯一没蒙布的', effects: [{ gold: -80, addRandomCard: true }],
              story: '没蒙布的那件就摆在最外面。他大概觉得，有些东西本来也不需要藏。' },
        ],
    },
    {
        id: 'ev_life_altar', type: 'trade', name: '换血的祭坛', weight: 1,
        desc: '祭坛边缘刻着一行小字：「给我你的，我给你我的。」凹槽里还留着上一位的痕迹。',
        choices: [
            { label: '划开手掌', effects: [{ hp: -6, addEnhancement: true }],
              story: '血滴进凹槽，很快就不见了。祭坛回赠的东西从掌心的伤口里长出来，冰凉。' },
            { label: '把整条手臂压上去', effects: [{ hp: -10, addEquipment: true }],
              story: '你压下去的时候听见了自己骨头的声音。祭坛收得多，给得也多——它一向公道。' },
        ],
    },
    {
        id: 'ev_mercenary', type: 'trade', name: '待价而沽', weight: 1,
        desc: '他打量你的队伍，然后报了个价。「先付钱，」他说，「我不赊账，也不问你要去哪。」',
        choices: [
            { label: '当场付清', effects: [{ gold: -50, addEquippedCard: true }],
              story: '他数完钱，把一个名字报给你。那名字后来一直跟着你，直到它被用掉。' },
            // [P2 中间档] 小收益小代价
            { label: '让他把话说完', effects: [{ gold: -20, addRandomCard: true }],
              story: '他讲得很细，细到你已经不太想买了。最后花出去的那笔钱，更像是买他闭嘴。' },
        ],
    },
    {
        id: 'ev_card_for_gold', type: 'trade', name: '回收商', weight: 1,
        desc: '「什么都收，」他敲了敲秤盘，「尤其是你舍不得的那张。」',
        choices: [
            { label: '称一张给他', effects: [{ removeCards: 1, gold: 80 }],
              story: '他把牌放上秤盘，秤没动。他还是付了钱，收牌的动作比找零快得多。' },
            // [P2 中间档] 少拿钱，换一次刷新
            { label: '只挑最不值钱的', effects: [{ removeCards: 1, gold: 35, refresh: 1 }],
              story: '他挑了半天，最后叹了口气收下。「下次带点像样的。」他说，顺手多塞给你一样小东西。' },
        ],
    },

    // ═══════════════ ③ 代价型 Trade-off（强奖励带负担 · 稀有档） ═══════════════
    {
        id: 'ev_corrupt_chest', type: 'tradeoff', name: '渗液的箱子', weight: 0.45,
        desc: '锁眼在往外渗东西，气味说不上是甜还是腐。它明明是死的，却像还在呼吸。',
        choices: [
            { label: '强行开启', effects: [{ addEquipment: true, polluteDeck: true }],
              story: '你把手伸进去的时候，它没有抵抗。东西到手了，指缝里却沾上了别的东西——洗不掉的那种。' },
            // [P2 中间档] 不污染，但也拿不到装备
            { label: '只取表层', effects: [{ addRandomCard: true }],
              story: '你只拿了最上面那张。它在你手里慢慢干了，边角蜷起来，像是松了口气。' },
        ],
    },
    {
        id: 'ev_demon_pact', type: 'tradeoff', name: '灼手的契约', weight: 0.45,
        desc: '「签在这里。」它说。你注意到它的手也在烧——它似乎并不介意。',
        choices: [
            { label: '签下契约', effects: [{ gold: 60, addEnhancement: true, maxHp: -4 }],
              story: '签完字，你手背上多了一道烧痕。它说这是收据。' },
            // [P2 中间档] 少拿金、少削上限
            { label: '只借不签', effects: [{ gold: 30, maxHp: -2 }],
              story: '你把纸推开，只借了一半。它的手停在半空，收回去的时候比刚才暗了一点。' },
        ],
    },
    {
        id: 'ev_blood_gift', type: 'tradeoff', name: '回响的血契', weight: 0.45,
        desc: '你在自己的血里听见了未来的声音。它说可以给你更多——只要你现在就少一点。',
        choices: [
            { label: '接受馈赠', effects: [{ addEquipment: true, addEnhancement: true, hpPct: -40 }],
              story: '它给的比你想象的多。代价是之后才来的——你听见血从很远的地方往回退的声音。' },
            // [P2 中间档] 只要一件，代价减半
            { label: '只取一件', effects: [{ addEquipment: true, hpPct: -20 }],
              story: '你只拿了一件。它似乎有点失望，但还是按规矩收下了该收的那一份。' },
        ],
    },
    {
        id: 'ev_void_hunger', type: 'tradeoff', name: '饥饿的虚空', weight: 0.45,
        desc: '有什么东西在裂隙里咀嚼。它停下来，转向你——它闻到了「以后」的味道。',
        choices: [
            { label: '献上祭品', effects: [{ gold: 100, fightDebuff: { enemyHpBonus: 1, fights: 2 } }],
              story: '金子被裂隙吞进去，连声响都没有。它吃饱了，但它记住的是你的味道——之后每一场，它都会来蹭一口。' },
            // [P2 中间档] 少拿金，负担只持续一场
            { label: '只丢一小把', effects: [{ gold: 50, fightDebuff: { enemyHpBonus: 1, fights: 1 } }],
              story: '你只丢了一小把。它舔了舔，不耐烦地散去——它还会再来一次，就一次。' },
        ],
    },

    // ═══════════════ ④ 赌注型 Gamble（概率赌一把 · 稀有档） ═══════════════
    {
        id: 'ev_gambler_wheel', type: 'gamble', name: '静止的轮盘', weight: 0.45,
        desc: '轮盘停着，指针卡在两格之间。庄家早已不在，规则却还在运转——它仍旧收取代价。',
        choices: [
            { label: '下注转轮', effects: [{ gamble: { prob: 0.5, win: [{ gold: 100 }], lose: [{ hp: -12 }] } }],
              // 赌局结果在选择后才定 ⇒ 叙事只写"过程"，不剧透输赢
              story: '轮盘转起来的声音很干。指针在两格之间晃了很久，久到你开始怀疑，它是不是在等你自己选。' },
            // [P2 中间档] 小注：胜率更高、输赢都更小
            { label: '只押小注', effects: [{ gamble: { prob: 0.6, win: [{ gold: 40 }], lose: [{ hp: -6 }] } }],
              story: '你押得很少，轮盘也转得很敷衍。这一局，谁都没有认真。' },
        ],
    },
    {
        id: 'ev_unknown_potion', type: 'gamble', name: '没有标签的瓶子', weight: 0.45,
        desc: '液体在瓶里缓慢地转向你。它没有标签，但瓶身上有用指甲刻的两个字：「值得。」',
        choices: [
            { label: '一饮而尽', effects: [{ gamble: { prob: 0.6, win: [{ addEnhancement: true }], lose: [{ hpPct: -20 }] } }],
              story: '味道先是甜的，然后是铁锈味。瓶子空了，你只能等着身体给出答案。' },
            // [P2 中间档] 高胜率、低收益
            { label: '浅尝一口', effects: [{ gamble: { prob: 0.75, win: [{ gold: 40 }], lose: [{ hpPct: -10 }] } }],
              story: '你只抿了一小口。舌头麻了一下，然后只剩一点回甘——和一点别的什么。' },
        ],
    },
    {
        id: 'ev_tottering_statue', type: 'gamble', name: '将倾的石像', weight: 0.45,
        desc: '石像向你倾斜了几度，像是在低头。基座下压着东西，也压着它的重量。',
        choices: [
            { label: '伸手触摸', effects: [{ gamble: { prob: 0.4, win: [{ addEnhancement: true }], lose: [{ gold: -60 }] } }],
              story: '石像在你掌心下轻轻点了一下头。它究竟给什么、又或者从你身上拿走什么，要看你的手有多稳。' },
            // [P2 中间档] 只摸底座：风险与收益都小
            { label: '只摸底座', effects: [{ gamble: { prob: 0.6, win: [{ gold: 30 }], lose: [{ gold: -20 }] } }],
              story: '你只碰了碰底座。石像没有回应，但你的指尖沾了一层灰——灰下面有东西在动。' },
        ],
    },

    // ═══════════════ ⑤ 强制型 Forced（无选择纯结果 · **保持单选**：这正是它的设计价值） ═══════════════
    {
        id: 'ev_time_vortex', type: 'forced', name: '逆流的裂隙', weight: 0.45, allowLeave: false,
        desc: '风从四面八方往里吹，碎屑却向外飞。你已经没有可以后退的方向了。',
        choices: [
            { label: '（被迫卷入）', effects: [{ forced: [[{ gold: 60 }], [{ addRandomCard: true }], [{ addEnhancement: true }]] }],
              story: '你没有选择，所以也就没有犹豫。风把你往里推的时候，你已经在想等会儿会落在哪。' },
        ],
    },
    {
        id: 'ev_wheel_of_fate', type: 'forced', name: '不可回避的转盘', weight: 0.15, allowLeave: false,
        desc: '转盘自己转了起来。它并不问你要不要参与——它只是需要有人在上面。',
        choices: [
            { label: '（被迫转动）', effects: [{ forced: [
                [{ hpPct: 30 }], [{ hpPct: -15 }], [{ gold: 80 }],
                [{ removeCards: 1 }], [{ polluteDeck: true }], [{ addEnhancement: true }],
            ] }],
              story: '转盘自己转了起来。你盯着它，它也盯着你——它并不在意你有没有准备好。' },
        ],
    },

    // ═══════════════ ⑥ 投资型 Investment（先付后赚·跨节点回报 · 稀有档） ═══════════════
    {
        id: 'ev_plant_hope', type: 'investment', name: '埋下的种子', weight: 0.45,
        desc: '你把金子埋进土里。没有人保证这里会长出东西——但土是温的。',
        choices: [
            { label: '把金子埋下去', effects: [{ gold: -40, invest: { kind: 'battleWinGold', value: 80 } }],
              story: '你把金子按进土里，土是温的。没有人答应会长出什么，但你走的时候回头看了一眼。' },
            // [P2 中间档] 少投少收
            { label: '只埋一小撮', effects: [{ gold: -20, invest: { kind: 'battleWinGold', value: 40 } }],
              story: '你只埋了一小撮，动作很快，像是怕被谁看见。土盖上的时候，那点温度还在。' },
        ],
    },
    {
        id: 'ev_entrust_relic', type: 'investment', name: '托付', weight: 0.45,
        desc: '「我现在拿不走它。」你说。那东西没有回答，只是收下了。',
        choices: [
            { label: '把手里的那件放回去', effects: [{ removeEquipment: true, invest: { kind: 'enhancementRank' } }],
              story: '你把东西放在它面前。它没有回答，只是收下了——走出去很远，你才发觉手里空了。' },
            // [P2 中间档] 换成更直接的现金回报（不改机制：用现成的 battleWinGold）
            { label: '问它能不能折现', effects: [{ removeEquipment: true, invest: { kind: 'battleWinGold', value: 60 } }],
              story: '你问它能不能折现。它沉默了一会儿，然后给了你一个数字。你们都当作这很公平。' },
        ],
    },
    {
        id: 'ev_sacrifice_blessing', type: 'investment', name: '削身的祝祷', weight: 0.45,
        desc: '祷词要求你先变小一点。念完之后，你会比现在更轻，也更亮。',
        choices: [
            { label: '把整段祷词念完', effects: [{ maxHp: -6, invest: { kind: 'restHeal' } }],
              story: '念完最后一句，你确实变轻了。走路的步子轻得有点陌生，像踩在别人的影子上。' },
            // [P2 中间档] 少削上限，休息回血 ×1.5（[P4 残项] `invest.restHeal` 现已支持 value 倍率）
            { label: '只念前半段', effects: [{ maxHp: -3, invest: { kind: 'restHeal', value: 1.5 } }],
              story: '你念到一半就停了。祝祷没念完，但有一半已经落在你身上——这大概也够。' },
        ],
    },

    // ═══════════════ ⑦ 战斗型 Fight（可选挑战 · 传说档） ═══════════════
    {
        id: 'ev_ambush', type: 'fight', name: '早就等着的刀', weight: 0.15,
        desc: '寒光先到，人才到。他们没打算谈，只打算算账。',
        choices: [
            { label: '迎战强敌', effects: [{ fight: { reward: 'enhancement' } }],
              story: '你把东西放下，站直了。对方似乎有点意外，随即笑了一下——他等的就是这个。' },
            { label: '贿赂绕开', effects: [{ gold: -60 }],
              story: '你把钱递过去。他接得很快，让路让得很慢，全程都盯着你的背。' },
        ],
    },
    {
        id: 'ev_arena', type: 'fight', name: '震耳的看台', weight: 0.15,
        desc: '欢呼声从四面压下来。宝座是空的——它在等人坐上去，或者等人被抬下去。',
        choices: [
            { label: '上台挑战', effects: [{ fight: { reward: 'choose2' } }],
              story: '你踏上台阶，欢呼声立刻换了方向。空的宝座就在上面，它在等一个坐上去的人。' },
            // [P2 中间档] 不战斗，花小钱直接拿卡
            { label: '买一张入场券', effects: [{ gold: -40, addRandomCard: true }],
              story: '你买了票，坐进观众席。看台上人人都在喊，只有你在看那些喊不出来的人。' },
        ],
    },

    // ═══════════════ ⑧ 改造型 Edit（牌组管理服务 · 普通档） ═══════════════
    {
        id: 'ev_camp_smith', type: 'edit', name: '篝火旁的匠人', weight: 1,
        desc: '「别急。」他敲了敲手里的东西，「我能让它多扛一次。也能让它不再占地方。」',
        choices: [
            { label: '把东西递给他加固', effects: [{ gold: -30, upgradeCard: true }],
              story: '他接过去翻了两面，敲了敲，又敲了敲。火光照着他眯起来的眼睛——他心里已经有数了。' },
            { label: '让他熔掉一张', effects: [{ removeCards: 1 }],
              story: '你把牌递过去的时候犹豫了一下。他没催你。熔炉的门开着，里面什么都看不见。' },
        ],
    },
    {
        id: 'ev_purify_spring', type: 'edit', name: '洗牌的水', weight: 1,
        desc: '水面映出的牌组比手里少一张。你伸手进去，指尖凉得像被删掉了什么。',
        choices: [
            { label: '把手伸进水里', effects: [{ removeCards: 1, hp: -8 }],
              story: '水凉得像被删掉了什么。你抽回手时指尖还在，但你知道有一样东西留在下面了。' },
            { label: '整个人沉下去', effects: [{ removeCards: 2, hpPct: -20 }],
              story: '你把整个人沉了进去。水面映出的牌组比你手里少两张——你早有准备，但还是屏住了呼吸。' },
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
            { label: '（回响会自动结算）', effects: [],
              story: '回声一层比一层清晰。你听见自己的名字被越念越近——念到最后，它已经站在你旁边了。' },
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
                // [2026-10-10 程实测] 手写覆盖：这条选项挂了 3 个奖励效果，自动生成会把同一句写 3 遍
                hint: '进行一场较难的战斗，可能获得丰厚的奖励',
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
                // [2026-10-10 程实测] 手写覆盖（同"支持里芙"）
                hint: '进行一场较难的战斗，可能获得丰厚的奖励',
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
                // [2026-10-10 程实测] 手写覆盖：自己上场打**双人** ⇒ 难度与奖励都要与前两个选项区分开
                hint: '遭遇一场极难的战斗，可能获得极其罕见的奖励',
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
