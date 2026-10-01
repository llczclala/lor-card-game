// 定义所有游戏事件名称 (作为常量，防止拼写错误)
export const GameEvents = {
    // --- 交互类事件 (触发点击音效) ---
    GAME_START: 'game_start',       // 点击开始游戏
    DECK_ADD_CARD: 'deck_add_card', // 备战：加入卡牌
    PLAY_CARD: 'play_card',         // 战斗：打出卡牌 (点击音效)
    ATTACK_DECLARE: 'attack_declare', // 战斗：点击进攻按钮
    BLOCK_DECLARE: 'block_declare',   // 战斗：点击格挡按钮
    LOBBY_START_BATTLE: 'lobby_start_battle', // 播放"开始战斗.mp3"
    UI_BACK: 'ui_back',                       // 播放"撤回.mp3"
    UI_CLICK: 'ui_click',           // 通用UI点击 (如模式选择)

    // --- 撤回类事件 (触发撤回音效) ---
    RECALL_UNIT: 'recall_unit',     // 撤回攻击/阻挡单位
    CANCEL_SPELL: 'cancel_spell',   // 撤回法术/取消抉择

    // ================= [新增] 细化互动音效事件 =================
    SFX_DROP_BENCH: 'SFX_DROP_BENCH',             // 砸入备战席
    SFX_RECALL_BLOCK: 'SFX_RECALL_BLOCK',         // 撤回格挡/进攻
    SFX_ENEMY_PLAY_UNIT: 'SFX_ENEMY_PLAY_UNIT',   // 敌方打出单位
    SFX_PLAYER_PLAY_UNIT: 'SFX_PLAYER_PLAY_UNIT', // 我方打出单位
    SFX_BLOCK: 'SFX_BLOCK',                       // 挺进交战区格挡
    SFX_SELECT_BLOCKER_UNIT: 'SFX_SELECT_BLOCKER_UNIT', // 选中格挡单位（引导步推进用）
    SFX_CONFIRM_BLOCK: 'SFX_CONFIRM_BLOCK',       // 确认格挡方案（子任务完成用）
    // [2026-08-20 莉莉子] 格挡被拒事件（隐秘/凶恶）：触发吓退动画 + 中央播报 + 关键词闪光
    // Payload: { blocker: CardData, fightIndex: number, reason: 'elusive' | 'fearsome', attackerId: string }
    BLOCK_REJECTED: 'block_rejected',
    SFX_CARD_HOVER: 'SFX_CARD_HOVER',             // 卡牌悬停
    SFX_SHUFFLE: 'SFX_SHUFFLE',                   // 洗牌
    SFX_SELECT_UNIT: 'SFX_SELECT_UNIT',           // 选定目标
    SFX_SUMMON: 'SFX_SUMMON',                     // 衍生召唤

    // [新增] 专属英雄与结算音效
    SFX_DEFEAT: 'SFX_DEFEAT',                               // 被击败
    SFX_PUPU_ULTIMATE: 'SFX_PUPU_ULTIMATE',                 // 卜卜大招
    SFX_PUPU_SKILL1: 'SFX_PUPU_SKILL1',                     // 卜卜小技能
    SFX_PUPU_SKILL1_UPGRADED: 'SFX_PUPU_SKILL1_UPGRADED',   // 卜卜小技能强化
    // ==========================================================

    // --- 机制/语音类事件 ---
    ROUND_START: 'round_start',
    PLAY_CARD_VOICE: 'play_card_voice',

    // [修改] 丰富水晶受击广播，明确要求携带伤害来源等详细 payload
    // Payload: { target: 'player' | 'enemy', amount: number, source?: CardData }
    NEXUS_STRIKED: 'nexus_striked',
    // [2026-06-27 巴德尔试剂] 水晶回血飘字广播
    NEXUS_HEALED: 'nexus_healed',

    // [新增] 法术打出广播，用于未来支持“打出X张法术后升级”等全局被动
    // Payload: { card: CardData, owner: 'player' | 'enemy' }
    SPELL_PLAYED: 'spell_played',

    // [新增] 战斗打击音效事件
    SFX_STRIKE_NORMAL: 'sfx_strike_normal',       // 普通卡牌互撞
    SFX_STRIKE_NEXUS: 'sfx_strike_nexus',         // 打击水晶
    SFX_QUICK_ATTACK: 'sfx_quick_attack',         // 快攻打击
    SFX_QUICK_BLOCK: 'sfx_quick_block',           // 格挡者反击快攻

    // [新增] 设置类事件 (解决 TS 报错的核心)
    SET_VOICE_VOLUME: 'set_voice_volume',

    // ==========================================================
    // [2026-09-19 1.0.16] 法术交互音效事件（程 2026-09-19 定口径）
    //   · SFX_SPELL_PLAY    打出法术：点击打出 / 拖出松手
    //   · SFX_SPELL_CONFIRM 确定打出：极速法术紧随打出；快速/慢速在「确定」时
    //   · SFX_SPELL_DRAG    拖出法术：手牌里拖起一张法术卡
    //   · SFX_BUFF_APPLY    BUFF 金光：只要金光亮起就响（由 sfx_buff 事件转译，见 useSfx 注释）
    // ==========================================================
    SFX_SPELL_PLAY: 'SFX_SPELL_PLAY',
    SFX_SPELL_CONFIRM: 'SFX_SPELL_CONFIRM',
    SFX_SPELL_DRAG: 'SFX_SPELL_DRAG',
    SFX_BUFF_APPLY: 'SFX_BUFF_APPLY',
    // [2026-09-19] 施法选目标专用事件 —— 与通用「选单位」分开，各响各的音效
    //   · SFX_SELECT_UNIT（通用选单位/选阻挡者…）→ 选择单位.ogg
    //   · SFX_SPELL_TARGET（施法时点选目标）      → 法术选择目标.ogg
    SFX_SPELL_TARGET: 'SFX_SPELL_TARGET',
    // [2026-09-19] 换牌阶段【开局发牌】：换牌 UI 一出现、发出那 4 张待换卡牌时
    //   注意与「换牌结束后的补抽 4 张」区分 —— 后者是普通抽卡
    SFX_MULLIGAN_DEAL: 'SFX_MULLIGAN_DEAL',

    // [2026-09-19 1.0.16 茉莉安] 大招「最终指令」逐击广播（一次一击，演出与结算同源）
    // Payload: { casterSide, step, amount, victimId?, victimKey?, killed?, nexus? }
    CHAIN_STRIKE_STEP: 'chain_strike_step',

    // [2026-09-19 1.0.16 茉莉安] 獠牙信标引爆 VFX 广播
    // Payload: { beaconId?: string, targets: { id: string, amount: number }[] }
    //   beaconId = 信标本体（定位「浮现图」的位置）；targets = 每束激光的落点与该束伤害
    BEACON_EXPLODE: 'beacon_explode',

    // [2026-09-19 莉莉子] 局内暂停广播（ESC）
    // ── 用途：让【不在 GameSession DOM 里】的播放器也能被叫停（BGM 是 App 侧 new Audio()，
    //    拿不到也不该拿 GameSession 的局部 state；视频/动画走 DOM 就地冻结，不依赖本事件）
    // ── 约束：只在 GameSession 真正进出暂停时发一次；必须与 GAME_RESUME 成对
    GAME_PAUSE: 'game_pause',
    GAME_RESUME: 'game_resume',

    UNIT_DIE: 'unit_die',
    UNIT_KILL: 'unit_kill',
    HERO_LEVEL_UP: 'hero_level_up',
    SPELL_CHOICE: 'spell_choice',
    GAME_VICTORY: 'game_victory',
    ENEMY_SPAWN: 'enemy_spawn',
    HERO_FIRST_ACTION: 'hero_first_action',         // 敌人登场 (用于触发互动语音)

    GACHA_START_SINGLE: 'gacha_start_single',
    GACHA_START_TEN: 'gacha_start_ten',
    GACHA_REVEAL_RARE: 'gacha_reveal_rare',
    GACHA_REVEAL_COMMON: 'gacha_reveal_common',
    GACHA_CONVERT: 'gacha_convert',

    // [新增] 回合结束特效完成信号 — 用于协调回合跳转等待动画播完
    ROUND_END_EFFECT_COMPLETE: 'round_end_effect_complete',
    SFX_MAUXIR_SUMMON: 'sfx_mauxir_summon',
    SFX_MAUXIR_RUSH_ATTACK: 'sfx_mauxir_rush_attack',
    SFX_MAUXIR_RUSH_HIT: 'sfx_mauxir_rush_hit',

    // [安卡希雅·时之重奏] 专属音效事件 (2026-07-31)
    SFX_ACACIA_RUSH_FOCUS: 'sfx_acacia_rush_focus',        // 圆缺有律 → 切换到集束模型
    SFX_ACACIA_RUSH_SPREAD: 'sfx_acacia_rush_spread',      // 圆缺有律 → 切换到扩散模型
    SFX_ACACIA_ULTIMATE: 'sfx_acacia_ultimate',            // 朔望之期
    SFX_ACACIA_CROSS_TEMPORAL: 'sfx_acacia_cross_temporal',// 越时斩
    SFX_ACACIA_TIMELINE: 'sfx_acacia_timeline',            // 剑痕时空
    SFX_ACACIA_SWORD: 'sfx_acacia_sword',                  // 飞剑召唤
    SFX_ACACIA_GREAT_SWORD: 'sfx_acacia_great_sword',      // 大飞剑召唤

    // [教程] 交互模式控制：限制玩家只能使用指定操作
    TUTORIAL_SET_INTERACTION_MODE: 'tutorial_set_interaction_mode',

    // [教程] 锁死跳过按钮 / 解锁按钮
    TUTORIAL_LOCK_SKIP: 'tutorial_lock_skip',
    TUTORIAL_UNLOCK_SKIP: 'tutorial_unlock_skip',

    // [教程] 锁死主操作按钮（格挡/确认等）/ 解锁按钮
    TUTORIAL_LOCK_ACTION: 'tutorial_lock_action',
    TUTORIAL_UNLOCK_ACTION: 'tutorial_unlock_action',

    // [教程] 暂停 / 恢复天启者升级
    TUTORIAL_PAUSE_UPGRADE: 'tutorial_pause_upgrade',
    TUTORIAL_RESUME_UPGRADE: 'tutorial_resume_upgrade',

    // [教程] 天启者升级动画彻底播完（用于替代固定等待时间）
    TUTORIAL_LEVEL_UP_COMPLETE: 'tutorial_level_up_complete',

    // [2026-08-26 莉莉子] 法术目标全部选完、进入结算（教程判定"玩家已完成施法操作"用）
    TUTORIAL_SPELL_TARGETS_SELECTED: 'tutorial_spell_targets_selected',

    // [2026-08-26 莉莉子] 武装悬停大卡预览：跨组件广播（各武装图标 onMouseEnter/Leave 触发）
    ARMAMENT_GAZE_SHOW: 'armament_gaze_show',
    ARMAMENT_GAZE_HIDE: 'armament_gaze_hide',

    // [2026-09-10 莉莉子] 关键词悬停大卡预览：跨组件广播（KeywordTray 各关键词图标 onMouseEnter/Leave 触发）
    //   取代原先的原生 title（浏览器小白框）——卡体内有 overflow-hidden + 缩放坐标系，必须 portal 出去渲染
    KEYWORD_GAZE_SHOW: 'keyword_gaze_show',
    KEYWORD_GAZE_HIDE: 'keyword_gaze_hide',

    // [教程] 强制悬停卡牌预览 / 清除
    TUTORIAL_FORCE_CARD_PREVIEW: 'tutorial_force_card_preview',
    TUTORIAL_CLEAR_CARD_PREVIEW: 'tutorial_clear_card_preview',

    // [Volatile] 手牌瞬逝弃置事件 — 回合结束时 Volatile 卡牌从手牌弃置
    HAND_VOLATILE_DISCARD: 'hand_volatile_discard',
    // [2026-08-04 莉莉子] 手牌离场动画完成广播 — 供回合引擎等待瞬逝动画播完再开新回合
    HAND_DISCARD_ANIM_DONE: 'hand_discard_anim_done',

    // ════════════════════════════════════════════════════════
    //  🎴 抽卡动画事件链 — 事件驱动替代时间锁
    // ════════════════════════════════════════════════════════

    // [抽卡] Phase 1: 逻辑层通知动画层"开始抽卡"
    // Payload: { animId: string, card: CardData, owner: 'player' | 'enemy' }
    DRAW_START: 'draw_start',

    // [抽卡] Phase 1 完成: 动画层通知逻辑层"卡牌已到画面中央，翻面完成"
    // Payload: { animId: string, card: CardData, owner: 'player' | 'enemy' }
    DRAW_AT_CENTER: 'draw_at_center',

    // [抽卡] Phase 2: 逻辑层通知动画层"手牌未满，飞入"
    // Payload: { animId: string }
    DRAW_FLY_TO_HAND: 'draw_fly_to_hand',

    // [抽卡] Phase 2: 逻辑层通知动画层"手牌已满，爆牌碎裂"
    // Payload: { animId: string }
    DRAW_CENTER_SHATTER: 'draw_center_shatter',

    // [抽卡] Phase 3 完成: 动画层通知逻辑层"动画播完"
    // Payload: { animId: string, card: CardData, owner: 'player' | 'enemy', isBurn: boolean }
    DRAW_COMPLETE: 'draw_complete',
    // [2026-08-06 莉莉子] 抽卡爆牌销毁（爆牌不走死亡流程，不计墓地/阵亡）
    DRAW_BURN: 'draw_burn',

    // [2026-09-13 莉莉子] 牌库生成动画：卡牌从画面中央翻背飞回牌库（抽卡动画的倒放）
    // 单向事件（逻辑层 → 动画层），无需握手回调——牌已洗入牌库，动画纯表现
    // Payload: { animId: string, card: CardData, owner: 'player' | 'enemy' }
    CARD_TO_DECK: 'card_to_deck',

    // [2026-08-11 莉莉子] 迷宫强化战斗内触发 → 水晶处卡面淡入淡出闪烁
    // Payload: { icon: string, name: string }
    ROGUE_BUFF_FLASH: 'rogue_buff_flash',

    // [2026-09-25 莉莉子 三线任务化框架 · 武装线] 整局任务事件的战斗内广播
    // ── 用途：战斗里发生的事（天启者打击等）需要被 **run 层** 记账（整局任务跨战斗累积），
    //    但 useGameState 拿不到 useRoguelikeRun 的 state → 走事件总线单向广播。
    // ── 订阅方：useRoguelikeRun（推进 run.questProgress）
    // Payload: { event: QuestEvent }
    ROGUE_QUEST_EVENT: 'rogue_quest_event',

    // [2026-09-25 莉莉子 武装线] 我方天启者阵亡广播（凯旋之匣：结算时判断"本场英雄是否活到最后"）
    // Payload: { key: string }
    ROGUE_HERO_DIED: 'rogue_hero_died',

    // [2026-09-25 莉莉子 强化线] 战斗内发放 run 层金币（悬赏等）
    // ── 金币是整局资源、存在 run 里，战斗侧只能广播（同 ROGUE_QUEST_EVENT 的思路）
    // Payload: { amount: number, reason?: string }
    ROGUE_GOLD_GRANT: 'rogue_gold_grant',
    // [2026-09-25 莉莉子 三线任务化框架 · 进度可见性] 任务进度广播 → UI
    // ── 设计文档第一章引用过炉石任务牌的坑 #1「进度必须公开可见」：
    //    没有进度显示，"任务引导玩家"就无从谈起。广播方：useGameState（单场）/ useRoguelikeRun（整局）
    // Payload: { scope: 'battle' | 'run', rows: { key, name, sub?, current, threshold, done }[] }
    ROGUE_QUEST_UI: 'rogue_quest_ui',
    // [2026-09-29 程拍板 · 神格碎片] 发放万能碎片（任务奖励等）
    // ── 依赖方向：货币真源在 useHeroDivinity，而任务奖励在 useUserSystem 发放；
    //    两者互相 import 会成环，故用广播解耦（同 ROGUE_GOLD_GRANT 的思路）。
    // Payload: { amount: number, reason?: string }
    DIVINITY_UNIVERSAL_SHARD_GRANT: 'divinity_universal_shard_grant',
} as const;

// ================= [新增] 弹道编排器专属事件 =================
export const StrikeEvents = {
    COMMAND: 'STRIKE_COMMAND',   // 下达打击命令 (携带所有弹丸信息)
    HIT: 'STRIKE_HIT',           // 单发命中 (向主逻辑索要扣血和派发无人机)
    COMPLETE: 'STRIKE_COMPLETE', // 队列清空且特效播完 (解除战管锁定)
} as const;
// ==========================================================

// 导出类型，方便 TypeScript 提示
// [修正] 合并 StrikeEvents 类型，并补充 string 兜底，防止直接使用字面量(如 'unit_damage')时 TS 报错
export type GameEventType = typeof GameEvents[keyof typeof GameEvents] | typeof StrikeEvents[keyof typeof StrikeEvents] | string;

// 定义事件回调函数类型
type EventCallback = (payload?: any) => void;

/**
 * 事件总线 (Singleton)
 * 负责在整个应用中分发和监听事件
 */
class EventBus {
    private listeners: { [key: string]: EventCallback[] } = {};

    /**
     * 订阅事件
     * @param event 事件名 (从 GameEvents 中选取)
     * @param callback 回调函数
     */
    on(event: GameEventType, callback: EventCallback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * 取消订阅
     */
    off(event: GameEventType, callback: EventCallback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * 触发事件
     * @param event 事件名
     * @param payload 附带的数据 (例如：是哪个单位攻击了)
     */
    emit(event: GameEventType, payload?: any) {
        // console.log(`[EventBus] Emitting: ${event}`, payload); // 调试用
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(payload));
    }
}

// 导出单例对象
export const eventBus = new EventBus();
