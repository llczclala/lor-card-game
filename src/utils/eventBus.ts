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
