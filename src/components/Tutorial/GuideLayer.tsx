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
import type { GuideLayerStep, GuideTextAnnotation } from '../../data/tutorialScript';
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
}
const AnnotationBubble: React.FC<AnnotationBubbleProps> = ({ annotation, targetRect }) => {
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
      className="fixed z-[100]"
      style={{ ...positionStyle, pointerEvents: 'auto' }}
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[90]"
      style={{ pointerEvents: 'auto' }}
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

      {/* 2. 真正的全屏遮罩层 (唯一的一层，杜绝黑影叠加) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        style={{
          WebkitMask: 'url(#tutorial-hole-mask)',
          mask: 'url(#tutorial-hole-mask)',
        }}
        onClick={handleOverlayClick}
      />

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
          />
        );
      })}
    </div>
  );
};
