// ==========================================
// 悖论迷宫 · 多卡 / 多强化并排的**统一间距口径**（唯一出口）
// [2026-10-03 莉莉子 · 程反馈「很多界面间距没考虑清楚，几类问题都得修」]
//
// 为什么需要这个文件：
//   此前**只有商店**（ShopModal.CARD_GAP = 72）把"卡面外挂图标"算进了间距，
//   其余界面各写各的 gap-3 / gap-6 ⇒ ① 强化卡塞进更窄的容器 ⇒ 相互重叠；
//   ② 卡面右侧外挂的装备/武装图标被邻卡压住。
//   这正是本项目反复出现的老病：**同一语义多处实现 ⇒ 必漏一处**。
//   ⇒ 以后凡"多卡/多强化并排"的界面，间距一律从这里取，不要再手写 gap-N。
//
// 三个"不参与布局、却真实占位"的东西 —— 排间距时必须算进去：
//   ① 装备/武装图标：`Card.tsx` 的 renderEquipmentPips 走**绝对定位**
//      容器 right:15·k、图标 84·k × 96·k（k = Card 内部 scale；location="hand" ⇒ 0.45）
//      ⇒ **净外扩 = (84−15)×0.45 ≈ 31px**，若卡片外还有 transform: scale(S) 则再乘 S；
//      同一张卡挂多个图标时，还会沿纵向每 100×0.45 = 45px 往上叠。
//   ② 倾斜卡片：rotate(θ) 后包围盒宽 = W·cosθ + H·sinθ
//      ⇒ 两张相邻卡各向内探出 Δ/2，合计需要额外让出 Δ（卡越高越明显，395 高的强化卡尤甚）。
//   ③ 悬停/选中放大（hover:scale-[1.04] 之类）+ 选中光晕（-inset-1）→ 呼吸位。
//
// ⚠️ ①只对 `location="hand"` 的卡生效：`deck-builder` / `preview` 不渲染这套 pips
//   （所以宝箱里 deck-builder 的卡只需要普通间距）。
// ==========================================

/** `Card location="hand"` 的卡体尺寸 + 内部缩放（Card.tsx 内写死，改那边要同步这里） */
export const HAND_CARD = { w: 130, h: 202, scale: 0.45 } as const;

/** 强化大卡（`components/roguelike/modals/EnhancementCard.tsx`）尺寸
 *  ⚠️ 容器**不要**再用比它窄的宽度去包它（如 `w-44`=176px）—— 那是"强化相互重叠"的病根 */
export const ENH_CARD = { w: 250, h: 395 } as const;

/** [①] 装备/武装图标伸出卡面右侧的净外扩（**未乘外层缩放**） */
export const PIP_OUTSET_X = Math.round((84 - 15) * HAND_CARD.scale); // = 31

/** [①] 同一张卡上多个装备图标沿纵向的堆叠步距（未乘外层缩放） */
export const PIP_STEP_Y = Math.round(100 * HAND_CARD.scale); // = 45

/** [②] 倾斜 θ 度后，两张相邻卡需要**额外**让出的横向距离（= 两卡各探出量之和） */
export const tiltOutset = (cardW: number, cardH: number, angleDeg: number): number => {
    const r = (angleDeg * Math.PI) / 180;
    return Math.ceil(cardW * (Math.cos(r) - 1) + cardH * Math.sin(r));
};

/**
 * 一行「并排卡牌」的推荐**横向**间距（px）。
 * 取「装备图标外扩」与「倾斜探角」的较大者（两者在卡面上的高度不同，不相加），再 + 呼吸位。
 *
 * @param outerScale 卡片外层 `transform: scale(k)` 的 k；没有就传 1（默认）
 * @param tilt       该行有倾斜时传卡体尺寸与角度，如 `{ ...ENH_CARD, angleDeg: 9 }`
 * @param breathe    呼吸位（含 [③] 悬停放大 / 选中光晕），默认 12
 *
 * 参考值：手牌卡 1.5 倍放大 + 无倾斜 ⇒ 59（商店实际取 72，更宽松，已验收）
 */
export const cardRowGap = (
    outerScale: number = 1,
    tilt?: { w: number; h: number; angleDeg: number },
    breathe: number = 12,
): number => {
    const pip = PIP_OUTSET_X * outerScale;
    const til = tilt ? tiltOutset(tilt.w, tilt.h, tilt.angleDeg) : 0;
    return Math.ceil(Math.max(pip, til) + breathe);
};

/** 并排卡牌的**纵向**间距：让开卡面上探的角标（`-top-1.5` ≈ 6px）与阴影即可。
 *  ⚠️ 已知边界：同一张卡挂 **≥5 件**装备时，图标会伸出卡顶
 *     （第 5 个的顶部 ≈ 3.6 + 4×45 + 43.2 ≈ 227 > 卡高 202 ⇒ 伸出 ~25px），
 *     那种情况纵向间距要 ≥ 25。当前每卡装备上限远低于 5，故按 16 处理。 */
export const CARD_ROW_GAP_Y = 16;

// ── 常用现成配置（省得每处现算；数值都可按需覆盖）──────────────────────
/** 手牌卡并排 · 无外层缩放（篝火选卡 / 事件删卡 等） */
export const GAP_HAND = cardRowGap(1);
/** 手牌卡并排 + ±9° 倾斜 + 1.55 倍放大（战斗胜利三选一） */
export const GAP_HAND_TILTED = cardRowGap(1.55, { w: HAND_CARD.w * 1.55, h: HAND_CARD.h * 1.55, angleDeg: 9 });
/** 强化大卡并排 + ±9° 倾斜（迷宫强化三选一） */
export const GAP_ENH_TILTED = cardRowGap(1, { ...ENH_CARD, angleDeg: 9 });
/** 强化大卡并排 · 无倾斜（惊喜宝箱三选一）；卡片本身无 pips，只需让开悬停放大 */
export const GAP_ENH = 24;
