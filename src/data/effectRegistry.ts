/**
 * Snowbreak Rivals - 法术效果注册表
 */

export type EffectClass =
    | 'STRIKE' | 'SUMMON' | 'BUFF' | 'FATES_CHOICE' | 'RALLY' | 'CLONE_AND_SUMMON'; // [新增] CLONE_AND_SUMMON 克隆并召唤指令

export type EffectTiming =
    | 'ON_PLAY' | 'ON_ATTACK' | 'ON_BLOCK' | 'ROUND_START' | 'ON_SEEN' | 'ON_ATTACK_DECLARE'; // [新增] ON_ATTACK_DECLARE 攻击宣告钩子

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
    summonKey?: string;              // [新增] 召唤物的卡牌 Key
    summonZone?: 'bench' | 'combat'; // [新增] 召唤的降落点（备战席 或 交战区）
    presenceRequirement?: string[];  // [新增] 通用在场条件扫描名单 (写入需要的卡牌 Key)
    targetKeyRequirement?: string[]; // [新增] 定向发牌白名单：只给拥有这些 Key 的单位发放 Buff

    // =====================================
    // [新增] 动态溅射引擎参数 (Splash Strike Engine)
    // =====================================
    splashAdjacent?: boolean;    // 是否开启相邻左右单位的溅射伤害
    bonusValue?: number;         // 当满足特定 condition 时，主目标替换的强化伤害值
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


    // --- [新增] 卜卜小技能：镜涌万象 (动态溅射打击) ---
    'effect_pupu_specular_soul_rush': {
        id: 'effect_pupu_specular_soul_rush',
        name: '镜涌万象',
        description: '选择一名敌人，对他及其左右两边的单位，各造成1点伤害。若本回合卜卜已经打击过一次，则改为对所选目标造成2点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST', // 常规伤害法术通常为快速
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位作为中心目标' }
        ],
        params: {
            value: 1,                    // 基础伤害 1 (也是溅射伤害)
            splashAdjacent: true,        // 开启相邻单位溅射
            condition: 'pupu_strike_check', // 触发增伤的暗号 (寻找打击过的卜卜)
            bonusValue: 2                // 满足条件后，主目标伤害升级为 2
        }
    },

    // --- [新增] 卜卜大招：吉煞映照 ---
    'effect_pupu_specular_soul_ultimate': {
        id: 'effect_pupu_specular_soul_ultimate',
        name: '吉煞映照',
        description: '本回合给予 卜卜 灵鉴 [连击]。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友军' } // 引擎会扫过全队，交由下方的白名单精准拦截
        ],
        params: {
            power: 0,
            health: 0,
            duration: 'ROUND',
            keywords: ['Double Attack'],
            targetKeyRequirement: ['pupu_specular_soul'] // [核心] 专属定向发牌白名单！
        }
    },

    // --- [新增] 测试：卜卜攻击宣告 ---
    'effect_test_pupu_attack': {
        id: 'effect_test_pupu_attack',
        name: '灵鉴之冲',
        description: '攻击宣告时，召唤一个处于进攻状态的【镜爻】。',
        class: 'SUMMON',             // [修改] 从 BUFF 变更为 SUMMON
        timing: 'ON_ATTACK_DECLARE', // 精准挂载到我们在 useGameState 里面埋好的钩子
        speed: 'BURST',              // 触发类能力通常按 Burst 结算
        targetRequirements: [],      // 因为在底层的 commitAttack 里直接作用于自身，不需要选取目标
        params: { summonKey: 'Mirror', summonZone: 'combat' } // [修改] 指定召唤的实体为“镜爻”，并空降交战区！
    },

    // --- [新增] 机制 4：2 级卜卜专属状态复刻 ---
    'effect_pupu_level2_attack': {
        id: 'effect_pupu_level2_attack',
        name: '镜爻·复刻',
        description: '攻击宣告时，召唤一个完全复制自身当前身材与增益的【镜爻·卜卜】参与进攻，且该分身具有【瞬息】。',
        class: 'CLONE_AND_SUMMON',   // [核心] 调用刚注册的完美复印机分类
        timing: 'ON_ATTACK_DECLARE', // 依然挂载在攻击宣告钩子上
        speed: 'BURST',
        targetRequirements: [],      // 自动以触发该效果的施法者（本体）为数据源
        params: {
            summonKey: 'Mirror_pupu', // 指定产出的卡牌模板为“镜爻 卜卜”
            summonZone: 'combat',     // 直接空降交战区
        }
    },

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
    // 强袭 (Fenny Strike) - 自动目标 (芬妮)
    'effect_fenny_attack_lv1': {
        id: 'effect_fenny_attack_lv1',
        name: '芬妮1级成长',
        class: 'BUFF',
        timing: 'ON_ATTACK_DECLARE',
        targetRequirements: [{ type: 'SELF', count: 1 }],
        params: { condition: 'fenny_first_attack_lv1' }
    },
    // [新增] 2级首次进攻
    'effect_fenny_attack_lv2': {
        id: 'effect_fenny_attack_lv2',
        name: '芬妮2级成长',
        class: 'BUFF',
        timing: 'ON_ATTACK_DECLARE',
        targetRequirements: [{ type: 'SELF', count: 1 }],
        params: { condition: 'fenny_first_attack_lv2' }
    },
    // 强袭 (Fenny Strike) -> 星光之途 (折返与屏障)
    'effect_fenny_strike': {
        id: 'effect_fenny_strike',
        name: '星光之途',
        description: '给予芬妮屏障并折返。',
        class: 'RECALL', // [新增] 专门的折返类机制
        timing: 'ON_PLAY',
        speed: 'FAST', // [修正] 3费快速
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择我方芬妮', filterKey: 'fenny' }
        ],
        params: {
            keywords: ['Barrier'] // 附带屏障
        }
    },
    // 绝对主角
    'effect_fenny_ultimate': {
        id: 'effect_fenny_ultimate',
        name: '绝对主角',
        description: '芬妮单向打击一个敌方单位。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW', // [修正] 7费慢速
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择我方芬妮', filterKey: 'fenny' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: {
            strikeMode: 'ONE_WAY' // 法术自带的碾压通过引擎检测攻击者的自带词条即可
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
    },

    // --- [新增] 后勤 2：伊莉斯 (机器人引擎) ---
    'effect_elice_robot_engine': {
        id: 'effect_elice_robot_engine',
        name: '无人机调度程序',
        description: '自带1层充能。目睹敌方水晶受伤时充满1层。满充能且本回合未召唤时，消耗充能召唤1个侦察机器人。',
        class: 'SUMMON',
        // [核心] 因为她的逻辑已经变成了状态机，我们需要让她在入场(ON_PLAY)和回合开始(ROUND_START)时都进行一次安检
        timing: 'ON_PLAY_AND_ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'Elice_scope_robot',
            summonZone: 'bench',
            condition: 'elice_charge_check' // 埋入暗号：交由底层微队列和处理器进行状态机判定
        }
    },

    // --- [新增] 后勤 3：歌莉娅 条件终结技 ---
    'effect_golia_buff': {
        id: 'effect_golia_buff',
        name: '高能碳水补给',
        description: '打出；若我方场上存在【卜卜 灵鉴】，我方全体单位本回合获得 +2/+0 与【碾压】。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友军' }
        ],
        params: {
            power: 2,
            health: 0,
            duration: 'ROUND',
            keywords: ['Overwhelm'],
            presenceRequirement: ['pupu_specular_soul'] // [核心] 传入名单，彻底告别硬编码！
        }
    },
    // --- [新增] 后勤 1：梅贝尔 (导游检索引擎) ---
    'effect_mabel_tutor': {
        id: 'effect_mabel_tutor',
        name: '导游向导',
        description: '入场时，将牌库中一张【卜卜 灵鉴】置于牌库顶。',
        class: 'TUTOR', // [新增] 全新的类：检索
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'pupu_specular_soul' // 借用 summonKey 字段作为“检索目标”
        }
    }
};

export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};