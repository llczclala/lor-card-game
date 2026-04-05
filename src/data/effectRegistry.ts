/**
 * Snowbreak Rivals - 法术效果注册表
 */

export type EffectClass =
    | 'STRIKE' | 'SUMMON' | 'BUFF' | 'FATES_CHOICE' | 'RALLY';

export type EffectTiming =
    | 'ON_PLAY' | 'ON_ATTACK' | 'ON_BLOCK' | 'ROUND_START' | 'ON_SEEN';

export type EffectSpeed =
    | 'BURST' | 'FAST' | 'SLOW';

// [核心修改] 目标类型定义
export type TargetType =
    | 'ALLY_UNIT'       // 我方场上单位
    | 'ENEMY_UNIT'      // 敌方场上单位
    | 'ANY_UNIT'        // 任意场上单位
    | 'PLAYER_NEXUS'    // 我方水晶
    | 'ENEMY_NEXUS'     // 敌方水晶
    | 'ANY_TARGET'      // 任意可被指定的单位或水晶
    | 'ALLY_CHAMPION'   // 我方特定英雄
    | 'ALL_ALLIES'
    | 'SELF';

export interface TargetRequirement {
    type: TargetType;
    count: number;      // 需要选几个 (通常是 1)
    label: string;      // 播报给玩家的提示文字 (如 "选择一个敌方单位")
    filterKey?: string; // 额外过滤器，例如仅限 key='fenny'
}

// [修改] 扁平化参数结构，移除 buffs 嵌套，与 Processor 对齐
export interface EffectParams {
    value?: number;          // 伤害数值
    power?: number;          // Buff 攻击
    health?: number;         // Buff 血量
    keywords?: string[];     // Buff 词条
    duration?: 'ROUND' | 'PERMANENT';
    strikeMode?: 'MUTUAL' | 'ONE_WAY'; // [新增] 打击模式
    condition?: string;
}

export interface EffectDefinition {
    id: string;
    name: string;
    description: string;
    class: EffectClass;
    timing: EffectTiming;
    speed: EffectSpeed;
    targetRequirements: TargetRequirement[];
    params: EffectParams;
}

export const EFFECT_DB: Record<string, EffectDefinition> = {
    // --- 1. 单挑 (Single Combat) ---
    // 逻辑：选择我方 -> 选择敌方 -> 互击
    'effect_single_combat': {
        id: 'effect_single_combat',
        name: '单挑',
        description: '一个我方单位和一个敌方单位相互打击。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方单位' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: { strikeMode: 'MUTUAL' } // [新增] 互殴模式
    },
    // 奔袭 (Lyfe Rush) - 自动目标 (里芙)
    'effect_lyfe_rush': {
        id: 'effect_lyfe_rush',
        name: '无尽霜刃',
        description: '给予里芙 +1/+1。',
        class: 'BUFF', // [修正] GRANT -> BUFF
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
             // 暂时允许选任意友军，保证体验
            { type: 'ALLY_UNIT', count: 1, label: '选择目标' }
        ],
        params: {
            power: 1, health: 1, duration: 'ROUND' // [修正] 扁平化
        }
    },

    'effect_lyfe_ultimate': {
        id: 'effect_lyfe_ultimate',
        name: '吞噬神座',
        description: '快速：备战。',
        class: 'RALLY', // [修正] 改为 RALLY
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [], // 既然是全局效果，其实不需要选目标，或者保留 PLAYER_NEXUS 作为占位
        params: {} // 移除 condition 和 grantAttackToken
    },
    // 强袭 (Fenny Strike) - 自动目标 (芬妮)
    'effect_fenny_strike': {
        id: 'effect_fenny_strike',
        name: '星光之途',
        description: '给予芬妮 +2/+0。',
        class: 'BUFF', // [修正] GRANT -> BUFF
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择目标' }
        ],
        params: {
            power: 2, health: 0, duration: 'ROUND' // [修正] 扁平化
        }
    },

    'effect_fenny_ultimate': {
        id: 'effect_fenny_ultimate',
        name: '绝对主角',
        description: '芬妮打击一个敌方单位。', // 碾压由英雄自带能力提供
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择我方芬妮', filterKey: 'fenny' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: {
            strikeMode: 'ONE_WAY' // [新增] 单方面打击
        }
    },

    // --- 2. 祈愿 (Prayer) ---
    // 逻辑：选择我方 -> +1/+1
    'effect_prayer': {
        id: 'effect_prayer',
        name: '祈愿',
        description: '给予一个友军 +1/+1。',
        class: 'BUFF', // [修正] GRANT -> BUFF
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方单位' }
        ],
        params: {
            power: 1, health: 1, duration: 'PERMANENT' // [修正] 扁平化
        }
    },
    'effect_lyfe_rally_passive': {
        id: 'effect_lyfe_rally_passive',
        name: '里芙的压制',
        description: '回合开始：备战。',
        class: 'RALLY', // [关键] 使用新的备战类
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [], // 作用于全局，无需目标
        params: {} // RALLY 默认就是获得进攻权，无需参数
    },
    'effect_focus': {
        id: 'effect_focus',
        name: '专注',
        description: '慢速：备战。',
        class: 'RALLY', // [修正] 改为 RALLY
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {}
    },
    // --- 3. 暗箭 (Hidden Arrow) ---
    // 逻辑：选择任意目标 -> 打1
    'effect_hidden_arrow': {
        id: 'effect_hidden_arrow',
        name: '暗箭',
        description: '对一个单位或水晶造成 1 点伤害。',
        class: 'STRIKE', // [修正] DAMAGE -> STRIKE
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择任意目标' }
        ],
        params: { value: 1 }
    },
    'effect_inspire': {
        id: 'effect_inspire',
        name: '振奋',
        description: '全体 +3/+3',
        class: 'BUFF', // [修正] GRANT -> BUFF
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友军' } // [修正] 使用自动目标
        ],
        params: { power: 3, health: 3, duration: 'PERMANENT' } // [修正] 扁平化
    },
    'effect_destruction': {
        id: 'effect_destruction',
        name: '破坏',
        description: '打水晶 4',
        class: 'STRIKE', // [修正] DAMAGE -> STRIKE
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ENEMY_NEXUS', count: 1, label: '敌方水晶' }
        ],
        params: { value: 4 }
    }
};

export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};