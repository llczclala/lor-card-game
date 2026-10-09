/**
 * CostReduceVFXLayer — 减费特效层「绿潮降临」（P1）
 *
 * ═══════════════════════════════════════════════════════════════════
 *  [2026-10-08 莉莉子 · 减费特效]
 *
 *  数据来源：`logic/costReduceVFX.ts` 的 `emitCostReduceVFX()`（唯一出口）
 *  设计文档：技术手册/设计-减费特效.md
 *
 *  ── 演出（四幕）
 *     幕一 源头炸裂：白热闪光 + 3 道环形冲击波
 *     幕二 能量奔流：粗-细-粗能量束沿弧线射向手牌（多张时错开 60ms 依次抵达）
 *     幕三 手牌命中：卡面能量罩炸开 + 费用数字**老虎机翻滚**定格 + 大字 −N 炸出
 *     幕四 定格余韵：演出层整体淡出（费用显示交还给卡牌自身的绿字）
 *
 *  ══════════════════════════════════════════════════════════════════
 *  ⚠️ 坐标系的坑（2026-10-08 独立审查挑出，已修）—— 改动本文件前务必读完
 *  ══════════════════════════════════════════════════════════════════
 *  卡牌的 DOM 结构是**两层坐标系**：
 *      · `[data-entity-id]` 根节点（Card 的 Framer Motion 根）= 卡根坐标系，
 *        hand 时 class 是 `w-[130px] h-[202px]`（Card.tsx:1046-1048）⇒ offsetWidth = 130
 *      · 真正的卡面是一层 `288×448` 的内层盒（Card.tsx:1016-1017 BASE_WIDTH/HEIGHT），
 *        被 `transform: scale(0.45)` + `transformOrigin: 'top left'` 整体缩小（Card.tsx:1512-1518）
 *      · **费用圆盘住在那层 288 坐标系里**：`absolute top-4 left-4 w-12 h-12`（Card.tsx:1594）
 *        ⇒ 盘心 (40,40)、半径 24（都是 288 坐标系的值），盘内数字是 `text-2xl`(24px)
 *  ⇒ **"卡内 CSS 像素 → SVG"的换算比不是 1，而是 0.45 × 卡根自身的缩放。**
 *     初版曾用 `w / el.offsetWidth`（= 130/130 = 1）当比例，导致盖盘偏 22px、半径虚大 2.2×。
 *
 *  另一个坑：手牌是**扇形排布带旋转**的，而且 rotate 加在 `AnimatedHandCard` 的**包裹层**上
 *  （CardAnimations.tsx:114-119，`origin-bottom`），**不在** `[data-entity-id]` 元素上
 *  ⇒ 读 `getComputedStyle(el).transform` 拿不到旋转，`getBoundingClientRect()` 给的也只是
 *     **旋转后的轴对齐包围盒**（bbox 宽高会被撑大，不是卡牌宽高）。
 *  ⇒ 因此本层**不解析变换矩阵**，改为**直接锚定费用圆盘那个 DOM**：
 *     · 圆的 bbox 中心在任意旋转下恒等于圆心，bbox 宽恒等于直径 —— 旋转无关，天然精确
 *     · 拿到盘半径后反推比例：`u = 盘半径_SVG / 24`（24 是 288 坐标系里的盘半径）
 *     · 再用「盘心 − 卡心」的实测向量与理论向量 `(-104,-184)` 比对，解出旋转角
 *  ⇒ 找不到圆盘元素时**绝不猜位置**：退化为"只画能量罩 + 大字 −N"，不画盖盘与滚字
 *     （画一个错位置的蓝盘，比不画更糟 —— 这句是这次踩坑的总结）
 *
 *  📌 若将来想彻底归口：给 Card.tsx / SpellCard.tsx 的费用圆盘各加一个 `data-cost-pip` 属性，
 *     本文件的 `findCostPipEl` 已优先认这个标记，加上即可跳过尺寸启发式。
 *
 *  ── 其余两条零侵入原则
 *     ② **不碰 `index.css`**：keyframes 用组件内 `<style>` 内联（前缀 `crv-`，已 grep 确认无撞名）
 *     ③ **不改 `Card.tsx` 状态机**：数字层是浮层，演完卸载
 * ═══════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useRef, useState } from 'react';
import { eventBus } from '../utils/eventBus';
import { getElementCenter, getLocalPos } from './VFXLayer';
import {
    COST_REDUCE_VFX_EVENT,
    type CostReduceVFXPayload,
} from '../logic/costReduceVFX';

// ==========================================
// 视觉常量
// ==========================================

/** 色板 —— 青柠绿，刻意避开再生 green / 剧毒 teal */
const C = {
    core: '#ffffff',
    beam: '#a3e635',
    glow: '#4ade80',
    pipBase: '#2563eb',   // 费用圆盘底色（对齐 Card.tsx:1594 的 bg-blue-600）
    pipEdge: '#facc15',   // 费用圆盘金边（对齐 border-yellow-400）
};

// ── 卡内常量：全部是 **288 坐标系**（内层盒）里的值，对齐 Card.tsx ──
const BASE_W = 288;          // Card.tsx:1016
const BASE_H = 448;          // Card.tsx:1017
const PIP_CX_IN = 40;        // top-4(16) + w-12 半径(24)
const PIP_CY_IN = 40;        // 法术卡是 w-14(半径28) ⇒ 同上为 44，见下方向量法的误差说明
const CARD_RADIUS_IN = 16;   // 内层盒 rounded-2xl = 16px（Card.tsx:1519）

/** 理论向量：卡中心 → 盘心（288 坐标系，未旋转）。用来反解旋转角的基准 */
const V_IN = { x: PIP_CX_IN - BASE_W / 2, y: PIP_CY_IN - BASE_H / 2 }; // (-104, -184)

/** 时间轴（ms）—— 与下方 <style> 内 keyframes 一一对应，改一处记得改另一处 */
const SOURCE_FLASH = 260;
const RING_DUR = 560;
const RING_STAGGER = 90;
const BEAM_LEAD = 140;
const BEAM_GROW = 300;
const BEAM_STAGGER = 60;
const IMPACT = 380;
const ROLL_STEP = 68;
const FLOAT = 900;
const FADE_OUT = 400;
const LINGER = 200;

/** 同时最多保留几条演出（防同 tick 多发改动互相覆盖，见下方队列注释） */
const MAX_CONCURRENT_FX = 3;

/** 安全版 querySelector：id 直接拼进选择器，含 `"` / `\` 会抛 SyntaxError，
 *  而本层的调用发生在 `processEffect` 的**同步结算链路**里（effectProcessor.ts:4041）
 *  ⇒ 异常会打断整回合结算，不只是特效不播。（审查 C-1） */
const byEntityId = (id: string): HTMLElement[] => {
    const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
    return Array.from(document.querySelectorAll(`[data-entity-id="${esc}"]`)) as HTMLElement[];
};

/** 在手牌卡元素内找到「费用圆盘」。
 *  优先认未来的归口标记 `data-cost-pip`；否则用尺寸启发式：
 *  近圆形 + 直径落在卡短边的 10%~35%（288 系 48/56px → 卡根 21.6/25.2px，比例约 0.17~0.19；
 *  可排除大圆（原画容器 208px → 0.72）与小图标（24px → 0.083））。 */
const findCostPipEl = (cardEl: HTMLElement, cardBoxW: number, cardBoxH: number): HTMLElement | null => {
    const tagged = cardEl.querySelector('[data-cost-pip]');
    if (tagged) return tagged as HTMLElement;

    const shortSide = Math.max(1, Math.min(cardBoxW, cardBoxH));
    const cands = cardEl.querySelectorAll('div.rounded-full');
    for (const node of Array.from(cands)) {
        const el = node as HTMLElement;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (Math.abs(r.width - r.height) > r.width * 0.25) continue;  // 必须是近圆形
        const ratio = r.width / shortSide;
        if (ratio < 0.1 || ratio > 0.35) continue;                     // 排除大圆 / 小图标
        return el;
    }
    return null;
};

/** 手牌卡 DOM 的挑选：手牌区固定在屏幕底部（GameSession.tsx:3404 `absolute bottom-0`）
 *  ⇒ 同一 id 存在多个实例时，取 `rect.top` 最大（最靠下）的那个。
 *  —— 调用方需先用 side 限定（只有玩家手牌才可见，见 D-3）。 */
const resolveHandCardEl = (cardId: string): HTMLElement | null => {
    const list = byEntityId(cardId);
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];
    let best: HTMLElement | null = null;
    let bestTop = -Infinity;
    list.forEach(el => {
        const top = el.getBoundingClientRect().top;
        if (top > bestTop) { bestTop = top; best = el; }
    });
    return best;
};

// ==========================================
// 类型
// ==========================================

interface CardAnchor {
    id: string;
    /** 卡内 288 坐标系像素 → SVG 用户单位的比例（≈0.45×卡根缩放；由盘半径反推） */
    u: number;
    /** 卡中心（SVG 用户坐标）—— bbox 中心在「rotate + origin-bottom」下仍等于卡中心 */
    cx: number; cy: number;
    /** 卡在 SVG 里的尺寸（未旋转，已乘 u） */
    w: number; h: number;
    /** 旋转角（度，CSS 顺时针 / y-down）；无盘可测时为 0 */
    rotDeg: number;
    /** 能量罩圆角（SVG 单位） */
    radius: number;
    /** 费用圆盘（SVG 用户坐标）。hasPip=false 时不画盖盘与滚字 */
    hasPip: boolean;
    pipX: number; pipY: number; pipR: number;
    /** 数字翻滚序列（拿不到原价时为空 ⇒ 不盖盘） */
    roll: number[];
    /** 命中时刻（相对演出起点的 ms） */
    hitAt: number;
}

interface BeamGeo {
    key: string; d: string; len: number; delay: number;
}

interface CostFx {
    key: number;
    bornAt: number;
    amount: number;
    showFloat: boolean;
    showSource: boolean;
    source: { x: number; y: number };
    beams: BeamGeo[];
    cards: CardAnchor[];
    fadeOutAt: number;
    life: number;
}

/** 简化版能量束几何：二次贝塞尔 + 末端切线箭头（自包含实现，
 *  **不** export VFXLayer 的私有 buildDynamicWidthPath —— 避免为复用而改动现有文件） */
const buildBeamPath = (
    from: { x: number; y: number },
    to: { x: number; y: number },
): { d: string; len: number } => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    const offset = Math.min(dist * 0.28, 180);
    const ctrlX = (from.x + to.x) / 2;
    const ctrlY = (from.y + to.y) / 2 - offset;
    const endDx = to.x - ctrlX;
    const endDy = to.y - ctrlY;
    const endLen = Math.max(Math.hypot(endDx, endDy), 0.001);
    const ux = endDx / endLen;
    const uy = endDy / endLen;
    const ARROW = 26;
    const ARROW_W = 14;
    const baseX = to.x - ux * ARROW;
    const baseY = to.y - uy * ARROW;
    const nx = -uy;
    const ny = ux;
    const d =
        `M ${from.x} ${from.y} ` +
        `Q ${ctrlX} ${ctrlY} ${baseX} ${baseY} ` +
        `L ${baseX + nx * ARROW_W} ${baseY + ny * ARROW_W} ` +
        `L ${to.x} ${to.y} ` +
        `L ${baseX - nx * ARROW_W} ${baseY - ny * ARROW_W} Z`;
    return { d, len: dist * 1.15 };
};

// ==========================================
// 组件内联 keyframes
// ==========================================
const CRV_CSS = `
@keyframes crv-flash {
  0%   { opacity: 0; transform: scale(.3); }
  30%  { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(2.4); }
}
.crv-flash { transform-box: fill-box; transform-origin: center; animation: crv-flash ${SOURCE_FLASH}ms ease-out both; }

@keyframes crv-ring {
  0%   { opacity: .95; transform: scale(.18); }
  70%  { opacity: .45; }
  100% { opacity: 0; transform: scale(1.85); }
}
.crv-ring { transform-box: fill-box; transform-origin: center; animation: crv-ring var(--dur, ${RING_DUR}ms) cubic-bezier(.2,.9,.3,1) both; }

@keyframes crv-beam {
  from { stroke-dashoffset: var(--len); opacity: .15; }
  to   { stroke-dashoffset: 0; opacity: 1; }
}
.crv-beam { animation: crv-beam var(--dur, ${BEAM_GROW}ms) ease-out both; }

@keyframes crv-shell {
  0%   { opacity: 0; transform: scale(.84); }
  26%  { opacity: 1; transform: scale(1.05); }
  62%  { opacity: .9; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.07); }
}
.crv-shell { transform-box: fill-box; transform-origin: center; animation: crv-shell var(--dur, ${IMPACT}ms) ease-out both; }

@keyframes crv-pip-cover {
  0%   { opacity: 0; transform: scale(.6); }
  22%  { opacity: 1; transform: scale(1); }
  100% { opacity: 1; transform: scale(1); }
}
.crv-pip-cover { transform-box: fill-box; transform-origin: center; animation: crv-pip-cover 120ms ease-out both; }

@keyframes crv-roll-in {
  from { opacity: 0; transform: translateY(46%); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes crv-roll-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-46%); }
}
.crv-roll-mid { transform-box: fill-box; transform-origin: center;
  animation: crv-roll-in ${ROLL_STEP}ms ease-out both, crv-roll-out ${ROLL_STEP}ms ease-in both; }
.crv-roll-final { transform-box: fill-box; transform-origin: center;
  animation: crv-roll-in ${ROLL_STEP}ms ease-out both; }

@keyframes crv-float {
  0%   { opacity: 0; transform: translateY(10px) scale(.7); }
  20%  { opacity: 1; transform: translateY(-4px) scale(1.18); }
  52%  { opacity: 1; transform: translateY(-14px) scale(1); }
  100% { opacity: 0; transform: translateY(-38px) scale(.95); }
}
.crv-float { transform-box: fill-box; transform-origin: center;
  animation: crv-float ${FLOAT}ms cubic-bezier(.16,1,.3,1) both; }

@keyframes crv-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.crv-fade-out { animation: crv-fade-out ${FADE_OUT}ms ease-in both; }
`;

// ==========================================
// 主组件
// ==========================================
export const CostReduceVFXLayer: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [mounted, setMounted] = useState(false);
    const [fxs, setFxs] = useState<CostFx[]>([]);
    const seqRef = useRef(0);

    // [对齐 VFXLayer / BeaconExplosionLayer] 首次绘制拿不到 CTM，等挂载后再监听
    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!mounted) return;

        const onCostReduce = (payload: CostReduceVFXPayload) => {
            const svg = svgRef.current;
            if (!svg || !payload?.cardIds?.length) return;

            const tier = payload.tier ?? 'full';
            const isLite = tier === 'lite';
            const isAmbience = tier === 'ambience';

            // ── 源头锚点：显式 sourceId 优先，否则按 side 回落到该侧水晶
            //     （GameSession 用 `nexus_player`/`nexus_enemy`；GameUI 用 `player_nexus`/`enemy_nexus`，两套并存）
            const fallbackIds = payload.side === 'player'
                ? ['nexus_player', 'player_nexus']
                : ['nexus_enemy', 'enemy_nexus'];
            let source: { x: number; y: number } | null = null;
            if (payload.sourceId) source = getElementCenter(payload.sourceId, svg);
            if (!source) {
                for (const id of fallbackIds) {
                    const pos = getElementCenter(id, svg);
                    if (pos) { source = pos; break; }
                }
            }

            // ── 手牌锚点（触发瞬间抓一次坐标）
            //  ⚠️ 只有**玩家侧**才锚手牌：敌方手牌虽然是真实渲染的 Card（CardAnimations.tsx:562），
            //     但玩家看到的是背面、且带 180° 翻转；往上画盖盘/滚字既没意义也会错位。
            //     AI 减费时退化为"只播源头发动层"。（审查 D-3）
            const cards: CardAnchor[] = [];
            if (payload.side === 'player') {
                payload.cardIds.forEach((cardId, i) => {
                    const el = resolveHandCardEl(cardId);
                    if (!el) return;                       // 卡已离场 / 不可见 → 跳过该张
                    const cardRect = el.getBoundingClientRect();
                    if (cardRect.width <= 0 || cardRect.height <= 0) return;

                    // bbox 中心 = 卡中心：手牌 rotate 的 transform-origin 是 bottom（CardAnimations.tsx:114），
                    // 而卡中心恰在旋转轴正上方 ⇒ bbox 中心与卡中心重合（b轴只影响宽高，不影响中心）
                    const cxS = (cardRect.left + cardRect.right) / 2;
                    const cyS = (cardRect.top + cardRect.bottom) / 2;
                    const center = getLocalPos(svg, cxS, cyS);

                    const pipEl = findCostPipEl(el, cardRect.width, cardRect.height);
                    let hasPip = false;
                    let pipX = center.x, pipY = center.y, pipR = 0;
                    let u = 0;
                    let rotDeg = 0;

                    if (pipEl) {
                        const pr = pipEl.getBoundingClientRect();
                        if (pr.width > 0 && pr.height > 0) {
                            const pcx = (pr.left + pr.right) / 2;
                            const pcy = (pr.top + pr.bottom) / 2;
                            const pc = getLocalPos(svg, pcx, pcy);
                            // 半径：用两个屏幕点做差 → 自动抵消 SVG 容器自身的缩放（不必知道 gameScale）
                            const pL = getLocalPos(svg, pcx - pr.width / 2, pcy);
                            const pR = getLocalPos(svg, pcx + pr.width / 2, pcy);
                            const rSvg = Math.abs(pR.x - pL.x) / 2;

                            if (rSvg > 0.5) {
                                hasPip = true;
                                pipX = pc.x; pipY = pc.y; pipR = rSvg;
                                // 比例 u 与旋转角都由「盘心 − 卡心」向量反解。
                                //  ⚠️ 不要用盘半径反推 u：单位卡圆盘 w-12(半径24)、法术卡 w-14(半径28)，
                                //     用 `rSvg / 24` 会让法术卡整体高估 16.7%；而理论向量在两种卡上
                                //     只差 2.7%（(-104,-184) vs (-100,-180)），误差可忽略。
                                const vxSvg = pc.x - center.x;
                                const vySvg = pc.y - center.y;
                                const lenSvg = Math.hypot(vxSvg, vySvg);
                                const lenTheory = Math.hypot(V_IN.x, V_IN.y);
                                if (lenSvg > 1 && lenTheory > 1) {
                                    u = lenSvg / lenTheory;
                                    rotDeg = (Math.atan2(vySvg, vxSvg) - Math.atan2(V_IN.y, V_IN.x)) * 180 / Math.PI;
                                }
                            }
                        }
                    }

                    // 拿不到圆盘就**不猜**：退化为 bbox 尺寸的能量罩 + 大字，不画盖盘与滚字
                    if (!hasPip) {
                        const p1 = getLocalPos(svg, cardRect.left, cardRect.top);
                        const p2 = getLocalPos(svg, cardRect.right, cardRect.bottom);
                        const bw = Math.abs(p2.x - p1.x);
                        const bh = Math.abs(p2.y - p1.y);
                        if (bw <= 0 || bh <= 0) return;
                        u = 0;
                        cards.push({
                            id: cardId,
                            u,
                            cx: center.x, cy: center.y,
                            w: bw, h: bh,
                            rotDeg: 0,
                            radius: 8,
                            hasPip: false,
                            pipX: center.x, pipY: center.y, pipR: 0,
                            roll: [],
                            hitAt: isLite || isAmbience ? i * BEAM_STAGGER : BEAM_LEAD + i * BEAM_STAGGER + BEAM_GROW,
                        });
                        return;
                    }

                    // 数字翻滚：只在拿得到「减费前原价」时生成（拿不到就不盖盘）
                    const roll: number[] = [];
                    if (!isAmbience) {
                        const before = payload.beforeCosts?.[cardId];
                        if (typeof before === 'number') {
                            const after = Math.max(0, before - payload.amount);
                            if (before > after) {
                                for (let v = before; v >= after; v--) roll.push(v);
                            }
                        }
                    }

                    // u 反解失败（向量退化）时回落到 hand 的已知基准 0.45，别让尺寸变 0
                    const safeU = u > 0 ? u : 0.45;

                    cards.push({
                        id: cardId,
                        u: safeU,
                        cx: center.x, cy: center.y,
                        w: BASE_W * safeU, h: BASE_H * safeU,
                        rotDeg,
                        radius: Math.max(3, CARD_RADIUS_IN * safeU),
                        hasPip: true,
                        pipX, pipY, pipR,
                        roll,
                        hitAt: isLite || isAmbience ? i * BEAM_STAGGER : BEAM_LEAD + i * BEAM_STAGGER + BEAM_GROW,
                    });
                });
            }

            const showSource = !isLite && !!source;
            if (cards.length === 0 && !showSource) {
                console.log('[CostReduceVFX] 无可用锚点，跳过演出');
                return;
            }

            // ── 能量束（只有 FULL 档、且源头存在时才有意义）
            const beams: BeamGeo[] = [];
            if (tier === 'full' && source) {
                const src = source;
                cards.forEach((c, i) => {
                    const target = c.hasPip ? { x: c.pipX, y: c.pipY } : { x: c.cx, y: c.cy };
                    const geo = buildBeamPath(src, target);
                    beams.push({ key: `${c.id}-beam`, d: geo.d, len: geo.len, delay: BEAM_LEAD + i * BEAM_STAGGER });
                });
            }

            // ── 生命周期
            const lastHit = cards.length > 0
                ? Math.max(...cards.map(c => c.hitAt))
                : SOURCE_FLASH;
            const rollTotal = cards.length > 0
                ? Math.max(0, ...cards.map(c => (c.roll.length - 1) * ROLL_STEP + ROLL_STEP))
                : 0;
            const tail = cards.length === 0
                ? SOURCE_FLASH + RING_STAGGER * 2 + RING_DUR
                : (isAmbience ? IMPACT : Math.max(IMPACT, rollTotal, FLOAT));
            const life = lastHit + tail + FADE_OUT + LINGER;

            seqRef.current += 1;
            const next: CostFx = {
                key: seqRef.current,
                bornAt: Date.now(),
                amount: payload.amount,
                showFloat: !isAmbience,
                showSource,
                source: source ?? { x: 0, y: 0 },
                beams,
                cards,
                fadeOutAt: Math.max(0, life - FADE_OUT),
                life,
            };

            // ⚠️ 队列而非单值覆盖：同一次打击里 attacker / blocker 是在**同一同步段**先后触发
            //    打击雷达的（useGameState.ts:4083-4088，两者之间没有 await），双方都带减费单位时
            //    会连着 emit 两次；React 会批处理两次 setState ⇒ 若用单值，先到的演出**一帧都播不出来**，
            //    而 emit 侧日志照打"演出 FULL"，排查时会被日志骗。（审查 B-1 / D-1）
            setFxs(prev => [...prev, next].slice(-MAX_CONCURRENT_FX));

            console.log(
                `[CostReduceVFX] 演出 ${tier.toUpperCase()} · 束 ${beams.length} · 卡 ${cards.length}` +
                (source ? '' : '（无源锚点）')
            );
        };

        eventBus.on(COST_REDUCE_VFX_EVENT, onCostReduce);
        return () => { eventBus.off(COST_REDUCE_VFX_EVENT, onCostReduce); };
    }, [mounted]);

    // ── 到点卸载：逐条按「出生时刻 + life」计算剩余时间，
    //    这样队列里新增一条时，不会把已有条目的卸载时间往后推。
    useEffect(() => {
        if (fxs.length === 0) return;
        const now = Date.now();
        const timers = fxs.map(f => setTimeout(() => {
            setFxs(prev => prev.filter(p => p.key !== f.key));
        }, Math.max(0, f.bornAt + f.life - now)));
        return () => { timers.forEach(t => clearTimeout(t)); };
    }, [fxs]);

    return (
        <>
            <style>{CRV_CSS}</style>
            <svg
                ref={svgRef}
                // z-[41]：**必须高于手牌层 z-40**（GameSession.tsx:3404 形成 stacking context，可压住内部 z-[999]）。
                // ⚠️ 代价：也同时压住了 VFXLayer(25) / BeaconExplosionLayer(26) / UltimateStrikeLayer(27)；
                //    但弹道层 SpellProjectile(95) / SpellImpactLayer(140) 仍在上面。
                //    经验：若将来要同时播大招演出，宜把三个特效层整体抬到 41+ 重新分档，而不是本层单方面跳。
                className="absolute inset-0 w-full h-full pointer-events-none z-[41]"
                style={{ overflow: 'visible' }}
            >
                {fxs.map(fx => (
                    <g key={fx.key}>
                        {/* ═══ 幕一：源头炸裂 ═══ */}
                        {fx.showSource && (
                            <g transform={`translate(${fx.source.x} ${fx.source.y})`}>
                                <circle r={26} fill={C.core} opacity={0.9} className="crv-flash" />
                                {[0, 1, 2].map(i => (
                                    <circle
                                        key={i}
                                        r={46}
                                        fill="none"
                                        stroke={C.glow}
                                        strokeWidth={3}
                                        className="crv-ring"
                                        style={{
                                            animationDelay: `${i * RING_STAGGER}ms`,
                                            ['--dur' as never]: `${RING_DUR}ms`,
                                        }}
                                    />
                                ))}
                            </g>
                        )}

                        {/* ═══ 幕二：能量奔流 ═══ */}
                        {fx.beams.map(b => (
                            <g key={b.key}>
                                <path
                                    d={b.d} fill="none" stroke={C.beam} strokeWidth={9}
                                    strokeLinecap="round" opacity={0.45} className="crv-beam"
                                    style={{
                                        strokeDasharray: b.len,
                                        ['--len' as never]: b.len,
                                        ['--dur' as never]: `${BEAM_GROW}ms`,
                                        animationDelay: `${b.delay}ms`,
                                    }}
                                />
                                <path
                                    d={b.d} fill="none" stroke={C.core} strokeWidth={2.5}
                                    strokeLinecap="round" className="crv-beam"
                                    style={{
                                        strokeDasharray: b.len,
                                        ['--len' as never]: b.len,
                                        ['--dur' as never]: `${BEAM_GROW}ms`,
                                        animationDelay: `${b.delay}ms`,
                                    }}
                                />
                            </g>
                        ))}

                        {/* ═══ 幕三：手牌命中 ═══ */}
                        {fx.cards.map(c => (
                            <g key={c.id}>
                                {/* ① 卡面能量罩（随卡旋转，贴住卡形） */}
                                <rect
                                    x={-c.w / 2} y={-c.h / 2} width={c.w} height={c.h}
                                    rx={c.radius}
                                    fill={C.glow} fillOpacity={0.12}
                                    stroke={C.beam} strokeWidth={Math.max(1.5, 3 * c.u || 2)}
                                    className="crv-shell"
                                    transform={`translate(${c.cx} ${c.cy}) rotate(${c.rotDeg})`}
                                    style={{
                                        ['--dur' as never]: `${IMPACT}ms`,
                                        animationDelay: `${c.hitAt}ms`,
                                    }}
                                />

                                {/* ② 数字演出层：盖盘 + 老虎机翻滚（只在锚到圆盘且拿到原价时画） */}
                                {c.hasPip && c.roll.length > 0 && (
                                    <g transform={`translate(${c.pipX} ${c.pipY}) rotate(${c.rotDeg})`}>
                                        <g className="crv-fade-out" style={{ animationDelay: `${fx.fadeOutAt}ms` }}>
                                            {/* 盖住原费用数字（复刻圆盘的蓝底金边） */}
                                            <circle
                                                r={c.pipR}
                                                fill={C.pipBase}
                                                stroke={C.pipEdge}
                                                strokeWidth={Math.max(1.2, 2 * c.u)}
                                                className="crv-pip-cover"
                                                style={{ animationDelay: `${c.hitAt}ms` }}
                                            />
                                            {/* 老虎机翻滚：每个中间值一格，最后一格定格 */}
                                            {c.roll.map((v, i) => {
                                                const isFinal = i === c.roll.length - 1;
                                                const base = c.hitAt + i * ROLL_STEP;
                                                return (
                                                    <text
                                                        key={i}
                                                        x={0} y={0}
                                                        textAnchor="middle"
                                                        dominantBaseline="central"
                                                        fill={C.core}
                                                        fontWeight={900}
                                                        fontSize={Math.max(6, c.pipR * 1.25)}
                                                        className={isFinal ? 'crv-roll-final' : 'crv-roll-mid'}
                                                        style={{
                                                            animationDelay: isFinal
                                                                ? `${base}ms`
                                                                : `${base}ms, ${base + ROLL_STEP}ms`,
                                                        }}
                                                    >
                                                        {v}
                                                    </text>
                                                );
                                            })}
                                        </g>
                                    </g>
                                )}

                                {/* ③ 大字 −N 炸出（不随卡旋转，保证任何姿势下都读得清） */}
                                {fx.showFloat && (
                                    <text
                                        x={c.cx}
                                        y={c.cy - c.h / 2 - Math.max(10, 14 * (c.u || 0.45))}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fill={C.beam}
                                        fontWeight={900}
                                        fontSize={Math.max(14, 40 * (c.u || 0.45))}
                                        stroke="rgba(0,0,0,0.55)"
                                        strokeWidth={Math.max(2, 4 * (c.u || 0.45))}
                                        paintOrder="stroke"
                                        className="crv-float"
                                        style={{ animationDelay: `${c.hitAt + 40}ms` }}
                                    >
                                        −{fx.amount}
                                    </text>
                                )}
                            </g>
                        ))}
                    </g>
                ))}
            </svg>
        </>
    );
};
