// ==========================================
// [2026-09-19 1.0.16 茉莉安] 獠牙信标 · 引爆特效层
//
// 表现（程 2026-09-19 定的效果）：
//   ① 信标被击败 → 在它**原来的位置**上浮现贴图（缩放 + 淡入）
//   ② 从贴图**上方的紫色球心**射出若干束激光 —— 有几个受害目标就打几束，一一指向目标
//   ③ 每束颜色按**它自己造成的伤害**：低 → 纯紫，高 → 紫红
//   ④ 射完后贴图消散
//
// ── 坐标：全程走 SVG + `getScreenCTM()` 逆变换（复用 VFXLayer 的两把工具）
//    这样**自动跟随 ScaleWrapper 的缩放**，不必自己算 getGameScale —— 这是项目里踩过的坑，
//    VFXLayer 的注释称之为「核心魔法」。
// ── 数据：SPREAD_DAMAGE 结算时广播的 BEACON_EXPLODE
//    （分摊的分配结果是唯一真相源，视觉层不重算，避免两边算出不一样的数）
// ── 触发瞬间【抓一次】坐标：之后单位可能移动 / 消失，不能延迟到动画播放时才去查。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { EFFECT_IMAGES } from '../data/imageData';
import { getElementCenter, getLocalPos } from './VFXLayer';

const IMG_SRC = EFFECT_IMAGES.marianBeaconExplode;

/** 炮口 = 贴图上紫色球体的实测重心（占贴图比例，2026-09-19 用 PIL 量得） */
const MUZZLE_RX = 0.556;
const MUZZLE_RY = 0.232;
/** 贴图显示边长 = 信标卡宽的倍数 */
const IMG_SCALE = 1.9;
/** 单束激光配色区间：伤害 1 → 纯紫 275°，伤害 8 → 紫红 332° */
const HUE_LOW = 275;
const HUE_HIGH = 332;
const DMG_MAX = 8;

/** 时间轴（ms）
 *  [2026-09-19 方案 F] 重新定调：**"看得清"靠信息量与冲击力，不靠时长**。
 *  ── 上一版把前奏拉到 0.88s，代价是"伤害 t=0 已结算、激光 0.88s 才射出"的因果错位被放大；
 *     本版把第一束激光压到 0.15s 内射出 ⇒ 错位窗口落到人眼分辨不出的量级，
 *     同时用【炸出式入场 + 命中闪光】把信息量补回来。
 *  ── 总时长 ≈ 0.7~0.9s（上一版 2.5s）。 */
const APPEAR_MS = 150;      // 贴图**炸出**（带过冲回弹，不是缓慢淡入）
const HOLD_MS = 0;          // 不再静止展示：时间让给激光
const BEAM_STAGGER = 60;    // 每束之间间隔
const BEAM_GROW_MS = 120;   // 单束生长时长
const IMPACT_MS = 240;      // 命中闪光时长（新增）
const TAIL_MS = 320;        // 收尾（贴图炸开消散）

interface Beam {
    id: string;
    x2: number;
    y2: number;
    len: number;
    hue: number;
    delay: number;
}

interface Burst {
    key: number;
    box: { left: number; top: number; size: number };
    muzzle: { x: number; y: number };
    beams: Beam[];
    /** 从触发到完全消散的总时长（用于卸载） */
    life: number;
}

export const BeaconExplosionLayer: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [mounted, setMounted] = useState(false);
    const [burst, setBurst] = useState<Burst | null>(null);
    const seqRef = useRef(0);

    // [对齐 VFXLayer] 首次绘制拿不到 CTM，等挂载后再监听
    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;

        const onExplode = (payload: { beaconId?: string; targets?: { id: string; amount: number }[] }) => {
            const svg = svgRef.current;
            if (!svg || !payload?.targets?.length) return;

            // ── 信标槽位（贴图落点 + 炮口）。尸体若已被清出 DOM 则整段跳过（无参照物可画）
            const beaconEl = payload.beaconId
                ? (document.querySelector(`[data-entity-id="${payload.beaconId}"]`) as HTMLElement | null)
                : null;
            if (!beaconEl) {
                console.log('[BeaconVFX] 信标 DOM 已不存在，跳过引爆特效');
                return;
            }
            const r = beaconEl.getBoundingClientRect();
            const tl = getLocalPos(svg, r.left, r.top);
            const br = getLocalPos(svg, r.right, r.bottom);
            const cardW = Math.abs(br.x - tl.x);
            const size = cardW * IMG_SCALE;
            const cx = (tl.x + br.x) / 2;
            const cy = (tl.y + br.y) / 2;
            const box = { left: cx - size / 2, top: cy - size / 2, size };
            const muzzle = { x: box.left + size * MUZZLE_RX, y: box.top + size * MUZZLE_RY };

            // ── 每束：落点取目标中心；颜色按该束伤害
            const beams: Beam[] = [];
            payload.targets.forEach((t, i) => {
                const pos = getElementCenter(t.id, svg);
                if (!pos) return;
                const ratio = Math.max(0, Math.min(1, (t.amount - 1) / (DMG_MAX - 1)));
                beams.push({
                    id: `${t.id}-${i}`,
                    x2: pos.x,
                    y2: pos.y,
                    len: Math.hypot(pos.x - muzzle.x, pos.y - muzzle.y),
                    hue: HUE_LOW + ratio * (HUE_HIGH - HUE_LOW),
                    delay: APPEAR_MS + HOLD_MS + i * BEAM_STAGGER,
                });
            });
            if (beams.length === 0) return;

            // 生命周期 = 最后一束命中闪光播完 + 收尾消散
            const life = APPEAR_MS + HOLD_MS + (beams.length - 1) * BEAM_STAGGER + BEAM_GROW_MS + IMPACT_MS + TAIL_MS;
            seqRef.current += 1;
            setBurst({ key: seqRef.current, box, muzzle, beams, life });
            console.log(`[BeaconVFX] 引爆特效：${beams.length} 束（伤害 ${payload.targets.map(t => t.amount).join('/')}）`);
        };

        eventBus.on(GameEvents.BEACON_EXPLODE, onExplode);
        return () => { eventBus.off(GameEvents.BEACON_EXPLODE, onExplode); };
    }, [mounted]);

    // ── 到点卸载（同时只保留一次引爆，新的会顶掉旧的）
    useEffect(() => {
        if (!burst) return;
        const timer = setTimeout(() => setBurst(null), burst.life);
        return () => clearTimeout(timer);
    }, [burst]);

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-[26]"
            style={{ overflow: 'visible' }}
        >
            {burst && (
                <g key={burst.key}>
                    {/* ① 浮现贴图（延迟 = 总时长 - 消散时长，让它在最后淡出） */}
                    <image
                        href={IMG_SRC}
                        x={burst.box.left}
                        y={burst.box.top}
                        width={burst.box.size}
                        height={burst.box.size}
                        preserveAspectRatio="xMidYMid meet"
                        className="beacon-explode-img"
                        style={{ animationDelay: `0ms, ${burst.life - TAIL_MS}ms` }}
                    />

                    {/* ② 激光：每束 = 外层辉光 + 内核高光；命中瞬间补一组闪光 */}
                    {burst.beams.map(b => (
                        <g key={b.id}>
                            <line
                                x1={burst.muzzle.x} y1={burst.muzzle.y} x2={b.x2} y2={b.y2}
                                stroke={`hsl(${b.hue} 100% 66%)`}
                                strokeWidth={10} strokeLinecap="round" opacity={0.4}
                                className="beacon-beam"
                                style={{
                                    strokeDasharray: b.len,
                                    ['--beam-len' as never]: b.len,
                                    animationDelay: `${b.delay}ms`,
                                }}
                            />
                            <line
                                x1={burst.muzzle.x} y1={burst.muzzle.y} x2={b.x2} y2={b.y2}
                                stroke={`hsl(${Math.min(b.hue + 14, 340)} 100% 86%)`}
                                strokeWidth={3} strokeLinecap="round"
                                className="beacon-beam"
                                style={{
                                    strokeDasharray: b.len,
                                    ['--beam-len' as never]: b.len,
                                    animationDelay: `${b.delay}ms`,
                                }}
                            />

                            {/* 命中反馈（方案 F 的核心）：白心爆闪 + 扩散光环，落在激光飞抵的那一刻 */}
                            <g
                                className="beacon-impact"
                                style={{ animationDelay: `${b.delay + BEAM_GROW_MS}ms` }}
                            >
                                <circle cx={b.x2} cy={b.y2} r={9} fill={`hsl(${b.hue} 100% 92%)`} opacity={0.95} />
                                <circle
                                    cx={b.x2} cy={b.y2} r={10} fill="none"
                                    stroke={`hsl(${b.hue} 100% 80%)`} strokeWidth={3}
                                />
                            </g>
                        </g>
                    ))}
                </g>
            )}
        </svg>
    );
};
