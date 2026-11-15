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
    /**
     * [2026-11-14 凯茜娅「倾泻」] 覆盖该批飞弹的**飞行时长（秒）**。
     * 缺省走 `MISSILE_CONFIGS` 里的静态值。倾泻按发数动态给：
     * 发数多 ⇒ 单发快掠（弹幕感），发数少 ⇒ 放慢（看得清弹体）。
     */
    duration?: number;
}

// ==========================================
// [新增] 差异化飞弹视觉系统
// ==========================================

/** 飞弹视觉类别（与 SpellImpactLayer 保持一致） */
type MissileVisualType =
    | 'default'
    | 'mauxir_pedestal'
    | 'katya_barrage'
    | 'katya_pierce'
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
    // [2026-11-14 凯茜娅「倾泻」] 加特林弹幕 → 专属能量弹外观
    'katya_barrage': 'katya_barrage',
    'katya_pierce': 'katya_pierce',   // [2026-11-15 穿云] 与倾泻同款能量弹（此前漏了映射 ⇒ 打出默认子弹）

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

    /* ── 🔫 凯茜娅「倾泻」能量弹 ──
     *   弹道：直线（加特林弹幕，不绕路）
     *   飞弹：贴图（蓝色能量弹，原图竖排朝上 ⇒ autoRotate 90 对齐飞行方向）
     *   拖尾：蓝色电弧，短而密（高射速感）
     *   时间：0.18s（弹速要快 —— 全部子弹必须在 2 秒内打完，配合音效开火段）
     *   爆炸：蓝白闪光（不抢主伤害飘字）
     */
    katya_barrage: {
        size: 58,
        color: '#38bdf8',
        highlight: '#ffffff',
        glowColor: '#0ea5e9',
        shape: 'image',
        imageUrl: EFFECT_IMAGES.katyaBarrageBullet,
        pathStyle: 'straight',
        duration: 0.35,          // [程实测] 0.18 太快、弹体看不清 ⇒ 拉长到 0.35（仍远快于总时长）
        autoRotate: 90,
        trailColor: '#38bdf8',
        trailBaseW: 46,
        trailBaseH: 14,
        trailShrinkW: 8,
        trailShrinkH: 2,
        trailGlowBase: 16,
        trailGlowShrink: 2,
        explosionCenter: 'rgba(224,242,254,1)',
        explosionMid: 'rgba(56,189,248,0.92)',
        explosionEdge: 'rgba(14,165,233,0.5)',
        particles: ['#38bdf8', '#0ea5e9', '#7dd3fc', '#e0f2fe', '#0284c7'],
    },
    // [2026-11-15 穿云激流] 与倾泻完全同款 —— 同一把枪打出来的子弹，视觉必须一致
    katya_pierce: {
        size: 58,
        color: '#38bdf8',
        highlight: '#ffffff',
        glowColor: '#0ea5e9',
        shape: 'image',
        imageUrl: EFFECT_IMAGES.katyaBarrageBullet,
        pathStyle: 'straight',
        duration: 0.35,
        autoRotate: 90,
        trailColor: '#38bdf8',
        trailBaseW: 46,
        trailBaseH: 14,
        trailShrinkW: 8,
        trailShrinkH: 2,
        trailGlowBase: 16,
        trailGlowShrink: 2,
        explosionCenter: 'rgba(224,242,254,1)',
        explosionMid: 'rgba(56,189,248,0.92)',
        explosionEdge: 'rgba(14,165,233,0.5)',
        particles: ['#38bdf8', '#0ea5e9', '#7dd3fc', '#e0f2fe', '#0284c7'],
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
    const gunRef = useRef<HTMLDivElement>(null);   // [倾泻] 加特林枪体（开火期间浮现）
    const gun2Ref = useRef<HTMLDivElement>(null);  // [穿云] 左副枪（双枪构图，倾泻不用）
    const decoyRefs = useRef<(HTMLDivElement | null)[]>([]);  // [倾泻] 幌子弹（2 发，纯视觉）
    // [2026-11-15 穿云状态机] 枪体跨拍保持：每拍都是一条独立 COMMAND，不能每条都架/收枪一次
    const gunActiveRef = useRef(false);
    const gunHideTimerRef = useRef<any>(null);
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
    const fireAtTarget = useCallback((bullet: StrikeBullet, cmd: StrikeCommandPayload, idx: number, fromOverride?: { x: number; y: number } | null): Promise<void> => {
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
            // [倾泻] 允许本条指令自带飞行时长（按发数动态），缺省用配置里的静态值
            const flightDuration = typeof cmd.duration === 'number' && cmd.duration > 0 ? cmd.duration : cfg.duration;

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
            // [2026-11-15 程拍板] 穿云的子弹从**加特林枪口**打出（调用方传 `fromOverride`），
            //   不是从凯茜娅卡面中心 —— 枪都架在她左右两侧了，子弹却从卡中间冒出来会很怪。
            const startPos = fromOverride
                          || (sourceId ? getLocalCenter(sourceId) : null)
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
                duration: flightDuration,
                ease: 'power1.inOut'
            }, 0);

            // 拖尾切片跟随
            tl.to(tailEls, {
                motionPath: { path: pathStr, curviness: 1.2, autoRotate: true },
                duration: flightDuration,
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
    // ==========================================
    // [2026-11-14 凯茜娅「倾泻」] 加特林枪体：开火期间浮现在发射源上，弹幕打完即收
    //   —— 与子弹同起同收，构成"架好枪→扫射→收枪"的一次完整演出。
    //   位置沿用飞弹那套边界系换算（免疫 ScaleWrapper 的空间畸变）。
    // ==========================================
    const showGun = (sourceId: string, which: 0 | 1 = 0, slide = false) => {
        const gun = which === 0 ? gunRef.current : gun2Ref.current;
        const cont = containerRef.current;
        if (!gun || !cont) return;
        const el = sourceId ? document.querySelector(`[data-entity-id="${sourceId}"]`) : null;
        const elRect = el?.getBoundingClientRect();
        const contRect = cont.getBoundingClientRect();
        let x = contRect.width / 2;
        let y = contRect.height / 2;
        if (elRect) {
            const scaleX = contRect.width / cont.offsetWidth || 1;
            const scaleY = contRect.height / cont.offsetHeight || 1;
            // [2026-11-15 程拍板] 两把枪贴住卡牌的**左右边缘外侧**（不是压在卡中心），
            //   主枪在右、副枪在左，间距 = 半个卡宽 + 18px
            const halfW = elRect.width / 2 / scaleX;
            const gap = 18 / scaleX;
            const centerX = ((elRect.left - contRect.left) + elRect.width / 2) / scaleX;
            x = which === 1 ? centerX - halfW - gap : centerX + halfW + gap;
            y = ((elRect.top - contRect.top) + elRect.height / 2) / scaleY;
        }
        gsap.set(gun, { xPercent: -50, yPercent: -50, y });
        if (slide) {
            // [2026-11-15 穿云] **不转圈**：从各自外侧滑进来（左枪从左、右枪从右）
            const fromX = x + (which === 1 ? -150 : 150);
            gsap.fromTo(gun,
                { x: fromX, opacity: 0, scale: 0.72 },
                { x, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
        } else {
            gsap.set(gun, { x, opacity: 0, scale: 0.55, rotate: -8 });
            gsap.to(gun, { opacity: 1, scale: 1, duration: 0.14, ease: 'back.out(2)' });
            // [倾泻] 预热：枪管高速转两圈，与 `倾泻1.ogg`(1.14s) 同长
            gsap.to(gun, {
                rotate: 712,
                duration: 1.14,
                ease: 'power1.inOut',
                onComplete: () => gsap.set(gun, { rotate: 0 }),
            });
        }
    };

    // [2026-11-15 程拍板 · 枪口随发转向] 让枪体对准每一次的出弹方向。
    //   贴图原始朝向是"上" ⇒ 基准角 = 方向角 + 90°。
    //   `extraDeg` 给幌子弹用：枪口跟着散布角轻微甩一下，出弹瞬间再回正。
    const aimGun = (fromId: string, toId: string, extraDeg = 0, which: 0 | 1 = 0) => {
        const gun = which === 0 ? gunRef.current : gun2Ref.current;
        if (!gun) return;
        const a = getScreenPos(fromId), b = getScreenPos(toId);
        if (!a || !b) return;
        const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90 + extraDeg;
        gsap.to(gun, { rotate: deg, duration: 0.07, ease: 'power2.out', overwrite: 'auto' });
    };

    // 实体屏幕坐标（枪体 / 幌子弹共用；已做容器缩放换算）
    const getScreenPos = (id: string) => {
        const cont = containerRef.current;
        if (!cont) return null;
        const d = document.querySelector(`[data-entity-id="${id}"]`);
        if (!d) return null;
        const r = d.getBoundingClientRect();
        const cr = cont.getBoundingClientRect();
        const sx = cr.width / cont.offsetWidth || 1;
        const sy = cr.height / cont.offsetHeight || 1;
        return { x: ((r.left - cr.left) + r.width / 2) / sx, y: ((r.top - cr.top) + r.height / 2) / sy };
    };
    const hideGun = () => {
        // [2026-11-15 程补素材] 收枪音效（1.04s）—— 与枪体消失**同一刻**触发（双枪只响一次）
        if (!gunRef.current) return;
        eventBus.emit(GameEvents.SFX_KATYA_BARRAGE_COOLDOWN);
        gsap.to(gunRef.current, { opacity: 0, scale: 0.7, duration: 0.22, ease: 'power2.in' });
        if (gun2Ref.current) gsap.to(gun2Ref.current, { opacity: 0, scale: 0.7, duration: 0.22, ease: 'power2.in' });
    };

    // ==========================================
    // [2026-11-15 程拍板 · 加特林密集感] 幌子弹（decoy）
    //   每次开火额外打 2 发：**尺寸与真弹一致**，但角度偏、时间略错开、不实际命中（纯视觉）。
    //   目的：真子弹间距 120ms，视觉上偏稀；补两发斜飞的幻影弹制造"大量子弹倾泻"的错觉。
    //   · 不占对象池（专用 4 个 ref）—— 否则 N=10 时会被装饰弹挤爆（池子只有 15 位）
    //   · 不播爆炸/粒子（那会让人以为打中了）、不播音效、不产生任何伤害事件
    //   · 角度/延迟/距离/时长**全部在区间内随机**，避免一眼看出是机械复制
    // ==========================================
    const fireDecoy = (fromId: string, toId: string, idx: number): number | null => {
        const el = decoyRefs.current[idx];
        if (!el) return null;
        const a = getScreenPos(fromId), b = getScreenPos(toId);
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        // 随机区间：角度 ±8~20°（左右各半）、延迟 20~90ms、飞 70%~90%、时长 0.20~0.28s
        const angleDeg = (Math.random() < 0.5 ? -1 : 1) * gsap.utils.random(8, 20);
        const delayMs = gsap.utils.random(20, 90);
        const spreadRatio = gsap.utils.random(0.7, 0.9);
        const dur = gsap.utils.random(0.2, 0.28);
        const rad = Math.atan2(dy, dx) + (angleDeg * Math.PI) / 180;
        const spread = dist * spreadRatio;
        gsap.set(el, {
            x: a.x, y: a.y, xPercent: -50, yPercent: -50,
            rotate: (rad * 180) / Math.PI + 90,
            opacity: 0.85, scale: 1,   // 与真弹同尺寸，不再缩小
        });
        gsap.to(el, {
            x: a.x + Math.cos(rad) * spread,
            y: a.y + Math.sin(rad) * spread,
            opacity: 0,
            duration: dur,
            delay: delayMs / 1000,
            ease: 'none',
        });
        return angleDeg;   // 供 `aimGun` 让枪口跟着散布角甩一下
    };

    const processQueue = async () => {
        if (activeRef.current) return;
        activeRef.current = true;

        let gunShown = false;   // [倾泻] 本批是否架过枪（收枪要等**所有子弹落地**）
        let decoySeq = 0;       // [倾泻] 幌子弹轮换序号（4 个 DOM 位）

        while (queueRef.current.length > 0) {
            const cmd = queueRef.current.shift()!;

            // [倾泻/穿云] 加特林：本批开火前架枪 —— 架起后就一直挂着，直到弹幕结束
            //   穿云激流是**双枪**（主枪在右、副枪在左），倾泻是单枪
            //   [2026-11-15 状态机] 穿云每拍是一条**独立** COMMAND ⇒ 用 `gunActiveRef` 跨拍保持，
            //   否则每发都会"架枪→收枪"闪一次。收枪改为**延迟**（见下方），连续拍之间不会闪。
            const isKatyaGun = cmd.spellKey === 'katya_barrage' || cmd.spellKey === 'katya_pierce';
            if (isKatyaGun) {
                if (gunHideTimerRef.current) { clearTimeout(gunHideTimerRef.current); gunHideTimerRef.current = null; }
                if (!gunActiveRef.current) {
                    // [穿云] 双枪从两侧滑入、不转圈；[倾泻] 单枪中心浮现 + 预热转圈
                    const isPierce = cmd.spellKey === 'katya_pierce';
                    showGun(cmd.sourceId, 0, isPierce);
                    if (isPierce) showGun(cmd.sourceId, 1, true);
                    gunActiveRef.current = true;
                }
                gunShown = true;
            }

            if (cmd.preDelay) await new Promise(r => setTimeout(r, cmd.preDelay));

            let bulletIdx = 0;
            for (const bullet of cmd.bullets) {
                const idx = poolIndexRef.current;
                poolIndexRef.current = (poolIndexRef.current + 1) % MAX_POOL_SIZE;

                // [2026-11-15 倾泻/穿云] 单发开火音效 —— 与**子弹飞出的同一刻**触发，音画逐发对齐
                if (isKatyaGun) eventBus.emit(GameEvents.SFX_KATYA_BARRAGE_SHOT);

                // [2026-11-15] 枪口转向 + 幌子弹（仅倾泻单枪）
                if (isKatyaGun) {
                    // 穿云双枪轮流开火；倾泻永远主枪
                    const which: 0 | 1 = (cmd.spellKey === 'katya_pierce' && bulletIdx % 2 === 1) ? 1 : 0;
                    aimGun(cmd.sourceId, bullet.targetId, 0, which);   // 对准本发目标（随机目标 ⇒ 视觉转火）
                    if (cmd.spellKey === 'katya_barrage') {
                        const d1 = fireDecoy(cmd.sourceId, bullet.targetId, decoySeq % 4);
                        const d2 = fireDecoy(cmd.sourceId, bullet.targetId, (decoySeq + 1) % 4);
                        decoySeq += 2;
                        const swing = d1 ?? d2;
                        if (swing !== null) aimGun(cmd.sourceId, bullet.targetId, swing * 0.6, which);
                    }
                }
                bulletIdx += 1;

                // [穿云] 起点用**对应那把枪的当前位置**（左枪/右枪轮流）
                let fromOverride: { x: number; y: number } | null = null;
                if (cmd.spellKey === 'katya_pierce') {
                    const gunEl = (bulletIdx % 2 === 1) ? gun2Ref.current : gunRef.current;
                    if (gunEl) {
                        fromOverride = {
                            x: (gsap.getProperty(gunEl, 'x') as number) || 0,
                            y: (gsap.getProperty(gunEl, 'y') as number) || 0,
                        };
                    }
                }
                const flight = fireAtTarget(bullet, cmd, idx, fromOverride);
                flightPromisesRef.current.push(flight);

                flight.then(() => {
                    flightPromisesRef.current = flightPromisesRef.current.filter(p => p !== flight);
                });

                await new Promise(r => setTimeout(r, cmd.interval ?? 100));
            }
        }

        // [倾泻] 收枪必须在**最后一发子弹真正落地之后**：
        //   若放在发射循环里，末发还在飞（0.18s）时枪就没了，看起来像"打一半就收枪"。
        // [倾泻] 收枪：**最后一发打出去就收**（程 2026-11-15 二次纠正）
        //   [2026-11-15 穿云状态机] 改为**延迟收枪**（400ms）：状态机每 120ms 拍一条独立 COMMAND，
        //   拍与拍之间有空档，立刻收会闪。延迟窗口内来了下一条就会清掉定时器，枪一直挂着。
        if (gunShown) {
            if (gunHideTimerRef.current) clearTimeout(gunHideTimerRef.current);
            gunHideTimerRef.current = setTimeout(() => {
                hideGun();
                gunActiveRef.current = false;
                gunHideTimerRef.current = null;
            }, 400);
        }
        // 子弹仍要等全部落地，才发 COMPLETE 让上层做结算
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
            {/* [2026-11-14 凯茜娅「倾泻」] 加特林枪体 —— 开火期间浮现，弹幕收尾即隐 */}
            <div
                ref={gunRef}
                className="absolute pointer-events-none"
                style={{
                    width: 210,
                    height: 210,
                    background: `url(${EFFECT_IMAGES.katyaBarrageGun}) center/contain no-repeat`,
                    opacity: 0,
                    willChange: 'transform, opacity',
                    filter: 'drop-shadow(0 0 14px rgba(56,189,248,0.8))',
                }}
            />
            {/* [2026-11-15 穿云] 左副枪 —— 双枪构图，倾泻时保持隐藏 */}
            <div
                ref={gun2Ref}
                className="absolute pointer-events-none"
                style={{
                    width: 210,
                    height: 210,
                    background: `url(${EFFECT_IMAGES.katyaBarrageGun}) center/contain no-repeat`,
                    opacity: 0,
                    willChange: 'transform, opacity',
                    filter: 'drop-shadow(0 0 14px rgba(56,189,248,0.8))',
                }}
            />
            {/* [2026-11-15 倾泻] 幌子弹 ×4 —— 斜飞、不命中，只为制造密集感（4 个轮换，避免互相打断） */}
            {[0, 1, 2, 3].map(i => (
                <div
                    key={`decoy-${i}`}
                    ref={el => { decoyRefs.current[i] = el; }}
                    className="absolute pointer-events-none"
                    style={{
                        width: 58,
                        height: 58,
                        background: `url(${EFFECT_IMAGES.katyaBarrageBullet}) center/contain no-repeat`,
                        opacity: 0,
                        willChange: 'transform, opacity',
                        filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.7))',
                    }}
                />
            ))}
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
