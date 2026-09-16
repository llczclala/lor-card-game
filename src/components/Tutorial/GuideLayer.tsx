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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { GuideLayerStep, GuideTextAnnotation, AnchoredPrompt } from '../../data/tutorialScript';
import { eventBus, GameEvents } from '../../utils/eventBus';

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

  // [核心新增] 防溢出物理结算系统
  const gap = 16;
  const bubbleWidth = 400; // 与下面 max-w-[400px] 保持一致
  const halfW = bubbleWidth / 2;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gameAspect = 16 / 9;
  const windowAspect = vw / vh;
  // 计算游戏画面的真实左右黑边宽度，确保气泡不会超出 16:9 画幅
  const offsetX = windowAspect > gameAspect ? (vw - vh * gameAspect) / 2 : 0;

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  // X轴智能边缘防溢出钳制 (Clamp)
  const minX = offsetX + halfW + 16;
  const maxX = vw - offsetX - halfW - 16;
  const clampedX = Math.max(minX, Math.min(targetCenterX, maxX));

  // 计算气泡被强制拉回安全区后，小三角指示器需要作出的反向位移补偿，确保它依然死死指着高亮目标！
  const arrowOffsetX = targetCenterX - clampedX;

  // 根据 position 计算气泡位置
  const getPosition = (): React.CSSProperties => {
    switch (annotation.position) {
      case 'top':
        return { bottom: vh - targetRect.top + gap, left: clampedX, transform: 'translateX(-50%)' };
      case 'bottom':
        return { top: targetRect.top + targetRect.height + gap, left: clampedX, transform: 'translateX(-50%)' };
      case 'left':
        return { top: targetCenterY, right: vw - targetRect.left + gap, transform: 'translateY(-50%)' };
      case 'right':
        return { top: targetCenterY, left: targetRect.left + targetRect.width + gap, transform: 'translateY(-50%)' };
      case 'center':
        return { top: targetCenterY, left: clampedX, transform: 'translate(-50%, -50%)' };
      default:
        return { top: targetRect.top + targetRect.height + gap, left: clampedX, transform: 'translateX(-50%)' };
    }
  };

  const posStyle = getPosition();
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
  // 剥离 transform 交给内层，外层只负责定位
  const { transform: _, ...positionStyle } = posStyle;

  // 修复：预计算三角定位属性，不在style内写计算键
  let arrowSideStyle: React.CSSProperties = {};
  switch (annotation.position) {
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
      style={{ ...positionStyle, pointerEvents: onBubbleClick ? 'auto' : 'none' }}
      onClick={onBubbleClick}
    >
      <div
        className="px-4 py-3 rounded-xl
                   bg-slate-900/95 border border-cyan-500/40 shadow-lg shadow-cyan-500/20
                   text-white text-sm leading-relaxed whitespace-pre-line relative"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: annotation.position === 'top' ? 'bottom center' :
                          annotation.position === 'bottom' ? 'top center' :
                          annotation.position === 'left' ? 'right center' :
                          annotation.position === 'right' ? 'left center' : 'center center',
          width: 'max-content',
          maxWidth: `${bubbleWidth}px`,
        }}
      >
        {/* 小三角指示器 放入气泡内部，添加relative父层 */}
        <div
          className="absolute w-3 h-3 bg-slate-900/95 border-l border-t border-cyan-500/40 -translate-x-1/2 -translate-y-1/2 rotate-45 transition-all"
          style={{
            ...arrowSideStyle,
            left: annotation.position === 'top' || annotation.position === 'bottom' ? `calc(50% + ${arrowOffsetX}px)` : undefined,
            top: annotation.position === 'left' || annotation.position === 'right' ? '50%' : undefined,
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
        className="fixed inset-0 pointer-events-none flex items-start justify-center pt-[12vh]"
        style={{ zIndex: layerZ }}
      >
        <div
          className="px-5 py-4 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-lg shadow-cyan-500/20 text-white text-sm leading-relaxed whitespace-pre-line text-center pointer-events-auto cursor-pointer max-w-md"
          onClick={step.dismissOnClick ? onDismiss : undefined}
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
        onClick={handleOverlayClick}
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
            onClick={handleOverlayClick}
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
