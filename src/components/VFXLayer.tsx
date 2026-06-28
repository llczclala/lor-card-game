/**
 * VFXLayer — 法术瞄准连线 & 持久化连线 特效层
 *
 * [重构] SVG + GSAP 实现：
 *   - 连线"粗→细→粗"：3层路径叠加 + 箭头
 *   - 起点从法术图标实际位置延展
 *   - gsap.ticker 驱动鼠标预览线
 *
 * Skills 应用：
 *   - gsap-core: gsap.ticker
 *   - gsap-plugins: DrawSVGPlugin（确认目标连线动画）
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { eventBus } from '../utils/eventBus'; // [新增] 引入事件总线通信能力

gsap.registerPlugin(DrawSVGPlugin);

// ==========================================
// 类型定义
// ==========================================
export interface VFXTarget {
    id: string;
    type: 'ally' | 'enemy' | 'player_nexus' | 'enemy_nexus' | string;
}

export interface PersistentLine {
    sourceId: string;
    targets: VFXTarget[];
}

interface VFXLayerProps {
    isCasting: boolean;
    showMousePreview?: boolean; // [新增] 控制鼠标射线的显隐
    selectedTargets: VFXTarget[];
    persistentLines?: PersistentLine[];
    castingSpellRef?: React.RefObject<HTMLElement>; // [核心修改] 接收真实 DOM 引用
}

// ==========================================
// 颜色配置
// ==========================================
const COLORS = {
    ally: '#3b82f6',
    enemy: '#ef4444',
    nexus: '#fbbf24',
    preview: '#ffffff',
};

const getLineColor = (type: string): string => {
    if (type.includes('enemy')) return COLORS.enemy;
    if (type.includes('ally') || type.includes('player')) return COLORS.ally;
    if (type.includes('nexus')) return COLORS.nexus;
    return COLORS.preview;
};

// ==========================================
// 工具函数：数学与几何引擎
// ==========================================
// 1. 基础骨架路径 (供中心高光和 DrawSVG 描边使用)
const buildCenterPath = (from: { x: number; y: number }, to: { x: number; y: number }): string => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const offset = Math.min(dist * 0.3, 200);
    // [修复1] 彻底移除 radius 偏移，起点精准归位到圆盘正中心
    return `M ${from.x} ${from.y} Q ${midX} ${midY - offset} ${to.x} ${to.y}`;
};

// 2. 动态宽度多边形生成 (实现"粗-细-粗"流光外壳)
const buildDynamicWidthPath = (from: { x: number; y: number }, to: { x: number; y: number }, scale: number = 1, dynamicStartWidth: number = 30): string => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const offset = Math.min(dist * 0.3, 200);
    const ctrlX = midX;
    const ctrlY = midY - offset;

    const STEPS = 40; // 提高采样精度以获得更丝滑的曲线
    const leftPoints = [];
    const rightPoints = [];

    // [修复3] 巨型箭头参数 (受层级 scale 影响，产生完美包裹的三层嵌套效果)
    const ARROW_LENGTH = 45 * scale;
    const ARROW_WIDTH = 25 * scale;

    // 预解算终点处的切线方向，用于构建完美的垂直箭头底座
    const endDx = to.x - ctrlX;
    const endDy = to.y - ctrlY;
    const endLen = Math.max(Math.sqrt(endDx * endDx + endDy * endDy), 0.001);
    const endDirX = endDx / endLen;
    const endDirY = endDy / endLen;
    const endNormalX = -endDirY;
    const endNormalY = endDirX;

    const arrowBaseCenterX = to.x - endDirX * ARROW_LENGTH;
    const arrowBaseCenterY = to.y - endDirY * ARROW_LENGTH;

    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const u = 1 - t;
        const px = u * u * from.x + 2 * u * t * ctrlX + t * t * to.x;
        const py = u * u * from.y + 2 * u * t * ctrlY + t * t * to.y;

        // 一旦延伸进了大箭头的领域，立刻停止生成能量束面，为箭头底座让出空间
        const distFromEnd = Math.sqrt((to.x - px) * (to.x - px) + (to.y - py) * (to.y - py));
        if (distFromEnd < ARROW_LENGTH && i < STEPS) {
            continue;
        }

        const dpx = 2 * u * (ctrlX - from.x) + 2 * t * (to.x - ctrlX);
        const dpy = 2 * u * (ctrlY - from.y) + 2 * t * (to.y - ctrlY);
        const len = Math.max(Math.sqrt(dpx * dpx + dpy * dpy), 0.001);
        const nx = -dpy / len;
        const ny = dpx / len;

        // [修复2] 重写宽幅函数：饱满的能量流动感
        let width;
        if (t < 0.25) {
            const progress = t / 0.25;
            width = dynamicStartWidth - (dynamicStartWidth - 8) * Math.pow(progress, 1.2); // 起点根据实体大小动态涌出
        } else {
            const progress = (t - 0.25) / 0.75;
            width = 8 + (15 - 8) * Math.pow(progress, 2); // 中间流动(保底8px不至于断裂)，平滑加粗至箭头底座(15px)
        }
        const w = width * scale;

        leftPoints.push(`${px + nx * w},${py + ny * w}`);
        rightPoints.unshift(`${px - nx * w},${py - ny * w}`);
    }

    // 将大箭头的左翼、顶点、右翼连续拼接进去
    const arrowCornerLeftX = arrowBaseCenterX + endNormalX * ARROW_WIDTH;
    const arrowCornerLeftY = arrowBaseCenterY + endNormalY * ARROW_WIDTH;
    const arrowCornerRightX = arrowBaseCenterX - endNormalX * ARROW_WIDTH;
    const arrowCornerRightY = arrowBaseCenterY - endNormalY * ARROW_WIDTH;

    leftPoints.push(`${arrowCornerLeftX},${arrowCornerLeftY}`);
    leftPoints.push(`${to.x},${to.y}`);
    rightPoints.unshift(`${arrowCornerRightX},${arrowCornerRightY}`);

    return `M ${leftPoints.join(' L ')} L ${rightPoints.join(' L ')} Z`;
};

// [核心魔法] SVG 缩放坐标系逆转换：把真实的物理坐标，转换回不受 ScaleWrapper 影响的 SVG 内部坐标！
const getLocalPos = (svg: SVGSVGElement | null, clientX: number, clientY: number) => {
    if (!svg) return { x: clientX, y: clientY };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: clientX, y: clientY };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
};

// 重构元素中心点获取逻辑，支持传入 DOM 节点或 ID，并挂载逆转换
const getElementCenter = (elOrId: string | HTMLElement | null, svg: SVGSVGElement | null): { x: number; y: number } | null => {
    if (!svg || !elOrId) return null;
    const el = typeof elOrId === 'string' ? document.querySelector(`[data-entity-id="${elOrId}"]`) : elOrId;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return getLocalPos(svg, rect.left + rect.width / 2, rect.top + rect.height / 2);
};

// [核心新增] 获取元素的顶部偏下位置（距顶部 15%）。专门作为基座等卡牌的“炮口”，完美避开中心立绘遮挡！
const getElementTopCenter = (elOrId: string | HTMLElement | null, svg: SVGSVGElement | null): { x: number; y: number } | null => {
    if (!svg || !elOrId) return null;
    const el = typeof elOrId === 'string' ? document.querySelector(`[data-entity-id="${elOrId}"]`) : elOrId;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // X轴依然在正中间，Y轴上移至距顶部 15% 的位置
    return getLocalPos(svg, rect.left + rect.width / 2, rect.top + rect.height * 0.15);
};

// ==========================================
// 主组件
// ==========================================
export const VFXLayer: React.FC<VFXLayerProps> = ({
    isCasting,
    showMousePreview = false, // [新增]
    selectedTargets = [],
    persistentLines = [],
    castingSpellRef,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const previewL1Ref = useRef<SVGPathElement>(null);
    const previewL2Ref = useRef<SVGPathElement>(null);
    const previewL3Ref = useRef<SVGPathElement>(null);
    const mousePosRef = useRef({ x: 0, y: 0 });
    const centerRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const prevTargetCountRef = useRef(0);

    // ==========================================
    // [新增] 临时瞄准线雷达 (用于回合结束或技能锁定预演)
    // ==========================================
    const [tempLines, setTempLines] = useState<PersistentLine[]>([]);

    useEffect(() => {
        const handleShowTempLines = (payload: PersistentLine[]) => setTempLines(payload);
        const handleHideTempLines = () => setTempLines([]);

        eventBus.on('SHOW_TEMP_LINES', handleShowTempLines);
        eventBus.on('HIDE_TEMP_LINES', handleHideTempLines);

        return () => {
            eventBus.off('SHOW_TEMP_LINES', handleShowTempLines);
            eventBus.off('HIDE_TEMP_LINES', handleHideTempLines);
        };
    }, []);

    // 屏幕中心 fallback
    useEffect(() => {
        const updateCenter = () => {
            centerRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        };
        window.addEventListener('resize', updateCenter);
        return () => window.removeEventListener('resize', updateCenter);
    }, []);

    // 鼠标跟踪
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', onMouseMove);
        return () => window.removeEventListener('mousemove', onMouseMove);
    }, []);

    // [新增] 强制二刷机制：确保 SVG 节点挂载后，利用其执行 CTM 矩阵逆转以定位卡牌
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    // ==========================================
    // 起点位置（法术图标引用 优先 → 屏幕中心转换）
    // ==========================================
    const getStartPos = useCallback((): { x: number; y: number } => {
        if (castingSpellRef?.current && svgRef.current) {
            const spellPos = getElementCenter(castingSpellRef.current, svgRef.current);
            if (spellPos) return spellPos;
        }
        // 兜底中心点也必须经过逆转！
        return getLocalPos(svgRef.current, centerRef.current.x, centerRef.current.y);
    }, [castingSpellRef]);

    // ==========================================
    // 预览线：gsap.ticker（与 GSAP 同频）
    // ==========================================
    useEffect(() => {
        // [核心修复] 不再依赖 isCasting，而是严格遵循 showMousePreview
        if (!showMousePreview) return;

        const updatePreview = () => {
            const l1 = previewL1Ref.current;
            const l2 = previewL2Ref.current;
            const l3 = previewL3Ref.current;
            // [核心修复] 彻底删除对 arrow 的检测，因为巨型箭头已融入多边形！
            if (!l1 || !l2 || !l3) return;

            const start = getStartPos();
            // [核心修复] 物理鼠标坐标也必须经过逆向映射，彻底消除偏移！
            const to = getLocalPos(svgRef.current, mousePosRef.current.x, mousePosRef.current.y);

            // 1. 获取 3 种形态的几何属性
            // [外层光晕] 粗体光晕多边形面
            const shapeL1 = buildDynamicWidthPath(start, to, 1.8);
            // [中层能量] 适中多边形面
            const shapeL2 = buildDynamicWidthPath(start, to, 0.8);
            // [核心高光] 保留极细单线，维持中央锐度
            const centerPath = buildCenterPath(start, to);

            // 同步物理帧渲染 (此时 shapeL1 和 shapeL2 的尾端已经自带巨大箭头了！)
            l1.setAttribute('d', shapeL1);
            l2.setAttribute('d', shapeL2);
            l3.setAttribute('d', centerPath);
        };

        gsap.ticker.add(updatePreview);
        return () => { gsap.ticker.remove(updatePreview); };
    }, [isCasting, getStartPos]);

    // ==========================================
    // DrawSVG 入场动画
    // ==========================================
    useEffect(() => {
        if (selectedTargets.length <= prevTargetCountRef.current) return;
        prevTargetCountRef.current = selectedTargets.length;

        const newIdx = selectedTargets.length - 1;
        const key = `core-s-${newIdx}`;

        requestAnimationFrame(() => {
            const svg = svgRef.current;
            if (!svg) return;
            const pathEl = svg.querySelector(`[data-ds="${key}"]`) as SVGPathElement | null;
            if (pathEl) {
                gsap.fromTo(pathEl,
                    { drawSVG: '0% 0%' },
                    { drawSVG: '0% 100%', duration: 0.3, ease: 'power2.out' }
                );
            }
        });
    }, [selectedTargets.length]);

    // ==========================================
    // 渲染单条连线 — 基于几何生成的 3层实体
    // ==========================================
    const renderLine = useCallback(
        (from: { x: number; y: number }, to: { x: number; y: number }, color: string, isActive: boolean, idx: string, sourceId?: string) => {

            // [防穿帮雷达] 实时获取起点卡牌的物理半径作为光束口径
            let startRadius = 30; // 默认口径
            if (sourceId) {
                const sourceEl = document.querySelector(`[data-entity-id="${sourceId}"]`);
                if (sourceEl) {
                    startRadius = (sourceEl.getBoundingClientRect().width / 2) * 0.55; // 0.55 比例完美嵌在圆环内圈
                }
            }

            // [核心修复] 获取几何体数据包，注入自适应口径
            const shapeL1 = buildDynamicWidthPath(from, to, 1.8, startRadius);
            const shapeL2 = buildDynamicWidthPath(from, to, 0.8, startRadius);
            const centerPath = buildCenterPath(from, to);

            // [性能优化] 清除已废弃的 ctrlPt 独立控制点计算，降低每帧性能损耗

            return (
                <g key={`line-${idx}`}>
                    {/* L1. 外层光晕 (改为封闭面填充) */}
                    <path d={shapeL1} fill={color} stroke="none" opacity={isActive ? 0.2 : 0.3} />

                    {/* L2. 中层能量 (改为封闭面填充) */}
                    <path d={shapeL2} fill={isActive ? '#ffffff' : color} stroke="none" opacity={isActive ? 0.7 : 0.5} />

                    {/* L3. 核心层 — 细描边路径，保留 data-ds 供 DrawSVG 定位以实现入场动画 */}
                    <path data-ds={`core-${idx}`}
                        d={centerPath} fill="none"
                        stroke={isActive ? '#ffffff' : color}
                        strokeWidth={isActive ? 1.5 : 2}
                        strokeLinecap="round"
                        opacity={isActive ? 1 : 0.85} />
                </g>
            );
        },
        [],
    );

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-[90]"
            style={{ overflow: 'visible' }}
        >
            {/* A. 持久化连线 & 临时瞄准线 */}
            {/* [核心修复] 将系统下发的临时红线与常驻连线合并渲染！ */}
            {isMounted && [...persistentLines, ...tempLines].map((line, li) => {
                // [视觉重构] 起点改用 TopCenter（炮口算法），彻底解决红线糊脸遮挡卡面的问题！
                const sourcePos = getElementTopCenter(line.sourceId, svgRef.current);
                if (!sourcePos) return null;
                return (
                    <g key={`persistent-${li}`}>
                        {line.targets.map((target, ti) => {
                            // 终点依然打向敌方中心
                            const targetPos = getElementCenter(target.id, svgRef.current);
                            if (!targetPos) return null;
                            // 传入 sourceId，开启动态口径测算！
                            return renderLine(sourcePos, targetPos, getLineColor(target.type), false, `p-${li}-${ti}`, line.sourceId);
                        })}
                    </g>
                );
            })}

            {/* B. 施法中已确认目标连线 */}
            {isMounted && isCasting && selectedTargets.map((target, i) => {
                const targetPos = target.id ? getElementCenter(target.id, svgRef.current) : null;
                const startPos = getStartPos();
                if (!targetPos) return null;
                return (
                    <g key={`selected-${i}`}>
                        {/* [核心修复 BUG 2] 将 isActive 设为 false，剥离纯白高光，彻底释放阵营颜色！ */}
                        {/* 施法确认期，起点就是施法圆盘，使用预设口径即可，传空 */}
                        {renderLine(startPos, targetPos, getLineColor(target.type), false, `s-${i}`)}
                    </g>
                );
            })}

            {/* C. 鼠标预览线 (采用全程序化生成的连续流光形体) */}
            {/* [核心修复 BUG 1] 使用精确开关控制 */}
            {showMousePreview && (
                <g>
                    {/* L1. 外层光晕 (自带外圈巨型箭头) */}
                    <path ref={previewL1Ref} fill={COLORS.preview} stroke="none" opacity={0.2} />
                    {/* L2. 中层能量 (自带内圈巨型箭头) */}
                    <path ref={previewL2Ref} fill="#ffffff" stroke="none" opacity={0.7} />
                    {/* L3. 核心高光 (保持描边，增加尖锐破风感，直达箭尖) */}
                    <path ref={previewL3Ref} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" opacity={1} />
                </g>
            )}
        </svg>
    );
};
