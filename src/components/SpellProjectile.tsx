/**
 * SpellProjectile — 法术弹道飞行 + 命中爆炸 通用特效
 *
 * [修复] 旧版 Bug：fireAll() 在事件回调中同步执行，
 *   此时 React 还没重渲染 → ref=null → 直接跳过。
 *   新版：useEffect 状态机，确保 DOM 就绪。
 *
 * Skills 应用：
 *   - gsap-timeline: 弹道→爆炸→粒子序列
 *   - gsap-plugins: MotionPathPlugin
 *   - gsap-utils: gsap.utils.random()
 *   - gsap-performance: will-change
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { eventBus } from '../utils/eventBus';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

// ==========================================
// 常量
// ==========================================
export const ProjectileEvents = {
    START: 'SPELL_PROJECTILE_START',
    END: 'SPELL_PROJECTILE_END',
} as const;

const MISSILE_SIZE = 24;
const MISSILE_COLOR = '#ef4444';
const EXPLOSION_PARTICLES = 14;

interface TargetInfo {
    id: string;
}

// ==========================================
// 组件
// ==========================================
const SpellProjectile: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [pendingTargets, setPendingTargets] = useState<TargetInfo[]>([]);
    const [currentSpellKey, setCurrentSpellKey] = useState<string>('default'); // [新增] 保存当前法术的唯一标识

    const containerRef = useRef<HTMLDivElement>(null); // [核心修复 BUG 3] 引入相对坐标系容器
    const missileRef = useRef<HTMLDivElement>(null);
    const tailRefs = useRef<(HTMLDivElement | null)[]>([]); // [新增] 切片拖尾引用池
    const explosionRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef(false); // 防止重复发射

    // 事件监听
    useEffect(() => {
        const handleStart = (payload: { targets: TargetInfo[]; cardKey: string }) => {
            if (!payload?.targets?.length) return;
            if (activeRef.current) return; // 正在播动画，忽略新事件
            setPendingTargets(payload.targets);
            setCurrentSpellKey(payload.cardKey); // [新增] 提取并记忆这颗法球的“基因”
            setVisible(true);
        };

        eventBus.on(ProjectileEvents.START, handleStart);
        return () => { eventBus.off(ProjectileEvents.START, handleStart); };
    }, []);

    // ==========================================
    // 单发飞弹
    // ==========================================
    // [新增] 接收 spellKey 参数
    const fireAtTarget = useCallback((targetId: string, spellKey: string): Promise<void> => {
        return new Promise((resolve) => {
            const container = containerRef.current;
            const missileEl = missileRef.current;
            const explosionEl = explosionRef.current;
            const particlesEl = particlesRef.current;

            if (!container || !missileEl || !explosionEl || !particlesEl) {
                eventBus.emit(ProjectileEvents.END); // 兜底放行大脑
                resolve();
                return;
            }

            // [核心修复 BUG 3 & BUG 4] 利用容器边界系换算，彻底免疫 ScaleWrapper 带来的空间畸变！
            const getLocalCenter = (id: string) => {
                const el = document.querySelector(`[data-entity-id="${id}"]`);
                if (!el) return null;
                const elRect = el.getBoundingClientRect();
                const contRect = container.getBoundingClientRect();
                const scaleX = contRect.width / container.offsetWidth || 1;
                const scaleY = contRect.height / container.offsetHeight || 1;
                return {
                    x: ((elRect.left - contRect.left) + elRect.width / 2) / scaleX,
                    y: ((elRect.top - contRect.top) + elRect.height / 2) / scaleY,
                };
            };

            // [起点修复] 放弃写死的屏幕中心，精准追踪法术圆盘阵眼！(找不到则兜底中心)
            const startPos = getLocalCenter('spell-center') || { x: container.offsetWidth / 2, y: container.offsetHeight / 2 };

            // [终点修复] 精准追踪目标（包含带有伪 ID 的水晶）
            const targetPos = getLocalCenter(targetId);
            if (!targetPos) {
                console.warn(`[SpellProjectile] 目标实体丢失或脱离视口: ${targetId}，执行安全熔断。`);
                eventBus.emit(ProjectileEvents.END); // 立即通知大脑结算，防死锁
                resolve();
                return;
            }

            const sx = startPos.x;
            const sy = startPos.y;

            // [绝杀重构] 真实法线偏移贝塞尔曲线 (True Bezier with Normal Vector Offset)
            const dx = targetPos.x - sx;
            const dy = targetPos.y - sy;
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);

            // 解算法线向量 (Normal Vector)，确保控制点始终向曲线切线的侧面鼓起
            const nx = -dy / dist;
            const ny = dx / dist;

            // 沿着法线推开控制点，拉出充满张力的饱满侧方弧度
            const offset = dist * 0.2 + 60;
            const mx = sx + dx / 2 + nx * offset;
            const my = sy + dy / 2 + ny * offset;

            const pathStr = `M ${sx} ${sy} Q ${mx} ${my} ${targetPos.x} ${targetPos.y}`;

            const tailEls = tailRefs.current.filter(Boolean);
            gsap.set([missileEl, ...tailEls], { x: sx, y: sy, scale: 1, opacity: 1, rotation: 0 });
            gsap.set(explosionEl, { scale: 0, opacity: 0 });
            particlesEl.innerHTML = '';

            const tl = gsap.timeline({
                onComplete: () => {
                    if (particlesEl) particlesEl.innerHTML = '';
                    resolve();
                },
            });

            // ① 飞弹飞行
            tl.to(missileEl, { motionPath: { path: pathStr, curviness: 1.2, autoRotate: true }, duration: 0.4, ease: 'power1.inOut' }, 0);

            // [新增] 拖尾切片跟随
            tl.to(tailEls, {
                motionPath: { path: pathStr, curviness: 1.2, autoRotate: true },
                duration: 0.4,
                ease: 'power1.inOut',
                stagger: 0.012 // 每个切片依次延迟 12ms 出发，它们将自动排列成完美的弯曲弧线！
            }, 0);

            // ② 爆破瞬间 (无缝联动前台)
            tl.add(() => {
                // 1. 鸣枪通知大脑：法球已落地，可以放行伤害结算
                eventBus.emit(ProjectileEvents.END);

                // 2. [核心解耦] 引爆全新的受击特效层！精准传达靶子 ID 和法术基因
                eventBus.emit('VFX_IMPACT_TRIGGER', {
                    targetId: targetId,
                    impactType: spellKey
                });
            }, '+=0.02');

            tl.set(missileEl, { opacity: 0, scale: 0 }, '+=0');
            // 让跟随在身后的彗星尾巴极速收缩消散
            tl.to(tailEls, { opacity: 0, scale: 0, duration: 0.1 }, '-=0.05');

            tl.set(explosionEl, { x: targetPos.x - 40, y: targetPos.y - 40, scale: 0.2, opacity: 1 }, '+=0');

            // ③ 爆炸扩散
            tl.to(explosionEl, { scale: 2.5, opacity: 0, duration: 0.35, ease: 'power2.out' }, '+=0');

            // ④ 粒子发射
            // [核心修复] 同理，使用 tl.add 保证粒子引擎顺利起爆
            tl.add(() => {
                const colors = ['#ef4444', '#f97316', '#fbbf24', '#fca5a5', '#ffffff'];
                for (let i = 0; i < EXPLOSION_PARTICLES; i++) {
                    const angle = (Math.PI * 2 * i) / EXPLOSION_PARTICLES;
                    const dist = gsap.utils.random(35, 90);
                    const size = gsap.utils.random(2, 6, 1);
                    const color = colors[i % colors.length];

                    const p = document.createElement('div');
                    p.className = 'absolute rounded-full';
                    p.style.width = `${size}px`;
                    p.style.height = `${size}px`;
                    p.style.backgroundColor = color;
                    p.style.boxShadow = `0 0 ${size * 3}px ${color}`;
                    particlesEl.appendChild(p);

                    gsap.set(p, { x: targetPos.x - size / 2, y: targetPos.y - size / 2, scale: 1.2, opacity: 1 });
                    gsap.to(p, {
                        x: targetPos.x + Math.cos(angle) * dist - size / 2,
                        y: targetPos.y + Math.sin(angle) * dist - size / 2,
                        scale: 0, opacity: 0,
                        duration: gsap.utils.random(0.35, 0.6), ease: 'power3.out',
                    });
                }
            }, '+=0.05');

            // ⑤ [修复 BUG 6] 强行给时间轴续命 0.65 秒！等所有火花彻底燃尽，再卸载 DOM
            tl.to({}, { duration: 0.65 });
        });
    }, []);

    // ==========================================
    // useEffect 状态机：多重弹幕并发引擎
    // ==========================================
    useEffect(() => {
        if (!visible || pendingTargets.length === 0) return;
        if (activeRef.current) return;
        activeRef.current = true;

        const fireAll = async () => {
            // 支持 AOE 多重施法：目标越多，错开 0.15s 依次开火，极其华丽
            for (let i = 0; i < pendingTargets.length; i++) {
                const target = pendingTargets[i];
                if (i > 0) await new Promise(r => setTimeout(r, 150));

                // 不阻塞主循环，让每颗法球各自独立飞行并独立结算伤害！
                fireAtTarget(target.id, currentSpellKey); // [新增] 将提取到的法术基因注入弹匣
            }

            // [保护结界] 留出长达 1.5 秒的保底时间，确保最后一发法球的所有粒子彻底散去，再卸载这块玻璃
            await new Promise(r => setTimeout(r, 1500));

            activeRef.current = false;
            setVisible(false);
            setPendingTargets([]);
            // 注：不再需要在这里 emit END，因为已经在引爆的瞬间精准发送了！
        };

        const frame = requestAnimationFrame(() => { fireAll(); });
        return () => { cancelAnimationFrame(frame); };
    }, [visible, pendingTargets, fireAtTarget, currentSpellKey]); // [修改] 补充依赖以防止闭包陷阱

    if (!visible) return null;

    return (
        <div ref={containerRef} className="fixed inset-0 z-[95] pointer-events-none">
            {/* [绝杀重构] 5 段错帧切片拖尾：低成本，高收益 */}
            {[...Array(5)].map((_, i) => (
                <div
                    key={`tail-${i}`}
                    ref={el => tailRefs.current[i] = el}
                    className="absolute rounded-full"
                    style={{
                        width: 32 - i * 4, // 长度递减：32, 28, 24, 20, 16
                        height: 10 - i,    // 粗细递减：10, 9, 8, 7, 6
                        background: `linear-gradient(90deg, transparent, ${MISSILE_COLOR})`,
                        boxShadow: `0 0 ${8 - i}px ${MISSILE_COLOR}`,
                        opacity: 0,
                        willChange: 'transform, opacity',
                        transformOrigin: 'center center',
                        // 将每个切片的几何中心完全对齐到运动轨迹的计算点上
                        marginLeft: -(32 - i * 4) / 2,
                        marginTop: -(10 - i) / 2,
                    }}
                />
            ))}

            {/* 能量核心法球 (高光弹头) */}
            <div
                ref={missileRef}
                className="absolute rounded-full"
                style={{
                    width: MISSILE_SIZE,
                    height: MISSILE_SIZE,
                    background: `radial-gradient(circle at 35% 35%, #ffffff, #fca5a5 30%, ${MISSILE_COLOR})`,
                    boxShadow: `0 0 16px ${MISSILE_COLOR}, 0 0 32px ${MISSILE_COLOR}66`,
                    opacity: 0,
                    willChange: 'transform, opacity',
                    transformOrigin: 'center center',
                    marginLeft: -MISSILE_SIZE / 2,
                    marginTop: -MISSILE_SIZE / 2,
                }}
            />
            {/* 爆炸核心 */}
            <div
                ref={explosionRef}
                className="absolute rounded-full"
                style={{
                    width: 80,
                    height: 80,
                    background: 'radial-gradient(circle, rgba(255,255,200,1) 0%, rgba(255,150,50,0.9) 20%, rgba(239,68,68,0.5) 50%, transparent 70%)',
                    opacity: 0,
                    willChange: 'transform, opacity',
                }}
            />
            {/* 粒子容器 */}
            <div ref={particlesRef} className="absolute inset-0" />
        </div>
    );
};

export default SpellProjectile;
