import { useEffect,useRef,useCallback } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';

// 直接引入音效文件
import clickSound from '../music/music/click.mp3';
import recallSound from '../music/music/recall.mp3';
import strikeSound from '../music/music/strike.mp3';
import startBattleSound from '../music/music/battle_start.mp3';
import nexusStrikeSound from '../music/music/nexus_strike.mp3';
import quickStrikeSound from '../music/music/quick_strike.mp3';
import quickCounterSound from '../music/music/quick_counter.mp3';
import gachaRareSound from '../music/music/出金.mp3';
import gachaCommonSound from '../music/music/普通出货.mp3';
import gachaSingleSound from '../music/music/单抽.mp3';
import gachaTenSound from '../music/music/十连抽.mp3';
import gachaConvertSound from '../music/music/转化通用银.mp3';


export const useSfx = () => {
    // [新增] 全局音效音量 Ref (默认 0.6)
    const globalVolumeRef = useRef(0.6);

    // [新增] 设置音效音量接口
    const setSfxVolume = useCallback((vol: number) => {
        globalVolumeRef.current = Math.max(0, Math.min(1, vol));
    }, []);
    useEffect(() => {
        // 创建 Audio 对象 (预加载)
        // 使用 volume = 0.6 避免音效太吵，掩盖 BGM
        const playSound = (src: string, baseVolume: number = 1.0) => {
            const audio = new Audio(src);
            // [修改] 应用全局音量倍率
            audio.volume = baseVolume * globalVolumeRef.current;
            audio.play().catch(e => console.warn("SFX play failed", e));
        };

        // 2. 封装各类音效触发器
        const playClick = () => playSound(clickSound, 0.6);
        const playRecall = () => playSound(recallSound, 0.6);
        const playBattleStart = () => playSound(startBattleSound, 0.8);

        const playGachaRare = () => playSound(gachaRareSound, 0.8);
        const playGachaCommon = () => playSound(gachaCommonSound, 0.6);
        const playGachaSingle = () => playSound(gachaSingleSound, 0.7);
        const playGachaTen = () => playSound(gachaTenSound, 0.7);
        const playGachaConvert = () => playSound(gachaConvertSound, 0.6);

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

        eventBus.on(GameEvents.GACHA_REVEAL_RARE, playGachaRare);
        eventBus.on(GameEvents.GACHA_REVEAL_COMMON, playGachaCommon);
        eventBus.on(GameEvents.GACHA_START_SINGLE, playGachaSingle);
        eventBus.on(GameEvents.GACHA_START_TEN, playGachaTen);
        eventBus.on(GameEvents.GACHA_CONVERT, playGachaConvert);

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
            eventBus.off(GameEvents.GACHA_REVEAL_RARE, playGachaRare);
            eventBus.off(GameEvents.GACHA_REVEAL_COMMON, playGachaCommon);
            eventBus.off(GameEvents.GACHA_START_SINGLE, playGachaSingle);
            eventBus.off(GameEvents.GACHA_START_TEN, playGachaTen);
            eventBus.off(GameEvents.GACHA_CONVERT, playGachaConvert);
        };
    }, []);
    return {
        setSfxVolume // [导出]
    };
};