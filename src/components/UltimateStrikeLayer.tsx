// ==========================================
// [2026-09-19 1.0.16 茉莉安] 大招「最终指令」· 逐击演出层
//
// 演出映射（程 2026-09-19 定的六帧用法）：
//   · 准星     → 每一击的起手（落在本击目标身上）
//   · 冲击环 / 光柱 → 每一击的命中瞬间（**按击数交替**，避免重复感）
//   · 紫爆 A/B → **击杀成立**（这一击杀死了，链继续）
//   · 余波     → **链的收尾**（未击杀断链 / 打到水晶 / 到上限）
//
// ── 与引擎的关系：事件 `CHAIN_STRIKE_STEP` 是**一击一发**的，
//    而引擎已改成「一击一步」（每 0.6s 一步）⇒ 演出与伤害**同刻**，不存在错位。
// ── 坐标：复用 VFXLayer 的两把工具（getScreenCTM 逆变换）⇒ 自动跟随缩放。
// ── 并发生命周期：允许**多击同时在屏**（上一击的余韵未散，下一击已开始），
//    故每个 strike 各带 key 与自清理定时器，而不是单例。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { EFFECT_IMAGES } from '../data/imageData';
import { getLocalPos } from './VFXLayer';

/** 单击时间轴（ms）—— 必须塞进驱动器的每步 `CHAIN_STRIKE_STEP_MS`(1000) 内 */
const AIM_IN = 180;         // 准星入场
const IMPACT_AT = 150;      // 冲击帧出现
const IMPACT_MS = 400;      // 冲击帧时长
const BOOM_AT = 380;        // 击杀爆炸出现
const BOOM_MS = 400;        // 击杀爆炸时长
const AFTERGLOW_AT = 420;   // 收尾余波出现
const AFTERGLOW_APPEAR = 180; // 余波淡入
// [2026-09-19 程拍板] 最后一帧是「爆炸后的坑洞」—— 本质是静止的余韵，
//   可以**自由填充任意时长**，最后淡出即可 ⇒ 用它把整段演出兜住。
const AFTERGLOW_HOLD = 1100;  // 坑洞停留（想更长就调这个数）
const AFTERGLOW_FADE = 320;   // 最后的淡出

/** 各帧显示尺寸 = 目标卡宽 × 倍数 */
const SIZE = { aim: 1.5, impact: 2.4, boom: 2.6, afterglow: 3.0 };
/** 光柱贴图的"落点"在贴图偏下位置 ⇒ 底部对齐目标后再上移一点 */
const BEAM_BOTTOM_LIFT = 0.12;

interface Strike {
    key: number;
    x: number;
    y: number;
    cardW: number;
    useBeam: boolean;   // 本击用光柱（否则冲击环）
    killed: boolean;
    done: boolean;
    isNexus: boolean;
    life: number;
}

export const UltimateStrikeLayer: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [mounted, setMounted] = useState(false);
    const [strikes, setStrikes] = useState<Strike[]>([]);
    const seqRef = useRef(0);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;

        const onStep = (p: {
            casterSide: 'player' | 'enemy'; step: number; amount: number;
            victimId?: string; victimKey?: string; killed?: boolean; done?: boolean; nexus?: boolean;
        }) => {
            const svg = svgRef.current;
            if (!svg || !p) return;

            // 目标锚点：普通单位按 data-entity-id；打水晶则用己方对面那块水晶的锚点
            const isNexus = !!p.nexus;
            const anchorId = isNexus
                ? `nexus_${p.casterSide === 'player' ? 'enemy' : 'player'}`
                : p.victimId;
            if (!anchorId) return;
            const el = document.querySelector(`[data-entity-id="${anchorId}"]`) as HTMLElement | null;
            if (!el) {
                console.log(`[UltVFX] 找不到锚点 ${anchorId}，跳过本击演出`);
                return;
            }
            const r = el.getBoundingClientRect();
            const tl = getLocalPos(svg, r.left, r.top);
            const br = getLocalPos(svg, r.right, r.bottom);
            const cardW = Math.abs(br.x - tl.x) || 160;
            const cx = (tl.x + br.x) / 2;
            const cy = (tl.y + br.y) / 2;

            const done = !!p.done;
            const killed = !!p.killed;
            // 收尾那一击：时长由「坑洞停留」兜住（可任意长）；其余按前五帧的节奏
            const life = done
                ? AFTERGLOW_AT + AFTERGLOW_APPEAR + AFTERGLOW_HOLD + AFTERGLOW_FADE
                : Math.max(AIM_IN + 200, IMPACT_AT + IMPACT_MS, killed ? BOOM_AT + BOOM_MS : 0) + 80;

            seqRef.current += 1;
            const strike: Strike = {
                key: seqRef.current,
                x: cx, y: cy, cardW,
                useBeam: p.step % 2 === 0, // 按击数交替（奇偶），避免每击都一样
                killed, done, isNexus,
                life,
            };
            setStrikes(prev => [...prev, strike]);
            setTimeout(() => setStrikes(prev => prev.filter(s => s.key !== strike.key)), life);

            console.log(`[UltVFX] 第 ${p.step} 击演出：${isNexus ? '水晶' : p.victimKey} ${killed ? '（击杀）' : ''}${done ? '（收尾）' : ''}`);
        };

        eventBus.on(GameEvents.CHAIN_STRIKE_STEP, onStep);
        return () => { eventBus.off(GameEvents.CHAIN_STRIKE_STEP, onStep); };
    }, [mounted]);

    /** 生成一个"居中于目标"的贴图坐标 */
    const boxOf = (s: Strike, ratio: number, anchorBottom = false) => {
        const size = s.cardW * ratio;
        return {
            x: s.x - size / 2,
            y: anchorBottom ? s.y - size + size * BEAM_BOTTOM_LIFT : s.y - size / 2,
            size,
        };
    };

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-[27]"
            style={{ overflow: 'visible' }}
        >
            {strikes.map(s => {
                const aim = boxOf(s, SIZE.aim);
                // 光柱从天而降 ⇒ 以「底部中心」对齐目标；冲击环居中
                const impact = boxOf(s, SIZE.impact, s.useBeam);
                const boom = boxOf(s, SIZE.boom);
                const after = boxOf(s, SIZE.afterglow);
                return (
                    <g key={s.key}>
                        {/* ① 准星：本击起手 */}
                        <image
                            href={EFFECT_IMAGES.marianUltAim}
                            x={aim.x} y={aim.y} width={aim.size} height={aim.size}
                            preserveAspectRatio="xMidYMid meet"
                            className="ult-aim"
                        />

                        {/* ② 命中：冲击环 / 光柱 交替（光柱底部对齐目标，读作"从天而降砸在它身上"） */}
                        <image
                            href={s.useBeam ? EFFECT_IMAGES.marianUltBeam : EFFECT_IMAGES.marianUltShockwave}
                            x={impact.x} y={impact.y} width={impact.size} height={impact.size}
                            preserveAspectRatio="xMidYMid meet"
                            className="ult-impact"
                            style={{ animationDelay: `${IMPACT_AT}ms` }}
                        />

                        {/* ③ 击杀成立 → 紫爆 */}
                        {s.killed && (
                            <image
                                href={s.key % 2 === 0 ? EFFECT_IMAGES.marianUltBoomA : EFFECT_IMAGES.marianUltBoomB}
                                x={boom.x} y={boom.y} width={boom.size} height={boom.size}
                                preserveAspectRatio="xMidYMid meet"
                                className="ult-boom"
                                style={{ animationDelay: `${BOOM_AT}ms` }}
                            />
                        )}

                        {/* ④ 收尾（未击杀断链 / 打到水晶 / 到上限）→ 余波 */}
                        {s.done && (
                            <image
                                href={EFFECT_IMAGES.marianUltAfterglow}
                                x={after.x} y={after.y} width={after.size} height={after.size}
                                preserveAspectRatio="xMidYMid meet"
                                className="ult-afterglow"
                                // 淡出的延迟 = 出现之后 + 停留时长 ⇒ 想停留多久都行，最后自然淡出
                                style={{ animationDelay: `${AFTERGLOW_AT}ms, ${AFTERGLOW_AT + AFTERGLOW_APPEAR + AFTERGLOW_HOLD}ms` }}
                            />
                        )}
                    </g>
                );
            })}
        </svg>
    );
};
