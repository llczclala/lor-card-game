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
import React, { useEffect, useRef, useCallback } from 'react';
import { eventBus, StrikeEvents, GameEvents } from '../utils/eventBus'; // [修改] 补充 GameEvents 用于音频
import { EFFECT_IMAGES } from '../data/imageData'; // [新增] 引入专属全息贴图
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

// ==========================================
// 常量与数据协议
// ==========================================
const MISSILE_SIZE = 24;
const MISSILE_COLOR = '#ef4444';
const EXPLOSION_PARTICLES = 14;
const MAX_POOL_SIZE = 15; // [新增] 常驻对象池大小，足以支撑满屏弹幕！

export interface StrikeBullet {
    targetId: string;
    damage: number;
    barrierPopped: boolean;
}

export interface StrikeCommandPayload {
    sourceId: string;
    bullets: StrikeBullet[];
    preDelay?: number;
    interval?: number;
    spellKey?: string;
}

// ==========================================
// 组件：常驻武器库
// ==========================================
const SpellProjectile: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const missileRefs = useRef<(HTMLDivElement | null)[]>([]);
    const tailRefsGroup = useRef<(HTMLDivElement | null)[][]>([]);
    const explosionRefs = useRef<(HTMLDivElement | null)[]>([]);
    const particlesRefs = useRef<(HTMLDivElement | null)[]>([]);

    // [新增] 弹药管理队列与状态机
    const queueRef = useRef<StrikeCommandPayload[]>([]);
    const activeRef = useRef(false); // 表示是否正在消耗队列
    const poolIndexRef = useRef(0);  // 当前使用的 DOM 对象池游标
    const flightPromisesRef = useRef<Promise<void>[]>([]); // 追踪所有在空中的法球

    // ==========================================
    // 单发飞弹 (纯视觉动画执行)
    // ==========================================
    const fireAtTarget = useCallback((bullet: StrikeBullet, cmd: StrikeCommandPayload, idx: number): Promise<void> => {
        return new Promise((resolve) => {
            const container = containerRef.current;
            const missileEl = missileRefs.current[idx];
            const explosionEl = explosionRefs.current[idx];
            const particlesEl = particlesRefs.current[idx];
            const tailEls = (tailRefsGroup.current[idx] || []).filter(Boolean);

            if (!container || !missileEl || !explosionEl || !particlesEl) {
                resolve(); // 兜底直接结束 (不再需要手动解除大元帅的锁定，因为由 COMPLETE 统一管理)
                return;
            }

            const targetId = bullet.targetId;
            const spellKey = cmd.spellKey || 'default';
            const sourceId = cmd.sourceId;

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
            const startPos = (sourceId ? getLocalCenter(sourceId) : null)
                          || getLocalCenter('spell-center')
                          || { x: container.offsetWidth / 2, y: container.offsetHeight / 2 };

            // [终点修复] 精准追踪目标（包含带有伪 ID 的水晶）
            const targetPos = getLocalCenter(targetId);
            if (!targetPos) {
                console.warn(`[SpellProjectile] 目标实体丢失或脱离视口: ${targetId}，执行安全熔断。`);
                resolve();
                return;
            }

            const sx = startPos.x;
            const sy = startPos.y;

            // ==========================================
            // [核心] 基因提纯与对象池样式分派
            // ==========================================
            const isMauxirPedestal = spellKey === 'mauxir_lotus_pedestal';
            let pathStr = '';

            if (isMauxirPedestal) {
                // 1. 基座模式：极速直线激光
                pathStr = `M ${sx} ${sy} L ${targetPos.x} ${targetPos.y}`;

                // [修复] 修正负边距：100px 的贴图，必须使用 -50px 才能将几何中心精准锁在物理轨迹线上！
                missileEl.style.background = `url(${EFFECT_IMAGES.mauxirRushAttack}) center/contain no-repeat`;
                missileEl.style.boxShadow = 'none';
                missileEl.style.width = '100px';
                missileEl.style.height = '100px';
                missileEl.style.marginLeft = '-50px';
                missileEl.style.marginTop = '-50px';
                missileEl.style.borderRadius = '0';

                // [修复] 蓝紫色系拖尾：大幅进行等比扩张，并重写高能发光阴影，以完美咬合 100px 的巨型弹头！
                tailEls.forEach((el, i) => {
                    const color = ['#8B5CF6', '#6366F1', '#4F46E5', '#7C3AED', '#6D28D9'][i % 5];
                    el.style.background = `linear-gradient(90deg, transparent, ${color})`;
                    el.style.boxShadow = `0 0 ${20 - i * 2}px ${color}`;

                    // 随着粒子序列递减宽度与粗细
                    const tailW = 80 - i * 10;
                    const tailH = 26 - i * 3;
                    el.style.width = `${tailW}px`;
                    el.style.height = `${tailH}px`;
                    el.style.marginLeft = `-${tailW / 2}px`;
                    el.style.marginTop = `-${tailH / 2}px`;
                });

                // 蓝紫色系爆炸核心
                explosionEl.style.background = 'radial-gradient(circle, rgba(139,92,246,1) 0%, rgba(99,102,241,0.9) 20%, rgba(79,70,229,0.5) 50%, transparent 70%)';

                // 发射瞬间：基座专属开火音效
                eventBus.emit(GameEvents.SFX_MAUXIR_RUSH_ATTACK);
            } else {
                // 2. 默认模式：[绝对防御] 必须在对象池复用时，将拖尾的物理高宽与边距一并重置还原！
                const dx = targetPos.x - sx;
                const dy = targetPos.y - sy;
                const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
                const nx = -dy / dist;
                const ny = dx / dist;
                const offset = dist * 0.2 + 60;
                const mx = sx + dx / 2 + nx * offset;
                const my = sy + dy / 2 + ny * offset;

                pathStr = `M ${sx} ${sy} Q ${mx} ${my} ${targetPos.x} ${targetPos.y}`;

                missileEl.style.background = `radial-gradient(circle at 35% 35%, #ffffff, #fca5a5 30%, ${MISSILE_COLOR})`;
                missileEl.style.boxShadow = `0 0 16px ${MISSILE_COLOR}, 0 0 32px ${MISSILE_COLOR}66`;
                missileEl.style.width = `${MISSILE_SIZE}px`;
                missileEl.style.height = `${MISSILE_SIZE}px`;
                missileEl.style.marginLeft = `-${MISSILE_SIZE / 2}px`;
                missileEl.style.marginTop = `-${MISSILE_SIZE / 2}px`;
                missileEl.style.borderRadius = '50%';

                tailEls.forEach((el, i) => {
                    el.style.background = `linear-gradient(90deg, transparent, ${MISSILE_COLOR})`;
                    el.style.boxShadow = `0 0 ${8 - i}px ${MISSILE_COLOR}`;

                    // 还原常规火球的迷你拖尾尺寸
                    const defaultW = 32 - i * 4;
                    const defaultH = 10 - i;
                    el.style.width = `${defaultW}px`;
                    el.style.height = `${defaultH}px`;
                    el.style.marginLeft = `-${defaultW / 2}px`;
                    el.style.marginTop = `-${defaultH / 2}px`;
                });

                explosionEl.style.background = 'radial-gradient(circle, rgba(255,255,200,1) 0%, rgba(255,150,50,0.9) 20%, rgba(239,68,68,0.5) 50%, transparent 70%)';
            }

            gsap.set([missileEl, ...tailEls], { x: sx, y: sy, scale: 1, opacity: 1, rotation: 0 });
            gsap.set(explosionEl, { scale: 0, opacity: 0 });
            particlesEl.innerHTML = '';

            const tl = gsap.timeline({
                onComplete: () => {
                    if (particlesEl) particlesEl.innerHTML = '';
                    resolve();
                },
            });

            // 动态配置飞行参数
            const flightDuration = isMauxirPedestal ? 0.35 : 0.4;

            // [核心修复] 基座的贴图原生是朝上的(⬆️)，而 GSAP 的 0 度是朝右(➡️)。
            // 因此飞弹需要 +90 度的自动旋转补偿量，才能正确把“弹头”对准敌人。
            // 而对于默认的圆形火球，填 true 即可。
            const missileAutoRotate = isMauxirPedestal ? 90 : true;

            // ① 飞弹飞行
            tl.to(missileEl, { motionPath: { path: pathStr, curviness: 1.2, autoRotate: missileAutoRotate }, duration: flightDuration, ease: 'power1.inOut' }, 0);

            // [核心修复] 拖尾切片跟随
            tl.to(tailEls, {
                // 拖尾原生是水平绘制的，必须强制设为 true，让它自动旋转移位去贴合飞行路径！
                motionPath: { path: pathStr, curviness: 1.2, autoRotate: true },
                duration: flightDuration,
                ease: 'power1.inOut',
                stagger: 0.012 // 每个切片依次延迟 12ms 出发，它们将自动排列成完美的拖尾痕迹
            }, 0);

            // ② 爆破瞬间 (无缝联动前台)
            tl.add(() => {
                // 专属命中音效
                if (isMauxirPedestal) {
                    eventBus.emit(GameEvents.SFX_MAUXIR_RUSH_HIT);
                }

                // 1. [核心替换] 鸣枪通知大脑：法球已砸中！并把包裹（伤害、破盾信息）原封不动还给扣血系统
                eventBus.emit(StrikeEvents.HIT, { bullet, sourceId });

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
                const colors = isMauxirPedestal
                    ? ['#8B5CF6', '#6366F1', '#4F46E5', '#A78BFA', '#C4B5FD']
                    : ['#ef4444', '#f97316', '#fbbf24', '#fca5a5', '#ffffff'];

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
    // 异步状态机：队列循环消耗引擎
    // ==========================================
    const processQueue = async () => {
        if (activeRef.current) return;
        activeRef.current = true;

        while (queueRef.current.length > 0) {
            const cmd = queueRef.current.shift()!;

            // 压迫感停顿 (划线与射击间的间隔)
            if (cmd.preDelay) await new Promise(r => setTimeout(r, cmd.preDelay));

            for (const bullet of cmd.bullets) {
                // 从对象池获取一个可用的 DOM 索引
                const idx = poolIndexRef.current;
                poolIndexRef.current = (poolIndexRef.current + 1) % MAX_POOL_SIZE;

                // 开火！(异步非阻塞推进)
                const flight = fireAtTarget(bullet, cmd, idx);
                flightPromisesRef.current.push(flight);

                // 飞行完毕后清理 promise 避免内存泄漏
                flight.then(() => {
                    flightPromisesRef.current = flightPromisesRef.current.filter(p => p !== flight);
                });

                // 制造连发后座力停顿 (默认 100ms)
                await new Promise(r => setTimeout(r, cmd.interval ?? 100));
            }
        }

        // 当队列彻底清空，必须等待空中所有剩余的法球爆炸并彻底散去粒子 (0.65s)
        await Promise.all(flightPromisesRef.current);

        // 鸣金收兵，发送完成信号，解除大元帅的战管锁定！
        eventBus.emit(StrikeEvents.COMPLETE, {});
        activeRef.current = false;
    };

    // 监听打击指令
    useEffect(() => {
        const handleCommand = (payload: StrikeCommandPayload) => {
            if (!payload?.bullets?.length) return;
            queueRef.current.push(payload);
            processQueue(); // 尝试点火
        };

        eventBus.on(StrikeEvents.COMMAND, handleCommand);
        return () => { eventBus.off(StrikeEvents.COMMAND, handleCommand); };
    }, [fireAtTarget]);

    // [核心重构] 移除 visible 拦截！让包含 15 发实体子弹的对象池永远挂载，杜绝隐形 BUG
    return (
        <div ref={containerRef} className="fixed inset-0 z-[95] pointer-events-none" style={{ display: 'block' }}>
            {[...Array(MAX_POOL_SIZE)].map((_, idx) => (
                <React.Fragment key={`proj-pool-${idx}`}>
                    {/* [绝杀重构] 5 段错帧切片拖尾：低成本，高收益 */}
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={`tail-${idx}-${i}`}
                            ref={el => {
                                if (!tailRefsGroup.current[idx]) tailRefsGroup.current[idx] = [];
                                tailRefsGroup.current[idx][i] = el;
                            }}
                            className="absolute rounded-full"
                            style={{
                                width: 32 - i * 4, // 长度递减：32, 28, 24, 20, 16
                                height: 10 - i,    // 粗细递减：10, 9, 8, 7, 6
                                background: `linear-gradient(90deg, transparent, ${MISSILE_COLOR})`,
                                boxShadow: `0 0 ${8 - i}px ${MISSILE_COLOR}`,
                                opacity: 0,
                                willChange: 'transform, opacity',
                                transformOrigin: 'center center',
                                marginLeft: -(32 - i * 4) / 2,
                                marginTop: -(10 - i) / 2,
                            }}
                        />
                    ))}

                    {/* 能量核心法球 (高光弹头) */}
                    <div
                        ref={el => missileRefs.current[idx] = el}
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
                        ref={el => explosionRefs.current[idx] = el}
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
                    <div ref={el => particlesRefs.current[idx] = el} className="absolute inset-0" />
                </React.Fragment>
            ))}
        </div>
    );
};

export default SpellProjectile;
