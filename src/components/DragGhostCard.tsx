import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useMotionValue, useVelocity, useTransform, useSpring } from 'framer-motion';
import { Card } from './Card';
import type { CardData } from '../types';

/**
 * DragGhostCard — "替身"拖拽卡牌（多卡版）
 *
 * 当玩家从备战席拖拽卡牌时，在 document.body 上渲染分身。
 * 支持多卡队列：cards 数组中的每一张卡都会渲染，
 * 后续卡牌向右偏移形成叠放效果。
 *
 * 伪3D迎风倾斜：
 *   通过 useMotionValue 追踪位置变化 → useVelocity 检测速度
 *   → useTransform 映射为旋转角 → useSpring 弹簧减震
 */
interface DragGhostCardProps {
  cards: CardData[];
  x: number;
  y: number;
  scale?: number;
  location?: 'hand' | 'bench' | 'combat';
  w?: number;
  h?: number;
  skinOverrides?: Record<string, number>; // [核心新增] 接收外部皮肤字典
}

export const DragGhostCard: React.FC<DragGhostCardProps> = ({
  cards,
  x,
  y,
  scale = 1.08,
  location = 'bench',
  w = 120,
  h = 162,
  skinOverrides = {}, // [核心新增] 默认给个空对象兜底
}) => {
  // 多卡叠放偏移量（每张右偏 12px）
  const CARD_STACK_SPREAD = 12;
  // ── 位置追踪（用于 velocity 检测） ──
  const posX = useMotionValue(x);
  const posY = useMotionValue(y);

  useEffect(() => { posX.set(x); }, [posX, x]);
  useEffect(() => { posY.set(y); }, [posY, y]);

  // ── 速度 → 伪3D 倾斜 ──
  const xVelocity = useVelocity(posX);
  const yVelocity = useVelocity(posY);

  const rawRotateY = useTransform(xVelocity, [-1500, 0, 1500], [15, 0, -15]);
  const rawRotateX = useTransform(yVelocity, [-1500, 0, 1500], [-15, 0, 15]);

  // 弹簧减震器：吸收微小抖动，营造"空气阻力"手感
  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const smoothRotateY = useSpring(rawRotateY, springConfig);
  const smoothRotateX = useSpring(rawRotateX, springConfig);

  return createPortal(
    <>
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          style={{
            position: 'fixed',
            left: `${i * CARD_STACK_SPREAD}px`,
            top: 0,
            width: Math.round(w),
            height: Math.round(h),
            zIndex: 9999 - i,
            pointerEvents: 'none',
            // [修复 Bug A] 彻底清空所有自带的裁剪和阴影（overflow、borderRadius、boxShadow）
            // 让内部的 Card 组件自己处理精美的阴影与发光，杜绝外层容器放大时透出边框！
            transformPerspective: 1000,
            x: posX,
            y: posY,
            scale,
            rotateX: smoothRotateX,
            rotateY: smoothRotateY,
          }}
        >
          {/* [核心修复] 彻底接通皮肤神经线！替身也披上皮肤战衣！ */}
          <Card
             data={card}
             location={location}
             skinId={skinOverrides[card.key] || 0}
          />
        </motion.div>
      ))}
    </>,
    document.body
  );
};
