// ==========================================
// 悖论迷宫 · 事件系统（数据层）
// [2026-08-28 莉莉子] 基于《参考-肉鸽事件设计.md》拟定第一批 23 个事件（8 类）。
//   叙事文本为占位（name/desc 可随时替换，机制不动）。结果用 RogueEventEffect 声明式表达，
//   由 App 层 handleRogueEvent 执行（映射到 useRoguelikeRun API）。
//   特殊类型：gamble 概率赌注 / forced 强制随机（无 Leave）/ invest 跨节点回报 /
//   fight 触发战斗 / fightDebuff 未来 N 场敌人强化。
// ==========================================

export type RogueEventType = 'gift' | 'trade' | 'tradeoff' | 'gamble' | 'forced' | 'investment' | 'fight' | 'edit';

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
    fight?: { reward: 'enhancement' | 'choose2' };                                   // 触发事件战斗（胜利奖励）
    fightDebuff?: { enemyHpBonus: number; fights: number };                           // 未来 N 场战斗敌人水晶 +生命
}

export type RogueInvestment = NonNullable<RogueEventEffect['invest']>; // 跨节点投资标记

export interface RogueEventChoice {
    label: string;       // 选项文案（占位叙事）
    effects: RogueEventEffect[];
}

export interface RogueEvent {
    id: string;
    type: RogueEventType;
    name: string;        // 标题（占位叙事）
    desc: string;        // 描述（占位叙事）
    weight?: number;     // 事件池抽取权重（默认 1）
    choices: RogueEventChoice[];
    allowLeave?: boolean; // 是否提供无惩罚离开（默认 true；强制型 false）
}

export const ROGUE_EVENTS: RogueEvent[] = [
    // ═══════════════ ① 赠礼型 Gift（免费纯收益） ═══════════════
    {
        id: 'ev_mystery_box', type: 'gift', name: '神秘宝箱', weight: 1,
        desc: '（占位叙事）一个上锁的古老宝箱静静立在角落。',
        choices: [
            { label: '开启宝箱', effects: [{ addEquipment: true }] },
            { label: '用力砸开', effects: [{ addRandomCard: true }] },
            { label: '守着它打盹', effects: [{ hpPct: 25 }] },
        ],
    },
    {
        id: 'ev_lucky_fountain', type: 'gift', name: '幸运喷泉', weight: 1,
        desc: '（占位叙事）一汪泛着微光的泉水，据说能带来好运。',
        choices: [
            { label: '畅饮泉水', effects: [{ hpPct: 30 }] },
            { label: '向泉祈祷', effects: [{ maxHp: 3 }] },
        ],
    },
    {
        id: 'ev_passing_merchant', type: 'gift', name: '路过的商人', weight: 1,
        desc: '（占位叙事）一位风尘仆仆的商人匆匆路过。',
        choices: [
            { label: '收下赠礼', effects: [{ addRandomCard: true }] },
            { label: '婉言谢绝', effects: [{ gold: 40 }] },
        ],
    },

    // ═══════════════ ② 交易型 Trade（付资源换资源） ═══════════════
    {
        id: 'ev_black_market', type: 'trade', name: '黑市商人', weight: 1,
        desc: '（占位叙事）蒙面的商人压低声音，亮出几件货品。',
        choices: [
            { label: '花 150 金买强化', effects: [{ gold: -150, addEnhancement: true }] },
            { label: '花 120 金买装备', effects: [{ gold: -120, addEquipment: true }] },
            { label: '花 80 金买卡牌', effects: [{ gold: -80, addRandomCard: true }] },
        ],
    },
    {
        id: 'ev_life_altar', type: 'trade', name: '生命祭坛', weight: 1,
        desc: '（占位叙事）一座吞噬生命的祭坛，以鲜血为酬。',
        choices: [
            { label: '献祭 6 点生命', effects: [{ hp: -6, addEnhancement: true }] },
            { label: '献祭 10 点生命', effects: [{ hp: -10, addEquipment: true }] },
        ],
    },
    {
        id: 'ev_mercenary', type: 'trade', name: '雇佣兵', weight: 1,
        desc: '（占位叙事）一名全副武装的雇佣兵愿意加入你。',
        choices: [
            { label: '花 50 金招募', effects: [{ gold: -50, addEquippedCard: true }] },
        ],
    },
    {
        id: 'ev_card_for_gold', type: 'trade', name: '以卡换金', weight: 1,
        desc: '（占位叙事）神秘的回收商愿意收购你牌组中的卡牌。',
        choices: [
            { label: '卖出一张卡', effects: [{ removeCards: 1, gold: 80 }] },
        ],
    },

    // ═══════════════ ③ 代价型 Trade-off（强奖励带负担） ═══════════════
    {
        id: 'ev_corrupt_chest', type: 'tradeoff', name: '腐化宝箱', weight: 1,
        desc: '（占位叙事）宝箱散发着不祥的气息，诱惑与危险并存。',
        choices: [
            { label: '强行开启', effects: [{ addEquipment: true, polluteDeck: true }] },
        ],
    },
    {
        id: 'ev_demon_pact', type: 'tradeoff', name: '恶魔契约', weight: 1,
        desc: '（占位叙事）恶魔伸出一只燃烧的手，契约就在眼前。',
        choices: [
            { label: '签下契约', effects: [{ gold: 60, addEnhancement: true, maxHp: -4 }] },
        ],
    },
    {
        id: 'ev_blood_gift', type: 'tradeoff', name: '血之馈赠', weight: 1,
        desc: '（占位叙事）一滴血液落下，换来不可多得的馈赠。',
        choices: [
            { label: '接受馈赠', effects: [{ addEquipment: true, addEnhancement: true, hpPct: -40 }] },
        ],
    },
    {
        id: 'ev_void_hunger', type: 'tradeoff', name: '饥渴的虚空', weight: 1,
        desc: '（占位叙事）虚空向你索取祭品，承诺予以回馈。',
        choices: [
            { label: '献上祭品', effects: [{ gold: 100, fightDebuff: { enemyHpBonus: 1, fights: 2 } }] },
        ],
    },

    // ═══════════════ ④ 赌注型 Gamble（概率赌一把） ═══════════════
    {
        id: 'ev_gambler_wheel', type: 'gamble', name: '赌徒轮盘', weight: 1,
        desc: '（占位叙事）转动的轮盘，命运在此一搏。',
        choices: [
            { label: '下注转轮', effects: [{ gamble: { prob: 0.5, win: [{ gold: 100 }], lose: [{ hp: -12 }] } }] },
        ],
    },
    {
        id: 'ev_unknown_potion', type: 'gamble', name: '未知药水', weight: 1,
        desc: '（占位叙事）一瓶成分不明的药水，喝下会怎样？',
        choices: [
            { label: '一饮而尽', effects: [{ gamble: { prob: 0.6, win: [{ addEnhancement: true }], lose: [{ hpPct: -20 }] } }] },
        ],
    },
    {
        id: 'ev_tottering_statue', type: 'gamble', name: '摇摇欲坠的雕像', weight: 1,
        desc: '（占位叙事）残破的雕像微微晃动，似乎藏着什么。',
        choices: [
            { label: '伸手触摸', effects: [{ gamble: { prob: 0.4, win: [{ addEnhancement: true }], lose: [{ gold: -60 }] } }] },
        ],
    },

    // ═══════════════ ⑤ 强制型 Forced（无选择纯结果） ═══════════════
    {
        id: 'ev_time_vortex', type: 'forced', name: '时间漩涡', allowLeave: false,
        desc: '（占位叙事）空间扭曲，你被卷入无法抗拒的漩涡。',
        choices: [
            { label: '（被迫卷入）', effects: [{ forced: [[{ gold: 60 }], [{ addRandomCard: true }], [{ addEnhancement: true }]] }] },
        ],
    },
    {
        id: 'ev_wheel_of_fate', type: 'forced', name: '命运转轮', allowLeave: false,
        desc: '（占位叙事）巨大的转轮缓缓转动，你无从逃避。',
        choices: [
            { label: '（被迫转动）', effects: [{ forced: [
                [{ hpPct: 30 }], [{ hpPct: -15 }], [{ gold: 80 }],
                [{ removeCards: 1 }], [{ polluteDeck: true }], [{ addEnhancement: true }],
            ] }] },
        ],
    },

    // ═══════════════ ⑥ 投资型 Investment（先付后赚·跨节点回报） ═══════════════
    {
        id: 'ev_plant_hope', type: 'investment', name: '播种希望', weight: 1,
        desc: '（占位叙事）埋下希望的种子，等待未来的收获。',
        choices: [
            { label: '付出 40 金播种', effects: [{ gold: -40, invest: { kind: 'battleWinGold', value: 80 } }] },
        ],
    },
    {
        id: 'ev_entrust_relic', type: 'investment', name: '托付遗物', weight: 1,
        desc: '（占位叙事）将一件遗物托付给神秘力量，换取未来更强。',
        choices: [
            { label: '交出随机装备', effects: [{ removeEquipment: true, invest: { kind: 'enhancementRank' } }] },
        ],
    },
    {
        id: 'ev_sacrifice_blessing', type: 'investment', name: '牺牲祝福', weight: 1,
        desc: '（占位叙事）以生命上限为祭，祈求旅途的庇护。',
        choices: [
            { label: '牺牲 6 点上限', effects: [{ maxHp: -6, invest: { kind: 'restHeal' } }] },
        ],
    },

    // ═══════════════ ⑦ 战斗型 Fight（可选挑战） ═══════════════
    {
        id: 'ev_ambush', type: 'fight', name: '遭遇埋伏', weight: 1,
        desc: '（占位叙事）黑影中传来刀锋的寒光——他们早就等着你了。',
        choices: [
            { label: '迎战强敌', effects: [{ fight: { reward: 'enhancement' } }] },
            { label: '贿赂绕开', effects: [{ gold: -60 }] },
        ],
    },
    {
        id: 'ev_arena', type: 'fight', name: '竞技场挑战', weight: 1,
        desc: '（占位叙事）欢呼声震天，冠军的宝座向你发出挑战。',
        choices: [
            { label: '上台挑战', effects: [{ fight: { reward: 'choose2' } }] },
        ],
    },

    // ═══════════════ ⑧ 改造型 Edit（牌组管理服务） ═══════════════
    {
        id: 'ev_camp_smith', type: 'edit', name: '篝火匠人', weight: 1,
        desc: '（占位叙事）老匠人在篝火旁叮当作响，愿意为你打磨装备。',
        choices: [
            { label: '花 30 金加固一张卡', effects: [{ gold: -30, upgradeCard: true }] },
            { label: '重铸（删一张卡）', effects: [{ removeCards: 1 }] },
        ],
    },
    {
        id: 'ev_purify_spring', type: 'edit', name: '净化之泉', weight: 1,
        desc: '（占位叙事）清冽的泉水能洗涤牌组中的杂质。',
        choices: [
            { label: '净化（扣 8 生命删卡）', effects: [{ removeCards: 1, hp: -8 }] },
            { label: '深度净化（扣 20% 生命删两张）', effects: [{ removeCards: 2, hpPct: -20 }] },
        ],
    },
];

export const ROGUE_EVENT_BY_ID: Record<string, RogueEvent> = Object.fromEntries(ROGUE_EVENTS.map(e => [e.id, e]));

// 按类型分组（UI / 调试用）
export const ROGUE_EVENTS_BY_TYPE: Record<RogueEventType, RogueEvent[]> = Object.fromEntries(
    (['gift', 'trade', 'tradeoff', 'gamble', 'forced', 'investment', 'fight', 'edit'] as RogueEventType[])
        .map(t => [t, ROGUE_EVENTS.filter(e => e.type === t)]),
) as Record<RogueEventType, RogueEvent[]>;

/** 事件类型 → 中文标签（弹窗标题用） */
export const ROGUE_EVENT_TYPE_LABELS: Record<RogueEventType, string> = {
    gift: '赠礼', trade: '交易', tradeoff: '抉择', gamble: '赌局',
    forced: '命运', investment: '投资', fight: '挑战', edit: '匠作',
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
