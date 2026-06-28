/**
 * Snowbreak Rivals - 法术效果注册表
 */

import type { Race } from '../types';

export type EffectClass =
    | 'STRIKE' | 'SUMMON' | 'BUFF' | 'FATES_CHOICE' | 'RALLY' | 'CLONE_AND_SUMMON'
    | 'RECALL' | 'TUTOR'
    // [核心新增] 本次 5 大新法术所需的 3 个全新机制底层分类！
    | 'HEAL'               // 治疗类 (操作 damageTaken)
    | 'BUFF_EVERYWHERE'    // 全域光环类 (操作手牌/牌库/召唤事件)
    | 'RECALL_AND_REPLACE' // 撤回并替身替换类
    // [2026-06-27 暗箱操作] 两个独立基础机制
    | 'DISCARD'            // 弃牌类：从手牌移除指定卡牌
    | 'DRAW';              // 抽牌类：从牌库抽 N 张到手上

export type EffectTiming =
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
    | 'HAND_CARD'       // [2026-06-27] 手牌中的卡牌（用于弃牌、检索等）
    | 'ALL_ALLIES'
    | 'SELF';

export interface TargetRequirement {
    type: TargetType;
    count: number;      // 需要选几个 (通常是 1)
    label: string;      // 播报给玩家的提示文字 (如 "选择一个敌方单位")
    filterKey?: string; // 额外过滤器，例如仅限 key='fenny'
    raceFilter?: Race[]; // [新增] 种族过滤器，例如 ['summoner', 'summon']
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
            summonKey: 'pupu_specular_soul' // 借用 summonKey 字段作为”检索目标”
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
          description: '【回合结束时】：赋予我方其他召唤单位和拉美西斯 +0/+1，随后对自己造成1点伤害。',
          class: 'BUFF',
          timing: 'ROUND_END',
          speed: 'BURST',
          targetRequirements: [{ type: 'ALL_ALLIES', count: 0, label: '全体友军' }],
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
        description: '赋予一个【召唤衍生物】或【召唤师】+2/+0。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [{ type: 'ALLY_UNIT', count: 1, label: '选择一个【召唤衍生物】或【召唤师】', raceFilter: ['summoner', 'summon'] }],
        params: { power: 2, health: 0, duration: 'PERMANENT', buffTag: 'drone_power', raceFilter: ['summoner', 'summon'] }
    },
    // ==========================================
    // [新增] 第 3 批通用法术与支援技注册
    // ==========================================

    // --- 1. 活力再生 ---
    'effect_vitality_regen': {
        id: 'effect_vitality_regen',
        name: '活力再生',
        description: '快速：治疗一个受伤的我方单位2点生命值。',
        class: 'HEAL',  // [新增] 专属治疗类
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个受伤的我方单位' }
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
        description: '快速：赋予我方各处的【环境净化无人机】+1/+1。',
        class: 'BUFF_EVERYWHERE', // [新增] 全域光环类
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            // 全局法术无需手动点选目标，引擎底层直接扫描
            { type: 'ALL_ALLIES', count: 0, label: '我方各处' }
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
        description: '快速：本回合给予我方一个单位 +1/+0，若此后本回合该单位击杀敌人，则备战。',
        class: 'BUFF', // 前置动作是 BUFF
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方单位' }
        ],
        params: {
            power: 1,
            health: 0,
            duration: 'ROUND', // 仅限本回合
            // [核心机制] 发放一个系统监听专属词条，战斗引擎看到它杀了人就会发攻击代币
            keywords: ['Listening_KillToRally'] as Keyword[]
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
        description: '快速：撤回一个交战中的我方单位，以【镜爻】代替其原本的战场位置。',
        class: 'RECALL_AND_REPLACE', // [新增] 缝合怪指令
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个交战中的我方单位' }
        ],
        params: {
            summonKey: 'Mirror', // 指定替身
            targetCondition: 'in_combat' // 埋入前台射线拦截暗号：必须在战场槽位上
        }
    },
    'effect_mauxir_lotus_drive_lv1': {
        id: 'effect_mauxir_lotus_drive_lv1',
        name: '感知补全',
        description: '【库效】回合开始时，若己方备战席没有【臆莲基座】，则召唤一个。回合结束：对我方随机一个【臆莲基座】造成1点伤害，之后赋予其+0 +1。',
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
        description: '若猫汐尔未处于格挡状态，召唤一个【臆莲基座】；若处于格挡状态，则与一个【臆莲基座】调换位置，代替其格挡并给予其+0/+2。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [{ type: 'ALLY_UNIT', count: 1, label: '选择基座（格挡时替换）' }],
        params: { summonKey: 'mauxir_lotus_pedestal' }
    },
    'effect_mauxir_lotus_ultimate': {
        id: 'effect_mauxir_lotus_ultimate',
        name: '顷刻莲潮',
        description: '立刻使全场所有友方【臆莲基座】造成一次双倍打击，完成后各基座攻击力减半。',
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
        description: '受伤时生成梦莲无人机，回合结束造成X次1点伤害。',
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
        description: '【库效】回合开始时，若己方备战席没有【臆莲基座】，则召唤一个。回合结束：对我方所有【臆莲基座】造成1点伤害，之后赋予其+0 +2，【臆莲基座】可以以敌方水晶为目标。',
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
        params: {}
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
        description: '极速：治疗任意一个我方单位或水晶3点生命值。',
        class: 'HEAL',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ANY_TARGET', count: 1, label: '选择一个我方单位或水晶' }
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
        description: '治疗我方所有单位与水晶1点生命值。',
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
        description: '给予我方所有单位 +0/+1。',
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
    }
};

// ==========================================
// [新增] 猫汐尔 莲驱 效果存根（逻辑待实现）
// ==========================================



export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};