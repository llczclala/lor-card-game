// ==========================================
// [2026-09-19 1.0.16 方案C] AI 施法的「三拍演出」
//
// ── 病根：玩家施法天然有三拍（点卡 → 点目标 → 确定），音效挂在这三个 UI 动作上；
//    而 **AI 是一瞬间选完目标、直接结算** ⇒ 这三拍在它那里根本不存在，
//    硬补音效只有两种下场：齐发（一坨）或定时假装（**音画不同步** —— 伤害先落地、声音后响）。
// ── 做法：让这三拍**真实发生**（每拍之间 await），音效挂在真实节拍上
//    ⇒ 声、画、状态全对齐；玩家还多了半秒看清"敌人要打谁"。
// ── 玩家侧不需要本函数：三拍本来就是他自己的点击动作。
//
// ⚠️ 顺序约定：调用方应在**本函数之后**再真正 commitSpell ⇒
//    「确定打出」音由 commitSpell 内部统一发出（玩家/AI 同源），紧跟着就是结算。
// ==========================================
import { eventBus, GameEvents } from './eventBus';

/** 打出 → 第一个目标之间的前摇 */
const BEAT_LEAD_MS = 200;
/** 目标之间（以及最后一个目标 → 确定）的间隔 */
const BEAT_GAP_MS = 150;

/**
 * 播完 AI 施法的前两拍：**打出法术 → 逐个目标各响一声「选择目标」**。
 * 第三拍「确定打出」不在这里发 —— 由 commitSpell 统一发（与玩家侧同源）。
 *
 * @param targets AI 选定的目标列表（有几个响几声）
 * @param wait    调用方注入的等待函数（各 hook 里都有）
 */
export const runEnemySpellCastBeats = async (
    targets: unknown[] | undefined,
    wait: (ms: number) => Promise<void>,
): Promise<void> => {
    eventBus.emit(GameEvents.SFX_SPELL_PLAY);
    await wait(BEAT_LEAD_MS);
    const list = targets || [];
    for (let i = 0; i < list.length; i++) {
        eventBus.emit(GameEvents.SFX_SPELL_TARGET); // 每个目标各响一声（程口径）
        await wait(BEAT_GAP_MS);
    }
};
