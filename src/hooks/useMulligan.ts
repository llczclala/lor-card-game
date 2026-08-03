import { useState, useEffect, useCallback } from 'react';
import type { CardData } from '../types';
import { eventBus, GameEvents } from '../utils/eventBus';

interface UseMulliganProps {
    initialHand: CardData[];
    onReplace: (indices: number[]) => Promise<void>; // 真正执行换牌的后端逻辑
    onComplete: () => void; // 换牌彻底结束的回调
    skip?: boolean; // [新增] 完全跳过换牌环节
}

export const useMulligan = ({ onReplace, onComplete, skip = false }: UseMulliganProps) => {
    // 状态管理
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [timeLeft, setTimeLeft] = useState(20);
    const [isActive, setIsActive] = useState(!skip); // [修改] 跳过时直接 inactive

    // 倒计时逻辑
    useEffect(() => {
        if (isActive && !isConfirmed) {
            if (timeLeft <= 0) {
                setIsConfirmed(true);
                return;
            }
            const timer = setTimeout(() => setTimeLeft(p => p - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [isActive, isConfirmed, timeLeft]);

    // 选中/取消选中
    const toggleIndex = useCallback((index: number) => {
        if (isConfirmed) return;
        eventBus.emit(GameEvents.UI_CLICK);
        setSelectedIndices(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    }, [isConfirmed]);

    // 确认换牌
    const confirmMulligan = useCallback(() => {
        if (isConfirmed) return;
        eventBus.emit(GameEvents.UI_CLICK);
        setIsConfirmed(true);
    }, [isConfirmed]);

    // 处理实际的换牌动作 (供动画组件调用)
    const handleDataReplace = useCallback(async () => {
        if (selectedIndices.size > 0) {
            await onReplace(Array.from(selectedIndices));
        }
        // 这里不调用 setIsActive(false)，因为我们要等待动画组件通知我们"播放完了"
    }, [selectedIndices, onReplace]);

    // [新增] 真正的结束函数，由动画组件在 exit 动画播完后调用
    const finishMulligan = useCallback(() => {
        setIsActive(false);
        onComplete();
    }, [onComplete]);

    return {
        // ... (状态保持不变)
        selectedIndices,
        selectedCount: selectedIndices.size,
        isConfirmed,
        timeLeft,
        isActive,

        // 动作
        toggleIndex,
        confirmMulligan,
        handleDataReplace, // [改名导出]
        finishMulligan     // [新增导出]
    };

    return {
        // 状态
        selectedIndices,
        selectedCount: selectedIndices.size,
        isConfirmed,
        timeLeft,
        isActive,

        // 动作
        toggleIndex,
        confirmMulligan,
        handleDataReplace, // ✅ 对应上面的 const handleDataReplace
        finishMulligan     // ✅ 对应上面的 const finishMulligan
    };
};