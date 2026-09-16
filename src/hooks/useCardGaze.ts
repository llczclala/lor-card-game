import { useState, useCallback, useRef, useEffect } from 'react';
import type { CardData } from '../types';

interface UseCardGazeConfig {
    /** 悬停触发延迟（毫秒），默认 500 */
    delay?: number;
    /** 离开后清除延迟（毫秒），默认 150，用于缓冲鼠标移到预览图上 */
    leaveBuffer?: number;
    /** 是否正在拖拽（拖拽时禁用） */
    isDragging?: boolean;
    /** 是否正在施法（施法时禁用） */
    isCasting?: boolean;
    /**
     * [2026-09-10 莉莉子] 抑制开关：为 true 时完全不弹卡牌大图（并关闭已弹的）。
     * 场景：鼠标停在卡牌关键词图标上检视关键词时，不要让卡牌大图跟着弹出来打架。
     */
    suppress?: boolean;
    /**
     * [2026-09-10 莉莉子] 保持选择器：鼠标停留在这些元素上时，大图不关闭。
     * 场景：鼠标移到卡牌大图身上、再落到大图上的武装图标时，大图应保持（便于逐个检视武装）。
     * 传 CSS 选择器，如 '[data-card-gaze-preview]'。
     */
    holdSelector?: string;
}

interface GazeEvents {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
}

/**
 * GazeTarget
 *
 * 复合状态——同时携带卡牌数据和物理矩形坐标。
 * 让消费方无需关心坐标来源，只管消费。
 */
interface GazeTarget<T extends CardData> {
    card: T;
    cardRect: DOMRect; // [修改] 存储卡牌真实的物理边框尺寸和位置
}

/**
 * useCardGaze
 *
 * 统一悬停预览防抖大脑。
 * 在「鼠标悬停达到阈值」时向外暴露 gazeTarget（包含卡牌 + 坐标），
 * 在「鼠标离开」或「拖拽/施法中」时清理。
 *
 * 使用方式：
 *   const { gazeTarget, gazeCard, bindGazeEvents, keepAlive, scheduleDismiss } = useCardGaze({ delay: 800, isDragging });
 *   <Card {...bindGazeEvents(cardData)} data={cardData} />
 *   <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} />
 */
export const useCardGaze = <T extends CardData>(config: UseCardGazeConfig = {}) => {
    const {
        delay = 500,
        leaveBuffer = 150,
        isDragging = false,
        isCasting = false,
        suppress = false,
        holdSelector,
    } = config;

    const [gazeTarget, setGazeTarget] = useState<GazeTarget<T> | null>(null);
    const enterTimerRef = useRef<number | null>(null);
    const leaveTimerRef = useRef<number | null>(null);
    const currentGazeRef = useRef<GazeTarget<T> | null>(null);
    const isGazingRef = useRef(false);
    // [2026-09-10] 保持监控开关：鼠标离开触发源后，改为持续检测是否停留在保持区内
    const holdingRef = useRef(false);
    const lastMouseRef = useRef<{ x: number; y: number } | null>(null); // 最后已知鼠标位置（兜底复核用）

    // 清理所有定时器
    const clearAllTimers = useCallback(() => {
        if (enterTimerRef.current) {
            clearTimeout(enterTimerRef.current);
            enterTimerRef.current = null;
        }
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
    }, []);

    // 强制关闭大图（拖拽/施法等外部状态变化时调用）
    const dismissGaze = useCallback(() => {
        clearAllTimers();
        setGazeTarget(null);
        currentGazeRef.current = null;
        isGazingRef.current = false;
        holdingRef.current = false; // [2026-09-10] 一并复位保持监控
    }, [clearAllTimers]);

    // 当 isDragging / isCasting / suppress 变化时自动关闭
    useEffect(() => {
        if (isDragging || isCasting || suppress) {
            dismissGaze();
        }
    }, [isDragging, isCasting, suppress, dismissGaze]);

    // 组件卸载时清理
    useEffect(() => {
        return () => clearAllTimers();
    }, [clearAllTimers]);

    // [2026-09-10 莉莉子] 鼠标是否位于「触发卡牌 ∪ 保持元素」区域内。
    // 触发卡牌用进入时抓到的 cardRect（即使鼠标已离开，矩形仍有效）；
    // 保持元素（如卡牌大图本体）实时查询 —— 它们随 gazeTarget 渲染/卸载。
    const inHoldRegion = useCallback((x: number, y: number): boolean => {
        const trig = currentGazeRef.current?.cardRect;
        if (trig && x >= trig.left && x <= trig.right && y >= trig.top && y <= trig.bottom) return true;
        if (holdSelector) {
            for (const el of Array.from(document.querySelectorAll(holdSelector))) {
                const r = el.getBoundingClientRect();
                if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
        }
        return false;
    }, [holdSelector]);

    // [2026-09-10 莉莉子] 保持监控：鼠标离开触发源后不再"到点即关"，
    // 改为持续看鼠标在不在保持区内 —— 移到大图上检视武装时不关闭，离开才关。
    useEffect(() => {
        if (!holdSelector) return;
        const onMove = (e: MouseEvent) => {
            lastMouseRef.current = { x: e.clientX, y: e.clientY };
            if (!holdingRef.current) return;
            if (inHoldRegion(e.clientX, e.clientY)) return; // 仍在保持区 → 继续显示
            // 真正离开了 → 关闭（同原 dismiss 语义）
            holdingRef.current = false;
            if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; }
            setGazeTarget(null);
            currentGazeRef.current = null;
            isGazingRef.current = false;
        };
        window.addEventListener('mousemove', onMove);
        return () => {
            window.removeEventListener('mousemove', onMove);
            holdingRef.current = false;
        };
    }, [holdSelector, inHoldRegion]);

    const bindGazeEvents = useCallback((card: T): GazeEvents => ({
        onMouseEnter: (e: React.MouseEvent) => {
            if (isDragging || isCasting || suppress) return;

            // [终极解法] 智能物理探针：兼顾"实体列表行"与"空气伪装盒"
            let cardRect: DOMRect;
            const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();

            // 如果当前触发事件的元素自身有物理体积（例如卡组列表的行 div）
            if (targetRect.width > 0 && targetRect.height > 0) {
                cardRect = targetRect;
            } else {
                // 如果是包裹了 display: contents 的空气外壳（例如战场卡牌），则向下穿透寻找实体
                const cardEl = document.querySelector(`[data-entity-id="${card.id}"]`);
                if (!cardEl) return;
                cardRect = cardEl.getBoundingClientRect();
            }

            // 如果已经有别的卡在展示，立刻切换，不需要等 delay
            if (isGazingRef.current && currentGazeRef.current?.card.key !== card.key) {
              // 🐛 修复：清除上一张卡残留的 leaveTimer
              if (leaveTimerRef.current) {
                  clearTimeout(leaveTimerRef.current);
                  leaveTimerRef.current = null;
              }
              setGazeTarget({ card, cardRect });
              currentGazeRef.current = { card, cardRect };
              // isGazingRef 保持不变 — 我们还在展示预览，只是换了一张卡
              return;
            }

            // 清除之前的 leave 定时器（防止鼠标刚离开又被叫回来时闪一下）
            if (leaveTimerRef.current) {
                clearTimeout(leaveTimerRef.current);
                leaveTimerRef.current = null;
                // 如果在 leave 缓冲期内重新进入，直接恢复
                if (isGazingRef.current && currentGazeRef.current?.card.key === card.key) {
                    return;
                }
            }

            currentGazeRef.current = { card, cardRect };

            // 启动进入延迟
            if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
            enterTimerRef.current = window.setTimeout(() => {
                setGazeTarget({ card, cardRect });
                isGazingRef.current = true;
                enterTimerRef.current = null;
            }, delay);
        },

        onMouseLeave: () => {
            // 取消未触发的进入定时器
            if (enterTimerRef.current) {
                clearTimeout(enterTimerRef.current);
                enterTimerRef.current = null;
                currentGazeRef.current = null;
                isGazingRef.current = false;
                // 如果还没展示就离开了，直接清掉
                if (!isGazingRef.current) {
                    setGazeTarget(null);
                    return;
                }
            }

            // [2026-09-10 莉莉子] 配了保持选择器 → 不再"到点即关"，转为持续检测：
            //   鼠标若停留在保持区（卡牌大图本体）内就继续保持，真正离开才关。
            if (holdSelector) {
                holdingRef.current = true;
                if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
                // 兜底定时器：鼠标离开后若"停住不动"（不再派发 mousemove），到点用最后已知坐标复核一次
                leaveTimerRef.current = window.setTimeout(() => {
                    leaveTimerRef.current = null;
                    const m = lastMouseRef.current;
                    if (holdingRef.current && m && inHoldRegion(m.x, m.y)) return; // 已停在保持区内 → 继续显示
                    holdingRef.current = false;
                    setGazeTarget(null);
                    currentGazeRef.current = null;
                    isGazingRef.current = false;
                }, leaveBuffer);
                return;
            }

            // 用 leaveBuffer 缓冲，让鼠标能移到预览图上
            if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = window.setTimeout(() => {
                setGazeTarget(null);
                currentGazeRef.current = null;
                isGazingRef.current = false;
                leaveTimerRef.current = null;
            }, leaveBuffer);
        },
    }), [isDragging, isCasting, suppress, delay, leaveBuffer, holdSelector, inHoldRegion]);

    // 鼠标进入预览图时阻止关闭（配合 FloatingCardPreview interactive 模式使用）
    const keepAlive = useCallback(() => {
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
    }, []);

    // 鼠标离开预览图时启动关闭缓冲
    const scheduleDismiss = useCallback(() => {
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = window.setTimeout(() => {
            setGazeTarget(null);
            currentGazeRef.current = null;
            isGazingRef.current = false;
            leaveTimerRef.current = null;
        }, leaveBuffer);
    }, [leaveBuffer]);

    return {
        gazeTarget,
        /** @deprecated 使用 gazeTarget 代替，此兼容属性后续移除 */
        gazeCard: gazeTarget?.card ?? null,
        bindGazeEvents,
        dismissGaze,
        keepAlive,
        scheduleDismiss,
    };
};
