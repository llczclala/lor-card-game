/**
 * 敌方流派原型定义
 * 这里只定义"特征"，不包含随机生成的具体卡组列表
 */

export interface EnemyArchetype {
    id: string;
    name: string;          // 显示给玩家的流派名
    champion: string;      // 核心英雄 Key
    description: string;   // 描述文本

    // 核心卡牌: 无论随机过程如何，这些牌一定会出现在卡组里
    coreCards: string[];

    // 倾向性填充池: 生成器会优先从这里抽取卡牌来填充卡组
    // 如果这里不够，再去公共池(Logistics)捞
    preferredPool: string[];

    // [预留接口] 绑定的天启/海克斯效果 ID
    // 肉鸽模式下，遇到这个流派时，敌人会获得这些被动
    apocalypseTags: string[];

    // AI 性格倾向 (未来可用于微调 AI 权重)
    aiPersonality: 'aggressive' | 'control' | 'balanced';
}

export const ENEMY_ARCHETYPES: Record<string, EnemyArchetype> = {
    // --- 流派 A: 芬妮·绝对压力 ---
    'fenny_pressure': {
        id: 'fenny_pressure',
        name: "绝对压力",
        champion: 'fenny',
        description: "以芬妮为核心，携带大量高攻击与打击法术，试图快速通过碾压伤害击溃防线。",

        coreCards: [
            'fenny', 'fenny', 'fenny',           // 3张芬妮
            'fenny_ultimate', 'fenny_ultimate',  // 2张大招
            'fenny_strike', 'fenny_strike'       // 2张专属法术
        ],

        preferredPool: [
            // 这里填写高攻单位或打击类法术的 ID
            // 暂时使用测试卡或现有卡占位
            'test_impact', 'test_sniper'
        ],

        apocalypseTags: ['effect_overwhelm_aura'], // [预留] 全员碾压
        aiPersonality: 'aggressive'
    },

    // --- 流派 B: 里芙·速战速决 ---
    'lyfe_blitz': {
        id: 'lyfe_blitz',
        name: "速战速决",
        champion: 'lyfe',
        description: "以里芙为核心，利用低费单位铺场和快速攻击特性，在前期建立优势。",

        coreCards: [
            'lyfe', 'lyfe', 'lyfe',              // 3张里芙
            'lyfe_rush', 'lyfe_rush',            // 2张专属法术
            'prayer', 'prayer'                   // 2张低费Buff
        ],

        preferredPool: [
            // 这里填写低费单位 ID
            'test_volatile', 'test_echo'
        ],

        apocalypseTags: ['effect_quick_attack_aura'], // [预留] 全员先攻
        aiPersonality: 'aggressive'
    }
};