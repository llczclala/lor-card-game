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

// ================= [新增] 全新动作与反馈音效 =================
import dropBench1Sound from '../music/music/进入备战席1.mp3';
import dropBench2Sound from '../music/music/进入备战席2.mp3';
import recallBlockSound from '../music/music/撤回格挡或进攻.mp3';
import enemyPlayUnitSound from '../music/music/敌方打出单位.mp3';
import playerPlayUnitSound from '../music/music/我方打出单位.mp3';
import blockSound from '../music/music/格挡或进攻.mp3';
import cardHoverSound from '../music/music/卡牌悬停.mp3';
import shuffleSound from '../music/music/洗牌.mp3';
import selectUnitSound from '../music/music/选择单位.mp3';
import summonSound from '../music/music/召唤.mp3';
import defeatSound from '../music/music/被击败.mp3';
import pupuUltSound from '../music/music/卜卜 灵鉴/卜卜大招.mp3';
import pupuSkillSound from '../music/music/卜卜 灵鉴/卜卜小技能.mp3';
import pupuSkillUpSound from '../music/music/卜卜 灵鉴/卜卜小技能强化.mp3';
import mauxirSummonSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_summon.mp3';
import mauxirRushAttackSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_attack.mp3';
import mauxirRushHitSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_be_attack.mp3';

// ================= [2026-07-31 安卡希雅·时之重奏] 专属音效 =================
import acaciaRushFocusSound from '../music/music/安卡希雅时之重奏/圆缺有律_切换到集束模型.mp3';
import acaciaRushSpreadSound from '../music/music/安卡希雅时之重奏/圆缺有律_切换到扩散模型.mp3';
import acaciaSwordSound from '../music/music/安卡希雅时之重奏/飞剑.mp3';
import acaciaUltimateSound from '../music/music/安卡希雅时之重奏/朔望之期.mp3';
import acaciaGreatSwordSound from '../music/music/安卡希雅时之重奏/大飞剑.mp3';
import acaciaCrossTemporalSound from '../music/music/安卡希雅时之重奏/越时斩.mp3';
import acaciaSwordTimelineSound from '../music/music/安卡希雅时之重奏/剑痕时空.mp3';
// ==========================================================
export const useSfx = () => {
    // [新增] 全局音效音量 Ref (默认 0.6)
    const globalVolumeRef = useRef(0.6);

    // [新增] 设置音效音量接口
    const setSfxVolume = useCallback((vol: number) => {
        globalVolumeRef.current = Math.max(0, Math.min(1, vol));
    }, []);
    useEffect(() => {
        // [修复] 浏览器自动播放策略解锁：首次用户交互时激活音频上下文
        let unlocked = false;
        const unlockAudio = () => {
            if (unlocked) return;
            unlocked = true;
            try {
                // 创建并立即关闭一个 AudioContext，通知浏览器允许音频播放
                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = ctx.createOscillator();
                osc.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.001); // 1ms 静默脉冲
                ctx.close();
            } catch (_) { /* 不支持 AudioContext 时静默降级 */ }
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('touchstart', unlockAudio, { once: true });

        // 创建 Audio 对象 (预加载)
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

        // ================= [新增] 细化游戏行为音效触发器 =================
        const playDropBench = () => playSound(Math.random() > 0.5 ? dropBench1Sound : dropBench2Sound, 0.7);
        const playRecallBlock = () => playSound(recallBlockSound, 0.7);
        const playEnemyPlayUnit = () => playSound(enemyPlayUnitSound, 0.8);
        const playPlayerPlayUnit = () => playSound(playerPlayUnitSound, 0.8);
        const playBlock = () => playSound(blockSound, 0.8);
        const playCardHover = () => playSound(cardHoverSound, 0.3); // 悬停音效较频繁，音量压低
        const playShuffle = () => playSound(shuffleSound, 0.8);
        const playSelectUnit = () => playSound(selectUnitSound, 0.7);
        const playSummon = () => playSound(summonSound, 0.8);
        const playDefeat = () => playSound(defeatSound, 0.8);
        const playPupuUlt = () => playSound(pupuUltSound, 0.9);
        const playPupuSkill = () => playSound(pupuSkillSound, 0.8);
        const playPupuSkillUp = () => playSound(pupuSkillUpSound, 0.9);
        const playMauxirSummon = () => playSound(mauxirSummonSound, 0.8);
        const playMauxirRushAttack = () => playSound(mauxirRushAttackSound, 0.8);
        const playMauxirRushHit = () => playSound(mauxirRushHitSound, 0.8);
        // ================= [2026-07-31 安卡希雅·时之重奏] 专属音效触发器 =================
        const playAcaciaRushFocus = () => playSound(acaciaRushFocusSound, 0.8);      // 圆缺有律 → 集束
        const playAcaciaRushSpread = () => playSound(acaciaRushSpreadSound, 0.8);    // 圆缺有律 → 扩散
        const playAcaciaUltimate = () => playSound(acaciaUltimateSound, 0.8);        // 朔望之期
        const playAcaciaCrossTemporal = () => playSound(acaciaCrossTemporalSound, 0.8); // 越时斩
        const playAcaciaTimeline = () => playSound(acaciaSwordTimelineSound, 0.8);   // 剑痕时空
        const playAcaciaSword = () => playSound(acaciaSwordSound, 0.8);              // 飞剑
        const playAcaciaGreatSword = () => playSound(acaciaGreatSwordSound, 0.8);    // 大飞剑
        // ==============================================================

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

        // ================= [新增] 新音效事件绑定 =================
        eventBus.on(GameEvents.SFX_DROP_BENCH, playDropBench);
        eventBus.on(GameEvents.SFX_RECALL_BLOCK, playRecallBlock);
        eventBus.on(GameEvents.SFX_ENEMY_PLAY_UNIT, playEnemyPlayUnit);
        eventBus.on(GameEvents.SFX_PLAYER_PLAY_UNIT, playPlayerPlayUnit);
        eventBus.on(GameEvents.SFX_BLOCK, playBlock);
        eventBus.on(GameEvents.SFX_CARD_HOVER, playCardHover);
        eventBus.on(GameEvents.SFX_SHUFFLE, playShuffle);
        eventBus.on(GameEvents.SFX_MAUXIR_SUMMON, playMauxirSummon);
        eventBus.on(GameEvents.SFX_MAUXIR_RUSH_ATTACK, playMauxirRushAttack);
        eventBus.on(GameEvents.SFX_MAUXIR_RUSH_HIT, playMauxirRushHit);
        eventBus.on(GameEvents.SFX_ACACIA_RUSH_FOCUS, playAcaciaRushFocus);
        eventBus.on(GameEvents.SFX_ACACIA_RUSH_SPREAD, playAcaciaRushSpread);
        eventBus.on(GameEvents.SFX_ACACIA_ULTIMATE, playAcaciaUltimate);
        eventBus.on(GameEvents.SFX_ACACIA_CROSS_TEMPORAL, playAcaciaCrossTemporal);
        eventBus.on(GameEvents.SFX_ACACIA_TIMELINE, playAcaciaTimeline);
        eventBus.on(GameEvents.SFX_ACACIA_SWORD, playAcaciaSword);
        eventBus.on(GameEvents.SFX_ACACIA_GREAT_SWORD, playAcaciaGreatSword);
        eventBus.on(GameEvents.SFX_SELECT_UNIT, playSelectUnit);
        eventBus.on(GameEvents.SFX_SUMMON, playSummon);
        eventBus.on(GameEvents.UNIT_DIE, playDefeat);
        eventBus.on(GameEvents.SFX_PUPU_ULTIMATE, playPupuUlt);
        eventBus.on(GameEvents.SFX_PUPU_SKILL1, playPupuSkill);
        eventBus.on(GameEvents.SFX_PUPU_SKILL1_UPGRADED, playPupuSkillUp);
        // =========================================================

        // --- 清理函数 ---
        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
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
            eventBus.off(GameEvents.SFX_DROP_BENCH, playDropBench);
            eventBus.off(GameEvents.SFX_RECALL_BLOCK, playRecallBlock);
            eventBus.off(GameEvents.SFX_ENEMY_PLAY_UNIT, playEnemyPlayUnit);
            eventBus.off(GameEvents.SFX_PLAYER_PLAY_UNIT, playPlayerPlayUnit);
            eventBus.off(GameEvents.SFX_MAUXIR_SUMMON, playMauxirSummon);
            eventBus.off(GameEvents.SFX_MAUXIR_RUSH_ATTACK, playMauxirRushAttack);
            eventBus.off(GameEvents.SFX_MAUXIR_RUSH_HIT, playMauxirRushHit);
            eventBus.off(GameEvents.SFX_ACACIA_RUSH_FOCUS, playAcaciaRushFocus);
            eventBus.off(GameEvents.SFX_ACACIA_RUSH_SPREAD, playAcaciaRushSpread);
            eventBus.off(GameEvents.SFX_ACACIA_ULTIMATE, playAcaciaUltimate);
            eventBus.off(GameEvents.SFX_ACACIA_CROSS_TEMPORAL, playAcaciaCrossTemporal);
            eventBus.off(GameEvents.SFX_ACACIA_TIMELINE, playAcaciaTimeline);
            eventBus.off(GameEvents.SFX_ACACIA_SWORD, playAcaciaSword);
            eventBus.off(GameEvents.SFX_ACACIA_GREAT_SWORD, playAcaciaGreatSword);
            eventBus.off(GameEvents.SFX_BLOCK, playBlock);
            eventBus.off(GameEvents.SFX_CARD_HOVER, playCardHover);
            eventBus.off(GameEvents.SFX_SHUFFLE, playShuffle);
            eventBus.off(GameEvents.SFX_SELECT_UNIT, playSelectUnit);
            eventBus.off(GameEvents.SFX_SUMMON, playSummon);
            eventBus.off(GameEvents.UNIT_DIE, playDefeat);
            eventBus.off(GameEvents.SFX_PUPU_ULTIMATE, playPupuUlt);
            eventBus.off(GameEvents.SFX_PUPU_SKILL1, playPupuSkill);
            eventBus.off(GameEvents.SFX_PUPU_SKILL1_UPGRADED, playPupuSkillUp);
        };
    }, []);

    return {
        setSfxVolume
    };
};