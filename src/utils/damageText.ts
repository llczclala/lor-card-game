// ==========================================================
// [2026-11-14 莉莉子 ✨ · 倾泻「连打段数」] 飘字副标注的唯一真源
//
// 👤 程的需求：「5 发 × 2 点打下来，屏幕上只飘一个 10 —— 玩家看不出这是打了 5 次还是 1 次」。
//
// ── 为什么要收成一个函数（而不是 Card.tsx / GameUI.tsx 各写一份）：
//    单位飘字与水晶飘字是两个独立组件（`components/Card.tsx` / `components/GameUI.tsx`），
//    两处各写一套 if 必然漂移（本项目的老毛病）。文案口径只许有一份。
//
// ── 口径（**绝不撒谎**）：
//    · `hits` 缺省 / ≤1  ⇒ 返回 `null`（调用方走**原样**渲染，一个像素都不动）
//    · `perHit × hits === amount`（自洽）⇒ 「2 × 5」（一眼是连打，且算式对得上）
//    · 不自洽（屏障吸收一发 / 坚韧削到 0 / 按剩余血量收口 / 跨多目标合计）
//      ⇒ 「5 连打」（只给段数，不编算式）
//    ⚠️ 这里的 `amount` 永远是**真实总伤害**，主数字也仍由调用方用它渲染 ——
//       本函数只产出**副标注**，不参与任何数值计算。
// ==========================================================

/**
 * 把「倾泻」的段数元数据渲染成飘字副标注。
 *
 * @param amount 本次事件的真实总伤害（= 飘字主数字）
 * @param hits   实际发数（缺省 = 1 段）
 * @param perHit 每发账面伤害
 * @returns 副标注文案；无需连打渲染时返回 `null`
 */
export const formatBarrageHitLabel = (
    amount: number,
    hits?: number,
    perHit?: number,
): string | null => {
    if (typeof hits !== 'number' || !Number.isFinite(hits)) return null;
    const shots = Math.floor(hits);
    if (shots <= 1) return null;

    const per = typeof perHit === 'number' && Number.isFinite(perHit) ? Math.floor(perHit) : 0;
    // 只有「每发相同且乘回去刚好等于总额」才敢写算式：屏障/坚韧/收口/多目标合计都会让它们不等
    if (per > 0 && per * shots === Math.round(amount)) return `${per} × ${shots}`;
    return `${shots} 连打`;
};
