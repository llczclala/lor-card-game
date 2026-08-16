/**
 * Snowbreak Rivals - 法术效果注册表
 */

import type { Race, Keyword } from '../types';

export type EffectClass =
    | 'STRIKE' | 'SUMMON' | 'BUFF' | 'FATES_CHOICE' | 'RALLY' | 'CLONE_AND_SUMMON'
    | 'RECALL' | 'TUTOR'
    // [核心新增] 本次 5 大新法术所需的 3 个全新机制底层分类！
    | 'HEAL'               // 治疗类 (操作 damageTaken)
    | 'BUFF_EVERYWHERE'    // 全域光环类 (操作手牌/牌库/召唤事件)
    | 'RECALL_AND_REPLACE' // 撤回并替身替换类
    // [2026-06-27 暗箱操作] 两个独立基础机制
    | 'DISCARD'            // 弃牌类：从手牌移除指定卡牌
    | 'DRAW'               // 抽牌类：从牌库抽 N 张到手上
    | 'GENERATE'           // [布里吉] 生成类：生成一张卡牌到手牌
    | 'DISCARD_AND_SUMMON' // [布里吉] 弃牌并召唤类：弃任意数量手牌后召唤衍生物
    | 'CLONE_TO_DECK'      // [诗人] 克隆类：选择手牌中的一张卡牌，复制N张洗入牌库
    // [2026-07-14 锻造者] 三个全新机制底层分类
    | 'COST_REDUCE'        // [锻造者] 减费类：降低手牌中某张卡牌的费用
    | 'SUMMON_FROM_HAND'   // [锻造者] 从手牌召唤类：选择手牌单位并召唤到战场
    | 'SPELL_DAMAGE_AURA' // [锻造者] 法术增伤光环类：全局法术伤害+1
    | 'GRANT_MANA'        // [梵音] 额外法力类：本回合获得额外法力值
    | 'CALIBRATE'          // [鸦眼] 校准类：从牌库选4张，选1张放顶部
    | 'DECK_BUFF'          // [达努/鸦眼] 牌库强化类：对牌库内单位/法术施加buff
    | 'FLYING_SWORD'        // [2026-07-26 安卡希雅] 飞剑类：召唤X个飞剑衍生物并立即发起进攻
    | 'PLACEHOLDER'         // [2026-08-05 莉莉子] 占位类：逻辑未实现时安全空转，用于暂未完成逻辑的新法术
    | 'TITAN_PULSE'         // [2026-08-05 莉莉子] 泰坦脉冲类：立刻触发己方泰坦脉冲（法术4）
    | 'TITAN_RELIGHT'       // [2026-08-05 莉莉子] 泰坦点亮类：移除己方泰坦黯淡关键词（法术3）
    | 'BURNOUT_SUMMON'      // [2026-08-05 莉莉子] 燃尽召唤类：消耗全部法力、按燃尽值随机召唤泰坦（法术12）
    | 'NEGATE'              // [2026-08-05 莉莉子] 无效化类：从法术堆叠移除目标法术（法术8/6/7）
    | 'RESURRECT'           // [2026-08-06 莉莉子] 复活类：从墓地复活最强N个单位并附幻象（法术2）

export type EffectTiming =
    | 'BURST' | 'FAST' | 'SLOW'
    | 'ON_PLAY' | 'ON_ATTACK_DECLARE' | 'ON_ATTACK' | 'LAST_BREATH'
    | 'ROUND_START' | 'ROUND_END' | 'ON_PLAY_AND_ROUND_START'
    | 'ON_FIRST_NEXUS_STRIKE'
    | 'ON_NEXUS_STRIKE'      // [2026-07-14 锻造者] 每次打击水晶时触发（不限于首次）
    | 'ON_DAMAGE_SURVIVE'    // [达努] 受伤并存活时触发
    | 'ON_FRIENDLY_DAMAGED'  // [达努] 友方单位被伤害时触发（光环）
    | 'ON_FIRST_ATTACK'      // [达努] 首次进攻时触发
    | 'POST_COMBAT'          // [达努] 战斗结算后触发（存活判定）
    | 'ON_FIRST_ROUND_END'   // [鸦眼] 首次回合结束时触发
    | 'ON_GET_ATTACK_TOKEN'; // [安卡希雅] 获得进攻标识时触发

// [2026-08-06 莉莉子] 法术速度定义（注册表 speed 字段）
export type EffectSpeed = 'BURST' | 'FAST' | 'SLOW';

// [核心修改] 目标类型定义
export type TargetType =
    | 'ALLY_UNIT'       // 我方场上单位
    | 'ENEMY_UNIT'      // 敌方场上单位
    | 'ANY_UNIT'        // 任意场上单位
    | 'PLAYER_NEXUS'    // 我方水晶
    | 'ENEMY_NEXUS'     // 敌方水晶
    | 'ANY_TARGET'      // 任意可被指定的单位或水晶
    | 'ALLY_CHAMPION'   // 我方特定英雄
    | 'HAND_CARD'       // [2026-06-27] 手牌中的卡牌（用于弃牌、检索等）
    | 'ALL_ALLIES'
    | 'SELF'
    | 'SPELL_ON_STACK'  // [2026-08-05 莉莉子] 法术堆叠中的法术（反制/无效化目标，法术6/7）

export interface TargetRequirement {
    type: TargetType;
    count: number;      // 需要选几个 (通常是 1)
    label: string;      // 播报给玩家的提示文字 (如 "选择一个敌方单位")
    filterKey?: string; // 额外过滤器，例如仅限 key='fenny'
    raceFilter?: Race[]; // [新增] 种族过滤器，例如 ['summoner', 'summon']
    keywordFilter?: string[]; // [2026-07-07 新增] 关键词过滤，例如 ['Ephemeral'] 要求目标拥有幻象
    cardTypeFilter?: 'unit' | 'spell'; // [2026-07-14 锻造者] 手牌选择时的卡牌类型过滤
    stackCostBelow?: number;      // [2026-08-05 莉莉子] SPELL_ON_STACK 目标费用上限（不含）
    stackSpeedFilter?: string[];  // [2026-08-05 莉莉子] SPELL_ON_STACK 目标速度白名单（如 ['spell-fast']）
}

// [修改] 扁平化参数结构，移除 buffs 嵌套，与 Processor 对齐
export interface EffectParams {
    value?: number;          // 伤害数值
    power?: number;          // Buff 攻击
    health?: number;         // Buff 血量
    keywords?: string[];     // Buff 词条
    removeKeywords?: string[]; // [新增] 要移除的关键词（用于蟾鉴易纹等关键词转移）
    duration?: 'ROUND' | 'PERMANENT';
    strikeMode?: 'MUTUAL' | 'ONE_WAY'; // [新增] 打击模式
    condition?: string;
    summonKey?: string;              // [新增] 召唤物的卡牌 Key
    summonZone?: 'bench' | 'combat'; // [新增] 召唤的降落点（备战席 或 交战区）
    presenceRequirement?: string[];  // [新增] 通用在场条件扫描名单 (写入需要的卡牌 Key)
    targetKeyRequirement?: string[]; // [新增] 定向发牌白名单：只给拥有这些 Key 的单位发放 Buff
    raceFilter?: Race[];             // [新增] 种族过滤器：只给指定种族的单位发放效果

    // =====================================
    // [新增] 动态溅射引擎参数 (Splash Strike Engine)
    // =====================================
    splashAdjacent?: boolean;    // 是否开启相邻左右单位的溅射伤害
    bonusValue?: number;         // 当满足特定 condition 时，主目标替换的强化伤害值
    // =====================================
    // [新增] 进阶目标筛选与光环参数
    // =====================================
    targetCondition?: string;    // 目标前置筛选条件 (例如: 'injured', 'power_less_than_3', 'in_combat')
    everywhere?: boolean;        // 标记该 BUFF 是否具有【各处】(Everywhere) 传染性
    onDamagedGenerate?: string;  // [新增] 受伤时生成的卡牌 Key
    buffTag?: string;            // [2026-06-27] Buff 标签，用于 buffRules 过滤匹配
    roundEndAttack?: boolean;    // [新增] 回合结束时是否触发基于攻击力的随机打击
    summonCount?: number;        // [新增] 亡语/效果生成卡牌的数量（默认1）

    // =====================================
    // [新增] 猫汐尔专属：牌库光环与回合末鞭策
    // =====================================
    deckAuraSummon?: string;     // [新增] 库效召唤：回合开始时，若场上没有该Key的单位，则召唤一个
    gameStartGenerate?: string;  // [安卡希雅] 牌局开始：生成指定卡牌到手牌
    isVolatile?: boolean;        // [安卡希雅] 生成的卡牌带上易逝(Volatile)关键词
    roundEndSelfDamageBuff?: {   // [新增] 回合末鞭策：对我方指定单位造成伤害并强化
        targetKey: string;
        damage: number;
        power: number;
        health: number;
        hitAll?: boolean;        // [新增] Lv2: 若为 true，则命中所有符合条件的单位而非随机一个
    };
    roundEndBuff?: boolean;      // [新增] 回合结束时执行群体BUFF（如清泉医疗鳄）
    buffCounterKey?: string;     // [新增] BUFF计数器的归属卡牌Key（用于累计BUFF次数）
    buffThreshold?: number;      // [新增] 达到多少次BUFF后触发奖励
    buffRewardKey?: string;      // [新增] 达到阈值后生成的奖励卡牌Key
    // [2026-07-14 锻造者] 法术增伤光环参数
    spellDamageBuff?: number;    // 法术增伤光环：对所有法术伤害的额外加成
    triggerOnPlay?: boolean;     // [白猎] 从手牌召唤时是否触发入场效果
    placeholder?: boolean;       // [2026-08-05 莉莉子] 占位标记：逻辑未实现的效果条目专用
    // [2026-08-05 莉莉子] 燃尽召唤 / 无效化参数
    useBurnout?: boolean;        // 燃尽：消耗全部法力后按燃尽值召唤泰坦（法术12）
    negateAllEnemies?: boolean;  // NEGATE：无效化堆叠中所有敌方法术（法术8）
    stackCostBelow?: number;     // SPELL_ON_STACK 目标费用上限（不含，法术6）
    stackSpeedFilter?: string[]; // SPELL_ON_STACK 目标速度白名单（法术6/7）
    // [2026-08-06 莉莉子] 接口字段补齐：历史效果新增参数统一登记
    generateKey?: string;        // 生成卡牌 Key
    placeOnTop?: boolean;        // 检索/生成目标放牌库顶
    maxCost?: number;            // 费用上限过滤
    sacrificeValue?: number;     // 献祭/自损数值
    targetAllUnits?: boolean;    // 全场单位 AOE（含双方）
    targetAllAllies?: boolean;   // 全体友方
    targetAllEnemies?: boolean;  // 全体敌方
    targetCombatOnly?: boolean;  // 仅交战区
    targetEnemyNexus?: boolean;  // 目标敌方水晶
    targetFilter?: string;       // 目标过滤暗号
    excludeSelf?: boolean;       // 排除施法者自身
    allAlliesBuff?: { power?: number; health?: number };     // 全体友方增益
    allEnemiesDebuff?: { power?: number; health?: number };  // 全体敌方削弱
    ownerSide?: boolean;         // Buff 侧别（默认己方）
    calibrateCount?: number;     // 校准选牌数量
    count?: number;              // 通用数量
    grantMaxMana?: boolean;      // 授予最大法力
    useDiscardCount?: boolean;   // 亡语弃牌计数
    costReduceSpell?: boolean;   // 减费法术标记
    spellCostReduce?: number;    // 法术减费数值
    discardCountMode?: string;   // 弃牌计数模式
    firstAttackOnly?: boolean;   // 仅首次攻击
    returnToHand?: boolean;      // 撤回回手牌
    excludeKeys?: string[];      // 按 key 排除目标单位
    nexusFallback?: boolean;     // 无合法目标时回退水晶
    targetType?: string;         // 目标类型
    reduceCostIfDuplicate?: boolean; // 手牌重复减费
    freezeAllEnemies?: boolean;  // 冻结全体敌方
    selfDamage?: number;         // 反噬契约：效果执行后对施法者自身造成 N 点伤害
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
    /** [2026-07-07] 效果动画预算时长(ms)，用于多效果链式演出的自动时序编排 */
    animationDuration?: number;
    /** [2026-07-21] 对局记录配置 — 自动追踪目标状态变化生成记录 */
    record?: {
        /** 概要模板，支持 {paramName} 占位符，如 "造成 {value} 点伤害" */
        summary?: string;
        /** 是否追踪目标 HP/damageTaken 变化 */
        trackTargets?: boolean;
    };
}

export const EFFECT_DB: Record<string, EffectDefinition> = {


    // --- [新增] 卜卜小技能：镜涌万象 (动态溅射打击) ---
    'effect_pupu_specular_soul_rush': {
        id: 'effect_pupu_specular_soul_rush',
        name: '镜涌万象',
        description: '选择一个敌方单位，对其及其左右两边的单位，各造成1点伤害。若本回合卜卜已经打击过一次，则改为对所选目标造成2点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST', // 常规伤害法术通常为快速
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个单位作为中心' }
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
            { type: 'ALL_ALLIES', count: 0, label: '全体友方单位' } // 引擎会扫过全队，交由下方的白名单精准拦截
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
        description: '一个友方单位和一个敌方单位相互打击。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个友方单位' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: { strikeMode: 'MUTUAL' } // [新增] 互殴模式
    },
    // 奔袭 (Lyfe Rush) - 自动目标 (里芙)
    'effect_lyfe_rush': {
        id: 'effect_lyfe_rush',
        name: '无尽霜刃',
        description: '给予里芙 +1/+1。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择里芙', filterKey: 'lyfe' }
        ],
        params: {
            power: 1, health: 1, duration: 'PERMANENT'
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
        description: '发起进攻时：赋予自身成长（1级）。',
        class: 'BUFF',
        timing: 'ON_ATTACK_DECLARE',
        speed: 'BURST',
        targetRequirements: [{ type: 'SELF', count: 1, label: '自身' }],
        params: { condition: 'fenny_first_attack_lv1' }
    },
    // [新增] 2级首次进攻
    'effect_fenny_attack_lv2': {
        id: 'effect_fenny_attack_lv2',
        name: '芬妮2级成长',
        description: '发起进攻时：赋予自身成长（2级）。',
        class: 'BUFF',
        timing: 'ON_ATTACK_DECLARE',
        speed: 'BURST',
        targetRequirements: [{ type: 'SELF', count: 1, label: '自身' }],
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
            { type: 'ALLY_CHAMPION', count: 1, label: '选择友方芬妮', filterKey: 'fenny' }
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
            { type: 'ALLY_CHAMPION', count: 1, label: '选择友方芬妮', filterKey: 'fenny' },
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
        description: '给予一个友方单位 +1/+1。',
        class: 'BUFF', // [修正] GRANT -> BUFF
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个友方单位' }
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
            { type: 'ALL_ALLIES', count: 0, label: '全体友方单位' } // [修正] 使用自动目标
        ],
        params: { power: 2, health: 1, duration: 'ROUND' } // [修正] 扁平化 (削弱：永久+3+3→本回合+3/+0)
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
        description: '自带1层充能。目睹敌方水晶受伤时充满1层。满充能且本回合未召唤时，消耗充能召唤1个环境净化无人机。',
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
        description: '打出；若友方场上存在【卜卜 灵鉴】，友方全体单位本回合获得 +2/+0 与【碾压】。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友方单位' }
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
            summonKey: 'pupu_specular_soul', // 借用 summonKey 字段作为”检索目标”
            placeOnTop: true                // 放到牌库顶而非直接加入手牌
        }
    },

    // ==========================================
    // 猫汐尔 · 图征小队效果 (Mauxir — Illustration Squad)
    // ==========================================

    // --- 库兰娅丝 入场召唤 ---
    'effect_Illustration_Squad_Kuranas_summon': {
        id: 'effect_Illustration_Squad_Kuranas_summon',
        name: '临床特长',
        description: '入场：召唤一个【清泉医疗鳄】。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Kuranas_Crocodile', summonZone: 'bench' }
    },

    // --- 清泉医疗鳄 回合结束 ---
    'effect_Kuranas_Crocodile_round_end': {
          id: 'effect_Kuranas_Crocodile_round_end',
          name: '清泉抚慰',
          description: '【回合结束时】：赋予友方其他召唤单位和拉美西斯 +0/+1，随后对自己造成1点伤害。',
          class: 'BUFF',
          timing: 'ROUND_END',
          speed: 'BURST',
          targetRequirements: [{ type: 'ALL_ALLIES', count: 0, label: '全体友方单位' }],
          params: {
              power: 0, health: 1, duration: 'PERMANENT',
              raceFilter: ['summoner', 'summon'],
              excludeSelf: true,
              excludeKeys: ['Kuranas_Crocodile'],  // ← 新增：不吃任何医疗鳄的BUFF
              selfDamage: 1,                        // ← 新增：BUFF完后自伤1血
              roundEndBuff: true,
              buffCounterKey: 'Kuranas_Crocodile',
              buffThreshold: 5,
              buffRewardKey: 'dream_lotus_drone'
          }
    },

    // --- 斯瓦莉 入场召唤 ---
    'effect_Illustration_Squad_Swali_summon': {
        id: 'effect_Illustration_Squad_Swali_summon',
        name: '益智拼图',
        description: '入场：召唤一个【珍馐绵羊】。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Swali_Sheep', summonZone: 'bench' }
    },

    // --- 珍馐绵羊 亡语 ---
    'effect_Swali_Sheep_deathrattle': {
        id: 'effect_Swali_Sheep_deathrattle',
        name: '营养补给',
        description: '【亡语】：在手牌中生成两张【梦莲无人机】。',
        class: 'SUMMON',             // [核心修复] 必须是 SUMMON 类，处理器才能调用 SUMMON 逻辑
        timing: 'LAST_BREATH',       // [核心修复] 必须是 LAST_BREATH，微队列才知道什么时候触发
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'dream_lotus_drone',
            summonCount: 2,          // 生成数量：2
            summonZone: 'hand'       // 目标地：手牌
        }
    },

    // --- 索莉妮 入场召唤 ---
    'effect_Illustration_Squad_Soline_summon': {
        id: 'effect_Illustration_Squad_Soline_summon',
        name: 'AI急救协议',
        description: '入场：召唤一个【搜救阿努比斯】。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Soline_Anubis', summonZone: 'bench' }
    },

    // --- 搜救阿努比斯 打击触发 ---
    'effect_Soline_Anubis_strike': {
        id: 'effect_Soline_Anubis_strike',
        name: '精准索敌',
        description: '打击时，在手牌中生成一张易逝的【梦莲无人机】。',
        class: 'SUMMON',
        timing: 'ON_ATTACK',
        speed: 'BURST',
        targetRequirements: [],
         params: { summonKey: 'dream_lotus_drone', summonZone: 'hand' }
    },

    // --- 梦莲无人机 ---
    'effect_dream_lotus_drone': {
        id: 'effect_dream_lotus_drone',
        name: '梦莲无人机',
        description: '赋予一个【召唤衍生物】+2/+0。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [{ type: 'ALLY_UNIT', count: 1, label: '选择一个【召唤衍生物】', raceFilter: ['summon'] }],
        params: { power: 2, health: 0, duration: 'PERMANENT', buffTag: 'drone_power', raceFilter: ['summon'] }
    },
    // ==========================================
    // [新增] 第 3 批通用法术与支援技注册
    // ==========================================

    // --- 1. 活力再生 ---
    'effect_vitality_regen': {
        id: 'effect_vitality_regen',
        name: '活力再生',
        description: '快速：治疗一个受伤的友方单位2点生命值。',
        class: 'HEAL',  // [新增] 专属治疗类
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个受伤的友方单位' }
        ],
        params: {
            value: 2,
            targetCondition: 'injured' // 埋入暗号：必须掉血才能被选中
        }
    },

    // --- 2. 全力净化 ---
    'effect_full_purification': {
        id: 'effect_full_purification',
        name: '全力净化',
        description: '快速：赋予友方各处的【环境净化无人机】+1/+1。',
        class: 'BUFF_EVERYWHERE', // [新增] 全域光环类
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            // 全局法术无需手动点选目标，引擎底层直接扫描
            { type: 'ALL_ALLIES', count: 0, label: '友方各处' }
        ],
        params: {
            power: 1,
            health: 1,
            duration: 'PERMANENT',
            targetKeyRequirement: ['Elice_scope_robot'], // 必须是这把钥匙
            everywhere: true // 开启传染性
        }
    },

    // --- 3. 激励之声 (芬妮支援技) ---
    'effect_fenny_support': {
        id: 'effect_fenny_support',
        name: '激励之声',
        description: '快速：本回合给予友方一个单位 +1/+0，若此后本回合该单位击杀敌方单位，则备战。',
        class: 'BUFF', // 前置动作是 BUFF
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个友方单位' }
        ],
        params: {
            power: 1,
            health: 0,
            duration: 'ROUND', // 仅限本回合
            // [核心机制] 发放一个系统监听专属词条，战斗引擎看到它杀了人就会发攻击代币
            keywords: ['Listening_KillToRally'] as any[]
        }
    },

    // --- 4. 冻沙激流 (里芙支援技) ---
    'effect_lyfe_support': {
        id: 'effect_lyfe_support',
        name: '冻沙激流',
        description: '极速：本回合给予一个攻击力小于3的单位【冻结】。',
        class: 'BUFF', // 冻结本质是覆盖攻击力的专属负面 Buff
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_UNIT', count: 1, label: '选择一个攻击力小于3的单位' }
        ],
        params: {
            duration: 'ROUND',
            keywords: ['Frostbite'] as Keyword[],
            targetCondition: 'power_less_than_3' // 埋入前台射线拦截暗号
        }
    },

    // --- 5. 异镜来物 (卜卜支援技) ---
    'effect_pupu_specular_soul_support': {
        id: 'effect_pupu_specular_soul_support',
        name: '异镜来物',
        description: '快速：撤回一个交战中的友方单位，以【镜爻】代替其原本的战场位置。',
        class: 'RECALL_AND_REPLACE', // [新增] 缝合怪指令
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个交战中的友方单位' }
        ],
        params: {
            summonKey: 'Mirror', // 指定替身
            targetCondition: 'in_combat' // 埋入前台射线拦截暗号：必须在战场槽位上
        }
    },
    'effect_mauxir_lotus_drive_lv1': {
        id: 'effect_mauxir_lotus_drive_lv1',
        name: '感知补全',
        description: '【库效】回合开始时，若友方备战席和手牌中没有“臆莲基座”，则召唤一个。回合结束：对友方随机一个“臆莲基座”造成1点伤害，之后赋予其+0 +1。',
        // 这是系统底层被动机制，class 和 timing 只是占位，主要靠 useGameState 扫描提取
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            // 写入真实的机器指令
            deckAuraSummon: 'mauxir_lotus_pedestal',
            roundEndSelfDamageBuff: {
                targetKey: 'mauxir_lotus_pedestal',
                damage: 1,
                power: 0,
                health: 1
            }
        }
    },
    'effect_mauxir_lotus_rush': {
        id: 'effect_mauxir_lotus_rush',
        name: '千莲叠绽',
        description: '若猫汐尔未处于格挡状态，召唤一个“臆莲基座”；若处于格挡状态，则与一个“臆莲基座”调换位置，代替其格挡并给予其+0/+2。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [{ type: 'ALLY_UNIT', count: 1, label: '选择基座（格挡时替换）' }],
        params: { summonKey: 'mauxir_lotus_pedestal' }
    },
    'effect_mauxir_lotus_ultimate': {
        id: 'effect_mauxir_lotus_ultimate',
        name: '顷刻莲潮',
        description: '立刻使全场所有友方“臆莲基座”造成一次双倍打击，完成后各基座攻击力减半。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {}
    },
    'effect_mauxir_lotus_support': {
        id: 'effect_mauxir_lotus_support',
        name: '伴泽而生',
        description: '极速 [支援技]：对目标造成1点伤害，若目标受伤后生命等于1则给予冻结。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [{ type: 'ANY_UNIT', count: 1, label: '选择一个单位' }],
        params: {
            value: 1,
            condition: 'freeze_if_health_equals_1'
        }
    },
    'effect_mauxir_lotus_pedestal': {
        id: 'effect_mauxir_lotus_pedestal',
        name: '臆莲基座',
        description: '受伤时生成“梦莲无人机”，回合结束造成X次1点伤害。',
        class: 'BUFF', // TODO: 替换为受伤触发+回合结束触发
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            onDamagedGenerate: 'dream_lotus_drone',      // [新增] 受伤生成暗号
            presenceRequirement: ['mauxir_lotus_drive'], // [新增] 前置条件：猫汐尔必须在场
            roundEndAttack: true                         // [新增] 激活回合结束随机打击机制
        }
    },
    'effect_mauxir_lotus_drive_lv2': {
        id: 'effect_mauxir_lotus_drive_lv2',
        name: '感知补全+',
        description: '【库效】回合开始时，若友方备战席和手牌中没有“臆莲基座”，则召唤一个。回合结束：对友方所有“臆莲基座”造成1点伤害，之后赋予其+0 +2，“臆莲基座”可以以敌方水晶为目标。',
        class: 'BUFF', // TODO: 替换为完整Lv2逻辑
        timing: 'ON_PLAY_AND_ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            deckAuraSummon: 'mauxir_lotus_pedestal',
            roundEndSelfDamageBuff: {
                targetKey: 'mauxir_lotus_pedestal',
                damage: 1,
                power: 0,
                health: 2,
                hitAll: true,   // [新增] Lv2: 命中所有基座而非随机一个
            }
        }
    },

    // ==========================================
    // [新增] 第 4 批通用法术效果
    // ==========================================

    // --- 1. 暗箱操作（拆分为弃牌 + 抽牌两个独立机制）---
    'effect_backroom_deal_discard': {
        id: 'effect_backroom_deal_discard',
        name: '暗箱操作·弃牌',
        description: '丢弃一张手牌。',
        class: 'DISCARD',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, label: '选择一张手牌丢弃' }
        ],
        params: {},
        animationDuration: 1000,
    },
    'effect_backroom_deal_draw': {
        id: 'effect_backroom_deal_draw',
        name: '暗箱操作·抽牌',
        description: '抽两张卡牌。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 2 // 抽牌数量
        }
    },

    // --- 2. 生机补充 ---
    'effect_vitality_supplement': {
        id: 'effect_vitality_supplement',
        name: '生机补充',
        description: '极速：治疗任意一个友方单位或水晶3点生命值。',
        class: 'HEAL',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择一个友方单位或水晶' }
        ],
        params: {
            value: 3,
            targetCondition: 'ally_only'
        }
    },

    // --- 3. 能量补充 ---
    'effect_energy_supplement': {
        id: 'effect_energy_supplement',
        name: '能量补充',
        description: '极速：选取一个天启者，抽取一张该天启者的英雄法术。',
        class: 'TUTOR',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择一个天启者' }
        ],
        params: {
            // 动态检索：由 effectProcessor TUTOR 引擎按"重复天启者→支援法术"优先级搜牌库
        }
    },

    // --- 4. 巴德尔试剂（治疗 + 全域Buff）---
    'effect_bader_reagent_heal': {
        id: 'effect_bader_reagent_heal',
        name: '巴德尔试剂·治疗',
        description: '治疗友方所有单位与水晶1点生命值。',
        class: 'HEAL',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友方' }
        ],
        params: {
            value: 1,
            targetCondition: 'all_allies_include_nexus'
        }
    },
    'effect_bader_reagent_buff': {
        id: 'effect_bader_reagent_buff',
        name: '巴德尔试剂·强化',
        description: '给予友方所有单位 +0/+1。',
        class: 'BUFF_EVERYWHERE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALL_ALLIES', count: 0, label: '全体友方单位' }
        ],
        params: {
            power: 0,
            health: 1,
            duration: 'PERMANENT'
        }
    },

    // ==========================================
    // [新增] 第 5 批法术效果
    // ==========================================

    // --- 1. 鬼影森森（召唤三个异化人）---
    'effect_ghostly_shadows': {
        id: 'effect_ghostly_shadows',
        name: '鬼影森森',
        description: '慢速：召唤三个异化人至备战席。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {
            summonKey: 'titan_mutant',
            summonZone: 'bench',
            summonCount: 3,
        }
    },

    // --- 2. 毁灭仪式（击杀友方泰坦 → 造成 3 点伤害）---
    'effect_destruction_ritual': {
        id: 'effect_destruction_ritual',
        name: '毁灭仪式',
        description: '快速：击杀一个泰坦友方单位，以对一个敌方单位造成3点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个泰坦友方单位作为祭品', raceFilter: ['titan'] },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: {
            sacrificeValue: 999,  // 对祭品的伤害（确保击杀）
            value: 3,             // 对敌方的伤害
        }
    },

    // --- 3. 蟾鉴易纹（转移幻象关键词）---
    'effect_toad_pattern': {
        id: 'effect_toad_pattern',
        name: '蟾鉴易纹',
        description: '快速：移除友方的幻象关键词，并将它转移给所选的敌方单位。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个拥有幻象的友方单位', keywordFilter: ['Ephemeral'] },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位作为转移目标' }
        ],
        params: {
            removeKeywords: ['Ephemeral'],   // 从第一个目标（友方）移除幻象
            keywords: ['Ephemeral'],          // 给第二个目标（敌方）添加幻象
        }
    },

    // --- 鬼怪小队：首次打击水晶触发 ---

    'effect_ghost_antina_inspire': {
        id: 'effect_ghost_antina_inspire',
        name: '宇宙信号',
        description: '首次打击敌方水晶后，随机赋予除自己以外的另一个友方单位 +1/+0。',
        class: 'BUFF',
        timing: 'ON_FIRST_NEXUS_STRIKE',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            power: 1,
            health: 0,
            targetFilter: 'RANDOM_ALLY',
        }
    },
    'effect_ghost_vez_heal': {
        id: 'effect_ghost_vez_heal',
        name: '战地急救',
        description: '首次打击敌方水晶后，随机治疗一个受伤的友方单位3点；若没有友方受伤，则治疗我方水晶3点。',
        class: 'HEAL',
        timing: 'ON_FIRST_NEXUS_STRIKE',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 3,
            targetFilter: 'RANDOM_WOUNDED_ALLY',
            nexusFallback: true,        // 无受伤队友时改奶水晶
        }
    },
    'effect_ghost_valen_rally': {
        id: 'effect_ghost_valen_rally',
        name: '耶洛沙战吼',
        description: '首次打击敌方水晶后，赋予我方所有单位 +1/+1，并给予敌方所有单位 -1/-0。',
        class: 'BUFF',
        timing: 'ON_FIRST_NEXUS_STRIKE',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            allAlliesBuff: { power: 1, health: 1 },
            allEnemiesDebuff: { power: -1, health: 0 },
        }
    },

    // ==========================================
    // [布里吉小队] 效果注册
    // ==========================================

    // --- 菲儿：在手牌生成「强行通讯」---
    'effect_bridget_feier_gencard': {
        id: 'effect_bridget_feier_gencard',
        name: '通讯筹备',
        description: '在手牌生成一张“强行通讯”。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            generateKey: 'forced_communication',
        }
    },

    // --- 金吉拉：抽 2 张卡牌 ---
    'effect_bridget_chinchilla_draw2': {
        id: 'effect_bridget_chinchilla_draw2',
        name: '快速补牌',
        description: '抽取 2 张卡牌。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 2,
        }
    },

    // --- 瓦莱莉：弃任意手牌 → 召唤夜巡猫头鹰 ---
    'effect_bridget_valerie_discard_summon': {
        id: 'effect_bridget_valerie_discard_summon',
        name: '夜幕葬仪',
        description: '弃置任意数量手牌，召唤一只“夜巡猫头鹰”。',
        class: 'DISCARD_AND_SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'Night_Owl',
            summonZone: 'bench',
            discardCountMode: 'any', // 可弃任意数量
        }
    },

    // --- 强行通讯：燃尽抽牌 ---
    'effect_forced_communication_draw': {
        id: 'effect_forced_communication_draw',
        name: '强行通讯',
        description: '燃尽。抽取（燃尽值/2）张卡牌。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {
            value: 0,           // 动态计算，由逻辑层根据燃尽值覆盖
            useBurnout: true,   // [新增] 标记此效果使用燃尽机制
        }
    },

    // --- 夜巡猫头鹰：死亡时抽牌 ---
    'effect_night_owl_death_draw': {
        id: 'effect_night_owl_death_draw',
        name: '夜巡回响',
        description: '死亡时：抽取（瓦莱莉弃置数量-1）张卡牌。',
        class: 'DRAW',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 0,           // 动态计算，由逻辑层根据弃置数量覆盖
            useDiscardCount: true, // [新增] 标记使用瓦莱莉弃置数
        }
    },

    // ==========================================
    // [2026-07-10 精灵小队] 效果注册 — 资源循环体系
    // ==========================================

    // --- 露莎卡：入场生成精灵祈愿 ---
    'effect_spirit_lusaka_generate': {
        id: 'effect_spirit_lusaka_generate',
        name: '精灵祈愿',
        description: '入场时：在手牌中生成一张精灵祈愿。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'spirit_prayer' },
        animationDuration: 800,
    },

    // --- 斯涅妮卡：入场本回合全员+0+1 ---
    'effect_spirit_snenika_aura': {
        id: 'effect_spirit_snenika_aura',
        name: '精灵祝福',
        description: '入场：本回合给予我方全员+0+1。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [{ type: 'ALL_ALLIES', count: 1, label: '全体友方' }],
        params: { health: 1, duration: 'ROUND' },
        animationDuration: 600,
    },

    // --- 斯涅妮卡：首次回合结束时全员治疗 ---
    'effect_spirit_snenika_roundend_heal': {
        id: 'effect_spirit_snenika_roundend_heal',
        name: '精灵低语',
        description: '首次回合结束时：治疗我方所有受伤的单位2点。',
        class: 'HEAL',
        timing: 'ROUND_END',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 2, targetCondition: 'all_injured' },
        animationDuration: 800,
    },

    // --- 邦妮：打击时生成精灵祈愿 ---
    'effect_spirit_bonnie_generate': {
        id: 'effect_spirit_bonnie_generate',
        name: '炎之祈愿',
        description: '打击时：在手牌中生成一张精灵祈愿。',
        class: 'GENERATE',
        timing: 'ON_ATTACK',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'spirit_prayer' },
        animationDuration: 600,
    },

    // --- 精灵祈愿：治疗+buff ---
    'effect_spirit_prayer_heal_buff': {
        id: 'effect_spirit_prayer_heal_buff',
        name: '精灵祈愿',
        description: '治疗一个受伤单位1点，之后赋予+1+0。',
        class: 'HEAL',
        timing: 'BURST',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ANY_UNIT', count: 1, label: '选择一个受伤单位' }
        ],
        params: { value: 1, power: 1, health: 0 },
        animationDuration: 800,
    },
    // ==========================================
    // [2026-07-10 诗人小队] 效果注册 — 「记录」方向B
    // ==========================================

    // --- 奥伊辛：入场生成真实快照 ---
    'effect_poet_oisin_generate': {
        id: 'effect_poet_oisin_generate',
        name: '真实记录',
        description: '入场时：在手牌中生成一张真实快照。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'true_snapshot' },
        animationDuration: 800,
    },

    // --- 真实快照：选择手牌，复制x3洗入牌库 ---
    'effect_true_snapshot_clone': {
        id: 'effect_true_snapshot_clone',
        name: '真实快照',
        description: '选择一张手牌，复制三张相同的卡牌并洗入牌库。',
        class: 'CLONE_TO_DECK',
        timing: 'BURST',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, label: '选择一张手牌进行复制' }
        ],
        params: { value: 3 },
        animationDuration: 1000,
    },

    // --- 凯特琳：极速/快速法术减费光环（标记效果）---
    'effect_poet_caitlin_aura': {
        id: 'effect_poet_caitlin_aura',
        name: '安可之音',
        description: '在场时，我方所有极速和快速法术魔耗值减1。',
        class: 'BUFF_EVERYWHERE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { costReduceSpell: true },
        animationDuration: 200,
    },

    // --- 科洛：回合开始时，复制上回合前三张非易逝牌到手牌 ---
    'effect_poet_kelo_recycle': {
        id: 'effect_poet_kelo_recycle',
        name: '收藏癖',
        description: '回合开始时：复制上回合我方打出的前三张非易逝卡牌到手牌，并赋予[瞬逝]。',
        class: 'GENERATE',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: {},
        animationDuration: 800,
    },

    // ==========================================
    // [2026-07-10 绿灵小队] 效果存根（逻辑待实现）
    // ==========================================

    // --- 格伦茨：入场赋予牌库最上方两个单位+0+1 ---
    'effect_green_glanz_buff': {
        id: 'effect_green_glanz_buff',
        name: '双生萌芽',
        description: '入场时，赋予我方牌库最上方的两个单位+0/+1。',
        class: 'BUFF_EVERYWHERE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { health: 1, ownerSide: true },
        animationDuration: 600,
    },

    // --- 艾娃：光环—每打出≥1费快速法术，牌库最上方+1+1 ---
    'effect_green_eva_aura': {
        id: 'effect_green_eva_aura',
        name: '滋养光环',
        description: '光环：我方每打出一张费用≥1的快速法术，赋予牌库最上方的单位+1/+1。',
        class: 'BUFF_EVERYWHERE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 1, health: 1, ownerSide: true },
        animationDuration: 400,
    },

    // --- 格蕾丝：入场时召唤行李箱机器人 ---
    'effect_green_grace_summon': {
        id: 'effect_green_grace_summon',
        name: '开箱！',
        description: '入场时，召唤一个行李箱机器人。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Green_Spirit_Squad_LuggageBot' },
        animationDuration: 800,
    },

    // --- 行李箱机器人：被召唤时，赋予我方牌库所有单位+1+1 ---
    'effect_green_luggage_buff': {
        id: 'effect_green_luggage_buff',
        name: '满载而归',
        description: '被召唤时，赋予我方牌库所有单位 +1/+1。',
        class: 'BUFF_EVERYWHERE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 1, health: 1, ownerSide: true },
        animationDuration: 800,
    },

    // ==========================================
    // [2026-07-14 锻造者小队] 蕾西亚 — 打击减费
    // ==========================================
    'effect_forger_leisia_strike_reduce': {
        id: 'effect_forger_leisia_strike_reduce',
        name: '情报折价',
        description: '打击后，减少我方费用最高的手牌1点费用。',
        class: 'COST_REDUCE',
        timing: 'ON_ATTACK',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1 }
    },

    // ==========================================
    // [2026-07-14 锻造者小队] 缇坦妮娅 — 法术增伤光环
    // ==========================================
    'effect_forger_tatiana_aura': {
        id: 'effect_forger_tatiana_aura',
        name: '火力支援',
        description: '光环：我方所有法术伤害+1。',
        class: 'SPELL_DAMAGE_AURA',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { spellDamageBuff: 1 }
    },

    // ==========================================
    // [2026-07-14 锻造者小队] 白猎 — 手牌召唤
    // ==========================================
    'effect_forger_white_hunt_summon': {
        id: 'effect_forger_white_hunt_summon',
        name: '重装出击',
        description: '选择一个手牌中的单位，赋予他+3/+0和碾压并将他从手牌中召唤。',
        class: 'SUMMON_FROM_HAND',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, cardTypeFilter: 'unit', label: '选择一个手牌中的单位' }
        ],
        params: { power: 3, keywords: ['Overwhelm'], triggerOnPlay: true, maxCost: 7 }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 洛迦 — 亡语召唤幻莲音蛇
    // ==========================================
    'effect_hymn_loka_death_summon': {
        id: 'effect_hymn_loka_death_summon',
        name: '音蛇召唤',
        description: '死亡时：召唤一个【幻莲音蛇】。',
        class: 'SUMMON',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Loka_Phantom_Serpent', summonCount: 1 }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 幻莲音蛇 — 回合开始额外法力
    // ==========================================
    'effect_loka_serpent_bonus_mana': {
        id: 'effect_loka_serpent_bonus_mana',
        name: '音蛇共鸣',
        description: '回合开始时，永久提升1点法力上限。',
        class: 'GRANT_MANA',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, grantMaxMana: true }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 欧白芷 — 亡语生成迷离之音
    // ==========================================
    'effect_hymn_angelica_death_generate': {
        id: 'effect_hymn_angelica_death_generate',
        name: '迷离之音',
        description: '死亡时：在手牌生成一张【迷离之音】。',
        class: 'GENERATE',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'Angelica_Hazy_Note' }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 迷离之音 — 治疗
    // ==========================================
    'effect_angelica_hazy_note_heal': {
        id: 'effect_angelica_hazy_note_heal',
        name: '迷离治愈',
        description: '治疗我方任意一个单位或水晶2点生命值。',
        class: 'HEAL',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择治疗目标' }
        ],
        params: { value: 2, targetCondition: 'ally_only' }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 迷离之音 — 额外法力
    // ==========================================
    'effect_angelica_hazy_note_mana': {
        id: 'effect_angelica_hazy_note_mana',
        name: '音律涌动',
        description: '永久提升1点法力上限。',
        class: 'GRANT_MANA',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, grantMaxMana: true }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 莎罗 — 入场阵亡计数buff
    // ==========================================
    'effect_hymn_shalo_onplay_buff': {
        id: 'effect_hymn_shalo_onplay_buff',
        name: '逝者回响',
        description: '入场时，本牌局我方每有一个单位阵亡，则同时赋予一次自己和随机场上任意一个单位+1/+1。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 0 } // value 由逻辑层根据 friendlyUnitDeaths 动态计算
    },

    // ==========================================
    // [2026-07-14 梵音小队] 莎罗 — 亡语生成巨偶一瞥
    // ==========================================
    'effect_hymn_shalo_death_generate': {
        id: 'effect_hymn_shalo_death_generate',
        name: '巨偶一瞥',
        description: '死亡时：在手牌中生成一张【巨偶一瞥】。',
        class: 'GENERATE',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'Shalo_Golem_Glimpse' }
    },

    // ==========================================
    // [2026-07-14 梵音小队] 巨偶一瞥 — AOE伤害+觉悟碾压
    // ==========================================
    'effect_shalo_golem_glimpse_strike': {
        id: 'effect_shalo_golem_glimpse_strike',
        name: '巨偶一瞥',
        description: '对所有敌人造成3点伤害。[觉悟]：费用降为0，赋予我方所有单位【碾压】。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { value: 3, targetAllEnemies: true } // targetAllEnemies 标记全屏AOE
    },

    // ==========================================
    // [2026-07-15 达努小队] 班西 — 受伤存活自buff+生成墓穴蜘蛛
    // ==========================================
    'effect_danu_banshee_damage_buff': {
        id: 'effect_danu_banshee_damage_buff',
        name: '墓穴呼唤',
        description: '受伤并存活后，自身+2/+0，并在手牌中生成一张【墓穴蜘蛛】。',
        class: 'BUFF', // TODO: 改为 ON_DAMAGE_SURVIVE 专用逻辑
        timing: 'ON_DAMAGE_SURVIVE',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 2, health: 0, generateKey: 'Tomb_Spider' }
    },

    // ==========================================
    // [2026-07-15 达努小队] 墓穴蜘蛛 — 衍生物
    // ==========================================
    'effect_tomb_spider_challenger': {
        id: 'effect_tomb_spider_challenger',
        name: '掘穴突袭',
        description: '挑战者。',
        class: 'BUFF', // 关键词自带，纯占位
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {}
    },

    // ==========================================
    // [2026-07-15 达努小队] 温蒂 — 入场AOE自伤
    // ==========================================
    'effect_danu_wendy_onplay_ping': {
        id: 'effect_danu_wendy_onplay_ping',
        name: '自适应性调整',
        description: '入场时，对我方除自己以外所有单位造成1点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, targetAllAllies: true, excludeSelf: true }
    },

    // ==========================================
    // [2026-07-15 达努小队] 温蒂 — 受伤光环buff
    // ==========================================
    'effect_danu_wendy_aura_buff': {
        id: 'effect_danu_wendy_aura_buff',
        name: '痛觉强化',
        description: '在场时，每当我方单位受伤，赋予其+1/+0和【坚韧】。',
        class: 'BUFF',
        timing: 'ON_FRIENDLY_DAMAGED',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 1, health: 0, keywords: ['Tough'] }
    },

    // ==========================================
    // [2026-07-16 银臂乱打] — 法术：对交战区所有单位造成2点伤害
    // ==========================================
    'effect_silver_arm_smash': {
        id: 'effect_silver_arm_smash',
        name: '银臂乱打',
        description: '对战场上所有单位造成2点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { value: 2, targetCombatOnly: true }
    },

    // ==========================================
    // [2026-07-15 达努小队] 银臂 — 战后存活buff
    // ==========================================
    'effect_danu_silverarm_post_combat_buff': {
        id: 'effect_danu_silverarm_post_combat_buff',
        name: '战争红利',
        description: '首次进攻战斗结束后，存活的我方单位获得+1/+0和【挑战者】。',
        class: 'BUFF',
        timing: 'POST_COMBAT',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 1, health: 0, keywords: ['Challenger'], firstAttackOnly: true }
    },

    // ==========================================
    // [2026-07-15 鸦眼小队] 安 — 入场校准
    // ==========================================
    'effect_crows_an_onplay_calibrate': {
        id: 'effect_crows_an_onplay_calibrate',
        name: '校准·安',
        description: '入场时：从牌库中随机展示4张牌，选择1张放回牌库顶。',
        class: 'CALIBRATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { calibrateCount: 4 }
    },

    // ==========================================
    // [2026-07-15 鸦眼小队] 穆林 — 入场牌库buff
    // ==========================================
    'effect_crows_mulin_onplay_deckbuff': {
        id: 'effect_crows_mulin_onplay_deckbuff',
        name: '鸦羽庇护',
        description: '入场时：随机给予我方牌库中的4个单位+2/+2。',
        class: 'DECK_BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 4, count: 4, targetType: 'unit', power: 2, health: 2 }
    },

    // ==========================================
    // [2026-07-17 鸦眼小队] 穆林 — 回合开始时校准
    // ==========================================
    'effect_crows_mulin_roundstart_calibrate': {
        id: 'effect_crows_mulin_roundstart_calibrate',
        name: '校准·穆林',
        description: '回合开始时：校准。',
        class: 'CALIBRATE',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { calibrateCount: 4 }
    },

    // ==========================================
    // [2026-07-17 鸦眼小队] 海基 — 入场生成精密操作
    // ==========================================
    'effect_crows_hiki_onplay_generate': {
        id: 'effect_crows_hiki_onplay_generate',
        name: '精密调度',
        description: '入场时：在手牌中生成一张"精密操作"，若手牌中已有该卡牌，则赋予它费用-1。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'Crows_Precise_Operation', reduceCostIfDuplicate: true }
    },

    // ==========================================
    // [2026-07-17 鸦眼小队] 海基 — 回合开始生成精密操作
    // ==========================================
    'effect_crows_hiki_roundstart_generate': {
        id: 'effect_crows_hiki_roundstart_generate',
        name: '精密调度',
        description: '回合开始时：在手牌中生成一张"精密操作"，若手牌中已有该卡牌，则赋予它费用-1。',
        class: 'GENERATE',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'Crows_Precise_Operation', reduceCostIfDuplicate: true }
    },

    // ==========================================
    // [2026-07-15 鸦眼小队] 海基 — 校准奖励光环
    // ==========================================
    'effect_crows_hiki_calibrate_aura': {
        id: 'effect_crows_hiki_calibrate_aura',
        name: '鸦眼洞察',
        description: '在场时：校准中没有被选择的单位卡牌获得+1/+1，法术卡牌费用-1。',
        class: 'BUFF',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { power: 1, health: 1, spellCostReduce: 1 } // 光环逻辑待实现
    },

    // ==========================================
    // [2026-07-17 鸦眼小队] 精密操作 — 校准
    // ==========================================
    'effect_crows_precise_operation': {
        id: 'effect_crows_precise_operation',
        name: '精密操作',
        description: '校准。（从牌库顶展示4张牌，选1张放回牌库顶）',
        class: 'CALIBRATE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { calibrateCount: 4 }
    },

    // ==========================================
    // [2026-07-17 阿尔戈小队重做] 蓄意渗透 — 对敌方水晶造成1点伤害
    // ==========================================
    'effect_deliberate_infiltration': {
        id: 'effect_deliberate_infiltration',
        name: '蓄意渗透',
        description: '对敌方水晶造成1点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ENEMY_NEXUS', count: 1, label: '敌方水晶' }
        ],
        params: { value: 1 }
    },

    // ==========================================
    // [2026-07-17 阿尔戈小队] 乐手 — 回合开始时对敌方水晶造成1点伤害
    // ==========================================
    'effect_argo_musician_round_start': {
        id: 'effect_argo_musician_round_start',
        name: '蓄意渗透',
        description: '回合开始时：对敌方水晶造成1点伤害。',
        class: 'STRIKE',
        timing: 'ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, targetEnemyNexus: true }
    },

    // ==========================================
    // [2026-07-17 阿尔戈小队] 箭头 — 发起进攻时赋予自己+3/+0
    // ==========================================
    'effect_argo_arrowhead_attack_declare': {
        id: 'effect_argo_arrowhead_attack_declare',
        name: '箭头冲击',
        description: '发起进攻时：赋予自己+3/+0。',
        class: 'BUFF',
        timing: 'ON_ATTACK_DECLARE',
        speed: 'BURST',
        targetRequirements: [{ type: 'SELF', count: 1, label: '自身' }],
        params: { power: 3, health: 0 }
    },

    // ==========================================
    // [2026-07-24 测试卡] 冻结 — 入场本回合将自身攻击力降为0
    // ==========================================
    'effect_test_frostbite': {
        id: 'effect_test_frostbite',
        name: '冻结测试',
        description: '入场本回合将自身攻击力降为0。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [{ type: 'SELF', count: 1, label: '自身' }],
        params: {
            duration: 'ROUND',
            keywords: ['Frostbite'] as Keyword[],
        }
    },

    // --- 丁型异化人 亡语：泰坦物质爆炸 ---
    'effect_titan_type_d_lastbreath': {
        id: 'effect_titan_type_d_lastbreath',
        name: '泰坦物质爆炸',
        description: '【亡语】：对敌方所有单位与水晶造成 2 点伤害。',
        class: 'BUFF',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: {}
    },

    // ==========================================
    // [2026-07-26 安卡希雅 时之重奏] 效果存根
    // ==========================================

    'effect_acacia_chrono_echo_lv1': {
        id: 'effect_acacia_chrono_echo_lv1',
        name: '时之重奏',
        description: '【库效】牌局开始：若手牌中没有则生成"安卡希雅的剑舞"。入场时：生成易逝的"灵轨月轮·扩散"。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'acacia_sword_rain', gameStartGenerate: 'acacia_chrono_echo_spell', isVolatile: true }
    },
    'effect_acacia_chrono_echo_token': {
        id: 'effect_acacia_chrono_echo_token',
        name: '时之重奏·标识',
        description: '获得进攻标识时：生成易逝的"灵轨月轮·扩散"。',
        class: 'GENERATE',
        timing: 'ON_GET_ATTACK_TOKEN',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'acacia_sword_rain', isVolatile: true }
    },
    // [2026-07-31 安卡希雅 Lv2] 升级后效果：库效生成重锋 + 入场生成月镰剑势
    'effect_acacia_chrono_echo_lv2': {
        id: 'effect_acacia_chrono_echo_lv2',
        name: '时之重奏·重锋',
        description: '【库效】牌局开始：若手牌中没有则生成"安卡希雅的重锋"。入场时：生成易逝的"月镰剑势"。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'acacia_sword_rain_alt', gameStartGenerate: 'acacia_chrono_echo_heavy', isVolatile: true }
    },
    'effect_acacia_chrono_echo_token_lv2': {
        id: 'effect_acacia_chrono_echo_token_lv2',
        name: '时之重奏·重锋标识',
        description: '获得进攻标识时：生成易逝的"月镰剑势"。',
        class: 'GENERATE',
        timing: 'ON_GET_ATTACK_TOKEN',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'acacia_sword_rain_alt', isVolatile: true }
    },
    'effect_acacia_chrono_echo_rush': {
        id: 'effect_acacia_chrono_echo_rush',
        name: '剑咏变调',
        description: '切换灵轨月轮·扩散/集束。',
        class: 'BUFF',
        timing: 'FAST',
        speed: 'BURST',
        targetRequirements: [],
        params: { condition: 'acacia_rush_upgraded' }
    },
    'effect_acacia_chrono_echo_ultimate': {
        id: 'effect_acacia_chrono_echo_ultimate',
        name: '朔望之期',
        description: '本牌局每召唤过飞剑1减1费。打出后升级安卡希雅，并回复全部费用。',
        class: 'BUFF',
        timing: 'SLOW',
        speed: 'BURST',
        targetRequirements: [],
        params: { condition: 'acacia_full_moon_levelup' }
    },
    'effect_acacia_cross_temporal': {
        id: 'effect_acacia_cross_temporal',
        name: '越时斩',
        description: '若本回合已飞剑，则对敌方战场上所有单位造成2点伤害。',
        class: 'STRIKE',
        timing: 'FAST',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 2, targetCondition: 'enemy_all' }
    },
    'effect_acacia_sword_timeline': {
        id: 'effect_acacia_sword_timeline',
        name: '剑痕时空',
        description: '安卡希雅退级，每大飞剑1打敌方水晶1。每飞剑1减1费。使用后回复全部费用。',
        class: 'STRIKE',
        timing: 'SLOW',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, condition: 'acacia_ultimate_delevel' }
    },
    'effect_acacia_chrono_echo_support': {
        id: 'effect_acacia_chrono_echo_support',
        name: '时之协奏',
        description: '[支援技] 对所有本回合进攻或格挡过的敌人造成1点伤害。',
        class: 'STRIKE',
        timing: 'BURST',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1, targetCondition: 'attacked_or_blocked_this_round' }
    },
    'effect_acacia_sword_rain': {
        id: 'effect_acacia_sword_rain',
        name: '刀光剑影',
        description: '慢速：飞剑4。',
        class: 'FLYING_SWORD',
        timing: 'SLOW',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 4 }
    },
    'effect_acacia_moon_focus': {
        id: 'effect_acacia_moon_focus',
        name: '灵轨月轮·集束',
        description: '慢速：飞剑1，此次飞剑获得+3/+3和碾压。',
        class: 'FLYING_SWORD',
        timing: 'SLOW',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 1, power: 3, health: 3 }
    },
    'effect_acacia_sword_rain_alt': {
        id: 'effect_acacia_sword_rain_alt',
        name: '月镰剑势',
        description: '慢速：飞剑3。',
        class: 'FLYING_SWORD',
        timing: 'SLOW',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 3 }
    },
    'effect_sacred_tree_alvina': {
        id: 'effect_sacred_tree_alvina',
        name: '飞剑召来',
        description: '入场时：若本回合已召唤过飞剑，则赋予我方全员+0/+2并备战。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { condition: 'sacred_tree_alvina_check' }
    },
    'effect_sacred_tree_lumi': {
        id: 'effect_sacred_tree_lumi',
        name: '时序加速',
        description: '打出时：飞剑2。',
        class: 'FLYING_SWORD',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 2 }
    },
    'effect_sacred_tree_margaret': {
        id: 'effect_sacred_tree_margaret',
        name: '飞剑突袭',
        description: '进攻时：飞剑2并点亮充能。',
        class: 'FLYING_SWORD',
        timing: 'ON_ATTACK_DECLARE',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 2 }
    },

    // ==========================================
    // [2026-08-05 莉莉子] 新法术批次占位效果（18 张，逻辑未实现）
    // 全部 class: 'PLACEHOLDER' → effectProcessor 安全空转。
    // description 写明最终意图，实现逻辑时替换 class + params 并补处理器。
    // ==========================================
    'effect_temp_spell_01': {
        id: 'effect_temp_spell_01',
        name: '降临事件',
        description: '慢速：击杀场上的所有单位（对场上所有单位造成999点伤害）。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { targetAllUnits: true, value: 999 },
        record: { summary: '击杀场上的所有单位' }
    },
    'effect_temp_spell_02': {
        id: 'effect_temp_spell_02',
        name: '瓦尔哈拉的呼唤',
        description: '慢速：复活我方本牌局死亡的最强的6个单位，且全员带[幻象]。',
        class: 'RESURRECT',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { value: 6 },
        record: { summary: '复活我方死亡最强的6个单位（带幻象）' }
    },
    'effect_temp_spell_03': {
        id: 'effect_temp_spell_03',
        name: '法术3',
        description: '慢速：再次点亮我方所有泰坦单位的关键词。',
        class: 'TITAN_RELIGHT',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {},
        record: { summary: '点亮我方所有泰坦单位的关键词' }
    },
    'effect_temp_spell_04': {
        id: 'effect_temp_spell_04',
        name: '法术4',
        description: '慢速：立刻触发我方所有单位的泰坦脉冲。',
        class: 'TITAN_PULSE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {},
        record: { summary: '触发我方所有单位的泰坦脉冲' }
    },
    'effect_temp_spell_05': {
        id: 'effect_temp_spell_05',
        name: '单刀直入',
        description: '快速：对任意一个目标造成2点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择一个单位或水晶' }
        ],
        params: { value: 2 },
        record: { summary: '对任意一个目标造成2点伤害' }
    },
    'effect_temp_spell_06': {
        id: 'effect_temp_spell_06',
        name: '抵抗',
        description: '极速：无效化一个费用小于等于3的快速法术。',
        class: 'NEGATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'SPELL_ON_STACK', count: 1, label: '选择一个费用小于等于3的快速法术', stackCostBelow:4, stackSpeedFilter: ['spell-fast'] }
        ],
        params: {},
        record: { summary: '无效化一个费用小于3的快速法术' }
    },
    'effect_temp_spell_07': {
        id: 'effect_temp_spell_07',
        name: '抗拒',
        description: '快速：无效化一个快速或者慢速法术。',
        class: 'NEGATE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'SPELL_ON_STACK', count: 1, label: '选择一个快速或慢速法术', stackSpeedFilter: ['spell-fast', 'spell-slow'] }
        ],
        params: {},
        record: { summary: '无效化一个快速或者慢速法术' }
    },
    'effect_temp_spell_08': {
        id: 'effect_temp_spell_08',
        name: '拒绝',
        description: '快速：无效化当前法术堆叠中的所有敌方法术。',
        class: 'NEGATE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { negateAllEnemies: true },
        record: { summary: '无效化当前法术堆叠中的所有敌方法术' }
    },
    'effect_temp_spell_09': {
        id: 'effect_temp_spell_09',
        name: '法术9',
        description: '快速：撤回一个我方单位（返回手牌），并飞剑2。',
        class: 'RECALL',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方单位撤回' }
        ],
        params: { returnToHand: true },
        record: { summary: '撤回一个我方单位并飞剑2' }
    },
    'effect_temp_spell_09_flying': {
        id: 'effect_temp_spell_09_flying',
        name: '飞剑1',
        description: '召唤1柄飞剑进攻。',
        class: 'FLYING_SWORD',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { summonCount: 1 }
    },
    'effect_temp_spell_10': {
        id: 'effect_temp_spell_10',
        name: '战术回撤',
        description: '快速：撤回任意一个单位（按其归属返回对应手牌），之后在手牌中生成瞬逝的"战术闪击"。',
        class: 'RECALL',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ANY_UNIT', count: 1, label: '选择一个单位撤回' }
        ],
        params: { returnToHand: true },
        record: { summary: '撤回任意单位并生成瞬逝的法术11' }
    },
    'effect_temp_spell_10_generate': {
        id: 'effect_temp_spell_10_generate',
        name: '生成瞬逝战术闪击',
        description: '在手牌中生成一张瞬逝的"战术闪击"。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { generateKey: 'temp_spell_11', isVolatile: true }
    },
    'effect_temp_spell_11': {
        id: 'effect_temp_spell_11',
        name: '战术闪击',
        description: '极速：选择一个手牌中费用小于等于3的单位打出',
        class: 'SUMMON_FROM_HAND',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, cardTypeFilter: 'unit', label: '选择一个手牌中费用小于等于3的单位' }
        ],
        params: { maxCost: 4, triggerOnPlay: true },
        record: { summary: '从手牌直接打出费用小于3的单位' }
    },
    'effect_temp_spell_12': {
        id: 'effect_temp_spell_12',
        name: '法术12',
        description: '慢速：燃尽，根据消耗的费用召唤对应的随机数量随机费用的泰坦单位。',
        class: 'BURNOUT_SUMMON',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { useBurnout: true },
        record: { summary: '燃尽：按消耗费用随机召唤泰坦' }
    },
    'effect_temp_spell_13': {
        id: 'effect_temp_spell_13',
        name: '深思熟虑（占位）',
        description: '【占位·逻辑未实现】极速：抉择："正面突破" 或 "迂回防守"。',
        class: 'PLACEHOLDER',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { placeholder: true },
        record: { summary: '抉择：+3/+0 或 +0/+3' }
    },
    'effect_temp_spell_14': {
        id: 'effect_temp_spell_14',
        name: '正面突破',
        description: '极速：本回合给予一个单位+3/+0。（深思熟虑的衍生）',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个友方单位' }
        ],
        params: { power: 3, health: 0, duration: 'ROUND' },
        record: { summary: '本回合给予一个单位+3/+0' }
    },
    'effect_temp_spell_15': {
        id: 'effect_temp_spell_15',
        name: '迂回防守',
        description: '极速：本回合给予一个单位+0/+3。（深思熟虑的衍生）',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个友方单位' }
        ],
        params: { power: 0, health: 3, duration: 'ROUND' },
        record: { summary: '本回合给予一个单位+0/+3' }
    },
    'effect_temp_spell_16': {
        id: 'effect_temp_spell_16',
        name: '法术16',
        description: '极速：必须选择三个天启者，之后赋予她们+2/+2。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择第一个天启者' },
            { type: 'ALLY_CHAMPION', count: 1, label: '选择第二个天启者' },
            { type: 'ALLY_CHAMPION', count: 1, label: '选择第三个天启者' }
        ],
        params: { power: 2, health: 2, duration: 'PERMANENT' },
        record: { summary: '选择三个天启者并赋予+2/+2' }
    },
    'effect_temp_spell_17': {
        id: 'effect_temp_spell_17',
        name: '法术17',
        description: '慢速：本回合冻结所有敌人，并对所有敌人造成3点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { targetAllEnemies: true, value: 3, freezeAllEnemies: true },
        record: { summary: '冻结所有敌人并对所有敌人造成3点伤害' }
    },
    'effect_temp_spell_18': {
        id: 'effect_temp_spell_18',
        name: '法术18',
        description: '极速：冻结一个敌人。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: { keywords: ['Frostbite'], duration: 'ROUND' },
        record: { summary: '冻结一个敌人' }
    },
    // [2026-08-06 莉莉子] 法术19：慢速 单体3伤（占位法术）
    'effect_temp_spell_19_strike': {
        id: 'effect_temp_spell_19_strike',
        name: '法术19 单体打击',
        description: '慢速：对一个敌方单位造成3点伤害。',
        class: 'STRIKE',
        timing: 'SLOW',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: { value: 3 },
        record: { summary: '对敌方单位造成3点伤害' }
    },
    // [2026-08-06 莉莉子] 法术20：快速 飞剑2（占位法术；回响由 Echo 关键词逻辑层处理）
    'effect_temp_spell_20_flying': {
        id: 'effect_temp_spell_20_flying',
        name: '法术20 飞剑2',
        description: '召唤2柄飞剑。',
        class: 'FLYING_SWORD',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { summonCount: 2 }
    },
};



// ==========================================
// [新增] 猫汐尔 莲驱 效果存根（逻辑待实现）
// ==========================================



export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};