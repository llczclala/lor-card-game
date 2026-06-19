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

// 3种华丽的 SVG 裂纹图案 (直接从旧的 Card.tsx 中接管)
const CRACK_PATTERNS: string[] = [
    // 1. 星爆式裂纹
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
      <path d="M50,50 L20,15 M50,50 L80,10 M50,50 L90,45 M50,50 L85,85 M50,50 L15,80 M50,50 L10,50 M50,50 L50,5 M50,50 L50,95" stroke="white" stroke-width="1.5" fill="none" opacity="0.8"/>
      <path d="M50,50 L35,25 M50,50 L70,25 M50,50 L75,65 M50,50 L30,70" stroke="white" stroke-width="0.8" fill="none" opacity="0.5"/>
    </svg>`,
    // 2. 蛛网式裂纹
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
      <path d="M50,50 L5,30 L12,25 M50,50 L25,5 L30,12 M50,50 L75,5 L70,12 M50,50 L95,35 L88,30 M50,50 L95,70 L88,75 M50,50 L70,95 L75,88 M50,50 L25,95 L30,88 M50,50 L5,70 L12,75" stroke="white" stroke-width="1.2" fill="none" opacity="0.7"/>
      <path d="M30,25 L25,30 M70,25 L75,30 M75,70 L70,75 M25,70 L30,75" stroke="white" stroke-width="0.6" fill="none" opacity="0.4"/>
      <circle cx="50" cy="50" r="8" stroke="white" stroke-width="0.8" fill="none" opacity="0.3"/>
    </svg>`,
    // 3. 闪电式裂纹
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
      <path d="M50,50 L45,40 L55,30 L48,18 L58,8 M50,50 L60,60 L52,72 L62,85 L55,95 M50,50 L38,58 L30,52 L20,62 L12,55 M50,50 L35,42" stroke="white" stroke-width="1.3" fill="none" opacity="0.75"/>
      <path d="M48,18 L42,22 M58,8 L62,14 M52,72 L45,68 M62,85 L68,80 M30,52 L25,58 M20,62 L15,58" stroke="white" stroke-width="0.6" fill="none" opacity="0.4"/>
    </svg>`
];

interface ImpactInstance {
    id: string;
    targetId: string;
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
        const handleImpact = (payload: { targetId: string }) => {
            const { targetId } = payload;
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
                x: localX,
                y: localY,
                w: localW,
                h: localH,
                patternIndex: Math.floor(Math.random() * 3) // 随机一款裂纹
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

            // A. 远程物理震荡目标
            if (targetEl) {
                // 清除目标身上可能残留的其他 X 轴运动，防止打架
                gsap.killTweensOf(targetEl, "x");
                gsap.set(targetEl, { x: 0 });
                tl.to(targetEl, { x: 7, duration: 0.04, repeat: 2, yoyo: true, ease: "power1.out" }, 0)
                  .to(targetEl, { x: -5, duration: 0.04, repeat: 2, yoyo: true, ease: "power1.out" }, 0.08)
                  .to(targetEl, { x: 3, duration: 0.04, repeat: 1, yoyo: true, ease: "power1.out" }, 0.18)
                  .to(targetEl, { x: 0, duration: 0.12, ease: "power2.in" }, 0.3);
            }

            // B. 瞬间爆发红闪与裂纹
            if (flashEl && crackEl) {
                gsap.set(crackEl, { scale: 0, opacity: 0 });
                gsap.set(flashEl, { opacity: 0 });

                tl.to(flashEl, { opacity: 0.5, duration: 0.06 }, 0)
                  .to(flashEl, { opacity: 0, duration: 0.3 }, 0.06)
                  // [核心修复] 大幅延长受击贴图的留存时间！让它狠狠砸在屏幕上，悬停后再消散
                  .to(crackEl, { scale: 1.2, opacity: 1, duration: 0.15, ease: "back.out(2)" }, 0)
                  .to(crackEl, { opacity: 0, duration: 0.4 }, 0.55) // 从 0.55 秒开始消散，总存活时间超过半秒
                  .to(crackEl, { scale: 0.8, duration: 0.4 }, 0.55);
            }
        });
    }, [impacts]);

    return (
        <div ref={containerRef} className="absolute inset-0 z-[140] pointer-events-none overflow-visible">
            {impacts.map(impact => (
                <div
                    key={impact.id}
                    id={`impact-${impact.id}`}
                    className="absolute rounded-xl overflow-hidden pointer-events-none"
                    style={{
                        left: impact.x,
                        top: impact.y,
                        width: impact.w,
                        height: impact.h,
                    }}
                >
                    {/* 红闪贴图 */}
                    <div className="hit-flash absolute inset-0 bg-red-500 mix-blend-hard-light opacity-0" />
                    {/* [核心修复] 使用高品质的 png 贴图替换粗糙的 SVG 代码，并通过 blend-mode 增强打击感！ */}
                    <div className="hit-crack absolute inset-0 opacity-0 pointer-events-none flex items-center justify-center">
                        <img
                            src={EFFECT_IMAGES.beAttacked}
                            alt="Be Attacked"
                            className="w-[120%] h-[120%] object-cover mix-blend-screen opacity-90 drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                            draggable={false}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};