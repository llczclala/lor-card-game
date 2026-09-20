import { useEffect,useRef,useCallback } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';

// 直接引入音效文件
import clickSound from '../music/music/click.ogg';
import recallSound from '../music/music/recall.ogg'; // [2026-09-19] 通用撤回（撤回单位 / UI 返回）
import selectUnitSound from '../music/music/选择单位.ogg'; // [2026-09-19] 通用选单位（非施法场合）
import strikeSound from '../music/music/strike.ogg';
import startBattleSound from '../music/music/battle_start.ogg';
import nexusStrikeSound from '../music/music/nexus_strike.ogg';
import quickStrikeSound from '../music/music/quick_strike.ogg';
import quickCounterSound from '../music/music/quick_counter.ogg';
import gachaRareSound from '../music/music/出金.ogg';
import gachaCommonSound from '../music/music/普通出货.ogg';
import gachaSingleSound from '../music/music/单抽.ogg';
import gachaTenSound from '../music/music/十连抽.ogg';
import gachaConvertSound from '../music/music/转化通用银.ogg';

// ================= [新增] 全新动作与反馈音效 =================
import dropBench1Sound from '../music/music/进入备战席1.ogg';
import dropBench2Sound from '../music/music/进入备战席2.ogg';
import recallBlockSound from '../music/music/撤回格挡或进攻.ogg';
import enemyPlayUnitSound from '../music/music/敌方打出单位.ogg';
import playerPlayUnitSound from '../music/music/我方打出单位.ogg';
import blockSound from '../music/music/格挡或进攻.ogg';
import cardHoverSound from '../music/music/卡牌悬停.ogg';
import shuffleSound from '../music/music/洗牌.ogg';
import summonSound from '../music/music/召唤.ogg';
import defeatSound from '../music/music/被击败.ogg';
import pupuUltSound from '../music/music/卜卜 灵鉴/卜卜大招.ogg';
import pupuSkillSound from '../music/music/卜卜 灵鉴/卜卜小技能.ogg';
import pupuSkillUpSound from '../music/music/卜卜 灵鉴/卜卜小技能强化.ogg';
import mauxirSummonSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_summon.ogg';
import mauxirRushAttackSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_attack.ogg';
import mauxirRushHitSound from '../music/music/猫汐尔莲驱/mauxir_lotus_rush_be_attack.ogg';

// ================= [2026-07-31 安卡希雅·时之重奏] 专属音效 =================
import acaciaRushFocusSound from '../music/music/安卡希雅时之重奏/圆缺有律_切换到集束模型.ogg';
import acaciaRushSpreadSound from '../music/music/安卡希雅时之重奏/圆缺有律_切换到扩散模型.ogg';
import acaciaSwordSound from '../music/music/安卡希雅时之重奏/飞剑.ogg';
import acaciaUltimateSound from '../music/music/安卡希雅时之重奏/朔望之期.ogg';
import acaciaGreatSwordSound from '../music/music/安卡希雅时之重奏/大飞剑.ogg';
import acaciaCrossTemporalSound from '../music/music/安卡希雅时之重奏/越时斩.ogg';
import acaciaSwordTimelineSound from '../music/music/安卡希雅时之重奏/剑痕时空.ogg';
// ==========================================================

// ================= [2026-09-19 1.0.16 茉莉安·霄鹰] 大招音效 =================
import marianUltSound from '../music/music/茉莉安 霄鹰/茉莉安大招音效.ogg';

// ================= [2026-09-19 1.0.16] 法术交互音效（程提供） =================
import spellDragSound from '../music/music/拖出法术.ogg';
import spellPlaySound from '../music/music/打出法术.ogg';
import spellConfirmSound from '../music/music/确定打出法术.ogg';
import spellTargetSound from '../music/music/法术选择目标.ogg';
import spellRecallSound from '../music/music/撤回法术.ogg';
import buffApplySound from '../music/music/BUFF音效.ogg';
import drawCardSound from '../music/music/抽出卡牌.ogg';
import mulliganDrawSound from '../music/music/换牌阶段开局抽出卡牌.ogg';
import cardToDeckSound from '../music/music/卡牌入队.ogg';
import defaultHitSound from '../music/music/默认受击.ogg';
import beaconHitSound from '../music/music/茉莉安 霄鹰/信标受击.ogg';

export const useSfx = () => {
    // [新增] 全局音效音量 Ref (默认 0.6)
    const globalVolumeRef = useRef(0.6);
    // [2026-09-19 茉莉安] 大招音效实例（用于「重触发」——见 playMarianUlt 注释）
    const marianUltAudioRef = useRef<HTMLAudioElement | null>(null);

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

        // [2026-09-19 1.0.16 茉莉安] 大招「最终指令」逐击音效 —— **每击完整放一整段**
        // ── 触发源：逐击广播 CHAIN_STRIKE_STEP（一击一发，与伤害/演出同刻）
        // ── 程 2026-09-19 拍板：每次打击都把音效**完整播一遍**（后续的尾音正是爆炸的余韵），
        //    不做重触发、不掐断。逐击间隔已拉长到 1s（见 CHAIN_STRIKE_STEP_MS）。
        // ── ⚠️ 因此连斩到后面会有**多层音效重叠**（3.5s 音 × 1s 间隔）——这是刻意保留的听感；
        //    若觉得糊，调低这里的 0.85 即可（或改回"只播首击"）。
        // ── marianUltAudioRef 仍保留：仅为卸载时能掐掉正在播的那条。
        const playMarianUlt = () => {
            const audio = new Audio(marianUltSound);
            audio.volume = 0.85 * globalVolumeRef.current;
            marianUltAudioRef.current = audio;
            audio.play().catch(e => console.warn("SFX play failed", e));
        };

        // [2026-09-19] 法术交互五件套 + BUFF 金光
        const playSpellDrag = () => playSound(spellDragSound, 0.7);
        const playSpellPlay = () => playSound(spellPlaySound, 0.8);
        const playSpellConfirm = () => playSound(spellConfirmSound, 0.8);
        // [2026-09-19] 金光同时命中多张卡时会连着响，加 150ms 节流避免糊成一片
        let lastBuffSfxAt = 0;
        const playBuffApply = () => {
            const now = Date.now();
            if (now - lastBuffSfxAt < 150) return;
            lastBuffSfxAt = now;
            playSound(buffApplySound, 0.7);
        };

        // [2026-09-19] 抽卡 / 入队三件（程：三种抽卡场合都响；敌我也都响）
        //   · DRAW_START 且 reason==='mulligan' → 换牌阶段开局抽卡（显式标记，不靠 count 猜）
        //   · 其余 DRAW_START（正常抽 / 亡语抽 / 效果生成入手牌）→ 抽出卡牌
        //   · CARD_TO_DECK → 卡牌入队（与"飞回牌库"动画同源）
        const playDraw = () => playSound(drawCardSound, 0.55); // 抽卡频繁，音量压低
        // 换牌阶段【开局发牌】：由 GameSession 在换牌 UI 出现时广播（与"换牌结束后的补抽"区分开）
        const playMulliganDeal = () => playSound(mulliganDrawSound, 0.8);
        const playCardToDeck = () => playSound(cardToDeckSound, 0.7);

        // ==========================================================
        // [2026-09-19] 受击音（程口径：**只按"受伤的一方"路由**）
        //   · 战斗里的打击 → 已有专属打击音，事件带 fromCombat ⇒ 这里**跳过**（否则双响）
        //   · 獠牙信标     → 专属受击音（payload 带 key）
        //   · 其余一切伤害（法术/技能/亡语/倒计时掉血…）→ 默认受击音
        //   节流 90ms：多目标法术会同时打到好几张卡，不节流会连成一片
        // ==========================================================
        // 两条音效链**各自节流**（共用一个时间戳会互相压掉 ✗）
        let lastDefaultHitAt = 0;
        let lastBeaconHitAt = 0;
        const playDefaultHit = () => {
            const now = Date.now();
            if (now - lastDefaultHitAt < 90) return;
            lastDefaultHitAt = now;
            playSound(defaultHitSound, 0.65);
        };
        const playBeaconHit = () => {
            const now = Date.now();
            if (now - lastBeaconHitAt < 90) return;
            lastBeaconHitAt = now;
            playSound(beaconHitSound, 0.75);
        };

        // ── 程口径：**受伤的一方按音效叠层**
        //    法术/效果打信标 → 默认受击音 ＋ 信标受击音（两个都要）
        //    战斗中打信标   → 打击音（战斗结算播）＋ 信标受击音（这里补）
        // 水晶受击：按程口径用「默认受击」；战斗那发带 fromCombat ⇒ 跳过（专属打击音已播）
        const onNexusStriked = (p?: { target?: string; amount?: number; fromCombat?: boolean }) => {
            if (p?.fromCombat) return;
            playDefaultHit();
        };

        const onUnitDamage = (p?: { id?: string; amount?: number; key?: string; fromCombat?: boolean }) => {
            if (!p?.id) return;
            const isBeacon = p.key === 'Marian_Wolf_Tooth_Beacon';
            if (p.fromCombat) {
                if (isBeacon) playBeaconHit(); // 打击音已由战斗结算播出，这里只补信标那一下
                return;
            }
            playDefaultHit();                  // 含水晶伪 id（nexus_xxx）
            if (isBeacon) playBeaconHit();
        };

        // 2. 封装各类音效触发器
        const playClick = () => playSound(clickSound, 0.6);
        // [2026-09-19 修正] 「撤回」这个词此前一个播放器服务三个事件，换声会连带污染另外两个。
        //   拆开：
        //     · 撤回单位 / UI 返回 → 通用 recall.ogg（保持原样）
        //     · 取消施法           → 专属「撤回法术」（程的口径）
        const playRecall = () => playSound(recallSound, 0.6);                 // 撤回单位 / UI 返回
        const playSpellRecall = () => playSound(spellRecallSound, 0.7);       // 取消施法
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
        // [2026-09-19 重做] 两件事分开，各响各的：
        //   · 通用选单位（选阻挡者 / 选备战席…）→ 选择单位.ogg
        //   · 施法时选目标                     → 法术选择目标.ogg（程：专属音效只服务施法场景）
        const playSelectUnit = () => playSound(selectUnitSound, 0.7);
        const playSpellTarget = () => playSound(spellTargetSound, 0.7);
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
        eventBus.on(GameEvents.CANCEL_SPELL, playSpellRecall);
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
        eventBus.on(GameEvents.SFX_SPELL_TARGET, playSpellTarget);
        eventBus.on(GameEvents.SFX_SUMMON, playSummon);
        eventBus.on(GameEvents.UNIT_DIE, playDefeat);
        eventBus.on(GameEvents.SFX_PUPU_ULTIMATE, playPupuUlt);
        // [2026-09-19 1.0.16 茉莉安] 大招逐击音效：一击一声
        eventBus.on(GameEvents.CHAIN_STRIKE_STEP, playMarianUlt);
        // [2026-09-19] 法术交互五件套 + BUFF 金光
        eventBus.on(GameEvents.SFX_SPELL_DRAG, playSpellDrag);
        eventBus.on(GameEvents.SFX_SPELL_PLAY, playSpellPlay);
        eventBus.on(GameEvents.SFX_SPELL_CONFIRM, playSpellConfirm);
        eventBus.on(GameEvents.SFX_BUFF_APPLY, playBuffApply);
        eventBus.on(GameEvents.DRAW_START, playDraw);
        eventBus.on(GameEvents.CARD_TO_DECK, playCardToDeck);
        eventBus.on(GameEvents.SFX_MULLIGAN_DEAL, playMulliganDeal);
        eventBus.on('unit_damage', onUnitDamage); // [2026-09-19] 效果伤害的默认受击音
        // [2026-09-19 修正] 此前误挂在 'nexus_damage' 上 —— **eventBus 上根本没有人发这个事件**
        //   （它只是效果内部的事件类型，`spells.ts` 转发时会改名为 NEXUS_STRIKED）
        //   ⇒ 换成真正的水晶受击广播 NEXUS_STRIKED；战斗那发带 fromCombat，跳过（已有专属打击音）
        eventBus.on(GameEvents.NEXUS_STRIKED, onNexusStriked);
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
            eventBus.off(GameEvents.CANCEL_SPELL, playSpellRecall);
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
            eventBus.off(GameEvents.SFX_SPELL_TARGET, playSpellTarget);
            eventBus.off(GameEvents.SFX_SUMMON, playSummon);
            eventBus.off(GameEvents.UNIT_DIE, playDefeat);
            eventBus.off(GameEvents.SFX_PUPU_ULTIMATE, playPupuUlt);
            // [2026-09-19 1.0.16 茉莉安] 大招逐击音效解除绑定（顺手掐掉正在播的那条）
            eventBus.off(GameEvents.CHAIN_STRIKE_STEP, playMarianUlt);
            eventBus.off(GameEvents.SFX_SPELL_DRAG, playSpellDrag);
            eventBus.off(GameEvents.SFX_SPELL_PLAY, playSpellPlay);
            eventBus.off(GameEvents.SFX_SPELL_CONFIRM, playSpellConfirm);
            eventBus.off(GameEvents.SFX_BUFF_APPLY, playBuffApply);
            eventBus.off(GameEvents.DRAW_START, playDraw);
            eventBus.off(GameEvents.CARD_TO_DECK, playCardToDeck);
            eventBus.off(GameEvents.SFX_MULLIGAN_DEAL, playMulliganDeal);
            eventBus.off('unit_damage', onUnitDamage);
            eventBus.off(GameEvents.NEXUS_STRIKED, onNexusStriked);
            try { marianUltAudioRef.current?.pause(); } catch { /* 忽略 */ }
            eventBus.off(GameEvents.SFX_PUPU_SKILL1, playPupuSkill);
            eventBus.off(GameEvents.SFX_PUPU_SKILL1_UPGRADED, playPupuSkillUp);
        };
    }, []);

    return {
        setSfxVolume
    };
};