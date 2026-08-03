/**
 * SpellImpactLayer — 独立受击特效解耦层
 * * 核心机制：
 * 1. 纯事件驱动：监听 IMPACT_TRIGGER，无需 React 状态传递。
 * 2. 坐标换算：完美规避 ScaleWrapper，获取目标的相对容器坐标，生成覆盖层。
 * 3. 隔山打牛：通过 GSAP 远程抓取 target DOM，触发震动，解放卡牌组件的耦合。
 *
 * [2026-06-29] 重构：新增差异化 BUFF/HEAL 受击特效系统
 *   - 根据 effect class 标签映射 spellKey → 视觉类别
 *   - BUFF/HEAL 效果不再震动卡牌
 *   - 不同类别使用专属贴图、闪屏色、动画曲线
 */
import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { eventBus } from '../utils/eventBus';
import { EFFECT_IMAGES } from '../data/imageData';

// 暴露标准化的触发事件名
export const ImpactEvents = {
    TRIGGER: 'VFX_IMPACT_TRIGGER'
} as const;

interface ImpactInstance {
    id: string;
    targetId: string;
    impactType: string;
    x: number;
    y: number;
    w: number;
    h: number;
    patternIndex: number;
}

// ==========================================
// [新增] 差异化受击视觉系统
// ==========================================

/** 视觉类别枚举 */
type ImpactVisualType =
    | 'default'          // 普通受击（兜底）
    | 'mauxir_pedestal'  // 臆莲基座专属
    | 'heal'             // 治疗
    | 'buff_all'         // 双维增益 / 多效果
    | 'buff_power'       // 仅攻击增益
    | 'buff_life'        // 仅生命增益
    | 'buff_keyword';    // 关键词赋予

/** 各类别对应的视觉配置 */
interface ImpactVisualConfig {
    image: string;           // 特效贴图
    flashColor: string;      // 闪屏色
    flashClass: string;      // Tailwind 闪屏类
    imageClass: string;      // Tailwind 图片效果类
    shakeEnabled: boolean;   // 是否震动卡牌
    animStyle: 'violent' | 'gentle' | 'holographic'; // 动画风格
}

/** 各视觉类别的完整配置表 */
const VISUAL_CONFIGS: Record<ImpactVisualType, ImpactVisualConfig> = {
    default: {
        image: EFFECT_IMAGES.beAttacked,
        flashColor: '#ef4444',
        flashClass: 'bg-red-500',
        imageClass: 'drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]',
        shakeEnabled: true,
        animStyle: 'violent',
    },
    mauxir_pedestal: {
        image: EFFECT_IMAGES.mauxirRushBeAttacked,
        flashColor: '#3b82f6',
        flashClass: 'bg-blue-500',
        imageClass: 'drop-shadow-[0_0_15px_rgba(139,92,246,0.8)]',
        shakeEnabled: true,
        animStyle: 'holographic',
    },
    heal: {
        image: EFFECT_IMAGES.healing,
        flashColor: '#22c55e',
        flashClass: 'bg-green-500',
        imageClass: 'drop-shadow-[0_0_12px_rgba(34,197,94,0.6)]',
        shakeEnabled: false,
        animStyle: 'gentle',
    },
    buff_all: {
        image: EFFECT_IMAGES.buffAll,
        flashColor: '#fbbf24',
        flashClass: 'bg-yellow-500',
        imageClass: 'drop-shadow-[0_0_12px_rgba(251,191,36,0.7)]',
        shakeEnabled: false,
        animStyle: 'gentle',
    },
    buff_power: {
        image: EFFECT_IMAGES.buffPower,
        flashColor: '#f97316',
        flashClass: 'bg-orange-500',
        imageClass: 'drop-shadow-[0_0_12px_rgba(249,115,22,0.7)]',
        shakeEnabled: false,
        animStyle: 'gentle',
    },
    buff_life: {
        image: EFFECT_IMAGES.buffLife,
        flashColor: '#14b8a6',
        flashClass: 'bg-teal-500',
        imageClass: 'drop-shadow-[0_0_12px_rgba(20,184,166,0.7)]',
        shakeEnabled: false,
        animStyle: 'gentle',
    },
    buff_keyword: {
        image: EFFECT_IMAGES.buffKeyword,
        flashColor: '#a855f7',
        flashClass: 'bg-purple-500',
        imageClass: 'drop-shadow-[0_0_12px_rgba(168,85,247,0.7)]',
        shakeEnabled: false,
        animStyle: 'gentle',
    },
};

/**
 * [新增] SpellKey → 视觉类别 映射表
 * 基于 effectRegistry.ts 中的 effect class 分析得出
 *
 * 分类规则：
 *   - 多效果法术（effects 数组 > 1 或单效果同时给多种东西）→ buff_all
 *   - BUFF 双维增益（power + health）→ buff_all
 *   - BUFF 仅攻击 → buff_power
 *   - BUFF 仅生命 → buff_life
 *   - BUFF 仅关键词 → buff_keyword
 *   - HEAL 类 → heal
 *   - 其他 → default（保持原有裂纹特效）
 */
const SPELL_VISUAL_MAP: Record<string, ImpactVisualType> = {
    // --- 治疗类 ---
    'vitality_regen': 'heal',
    'vitality_supplement': 'heal',

    // --- 多效果 → BUFF_ALL ---
    'bader_reagent': 'buff_all',        // HEAL + BUFF_EVERYWHERE
    'fenny_strike': 'buff_all',         // RECALL + 屏障关键词
    'fenny_support': 'buff_all',        // +1/+0 + 关键词(KillToRally)
    'full_purification': 'buff_all',    // 全域 +1/+1

    // --- 双维增益 → BUFF_ALL ---
    'prayer': 'buff_all',               // +1/+1
    'inspire': 'buff_all',              // +2/+1

    // --- 仅攻击增益 → BUFF_Power ---
    'dream_lotus_drone': 'buff_power',          // 梦莲无人机 +2/+0

    // --- 关键词赋予 → BUFF_Keyword ---
    'pupu_specular_soul_ultimate': 'buff_keyword', // 连击
    'lyfe_support': 'buff_keyword',     // 冻结

    // --- 特殊 ---
    'mauxir_lotus_pedestal': 'mauxir_pedestal',
};

/** 根据 spellKey 获取视觉类别 */
function getVisualType(impactType: string): ImpactVisualType {
    return SPELL_VISUAL_MAP[impactType] || 'default';
}

/** 根据 impactType 获取完整视觉配置 */
function getVisualConfig(impactType: string): ImpactVisualConfig {
    return VISUAL_CONFIGS[getVisualType(impactType)];
}


export const SpellImpactLayer: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [impacts, setImpacts] = useState<ImpactInstance[]>([]);

    // ==========================================
    // 1. 兵工厂总控台：监听发射信号并计算物理坐标
    // ==========================================
    useEffect(() => {
        const handleImpact = (payload: { targetId: string, impactType?: string }) => {
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
                impactType: impactType || '',
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
    // 2. 动画引擎：按视觉类别播放差异化动画
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

            const config = getVisualConfig(impact.impactType);

            // [终极解耦] 隔山打牛：去抓取真实卡牌里的减震器
            const targetEl = document.querySelector(`[data-shake-target="${impact.targetId}"]`) ||
                             document.querySelector(`[data-entity-id="${impact.targetId}"]`);

            const tl = gsap.timeline({
                onComplete: () => {
                    setImpacts(prev => prev.filter(i => i.id !== impact.id));
                }
            });

            // A. 远程物理震荡目标（仅 shakeEnabled 的类别才震动）
            if (targetEl) {
                gsap.killTweensOf(targetEl, "x");
                gsap.set(targetEl, { x: 0 });

                if (config.shakeEnabled) {
                    if (config.animStyle === 'holographic') {
                        // 基座打击：科技感轻量微震
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
                // BUFF/HEAL: 不震动卡牌，跳过整个 shake 块
            }

            // B. 瞬间爆发闪屏与特效图层
            if (flashEl && crackEl) {
                gsap.set(crackEl, { scale: 0, opacity: 0, rotation: 0 });
                gsap.set(flashEl, { opacity: 0 });

                if (config.animStyle === 'holographic') {
                    // --- 全息翻转（臆莲基座专属） ---
                    tl.to(flashEl, { opacity: 0.6, duration: 0.06 }, 0)
                      .to(flashEl, { opacity: 0, duration: 0.4 }, 0.06)
                      .to(crackEl, { scale: 1.2, opacity: 1, rotation: 180, duration: 0.12, ease: "power2.out" }, 0)
                      .to(crackEl, { scale: 1.5, opacity: 0, rotation: 360, duration: 0.58, ease: "power4.out" }, 0.12);

                } else if (config.animStyle === 'gentle') {
                    // --- BUFF/HEAL 柔和弹出 ---
                    // 闪屏：短暂亮起，柔和消退
                    tl.to(flashEl, { opacity: 0.45, duration: 0.08 }, 0)
                      .to(flashEl, { opacity: 0, duration: 0.35, ease: "power2.out" }, 0.08)
                      // 特效图：弹性弹出 → 短暂驻留 → 淡出
                      .set(crackEl, { scale: 0.3, opacity: 0 }, 0)
                      .to(crackEl, { scale: 1.1, opacity: 1, duration: 0.2, ease: "back.out(1.7)" }, 0.06)
                      .to(crackEl, { opacity: 0.9, duration: 0.25 }, 0.26)
                      .to(crackEl, { opacity: 0, scale: 0.9, duration: 0.3, ease: "power2.in" }, 0.51);

                } else {
                    // --- 默认受击动画：砸玻璃（含震动） ---
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
                const config = getVisualConfig(impact.impactType);
                return (
                    <div
                        key={impact.id}
                        id={`impact-${impact.id}`}
                        className="absolute rounded-xl overflow-visible pointer-events-none"
                        style={{
                            left: impact.x,
                            top: impact.y,
                            width: impact.w,
                            height: impact.h,
                        }}
                    >
                        {/* 动态闪屏层 */}
                        <div
                            className={`hit-flash absolute inset-0 rounded-xl mix-blend-hard-light opacity-0 ${config.flashClass}`}
                        />
                        {/* 动态贴图层 */}
                        <div className="hit-crack absolute inset-0 overflow-visible opacity-0 pointer-events-none flex items-center justify-center">
                            <img
                                src={config.image}
                                alt="命中特效"
                                className={`w-[160%] h-[160%] max-w-none object-contain mix-blend-screen opacity-90 ${config.imageClass}`}
                                draggable={false}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
