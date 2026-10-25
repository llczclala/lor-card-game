/**
 * GuideLayer — 教程引导层
 *
 * 全屏高斯模糊遮罩 + 高亮元素"打洞"穿透 + 文字标注。
 * 使用 box-shadow 打洞技法：在高亮目标位置放一个透明 div，
 * 用超大 box-shadow 覆盖其余区域，形成"聚光灯"效果。
 *
 * 设计者：程
 * 实现者：莉莉子
 */

import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import type { GuideLayerStep, GuideTextAnnotation, AnchoredPrompt } from '../../data/tutorialScript';
import { eventBus, GameEvents } from '../../utils/eventBus';
// [2026-10-16 莉莉子] 触屏长按判据与既有手势规范同源（移动 5px / 长按 400ms 量级）
import { isTouchInput, TOUCH_TUNE } from '../../utils/touchGaze';
// [2026-10-23 莉莉子] 手机端引导层可读性适配（方案 A）：
//   · GAME_WIDTH/GAME_HEIGHT —— 黑边比值必须与 ScaleWrapper 同源（原来写死 16/9 = 1.778，画布实为 1.6）
//   · pickUiScale —— 气泡内容在手机上抬到"可读下限"，PC 端原样返回
//   · pickScalar —— gap 这类视口 px 间距：PC 乘 1（不变）、手机乘 uiScale
import { GAME_WIDTH, GAME_HEIGHT } from '../../utils/gameScale';
import { pickUiScale, pickScalar, MIN_LEGIBLE_UI_SCALE } from '../../platform/tuning';

// ════════════════════════════════════════════════════════════
// 高亮元素的位置信息
// ════════════════════════════════════════════════════════════

interface HighlightRect {
  selector: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 测量所有高亮选择器的 DOM 位置 */
function measureHighlights(selectors: string[]): HighlightRect[] {
  const PADDING = 6; // [视觉优化] 让挖出的洞比元素本身大一圈，避免贴边太紧
  return selectors
    .map(sel => {
      const el = document.querySelector(sel);
      if (!el) {
        console.warn(`[GuideLayer] 未找到元素: ${sel}`);
        return null;
      }
      const rect = el.getBoundingClientRect();
      return {
        selector: sel,
        top: rect.top - PADDING,
        left: rect.left - PADDING,
        width: rect.width + PADDING * 2,
        height: Math.max(rect.height, 1) + PADDING * 2
      };
    })
    .filter((r): r is HighlightRect => r !== null);
}

// ════════════════════════════════════════════════════════════
// 标注气泡组件
// ════════════════════════════════════════════════════════════

interface AnnotationBubbleProps {
  annotation: GuideTextAnnotation;
  targetRect: HighlightRect;
  /** [2026-08-20 莉莉子 BUG修复] 点击气泡时回调（关闭引导层）。此前气泡 pointerEvents:'auto' 吞掉点击却无处理 → 点说明文字引导层关不掉 */
  onBubbleClick?: () => void;
}
const AnnotationBubble: React.FC<AnnotationBubbleProps> = ({ annotation, targetRect, onBubbleClick }) => {
  // 与 ScaleWrapper 一致的缩放比
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const handleResize = () => {
      setScale(Math.min(window.innerWidth / 1680, window.innerHeight / 1050));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * [2026-10-23 莉莉子 · 方案 A] 气泡**内容**用的缩放，与定位用的视口坐标分开：
   * ── 病根：气泡内容 `transform: scale(scale)` 是为了「和游戏画面等比」，
   *    但手机横屏 `scale ≈ 0.374` ⇒ `text-sm` 14px 只剩 **5.2 CSS px**，等于看不见；
   *    PC `scale ≈ 1.03`（14.4px）完全正常 ⇒ 又一个「PC 测不出来」的退化。
   * ── 修法：内容改乘 `uiScale`，手机端抬到可读下限 0.85（14px → 11.9px），PC 端返回原 `scale`。
   * ⚠️ 注意两者的分工：**定位仍全部用视口 px**（`targetRect` / `vw` / `vh` / `visualW`），
   *    只有「气泡自己长多大」用 `uiScale`。混用会立刻变成 10-21 那类 s² 事故。
   */
  const uiScale = pickUiScale(scale, MIN_LEGIBLE_UI_SCALE);
  /** PC 端乘 1（严格不变）、手机端乘 uiScale —— 让间距跟着气泡一起缩放 */
  const spacingScale = pickScalar(1, uiScale);

  // [核心新增] 防溢出物理结算系统
  // [2026-10-23 莉莉子] gap 是视口 px，必须跟着气泡缩放：否则手机上气泡已放大 2.3 倍、间隙还是 16px
  const gap = 16 * spacingScale;
  const bubbleWidth = 400; // maxWidth 上界（**不再**用它推导实际宽度）

  /**
   * [2026-10-20 莉莉子 BUG修复 · 气泡坐标系错误（根因级）]
   * ── 病根：`getPosition()` 曾经返回带 `transform: 'translateX(-50%)' / 'translateY(-50%)' /
   *    'translate(-50%,-50%)'` 的 style，随后外层一行解构 `const { transform: _, ...positionStyle }`
   *    把 transform **摘掉**了 ⇒ 所有 -50% 位移**从未生效**：`left` 实际是**左边缘**、`top` 实际是**上边缘**。
   *    后果：top/bottom 分支整体右偏 visualW/2；left/right 分支整体下偏 visualH/2；center 两者皆偏。
   *    于是任何"先假设某个值居中、再据此钳制"的算法（旧 `clampedX` / `clampedCenterY`）全都不成立。
   * ── 修法：**统一改成"上/左边缘坐标系"** —— getPosition 只返回上/左边缘坐标、彻底不用 transform 定位；
   *    气泡尺寸改为渲染后**实测** `offsetWidth / offsetHeight`（缩放前布局尺寸），视觉尺寸 = 布局尺寸 × scale。
   *    （不再用 maxWidth 上界当实宽：窄文案时上界远大于实宽，会把"放得下"误判成"放不下"⇒ 误翻面。）
   */
  const [bubbleSize, setBubbleSize] = useState({ w: 0, h: 0 });

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // [2026-10-23 莉莉子 BUG修复] 这里原来写死 `16 / 9 = 1.778`，而画布是 1680×1050 = **1.6**
  //   ⇒ 黑边宽度算错：PC 1920×1080 真实黑边 96px/侧、原算法得 **0**；
  //      手机 21:9（851×393）真实 111px/侧、原算法 76 ⇒ 钳制边界偏宽，气泡会被放进黑边区。
  //   改为引用画布常量（唯一真源），别再手写比值。
  const gameAspect = GAME_WIDTH / GAME_HEIGHT;
  const windowAspect = vw / vh;
  // 计算游戏画面的真实左右黑边宽度，确保气泡不会超出画幅
  const offsetX = windowAspect > gameAspect ? (vw - vh * gameAspect) / 2 : 0;

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  /** 气泡**视觉宽**（缩放后真实占位宽）：未测到实宽时才退回上界兜底 */
  // [2026-10-23 莉莉子] 视觉尺寸必须用 `uiScale`（气泡实际乘的那个），用 `scale` 会导致钳制算错
  const visualW = bubbleSize.w > 0 ? bubbleSize.w * uiScale : Math.max(bubbleWidth * uiScale, 40);
  /** 气泡**视觉高**（缩放后真实占位高）：未测到实高时给一个保守初值 */
  const visualH = bubbleSize.h > 0 ? bubbleSize.h * uiScale : 60;

  // [2026-10-17 莉莉子 · 垂直防溢出] 气泡**纵向自动翻转**（此前只有横向 `clampedX` 防溢出）
  // ── 病根：`position:'bottom'` 只算 `top = 目标底边 + gap`，若目标在**我方备战席**（屏幕最下方），
  //    气泡就被放到卡牌**下方** ⇒ 直接溢出屏幕底边、玩家根本看不见（碾压关 / 快攻关实测）。
  // ── 修法：渲染后量一次气泡视觉高（`offsetHeight × scale`），哪一侧放不下就翻到另一侧；
  //    两侧都放不下时选更宽敞的一侧。翻转后**定位、箭头、缩放原点**一起跟着换（下文视觉方向统一读 `actualPos`）。
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState<'top' | 'bottom' | null>(null);
  /**
   * [2026-10-20 莉莉子 BUG修复 · 气泡纵向溢出（左右 / 居中分支）]
   * ── 病根：`left` / `right` / `center` 三个分支此前没有纵向钳制；目标贴近屏幕上下边缘时气泡被切掉。
   * ── 修法：下面无条件实测**缩放前布局尺寸**，用 `× scale` 换算成视觉尺寸后做边缘钳制
   *    （见下方 `visualH` / `clampedTopEdge`）。
   */
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    // ⚠️ 测量必须放在下面 early return **之前**且无条件执行：左右 / 居中分支同样需要实尺寸
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setBubbleSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    const base = annotation.position;
    if (base !== 'top' && base !== 'bottom') {
      // [2026-10-20 莉莉子] 左右 / 居中不参与纵向翻转 ⇒ 先清掉上一次 top/bottom 遗留的翻转状态，
      // 否则同一组件复用到下一个 step 时会把旧方向的翻转带过来
      setFlipped(prev => (prev === null ? prev : null));
      return;
    }
    const measuredH = el.offsetHeight * uiScale;     // offsetHeight 是缩放前布局高 ⇒ 乘 uiScale 才是视觉高
    const roomAbove = targetRect.top - gap;
    const roomBelow = vh - (targetRect.top + targetRect.height) - gap;
    const fitsAbove = measuredH <= roomAbove;
    const fitsBelow = measuredH <= roomBelow;
    let next: 'top' | 'bottom' | null = null;
    if (!fitsBelow && fitsAbove) next = 'top';
    else if (!fitsAbove && fitsBelow) next = 'bottom';
    else if (!fitsAbove && !fitsBelow) next = roomAbove >= roomBelow ? 'top' : 'bottom';
    // 两侧都放得下 ⇒ 尊重剧本里写的方向（置 null）
    setFlipped(prev => (prev === next ? prev : next));
  }, [annotation.position, annotation.text, targetRect.top, targetRect.height, uiScale, vh, gap]);
  /** 实际生效方向：翻转优先，否则用剧本里写的 */
  const pos = flipped ?? annotation.position;

  // ── 统一的钳制基准：**全部基于上 / 左边缘**（边缘坐标系，不再有"半个气泡"的隐含假设） ──
  /** 允许的视觉左边缘下限（含 16:9 黑边） */
  const minLeftEdge = offsetX + 8;
  /** 允许的视觉右边缘上限（含 16:9 黑边） */
  const maxRightEdge = vw - offsetX - 8;
  /** 横向：把"目标中心对齐"翻译成"左边缘" */
  const desiredLeftEdge = targetCenterX - visualW / 2;
  const clampedLeftEdge = Math.min(
    Math.max(desiredLeftEdge, minLeftEdge),
    Math.max(minLeftEdge, maxRightEdge - visualW),
  );
  /** 纵向：把"目标中心对齐"翻译成"上边缘" */
  const desiredTopEdge = targetCenterY - visualH / 2;
  const clampedTopEdge = Math.min(
    Math.max(desiredTopEdge, 8),
    Math.max(8, vh - visualH - 8),
  );
  // 气泡被强制拉回安全区后，小三角要反向补偿、依然指回目标（两者都是"中心差"）
  const arrowOffsetX = targetCenterX - (clampedLeftEdge + visualW / 2);
  const arrowOffsetY = targetCenterY - (clampedTopEdge + visualH / 2);

  /**
   * 根据 position 计算气泡位置。
   * [2026-10-20 莉莉子 BUG修复 · 统一"上/左边缘坐标系"]
   * ── 硬约束：本函数返回的 style **只含上/左边缘坐标，绝不带 transform**。
   *    （旧实现在这里塞 translate(-50%) 又被外层剥离 ⇒ 位移从未生效 ⇒ 整体偏半个气泡。）
   * ── left / right 分支：先按实测 visualW 判断这一侧放不放得下；放不下就**翻到另一侧**，
   *    翻完**双边**再钳一次。翻面后箭头方向、缩放原点跟着 `actualPos` 走。
   */
  const getPosition = (): { style: React.CSSProperties; actualPos: 'top' | 'bottom' | 'left' | 'right' | 'center' } => {
    switch (pos) {
      case 'top':
        // 气泡在目标上方：用 bottom 定位（这个方向本来就是对的），left 直接给左边缘
        return { style: { bottom: vh - targetRect.top + gap, left: clampedLeftEdge }, actualPos: 'top' };
      case 'bottom':
        return { style: { top: targetRect.top + targetRect.height + gap, left: clampedLeftEdge }, actualPos: 'bottom' };
      case 'center':
        return { style: { top: clampedTopEdge, left: clampedLeftEdge }, actualPos: 'center' };
      case 'left': {
        // 期望：气泡右边缘贴着目标左边
        const wantRightEdge = targetRect.left - gap;
        if (wantRightEdge - visualW >= minLeftEdge) {
          return { style: { top: clampedTopEdge, left: wantRightEdge - visualW }, actualPos: 'left' };
        }
        // 左侧放不下 ⇒ 翻到目标右侧；翻完还要**双边**钳一次
        const flipLeft = Math.min(
          Math.max(targetRect.left + targetRect.width + gap, minLeftEdge),
          Math.max(minLeftEdge, maxRightEdge - visualW),
        );
        return { style: { top: clampedTopEdge, left: flipLeft }, actualPos: 'right' };
      }
      case 'right': {
        const wantLeftEdge = targetRect.left + targetRect.width + gap;
        if (wantLeftEdge + visualW <= maxRightEdge) {
          return { style: { top: clampedTopEdge, left: wantLeftEdge }, actualPos: 'right' };
        }
        // 右侧放不下 ⇒ 翻到目标左侧
        const flipLeft = Math.min(
          Math.max(targetRect.left - gap - visualW, minLeftEdge),
          Math.max(minLeftEdge, maxRightEdge - visualW),
        );
        return { style: { top: clampedTopEdge, left: flipLeft }, actualPos: 'left' };
      }
      default:
        return { style: { top: targetRect.top + targetRect.height + gap, left: clampedLeftEdge }, actualPos: 'bottom' };
    }
  };

  const { style: posStyle, actualPos } = getPosition();
  // [2026-08-26 莉莉子] 应用偏移微调（dx 正=右，dy 正=下；可选，不传不偏移）
  const offset = annotation.offset;
  if (offset) {
    const dx = offset.dx ?? 0;
    const dy = offset.dy ?? 0;
    if (typeof posStyle.top === 'number') posStyle.top = posStyle.top + dy;
    if (typeof posStyle.bottom === 'number') posStyle.bottom = posStyle.bottom - dy;
    if (typeof posStyle.left === 'number') posStyle.left = posStyle.left + dx;
    if (typeof posStyle.right === 'number') posStyle.right = posStyle.right - dx;
  }
  // [2026-10-20 莉莉子] 不再剥离 transform：getPosition 返回的就是纯"上/左边缘"坐标，外层直接整体套用即可

  // 修复：预计算三角定位属性，不在style内写计算键
  // [2026-10-20 莉莉子] 必须读 `actualPos`（翻面后的真实方向），否则 left 分支翻到右侧时箭头仍朝右
  let arrowSideStyle: React.CSSProperties = {};
  switch (actualPos) {
    case 'top':
      arrowSideStyle.bottom = -1;
      break;
    case 'bottom':
      arrowSideStyle.top = -1;
      break;
    case 'left':
      arrowSideStyle.right = -1;
      break;
    case 'right':
      arrowSideStyle.left = -1;
      break;
    default:
      arrowSideStyle.bottom = -1;
  }

  return (
    <div
      className="fixed z-[100] cursor-pointer"
      // [2026-08-26 莉莉子] 无可点击回调时气泡不拦截鼠标（纯提示），避免挡住下层元素
      style={{ ...posStyle, pointerEvents: onBubbleClick ? 'auto' : 'none' }}
      onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onBubbleClick?.(); }}
    >
      <div
        ref={bubbleRef}
        className="px-4 py-3 rounded-xl
                   bg-slate-900/95 border border-cyan-500/40 shadow-lg shadow-cyan-500/20
                   text-white text-sm leading-relaxed whitespace-pre-line relative"
        style={{
          transform: `scale(${uiScale})`,
          // [2026-10-20 莉莉子 · transformOrigin 选择] 改为**跟随定位边缘**：
          //   · 横向定位永远是"左边缘" ⇒ origin-x 固定 `left`（否则缩放会把左边缘拉偏，实测宽与实际不符）
          //   · `actualPos==='top'` 分支用 `bottom` 定位 ⇒ origin-y 取 `bottom`，缩放后**下边缘仍贴 `目标上边 - gap`**；
          //     其余分支（bottom / center / left / right、以及 left/right 翻面后）都用 `top` 定位 ⇒ origin-y 取 `top`。
          //   为什么不统一用建议的 'top left'：top 分支在 scale>1 时会把视觉盒整体往下拉 `(scale-1)×布局高`
          //   （2560×1440 下 scale≈1.37、气泡高 ~60 ⇒ 多盖目标约 22px），箭头也不再贴边。
          transformOrigin: actualPos === 'top' ? 'left bottom' : 'left top',
          width: 'max-content',
          maxWidth: `${bubbleWidth}px`,
        }}
      >
        {/* 小三角指示器 放入气泡内部，添加relative父层 */}
        <div
          // [2026-10-20 莉莉子] 用等量负外边距代替 Tailwind 的居中位移类，语义更直白（纯居中，不参与定位）
          className="absolute w-3 h-3 bg-slate-900/95 border-l border-t border-cyan-500/40 rotate-45 transition-all"
          style={{
            ...arrowSideStyle,
            marginLeft: -6,
            marginTop: -6,
            // [2026-10-23 莉莉子 BUG修复 · 又一个 s=1 退化]
            //   `arrowOffsetX/Y` 是**视口像素**差（目标中心 vs 气泡视觉中心），但这个三角下标画在
            //   **被 `scale(uiScale)` 缩放的元素内部** ⇒ 写进去的 px 会被再乘一次 uiScale。
            //   PC（uiScale≈1.03）误差 3% 看不见；手机（原实现 0.374）只剩 37% —— 气泡被钳制后三角就不指目标了。
            //   ⇒ 必须 **除以 uiScale** 反向补偿，视觉偏移才等于算出来的视口像素差。
            left: actualPos === 'top' || actualPos === 'bottom' ? `calc(50% + ${arrowOffsetX / uiScale}px)` : undefined,
            // [2026-10-20 莉莉子 BUG修复] 纵向箭头此前固定 50% ⇒ 系统性地偏半个气泡高；
            // 现在补上纵向补偿量 `arrowOffsetY`，被钳制后依然指回目标中心
            top: actualPos === 'left' || actualPos === 'right' ? `calc(50% + ${arrowOffsetY / uiScale}px)` : undefined,
          }}
        />
        {annotation.text}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// 锚定提示气泡组件（[2026-08-26 莉莉子] fixedPrompt 数组模式专用）
// ════════════════════════════════════════════════════════════

/**
 * 锚定提示气泡：测量目标元素位置，把引导文字钉在其旁。
 * 复用 AnnotationBubble 的定位/防溢出逻辑，但无遮罩无高亮，
 * 配合全屏详情界面（FullArtOverlay 等上层 UI）使用。
 */
const AnchoredPromptBubble: React.FC<{
  prompt: AnchoredPrompt;
  onBubbleClick?: () => void;
}> = ({ prompt, onBubbleClick }) => {
  const [rect, setRect] = useState<HighlightRect | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(prompt.targetSelector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ selector: prompt.targetSelector, top: r.top, left: r.left, width: r.width, height: r.height });
    };
    // 详情界面可能因打开动画延迟挂载：挂载后多测几次，确保锚点元素出现后再定位
    measure();
    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', measure);
    };
  }, [prompt.targetSelector]);

  if (!rect) return null;
  return (
    <AnnotationBubble
      annotation={{ targetSelector: prompt.targetSelector, text: prompt.text, position: prompt.position ?? 'left', offset: prompt.offset }}
      targetRect={rect}
      onBubbleClick={onBubbleClick}
    />
  );
};

// ════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════

interface GuideLayerProps {
  /** 引导层步骤数据 */
  step: GuideLayerStep;
  /** 玩家点击遮罩/标注时回调 */
  onDismiss: () => void;
}

export const GuideLayer: React.FC<GuideLayerProps> = ({ step, onDismiss }) => {
  const [highlights, setHighlights] = useState<HighlightRect[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ★ 强制悬停检视：向 GameSession 发射卡牌预览信号
  useEffect(() => {
    const selectors = step.forceHoverSelectors ?? [];
    if (selectors.length > 0) {
      // 从选择器提取 cardKey，如 [data-card-key="fenny"] → fenny
      const cardKey = selectors[0].match(/data-card-key=["']([^"']+)["']/)?.[1];
      if (cardKey) {
        eventBus.emit(GameEvents.TUTORIAL_FORCE_CARD_PREVIEW, { cardKey });
      }
    }
    return () => {
      // 组件卸载时清除预览
      eventBus.emit(GameEvents.TUTORIAL_CLEAR_CARD_PREVIEW);
    };
  }, [step.forceHoverSelectors]);

  // 测量 DOM 位置（首次 & 窗口 resize 时重测）
  const measure = useCallback(() => {
    setHighlights(measureHighlights(step.highlightSelectors));
  }, [step.highlightSelectors]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // 点击遮罩关闭（不穿透到游戏）
  const handleOverlayClick = () => {
    if (step.dismissOnClick) {
      onDismiss();
    }
  };

  // [2026-08-26 莉莉子] 点击指定选择器（如详情界面关闭按钮 X）即自动推进引导层——
  // 教玩家操作目标元素本身（打开/关闭详情），而非点击引导层。用 ref 避免 onDismiss 变化导致监听反复重挂。
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  useEffect(() => {
    const selectors = step.dismissOnSelectorClick ?? [];
    if (selectors.length === 0) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (selectors.some(sel => target.closest(sel))) {
        onDismissRef.current();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [step.dismissOnSelectorClick]);

  const layerZ = step.zIndex ?? 90;

  // [2026-08-26 莉莉子] 锚定提示模式：多个气泡分别钉在指定元素旁（配合全屏详情界面的关键词图标/关闭按钮等）。
  // 无遮罩无高亮；默认点击气泡关闭推进（dismissOnClick 仍生效）。
  // 配了 dismissOnSelectorClick（点击目标元素推进）时，气泡退化为纯提示（不拦截点击），推进由目标元素点击驱动。
  if (step.anchoredPrompts && step.anchoredPrompts.length > 0) {
    const bubbleClickable = step.dismissOnClick && !step.dismissOnSelectorClick?.length;
    return (
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: layerZ }}>
        {step.anchoredPrompts.map((prompt, i) => (
          <AnchoredPromptBubble
            key={`anchored-${i}`}
            prompt={prompt}
            onBubbleClick={bubbleClickable ? onDismiss : undefined}
          />
        ))}
      </div>
    );
  }

  // [2026-08-21 莉莉子] 独立提示模式：无遮罩无高亮，屏幕中上方提示文字（配合全屏详情界面等上层 UI）。
  // 点击提示关闭推进（dismissOnClick 仍生效）。
  if (step.fixedPrompt) {
    return (
      <div
        className="fixed inset-0 pointer-events-none flex items-start justify-center pt-[126px]"
        style={{ zIndex: layerZ }}
      >
        <div
          className="px-5 py-4 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-lg shadow-cyan-500/20 text-white text-sm leading-relaxed whitespace-pre-line text-center pointer-events-auto cursor-pointer max-w-md"
          onClick={step.dismissOnClick ? () => { eventBus.emit(GameEvents.UI_CLICK); onDismiss(); } : undefined}
        >
          {step.fixedPrompt}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[90]"
      // [2026-08-20 莉莉子 BUG修复] 根容器必须 pointer-events-none：
      // 此前 'auto' 让覆盖全屏的容器拦截所有点击（含高亮目标卡牌），
      // 点击/右键无法穿透到卡牌 → 教程引导操作卡死（施法的速度格挡教学实测复现）。
      // 点击关闭改由内部"交互块"（拆分 4 块、pointer-events auto）负责，高亮区域无覆盖自然穿透。
      style={{ zIndex: layerZ, pointerEvents: 'none' }}
    >
      {/* 1. 定义 SVG 蒙版引擎 (白留黑透) */}
      <svg className="absolute w-0 h-0 pointer-events-none">
        <defs>
          <mask id="tutorial-hole-mask">
            {/* 底色全白：代表全屏保留模糊和遮罩 */}
            <rect width="100%" height="100%" fill="white" />
            {/* 遍历高亮区域画黑块：代表这些区域要彻底挖空 DOM！ */}
            {highlights.map((h, i) => (
              <rect key={i} x={h.left} y={h.top} width={h.width} height={h.height} fill="black" rx="8" />
            ))}
          </mask>
        </defs>
      </svg>

      {/* 2. 视觉遮罩层（mask 挖洞，纯视觉；pointer-events-none 不拦截点击，穿透到下层） */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300 pointer-events-none"
        style={{
          WebkitMask: 'url(#tutorial-hole-mask)',
          mask: 'url(#tutorial-hole-mask)',
        }}
      />

      {/* [2026-08-21 莉莉子] 交互拦截层：全屏左键拦截（点击屏幕任意处=关闭推进，恢复"点击屏幕也能推进"），
          右键一律阻止浏览器默认菜单。引导层保持整体拦截，玩家不会点到游戏；需要右键操作的卡牌由下方的"右键处理层"接管。 */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: 'auto' }}
        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleOverlayClick(); }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* [2026-08-21 莉莉子] 高亮右键处理层：dismissOnRightClick 步骤专用（如"右键卡牌打开详情"教学）。
          覆盖高亮卡牌区域：左键=关闭推进；右键=关闭推进 + 向卡牌元素派发 contextmenu（触发其 onViewArt 打开详情）。
          不依赖 contextmenu 冒泡到 document（卡牌自身 stopPropagation 也不受影响）。 */}
      {step.dismissOnRightClick && highlights.map(h => {
        const cardKey = h.selector.match(/data-card-key=["']([^"']+)["']/)?.[1];
        return (
          <div
            key={`right-click-${h.selector}`}
            className="absolute"
            style={{ top: h.top, left: h.left, width: h.width, height: h.height, pointerEvents: 'auto' }}
            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleOverlayClick(); }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleOverlayClick();
              if (cardKey) {
                const cardEl = document.querySelector(`[data-card-key="${cardKey}"]`);
                if (cardEl) {
                  cardEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
                }
              }
            }}
          />
        );
      })}

      {/* [2026-10-16 莉莉子] 触屏长按处理层：dismissOnTouchLongPress 步骤专用（镜像上面的右键层）。
          触屏没有右键 ⇒ 教程里"右键查看详情"的手势在手机上根本不存在，玩家会卡关。
          这里把长按翻译成两步：
            ① 长按超过 `TOUCH_TUNE.longPressMs` ⇒ 向卡牌派发一次 pointerover —— 让卡牌的悬停预览浮出来
               （预览浮层的滞留操作条上就有圆形「详情」按钮，点它即可打开详情界面）；
            ② 长按本身**不关闭引导层** —— 否则玩家还没点「详情」就被推走了。
               引导层留在原地展示"长按 → 点详情"的文字提示，玩家点浮层上的「详情」按钮进入详情界面后，
               下一步（zIndex 10010 那条 anchoredPrompts）再接管控场。
          ⚠️ 只在触屏生效：`isTouchInput()` 为假时整层不渲染，PC 通路一行不变。 */}
      {step.dismissOnTouchLongPress && isTouchInput() && highlights.map(h => {
        const cardKey = h.selector.match(/data-card-key=["']([^"']+)["']/)?.[1];
        return (
          <div
            key={`touch-longpress-${h.selector}`}
            className="absolute"
            style={{ top: h.top, left: h.left, width: h.width, height: h.height, pointerEvents: 'auto' }}
            onPointerDown={(e) => {
              const startX = e.clientX;
              const startY = e.clientY;
              const timer = window.setTimeout(() => {
                if (cardKey) {
                  const cardEl = document.querySelector(`[data-card-key="${cardKey}"]`);
                  if (cardEl) {
                    // 派发"指针进入" ⇒ 触发卡牌自身的悬停预览（浮层上带「详情」按钮）
                    cardEl.dispatchEvent(new PointerEvent('pointerover', {
                      bubbles: true, cancelable: true, clientX: startX, clientY: startY,
                    }));
                    cardEl.dispatchEvent(new MouseEvent('mouseover', {
                      bubbles: true, cancelable: true, clientX: startX, clientY: startY,
                    }));
                  }
                }
              }, TOUCH_TUNE.longPressMs);
              const clear = () => window.clearTimeout(timer);
              e.currentTarget.addEventListener('pointerup', clear, { once: true });
              e.currentTarget.addEventListener('pointercancel', clear, { once: true });
              e.currentTarget.addEventListener('pointerleave', clear, { once: true });
            }}
          />
        );
      })}

      {/* 3. 独立渲染高光边框 (放在遮罩之上，防止被蒙版一起切掉) */}
      {highlights.map((h) => (
        <div
          key={`border-${h.selector}`}
          className="absolute z-[91] rounded-lg ring-2 ring-cyan-400/80 shadow-[inset_0_0_20px_rgba(0,255,255,0.3)] pointer-events-none transition-all duration-300"
          style={{
            top: h.top,
            left: h.left,
            width: h.width,
            height: h.height,
          }}
        />
      ))}

      {/* 文字标注 */}
      {step.annotations.map((ann, i) => {
        const target = highlights.find(h => h.selector === ann.targetSelector);
        if (!target) return null;
        return (
          <AnnotationBubble
            key={`${ann.targetSelector}-${i}`}
            annotation={ann}
            targetRect={target}
            onBubbleClick={step.dismissOnClick ? handleOverlayClick : undefined}
          />
        );
      })}
    </div>
  );
};
