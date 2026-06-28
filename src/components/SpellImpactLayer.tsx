/**
 * SpellImpactLayer — 独立受击特效解耦层
 * * 核心机制：
 * 1. 纯事件驱动：监听 IMPACT_TRIGGER，无需 React 状态传递。
 * 2. 坐标换算：完美规避 ScaleWrapper，获取目标的相对容器坐标，生成覆盖层。
 * 3. 隔山打牛：通过 GSAP 远程抓取 target DOM，触发震动，解放卡牌组件的耦合。
 */
import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { eventBus } from '../utils/eventBus';
import { EFFECT_IMAGES } from '../data/imageData'; // [核心新增] 引入我们在图库里注册的新特效图片

// 暴露标准化的触发事件名
export const ImpactEvents = {
    TRIGGER: 'VFX_IMPACT_TRIGGER'
} as const;

interface ImpactInstance {
    id: string;
    targetId: string;
    impactType: string; // [新增] 接收法术基因，区分专属特效
    x: number;
    y: number;
    w: number;
    h: number;
    patternIndex: number;
}

export const SpellImpactLayer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [impacts, setImpacts] = useState<ImpactInstance[]>([]);

    // ==========================================
    // 1. 兵工厂总控台：监听发射信号并计算物理坐标
    // ==========================================
    useEffect(() => {
        const handleImpact = (payload: { targetId: string, impactType?: string }) => { // [新增] 接收 impactType
            const { targetId, impactType } = payload;
            const container = containerRef.current;
            const targetEl = document.querySelector(`[data-entity-id="${targetId}"]`);

            if (!container || !targetEl) {
                console.warn(`[ImpactLayer] 目标 ${targetId} 已丢失或脱离 DOM，取消受击特效。`);
                return;
            }

            // [坐标逆转换算法] 免疫 ScaleWrapper 的畸变！
            const contRect = container.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();

            const scaleX = contRect.width / container.offsetWidth || 1;
            const scaleY = contRect.height / container.offsetHeight || 1;

            const localX = (targetRect.left - contRect.left) / scaleX;
            const localY = (targetRect.top - contRect.top) / scaleY;
            const localW = targetRect.width / scaleX;
            const localH = targetRect.height / scaleY;

            // 派发一个新的爆炸任务
            const newImpact: ImpactInstance = {
                id: Math.random().toString(36).substring(2, 9),
                targetId,
                impactType: impactType || '', // [新增] 保存法术基因
                x: localX,
                y: localY,
                w: localW,
                h: localH,
                patternIndex: Math.floor(Math.random() * 3)
            };

            setImpacts(prev => [...prev, newImpact]);
        };

        eventBus.on(ImpactEvents.TRIGGER, handleImpact);
        return () => { eventBus.off(ImpactEvents.TRIGGER, handleImpact); };
    }, []);

    // ==========================================
    // 2. 动画引擎：渲染红闪裂纹，并“隔山打牛”震动卡牌
    // ==========================================
    useEffect(() => {
        impacts.forEach(impact => {
            const overlayEl = document.getElementById(`impact-${impact.id}`);
            if (!overlayEl) return;

            // 防止 React 重复执行同一条时间线
            if (overlayEl.dataset.animated === 'true') return;
            overlayEl.dataset.animated = 'true';

            const crackEl = overlayEl.querySelector('.hit-crack');
            const flashEl = overlayEl.querySelector('.hit-flash');

            // [终极解耦] 隔山打牛：去抓取真实卡牌里的减震器（我们后续会在 Card.tsx 里给内层 div 加上这个标记）
            // 如果没找到专用的减震器，就直接摇晃整个实体
            const targetEl = document.querySelector(`[data-shake-target="${impact.targetId}"]`) ||
                             document.querySelector(`[data-entity-id="${impact.targetId}"]`);

            const tl = gsap.timeline({
                onComplete: () => {
                    // 动画播完，安全销毁这个爆炸覆盖层
                    setImpacts(prev => prev.filter(i => i.id !== impact.id));
                }
            });

            const isMauxirPedestal = impact.impactType === 'mauxir_lotus_pedestal';

            // A. 远程物理震荡目标
            if (targetEl) {
                gsap.killTweensOf(targetEl, "x");
                gsap.set(targetEl, { x: 0 });
                if (isMauxirPedestal) {
                    // 基座打击：科技感轻量微震 (甚至可以移除，仅留视觉反馈)
                    tl.to(targetEl, { x: 2, duration: 0.05, repeat: 1, yoyo: true, ease: "power1.out" }, 0)
                      .to(targetEl, { x: 0, duration: 0.1 }, 0.1);
                } else {
                    // 默认打击：狂暴撕裂震动
                    tl.to(targetEl, { x: 7, duration: 0.04, repeat: 2, yoyo: true, ease: "power1.out" }, 0)
                      .to(targetEl, { x: -5, duration: 0.04, repeat: 2, yoyo: true, ease: "power1.out" }, 0.08)
                      .to(targetEl, { x: 3, duration: 0.04, repeat: 1, yoyo: true, ease: "power1.out" }, 0.18)
                      .to(targetEl, { x: 0, duration: 0.12, ease: "power2.in" }, 0.3);
                }
            }

            // B. 瞬间爆发闪屏与特效图层
            if (flashEl && crackEl) {
                if (isMauxirPedestal) {
                    // 基座专属动画：全息翻转放大扫描
                    gsap.set(crackEl, { scale: 0.5, opacity: 0, rotation: 0 });
                    gsap.set(flashEl, { opacity: 0 });

                    tl.to(flashEl, { opacity: 0.6, duration: 0.06 }, 0)
                      .to(flashEl, { opacity: 0, duration: 0.4 }, 0.06)
                      // 第1段（0~0.12s）：瞬间出现，反转放大
                      .to(crackEl, { scale: 1.2, opacity: 1, rotation: 180, duration: 0.12, ease: "power2.out" }, 0)
                      // 第2段（0.12~0.7s）：持续缓慢放大，继续旋转，直至消失
                      .to(crackEl, { scale: 1.5, opacity: 0, rotation: 360, duration: 0.58, ease: "power4.out" }, 0.12);
                } else {
                    // 默认受击动画：砸玻璃
                    gsap.set(crackEl, { scale: 0, opacity: 0, rotation: 0 }); // [修复] 确保默认动画重置旋转
                    gsap.set(flashEl, { opacity: 0 });

                    tl.to(flashEl, { opacity: 0.5, duration: 0.06 }, 0)
                      .to(flashEl, { opacity: 0, duration: 0.3 }, 0.06)
                      .to(crackEl, { scale: 1.2, opacity: 1, duration: 0.15, ease: "back.out(2)" }, 0)
                      .to(crackEl, { opacity: 0, duration: 0.4 }, 0.55)
                      .to(crackEl, { scale: 0.8, duration: 0.4 }, 0.55);
                }
            }
        });
    }, [impacts]);

    return (
        <div ref={containerRef} className="absolute inset-0 z-[140] pointer-events-none overflow-visible">
            {impacts.map(impact => {
                const isMauxirPedestal = impact.impactType === 'mauxir_lotus_pedestal';
                return (
                    <div
                        key={impact.id}
                        id={`impact-${impact.id}`}
                        // [核心修复] 将 overflow-hidden 改为 overflow-visible，打破卡牌边框的次元壁！
                        className="absolute rounded-xl overflow-visible pointer-events-none"
                        style={{
                            left: impact.x,
                            top: impact.y,
                            width: impact.w,
                            height: impact.h,
                        }}
                    >
                        {/* 动态闪屏层：把 rounded-xl 移到这里，保证闪屏依然拥有完美的卡牌圆角 */}
                        <div
                            className={`hit-flash absolute inset-0 rounded-xl mix-blend-hard-light opacity-0 ${isMauxirPedestal ? 'bg-blue-500' : 'bg-red-500'}`}
                        />
                        {/* 动态贴图层：彻底放开限制 */}
                        <div className="hit-crack absolute inset-0 overflow-visible opacity-0 pointer-events-none flex items-center justify-center">
                            <img
                                src={isMauxirPedestal ? EFFECT_IMAGES.mauxirRushBeAttacked : EFFECT_IMAGES.beAttacked}
                                alt="命中特效"
                                // [核心修复] 扩大至 160%，使用 max-w-none 突破默认限宽，使用 object-contain 保持完美比例
                                className={`w-[160%] h-[160%] max-w-none object-contain mix-blend-screen opacity-90 ${isMauxirPedestal ? 'drop-shadow-[0_0_15px_rgba(139,92,246,0.8)]' : 'drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]'}`}
                                draggable={false}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};