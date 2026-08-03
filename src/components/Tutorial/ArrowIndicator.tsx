/**
 * ArrowIndicator — 教程箭头指引
 *
 * 在目标元素附近呈现一个弹跳动画箭头，引导玩家点击/拖拽目标。
 * 使用 Portal 渲染，不受父容器层叠上下文影响。
 *
 * 设计者：程
 * 实现者：莉莉子
 */

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion'; // [核心新增] 引入动画引擎

// ════════════════════════════════════════════════════════════

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** 箭头的指向方向（语义重构：表示箭头放置在目标的哪一侧） */
type ArrowDirection = 'top' | 'bottom' | 'left' | 'right';

interface ArrowIndicatorProps {
  /** 目标元素 CSS 选择器 */
  targetSelector: string;
  /** 可选偏移 */
  offset?: { x: number; y: number };
  /** 指引文字（显示在箭头旁） */
  text?: string;
  /** 箭头指向方向（默认自动计算） */
  direction?: ArrowDirection;
}

// ─── 获取目标位置 ─────────────────────────────────────────

function getTargetRect(selector: string): TargetRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

// ─── 箭头图标 ─────────────────────────────────────────────

const ArrowIcon: React.FC<{ direction: ArrowDirection }> = ({ direction }) => {
  // [核心重构] 旋转映射：现在 direction 代表“放置在目标的哪一侧”
  const rotation: Record<ArrowDirection, string> = {
    top: '',               // 置于上方，箭头向下
    bottom: 'rotate-180',  // 置于下方，箭头向上
    left: '-rotate-90',    // 置于左侧，箭头向右
    right: 'rotate-90',    // 置于右侧，箭头向左
  };
  return (
    <svg
      className={`w-8 h-8 ${rotation[direction]} drop-shadow-lg`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5l0 14" />
      <path d="M19 12l-7 7 -7 -7" />
    </svg>
  );
};

// ─── 主组件 ─────────────────────────────────────────────────

export const ArrowIndicator: React.FC<ArrowIndicatorProps> = ({
  targetSelector,
  offset = { x: 0, y: 0 },
  text,
  direction: initialDirection,
}) => {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [scale, setScale] = useState(1);

  // 与 ScaleWrapper 一致的缩放比
  useEffect(() => {
    const handleResize = () => {
      setScale(Math.min(window.innerWidth / 1680, window.innerHeight / 1050));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const measure = useCallback(() => {
    const rect = getTargetRect(targetSelector);
    setTargetRect(rect);
  }, [targetSelector]);

  useEffect(() => {
    // 延迟一帧确保 DOM 已渲染
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    // [新增] 持续追踪目标位置（手牌悬停缩放时箭头跟随移动）
    const tracker = setInterval(measure, 200);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      clearInterval(tracker);
    };
  }, [measure]);

  // 根据目标在屏幕上的位置自动推算箭头指向
  const getAutoDirection = (): ArrowDirection => {
    if (initialDirection) return initialDirection;
    if (!targetRect) return 'bottom';
    const viewCenter = window.innerHeight / 2;
    // [核心重构] 如果目标在屏幕上半区，为了防止溢出，箭头应置于其【下方】
    if (targetRect.top + targetRect.height / 2 < viewCenter) return 'bottom';
    // 目标在屏幕下半区，箭头应置于其【上方】
    return 'top';
  };

  const direction = getAutoDirection();

  // 计算箭头绝对位置
  const getArrowStyle = (): React.CSSProperties | undefined => {
    if (!targetRect) return { display: 'none' };
    const gap = 8;
    switch (direction) {
      case 'top':
        return {
          top: targetRect.top - gap - 32 + (offset.y ?? 0),
          left: targetRect.left + targetRect.width / 2 - 16 + (offset.x ?? 0),
        };
      case 'bottom':
        return {
          top: targetRect.top + targetRect.height + gap + (offset.y ?? 0),
          left: targetRect.left + targetRect.width / 2 - 16 + (offset.x ?? 0),
        };
      case 'left':
        return {
          top: targetRect.top + targetRect.height / 2 - 16 + (offset.y ?? 0),
          right: window.innerWidth - targetRect.left + 12,
        };
      case 'right':
        return {
          top: targetRect.top + targetRect.height / 2 - 16 + (offset.y ?? 0),
          left: targetRect.left + targetRect.width + gap + (offset.x ?? 0),
        };
    }
  };

  if (!targetRect) return null;

  const originMap: Record<ArrowDirection, string> = {
    top: 'bottom center',
    bottom: 'top center',
    left: 'right center',
    right: 'left center',
  };

  return createPortal(
    <div
      className="fixed z-[110] pointer-events-none"
      style={getArrowStyle()}
    >
    {/* 内层：只负责缩放内容 */}
    <div
      className={`flex ${direction === 'left' ? 'flex-row items-center' : 'flex-col items-center'}`}
      style={{ transform: `scale(${scale})`, transformOrigin: originMap[direction] }}
    >
      {/* 文字 — direction='left' 时放在箭头左边 */}
      {text && (
        <div className={`px-2 py-1 bg-cyan-500/20 backdrop-blur-sm
                        border border-cyan-400/30 rounded-lg
                        text-cyan-300 text-xs font-medium whitespace-nowrap drop-shadow-md ${direction === 'left' ? 'mr-2' : 'mt-1'}`}>
          {text}
        </div>
      )}

      {/* [核心重构] 物理弹跳引擎：永远向着目标的方向进行戳击！ */}
      <motion.div
        className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
        animate={{
          x: direction === 'left' ? [0, 10, 0] : direction === 'right' ? [0, -10, 0] : 0,
          y: direction === 'top' ? [0, 10, 0] : direction === 'bottom' ? [0, -10, 0] : 0,
        }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowIcon direction={direction} />
      </motion.div>
    </div>
    </div>,
    document.body
  );
};