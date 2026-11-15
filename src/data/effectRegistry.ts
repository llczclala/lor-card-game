/**
 * Snowbreak Rivals - 法术效果注册表
 */

import type { Race, Keyword } from '../types';
// [2026-11-14 莉莉子 ✨新功能 · 奥德涅] 「若凯茜娅·狂诗在手牌」的前置条件用**唯一真源**的 key。
//   依赖方向：effectRegistry(data) → katyaProgress(utils) → types（后者只 import 类型）
//   ⇒ **无循环依赖**（同一方向的先例：`data/cards.ts:5` 就 import 了 katyaProgress 的常量）。
import { KATYA_KEY } from '../utils/katyaProgress';

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
    | 'SPELL_MANA_GAIN'   // [2026-10-08 莉莉子 · 法术专属装备 第二波] 法术法力类：恢复 N 点法术法力（上限走 spellManaCapOf）
    | 'CALIBRATE'          // [鸦眼] 校准类：从牌库选4张，选1张放顶部
    | 'DECK_BUFF'          // [达努/鸦眼] 牌库强化类：对牌库内单位/法术施加buff
    | 'FLYING_SWORD'        // [2026-07-26 安卡希雅] 飞剑类：召唤X个飞剑衍生物并立即发起进攻
    | 'PLACEHOLDER'         // [2026-08-05 莉莉子] 占位类：逻辑未实现时安全空转，用于暂未完成逻辑的新法术
    | 'SPREAD_DAMAGE'       // [2026-09-16 茉莉安] 分摊伤害类：对己方全体（备战席+交战区）分摊总量伤害
    | 'CHAIN_STRIKE'        // [2026-09-16 茉莉安] 续击收割类：击杀后自动锁定最低血量目标连续打击
    | 'TITAN_PULSE'         // [2026-08-05 莉莉子] 泰坦脉冲类：立刻触发己方泰坦脉冲（法术4）
    | 'TITAN_RELIGHT'       // [2026-08-05 莉莉子] 泰坦点亮类：移除己方泰坦黯淡关键词（法术3）
    | 'BURNOUT_SUMMON'      // [2026-08-05 莉莉子] 燃尽召唤类：消耗全部法力、按燃尽值随机召唤泰坦（法术12）
    | 'NEGATE'              // [2026-08-05 莉莉子] 无效化类：从法术堆叠移除目标法术（法术8/6/7）
    | 'RESURRECT'           // [2026-08-06 莉莉子] 复活类：从墓地复活最强N个单位并附幻象（法术2）
    | 'SET_STATS'           // [2026-08-18 莉莉子] 面板强制设定类：本回合将单位面板设置为指定数值（止水凝形）
    | 'CLONE_TO_HAND'       // [2026-08-18 莉莉子] 复制到手类：复制任意单位的基础白板到手牌并附瞬逝（忆影拓印）
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「倾泻」] 多段连击类（**一次算完**，不是状态机）
    //   ── 与 `CHAIN_STRIKE` 的本质区别（别照抄它）：
    //      · CHAIN_STRIKE 是**状态机**（`types.ts:388-405` 的 `pendingChain`）：一击一步、
    //        由 `useGameState` 的驱动器 `setTimeout` 逐击推进 ⇒ 天生 N 次动画；
    //      · BARRAGE 在**同一次 `processEffect` 调用内**把 N 发全部算完、伤害合并成**一条**
    //        `unit_damage` / `nexus_damage` 事件 ⇒ 演出层只播一次合并飘字（设计要的正是这个）。
    | 'BARRAGE'             // [2026-11-14 莉莉子 · 凯茜娅] 倾泻类：按施法者攻击力算发数，逐发 2 点一次算完
    | 'PIERCE_STEP'         // [2026-11-15 程拍板 · 凯茜娅] 穿云激流的**单发结算步**（状态机，驱动器逐拍调）
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4「映现·梅莉桑德」]
    //   「倾泻」永久减费类：宿主**打击敌方水晶后**（`ON_NEXUS_STRIKE`）把减费记进账本
    //   （`utils/katyaProgress.ts` 的 `addKatyaBarrageCostDown`），
    //   查询腿由 `utils/gameRules.ts:132` 读同一本账 ⇒ 卡面价 / 门禁价 / 实扣价三价同源。
    | 'KATYA_BARRAGE_COST_DOWN'
    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4 第三批 · 三张卡]
    // ── 这三个 class 的语义都**只读 `class` 字段做识别**，不靠 processEffect 的 switch 落地；
    //    驱动点写在各条注释里（`GRANT_HAND_KEYWORD` 例外，它在 effectProcessor 里有 case）。
    // ==========================================
    /** [誊抄] 给**手牌**里的一张法术实例追加关键词（写的是手牌实例，**不碰 `CARD_DB`**） */
    | 'GRANT_HAND_KEYWORD'
    /**
     * [映现·尤拉莉雅 ①] 我方本轮打出法术 ⇒ 自身获得【屏障】（每回合至多一次）。
     * 驱动点：`hooks/useSpellSystem.ts` 的 `dispatchSpellCastSideEffects` 尾段（法术真正结算后，
     * 覆盖 极速 / 堆栈 / 被反制 三个出口）；**不在** `effectProcessor` 里派发。
     */
    | 'KATYA_SPELL_CAST_BARRIER'
    /**
     * [映现·尤拉莉雅 ②] 自身受到打击 ⇒ 该方「倾泻」的发数 +N（无上限）。
     * `timing: 'ON_DAMAGE_SURVIVE'`；驱动点 = 微队列的 `UNIT_DAMAGED` 那一路
     * （`useGameState.ts:3015`）—— **不是** `effectProcessor` 内的即时检测那一路（会双触发，见该处注释）。
     */
    | 'KATYA_BARRAGE_OBSERVER'
    /**
     * [2026-11-14 莉莉子 ✨新功能 · 卡「溯时双翼·狂乱」] **武装本回合的狂乱账本**。
     * 本类只做一件事：`utils/katyaFrenzy.ts` 的 `armFrenzy(context.owner, params.every)`。
     * 真正的伤害**不在这里**结算 —— 埋点在 `effectProcessor` 的 `case 'BARRAGE'` 收尾
     * （「一次倾泻结算完成」处），由那里补 `effect_katya_frenzy_aoe`（STRIKE + targetAllEnemies）。
     */
    | 'ARM_FRENZY'

export type EffectTiming =
    | 'BURST' | 'FAST' | 'SLOW'
    | 'ON_PLAY' | 'ON_ATTACK_DECLARE' | 'ON_ATTACK' | 'LAST_BREATH'
    | 'ROUND_START' | 'ROUND_END' | 'ON_PLAY_AND_ROUND_START'
    | 'ON_PLAY_FROM_HAND'    // [2026-10-06 程拍板] 「打出时」：**只有从手牌打出**才触发（≠「入场」）
    | 'ON_FIRST_NEXUS_STRIKE'
    | 'ON_NEXUS_STRIKE'      // [2026-07-14 锻造者] 每次打击水晶时触发（不限于首次）
    | 'ON_DAMAGE_SURVIVE'    // [达努] 受伤并存活时触发
    | 'ON_FRIENDLY_DAMAGED'  // [达努] 友方单位被伤害时触发（光环）
    | 'ON_FIRST_ATTACK'      // [达努] 首次进攻时触发
    | 'POST_COMBAT'          // [达努] 战斗结算后触发（存活判定）
    | 'ON_FIRST_ROUND_END'   // [鸦眼] 首次回合结束时触发
    | 'ON_GET_ATTACK_TOKEN'; // [安卡希雅] 获得进攻标识时触发

// ── [2026-10-06 程拍板 · 时机口径统一] 「入场」与「打出时」是**两个不同**的时机 ──
//   · `ON_PLAY` / `ON_PLAY_AND_ROUND_START` = **入场**：从手牌打出 **或** 被效果召唤到战场都触发。
//     口径来源 = `data/keywords.ts` 的术语表「入场」条目 —— 那是**玩家能看到的词条**，所以它是**契约**。
//   · `ON_PLAY_FROM_HAND` = **打出时**：**只有从手牌打出**才触发；
//     被法术召唤到场上、或被别人的能力拉到场上（如白猎「重装出击」）**都不触发**。
//   ⚠️ **不要再用 `timing.includes('ON_PLAY')` 这种子串匹配** ——
//      `'ON_PLAY_FROM_HAND'.includes('ON_PLAY') === true`，会把两条时机混成一条。
//      一律走下面两个判据函数（各自只有一个真源）。
export const isEntryTiming = (t?: string): boolean =>
    t === 'ON_PLAY' || t === 'ON_PLAY_AND_ROUND_START';
export const isPlayFromHandTiming = (t?: string): boolean =>
    t === 'ON_PLAY_FROM_HAND';

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
    // [2026-10-23 莉莉子 · 崩坏] 敌方侧目标：**敌方单位 或 敌方水晶**（不含我方）。
    //   ── 为什么不复用 ANY_TARGET：它是两侧全放行（`useSpellSystem.ts:513 return true`）
    //      ⇒「崩坏」的第二目标能选到**自己人**，搬运伤害就砸回我方，语义直接跑偏。
    //   ── 为什么不用 targetCondition 过滤：`params.targetCondition` 是**效果级**参数，
    //      对**所有** targetRequirements 一起生效 ⇒ 会把第 1 步的「我方泰坦单位」一起挡掉。
    | 'ENEMY_TARGET'    // 敌方单位或敌方水晶（仅敌方侧）
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
    /**
     * [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「倾泻」Lv1/Lv2 门] **水晶类目标**的施法者等级下限。
     *
     * 语义（精确到分支，别理解成"整条需求失效"）：
     *   · 只约束「**水晶**」这一类目标（`card === 'nexus'` 的那条路径）；
     *   · **单位**目标不受影响（`count` 需求照旧）；
     *   · 未设 = 不限制。
     *
     * 为什么只约束水晶：`ENEMY_TARGET` / `ANY_TARGET` 这类 type 把"单位"与"水晶"混在
     *   同一个枚举值里 ⇒ 给整条需求加等级门会把单位一起挡掉（那就没目标可选了）。
     *   而"Lv1 不能打水晶、Lv2 才能打"正是这类卡唯一的等级差异。
     *
     * 施法者等级的来源：本等级**不在**法术卡上（法术卡恒 `level: 0`），而在天启者本体上 ——
     *   由 `hooks/useSpellSystem.ts` 的 `getCasterKatyaLevel(side)` **只扫施法方**那四区域取
     *   （见 `isValidTarget` 的 `nexusMinLevel` / `casterSide` 形参）。
     *   ⚠️ 绝不扫双方取 max：镜像对局里敌方 Lv2 会顶开我方 Lv1 的水晶门（白花费用 + 零伤害）。
     *   **目标筛选层是唯一门**，结算层另有一道兜底（`BARRAGE` case）。
     */
    minLevel?: number;
    /**
     * [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「誊抄」] **排除**拥有这些关键词的目标（**语义 = "或"取反**）。
     *
     * 与 `keywordFilter` 的关系：`keywordFilter` 是「至少拥有其一 ⇒ 放行」，
     *   本字段是「拥有任意其一 ⇒ **拒绝**」。两者可同时出现，先放行、后排除。
     *
     * ⚠️ 为什么必须**新增字段**、不能复用 `keywordFilter`：
     *   ① 「已是【回响】的法术不可选」在 `keywordFilter` 的语义下表达不出来（它只会"要"，不会"不要"）；
     *   ② `keywordFilter` 在 `isValidTarget` 里判、而 **`HAND_CARD` 在判它之前就 `return true` 了**
     *      （`hooks/useSpellSystem.ts:548-551`）⇒ 对**手牌**根本不起作用。
     *      所以本字段的判定被放进那段 `HAND_CARD` 分支**内部**（见该处注释）。
     *
     * 目前唯一使用者：`effect_katya_transcribe`（`excludeKeywords: ['Echo']`）。
     * 未设 = 不过滤（其余全部 134 条效果逐字不变）。
     */
    excludeKeywords?: string[];
}

// [修改] 扁平化参数结构，移除 buffs 嵌套，与 Processor 对齐
export interface EffectParams {
    value?: number;          // 伤害数值
    targetPower?: number;    // [2026-08-18 莉莉子] 面板强制设定的攻击力（止水凝形）
    targetHealth?: number;   // [2026-08-18 莉莉子] 面板强制设定的血量（止水凝形）
    power?: number;          // Buff 攻击
    health?: number;         // Buff 血量
    keywords?: string[];     // Buff 词条
    removeKeywords?: string[]; // [新增] 要移除的关键词（用于蟾鉴易纹等关键词转移）
    duration?: 'ROUND' | 'PERMANENT';
    strikeMode?: 'MUTUAL' | 'ONE_WAY'; // [新增] 打击模式
    condition?: string;
    summonKey?: string;              // [新增] 召唤物的卡牌 Key
    summonZone?: 'bench' | 'combat' | 'hand'; // [修改] 召唤的降落点（备战席 / 交战区 / 手牌）——'hand' 用于撤回类法术回手牌
    summonSide?: 'self' | 'opponent'; // [2026-09-16 茉莉安] 召唤落点的阵营：'self' 己方（默认，保持原有行为）/ 'opponent' 落到对方半场（獠牙信标）
    presenceRequirement?: string[];  // [新增] 通用在场条件扫描名单 (写入需要的卡牌 Key)
    targetKeyRequirement?: string[]; // [新增] 定向发牌白名单：只给拥有这些 Key 的单位发放 Buff
    raceFilter?: Race[];             // [新增] 种族过滤器：只给指定种族的单位发放效果
    // [2026-10-02 莉莉子 BUG修复] 与 raceFilter【取并集】的 Key 白名单（OR 语义）。
    //   ⚠️ 本文件与 effectProcessor.ts 各有一份 EffectParams，新增字段必须【两边同步补】（见 I01）
    includeKeys?: string[];

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
    gameStartSummon?: string;         // [2026-09-16 茉莉安] ④【库效】对局开始：召唤该 Key 落场（只触发一次）
    spreadDamageTotal?: number;       // [2026-09-16 茉莉安] SPREAD_DAMAGE：对己方全体分摊的总伤害量
    summonOnlyIfAbsent?: boolean;     // [2026-09-16 茉莉安] SUMMON：落点已有同名单位则不召唤（信标「最多 1 个」）
    damageBeaconBy?: number;          // [2026-09-16 茉莉安] 钢羽傍身：对獠牙信标造成 N 点伤害（来源=法术卡本身）
    // [2026-10-04 程拍板] 茉莉安对信标的打击伤害 = **等级固定值**（Lv1 = 5 / Lv2 = 8）。
    // ── 取代原 `damageBeaconBySummonerPower`：那条取"召唤者侧茉莉安的当前攻击力"，
    //    而肉鸽能把她叠到 20+ 攻击力 ⇒ 一记补刀打死信标 ⇒「重生召唤 → 补刀打死 → 再召唤」
    //    形成**无限循环爆炸**（程：「这不是我们想看到的」）。
    // ── 为什么需要独立参数：亡语执行时 `sourceCard` 是**一具尸体**（信标 power = 0），
    //    所以不能复用 `damageBeaconBySelfPower`（那会读出 0）；本参数会去"找活着的她"再按等级取值。
    // ── 数值**不在**此处配置（避免两处漂移）：唯一定义在 effectProcessor 的 `marianBeaconStrike()`。
    damageBeaconByMarianLevel?: boolean;
    // [2026-09-17 松露小队] 限定打哪一侧的信标；[2026-10-02] 新增 'same'
    //   'both'     缺省，双边都打（钢羽傍身的历史行为）
    //   'opponent' 只打【施法者对面】那一侧（夜视监察无人机：别炸自己半场的信标）
    //   'same'     只打【施法者本方】那一侧 —— 专供**亡语**语境：
    //              亡语执行时 owner = 那具尸体所在侧（信标站的那一侧），
    //              而"召唤/补刀"的对象正是**同侧**的那枚新信标 ⇒ 只用 'opponent'/'both' 都不对。
    damageBeaconSide?: 'both' | 'opponent' | 'same';
    damageBeaconBySelfPower?: boolean;  // [2026-09-17 松露小队 · 流萤] 伤害取「施法者自身当前攻击力」，覆盖 damageBeaconBy 的静态值
    summonCountPerExposedEnemy?: number; // [2026-09-17 松露小队 · 榆] 动态召唤数：每有一个【暴露】的敌人召唤一个，本值 = 上限
    gameStartSummonSide?: 'self' | 'opponent'; // [2026-09-16 茉莉安] 落点阵营：缺省 'self'；'opponent' = 落到对方半场（獠牙信标）
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
    // ⚠️ [2026-10-06 程拍板] 原 `triggerOnPlay`（"从手牌召唤时是否触发入场效果"）**已删除**：
    //   死字段（全项目零消费），也正是"战术闪击不触发入场"那个 BUG 的成因 ——
    //   数据声明了意图、却没人实现。现「召唤到战场是否触发入场」是**统一口径**
    //   （一律触发，见 `logic/summonEntry.ts`），不再由数据逐条开关。
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
    enlightenOverwhelm?: boolean; // [2026-09-23 莉莉子] targetAllEnemies 路径的「觉悟·全场碾压」开关；缺省=开（巨偶一瞥原行为），显式 false 关闭
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
    /**
     * [2026-11-14 莉莉子 · 程拍板「延续」] `RANDOM_WOUNDED_ALLY` 的**第二级兜底**：
     * 受伤池为空时退到「任意存活友军」（哪怕满血、治疗量结算为 0），而非空过。
     * ── 优先级（`effectProcessor.ts` 的 RANDOM_WOUNDED_ALLY 分支）：
     *      受伤友军 > `fallbackToAny`（任意友军） > `nexusFallback`（本方水晶） > 空过。
     *    两个都开时 `fallbackToAny` 优先 —— 「治疗一个友方单位」比「改奶水晶」更贴近卡面。
     * ── 唯一可能仍为空的情况：本方**场上一个存活单位都没有**（连交战区也没有），此时安静空过。
     */
    fallbackToAny?: boolean;
    targetType?: string;         // 目标类型
    reduceCostIfDuplicate?: boolean; // 手牌重复减费
    freezeAllEnemies?: boolean;  // 冻结全体敌方
    selfDamage?: number;         // 反噬契约：效果执行后对施法者自身造成 N 点伤害

    // =====================================
    // [2026-10-23 莉莉子] 三张新法术所需的三个开关
    //   ⚠️ 本文件与 effectProcessor.ts 各有一份 EffectParams，
    //      新增字段必须【两边同步补】（见本文件上文 I01 备注）
    // =====================================
    valueFromAllyPower?: boolean;   // [崩坏] 伤害值取「第 1 目标的当前攻击力」，对第 1、2 目标各打一次等量伤害
    // [2026-11-14 莉莉子 · 凯茜娅 L4「紧急补给」] 过滤抽取补 `'spell'`（卡面「抽至多 3 张法术牌」）
    drawFilter?: 'champion' | 'unit' | 'spell';        // [同行/凯茜娅] 过滤抽取：只抽牌库中满足该筛选项的牌（随机位置）
    drawFallbackFilter?: 'champion' | 'unit' | 'spell'; // [同行/凯茜娅] 过滤抽取找不到时，退化为按该筛选项再抽一张
    discardAll?: boolean;           // [回收] 弃置全部手牌（本参数与 drawAfterDiscard / manaGainAfter 同属一个效果）
    drawAfterDiscard?: number;      // [回收] 弃置全部之后抽 N 张（在同一效果内完成，避开跨效果的手牌容量竞态）
    manaGainAfter?: number;         // [回收] 弃置全部之后恢复 N 点法力值（走 GRANT_MANA 同口径：不超上限）
    /** [凯茜娅 L4「紧急补给」] 手牌满时**停止抽牌**（不烧牌）；缺省 = 保留既有爆牌行为 */
    stopWhenHandFull?: boolean;
    fromHoardStored?: boolean;      // [囤积] 兑现「这张卡自己」攒下的点数（CardData.hoardStored），不取固定 value
    // =====================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「倾泻」] BARRAGE 类参数
    //   ⚠️ 与 `logic/effectProcessor.ts` 的 EffectParams **必须同步**（两处各有一份，见 I01）
    // =====================================
    damage?: number;                // BARRAGE：**每一发**的伤害（倾泻 = 2）
    lv2UnlockNexus?: boolean;       // BARRAGE：true ⇒ 水晶目标需施法者 Lv2（配合 targetRequirements[i].minLevel 使用）
    barrageObserverBonus?: number;  // BARRAGE：观察员累计加成（L4 接账本前恒读 0）
    // =====================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4 四张卡]
    //   ⚠️ 与 `logic/effectProcessor.ts` 的 EffectParams **必须同步**（两处各有一份，见 I01）
    // =====================================
    katyaBarrageCostDown?: number;  // [梅莉桑德] 每次打击「倾泻」永久 −N（缺省读 value，再缺省 1）
    generateCount?: number;         // [滞空碎星] 生成张数（缺省 1 = 老行为）
    generateCountIfWounded?: number; // [滞空碎星] 第 1 目标 damageTaken > 0 时的生成张数（2 → 3）
    costOverride?: number;          // [滞空碎星] 生成物改写费用（0 费「暗箭」；同时写 cost + costOverride）
    fillToCap?: boolean;            // [紧急补给] SPELL_MANA_GAIN 改为回满（spellManaCapOf）
    // =====================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4 第三批 · 「映现·奥德涅」]
    //   GENERATE 的「按费用随机挑」三件套
    //   ⚠️ 与 `logic/effectProcessor.ts` 的 EffectParams **必须同步**（两处各有一份，见 I01）
    // =====================================
    /**
     * [奥德涅] 随机生成模式：**不给 `generateKey`**，而是从池子里筛「费用 ≤ N」的牌随机取。
     * ── 口径：`randomFromCostAtMost: 3` ⇒ **低费 = 费用 ≤ 3**（[2026-11-14 程拍板] 定稿；原保守值 2）。
     * ── 每次生成**各抽一次**（`generateCount: 2` ⇒ 可能抽到两张不同的）。
     */
    randomFromCostAtMost?: number;
    /**
     * [奥德涅] 随机池的来源：`'spell'` = 只挑法术牌（`type` 以 `spell` 开头，
     * 与 `utils/gameRules.ts:74-76` 的口径逐字同源）。
     * ── 池子的优先级：**本方牌库**里符合条件的不同 `key` → 空则退化为**同阵营全局卡池**
     *    （`CARD_DB` 里 `region === 本源卡 region` 且可收藏）。理由见 GENERATE 分支注释。
     */
    randomPool?: 'spell';
    /**
     * [奥德涅] **前置条件**：本方手牌里必须存在这些 key 之一，否则本效果整段不执行。
     * 卡面的「若“凯茜娅·狂诗”在手牌」用它表达（写在卡牌数据里，不散落进代码）。
     * ── 精确匹配 `card.key`（不用 `includes` —— 凯茜娅的 key 是唯一全名）。
     */
    requireInHandKey?: string[];
    // =====================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅最后两张卡]
    //   ⚠️ 与 `logic/effectProcessor.ts` 的 EffectParams **必须同步**（两处各有一份，见 I01）
    // =====================================
    /**
     * [狂乱 / ARM_FRENZY] 「每倾泻 N 次」的 N。
     * ⚠️ 执行真源是 `utils/katyaFrenzy.ts` 的 `FRENZY_EVERY`（缺省即取它）；
     *   这里写同值只是**声明**，`armFrenzy` 会按本值落地，两边不一致时以数据为准（有日志）。
     */
    every?: number;
    /** [狂乱 / ARM_FRENZY] 每跳对敌方全体造成的伤害（声明用；执行真源是 `effect_katya_frenzy_aoe` 的 `value`，不一致会 warn） */
    aoeDamage?: number;
    /**
     * [穿云激流 / BARRAGE] `true` ⇒ 走「消耗全部攻击力随机倾泻 + 击杀续打」分支：
     * 目标**逐发随机重掷**、无 `finalTargets`、击杀后补水晶伤害并 +N/+0 续打。
     */
    pierceLoop?: boolean;
    /** [穿云激流] 每击杀一个敌方单位，敌方水晶受到的伤害（口径缺省 2） */
    killNexusDamage?: number;
    /** [穿云激流] 每击杀一个敌方单位，给予凯茜娅的 +N/+0 攻击力（写 `roundBuffs.power`） */
    killGrantPower?: number;
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
        description: '攻击宣告时，召唤一个完全复制自身当前身材与增益的【镜爻·卜卜】参与进攻，且该分身具有【幻象】。',
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
              // [2026-10-02 莉莉子 BUG修复 · 卜卜吃到医疗鳄加血]
              //   原为 `raceFilter: ['summoner', 'summon']` —— 但 **'summoner' 是「召唤师类」天启者共用的 race**
              //   （库兰娅丝、猫汐尔、卜卜…），导致卜卜也吃到 +0/+1。
              //   粉丝原话：「这个加血卜卜会吃到是机制吗」→ 程判定：是 BUG（不该吃到）。
              //   卡面口径是「友方所有【召唤单位】和【库兰娅丝】」：
              //     · 召唤单位 → race 'summon'（项目里"召唤衍生物"的统一口径：effectRegistry:592/2121、肉鸽强化）
              //     · 库兰娅丝 → 她的 race 是 'summoner'，无法用 raceFilter 单独挑出 ⇒ 走 includeKeys 白名单
              raceFilter: ['summon'],
              includeKeys: ['Illustration_Squad_Kuranas'],
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
            { type: 'ANY_UNIT', count: 1, label: '选择攻击力＜3的单位' }
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
        description: '受伤时生成“梦莲无人机”，回合结束造成X次1点伤害。【攻击力最多为10】【每方最多3个】',
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

    // ==========================================
    // [2026-10-08 莉莉子 · 法术专属装备 第二波] **装备追加效果**（不进 CARD_DB.effects）
    //   由 `equipment.spellResolve.grantEffects` 声明 → `spells.ts` 在效果链**末尾**追加执行。
    //   为什么不用"改实例 effects"：法术结算是按 `CARD_DB[cardKey].effects` 跑的，
    //   实例上的 effects 不会被读取（这也是本次唯一必须动 `spells.ts` 的原因）。
    // ==========================================
    'effect_equip_warm_notes': {
        id: 'effect_equip_warm_notes',
        name: '余温',
        description: '恢复 1 点法术法力。',
        class: 'SPELL_MANA_GAIN',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1 },
    },
    'effect_equip_page_slip_draw1': {
        id: 'effect_equip_page_slip_draw1',
        name: '夹层',
        description: '抽 1 张牌。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 1 },
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
            // [2026-10-04 莉莉子] 满血屏蔽：ally_only → ally_not_full
            //   —— 满血单位（damageTaken=0）/ 满血水晶的治疗量恒为 0
            //   （effectProcessor:3178-3179 单位取 min(damageTaken, amount)；:3159 水晶取 min(nexusMax-cur, amount)），
            //   放行等于让玩家白花 2 费 ⇒ 改由目标校验层（useSpellSystem.isValidTarget）直接挡下。
            targetCondition: 'ally_not_full'
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
            { type: 'ALLY_UNIT', count: 1, label: '选择一个泰坦友方单位', raceFilter: ['titan'] },
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
            { type: 'ALLY_UNIT', count: 1, label: '选择拥有幻象的友方单位', keywordFilter: ['Ephemeral'] },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
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
        // [2026-10-06 程拍板] **需要玩家选牌 ⇒ 归「打出时」**：被召唤到场上时不触发
        //   （否则没有选牌界面、会静默无事发生）。卡面文案同步为「打出时」。
        timing: 'ON_PLAY_FROM_HAND',
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
        params: { value: 1, power: 1, health: 0, targetCondition: 'injured' }, // [2026-08-29 修复] 漏埋 injured 暗号（须放 params，useSpellSystem 从 params.targetCondition 读）→ 没受伤也能选目标
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

    // --- 科洛：回合开始时，复制上回合前三张非瞬逝牌到手牌 ---
    'effect_poet_kelo_recycle': {
        id: 'effect_poet_kelo_recycle',
        name: '收藏癖',
        description: '回合开始时：复制上回合我方打出的前三张非瞬逝卡牌到手牌，并赋予[瞬逝]。',
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
        // [2026-10-06 程拍板] **需要玩家选目标（手牌单位）⇒ 归「打出时」**：
        //   被召唤到场上时不触发（否则没有选牌界面、只会静默无事发生）。卡面文案同步为「打出时」。
        //   ⚠️ 它的实际执行由 `useGameState` 的 `confirmWhiteHuntSummon` 手工接管（本站点 effects 仅供视觉层）。
        timing: 'ON_PLAY_FROM_HAND',
        speed: 'BURST',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, cardTypeFilter: 'unit', label: '选择一个手牌中的单位' }
        ],
        params: { power: 3, keywords: ['Overwhelm'], maxCost: 7 }
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
        // [2026-10-06 程拍板] **需要玩家选牌 ⇒ 归「打出时」**：被召唤到场上时不触发
        //   （与白猎 / 瓦莱莉 同口径）。手牌打出时照旧触发（打出路径同时放行两条时机）。
        timing: 'ON_PLAY_FROM_HAND',
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
        // [2026-08-24 莉莉子 数据修复] 补 Overwhelm，使实现符合描述「+3/+3和碾压」
        // effectProcessor FLYING_SWORD case 会经 fsParams.keywords 合并进衍生物关键词
        params: { summonCount: 1, power: 3, health: 3, keywords: ['Overwhelm'] }
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
        // [2026-10-06 程拍板] 卡面写的是「**打出时**」⇒ 用 `ON_PLAY_FROM_HAND`：
        //   被召唤到场上（战术闪击 / 白猎等）时**不该**白送两把飞剑。
        timing: 'ON_PLAY_FROM_HAND',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonCount: 2 }
    },
    'effect_sacred_tree_margaret': {
        id: 'effect_sacred_tree_margaret',
        name: '飞剑突袭',
        description: '进攻时：飞剑2，并重新点亮充能。',
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
            { type: 'SPELL_ON_STACK', count: 1, label: '选择一张≤3费的快速法术', stackCostBelow:4, stackSpeedFilter: ['spell-fast'] }
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
        description: '极速：选择一张≤3费的手牌单位打出',
        class: 'SUMMON_FROM_HAND',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'HAND_CARD', count: 1, cardTypeFilter: 'unit', label: '选择一张≤3费的手牌单位' }
        ],
        params: { maxCost: 4 },
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

    // ==========================================
    // [2026-08-18 莉莉子] 猫汐尔阵营法术效果
    // 止水凝形 / 忆影拓印 / 藕断丝长
    // ==========================================

    // --- 1. 止水凝形：本回合强制设定面板 1/6 ---
    'effect_mauxir_zhishui_ningxing': {
        id: 'effect_mauxir_zhishui_ningxing',
        name: '止水凝形',
        description: '本回合内，将任意一个单位的面板强制设置为 1/6。',
        class: 'SET_STATS',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ANY_UNIT', count: 1, label: '选择任意一个单位' }
        ],
        params: { targetPower: 1, targetHealth: 6 }
    },

    // --- 2. 忆影拓印：白板复制到手（瞬逝） ---
    'effect_mauxir_yiying_tuoyin': {
        id: 'effect_mauxir_yiying_tuoyin',
        name: '忆影拓印',
        description: '选择任意一个单位，在手牌生成一张瞬逝的白板复制牌（基础面板，不含增益）。',
        class: 'CLONE_TO_HAND',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ANY_UNIT', count: 1, label: '选择任意一个单位' }
        ],
        params: {
            isVolatile: true,
            // =====================================
            // [2026-10-23 程拍板 · 回调] 此处**不加** `targetCondition: 'not_at_side_limit'`。
            // ── 原因（程的原话口径）：忆影拓印的效果是「复制卡牌**到手里**」，不是复制到场上
            //    ⇒ 在**选目标阶段**就拦「场上有 3 个基座」是**拦得太早**：
            //    复制出来的牌进手牌本身没有任何问题，它能不能落地是**打出那一刻**才该判的事。
            // ── 更要紧的是扩展性：若在这里逐卡放行/拦截，
            //    **以后每出一张「复制类」法术都要补一次**，而它们其实都不该在这里判。
            // ── 现在的分工：
            //    ① 「场上已达上限还从手牌打出第 N+1 个」→ 拦在**手牌点击**（`GameSession`，通用判据，按卡的 `maxPerSide`）。
            //    ② 「真的把基座召唤到场上」的法术（猫汐尔小技能「千莲叠绽」）→ 拦在
            //       `gameRules.getSpellPlayBlockReason`（唯一"打出受阻"口径，高亮与点击天然同源）。
            // =====================================
        }
    },

    // --- 3. 藕断丝长：召唤衍生物 +1/+1 并附加亡语抽3 ---
    'effect_mauxir_ouduan_si_chang': {
        id: 'effect_mauxir_ouduan_si_chang',
        name: '藕断丝长',
        description: '选择一个召唤衍生物，使其获得 +1/+1 和 [亡语]：本单位阵亡时，抽取 3 张卡牌。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ALLY_UNIT', count: 1, label: '选择一个召唤衍生物', raceFilter: ['summon'] }
        ],
        params: { power: 1, health: 1, duration: 'PERMANENT', buffTag: 'drone_power', raceFilter: ['summon'] }
    },

    // --- 3b. 藕断丝长的亡语：阵亡时抽取 3 张 ---
    'effect_mauxir_ouduan_si_chang_death': {
        id: 'effect_mauxir_ouduan_si_chang_death',
        name: '藕断丝连',
        description: '【亡语】：本单位阵亡时，抽取 3 张卡牌。',
        class: 'DRAW',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: { value: 3 }
    },

    // ==========================================
    // [2026-09-16 1.0.16 茉莉安大版本]
    // ==========================================

    // --- 茉莉安 Lv1：狂轰滥炸 ---
    // 🔑 【库效】基因必须挂在【茉莉安本体】上，不能挂在信标上 ——
    //    信标是 isCollectible:false 的衍生物，永远不会出现在牌库里，挂它身上永远不触发。
    //    （设计文档 3.2 把这条列为「实装待确认」，结论是唯一的）
    'effect_marian_lv1': {
        id: 'effect_marian_lv1',
        name: '狂轰滥炸',
        description: '【库效】对局开始时：在敌方备战席召唤一个「獠牙信标」。\n入场：若敌方备战席没有「獠牙信标」则召唤一个；若已有，则为它附加亡语：阵亡时召唤一个「獠牙信标」，并造成 5 点伤害。',
        class: 'SUMMON',
        // [2026-09-19 T38] `ON_PLAY_AND_ROUND_START` → **`ON_PLAY`**：回合开始那条要按等级分叉
        //   （Lv1 不再每回合补），改由 useRoundLifecycle 的 scanLibrarySummon 单独承担并加 Lv2 闸门。
        //   ⚠️ 若保留 ROUND_START，本效果会在每回合开始绕过闸门再补一次，T38 形同虚设。
        //   [2026-10-02 莉莉子 信标亡语化] scanLibrarySummon 的补信标段**已整体删除**（程拍板不做回合开始兜底），
        //     故本效果现在只承担两个职责：① 库效开局召唤 ② 入场"有则贴亡语 / 无则召唤"。
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            // 【库效】对局开始（useGameState.triggerGameStartGenerate，换牌后触发）
            gameStartSummon: 'Marian_Wolf_Tooth_Beacon',
            gameStartSummonSide: 'opponent',
            // 入场：若敌方备战席没有「獠牙信标」则召唤一个
            //   summonSide:'opponent' 复用 T04 的跨阵营落点；summonOnlyIfAbsent 保证「场上最多 1 个」
            summonKey: 'Marian_Wolf_Tooth_Beacon',
            summonSide: 'opponent',
            summonCount: 1,
            summonOnlyIfAbsent: true,
            // 🔑 [2026-10-02 莉莉子 信标亡语化 · 程当晚更正] 「贴重生亡语」**不在这里做** ——
            //    它已下放为**等级无关的「信标重生光环」**，由 useGameState 亡语派发处动态判定。
            // ── 为什么不能"入场贴一次"（程点出的两个必断档场景）：
            //    ① 入场时若场上没有信标，她召唤的那枚不会被贴；它被打死正好凑满升级 ⇒ 场上再无信标；
            //    ② 即使贴了，重生出来的新信标不带亡语 ⇒ 第 2 枚被打死后再无信标。
            //    再叠加"致死那一击看不到刚达成的 Lv2"（升级标记写在死亡批次末尾）⇒ 必然断档。
            // ── 下放为光环后：只要她在场，**任意时刻的信标**都带亡语 ⇒ 链不会断。
        }
    },

    // --- [2026-09-18] 茉莉安 ②：入场 & 回合开始 → 对敌方备战席的信标打「等级固定值」的伤害 ---
    //   与 effect_marian_lv1（补信标）成对使用：在 effects 数组里排在它**后面**，保证「先补后打」
    //   伤害归属茉莉安本体（sourceCard = 茉莉安）
    //   [2026-10-04 程拍板] 伤害由「等同自身攻击力」改为**等级固定值**（Lv1 = 5 / Lv2 = 8）——
    //     肉鸽把她叠到 20+ 攻击力时，原口径会让信标被反复一击打死 ⇒ 无限循环爆炸。
    //   damageBeaconSide:'opponent' 只打对面 —— 避免敌方信标正落在我方半场时反噬自家信标
    'effect_marian_beacon_snipe': {
        id: 'effect_marian_beacon_snipe',
        name: '猎场压制',
        description: '入场及回合开始时：对敌方备战席的「獠牙信标」造成 5 点伤害（Lv2 为 8 点）。',
        class: 'BUFF',              // 复用 BUFF：它已完整支持 damageBeaconBy / damageBeaconByMarianLevel
        timing: 'ON_PLAY_AND_ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            damageBeaconByMarianLevel: true, // 伤害 = 等级固定值（Lv1 5 / Lv2 8），**不再取她的攻击力**
            damageBeaconSide: 'opponent',   // 只打对面
        }
    },

    // --- 茉莉安 抉择① 小技能：钢羽傍身（T14）---
    'effect_marian_rush': {
        id: 'effect_marian_rush',
        name: '钢羽傍身',
        description: '对“獠牙信标”造成 3 点伤害，以暴露两个敌人。',
        class: 'BUFF',            // 复用 BUFF：它已完整支持「施加关键词」（含 ROUND / PERMANENT 两形态）
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 2, label: '选择两个敌方单位' }
        ],
        params: {
            damageBeaconBy: 3,    // 对信标的伤害（来源=法术卡本身，不归属茉莉安）
            // [2026-10-04 莉莉子 BUG修复 · 审计 #3] **必须显式声明打哪一侧**：
            //   缺省会落到 BUFF 分支的 `'both'` 双边分支 ⇒ **AI 打出时打自家信标**，
            //   并引爆对面那枚（它落在自己半场）炸自己一片。
            //   同文件的猎场压制（:2214）· 夜视监察（:2456）· 流萤（:2487）都显式写了 `'opponent'`。
            damageBeaconSide: 'opponent',
            keywords: ['Exposed'],
            duration: 'PERMANENT', // ⚠️ 设计文档 2.2 允许两种形态，本卡先取「永久赋予」；改 ROUND 即单回合
        }
    },

    // --- 茉莉安 抉择② 大招：最终指令（T15）---
    // ⚠️ 设计文档 5.1 注记：伤害 = 茉莉安攻击力 → **Lv2 斩杀线 6**。
    //    这意味着它本质更像「连斩中血量单位」而非原定的「残血收割机」（原定性基于斩杀线 3）。
    //    设计文档已把「大招定位需复核」列为 🔴 待程定（见待程决策 D2）。
    'effect_marian_ultimate': {
        id: 'effect_marian_ultimate',
        name: '最终指令',
        description: '打击一个敌方单位，造成等同于“茉莉安 霄鹰”攻击力的伤害。若将其击杀，则自动锁定当前生命值最低的敌方单位再次打击。',
        class: 'CHAIN_STRIKE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' }
        ],
        params: {}
    },

    // --- 茉莉安 支援技：重器制空（T16 → 2026-09-23 重做）---
    // 🎯 重做动机（程 2026-09-23 拍板）：
    //    旧版只有「召唤信标」一条腿，而卡面的打出条件又是「落点没有信标」；
    //    可 ④库效 在【对局开始】就放了一个 ⇒ 整局都打不出去，是一张**结构性死牌**。
    //    且名字叫「重器制空」却干着后勤的活，名实不符。
    // 🔧 新语义 —— 柔性二选一 + 覆盖轰炸：
    //    ① 敌方半场（备战席 + 交战区）已有【存活】的信标 → 对其造成 5 点伤害
    //    ② 没有 → 在敌方备战席召唤一个
    //    ③ 之后（独立的第二效果）→ 对敌方备战席 + 交战区全体造成 1 点伤害
    //    ⇒ 「有雷就炸雷，没雷就埋雷」，永远打得出；单发对信标净计 5 + 1 = 6 点。
    // ⚠️ 伤害来源 = 本卡，**不归属茉莉安**（对齐钢羽傍身 / 设计文档 5.2）。
    // ⚠️ 二选一的「短路」逻辑实现在 effectProcessor 的 SUMMON 分支内（见那里的长注释）。
    'effect_marian_support': {
        id: 'effect_marian_support',
        name: '重器制空',
        description: '对敌方半场的“獠牙信标”造成 5 点伤害；若场上没有“獠牙信标”，则在敌方备战席召唤一个。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: {
            summonKey: 'Marian_Wolf_Tooth_Beacon',
            summonSide: 'opponent',   // 跨阵营落点（T04）
            summonCount: 1,
            summonOnlyIfAbsent: true, // 场上最多 1 个信标（判定含交战区）
            damageBeaconBy: 5,        // [2026-09-23] 柔性二选一的「炸雷」分支
            // ⚠️ 这里**刻意不写** damageBeaconSide —— 那个参数只有 BUFF 分支读（钢羽 / 夜视监察）。
            //    本效果走 SUMMON 分支，打击侧直接由 summonSide 推导出的 landingOwner 决定
            //    （'opponent' ⇒ 打敌方半场），写一个没人读的参数只会误导后人。
        }
    },

    // --- 茉莉安 支援技 · 第二段：制空覆盖（2026-09-23 新增）---
    // 作为独立的第二个 effect 挂在同一张卡上（`effects: [...]` 按序结算），
    // ⇒ 直接复用通用的 `value + targetAllEnemies` AOE 原语，**逻辑层零新增代码**。
    // ⚠️ 该原语自带一段硬编码的「觉悟·全场碾压」（maxMana ≥ 10 触发，本是巨偶一瞥的彩蛋），
    //    此处必须用 enlightenOverwhelm:false 关掉，否则白送一次全场碾压。
    // ⚠️ 打的是「备战席 + 交战区」双区，且**包括信标自己**（它就是落点半场的单位）——
    //    这是程明确要的：自己的炮火也会掀动自己的引信。
    'effect_marian_support_aoe': {
        id: 'effect_marian_support_aoe',
        name: '制空覆盖',
        description: '对敌方备战席与战场的所有单位造成 1 点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [],
        params: { value: 1, targetAllEnemies: true, enlightenOverwhelm: false }
    },

    // --- 獠牙信标 亡语：对宿主方全体分摊伤害 ---
    // ⚠️ 现有全部 LAST_BREATH 效果只有 SUMMON / DRAW / GENERATE 三类，没有伤害类 ——
    //    本效果所需的 SPREAD_DAMAGE 类是【新建】的（见问题记录 I11）。
    //    设计文档 11.2 所称「照抄丁型异化人」不成立：那条是 params:{} 的空壳，无任何逻辑消费。
    'effect_marian_beacon_lastbreath': {
        id: 'effect_marian_beacon_lastbreath',
        name: '獠牙引爆',
        description: '【亡语】阵亡时，对我方全体造成 6 点分摊伤害。',
        class: 'SPREAD_DAMAGE',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            // [2026-09-28 莉莉子 数值一致性核对] 程拍板：**以当前实际伤害为准** = 6（卡面已同步改回 6）。
            //   ⚠️ 原注释写"6 → 8（结掉原待数值复核 TODO）"是**不实记录** —— 值从未改成 8；
            //   神格神经 ⑥「亡语翻倍」即以此为基础：6 → 12。
            spreadDamageTotal: 6,
        }
    },

    // ==========================================
    // [2026-10-02 莉莉子 · 信标亡语化] 獠牙信标「重生」亡语（程拍板）
    //
    // ── 病根（为什么要改机制）：旧「补兵券 + 死亡漏斗 + 对账器」需要**监控所有信标死亡路径**，
    //    连续三次出事故（09-23 不计数 / 09-27 交战区实例 / 10-01 补兵根治）。
    // ── 新机制：把重生能力**挂在信标自己身上** —— 它死了，它自己的亡语负责再召唤一枚。
    //    不依赖任何区域扫描，也不需要"她是否在场"的跨区查询。
    //
    // ── 授予方式：**等级无关的光环** —— 只要茉莉安**活着在场**，敌方信标就带这个亡语。
    //    实现 = 亡语派发那一刻动态判定并补挂（useGameState 的 hasLiveMarian 分支）。
    //    ⚠️ 曾经实现为"Lv1 入场贴一次 / Lv2 光环"，**程当晚更正为统一下放 Lv1**：
    //       入场贴一次必然断档（入场时场上没信标的那一枚不会被贴；重生出来的新信标也不带），
    //       再叠加"致死那一击看不到刚达成的 Lv2"（升级标记写在死亡批次末尾）⇒ 两次都会永久断档。
    //
    // ⚠️ 落点必须用**缺省 summonSide**（= 亡语执行者 context.owner 那一侧）：
    //    亡语语境下 `owner` = **那具尸体所在侧**（信标就站在这一侧），而它正是我们要补回去的那一侧。
    //    若误写 summonSide:'opponent'，会算成"对面"⇒ 把新信标召唤到茉莉安自己半场（方向反了）。
    // ==========================================
    'effect_marian_beacon_respawn': {
        id: 'effect_marian_beacon_respawn',
        name: '獠牙重生',
        description: '【亡语】阵亡时，召唤一个「獠牙信标」。',
        class: 'SUMMON',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'Marian_Wolf_Tooth_Beacon',
            summonCount: 1,
            summonOnlyIfAbsent: true, // 落点已有存活信标 / 满员 → 不补（与旧口径一致）
            // ❗ 刻意不写 summonSide（见上方说明）
        }
    },

    // 与重生配套的补刀：让新信标一登场就吃一记「茉莉安等级固定值」的伤害
    //   [2026-10-04 程拍板] 由「等同茉莉安当前攻击力」改为**等级固定值**（Lv1 = 5 / Lv2 = 8）。
    //     病根：肉鸽能把她叠到 20+ 攻击力 ⇒ 补刀一击打死新信标 ⇒ 它的重生亡语又召唤 + 补刀
    //     ⇒ **无限循环爆炸**。
    // ⚠️ 必须在 effects 数组里排在 respawn **之后** ⇒ 打的正是刚召唤出来的那枚
    // ⚠️ 用 damageBeaconSide:'same'（打**同侧**）—— 亡语语境下 owner 是信标所在侧，
    //    'opponent' 会打错边、'both' 会误伤镜像对局里对面的信标。
    // ⚠️ 不能复用 `damageBeaconBySelfPower`：亡语源是**一具尸体**（信标 power = 0）⇒ 会打出 0 点。
    //    故用 `damageBeaconByMarianLevel`（它自己去"找活着的她"、再按等级取固定值）。
    'effect_marian_beacon_respawn_snipe': {
        id: 'effect_marian_beacon_respawn_snipe',
        name: '獠牙追猎',
        description: '【亡语】阵亡时，对「獠牙信标」造成 5 点伤害（Lv2 为 8 点）。',
        class: 'BUFF',
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            damageBeaconByMarianLevel: true,
            damageBeaconSide: 'same',
        }
    },

    // ==========================================
    // [2026-09-17 1.0.16 茉莉安 · Phase 4 阵营法术 ×3]
    // ⚠️ 定性（设计文档 7.0）：这三张是【阵营法术】，不是茉莉安的专属法术。
    //    它们不与茉莉安核心机制闭环，断链是设计常态，按独立卡牌平衡。
    // ==========================================

    // --- 阵营法术一：猎影标记（T17 · 2026-09-26 实装）---
    // 逻辑走 effectProcessor.ts BUFF 分支内的专属实现（按目标是否已【暴露】二选一）
    // [2026-09-26 程定] 慢速 —— 慢速只能在主阶段打出 ⇒ 交战区必为空 ⇒ 强制战斗永远装配得起来
    'effect_marian_faction_mark': {
        id: 'effect_marian_faction_mark',
        name: '猎影标记',
        description: '暴露一个敌人；若其已处于【暴露】，则我方攻击力最高的单位对其发起一次额外攻击。',
        class: 'BUFF',            // 载体类：真正逻辑在 BUFF 分支内按 effect.id 特判
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' },
        ],
        params: {},
    },

    // --- 阵营法术二：以饵引狼（T18）---
    // 逻辑走 effectProcessor.ts BUFF 分支内的专属实现（两个目标吃不同效果）
    // 程 2026-09-17 拍板：两个目标都手动选（我方当饵 + 敌方被削）
    'effect_marian_faction_bait': {
        id: 'effect_marian_faction_bait',
        name: '以饵引狼',
        description: '暴露一个我方单位，以使一个敌人本回合 -4/-0。',
        class: 'BUFF',            // 载体类：真正逻辑在 BUFF 分支内按 effect.id 特判
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            { type: 'ALLY_UNIT',  count: 1, label: '选择一个友方单位' },
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' },
        ],
        params: {},               // 具体数值在专属实现里写死（-4/-0）
    },

    // ==========================================
    // [2026-09-17 1.0.16 茉莉安 · Phase 5「松露」小队]
    // 设计原则：三张后勤全围【獠牙信标】转，推进节奏分别是 持续 / 规模 / 一次性
    // ==========================================

    // --- 蕈影（T21）---
    // ① 入场自动暴露敌方攻击力最高者（逻辑在 BUFF 分支内按 effect.id 特判，无需玩家选目标）
    'effect_truffle_mushroom_expose': {
        id: 'effect_truffle_mushroom_expose',
        name: '夜视侦察',
        description: '入场：暴露敌方攻击力最高的未暴露单位。',
        class: 'BUFF',            // 载体类：自动选最强在 BUFF 分支内特判实现
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {},
    },
    // ② 入场召唤夜视监察无人机
    'effect_truffle_mushroom_summon': {
        id: 'effect_truffle_mushroom_summon',
        name: '无人机调度',
        description: '入场：召唤一个“夜视监察无人机”。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Truffle_Drone_NightVision', summonZone: 'bench' },
    },

    // --- 夜视监察无人机：每次打击水晶 → 顺带炸对面信标 ---
    // 复用 BUFF 的 damageBeaconBy；'opponent' 限定只打对面，避免反噬自家信标
    'effect_truffle_drone_nightvision': {
        id: 'effect_truffle_drone_nightvision',
        name: '夜视监察',
        description: '每次打击敌方水晶时，对“獠牙信标”额外造成 3 点伤害。',
        class: 'BUFF',            // 载体类：靠 damageBeaconBy 参数生效
        timing: 'ON_NEXUS_STRIKE',
        speed: 'BURST',
        targetRequirements: [],
        params: { damageBeaconBy: 3, damageBeaconSide: 'opponent' },
    },

    // --- 榆（T22）---
    // 入场：每有一个【暴露】的敌人召唤一个流萤无人机，上限 5
    // 上限 5 的由来（方案 8.1）：敌方 6 格备战席最多 6 个暴露单位，而我方备战席被榆自己占掉 1 格
    'effect_truffle_elm_summon': {
        id: 'effect_truffle_elm_summon',
        name: '萤火集结',
        description: '入场：每有一个【暴露】的敌人，召唤一个“流萤无人机”（最多 5 个）。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            summonKey: 'Truffle_Drone_Firefly',
            summonZone: 'bench',
            summonCountPerExposedEnemy: 5, // 动态召唤数上限
        },
    },

    // --- 流萤无人机：亡语 → 对獠牙信标造成 = 自身攻击力 的伤害 ---
    // 复用 BUFF 的 damageBeaconBy 通道，用 damageBeaconBySelfPower 把静态数值换成「尸体当时的攻击力」
    'effect_truffle_drone_firefly_death': {
        id: 'effect_truffle_drone_firefly_death',
        name: '萤火自毁',
        description: '【亡语】阵亡时，对“獠牙信标”造成等同于自身攻击力的伤害。',
        class: 'BUFF',            // 载体类：靠 damageBeaconBySelfPower 参数生效
        timing: 'LAST_BREATH',
        speed: 'BURST',
        targetRequirements: [],
        params: { damageBeaconBySelfPower: true, damageBeaconSide: 'opponent' },
    },

    // --- 虹彩（T23）---
    // ① 入场：所有獠牙信标生命上限永久 -10（含尚未登场的）
    //    逻辑在 BUFF 分支内特判；「尚未登场」靠 GameState.beaconMaxHealthMod 在召唤落场时套用
    'effect_truffle_iris_beacon_shrink': {
        id: 'effect_truffle_iris_beacon_shrink',
        name: '信号压制',
        description: '入场：使本牌局所有“獠牙信标”的生命值上限永久 -3。',
        class: 'BUFF',            // 载体类：真正逻辑在 BUFF 分支内按 effect.id 特判
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {},
    },
    // ② 入场召唤园丁灌溉无人机
    'effect_truffle_iris_summon': {
        id: 'effect_truffle_iris_summon',
        name: '无人机调度',
        description: '入场：召唤一个“园丁灌溉无人机”。',
        class: 'SUMMON',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { summonKey: 'Truffle_Drone_Gardener', summonZone: 'bench' },
    },
    // ⚠️ 园丁灌溉无人机【没有】对应的效果条目 ——
    //    它是个被动监听器，逻辑挂在 useGameState 的 UNIT_DIED 处理里
    //    （按 card.key === 'Truffle_Drone_Gardener' 识别），不走效果注册表。

    // --- 阵营法术三：静默行动（T19）---
    // 逻辑走 effectProcessor.ts BUFF 分支内的专属实现（全场全计，通用路径覆盖不了）
    'effect_marian_silent_action': {
        id: 'effect_marian_silent_action',
        name: '静默行动',
        description: '屏蔽所有信号。消除场上所有的【暴露】，每消除一个，我方全体永久 +1/+1。',
        class: 'BUFF',            // 载体类：真正逻辑在 BUFF 分支内按 effect.id 特判
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],   // 全场全计，无需选目标（validateTargets 对 count=0 直接放行）
        params: {},
    },

    // ==========================================
    // [2026-10-23 莉莉子] 三张新法术（程拍板定价：崩坏 7 / 同行 4 / 回收 6）
    // ==========================================

    // --- 泰坦阵营：崩坏 ---
    // 设计口径：把一只泰坦的**当前攻击力**引爆成一次对敌伤害，代价是它自己吃等量伤害。
    //   与「毁灭仪式」（`effect_destruction_ritual`：杀泰坦换 3 伤，且**只能打单位**）是同一族，
    //   但伤害随攻击力浮动、且可打水晶 ⇒ 程拍板走 7 费 + 限【泰坦】单位。
    'effect_titan_collapse': {
        id: 'effect_titan_collapse',
        name: '崩坏',
        description: '对我方一个泰坦单位造成等同于其攻击力的伤害，之后对一个敌方单位或敌方水晶造成等量伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'FAST',
        targetRequirements: [
            // 第 1 步：我方泰坦（raceFilter 是目标校验层的硬闸，见 useSpellSystem.isValidTarget）
            { type: 'ALLY_UNIT', count: 1, label: '选择一个我方泰坦单位', raceFilter: ['titan'] },
            // 第 2 步：敌方单位或敌方水晶（ENEMY_TARGET = 仅敌方侧）
            { type: 'ENEMY_TARGET', count: 1, label: '选择单位或水晶' },
        ],
        params: {
            valueFromAllyPower: true,
        },
        // [2026-10-23 莉莉子 · 独立审查] 只留 summary：`trackTargets` 全仓无消费方（死字段），
        //   实际的目标变化追踪走 useSpellSystem 的 computeChangesFromMap 通用快照 ⇒ 不重复声明意图。
        record: { summary: '引爆单位攻击力造成等量伤害' },
    },

    // --- 分析员阵营：同行 ---
    // 设计口径：从牌库里**随机**捞一张天启者；牌库无天启者时退化为随机捞一张单位卡。
    'effect_analyst_fellowship': {
        id: 'effect_analyst_fellowship',
        name: '同行',
        description: '从牌库中随机抽一张天启者。若牌库中没有天启者，则改为随机抽一张单位卡牌。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 1,                 // 抽 1 张
            drawFilter: 'champion',   // 只认 isChampion
            drawFallbackFilter: 'unit', // 兜底：牌库无天启者 ⇒ 随机抽一张单位
        },
        // [2026-10-23 莉莉子 · 独立审查] 不写 `record`：`useSpellSystem` 只在
        //   `class === 'STRIKE' || class === 'HEAL'` 时读取 `record.summary`
        //   （`useSpellSystem.ts:1198` / `:1969`）⇒ DRAW/DISCARD 写在这是**永不生效的死数据**。
    },

    // --- 后勤阵营：回收 ---
    // 设计口径：弃光手牌 → 抽 4 → 恢复 2 点法力值。
    //   ⚠️ 三件事**必须写在同一个效果里**：DISCARD 分支采用「延迟移除」（卡留在手牌播碎裂动画，
    //      由 onHandAnimComplete 移除）——若拆成三个效果，紧随其后的 DRAW 会把尚未移除的旧手牌
    //      一起算进 10 张上限 ⇒ 抽到的牌当场爆掉。
    'effect_logistics_reclaim': {
        id: 'effect_logistics_reclaim',
        name: '回收',
        description: '弃置所有手牌，之后抽 4 张牌，并恢复 2 点法力值。',
        class: 'DISCARD',        // 载体类：真正逻辑在 DISCARD 分支按 discardAll 特判
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: {
            discardAll: true,
            drawAfterDiscard: 4,
            manaGainAfter: 2,
        },
        // [2026-10-23 莉莉子 · 独立审查] 同「同行」：DISCARD 类不消费 `record`，故不声明。
    },

    // ==========================================
    // [2026-10-23 莉莉子 · 强化「囤积」重做] 衍生法术：囤积（存钱罐）
    //   兑现的是**这张卡自己**攒下的点数（`CardData.hoardStored`），不是固定 params.value
    //   ⇒ 走 GRANT_MANA 的 `fromHoardStored` 分支，仍然封顶于法力上限。
    //   攒点数的钩子在「每打出一张卡」的两个出口（`useGameState.playCard` / `useSpellSystem.commitSpell`）。
    // ==========================================
    'effect_spell_hoard': {
        id: 'effect_spell_hoard',
        name: '囤积',
        description: '获得{hoardStored}点法力值（每打出一张卡牌额外获得一点，受法力上限限制）。',
        class: 'GRANT_MANA',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { fromHoardStored: true },
    },

    // ==========================================
    // [2026-11-13 莉莉子 · 凯茜娅「冻结弹幕」三连]
    // 三张卡：冻结弹幕 → 延续 → 终结。全部**无手选目标**（`targetRequirements: []`
    // ⇒ `useSpellSystem.ts:373` 直接 onComplete(card, [])），随机性一律交给
    // `params.targetFilter`（通用解析入口见 `effectProcessor.ts` 的「targetFilter 通用解析」段）。
    //
    // ⚠️ 为什么一条卡要拆成 2~3 个 effect，而不是塞进一个：
    //    `executeSpellEffect`（`logic/spells.ts:74-93`）按 `cardDef.effects` **数组顺序**逐个
    //    `processEffect`，并把上一步的产出作为下一步的输入（累加器 `acc`）。
    //    「打伤害 + 生成卡」、「冻结 + 强化」都是不同 class（STRIKE / GENERATE / BUFF），
    //    没有任何单一 class 分支能同时干两件事 ⇒ 唯一正解是拆链。
    //    先例：`temp_spell_10`（`cards.ts:1292`，撤回 + 生成）同理。
    //
    // ⚠️ 每个效果**各自**独立随机：卡面「并」的语义要求在**当时最新的战场**上重新掷一次，
    //    所以同一条链上的两段可以命中不同目标（这是设计意图，不是 bug）。
    // ⚠️ [2026-11-14 程拍板] 冻结段只保留在「终结」上；「冻结弹幕」本体已删冻结（改成纯 1 点伤害 + 生成），
    //    费用随之 2 → 1 —— 第一发因此**永不空**（`RANDOM_ENEMY_OR_NEXUS` 永远含敌方水晶）。
    // ==========================================

    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅「倾泻」] BARRAGE 类首个使用者
    // ── 结算口径（`logic/effectProcessor.ts` 的 `case 'BARRAGE'`，逐条对得上）：
    //      发数   = max(1, ceil(攻击力 / 2)) + 观察员加成
    //      每发   = `params.damage`（2）
    //      目标   = 玩家选：Lv1 只能敌方**单位**；Lv2 解锁敌方**水晶**
    //      停止   = 目标死亡即停（`fired` 记实际发数）
    //      扣减   = 打单位：ceil(fired / 2)；打水晶：max(1, ceil(攻击力 / 2))
    //      记账   = 累计伤害进 `bumpKatyaDamage`（升级进度）
    //      演出   = **一次算完、一条合并飘字**（与 CHAIN_STRIKE 逐击状态机相反）
    // ── `targetRequirements` 用 `ENEMY_TARGET`（敌方单位或敌方水晶）而不是 `ENEMY_UNIT`：
    //    倾泻 Lv2 要能指向水晶。Lv1 的水晶闭锁**不靠这里**，靠 `minLevel: 2`
    //    （语义见 `TargetRequirement.minLevel` 的注释；筛选在
    //     `hooks/useSpellSystem.ts` 的 `isValidTarget`，结算层还有一道兜底）。
    // ==========================================
    'effect_katya_barrage': {
        id: 'effect_katya_barrage',
        name: '倾泻',
        description: '对敌方单位倾泻弹药，数量等同于“凯茜娅·狂诗”攻击力一半，每发 2 点伤害。\n结算后，她的攻击力永久减少（约为本次发数的 2/3）。',
        class: 'BARRAGE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            // [2026-11-14 莉莉子 独立审查 · 漏洞8] label 必须同时表达**两种**合法目标：
            //   type 是 `ENEMY_TARGET`（敌方单位 **或** 敌方水晶，水晶由 `minLevel: 2` 门控），
            //   原文案只写「选择一个敌方单位」⇒ 玩家以为 Lv2 也打不了水晶。
            { type: 'ENEMY_TARGET', count: 1, label: '选择一个敌方单位', minLevel: 2 },
        ],
        params: {
            damage: 2,
            lv2UnlockNexus: true,
        },
        // 不声明 `record`：`useSpellSystem` 只在 class 为 STRIKE / HEAL 时读 `record.summary`
        //   ⇒ BARRAGE 写在这里是**永不生效的死数据**（同本文件 `effect_katya_barrage_frost_end_buff` 的结论）。
        //   对局记录由 `unit_damage` / `nexus_damage` 事件那条既有链路负责。
    },

    // --- ① 冻结弹幕 · 原第 1 段（**已停用**）：随机冻结一个敌方单位 ---
    // 冻结范式照抄 `effect_lyfe_support`（本文件 :719-734）：BUFF 类 + ROUND + Frostbite。
    //   `power`/`health` 不配 ⇒ 通用 BUFF 的 `applyStats` 原样返回，
    //   真正生效的是 `effectProcessor` 的「拦截冻结词条」分支（走 `applyFrostbite` 攻击力对冲）。
    // ⚠️ [2026-11-14 莉莉子 · 程拍板] **本效果已从「冻结弹幕」的链上摘除**（卡面改成只打 1 点 + 生成延续）。
    //   定义**保留在此**（不删数据）：语义仍是「随机冻结一个敌方单位」，
    //   与 `effect_katya_barrage_frost_end_freeze`（终结·冻结）逐字同构，
    //   将来若要复用/调回去直接挂回 `cards.ts` 的 effects 数组即可。
    //   当前**无任何卡牌引用** ⇒ 死数据，不参与任何结算。
    'effect_katya_barrage_frost_freeze': {
        id: 'effect_katya_barrage_frost_freeze',
        name: '霜矢标记·冻结',
        description: '随机冻结一个敌方单位（本回合）。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            duration: 'ROUND',
            keywords: ['Frostbite'] as Keyword[],
            targetFilter: 'RANDOM_ENEMY',
        },
    },
    // --- ① 冻结弹幕 · 第 1 段（原第 2 段）：随机敌方单位或敌方水晶 1 点伤害 ---
    'effect_katya_barrage_frost_strike': {
        id: 'effect_katya_barrage_frost_strike',
        name: '霜矢标记·碎冰',
        description: '对一个随机的敌方单位或敌方水晶造成1点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 1,
            targetFilter: 'RANDOM_ENEMY_OR_NEXUS',
        },
        record: { summary: '造成 {value} 点伤害', trackTargets: true },
    },
    // --- ① 冻结弹幕 · 第 2 段（原第 3 段）：生成【瞬逝】的「延续」---
    // 生成范式照抄 `effect_temp_spell_10_generate`（同文件 TEMP 法术区）：GENERATE + isVolatile。
    'effect_katya_barrage_frost_generate': {
        id: 'effect_katya_barrage_frost_generate',
        name: '霜矢标记·延续',
        description: '在手牌生成一张瞬逝的“逆境萌生”。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'katya_barrage_frost_cont', isVolatile: true },
    },

    // --- ② 延续 · 第一段：随机治疗一个受伤的友方单位 2 点（无受伤友军时退到任意友军）---
    // ⚠️ [2026-11-14 莉莉子 · 程拍板] **加兜底**：只挑受伤友军时，全队满血 ⇒ 整段静默空过
    //    ⇒ 玩家拿不到第三张「终结」，整条三连断在第二环。
    //    现开 `fallbackToAny: true`：受伤池空 ⇒ 随机挑一个**任意存活友军**（满血也照常选/照常演出，
    //    治疗量结算为 0）。池子只在「本方场上一个存活单位都没有」时才真空。
    //    仍**不配** `nexusFallback`：卡面没有「改奶水晶」这层语义；若将来同时开，
    //    `fallbackToAny` 优先（见 `effectProcessor.ts` 该分支的优先级注释）。
    'effect_katya_barrage_frost_cont_heal': {
        id: 'effect_katya_barrage_frost_cont_heal',
        name: '延续·疗愈',
        description: '随机治疗一个受伤的友方单位2点；若无受伤友方，则随机治疗一个其他友方单位。',
        class: 'HEAL',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 2,
            targetFilter: 'RANDOM_WOUNDED_ALLY',
            fallbackToAny: true,
        },
        record: { summary: '治疗 {value} 点', trackTargets: true },
    },
    // --- ② 延续 · 第二段：生成【瞬逝】的「终结」---
    'effect_katya_barrage_frost_cont_generate': {
        id: 'effect_katya_barrage_frost_cont_generate',
        name: '延续·终结',
        description: '在手牌生成一张瞬逝的“胜负终局”。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'katya_barrage_frost_end', isVolatile: true },
    },

    // --- ③ 终结 · 第一段：随机冻结一个敌方单位 ---
    'effect_katya_barrage_frost_end_freeze': {
        id: 'effect_katya_barrage_frost_end_freeze',
        name: '终结·冻结',
        description: '随机冻结一个敌方单位（本回合）。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            duration: 'ROUND',
            keywords: ['Frostbite'] as Keyword[],
            targetFilter: 'RANDOM_ENEMY',
        },
    },
    // --- ③ 终结 · 第二段：随机一个友方单位 +0/+3 ---
    // 不写 `duration` ⇒ 走通用 BUFF 的缺省 'PERMANENT'（卡面没有「本回合」，即永久身材）。
    'effect_katya_barrage_frost_end_buff': {
        id: 'effect_katya_barrage_frost_end_buff',
        name: '终结·强化',
        description: '给予一个随机的友方单位 +0/+3。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            power: 0,
            health: 3,
            targetFilter: 'RANDOM_ALLY',
        },
        // 不声明 `record`：`useSpellSystem` 只在 class 为 STRIKE / HEAL 时读 `record.summary`
        //   （`useSpellSystem.ts:1198` / `:1969`）⇒ BUFF 类写在这里是**永不生效的死数据**。
    },

    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4]
    // 四张卡：本体「凯茜娅·狂诗」入场/回合开始补「倾泻」· 梅莉桑德打击减费 ·
    //        滞空碎星（冻结 + 按目标是否受伤生成 0 费暗箭）· 紧急补给（抽法术牌 + 回满法术法力）
    // ── 通用纪律：每个效果都挂在 `effects[0]`（或链条首段），因为
    //    `useSpellSystem.ts:241` 的目标需求判定**只读 `card.effects[0]`**。
    // ==========================================

    // --- ① 本体：入场 & 回合开始 → 生成一张「倾泻」 ---
    // 时机复用 `ON_PLAY_AND_ROUND_START`（同 `effect_marian_beacon_snipe`，本文件上文）：
    //   · 「入场」半边由 `logic/summonEntry.ts` 的 `isEntryTiming` 放行（含本时机 ✅）
    //   · 「回合开始」半边由 `useRoundLifecycle.ts:564` 的 `timing.includes('ROUND_START')` 扫备战席放行
    // ⚠️ 两点**刻意不写**（卡面要求）：
    //   1. **不设 `isVolatile`** ⇒ 生成的「倾泻」不是【瞬逝】
    //   2. **不设 `reduceCostIfDuplicate`** ⇒ 不限囤积，手牌里已有几张照样再生成一张
    // ⚠️ 手牌上限 10：满手时这一张会被 `effectProcessor` 的 GENERATE 分支销毁
    //    （既有行为，本批**不改**；日志 `[Generate] 手牌已满(10/10)，… 被销毁`）。
    'effect_katya_rhapsody_barrage_generate': {
        id: 'effect_katya_rhapsody_barrage_generate',
        name: '狂诗·倾泻',
        description: '入场与回合开始时：在手牌生成一张“倾泻”。',
        class: 'GENERATE',
        timing: 'ON_PLAY_AND_ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: { generateKey: 'katya_barrage' },
        animationDuration: 600,
    },

    // --- ② “映现”梅莉桑德：打击**敌方水晶**后 → 「倾泻」永久 −1 ---
    // [2026-11-14 程拍板 · 口径收窄] 原为 `ON_ATTACK`（不分打单位 / 打水晶），现改为
    //   `ON_NEXUS_STRIKE` —— 本仓**已有**「每次打击水晶」的球探，不需要新埋点：
    //   派发点：`hooks/useGameState.ts:4408-4452` 的「每次打击水晶雷达」，
    //   触发条件 `useGameState.ts:4412` 的 `isPlayerStriking || isEnemyStriking`
    //   （= 攻击者 `currentFight.attacker` 把**对面**水晶打掉血 ⇒ 正是「打击敌方水晶」），
    //   `owner: side` 注入归属（`useGameState.ts:4429`）⇒ 敌方梅莉桑德记的是敌方那本账。
    //   先例：`effect_truffle_drone_nightvision`（本文件 `:2708`，卡面写「每次打击敌方水晶时」）。
    // ⚠️ 因此她**被迫格挡**时不再触发（格挡永远打不到水晶），这正是本次要的收窄。
    // 记账：`utils/katyaProgress.ts` 的 `addKatyaBarrageCostDown(side, 1)`；
    //   下限 0 由查询腿 `utils/gameRules.ts:133` 的 `Math.max(0, condBase - barrageCostDown)` 钳。
    'effect_melisande_barrage_discount': {
        id: 'effect_melisande_barrage_discount',
        name: '映现·折价',
        description: '打击敌方水晶后，“倾泻”的费用永久 −1（最低 0）。',
        class: 'KATYA_BARRAGE_COST_DOWN',
        timing: 'ON_NEXUS_STRIKE',
        speed: 'BURST',
        targetRequirements: [],
        params: { katyaBarrageCostDown: 1 },
    },

    // --- ③ 滞空碎星 · 第一段：冻结一个敌方单位 ---
    // 冻结范式照抄 `effect_lyfe_support` / `effect_katya_barrage_frost_freeze`（本文件 `:2812`）：
    //   BUFF + `duration: 'ROUND'` + `keywords: ['Frostbite']`（不配 power/health ⇒ `applyStats` 原样返回，
    //   真正生效的是「拦截冻结词条」分支 `effectProcessor.ts:2550-2555` 的 `applyFrostbite`）。
    // ⚠️ 这一段**必须**排在链首：目标选择（`ENEMY_UNIT`）只从 `effects[0]` 读，
    //   而第二段的生成张数要用到这里选中的那个 id。
    'effect_katya_starfall_freeze': {
        id: 'effect_katya_starfall_freeze',
        name: '滞空碎星·冻结',
        description: '【冻结】一个敌方单位（本回合）。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            { type: 'ENEMY_UNIT', count: 1, label: '选择一个敌方单位' },
        ],
        params: {
            duration: 'ROUND',
            keywords: ['Frostbite'] as Keyword[],
        },
    },
    // --- ③ 滞空碎星 · 第二段：生成 2 张 0 费「暗箭」（目标已受伤 → 3 张）---
    // 张数**动态**：`generateCountIfWounded` 由 `effectProcessor` 的 GENERATE 分支现算 ——
    //   它拿 `finalTargets[0]`（= 上一段玩家点选的那个单位，`spells.ts:93` 同一份 targets 逐段下传）
    //   查 `damageTaken > 0`，成立就换成 3。**不需要**「条件效果」这种额外层。
    // 目标已离场 ⇒ 回落 `generateCount`（2 张）。
    // `costOverride: 0`：`hidden_arrow` 本体是 1 费（`cards.ts:153`）⇒ 这里改写成 0 费
    //   （同时写 `cost` 与 `costOverride`，见 `utils/gameRules.ts:920`）。
    'effect_katya_starfall_generate': {
        id: 'effect_katya_starfall_generate',
        name: '滞空碎星·暗箭',
        description: '在手牌生成 2 张 0 费“暗箭”（目标已受伤时改为 3 张）。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],   // 目标已在第一段选过；这里不再要求玩家点第二次
        params: {
            generateKey: 'hidden_arrow',
            generateCount: 2,
            generateCountIfWounded: 3,
            costOverride: 0,
        },
        animationDuration: 600,
    },

    // --- ④ 紧急补给 · 第一段：抽至多 3 张**法术**牌 ---
    // `drawFilter: 'spell'` 是本批新开的筛选项（`effectProcessor.ts` 的 `matchesDrawFilter`）。
    // 不配 `drawFallbackFilter` ⇒ 牌库没有法术牌时**一张都不抽**（「至多」的严格语义，不爆牌）。
    // `stopWhenHandFull: true` ⇒ 手牌满就 `break`，**不销毁**抽到的牌（缺省行为是爆牌，本卡关闭它）。
    'effect_katya_supply_draw': {
        id: 'effect_katya_supply_draw',
        name: '稳态奇点·补给',
        description: '抽至多 3 张法术牌（手牌已满时不再抽，也不销毁）。',
        class: 'DRAW',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            value: 3,
            drawFilter: 'spell',
            stopWhenHandFull: true,
        },
    },
    // --- ④ 紧急补给 · 第二段：回满法术法力 ---
    // 走 `SPELL_MANA_GAIN` + `fillToCap`（不是 +N —— 上限会被共鸣涌流/囤积抬到 6~9）。
    // 口径与 `useRoundLifecycle.ts:1059-1061` 的「秘法回响」逐字同源：`= spellManaCapOf(game)`。
    'effect_katya_supply_refill': {
        id: 'effect_katya_supply_refill',
        name: '稳态奇点·回蓝',
        description: '回满法术法力（上限走 spellManaCapOf）。',
        class: 'SPELL_MANA_GAIN',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: { fillToCap: true },
    },

    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 凯茜娅 L4 第三批]
    // 三张卡：誊抄（给手牌法术上【回响】）· 映现·尤拉莉雅（法术⇒屏障 / 受击⇒倾泻+1）·
    //        映现·奥德涅（凯茜娅在手牌时生成 2 张瞬逝低费法术 / 8 张法术提速）
    // ── 通用纪律不变：目标需求只读 `effects[0]`（`useSpellSystem.ts:241` 那条）。
    // ==========================================

    // --- ① 誊抄：选择一张手牌中的法术，赋予其【回响】---
    // ⚠️ 目标需求必须在 `effects[0]`：本卡只挂这一个效果。
    // ── `excludeKeywords: ['Echo']`：卡面「已是【回响】的法术不可选」。
    //    为什么不用 `keywordFilter` —— 语义是"至少拥有其一"，且 `HAND_CARD` 在
    //    `isValidTarget` 里**先 return 了**。详见 `TargetRequirement.excludeKeywords` 的注释。
    // ── 写入的是**手牌实例**（`effectProcessor` 的 `GRANT_HAND_KEYWORD`），
    //    触发判定读的正是实例关键词（`useSpellSystem.ts:1202` 的 `card.keywords.includes('Echo')`）
    //    ⇒ **绝不改 `CARD_DB`**（模块级常量，改了会跨局污染，见 `utils/gameRules.ts:1402` 的警告）。
    'effect_katya_transcribe': {
        id: 'effect_katya_transcribe',
        name: '复调重奏',
        description: '选择一张手牌中的法术牌，赋予其【回响】（已是【回响】的法术不可选）。',
        class: 'GRANT_HAND_KEYWORD',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [
            {
                type: 'HAND_CARD',
                count: 1,
                cardTypeFilter: 'spell',
                label: '选择一张手牌法术',
                excludeKeywords: ['Echo'],
            },
        ],
        // `keywords` 是 EffectParams 里既有的「要追加的词条」（BUFF 类共用），本类复用同一格
        params: { keywords: ['Echo'] },
    },

    // --- ② 映现·尤拉莉雅 ①：我方本回合打出法术 ⇒ 自身获得【屏障】（每回合至多一次）---
    // ⚠️ **没有 effectProcessor 的 case**：派发点在 `hooks/useSpellSystem.ts` 的
    //    `dispatchSpellCastSideEffects` 尾段（唯一的「法术真正结算之后」出口，
    //    覆盖 极速 / 堆栈 / **被反制** 三个分支）。`class` 只作为**识别标记**被那个尾段扫到。
    // 节流：写在卡上 `CardData.barrierGrantedRound`（= 上次发放时的 `game.round`，见 types.ts 注释），
    //    ★ 靠比较自然过期 ⇒ 回合清那套三处接线一个都不需要（漏一处就会永久锁死）。
    // 屏障本身：`keywords += 'Barrier'` + `roundKeywords += 'Barrier'`（回合末由
    //    `useRoundLifecycle.ts:1010-1012` + `:983-988` 连黯淡标记一起收回）——
    //    与 BUFF 类 `duration:'ROUND'` 的记账口径逐字同源（`effectProcessor.ts:2197-2213`）。
    'effect_yulalia_spell_barrier': {
        id: 'effect_yulalia_spell_barrier',
        name: '映现·护幕',
        description: '我方本回合每打出一张法术牌，自身获得【屏障】（每回合至多一次）。',
        class: 'KATYA_SPELL_CAST_BARRIER',
        timing: 'BURST',
        speed: 'BURST',
        targetRequirements: [],
        params: {},
        animationDuration: 400,
    },

    // --- ② 映现·尤拉莉雅 ②：每次受到打击 ⇒「倾泻」发数 +1（无上限）---
    // 时机 = `ON_DAMAGE_SURVIVE`（**受伤并存活**才触发，见 `useGameState.ts:3018` 的 `currentHp > 0`）：
    //   ⚠️ 口径缺口：**致命那一击不计**（人已经死了，`ON_DAMAGE_SURVIVE` 按定义不触发）——待程确认。
    // 派发点：微队列 `UNIT_DAMAGED`（`useGameState.ts:3015`）—— 战斗伤害与效果伤害都会到此；
    //   而 `effectProcessor.ts:6040` 那路「即时检测」**已排除本 class**（否则同一次受击 +2，见该处注释）。
    // 记账：`utils/katyaProgress.ts` 的 `addKatyaBarrageObserverBonus(side, N)`（**发数**账，不是攻击力账）；
    //   读取腿在 `effectProcessor` 的 `case 'BARRAGE'`（`brObserver`），⚠️ 不碰 `buffs.power`。
    'effect_yulalia_barrage_observer': {
        id: 'effect_yulalia_barrage_observer',
        name: '映现·观星',
        description: '每次受到打击，“倾泻”的倾泻次数 +1（无上限）。',
        class: 'KATYA_BARRAGE_OBSERVER',
        timing: 'ON_DAMAGE_SURVIVE',
        speed: 'BURST',
        targetRequirements: [],
        params: { barrageObserverBonus: 1 },
        animationDuration: 400,
    },

    // --- ③ 映现·奥德涅 ①：入场与回合开始 ⇒ 若凯茜娅在手牌，生成 2 张【瞬逝】低费法术 ---
    // 时机复用 `ON_PLAY_AND_ROUND_START`（本体「狂诗·倾泻」同一档，见本文件 `:3179` 附近）：
    //   · 「入场」半边 → `logic/summonEntry.ts` 的 `isEntryTiming` 放行
    //   · 「回合开始」半边 → `useRoundLifecycle.ts:564` 的 `timing.includes('ROUND_START')` 扫备战席
    // 生成内容**不写死 key**：走 GENERATE 新增的「按费用随机挑」模式
    //   （`randomPool: 'spell'` + `randomFromCostAtMost: 3` + `generateCount: 2`）。
    //   ✅ **低费口径 = 费用 ≤ 3**（[2026-11-14 程拍板] 原保守值 2 → 3，口径已确认）。
    // 前置条件「若凯茜娅·狂诗在手牌」→ `requireInHandKey: [KATYA_KEY]`（GENERATE 分支首行判）。
    'effect_odnie_generate_cheap_spells': {
        id: 'effect_odnie_generate_cheap_spells',
        name: '映现·采撷',
        description: '入场与回合开始时：若“凯茜娅·狂诗”在手牌，在手牌生成 2 张【瞬逝】低费法术。',
        class: 'GENERATE',
        timing: 'ON_PLAY_AND_ROUND_START',
        speed: 'BURST',
        targetRequirements: [],
        params: {
            randomPool: 'spell',
            randomFromCostAtMost: 3,
            generateCount: 2,
            isVolatile: true,
            requireInHandKey: [KATYA_KEY],
        },
        animationDuration: 600,
    },

    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 卡 2「溯时双翼」]
    // 卡面 =「给予“凯茜娅·狂诗”【屏障】，并在手牌中生成一张【瞬逝】的“溯时双翼·狂乱”」。
    // ⚠️ 屏障那段**必须**挂在 `cards.ts` 的 `katya_chrono_wing.effects[0]`：
    //    `hooks/useSpellSystem.ts:239-242` 的 `getEffectDef` 只读 `effects[0]` ⇒ 目标需求只认这一段。
    // ==========================================

    // --- ① 蓄势 + 屏障：BUFF + ROUND + power 2 + Barrier（**同一段**） ---
    // ![2026-11-14 程拍板] 「溯时双翼」2 费 → 3 费，并补 **+2/+0**：
    //   整套凯茜娅卡组没有直接加攻的手段，缺一个爆发跳板。
    //   手感：8 攻 → 打溯时双翼 → 10 攻 → 倾泻 `ceil(10/2)` = 5 发 = 10 点，第 3 发即触发狂乱。
    //   · **合并成一段 BUFF**（不另立一条效果链）：`applyStats` 与 `applyKeywords` 在同一目标上
    //     串行落地（`effectProcessor.ts:2643` / `:2653`）⇒ 一次结算既加攻也贴屏障。
    //     范式先例：`effect_golia_buff`（本文件 `:657`，`power: 2 + duration:'ROUND' + keywords:['Overwhelm']`
    //     的现役同构段）。
    //   · `duration: 'ROUND'` ⇒ `power` 落进 **`roundBuffs.power`**（`effectProcessor.ts:2286-2289`），
    //     **绝不碰 `buffs.power`**（那格被“养攻”独占，`stampKatyaCard` 每次覆盖成 S − D，
    //     `utils/katyaProgress.ts:284`）；`stampKatyaCard` 只 patch `buffs / katyaSpellGrowth /
    //     katyaDamage`（`:283-287`）⇒ 本段写的 `roundBuffs` 不会被贴值抹掉。
    //   · 同一 `duration` 也把【屏障】记进 `roundKeywords` 临时账本（`effectProcessor.ts:2298-2302`）
    //     ⇒ 回合末由 `clearRoundBuffsAndBarrier` 一并清算，不会退化成永久词条。
    //   · 目标口径 `ALLY_CHAMPION` + `filterKey`：`hooks/useSpellSystem.ts:656`
    //     `isAlly && card.isChampion && (!filterKey || card.key === filterKey)`。
    'effect_katya_chrono_wing_barrier': {
        id: 'effect_katya_chrono_wing_barrier',
        name: '溯时双翼·蓄势',
        description: '给予“凯茜娅·狂诗”+2/+0 与【屏障】（本回合）。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择友方“凯茜娅·狂诗”', filterKey: KATYA_KEY },
        ],
        params: {
            power: 2,
            health: 0,
            duration: 'ROUND',
            keywords: ['Barrier'],
        },
    },

    // --- ② 在手牌生成【瞬逝】的「溯时双翼·狂乱」 ---
    // 生成范式照抄 `effect_katya_barrage_frost_generate`（本文件 `:2925`）：GENERATE + isVolatile。
    // ⚠️ `isVolatile` 与卡面自带的 `keywords: ['Volatile']`（`katya_chrono_frenzy`）**不冲突**：
    //    `effectProcessor.ts:4665-4666` 是 `Array.from(new Set([...keywords, 'Volatile']))` —— **追加去重**。
    //    2026-10-06 那次修复补的正是这个去重（安卡的卡面 Volatile + 参数 isVolatile 曾叠出两个"瞬逝"图标）。
    //    故两边同时存在只会合并成一份；这里保留 `isVolatile` 是有意的**冗余保险**
    //    （将来若有人摘掉卡面 `Volatile`，瞬逝语义仍从这里兜住）。
    'effect_katya_chrono_wing_frenzy': {
        id: 'effect_katya_chrono_wing_frenzy',
        name: '溯时双翼·狂乱',
        description: '在手牌中生成一张【瞬逝】的“溯时双翼·狂乱”。',
        class: 'GENERATE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { generateKey: 'katya_chrono_frenzy', isVolatile: true },
        animationDuration: 600,
    },
    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 卡 1「溯时双翼·狂乱」]
    // 卡面：「本回合内“凯茜娅·狂诗”每倾泻 3 次，对敌方全体造成 1 点伤害。」
    // ── 口径（程拍板）：**「每倾泻 3 次」= 3 张倾泻卡**，不是 3 发
    //    ⇒ 埋点在「**一次倾泻结算完成**」处（`effectProcessor` 的 `case 'BARRAGE'` 收尾，
    //      switch 之后那段），**不在发循环内**。
    // ── 本条效果**只武装账本**（`utils/katyaFrenzy.ts`），伤害由下面的 AOE 效果在倾泻收尾时补。
    // ── `Volatile` 只决定**手牌瞬逝**，与"持续到回合末"无关（寿命由 `resetFrenzyRound()` 管）。
    // ==========================================
    'effect_katya_chrono_frenzy_arm': {
        id: 'effect_katya_chrono_frenzy_arm',
        name: '狂乱',
        description: '本回合内“凯茜娅·狂诗”每倾泻 3 次，对敌方全体造成 1 点伤害。',
        class: 'ARM_FRENZY',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [], // 不选目标：账本是按**方**的
        params: { every: 3, aoeDamage: 1 },
        animationDuration: 400,
    },

    // ── 狂乱的一跳：**直接复用通用 AOE 原语**（`STRIKE` 的 `value + targetAllEnemies`），逻辑层零新增代码。
    //    先例：`effect_marian_support_aoe`（本文件 :2508「制空覆盖」）。
    //    ⚠️ **必须显式 `enlightenOverwhelm: false`** —— 该原语自带一段"maxMana ≥ 10 ⇒ 全场碾压"的
    //       巨偶一瞥彩蛋（`effectProcessor.ts:965-998`），不关掉会白送一次碾压。
    //    ⚠️ 本条**不是**给玩家打的卡：它是倾泻收尾时由逻辑层代打的（`effectProcessor` 的 BARRAGE 收尾）。
    //       立刻可分辨的证据 = `targetRequirements: []` 且没人把它挂进任何 `cards.ts` 的 effects。
    'effect_katya_frenzy_aoe': {
        id: 'effect_katya_frenzy_aoe',
        name: '狂乱·震波',
        description: '对敌方备战席与战场的所有单位各造成 1 点伤害。',
        class: 'STRIKE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [],
        params: { value: 1, targetAllEnemies: true, enlightenOverwhelm: false },
    },

    // ==========================================
    // [2026-11-14 莉莉子 ✨新功能 · 卡 2「穿云激流」] 两段效果，**顺序即语义**
    //   ① `+4/+0` —— **必须写 `roundBuffs`**（`duration: 'ROUND'`），**绝不碰 `buffs.power`**
    //      · `buffs.power` 被"养攻"独占：`stampKatyaCard` 每次重算都把它覆盖成 `S − D`
    //        （`utils/katyaProgress.ts:34-40`）⇒ 直接改它会在下一次贴值时被**静默抹掉**。
    //      · `roundBuffs` 不参与那次覆盖（`stampKatyaCard` 只 patch buffs / katyaSpellGrowth / katyaDamage）；
    //        战斗与结算读的是 `getPower = power + buffs.power + roundBuffs.power`（`logic/keywords.ts:89-95`）。
    //      · 术语：项目里「**赋予**」= 永久(`buffs`)、「**给予**」= 本回合(`roundBuffs`)
    //        （`logic/rogueBattle.ts:29`）—— 卡面写的正是「给予」。
    //   ② `BARRAGE + pierceLoop` —— 读 `getPower(brKatya)`，**因此 ① 必须先结算完、且要能被读到**；
    //      链路：`logic/spells.ts:96` 把 ① 的 `playerBench` 写回 `acc`，② 从 `acc` 拿上下文
    //      （`spells.ts:77-90`）⇒ ② 读到的是**已含 +4** 的那张卡。详见 `effectProcessor` 的 BARRAGE 注释。
    //      ⚠️ `getPower` 只用于**发数**（这一轮能打多猛）。
    //         **永久代价**走另一条口径：`getKatyaStats(side).power` = 2 + S − D（**不含** `roundBuffs`），
    //         结算完成后 `bumpKatyaDrain(side, ceil(N₀ / 2))` —— 按峰值扣会把账面打成负数、卡直接废掉。
    //   ⚠️ 目标需求只读 `effects[0]`（`hooks/useSpellSystem.ts:239-242`）⇒ 选"哪一只凯茜娅"由 ① 提供。
    // ==========================================
    'effect_katya_pierce_grant': {
        id: 'effect_katya_pierce_grant',
        name: '穿云·蓄势',
        description: '给予“凯茜娅·狂诗”+4/+0（本回合）。',
        class: 'BUFF',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [
            { type: 'ALLY_CHAMPION', count: 1, label: '选择友方“凯茜娅·狂诗”', filterKey: KATYA_KEY },
        ],
        params: {
            power: 4,
            health: 0,
            duration: 'ROUND', // ⇒ 写 roundBuffs（`effectProcessor.ts:2200-2203`），回合末自动清算
        },
    },

    'effect_katya_pierce_barrage': {
        id: 'effect_katya_pierce_barrage',
        name: '穿云·激流',
        description: '按其攻击力一半的次数（向上取整）随机倾泻（每发 2 点）；每击杀一个敌方单位，敌方水晶受到 2 点伤害并获得 +3/+0 继续。结算完成后，她的攻击力永久减少施法前账面攻击力的一半（向上取整）。',
        class: 'BARRAGE',
        timing: 'ON_PLAY',
        speed: 'SLOW',
        targetRequirements: [], // 无目标：逐发随机重掷（`pierceLoop` 内部自选）
        params: {
            damage: 2,          // 每发 2 点（与普通倾泻同口径）
            pierceLoop: true,   // ⇒ 走"消耗（账面）一半 + 击杀续打"分支
            killNexusDamage: 2, // 每击杀 1 个敌方单位 → 敌方水晶 −2
            // [2026-11-14 莉莉子 💡体验优化] +2 → **+3**（程拍板）：写 `roundBuffs`（本回合临时），
            //   续打滚得更顺；因为是临时值，不会永久变强 ⇒ 不产生无限雪球。
            //   发数随之重算：`ceil(3/2)` = 2 发/轮。
            killGrantPower: 3,  // 每击杀 1 个敌方单位 → 给予 +3/+0（写 roundBuffs）继续
        },
        animationDuration: 600,
    },

      // ==========================================
    // [2026-11-15 程拍板 · 穿云激流状态机] **单发结算步**
    // ── 不挂在卡牌 effects 里，由 `useGameState.pierceStep` 驱动器每 120ms 调一次。
    // ── 每次：从当前存活敌人里随机挑一个 → 打 1 发（过坚韧/屏障）→
    //    击杀则水晶 −2、凯茜娅 +3/+0、budget +3 → 回写 `pendingPierce` 计数。
    // ── 好处：**逻辑与视觉同一拍**，不会再有"只看到两发、对面全死了"。
    // ==========================================
    'effect_katya_pierce_step': {
        id: 'effect_katya_pierce_step',
        name: '穿云·逐发',
        description: '（内部）穿云激流的一发结算 —— 由状态机驱动器逐拍调用，不直接挂在卡面上。',
        class: 'PIERCE_STEP',
        timing: 'ON_PLAY',
        speed: 'BURST',
        targetRequirements: [],
        params: {},
        animationDuration: 0,
    },
    // TODO(卡 3 ②「我方打出 8 张法术牌后，倾泻提速：慢速→快速」)：
    //   **本批未实现**。判据本身现成（`utils/gameRules.ts:176` 的 `getSpellCastSnapshot(side).thisRun`，
    //   含所有法术、天然含「倾泻」），但「速度」是**卡牌静态属性** `CardType`（`types.ts:3` 闭合四值），
    //   全项目**没有"有效速度"的抽象**；真正拦人的判定散在三处、且两处是红线文件：
    //     · `hooks/useGameState.ts:1719`（`isPlayable`：战斗中绝不能打慢速）
    //     · `hooks/useGameState.ts:5100-5118`（实打守卫：战斗阶段／慢速限制）
    //     · `components/GameSession.tsx:3099/3120`（点击提示，**本批明确禁止改**）
    //   另加 `components/CardAnimations.tsx:230-234`（手牌高亮）与 `components/SpellCard.tsx:59-61`（速度图标）。
    //   ⇒ 改动面 = 3 个红线/禁改文件 + 2 个显示层，且要新造"有效速度"口径，本批**不做**。
};



// ==========================================
// [新增] 猫汐尔 莲驱 效果存根（逻辑待实现）
// ==========================================



// ==========================================
// [2026-10-26 莉莉子 · 结构改进 · 程拍板]
// 「装备的法术增伤**真的能生效**」的效果 —— **唯一真源**。
//
// ── 为什么需要它：
//    装备池要靠"这张法术吃不吃法术增伤"来过滤（给纯增益/互殴类法术挂「伤害 +N」= 纯空装备，
//    程 2026-10-26 报的「单挑给个 +2 伤害没绷住」就是它）。此前的判据是
//    「`effect.class` 在 5 类伤害白名单里」，而**它与实际实现必然漂移**：
//      · 同一个 class 内部就有吃/不吃两种分支（STRIKE 的 A 分支吃、strikeMode 分支不吃）；
//      · 白名单里整整 3 类**根本不读**增伤（SPREAD_DAMAGE / FLYING_SWORD / 以及 STRIKE 的互殴与献祭子模式）。
//
// ── 登记规则（新增伤害效果时**必须**遵守）：
//    只有 `effectProcessor` 里**真的调用**了对应读取点的效果才能登记：
//      · `SPELL_DAMAGE_ADD_EFFECTS`  → 命中 `getSpellDamageBonus` 的调用点
//        （STRIKE case 内 `:779` 全屏AOE / `:927` 交战区AOE / `:1173` 直接数值打击）
//      · `SPELL_DAMAGE_MULT_EFFECTS` → 命中 `getSpellDamageMultiplier` 的调用点
//        （上述三处 + `:4885` TITAN_PULSE + `:5222` CHAIN_STRIKE）
//    ⚠️ **保守方向**：漏登记 = 该法术拿不到增伤装备（少给，不会产生空装备）；
//       误登记 = 玩家挂上一个没用的装备。故**宁可漏，不可错**。
//
// ── 已知「看着像伤害、其实吃不到」的三族（**不得**登记）：
//    ① STRIKE + `strikeMode`：互殴（`MUTUAL` 单挑）与单向（`ONE_WAY` 芬妮大招）都走
//       `damageToDef = getPower(attacker)` / `damageToAtk = getPower(defender)` —— 伤害是**单位自己的攻击力**；
//    ② STRIKE + `sacrificeValue`（毁灭仪式）：主伤害读 `params.value`，`applyDmg` 不经过增伤点；
//    ③ SPREAD_DAMAGE（信标亡语分摊）/ FLYING_SWORD（造飞剑）：整类不读增伤。
// ==========================================
export const SPELL_DAMAGE_ADD_EFFECTS: ReadonlySet<string> = new Set([
    'effect_pupu_specular_soul_rush',
    'effect_hidden_arrow',
    'effect_destruction',
    'effect_shalo_golem_glimpse_strike',
    'effect_danu_wendy_onplay_ping',
    'effect_silver_arm_smash',
    'effect_deliberate_infiltration',
    'effect_mauxir_lotus_support',
    'effect_argo_musician_round_start',
    'effect_acacia_cross_temporal',
    'effect_acacia_sword_timeline',
    'effect_acacia_chrono_echo_support',
    'effect_temp_spell_01',
    'effect_temp_spell_05',
    'effect_temp_spell_17',
    'effect_temp_spell_19_strike',
    'effect_marian_support_aoe',
]);

export const SPELL_DAMAGE_MULT_EFFECTS: ReadonlySet<string> = new Set([
    ...SPELL_DAMAGE_ADD_EFFECTS,
    'effect_temp_spell_04',   // TITAN_PULSE（`:4885` 只读倍率、不读 +N）
    'effect_marian_ultimate', // CHAIN_STRIKE（`:5222` 只读倍率、不读 +N）
]);



export const getEffectDef = (effectId: string): EffectDefinition | null => {
    return EFFECT_DB[effectId] || null;
};