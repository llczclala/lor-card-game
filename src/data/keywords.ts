import type { Keyword } from '../types';

// [修正] 批量导入 36 个关键词图标
import icon0 from '../image/keyword/00.png';   // Overwhelm
import icon1 from '../image/keyword/01.png';   // Overwhelm
import icon2 from '../image/keyword/02.png';   // QuickAttack
import icon3 from '../image/keyword/03.png';   // Regeneration
import icon4 from '../image/keyword/04.png';   // Elusive
import icon5 from '../image/keyword/05.png';   // Challenger
import icon6 from '../image/keyword/06.png';   // Barrier
import icon7 from '../image/keyword/07.png';   // CantBlock
import icon8 from '../image/keyword/08.png';   // Lifesteal
import icon9 from '../image/keyword/09.png';   // Last Breath
import icon10 from '../image/keyword/10.png'; // Fearsome
import icon11 from '../image/keyword/11.png'; // Frostbite
import icon12 from '../image/keyword/12.png'; // Scout
import icon13 from '../image/keyword/13.png'; // Ephemeral
import icon14 from '../image/keyword/14.png'; // Stun
import icon15 from '../image/keyword/15.png'; // Tough
import icon16 from '../image/keyword/16.png'; // Double Attack
import icon17 from '../image/keyword/17.png'; // Support
import icon18 from '../image/keyword/18.png'; // Deadly
import icon19 from '../image/keyword/19.png'; // SpellShield
import icon20 from '../image/keyword/20.png'; // Silence
import icon21 from '../image/keyword/21.png'; // Berserk
import icon22 from '../image/keyword/22.png'; // Cleave
import icon23 from '../image/keyword/23.png'; // Thorns
import icon24 from '../image/keyword/24.png'; // Vanguard
import icon25 from '../image/keyword/25.png'; // Ambush
import icon26 from '../image/keyword/26.png'; // Plunder
import icon27 from '../image/keyword/27.png'; // Exposed
import icon28 from '../image/keyword/28.png'; // Shroud
import icon29 from '../image/keyword/29.png'; // Immobile
import icon30 from '../image/keyword/30.png'; // Reborn
import icon31 from '../image/keyword/31.png'; // Execute
import icon32 from '../image/keyword/32.png'; // Sniper
import icon33 from '../image/keyword/33.png'; // Volatile
import icon34 from '../image/keyword/34.png'; // Echo
import icon35 from '../image/keyword/35.png'; // Impact
import icon36 from '../image/keyword/36.png'; // Channel
import icon37 from '../image/keyword/37.png'; // Titan
import icon38 from '../image/keyword/38.png'; // CantAttack
import icon39 from '../image/keyword/39.png'; // Aura

export interface KeywordConfig {
    label: string;
    description: string;
    color: string;
    icon: string; // [新增] 图标路径字段
}

// 关键词数据库
export const KEYWORD_DB: Record<Keyword, KeywordConfig> = {
    // --- 1. 进攻性 (Offensive) ---
    'Overwhelm': {
        label: '碾压',
        description: '攻击时，超出阻挡者生命值的伤害会对敌方水晶造成打击。',
        color: 'red',
        icon: icon1
    },
    'QuickAttack': {
        label: '先攻',
        description: '进攻时会先造成伤害。如果击杀阻挡者，则不会受到反击。',
        color: 'yellow',
        icon: icon2
    },
    'Double Attack': {
        label: '连击',
        description: '进攻时打击两次：第一次为先攻，第二次为普通攻击。',
        color: 'orange',
        icon: icon16
    },
    'Scout': {
        label: '侦察',
        description: '每回合首次仅使用侦察单位进攻时，进攻后再次获得进攻机会。',
        color: 'emerald',
        icon: icon12
    },
    'Challenger': {
        label: '挑战者',
        description: '进攻时，可以将敌方单位拖入战场强制阻挡自己。',
        color: 'orange',
        icon: icon5
    },
    'Fearsome': {
        label: '凶恶',
        description: '只能被攻击力 3 或以上的单位阻挡。',
        color: 'purple',
        icon: icon10
    },
    'Berserk': {
        label: '狂暴',
        description: '当该单位击杀敌方单位并存活时，获得 +1/+1。',
        color: 'rose',
        icon: icon21
    },
    'Cleave': {
        label: '溅射',
        description: '进攻时，同时对阻挡者左右相邻的单位造成伤害。',
        color: 'red',
        icon: icon22
    },
    'Sniper': {
        label: '狙击',
        description: '进攻发起时，对阻挡者造成 1 点伤害。',
        color: 'cyan',
        icon: icon32
    },
    'Impact': {
        label: '冲击',
        description: '进攻并打击时，对敌方水晶造成 1 点伤害。',
        color: 'red',
        icon: icon35
    },

    // --- 2. 防御/生存 (Defensive) ---
    'Regeneration': {
        label: '再生',
        description: '回合开始时，生命值完全恢复。',
        color: 'green',
        icon: icon3
    },
    'Barrier': {
        label: '屏障',
        description: '抵挡下一次受到的伤害。持续一回合。',
        color: 'yellow',
        icon: icon6
    },
    'SpellShield': {
        label: '魔免',
        description: '抵挡下一次敌方施放的法术或技能。',
        color: 'fuchsia',
        icon: icon19
    },
    'Tough': {
        label: '坚韧',
        description: '受到的所有伤害减少 1 点。',
        color: 'slate',
        icon: icon15
    },
    'Lifesteal': {
        label: '吸血',
        description: '造成的伤害将治疗我方水晶。',
        color: 'rose',
        icon: icon8
    },
    'Reborn': {
        label: '复生',
        description: '首次死亡时，移除此词条并以 1 点生命值复活。',
        color: 'amber',
        icon: icon30
    },
    'Thorns': {
        label: '反伤',
        description: '受到攻击伤害时，对攻击者造成 1 点伤害。',
        color: 'lime',
        icon: icon23
    },
    'Shroud': {
        label: '帷幕',
        description: '无法被敌方法术或技能指定为目标。',
        color: 'indigo',
        icon: icon28
    },

    // --- 3. 控制/干扰 (Control) ---
    'Frostbite': {
        label: '冻结',
        description: '本回合内将一个单位的攻击力设为 0。',
        color: 'cyan',
        icon: icon11
    },
    'Stun': {
        label: '眩晕',
        description: '将单位移出战斗，且本回合无法攻击或阻挡。',
        color: 'yellow',
        icon: icon14
    },
    'Silence': {
        label: '沉默',
        description: '移除单位的所有关键词、技能文本和增益效果。',
        color: 'neutral',
        icon: icon20
    },
    'Deadly': {
        label: '剧毒',
        description: '造成的任何伤害都会直接消灭目标。',
        color: 'green',
        icon: icon18
    },
    'Execute': {
        label: '处决',
        description: '打击生命值低于自身攻击力的单位时，直接将其消灭。',
        color: 'red',
        icon: icon31
    },
    'Immobile': {
        label: '哨兵',
        description: '无法进攻，也无法格挡。',
        color: 'stone',
        icon: icon29
    },
    'CantAttack': {
        label: '无法攻击',
        description: '进入战场时攻击力归零，无法造成伤害。',
        color: 'gray',
        icon: icon38
    },

    // --- 4. 战术/资源 (Tactical) ---
    'Elusive': {
        label: '隐秘',
        description: '只能被拥有隐秘的单位阻挡。',
        color: 'violet',
        icon: icon4
    },
    'CantBlock': {
        label: '无法格挡',
        description: '该单位不能进行格挡。',
        color: 'gray',
        icon: icon7
    },
    'Last Breath': {
        label: '亡语',
        description: '死亡时触发特定效果。',
        color: 'emerald',
        icon: icon9
    },
    'Support': {
        label: '支援',
        description: '进攻时，给予右边的友军增益效果。',
        color: 'blue',
        icon: icon17
    },
    'Ephemeral': {
        label: '幻象',
        description: '打击一次或回合结束时自动死亡。',
        color: 'purple',
        icon: icon13
    },
    'Vanguard': {
        label: '先锋',
        description: '若为本回合打出的第一张牌，触发额外效果。',
        color: 'amber',
        icon: icon24
    },
    'Ambush': {
        label: '伏击',
        description: '若为本回合打出的非第一张牌，触发额外效果。',
        color: 'zinc',
        icon: icon25
    },
    'Plunder': {
        label: '劫掠',
        description: '若本回合已对敌方水晶造成伤害，打出时触发效果。',
        color: 'yellow',
        icon: icon26
    },
    'Exposed': {
        label: '暴露',
        description: '可以被敌方任意单位挑战（强制阻挡）。',
        color: 'orange',
        icon: icon27
    },
    'Volatile': {
        label: '瞬逝',
        description: '回合结束时若未打出，自动从手牌弃置。',
        color: 'orange',
        icon: icon33
    },
    'Echo': {
        label: '回响',
        description: '打出时，在手牌生成一张该牌的瞬逝复制品。',
        color: 'cyan',
        icon: icon34
    },
    'Channel': {
        label: '充能',
        description: '召唤时恢复 1 点法术法力。',
        color: 'blue',
        icon: icon36
    },
    // --- 5. 泰坦造物 (Titan) ---
    'Titan': {
        label: '泰坦',
        description: '回合结束时，获得+X/+0，X为场上泰坦单位数量。然后此关键词黯淡。',
        color: 'cyan',
        icon: icon37
    },
    // --- 6. 能力 (Ability) ---
    'Ability': {
        label: '能力',
        description: '卡牌持有的独特能力，区别于关键词。',
        color: 'amber',
        icon: icon0
    },
    // --- 7. 光环 (Aura) ---
    'Aura': {
        label: '光环',
        description: '单位在场时持续生效的被动效果。',
        color: 'purple',
        icon: icon39
    }
};
// ==========================================
// [新增] 纯文本术语字典 (动作与时机词)
// ==========================================

export interface GlossaryConfig {
    label: string;
    description: string;
    color: string; // Tailwind 颜色基调，用于渲染富文本高亮
}

export const GLOSSARY_DB: Record<string, GlossaryConfig> = {
    // --- 时机词 ---
    '入场': {
        label: '入场',
        description: '当该单位从手牌被打出，或通过效果被召唤到战场时触发。',
        color: 'yellow'
    },
    '进攻': {
        label: '进攻',
        description: '当该单位被玩家拖入战场，并声明为攻击者时触发。',
        color: 'red'
    },
    '进攻时': { // 兼容部分文案的变体
        label: '进攻时',
        description: '当该单位被玩家拖入战场，并声明为攻击者时触发。',
        color: 'red'
    },
    '回合开始': {
        label: '回合开始',
        description: '在每个回合的最开始阶段自动触发。',
        color: 'emerald'
    },
    '阵亡时': {
        label: '阵亡时',
        description: '当该单位的生命值降至 0 或被处决消灭时触发。',
        color: 'purple'
    },

    // --- 动作词 ---
    '备战': {
        label: '备战',
        description: '立刻获得一个进攻标识。如果本回合尚未发起过进攻，你可以借此发起进攻。',
        color: 'orange'
    },
    '召唤': {
        label: '召唤',
        description: '通过法术或技能，将一个特定的单位直接放置到备战席或战场上。',
        color: 'blue'
    },
    '折返': {
        label: '折返',
        description: '将一个在场上的单位强制移回手牌，并清除其受到的所有伤害与临时状态。',
        color: 'cyan'
    },
    '复制': {
        label: '复制',
        description: '创造一个目标卡牌的精准副本，包含其当前的面板数值和所有的状态词条。',
        color: 'fuchsia'
    },
    '抉择': {
        label: '抉择',
        description: '打出该卡牌时，可以从数个不同的选项（形态或法术）中选择一项来发动。',
        color: 'amber'
    },
    '打击': {
        label: '打击',
        description: '利用自身的攻击力，对目标（单位或水晶）造成等量的物理伤害。',
        color: 'rose'
    }
};