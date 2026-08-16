/**
 * SpellProjectile — 法术弹道飞行 + 命中爆炸 通用特效
 *
 * [修复] 旧版 Bug：fireAll() 在事件回调中同步执行，
 *   此时 React 还没重渲染 → ref=null → 直接跳过。
 *   新版：useEffect 状态机，确保 DOM 就绪。
 *
 * [2026-06-29] 重构：新增差异化 BUFF 弹道系统
 *   - 根据 spellKey 映射视觉类别
 *   - 不同类别拥有专属弹道形状、飞弹外观、拖尾颜色、飞行时间、爆炸效果
 *   - 与 SpellImpactLayer 的受击特效颜色体系统一
 *
 * Skills 应用：
 *   - gsap-timeline: 弹道→爆炸→粒子序列
 *   - gsap-plugins: MotionPathPlugin
 *   - gsap-utils: gsap.utils.random()
 *   - gsap-performance: will-change
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { eventBus, StrikeEvents, GameEvents } from '../utils/eventBus';
import { EFFECT_IMAGES } from '../data/imageData';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

gsap.registerPlugin(MotionPathPlugin);

// ==========================================
// 常量与数据协议
// ==========================================
const EXPLOSION_PARTICLES = 14;
const MAX_POOL_SIZE = 15;

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
// [新增] 差异化飞弹视觉系统
// ==========================================

/** 飞弹视觉类别（与 SpellImpactLayer 保持一致） */
type MissileVisualType =
    | 'default'
    | 'mauxir_pedestal'
    | 'heal'
    | 'buff_all'
    | 'buff_power'
    | 'buff_keyword';

/** 各类别飞弹配置 */
interface MissileConfig {
    // ── 飞弹外观 ──
    size: number;           // 弹头直径
    color: string;          // 主色
    highlight: string;      // 高光色
    glowColor: string;      // 发光色
    shape: 'circle' | 'image';
    imageUrl?: string;

    // ── 弹道形状 ──
    pathStyle: 'default' | 'gentle' | 'rising' | 'sharp' | 'straight' | 's-curve';

    // ── 飞行参数 ──
    duration: number;       // 飞行秒数
    autoRotate: number | boolean;

    // ── 拖尾 ──
    trailColor: string;     // 拖尾主色
    trailBaseW: number;     // 首段宽度
    trailBaseH: number;     // 首段高度
    trailShrinkW: number;   // 每段缩减宽度
    trailShrinkH: number;   // 每段缩减高度
    trailGlowBase: number;  // 首段发光强度
    trailGlowShrink: number;// 每段缩减发光

    // ── 爆炸 ──
    explosionCenter: string;
    explosionMid: string;
    explosionEdge: string;

    // ── 粒子 ──
    particles: string[];
}

/** SpellKey → 飞弹视觉类别映射（与 SpellImpactLayer 的映射一致） */
const SPELL_MISSILE_MAP: Record<string, MissileVisualType> = {
    // --- 治疗 ---
    'vitality_regen': 'heal',
    'vitality_supplement': 'heal',

    // --- 多效果 → BUFF_ALL ---
    'bader_reagent': 'buff_all',
    'fenny_strike': 'buff_all',
    'fenny_support': 'buff_all',
    'full_purification': 'buff_all',

    // --- 双维增益 → BUFF_ALL ---
    'prayer': 'buff_all',
    'inspire': 'buff_all',

    // --- 仅攻击增益 → BUFF_Power ---
    'dream_lotus_drone': 'buff_power',

    // --- 关键词赋予 → BUFF_Keyword ---
    'pupu_specular_soul_ultimate': 'buff_keyword',
    'lyfe_support': 'buff_keyword',

    // --- 特殊 ---
    'mauxir_lotus_pedestal': 'mauxir_pedestal',

    // --- 精灵祈愿（治疗+增益，以治疗为主） ---
    'spirit_prayer': 'heal',
};

function getMissileType(spellKey: string): MissileVisualType {
    return SPELL_MISSILE_MAP[spellKey] || 'default';
}

// ==========================================
// 飞弹配置表 — 六维度全差异化
// ==========================================
const MISSILE_CONFIGS: Record<MissileVisualType, MissileConfig> = {

    /* ── 🔴 默认伤害弹 ──
     *   弹道：弧线贝塞尔
     *   飞弹：24px 赤焰火球
     *   拖尾：红→透明
     *   时间：0.40s
     *   爆炸：橙红爆焰
     */
    default: {
        size: 24,
        color: '#ef4444',
        highlight: '#ffffff',
        glowColor: '#ef4444',
        shape: 'circle',
        pathStyle: 'default',
        duration: 0.40,
        autoRotate: true,
        trailColor: '#ef4444',
        trailBaseW: 32,
        trailBaseH: 10,
        trailShrinkW: 4,
        trailShrinkH: 1,
        trailGlowBase: 8,
        trailGlowShrink: 1,
        explosionCenter: 'rgba(255,255,200,1)',
        explosionMid: 'rgba(255,150,50,0.9)',
        explosionEdge: 'rgba(239,68,68,0.5)',
        particles: ['#ef4444', '#f97316', '#fbbf24', '#fca5a5', '#ffffff'],
    },

    /* ── 🔮 臆莲基座（保持不变） ──
     *   弹道：极速直线
     *   飞弹：100px 紫色贴图
     *   拖尾：紫蓝渐变
     *   时间：0.35s
     *   爆炸：紫色光环
     */
    mauxir_pedestal: {
        size: 100,
        color: '#8B5CF6',
        highlight: '#ffffff',
        glowColor: '#8B5CF6',
        shape: 'image',
        imageUrl: EFFECT_IMAGES.mauxirRushAttack,
        pathStyle: 'straight',
        duration: 0.35,
        autoRotate: 90,
        trailColor: '#8B5CF6',
        trailBaseW: 80,
        trailBaseH: 26,
        trailShrinkW: 10,
        trailShrinkH: 3,
        trailGlowBase: 20,
        trailGlowShrink: 2,
        explosionCenter: 'rgba(139,92,246,1)',
        explosionMid: 'rgba(99,102,241,0.9)',
        explosionEdge: 'rgba(79,70,229,0.5)',
        particles: ['#8B5CF6', '#6366F1', '#4F46E5', '#A78BFA', '#C4B5FD'],
    },

    /* ── 💚 治疗弹 ──
     *   弹道：温柔大弧线（缓缓飘落感）
     *   飞弹：28px 柔光绿球 + 白芯
     *   拖尾：绿→透明
     *   时间：0.50s（缓缓飘落，温柔治愈）
     *   爆炸：💚 绿色光晕
     */
    heal: {
        size: 28,
        color: '#22c55e',
        highlight: '#ffffff',
        glowColor: '#22c55e',
        shape: 'circle',
        pathStyle: 'gentle',
        duration: 0.50,
        autoRotate: true,
        trailColor: '#22c55e',
        trailBaseW: 30,
        trailBaseH: 9,
        trailShrinkW: 4,
        trailShrinkH: 1,
        trailGlowBase: 7,
        trailGlowShrink: 1,
        explosionCenter: 'rgba(255,255,255,1)',
        explosionMid: 'rgba(74,222,128,0.9)',
        explosionEdge: 'rgba(34,197,94,0.3)',
        particles: ['#22c55e', '#4ade80', '#86efac', '#ffffff', '#16a34a'],
    },

    /* ── 🌟 全能增益弹 ──
     *   弹道：先升后降弧线（昂扬感）
     *   飞弹：30px 金色星芒光球
     *   拖尾：金→透明
     *   时间：0.45s（从容有力）
     *   爆炸：🌟 金色放射
     */
    buff_all: {
        size: 30,
        color: '#fbbf24',
        highlight: '#ffffff',
        glowColor: '#fbbf24',
        shape: 'circle',
        pathStyle: 'rising',
        duration: 0.45,
        autoRotate: true,
        trailColor: '#fbbf24',
        trailBaseW: 32,
        trailBaseH: 9,
        trailShrinkW: 4,
        trailShrinkH: 1,
        trailGlowBase: 8,
        trailGlowShrink: 1,
        explosionCenter: 'rgba(255,255,255,1)',
        explosionMid: 'rgba(251,191,36,0.9)',
        explosionEdge: 'rgba(217,119,6,0.4)',
        particles: ['#fbbf24', '#f59e0b', '#fef3c7', '#ffffff', '#d97706'],
    },

    /* ── 🟠 攻击增益弹 ──
     *   弹道：锐利小弧线（直扑目标，力量感）
     *   飞弹：26px 橙焰火球
     *   拖尾：橙→透明
     *   时间：0.35s（快速凌厉）
     *   爆炸：💥 橙色爆焰
     */
    buff_power: {
        size: 26,
        color: '#f97316',
        highlight: '#ffffff',
        glowColor: '#f97316',
        shape: 'circle',
        pathStyle: 'sharp',
        duration: 0.35,
        autoRotate: true,
        trailColor: '#f97316',
        trailBaseW: 28,
        trailBaseH: 8,
        trailShrinkW: 4,
        trailShrinkH: 1,
        trailGlowBase: 7,
        trailGlowShrink: 1,
        explosionCenter: 'rgba(255,255,220,1)',
        explosionMid: 'rgba(251,146,60,0.9)',
        explosionEdge: 'rgba(234,88,12,0.4)',
        particles: ['#f97316', '#fb923c', '#fed7aa', '#ffffff', '#ea580c'],
    },

    /* ── 🟣 关键词赋予弹 ──
     *   弹道：S 形波浪（神秘魔法感）
     *   飞弹：28px 紫晶灵球
     *   拖尾：紫→透明
     *   时间：0.50s（悠然飘行）
     *   爆炸：🔮 紫色光环扩散
     */
    buff_keyword: {
        size: 28,
        color: '#a855f7',
        highlight: '#ffffff',
        glowColor: '#a855f7',
        shape: 'circle',
        pathStyle: 's-curve',
        duration: 0.50,
        autoRotate: true,
        trailColor: '#a855f7',
        trailBaseW: 30,
        trailBaseH: 9,
        trailShrinkW: 4,
        trailShrinkH: 1,
        trailGlowBase: 7,
        trailGlowShrink: 1,
        explosionCenter: 'rgba(255,255,255,1)',
        explosionMid: 'rgba(192,132,252,0.9)',
        explosionEdge: 'rgba(168,85,247,0.3)',
        particles: ['#a855f7', '#c084fc', '#e9d5ff', '#ffffff', '#7e22ce'],
    },
};

/**
 * 根据弹道形状生成 SVG path 字符串
 */
function generatePath(
    sx: number, sy: number,
    tx: number, ty: number,
    style: MissileConfig['pathStyle'],
): string {
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const nx = -dy / dist; // 垂直单位向量 x
    const ny = dx / dist;  // 垂直单位向量 y

    switch (style) {
        case 'straight':
            // 极速直线
            return `M ${sx} ${sy} L ${tx} ${ty}`;

        case 'gentle':
            // 温柔大弧线：偏移量增大，弯度更柔
            { const offset = dist * 0.35 + 80;
            const mx = sx + dx / 2 + nx * offset;
            const my = sy + dy / 2 + ny * offset;
            return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`; }

        case 'rising':
            // 先升后降：控制点上抬
            { const mx = (sx + tx) / 2;
            const my = Math.min(sy, ty) - dist * 0.25;
            return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`; }

        case 'sharp':
            // 锐利小弧线：偏移量减小，更趋近直线
            { const offset = dist * 0.12 + 30;
            const mx = sx + dx / 2 + nx * offset;
            const my = sy + dy / 2 + ny * offset;
            return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`; }

        case 's-curve':
            // S 形波浪：两个控制点反向偏移
            { const offset = dist * 0.25 + 50;
            const cx1 = sx + dx * 0.25 + nx * offset;
            const cy1 = sy + dy * 0.25 + ny * offset;
            const cx2 = sx + dx * 0.75 - nx * offset;
            const cy2 = sy + dy * 0.75 - ny * offset;
            return `M ${sx} ${sy} C ${cx1} ${cy1} ${cx2} ${cy2} ${tx} ${ty}`; }

        case 'default':
        default:
            // 标准弧线贝塞尔（原默认逻辑）
            { const offset = dist * 0.2 + 60;
            const mx = sx + dx / 2 + nx * offset;
            const my = sy + dy / 2 + ny * offset;
            return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`; }
    }
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
    const activeRef = useRef(false);
    const poolIndexRef = useRef(0);
    const flightPromisesRef = useRef<Promise<void>[]>([]);

    // ==========================================
    // 单发飞弹 (纯视觉动画执行)
    // ==========================================
    const fireAtTarget = useCallback((bullet: StrikeBullet, cmd: StrikeCommandPayload, idx: number): Promise<void> => {
        return new Promise((resolve) => {
            const container = containerRef.current;
            const missileEl = missileRefs.current[idx];
            const explosionEl = explosionRefs.current[idx];
            const particlesEl = particlesRefs.current[idx];
            const tailEls = (tailRefsGroup.current[idx] || []).filter((el): el is HTMLDivElement => !!el); // [2026-08-16] 类型守卫收窄 possibly-null

            if (!container || !missileEl || !explosionEl || !particlesEl) {
                resolve();
                return;
            }

            const targetId = bullet.targetId;
            const spellKey = cmd.spellKey || 'default';
            const sourceId = cmd.sourceId;
            const cfg = MISSILE_CONFIGS[getMissileType(spellKey)];

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

            // [起点修复] 放弃写死的屏幕中心，精准追踪法术圆盘阵眼！
            const startPos = (sourceId ? getLocalCenter(sourceId) : null)
                          || getLocalCenter('spell-center')
                          || { x: container.offsetWidth / 2, y: container.offsetHeight / 2 };

            // [终点修复] 精准追踪目标
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
            const pathStr = generatePath(sx, sy, targetPos.x, targetPos.y, cfg.pathStyle);

            // ── 飞弹外观 ──
            if (cfg.shape === 'image') {
                missileEl.style.background = `url(${cfg.imageUrl}) center/contain no-repeat`;
                missileEl.style.boxShadow = 'none';
                missileEl.style.borderRadius = '0';
            } else {
                missileEl.style.background = `radial-gradient(circle at 35% 35%, ${cfg.highlight}, ${cfg.color} 30%, ${cfg.color})`;
                missileEl.style.boxShadow = `0 0 ${cfg.size * 0.7}px ${cfg.glowColor}, 0 0 ${cfg.size * 1.4}px ${cfg.glowColor}66`;
                missileEl.style.borderRadius = '50%';
            }
            missileEl.style.width = `${cfg.size}px`;
            missileEl.style.height = `${cfg.size}px`;
            missileEl.style.marginLeft = `-${cfg.size / 2}px`;
            missileEl.style.marginTop = `-${cfg.size / 2}px`;

            // ── 拖尾 ──
            tailEls.forEach((el, i) => {
                const color = cfg.shape === 'image'
                    ? ['#8B5CF6', '#6366F1', '#4F46E5', '#7C3AED', '#6D28D9'][i % 5]
                    : cfg.trailColor;
                el.style.background = `linear-gradient(90deg, transparent, ${color})`;
                el.style.boxShadow = `0 0 ${cfg.trailGlowBase - i * cfg.trailGlowShrink}px ${color}`;

                const tw = Math.max(cfg.trailBaseW - i * cfg.trailShrinkW, 4);
                const th = Math.max(cfg.trailBaseH - i * cfg.trailShrinkH, 2);
                el.style.width = `${tw}px`;
                el.style.height = `${th}px`;
                el.style.marginLeft = `-${tw / 2}px`;
                el.style.marginTop = `-${th / 2}px`;
            });

            // ── 爆炸 ──
            explosionEl.style.background = `radial-gradient(circle, ${cfg.explosionCenter} 0%, ${cfg.explosionMid} 20%, ${cfg.explosionEdge} 50%, transparent 70%)`;

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
            tl.to(missileEl, {
                motionPath: { path: pathStr, curviness: 1.2, autoRotate: cfg.autoRotate },
                duration: cfg.duration,
                ease: 'power1.inOut'
            }, 0);

            // 拖尾切片跟随
            tl.to(tailEls, {
                motionPath: { path: pathStr, curviness: 1.2, autoRotate: true },
                duration: cfg.duration,
                ease: 'power1.inOut',
                stagger: 0.012
            }, 0);

            // ② 爆破瞬间
            tl.add(() => {
                // 专属命中音效
                const mType = getMissileType(spellKey);
                if (mType === 'mauxir_pedestal') {
                    eventBus.emit(GameEvents.SFX_MAUXIR_RUSH_HIT);
                }

                // 1. 鸣枪通知大脑
                eventBus.emit(StrikeEvents.HIT, { bullet, sourceId });

                // 2. 引爆受击特效层
                eventBus.emit('VFX_IMPACT_TRIGGER', {
                    targetId: targetId,
                    impactType: spellKey
                });
            }, '+=0.02');

            tl.set(missileEl, { opacity: 0, scale: 0 }, '+=0');
            tl.to(tailEls, { opacity: 0, scale: 0, duration: 0.1 }, '-=0.05');

            tl.set(explosionEl, { x: targetPos.x - 40, y: targetPos.y - 40, scale: 0.2, opacity: 1 }, '+=0');

            // ③ 爆炸扩散
            tl.to(explosionEl, { scale: 2.5, opacity: 0, duration: 0.35, ease: 'power2.out' }, '+=0');

            // ④ 粒子发射
            tl.add(() => {
                for (let i = 0; i < EXPLOSION_PARTICLES; i++) {
                    const angle = (Math.PI * 2 * i) / EXPLOSION_PARTICLES;
                    const dist = gsap.utils.random(35, 90);
                    const size = gsap.utils.random(2, 6, 1);
                    const color = cfg.particles[i % cfg.particles.length];

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

            // ⑤ 等待粒子燃尽
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

            if (cmd.preDelay) await new Promise(r => setTimeout(r, cmd.preDelay));

            for (const bullet of cmd.bullets) {
                const idx = poolIndexRef.current;
                poolIndexRef.current = (poolIndexRef.current + 1) % MAX_POOL_SIZE;

                const flight = fireAtTarget(bullet, cmd, idx);
                flightPromisesRef.current.push(flight);

                flight.then(() => {
                    flightPromisesRef.current = flightPromisesRef.current.filter(p => p !== flight);
                });

                await new Promise(r => setTimeout(r, cmd.interval ?? 100));
            }
        }

        await Promise.all(flightPromisesRef.current);
        eventBus.emit(StrikeEvents.COMPLETE, {});
        activeRef.current = false;
    };

    // 监听打击指令
    useEffect(() => {
        const handleCommand = (payload: StrikeCommandPayload) => {
            if (!payload?.bullets?.length) return;
            queueRef.current.push(payload);
            processQueue();
        };

        eventBus.on(StrikeEvents.COMMAND, handleCommand);
        return () => { eventBus.off(StrikeEvents.COMMAND, handleCommand); };
    }, [fireAtTarget]);

    // 默认颜色常量（用于对象池初始渲染）
    const DEFAULT_COLOR = '#ef4444';

    return (
        <div ref={containerRef} className="fixed inset-0 z-[95] pointer-events-none" style={{ display: 'block' }}>
            {[...Array(MAX_POOL_SIZE)].map((_, idx) => (
                <React.Fragment key={`proj-pool-${idx}`}>
                    {/* 5 段错帧切片拖尾 */}
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={`tail-${idx}-${i}`}
                            ref={el => {
                                if (!tailRefsGroup.current[idx]) tailRefsGroup.current[idx] = [];
                                tailRefsGroup.current[idx][i] = el;
                            }}
                            className="absolute rounded-full"
                            style={{
                                width: 32 - i * 4,
                                height: 10 - i,
                                background: `linear-gradient(90deg, transparent, ${DEFAULT_COLOR})`,
                                boxShadow: `0 0 ${8 - i}px ${DEFAULT_COLOR}`,
                                opacity: 0,
                                willChange: 'transform, opacity',
                                transformOrigin: 'center center',
                                marginLeft: -(32 - i * 4) / 2,
                                marginTop: -(10 - i) / 2,
                            }}
                        />
                    ))}

                    {/* 能量核心法球 */}
                    <div
                        ref={el => { missileRefs.current[idx] = el; }}
                        className="absolute rounded-full"
                        style={{
                            width: 24,
                            height: 24,
                            background: `radial-gradient(circle at 35% 35%, #ffffff, #fca5a5 30%, ${DEFAULT_COLOR})`,
                            boxShadow: `0 0 16px ${DEFAULT_COLOR}, 0 0 32px ${DEFAULT_COLOR}66`,
                            opacity: 0,
                            willChange: 'transform, opacity',
                            transformOrigin: 'center center',
                            marginLeft: -12,
                            marginTop: -12,
                        }}
                    />
                    {/* 爆炸核心 */}
                    <div
                        ref={el => { explosionRefs.current[idx] = el; }}
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
                    <div ref={el => { particlesRefs.current[idx] = el; }} className="absolute inset-0" />
                </React.Fragment>
            ))}
        </div>
    );
};

export default SpellProjectile;
