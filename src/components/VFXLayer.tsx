import React, { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';

// 定义目标数据结构
export interface VFXTarget {
    id: string;
    type: 'ally' | 'enemy' | 'player_nexus' | 'enemy_nexus' | string;
}

interface VFXLayerProps {
    isCasting: boolean;
    selectedTargets: VFXTarget[];
}

// 颜色常量 (Hex)
const COLORS = {
    white: 0xffffff,
    blue: 0x3b82f6,
    red: 0xef4444
};

export const VFXLayer: React.FC<VFXLayerProps> = ({ isCasting, selectedTargets = [] }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);

    // 使用 Ref 存储最新的 props 数据，以便在 Pixi Ticker (动画循环) 中直接访问
    // 这样可以避免每次 props 变化都重建 Pixi 应用
    const targetsRef = useRef(selectedTargets);
    useEffect(() => { targetsRef.current = selectedTargets; }, [selectedTargets]);

    // --- 核心绘制逻辑 (脱离 React 渲染周期) ---
    useEffect(() => {
        // 只有当正在施法且容器存在时才初始化
        if (!isCasting || !containerRef.current) return;

        // 1. 初始化 Pixi 应用
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const app = new PIXI.Application({
            width,
            height,
            backgroundAlpha: 0, // 透明背景
            antialias: true,    // 抗锯齿
            autoDensity: true,
            resolution: window.devicePixelRatio || 1,
        });

        // 挂载 Canvas 到 DOM
        containerRef.current.appendChild(app.view as HTMLCanvasElement);
        appRef.current = app;

        // 2. 创建绘图容器
        const g = new PIXI.Graphics();
        // 添加 GPU 加速的高斯模糊滤镜 (替代 SVG 的 filter)
        g.filters = [new PIXI.BlurFilter(0.5)];
        app.stage.addChild(g);

        // 3. 鼠标追踪系统 (原生 DOM 事件，不触发 React 重绘)
        let mousePos = { x: width / 2, y: height / 2 };
        const centerPos = { x: width / 2, y: height / 2 }; // 屏幕中心

        // 坐标转换辅助函数
        const toLocalCoords = (clientX: number, clientY: number) => {
            if (!containerRef.current) return { x: 0, y: 0 };
            const rect = containerRef.current.getBoundingClientRect();
            // 处理 ScaleWrapper 的缩放
            const scaleX = rect.width / width;
            const scaleY = rect.height / height;
            return {
                x: (clientX - rect.left) / (scaleX || 1),
                y: (clientY - rect.top) / (scaleY || 1)
            };
        };

        const onMouseMove = (e: MouseEvent) => {
            mousePos = toLocalCoords(e.clientX, e.clientY);
        };
        window.addEventListener('mousemove', onMouseMove);

        // 4. 获取元素中心点辅助函数
        const getElementCenter = (id: string) => {
            const el = document.querySelector(`[data-entity-id="${id}"]`);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            return toLocalCoords(centerX, centerY);
        };

        const getTargetColor = (type: string) => {
            if (type.includes('enemy')) return COLORS.red;
            if (type.includes('ally') || type.includes('player')) return COLORS.blue;
            return COLORS.white;
        };

        // --- 绘图辅助函数：画单个箭头 ---
        const drawArrow = (start: {x:number, y:number}, end: {x:number, y:number}, color: number, isActive: boolean) => {
            // 计算贝塞尔曲线控制点
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const offset = Math.min(dist * 0.3, 200);
            const controlX = midX;
            const controlY = midY - offset;

            // A. 绘制光晕层 (宽、半透明)
            g.lineStyle({
                width: 14,
                color: color,
                alpha: isActive ? 0.3 : 0.4,
                join: PIXI.LINE_JOIN.ROUND,
                cap: PIXI.LINE_CAP.ROUND,
            });
            g.moveTo(start.x, start.y);
            g.quadraticCurveTo(controlX, controlY, end.x, end.y);

            // B. 绘制核心层 (细、高亮)
            g.lineStyle({
                width: 4,
                color: isActive ? COLORS.white : color,
                alpha: 1,
                join: PIXI.LINE_JOIN.ROUND,
                cap: PIXI.LINE_CAP.ROUND,
            });
            g.moveTo(start.x, start.y);
            g.quadraticCurveTo(controlX, controlY, end.x, end.y);

            // C. 绘制箭头头部
            const angle = Math.atan2(end.y - controlY, end.x - controlX);
            const headSize = 14;

            g.beginFill(isActive ? COLORS.white : color);
            g.lineStyle(0);

            const tipX = end.x;
            const tipY = end.y;
            const leftX = end.x - headSize * Math.cos(angle - Math.PI / 6);
            const leftY = end.y - headSize * Math.sin(angle - Math.PI / 6);
            const rightX = end.x - headSize * Math.cos(angle + Math.PI / 6);
            const rightY = end.y - headSize * Math.sin(angle + Math.PI / 6);

            g.moveTo(tipX, tipY);
            g.lineTo(leftX, leftY);
            g.lineTo(rightX, rightY);
            g.lineTo(tipX, tipY);
            g.endFill();
        };

        // 5. 启动渲染循环 (Game Loop)
        // Pixi Ticker 会自动以 60FPS 运行，这是流畅动画的关键
        app.ticker.add(() => {
            g.clear();

            // 绘制已锁定的箭头
            targetsRef.current.forEach(target => {
                const endPos = getElementCenter(target.id);
                if (endPos) {
                    const color = getTargetColor(target.type);
                    drawArrow(centerPos, endPos, color, false);
                }
            });

            // 绘制当前的搜索箭头
            drawArrow(centerPos, mousePos, COLORS.white, true);
        });

        // 清理函数
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            app.destroy(true, { children: true }); // 销毁 Pixi 应用，释放显存
            appRef.current = null;
        };
    }, [isCasting]); // 仅当施法状态切换时触发

    // 如果不在施法状态，不渲染 DOM 节点，完全移除开销
    if (!isCasting) return null;

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-[90] pointer-events-none w-full h-full"
        />
    );
};