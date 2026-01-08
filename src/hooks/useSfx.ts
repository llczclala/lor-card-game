import { useEffect } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';

// 直接引入音效文件
// 确保文件名完全匹配，包括中文
import clickSound from '../music/music/click.mp3';
import recallSound from '../music/music/recall.mp3';
import strikeSound from '../music/music/strike.mp3';
import startBattleSound from '../music/music/battle_start.mp3';
import nexusStrikeSound from '../music/music/nexus_strike.mp3';
import quickStrikeSound from '../music/music/quick_strike.mp3';
import quickCounterSound from '../music/music/quick_counter.mp3';

export const useSfx = () => {
    useEffect(() => {
        // 创建 Audio 对象 (预加载)
        // 使用 volume = 0.6 避免音效太吵，掩盖 BGM
        const playSound = (src: string, volume: number = 0.6) => {
            const audio = new Audio(src);
            audio.volume = volume;
            audio.play().catch(e => console.warn("SFX play failed", e));
        };

        // 2. 封装各类音效触发器
        const playClick = () => playSound(clickSound, 0.6);
        const playRecall = () => playSound(recallSound, 0.6);
        const playBattleStart = () => playSound(startBattleSound, 0.8);

        // [新增] 战斗音效触发器
        const playStrike = () => playSound(strikeSound, 0.8);        // 普通撞击响亮一点
        const playNexus = () => playSound(nexusStrikeSound, 0.9);    // 水晶打击更响亮
        const playQuickAtk = () => playSound(quickStrikeSound, 0.8); // 快攻锐利
        const playQuickDef = () => playSound(quickCounterSound, 0.8);// 反击沉闷

        // --- 注册事件监听 ---

        // 1. 所有绑定到“点击音效”的事件
        eventBus.on(GameEvents.GAME_START, playClick);
        eventBus.on(GameEvents.UI_CLICK, playClick);
        eventBus.on(GameEvents.DECK_ADD_CARD, playClick);
        eventBus.on(GameEvents.PLAY_CARD, playClick);
        eventBus.on(GameEvents.ATTACK_DECLARE, playClick);
        eventBus.on(GameEvents.BLOCK_DECLARE, playClick);

        // 2. 所有绑定到“撤回音效”的事件
        eventBus.on(GameEvents.RECALL_UNIT, playRecall);
        eventBus.on(GameEvents.CANCEL_SPELL, playRecall);
        eventBus.on(GameEvents.UI_BACK, playRecall);

        // [新增] 绑定战斗音效事件
        eventBus.on(GameEvents.LOBBY_START_BATTLE, playBattleStart);
        eventBus.on(GameEvents.SFX_STRIKE_NORMAL, playStrike);
        eventBus.on(GameEvents.SFX_STRIKE_NEXUS, playNexus);
        eventBus.on(GameEvents.SFX_QUICK_ATTACK, playQuickAtk);
        eventBus.on(GameEvents.SFX_QUICK_BLOCK, playQuickDef);

        // --- 清理函数 ---
        return () => {
            eventBus.off(GameEvents.GAME_START, playClick);
            eventBus.off(GameEvents.UI_CLICK, playClick);
            eventBus.off(GameEvents.UI_BACK, playRecall);
            eventBus.off(GameEvents.LOBBY_START_BATTLE, playBattleStart);
            eventBus.off(GameEvents.DECK_ADD_CARD, playClick);
            eventBus.off(GameEvents.PLAY_CARD, playClick);
            eventBus.off(GameEvents.ATTACK_DECLARE, playClick);
            eventBus.off(GameEvents.BLOCK_DECLARE, playClick);
            eventBus.off(GameEvents.RECALL_UNIT, playRecall);
            eventBus.off(GameEvents.CANCEL_SPELL, playRecall);
        };
    }, []);
};