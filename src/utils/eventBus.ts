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



    // --- 机制/语音类事件 ---
    ROUND_START: 'round_start',
    PLAY_CARD_VOICE: 'play_card_voice',
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
} as const;

// 导出类型，方便 TypeScript 提示
export type GameEventType = typeof GameEvents[keyof typeof GameEvents];

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
