/**
 * Snowbreak Rivals - 法术效果注册表
 */

export type EffectClass =
    | 'STRIKE' | 'SUMMON' | 'GRANT' | 'FATES_CHOICE' | 'RALLY' | 'DAMAGE';

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
    | 'ALLY_CHAMPION';  // 我方特定英雄 (用于芬妮斩将)

export interface TargetRequirement {
    type: TargetType;
    count: number;      // 需要选几个 (通常是 1)
    label: string;      // 播报给玩家的提示文字 (如 "选择一个敌方单位")
    filterKey?: string; // 额外过滤器，例如仅限 key='fenny'
}

export interface EffectParams {
    value?: number;
    buffs?: {
        power?: number;
        health?: number;
        keywords?: string[];
        duration?: 'round' | 'permanent';
    };
    condition?: string;
    // 移除 grantAttackToken，因为 RALLY 类型自带逻辑
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
        params: {}
    },
    // 奔袭 (Lyfe Rush) - 自动目标 (里芙)
    'effect_lyfe_rush': {
        id: 'effect_lyfe_rush',
        name: '奔袭',
        description: '给予里芙 +1/+1。',
        class: 'GRANT',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [], // 空数组表示自动执行，无需玩家点击
        params: {
            buffs: { power: 1, health: 1, duration: 'round' }
        }
    },
    'effect_lyfe_ultimate': {
        id: 'effect_lyfe_ultimate',
        name: '先登',
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
        name: '强袭',
        description: '给予芬妮 +2/+0。',
        class: 'GRANT',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            buffs: { power: 2, health: 0, duration: 'round' }
        }
    },
    'effect_fenny_ultimate': {
        id: 'effect_fenny_ultimate',
        name: '斩将',
        description: '芬妮打击一个敌方单位（附带碾压）。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            // 特殊需求：必须是芬妮
            { type: 'ALLY_CHAMPION', count: 1, label: '选择我方芬妮', filterKey: 'fenny' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: {
            buffs: { keywords: ['Overwhelm'] } // 临时赋予碾压
        }
    },
    // --- 2. 祈愿 (Prayer) ---
    // 逻辑：选择我方 -> +1/+1
    'effect_prayer': {
        id: 'effect_prayer',
        name: '祈愿',
        description: '给予一个友军 +1/+1。',
        class: 'GRANT',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方单位' }
        ],
        params: {
            buffs: { power: 1, health: 1, duration: 'permanent' }
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
        class: 'DAMAGE', // 使用 DAMAGE 类型
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择任意目标' }
        ],
        params: { value: 1 }
    },
    'effect_inspire': {
        id: 'effect_inspire', name: '振奋', description: '全体 +3/+3',
        class: 'GRANT', timing: 'ON_PLAY', speed: 'FAST',
        targetRequirements: [], // 全体效果通常不需要指定
        params: { buffs: { power: 3, health: 3 } }
    },
    'effect_destruction': {
        id: 'effect_destruction', name: '破坏', description: '打水晶 4',
        class: 'DAMAGE', timing: 'ON_PLAY', speed: 'SLOW',
        targetRequirements: [{type: 'ENEMY_NEXUS', count: 1, label: '自动目标'}], // 也可以做成自动
        params: { value: 4 }
    }
};

export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};