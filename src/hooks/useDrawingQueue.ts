import { useState, useEffect, useRef } from 'react';
import type { CardData } from '../types';

export const useDrawingQueue = (hand: CardData[], duration: number = 2000) => {
    // 状态队列：用于在动画持续期间保持 isNew = true
    const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

    // 历史记录：记录所有已经处理过的卡牌 ID
    const seenIds = useRef<Set<string>>(new Set());

    // 计时器池：用于组件卸载时清理，防止内存泄漏
    const timers = useRef<any>(null);

    // 卸载清理：只在组件彻底销毁时清除所有计时器
    useEffect(() => {
        return () => {
            timers.current.forEach(clearTimeout);
        };
    }, []);

    // 核心逻辑：检测新卡并启动动画
    // 注意：这里不返回 cleanup function 来取消动画，确保动画一旦开始就会自然结束
    useEffect(() => {
        // 1. 找出本轮渲染中的新卡
        const newCards = hand.filter(c => !seenIds.current.has(c.id));

        if (newCards.length > 0) {
            // 2. 立即标记为已见
            newCards.forEach(c => seenIds.current.add(c.id));

            // 3. 将新卡加入动画队列
            setAnimatingIds(prev => {
                const next = new Set(prev);
                newCards.forEach(c => next.add(c.id));
                return next;
            });

            // 4. 设置独立定时器，到点移除
            // 这个定时器不会因为 hand 变化而被 useEffect 的 cleanup 机制取消
            const timer = setTimeout(() => {
                setAnimatingIds(prev => {
                    const next = new Set(prev);
                    newCards.forEach(c => next.delete(c.id));
                    return next;
                });
                // 执行完后从池子移除自己(可选，微优化)
            }, duration);

            timers.current.push(timer);
        }
    }, [hand, duration]);

    return {
        isNewCard: (id: string) => animatingIds.has(id)
    };
};
