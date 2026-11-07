// ==========================================
// 悖论迷宫 · 多卡 / 多强化并排的**统一间距口径**（唯一出口）// [2026-10-03 莉莉子 · 程反馈「很多界面间距没考虑清楚，几类问题都得修」]
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

import { pickTuning, pickScalar } from '../../platform/tuning';

/** `Card location="hand"` 的卡体尺寸 + 内部缩放（Card.tsx 内写死，改那边要同步这里） */
export const HAND_CARD = { w: 130, h: 202, scale: 0.45 } as const;

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 强化大卡（`modals/EnhancementCard.tsx`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 管：卡体宽高 / 描边 / 顶部留白 / 中间圆形原画 / 名称 / 描述框 / NEW 缎带。
// 🔴 **单一来源**：卡片组件 `modals/EnhancementCard.tsx` 直接读这里，
//    不要再在组件里写 `w-[250px] h-[395px]`（旧实现两处各写一份 ⇒ 必然脱节）。
//    `ENH_CARD`（下面那些间距函数的入参）也**从这里派生** ⇒ 卡一变大，倾斜行间距自动跟着变。
//
// 🖥️📱 【双平台】手机端字号 ×1.5、卡体 ×1.36（给放大后的文字腾地方）。
//   判定收在 `src/platform/tuning.ts`（组件/工具里都不出现 isNative）。
//
// 🔴 为什么要有它（2026-10-28 程报「迷宫强化三选一的卡太小，看不清描述文字」）：
//    描述原来是 `text-sm` = **14 设计 px**，而未选中的卡还被外层 `scale: 0.88` 压一层
//    ⇒ 手机 s≈0.374 时实际只有 **约 4.6 CSS px**（PC ≈ 12.6 px 正常）。
//    ⚠️ 本卡被 **5 处**共用（强化三选一 · 宝箱 · 商店 · 事件奖励 · 悬停预览大卡），
//      所以这里一改，五处同时生效 —— 这是**有意的**（同一张脸不该有的地方大有的地方小）。
// ══════════════════════════════════════════════════════════════════════
// 📱 手机端值（程继续在这里调）
const ENH_CARD_UI_MOBILE = {
    // ══ ① 卡体 ═══════════════════════════════════════════════════════
    //  ⚠️ 尺寸按**最长描述 79 字**反推（`buffs.ts` 实测，平均 30~55 字）：
    //     描述框净宽 = 330×88% − 19×2 ≈ 252 ⇒ 20px 字每行约 12.6 字 ⇒ 79 字 ≈ 6.3 行 ≈ 174px，
    //     而描述框可用高 ≈ 181px ⇒ **刚好放得下**。再压宽度或加字号就会裁字。
    width: 330,             // 原 w-[250px]
    height: 520,            // 原 h-[395px]
    border: 6,              // 原 border-[4px]
    radius: 16,             // 原 rounded-2xl
    paddingTop: 42,         // 原 pt-8 = 32

    // ══ ② 中间圆形原画 ═══════════════════════════════════════════════
    artSize: 200,           // 原 w-40 / h-40 = 160
    artRingInset: 7,        // 原 inset-[-5px]（往外扩，取正值在组件里取负）
    artRingBorder: 4,       // 原 border-[3px]
    artMarginTop: 5,        // 原 mt-1 = 4
    artMarginBottom: 20,    // 原 mb-4 = 16
    rarityIconSize: 30,     // 原 <RarityIcon size={24} />
    rarityInset: 15,        // 原 top-3 / right-3 = 12

    // ══ ③ 名称 + 分隔线 ══════════════════════════════════════════════
    nameFont: 28,           // 原 text-xl = 20
    namePadX: 11,           // 原 px-2 = 8
    nameMarginBottom: 11,   // 原 mb-2 = 8
    dividerHeight: 3,       // 原 h-[2px]
    dividerMarginTop: 8,    // 原 mt-1.5 = 6

    // ══ ④ 效果描述框（**程要看清的就是这块**）════════════════════════
    descBoxWidthPct: 88,    // 原 w-[88%]（百分比，随卡宽自动）
    descBoxMarginBottom: 30,// 原 mb-6 = 24
    descPad: 19,            // 原 p-3.5 = 14
    descFont: 20,           // 原 text-sm = 14
    descLineHeight: 1.375,  // 原 leading-snug

    // ══ ⑤ NEW!! 缎带（图鉴首次遇到角标）══════════════════════════════
    newFont: 19,            // 原 text-[13px] = 13
    newPadX: 13,            // 原 px-2.5 = 10
    newPadY: 5,             // 原 py-1 = 4
    newEmojiFont: 17,       // 原 text-[12px] = 12
    newGap: 5,              // 原 gap-1 = 4
};

// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：本卡在 2026-10-28 之前**从未抽调参区**，PC 值 = 当时 Tailwind 类的直接换算（×4px），
//       无历史手调、无 git 歧义。
const ENH_CARD_UI_PC_DIFF = {
    width: 250,             // 原 w-[250px]
    height: 395,            // 原 h-[395px]
    border: 4,              // 原 border-[4px]
    radius: 16,             // 原 rounded-2xl（两端相同，列出仅为可读）
    paddingTop: 32,         // 原 pt-8

    artSize: 160,           // 原 w-40 / h-40
    artRingInset: 5,        // 原 inset-[-5px]
    artRingBorder: 3,       // 原 border-[3px]
    artMarginTop: 4,        // 原 mt-1
    artMarginBottom: 16,    // 原 mb-4
    rarityIconSize: 24,     // 原 <RarityIcon size={24} />
    rarityInset: 12,        // 原 top-3 / right-3

    nameFont: 20,           // 原 text-xl
    namePadX: 8,            // 原 px-2
    nameMarginBottom: 8,    // 原 mb-2
    dividerHeight: 2,       // 原 h-[2px]
    dividerMarginTop: 6,    // 原 mt-1.5

    descBoxWidthPct: 88,    // 原 w-[88%]
    descBoxMarginBottom: 24,// 原 mb-6
    descPad: 14,            // 原 p-3.5
    descFont: 14,           // 原 text-sm
    descLineHeight: 1.375,  // 原 leading-snug

    newFont: 13,            // 原 text-[13px]
    newPadX: 10,            // 原 px-2.5
    newPadY: 4,             // 原 py-1
    newEmojiFont: 12,       // 原 text-[12px]
    newGap: 4,              // 原 gap-1
};

const ENH_CARD_UI_PC = { ...ENH_CARD_UI_MOBILE, ...ENH_CARD_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一 */
export const ENH_CARD_UI = pickTuning(ENH_CARD_UI_PC, ENH_CARD_UI_MOBILE);

/** 强化大卡尺寸（**从 `ENH_CARD_UI` 派生，不再单独写死**）
 *  ⚠️ 容器**不要**再用比它窄的宽度去包它（如 `w-44`=176px）—— 那是"强化相互重叠"的病根 */
export const ENH_CARD = { w: ENH_CARD_UI.width, h: ENH_CARD_UI.height };

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

/**
 * 强化三选一里**未选中卡**的缩小倍率（`NodeEventModal` 的 framer-motion variants）。
 *
 * 🐛 为什么不能沿用 0.88（2026-10-28 · 程报「卡太小看不清描述」）：
 *    卡体已在手机端放大到 330×520，若仍乘 0.88 ⇒ 描述字号 20 被压回 **17.6**
 *    （14 → 17.6 的收益又吐掉一半）⇒ **等于白放大**。
 *    手机端放宽到 0.95：保留"未选中略小"的层次感，但不再吃掉可读性。
 * ⚠️ PC 端仍是 0.88（原值），观感一个像素不动。
 */
export const ENH_UNSELECTED_SCALE = pickScalar(0.88, 0.95);

/**
 * 「三选一」里**未选中的手牌样式卡**的缩小倍率（`BattleRewardModal`）。
 *
 * 🐛 同 `ENH_UNSELECTED_SCALE` 的理由（2026-10-28 程报「战斗胜利三选一看不清描述」）：
 *    卡面已放大，若仍乘 0.88 会把放大收益吐掉一半 ⇒ 手机端放宽到 0.95。
 * ⚠️ 与 `ENH_UNSELECTED_SCALE` **数值相同但各自独立** —— 两屏卡体不同，将来要单独调时不必互相牵制。
 * ⚠️ PC 端仍是 0.88（原值）。
 */
export const HAND_UNSELECTED_SCALE = pickScalar(0.88, 0.95);
