import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Eye, Hexagon, Triangle, Sparkles, ChevronDown, ShoppingCart } from 'lucide-react';
// [新增] 引入 Framer Motion
import { motion } from 'framer-motion';
import type { CardData } from '../types';
import { CARD_DB } from '../data/cards';
import { SpeechBubble } from './SpeechBubble';
import { SpellCard } from './SpellCard';
import { KeywordEffects } from './KeywordEffects';
// [核心新增] 引入 LEVELUP_ICONS
import { CARD_BORDERS, EFFECT_IMAGES, UI_IMAGES, LEVELUP_ICONS, getSkinImage } from '../data/imageData';
// [新增] 引入卡面坐标字典与类型
import { CARD_CROP_CONFIG } from '../data/cardCropConfig';
import type { CropConfig } from '../types';
// [新增] 引入全新的智能卡槽模块
import { KeywordTray } from './KeywordTray';
// [新增] 引入事件总线用于触发音效
import { eventBus, GameEvents } from '../utils/eventBus';
import { EFFECT_DB } from '../data/effectRegistry'; // [2026-07-14 锻造者] 读取效果参数用于兜底替换{value}

// [核心新增] 模块级卡牌位置记忆库 (突破 React 销毁重绘的失忆限制)
const cardLocationMemory = new Map<string, string>();

// ==========================================
// [新增] 碎片化爆破粒子引擎 (Shatter Effect)
// 独立于卡面存在，负责在 1.1 秒内演出极其华丽的碎裂与消散
// ==========================================
const ShatterEffect = React.memo(({ isPlayerSide }: { isPlayerSide: boolean }) => {
    const color = isPlayerSide ? '#3b82f6' : '#ef4444'; // 我方蓝色，敌方红色
    const shards = React.useMemo(() => Array.from({ length: 20 }).map((_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 80 + Math.random() * 200; // 随机爆炸初速度
        return {
            id: i,
            x: Math.cos(angle) * velocity,
            y: Math.sin(angle) * velocity + 150, // +150 模拟重力下坠
            rotate: Math.random() * 720 - 360,
            size: 8 + Math.random() * 24
        };
    }), []);

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[200]">
            {/* 爆破中心的高光闪烁 (一闪而过) */}
            <motion.div className="absolute w-full h-full bg-white rounded-xl"
                initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.5 }} transition={{ duration: 0.3 }}
            />
            {/* 飞散的发光晶体碎片 */}
            {shards.map(shard => (
                <motion.div key={shard.id} className="absolute"
                    style={{ width: shard.size, height: shard.size, backgroundColor: color, clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
                    initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                    animate={{ x: shard.x, y: shard.y, rotate: shard.rotate, scale: 0, opacity: 0 }}
                    transition={{ duration: 1.0, ease: "easeOut" }}
                />
            ))}
        </div>
    );
});

// ==========================================
// [新增] 裂纹覆盖层接口 (Hit Crack Overlay)
// 支持两种模式：
//   - 'svg': 使用内置的 SVG 裂纹图案（当前默认）
//   - 'image': 使用外部图片贴图（未来可替换）
// 暴露配置常量以便程后续替换
// ==========================================
interface CrackOverlayConfig {
  type: 'svg' | 'image';
  src?: string;       // 图片贴图 URL（type='image' 时使用）
  svgPatterns?: string[]; // 自定义 SVG 图案列表（type='svg' 时使用）
}

// [配置接口] 莉莉子 ← 程：想换裂纹贴图就改这里！
const CRACK_CONFIG: CrackOverlayConfig = {
  type: 'svg',
  // type: 'image',
  // src: '/assets/crack-custom.png',   // ← 换成你自己的裂纹贴图
};

// 内置 SVG 裂纹图案库（3种风格，type='svg' 时使用）
const CRACK_PATTERNS: string[] = [
  // 图案1：星爆式裂纹（从中心向四周扩散）
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
    <path d="M50,50 L20,15 M50,50 L80,10 M50,50 L90,45 M50,50 L85,85 M50,50 L15,80 M50,50 L10,50 M50,50 L50,5 M50,50 L50,95" stroke="white" stroke-width="1.5" fill="none" opacity="0.8"/>
    <path d="M50,50 L35,25 M50,50 L70,25 M50,50 L75,65 M50,50 L30,70" stroke="white" stroke-width="0.8" fill="none" opacity="0.5"/>
  </svg>`,
  // 图案2：蛛网式裂纹
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
    <path d="M50,50 L5,30 L12,25 M50,50 L25,5 L30,12 M50,50 L75,5 L70,12 M50,50 L95,35 L88,30 M50,50 L95,70 L88,75 M50,50 L70,95 L75,88 M50,50 L25,95 L30,88 M50,50 L5,70 L12,75" stroke="white" stroke-width="1.2" fill="none" opacity="0.7"/>
    <path d="M30,25 L25,30 M70,25 L75,30 M75,70 L70,75 M25,70 L30,75" stroke="white" stroke-width="0.6" fill="none" opacity="0.4"/>
    <circle cx="50" cy="50" r="8" stroke="white" stroke-width="0.8" fill="none" opacity="0.3"/>
  </svg>`,
  // 图案3：闪电式裂纹（凌厉的折线）
  `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="w-full h-full">
    <path d="M50,50 L45,40 L55,30 L48,18 L58,8 M50,50 L60,60 L52,72 L62,85 L55,95 M50,50 L38,58 L30,52 L20,62 L12,55 M50,50 L35,42" stroke="white" stroke-width="1.3" fill="none" opacity="0.75"/>
    <path d="M48,18 L42,22 M58,8 L62,14 M52,72 L45,68 M62,85 L68,80 M30,52 L25,58 M20,62 L15,58" stroke="white" stroke-width="0.6" fill="none" opacity="0.4"/>
  </svg>`
];

// [新增] 裂纹覆盖层组件 (HitCrackOverlay)
// 支持 SVG 图案 和 图片贴图 两种模式
const HitCrackOverlay = React.forwardRef<HTMLDivElement, { patternIndex: number; isTacticalMode: boolean }>(({ patternIndex, isTacticalMode }, ref) => {
  const safeIndex = patternIndex % CRACK_PATTERNS.length;

  if (CRACK_CONFIG.type === 'image' && CRACK_CONFIG.src) {
    // 图片贴图模式 — 程可以换成自己的裂纹纹理
    return (
      <div
        ref={ref}
        className={`absolute inset-0 z-[140] pointer-events-none overflow-hidden ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'}`}
        style={{ opacity: 0, scale: 0 }}
      >
        <img src={CRACK_CONFIG.src} alt="" className="w-full h-full object-cover opacity-80 mix-blend-screen" draggable={false} />
      </div>
    );
  }

  // SVG 图案模式 — 默认使用内置裂纹SVG
  return (
    <div
      ref={ref}
      className={`absolute inset-0 z-[140] pointer-events-none overflow-hidden ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'}`}
      style={{ opacity: 0, scale: 0 }}
      dangerouslySetInnerHTML={{ __html: CRACK_PATTERNS[safeIndex] }}
    />
  );
});
HitCrackOverlay.displayName = 'HitCrackOverlay';

interface CardProps {
  data: CardData;
  location: 'hand' | 'bench' | 'combat' | 'enemy_bench' | 'spell_stack' | 'preview' | 'deck-builder' | 'gacha';
  skinId?: number; // [新增] 显式接收上层传下来的皮肤 ID（0为默认，1、2为限定皮肤）
  onClick?: () => void;
  isBlocker?: boolean;
  isSelected?: boolean;
  highlightTarget?: boolean;
  onViewArt?: (card: CardData) => void;
  isEnemyCombatant?: boolean;
  attackType?: 'clash' | 'direct';
  isSpeaking?: boolean;
  isPlayable?: boolean;
  onChallengerClick?: () => void;
  isChallengerActive?: boolean;
  isChallengedTarget?: boolean;
  canBeChallenged?: boolean;
  isFacingQuickAttack?: boolean;
  isFaceUp?: boolean;
  cardBackUrl?: string;
  className?: string;
  isNew?: boolean;
  delay?: number;
  isTargetable?: boolean;
  isTargeted?: boolean;
  isBlocking?: boolean;
  ownedCount?: number;
  showShopIcon?: boolean;
  isDragging?: boolean; // [新增] 用于告诉 Card 现在正在被拖拽，屏蔽 Hover 动画
  isLocked?: boolean;   // [新增] 锁定状态：将卡牌置灰禁用，并显示解锁提示
  lockedMessage?: string; // [新增] 动态锁卡提示文案
  titanCount?: number;   // [泰坦] 场上泰坦总数，用于在关键词图标上预显示脉冲加成
  isConditionActive?: boolean; // [新增] 动态描边变色，标识前置条件已满足
  playerNexusHealth?: number; // [新增] 透传我方水晶血量，供手牌英雄升级进度判定
  enemyNexusHealth?: number;  // [新增] 透传敌方水晶血量
  burnoutValue?: number;       // [2026-07-09] 燃尽：动态费用（法力+魔力），覆盖 data.cost
  onPointerDown?: (e: React.PointerEvent) => void; // [新增] 供战场→备战席拖拽使用
  // [2026-07-14 锻造者] 法术伤害动态显示
  displayParams?: Record<string, number>; // 替换 description 中 {paramName} 的值
  damageColor?: 'boosted' | 'reduced' | null; // 法术伤害数字颜色（绿/红/白）
  isCostReduced?: boolean; // [2026-07-14] 蕾西亚减费标记（绿色费用数字）
  // [切除] 删掉这行重复的 skinId，因为接口最上面已经声明过一遍了
}
// [皮肤] 智能裁剪钩子：增加 skinId 参数，支持双键索引结构
const useCardCrop = (cardKey: string, location: string, level: number = 1, skinId: number = 0): CropConfig => {
    // 仅用于监听工作室的强制刷新事件
    const [, setUpdateTick] = useState(0);

    useEffect(() => {
        const handleUpdate = () => setUpdateTick(t => t + 1);
        window.addEventListener('CROP_UPDATED', handleUpdate);
        return () => window.removeEventListener('CROP_UPDATED', handleUpdate);
    }, []);

    // 1. 同步计算基础形态
    let baseMode: 'hand' | 'bench' | 'combat' | 'avatar' = 'hand';
    if (location === 'bench' || location === 'enemy_bench') baseMode = 'bench';
    else if (location === 'combat') baseMode = 'combat';
    else if (location === 'deck-panel' || location === 'avatar') baseMode = 'avatar';

    // 移除未引入的 CardCropData 类型，直接作为动态属性名读取
    const mode = level === 2 ? `${baseMode}_lv2` as any : baseMode as any;

    // 2. 同步读取优先级 1：热更新数据（支持嵌套格式和新旧两种结构）
    try {
        const localData = localStorage.getItem('dev_crop_overrides');
        if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed[cardKey]) {
                // [皮肤] 新嵌套格式：parsed[cardKey][skinId][mode]
                if (parsed[cardKey][skinId]?.[mode]) {
                    return parsed[cardKey][skinId][mode];
                }
                // [皮肤] 新嵌套格式降级 skinId=0
                if (skinId !== 0 && parsed[cardKey][0]?.[mode]) {
                    return parsed[cardKey][0][mode];
                }
                // 旧平铺格式：parsed[cardKey][mode]
                if (parsed[cardKey][mode]) {
                    return parsed[cardKey][mode];
                }
            }
        }
    } catch (e) { /* ignore */ }

    // 3. 同步读取优先级 2：静态字典（双键索引：cardKey → skinId → mode）
    if (CARD_CROP_CONFIG[cardKey] && CARD_CROP_CONFIG[cardKey][skinId]?.[mode]) {
        return CARD_CROP_CONFIG[cardKey][skinId][mode]!;
    }
    // [皮肤] 向下兼容：如果指定 skinId 没找到，尝试 skinId 0
    if (CARD_CROP_CONFIG[cardKey] && skinId !== 0 && CARD_CROP_CONFIG[cardKey][0]?.[mode]) {
        return CARD_CROP_CONFIG[cardKey][0][mode]!;
    }
    // [皮肤] 继续向下兼容：老结构单层查找（局部热更新仍可能使用老格式）
    if (CARD_CROP_CONFIG[cardKey] && CARD_CROP_CONFIG[cardKey][mode]) {
        return CARD_CROP_CONFIG[cardKey][mode]!;
    }

    // 4. Fallback 默认居中值
    return { scale: 1, offsetX: 0, offsetY: 0 };
};

// 数值跳动钩子
const useNumberTicker = (targetValue: number, duration: number = 1000) => {
    const [displayValue, setDisplayValue] = useState(targetValue);
    const [isTicking, setIsTicking] = useState(false);
    useEffect(() => {
        if (displayValue === targetValue) {
            if (isTicking) setIsTicking(false);
            return;
        }
        if (!isTicking) setIsTicking(true);
        const diff = Math.abs(targetValue - displayValue);
        const stepTime = Math.max(10, duration / diff);
        const step = displayValue < targetValue ? 1 : -1;
        const timer = setTimeout(() => setDisplayValue(prev => prev + step), stepTime);
        return () => clearTimeout(timer);
    }, [targetValue, displayValue, duration]);
    return [displayValue, isTicking] as const;
};

/** [2026-07-14 锻造者] 渲染卡牌描述文本，替换{paramName}占位符并着色 */
const renderDescription = (
    description: string,
    displayParams?: Record<string, number>,
    damageColor?: 'boosted' | 'reduced' | null
): React.ReactNode => {
    if (!displayParams) return description;
    // 匹配 {paramName} 占位符
    const parts = description.split(/(\{\w+\})/);
    const colorClass = damageColor === 'boosted' ? 'text-green-400' :
                       damageColor === 'reduced' ? 'text-red-400' : 'text-gray-200';
    return parts.map((part, i) => {
        const match = part.match(/^\{(\w+)\}$/);
        if (match && match[1] in displayParams) {
            return <span key={i} className={colorClass}>{displayParams[match[1]]}</span>;
        }
        return part;
    });
};

export const Card: React.FC<CardProps> = ({
    data, location, skinId = 0, // [新增] 解构 skinId 并默认赋予 0 默认皮肤
    onClick, isBlocker, isSelected, highlightTarget, onViewArt, isEnemyCombatant, attackType = 'clash',
    isSpeaking, isPlayable,
    onChallengerClick, isChallengerActive, isChallengedTarget, canBeChallenged, isFacingQuickAttack,
    isFaceUp = true,
    cardBackUrl,
    className = '',
    isNew = false,
    isTargetable = false,
    isTargeted = false,
    isBlocking = false,
    ownedCount = 0,
    showShopIcon = false,
    isDragging = false, // [新增] 默认不处于拖拽状态
    isLocked = false,   // [新增] 默认不锁定
    lockedMessage = "升级以解锁", // [新增] 默认提示文案
    titanCount,          // [泰坦] 场上泰坦总数
    isConditionActive = false,
    playerNexusHealth = 20, // [修复] 透传我方水晶血量，默认20
    enemyNexusHealth = 20,   // [修复] 透传敌方水晶血量，默认20
    burnoutValue,            // [2026-07-09] 燃尽：动态费用覆盖 data.cost
    onPointerDown,           // [新增] 战场拖拽
    displayParams,           // [2026-07-14] 法术伤害动态显示参数
    damageColor,             // [2026-07-14] 法术伤害数字颜色
    isCostReduced,           // [2026-07-14] 蕾西亚减费标记(绿色费用数字)
    // [切除] 删掉这行重复的 skinId = 0，因为参数最上面已经解构过一遍了
}) => {
    // 顶级防御
    if (!data) {
        console.warn(`[Card Component] Prevented crash: 'data' is undefined at location: ${location}`);
        return null;
    }
        // [丁型] 如果卡牌自身带有脉冲值（自脉冲），优先用它显示 +N 飘字
    const displayTitanCount = (data as any).pulseValue ?? titanCount;

    // [核心修复] 计算当前使用的卡面图片（皮肤绝对优先，且完美支持判断 2 级觉醒皮肤）
    const currentImageUrl = useMemo(() => {
        // 第一优先级：如果有皮肤，绝对优先去拿皮肤贴图（需将 2 级状态传给引擎）
        if (skinId && skinId > 0) {
            const skinImg = getSkinImage(data.key, skinId, data.level === 2);
            if (skinImg) return skinImg; // 拿到了限定皮肤，直接返回！
        }
        // 第二优先级：兜底默认逻辑（没穿皮肤，或者皮肤资源丢失）
        if (data.level === 2 && data.level2ImageUrl) return data.level2ImageUrl;
        return data.imageUrl;
    }, [data.key, data.level, data.level2ImageUrl, data.imageUrl, skinId]);

    // [2026-07-14 锻造者] 兜底计算 displayParams：从效果定义读取参数替换 {value} {paramName}
    // 当 prop displayParams 传入时，优先用 prop（支持缇坦妮娅的+1增益覆盖）
    const resolvedDisplayParams = useMemo<Record<string, number> | undefined>(() => {
        if (displayParams) return displayParams; // 外部传入的优先（如缇坦妮娅增益）
        if (!data.effects || data.effects.length === 0) return undefined;
        const effectDef = EFFECT_DB[data.effects[0]];
        if (!effectDef?.params) return undefined;
        const display: Record<string, number> = {};
        for (const [key, val] of Object.entries(effectDef.params)) {
            if (typeof val === 'number') {
                display[key] = val;
            }
        }
        return Object.keys(display).length > 0 ? display : undefined;
    }, [displayParams, data.effects]);

    // [皮肤] 获取当前卡牌形态的裁剪坐标，传入 data.level + skinId 智能区分
    const crop = useCardCrop(data.key, location, data.level, skinId);

    // [升级版] 全能数值反馈系统 (Health & Power)
    // 分别记录两个属性的变化量
    // [修复] healthDelta 改为 hitQueue 队列，支持连续多段伤害各自独立飘字
    const [hitQueue, setHitQueue] = useState<{ id: number; amount: number }[]>([]);
    const hitIdRef = useRef(0);
    const [powerDelta, setPowerDelta] = useState<number | null>(null);

    // 控制震动 (受伤/削弱时触发)
    const [localShake, setLocalShake] = useState(false);
    // 控制高亮闪烁 (获得Buff/回血时触发)
    const [localFlash, setLocalFlash] = useState(false);

    // ==========================================
    // [新增] 伪3D物理起落引擎 (The Lift & Slam Engine)
    // ==========================================
    const [isLifting, setIsLifting] = useState(false);
    const [showDecal, setShowDecal] = useState(false);

    // ==========================================
    // [新增] 阵亡多段式演出状态机 (Death Timeline)
    // ==========================================
    const [isShattering, setIsShattering] = useState(false);
    const [ephemeralEmpty, setEphemeralEmpty] = useState(false); // 专用于控制瞬息最后0.3秒的数值瞬间归零
    const [isEphemeralExploded, setIsEphemeralExploded] = useState(false); // [新增] 标记 1.5s 帷幕结束，接入物理阵亡的时间点

    // ==========================================
    // [新增] 弹道延迟标记 — 必须声明在所有引用它的 useEffect 之前！
    // ==========================================
    const [projectileActive, setProjectileActive] = useState(false);

    useEffect(() => {
        const onStart = () => setProjectileActive(true);
        const onEnd = () => setProjectileActive(false);
        eventBus.on('SPELL_PROJECTILE_START', onStart);
        eventBus.on('SPELL_PROJECTILE_END', onEnd);
        return () => {
            eventBus.off('SPELL_PROJECTILE_START', onStart);
            eventBus.off('SPELL_PROJECTILE_END', onEnd);
        };
    }, []);

    useEffect(() => {
        if (data.animState === 'dying' || data.animState === 'ephemeral_dying') {
            const isEphemeral = data.animState === 'ephemeral_dying';

            // [修复] 如果弹道飞行中（法术致死），暂不启动死亡计时
            // 等弹道播完+受击播完后再死亡
            if (projectileActive) return;

            if (isEphemeral) {
                // 1. 第 1.2s：数值瞬间归零
                const emptyTimer = setTimeout(() => setEphemeralEmpty(true), 1200);
                // 2. 第 1.5s：淡黄色帷幕消散，正式开始黑白褪色和玻璃碎裂！
                const explodeTimer = setTimeout(() => setIsEphemeralExploded(true), 1500);
                // 3. 第 2.3s (1.5s + 0.8s)：引爆粒子引擎，彻底卸载 DOM
                const shatterTimer = setTimeout(() => setIsShattering(true), 2300);

                return () => { clearTimeout(emptyTimer); clearTimeout(explodeTimer); clearTimeout(shatterTimer); };
            } else {
                // 普通死亡：短暂停顿展示裂纹后直接炸裂
                const shatterTimer = setTimeout(() => {
                    setIsShattering(true);
                }, 800);

                return () => clearTimeout(shatterTimer);
            }
        } else {
            // 安全兜底：如果卡牌活过来了，重置状态
            setIsShattering(false);
            setEphemeralEmpty(false);
            setIsEphemeralExploded(false);
        }
    }, [data.animState, projectileActive]); // [修复] 追加 projectileActive 依赖

    // ==========================================
    // [召唤入场] 数值归零生长 + 颜色恢复
    // ==========================================
    const [summonAnim, setSummonAnim] = useState<{ power: number; health: number } | null>(null);
    const summonRAFRef = useRef<number | null>(null);
    // [召唤入场 V2·三段时序] 演出分两段：
    //   阶段A(0~0.9s) 碎片重组：summonActive=true，切片层盖住 850，灰白碎片汇聚拼合
    //   阶段B(0.9~1.8s) 卡面成型：summonRevealed=true，850 以灰度出现 → 灰→彩(0.8s) + 数值 0→正常
    const [summonActive, setSummonActive] = useState(data.animState === 'summoning');
    const [summonRevealed, setSummonRevealed] = useState(false);

    useEffect(() => {
        if (data.animState !== 'summoning') {
            // 非 summoning：立即结束演出，数值回真实值
            setSummonActive(false);
            setSummonRevealed(false);
            setSummonAnim(null);
            return;
        }
        // 重新进入 summoning → 重新开启演出
        setSummonActive(true);
        setSummonRevealed(false);
        // 阶段A 结束：0.9s 切片层移除、850 露出，进入灰→彩 + 数值生长
        const shardTimer = setTimeout(() => {
            setSummonActive(false);
            setSummonRevealed(true);
        }, 900);
        // 数值归零生长：0.9s(阶段B)开始，0.7s 从 0 生长到真实值（easeOutCubic）
        const startTimer = setTimeout(() => {
            const pTarget = currentFinalPower;
            const hTarget = currentFinalHealth;
            const duration = 700;
            const startTime = performance.now();

            const tick = (now: number) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
                setSummonAnim({
                    power: Math.round(pTarget * eased),
                    health: Math.round(hTarget * eased),
                });
                if (progress < 1) summonRAFRef.current = requestAnimationFrame(tick);
            };
            summonRAFRef.current = requestAnimationFrame(tick);
        }, 900);

        // 阶段B 结束：1.8s 数值回真实值、取消 reveal（灰→彩动画已完成）
        const endTimer = setTimeout(() => {
            setSummonAnim(null);
            setSummonRevealed(false);
        }, 1800);

        return () => {
            clearTimeout(shardTimer);
            clearTimeout(startTimer);
            clearTimeout(endTimer);
            if (summonRAFRef.current !== null) {
                cancelAnimationFrame(summonRAFRef.current);
                summonRAFRef.current = null;
            }
        };
    }, [data.animState]);

    // ==========================================
    // [新增] GSAP 单位受击特效 (Hit Effect)
    // 三阶段动画：震动冲击 → 红闪+裂纹 → 恢复
    // ==========================================
    // 供 SpellImpactLayer 隔山打牛进行远程震荡的靶点
    const cardInnerRef = useRef<HTMLDivElement>(null);
    // 外层ref — 用于framer-motion
    const cardHitRef = useRef<HTMLDivElement>(null);


    // 突破 React 失忆：获取模块级记录的上一位置
    const prevKnownLoc = cardLocationMemory.get(data.id) || 'unknown';
    const isTacticalArea = location === 'bench' || location === 'enemy_bench' || location === 'combat';

    // 1. 同步更新模块记忆
    useEffect(() => {
        // [修复 Bug 2] 隔离多重宇宙：严禁投影仪(preview)中的虚假实体篡改真实的物理记忆！
        if (location !== 'preview') {
            cardLocationMemory.set(data.id, location);
        }
    }, [location, data.id]);

    // 2. 砸击特效调度器
    useEffect(() => {
        if (!isTacticalArea) return;

        // [修复] 兼容 'preview'：因为手牌打出时会经过 GameSession 的全屏大图展示 (preview 状态)
        // [核心修复] 补上 location === 'enemy_bench'，让敌方的卡牌落地也能砸出声音！
        if ((prevKnownLoc === 'hand' || prevKnownLoc === 'preview') && (location === 'bench' || location === 'enemy_bench')) {
            // 场景 1: 重力空投 (150ms 硬核落地)
            const timer = setTimeout(() => {
                // 音效已移交逻辑层，只保留视觉贴花
                setShowDecal(true);
                setLocalShake(true);
                setTimeout(() => setLocalShake(false), 300);
                setTimeout(() => setShowDecal(false), 2000);
            }, 150);
            return () => clearTimeout(timer);
        }
        else if (prevKnownLoc !== 'combat' && location === 'combat') {
            // 场景 2: 挺进战壕 (100ms 极速落地)
            const timer = setTimeout(() => {
                // 音效已移交逻辑层
                setShowDecal(true);
                setLocalShake(true);
                setTimeout(() => setLocalShake(false), 300);
                setTimeout(() => setShowDecal(false), 2000);
            }, 100);
            return () => clearTimeout(timer);
        }
        else if (prevKnownLoc === 'combat' && (location === 'bench' || location === 'enemy_bench')) {
            // 场景 3: 安全撤回
            const timer = setTimeout(() => {
                // 音效已移交逻辑层
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [location, prevKnownLoc, isTacticalArea]);

    // 3. 动作拦截器：双指捏起 -> 延迟硬切
    const handleCardClick = (e: React.MouseEvent) => {
        if (isLocked) return;

        if (isTacticalArea && onClick && !isTargetable && !isTargeted) {
            // [修复] 施法瞄准选目标时不触发抬起动画（避免"选目标时微微抬起"的问题）
            setIsLifting(true);
            setTimeout(() => {
                onClick();
                setIsLifting(false);
            }, 150); // 捏起悬停 150ms 后，放行底层数据的硬切修改
        } else if (onClick) {
            onClick();
        }
    };

    // 计算当前的最终面板数值
    // [2026-07-10 修复] roundBuffs 是 ROUND 类 Buff 的唯一账本（不 double-write 进 buffs），
    // 所以生命值和攻击力都需要加 roundBuffs 才能正确显示临时增益
    const currentFinalHealth = (data.health || 0) + (data.buffs?.health || 0) + (data.roundBuffs?.health || 0) - (data.damageTaken || 0);
    const currentFinalPower = (data.power || 0) + (data.buffs?.power || 0) + (data.roundBuffs?.power || 0);
    // [maxPower] 攻击力上限 clamp（底座专用）
    const clampedPower = data.maxPower !== undefined ? Math.min(currentFinalPower, data.maxPower) : currentFinalPower;

    // [核心重构] 拦截器状态：用于在闪光结束后再更新底部的数字
    const [targetHealth, setTargetHealth] = useState(currentFinalHealth);
    const [targetPower, setTargetPower] = useState(clampedPower);

    // 使用 Ref 记录上一帧的数值
    const prevHealthRef = useRef(currentFinalHealth);
    const prevPowerRef = useRef(currentFinalPower);

    // [分离] 1. 检测生命值变化
    useEffect(() => {
        const prevHealth = prevHealthRef.current;
        if (currentFinalHealth !== prevHealth) {
            const diff = currentFinalHealth - prevHealth;
            if (diff < 0) {
                // 扣血/受伤：无视动画锁，立刻触发基础本地飘字与震荡
                setLocalShake(true);
                const newId = hitIdRef.current++;
                setHitQueue(prev => [...prev, { id: newId, amount: diff }]);
                setTargetHealth(currentFinalHealth);
                setTimeout(() => {
                    setHitQueue(prev => prev.filter(h => h.id !== newId));
                    setLocalShake(false);
                }, 1000);
            } else if (diff > 0) {
                // 增益：先高光，延迟后跳字
                setLocalFlash(true);
                const newId = hitIdRef.current++;
                setTimeout(() => {
                    setLocalFlash(false); // 高光结束 (0.4秒)
                    setHitQueue(prev => [...prev, { id: newId, amount: diff }]); // 弹出飘字
                    setTargetHealth(currentFinalHealth); // 底部数字开始滚动
                    setTimeout(() => {
                        setHitQueue(prev => prev.filter(h => h.id !== newId));
                    }, 1500); // 飘字在空中存活 1.5 秒
                }, 1000);
            }
            prevHealthRef.current = currentFinalHealth;
        }
    }, [currentFinalHealth, data.animState]);

    // [分离] 2. 检测攻击力变化
    useEffect(() => {
        const prevPower = prevPowerRef.current;
        if (currentFinalPower !== prevPower) {
            const diff = currentFinalPower - prevPower;
            if (diff < 0) {
                // 扣攻/虚弱：无视动画锁，立刻触发基础本地飘字与震荡
                setLocalShake(true);
                setPowerDelta(diff);
                setTargetPower(clampedPower);
                setTimeout(() => { setPowerDelta(null); setLocalShake(false); }, 1000);
            } else if (diff > 0) {
                // [泰坦] 泰坦脉冲的特效由 KeywordEffects 的 animState:'buff' 独立处理，不触发通用的金色高光
                if (!data.keywords.includes('Titan')) {
                    setLocalFlash(true);
                }
                setTimeout(() => {
                    setLocalFlash(false);
                    setPowerDelta(diff);
                    setTargetPower(clampedPower);
                    setTimeout(() => setPowerDelta(null), 1500);
                }, 1000);
            }
            prevPowerRef.current = currentFinalPower;
        }
    }, [currentFinalPower]);

    // =====================================
    // [新增分离] 3. 检测词条变化 (专为纯词条 BUFF 提供高光)
    // =====================================
    const prevKeywordsLenRef = useRef(data.keywords?.length || 0);

    useEffect(() => {
        const currentLen = data.keywords?.length || 0;
        // 如果新词条数量大于上一帧的词条数量，说明获得了新的词条
        if (currentLen > prevKeywordsLenRef.current) {
            setLocalFlash(true);
            setTimeout(() => {
                setLocalFlash(false);
            }, 1000); // 与数值高光保持相同的 1 秒持续时间
        }
        prevKeywordsLenRef.current = currentLen;
    }, [data.keywords]);

    const [showEye, setShowEye] = useState(false);
    const shouldAnimateDraw = isNew && location === 'hand';
    const [visualFaceUp, setVisualFaceUp] = useState(shouldAnimateDraw ? false : isFaceUp);


    useEffect(() => {
        if (shouldAnimateDraw) {
            setVisualFaceUp(false);
            const timer = setTimeout(() => {
                setVisualFaceUp(true);
            }, 900);
            return () => clearTimeout(timer);
        } else {
            setVisualFaceUp(isFaceUp);
        }
    }, [shouldAnimateDraw, isFaceUp]);


    const timerRef = useRef<number | null>(null);
    const isRegenerating = data.animState === 'regenerating';

    // [致命视觉 Bug 修复] 底部大数字也必须扣除 damageTaken (欠条)！
    // [新增] 引入瞬息(Ephemeral)专属的最后0.3秒数值强制抹杀逻辑
    // [重构] 这里改为监听拦截器发出的 targetHealth/Power
    const safeHealth = ephemeralEmpty ? 0 : targetHealth;
    const safePower = ephemeralEmpty ? 0 : targetPower;

    const [displayHealth, isHealthTicking] = useNumberTicker(
        safeHealth,
        isRegenerating ? 500 : 400
    );
    // [重构] 将攻击力的跳动时间从 1000ms 大幅缩短至 400ms，配合飘字演出爆发感
    const [displayPower] = useNumberTicker(safePower, 400);

    // [召唤入场] 覆盖显示：召唤动画期间用生长数值代替真实值
    // [V2·三段时序] 阶段A/阶段B 期间数值显示生长值（未生成时显示 0），演出结束回真实值
    const displayNum = (summonActive || summonRevealed) ? (summonAnim ?? { power: 0, health: 0 }) : summonAnim;
    const finalDisplayPower = displayNum ? displayNum.power : displayPower;
    const finalDisplayHealth = displayNum ? displayNum.health : displayHealth;
    const handleMouseEnter = () => {
        if (location === 'spell_stack' || location === 'preview') return;

        // [核心修复] 简单粗暴，只要是在手牌里被鼠标划过，直接触发悬停音效！
        if (location === 'hand') {
            eventBus.emit(GameEvents.SFX_CARD_HOVER);
        }

        timerRef.current = setTimeout(() => setShowEye(true), 500);
    };

    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowEye(false);
    };

    const isOnBoard = location === 'bench' || location === 'combat' || location === 'enemy_bench';
    const isPreview = location === 'preview';

    const baseCard = CARD_DB[data.key] || data || { power: 0, health: 0, maxHealth: 0 };
    let basePower = baseCard.power ?? 0;
    let baseHealth = baseCard.health ?? 0;

    if (data.level === 2) {
        if (data.key === 'fenny') {
            basePower += 4;
            baseHealth += 1;
        } else {
            basePower += 1;
            baseHealth += 1;
        }
    }

    // [核心重构] 大道至简：直接拿实际面板身材和白板身材比大小！
    const powerColor = currentFinalPower > basePower ? 'text-green-400' : (currentFinalPower < basePower ? 'text-red-500' : 'text-white');
    let healthColor = currentFinalHealth > baseHealth ? 'text-green-400' : (currentFinalHealth < baseHealth ? 'text-red-500' : 'text-white');

    if (isRegenerating && isHealthTicking) {
        healthColor = 'text-green-400';
    }

    // [坚韧] 计算生命槽位样式：持有 Tough 的单位使用金琥珀金属质感槽位
    const hasTough = data.keywords?.includes('Tough');
    const healthSlotBg = hasTough
        ? 'bg-gradient-to-br from-[#be8f11] to-[#8a6508]'
        : 'bg-gradient-to-br from-red-600 to-red-800';
    // [坚韧] 金琥珀金属渐变（垂直光感：亮→主色→暗→深，模拟金属反射）
    const toughMetallicBg = 'linear-gradient(180deg, #ecd067 0%, #be8f11 20%, #8a6508 55%, #5a3f04 100%)';
    // [冻结] 攻击力槽位天蓝色
    const hasFrostbite = data.keywords?.includes('Frostbite');
    const isThawing = data.animState === 'thawing';
    // [冻结] 解冻冰晶碎片飞散偏移（固定值，确保渲染一致性）
    const SHARD_OFFSETS = [
        { x: -40, y: -55, rot: 180 }, { x: 52, y: -38, rot: 45 },
        { x: -32, y: 48, rot: 260 }, { x: 48, y: 42, rot: 120 },
        { x: -58, y: 8, rot: 310 }, { x: 12, y: -58, rot: 90 },
    ];

    // [召唤入场 V2·改进①] 真·卡面切片：不规则碎裂切分——polygon 大小不一、边界错落，打破均匀网格
    // [召唤入场 V2·改进②] 差异化归位节奏：每片独立时长+缓动——中间大块慢收、小块带 backOut 回弹、delay 乱序错峰
    // clip = clip-path polygon 裁剪区域（相对整卡，%坐标）；offX/offY = framer 初始位移(px)；rot = 初始旋转
    const SUMMON_SHARDS: { clip: string; offX: number; offY: number; rot: number; dur: number; delay: number; ease: any }[] = [
        { clip: 'polygon(0% 0%, 55% 0%, 40% 30%, 18% 22%, 0% 15%)', offX: -110, offY: -110, rot: -14, dur: 0.75, delay: 0.10, ease: 'easeOut' },
        { clip: 'polygon(55% 0%, 100% 0%, 100% 25%, 72% 40%, 40% 30%)', offX: 0, offY: -130, rot: 6, dur: 0.62, delay: 0.16, ease: 'backOut' },
        { clip: 'polygon(100% 25%, 100% 100%, 78% 78%, 72% 40%)', offX: 130, offY: -100, rot: -10, dur: 0.90, delay: 0.04, ease: 'easeOut' },
        { clip: 'polygon(0% 15%, 18% 22%, 40% 30%, 26% 62%, 0% 50%)', offX: -110, offY: 60, rot: 12, dur: 0.68, delay: 0.20, ease: 'backOut' },
        { clip: 'polygon(40% 30%, 72% 40%, 78% 78%, 55% 90%, 26% 62%)', offX: 60, offY: 120, rot: -8, dur: 0.95, delay: 0.00, ease: [0.22, 1, 0.36, 1] },
        { clip: 'polygon(0% 50%, 26% 62%, 55% 90%, 30% 100%, 0% 100%)', offX: -140, offY: 100, rot: 16, dur: 0.72, delay: 0.12, ease: 'easeOut' },
        { clip: 'polygon(55% 90%, 78% 78%, 100% 100%, 30% 100%)', offX: 110, offY: 130, rot: -12, dur: 0.65, delay: 0.18, ease: 'backOut' },
    ];

    // [飞剑专属·时空裂隙 V1] 安卡飞剑召唤专属碎片，区别于普通召唤的"四周拼合"：
    //   · 碎片沿 45° 斜轴分层汇聚（时空裂隙闭合感）：主斜带(\) + 副斜带(/) 各 4 片，两带于中心交叉
    //   · 前中后三层：角落大块先落(后层) → 中带跟随(中层) → 中心菱形最后归位(前层, backOut 弹入)
    //   · 轨迹为直线斜滑（无弧线抬升），贴"裂隙滑移"意象
    const isAcaciaSword = data.key === 'Acacia_Flying_Sword' || data.key === 'Acacia_Great_Sword';
    // [飞剑专属] 冰青色滤镜：阶段A 切片层起步色调（青转彩的"青"，取安卡 sky 阵营色系）
    const ACACIA_SUMMON_FILTER = 'grayscale(0.35) sepia(1) hue-rotate(165deg) brightness(0.5) saturate(1.7)';
    const SUMMON_SHARDS_ACACIA: { clip: string; offX: number; offY: number; rot: number; dur: number; delay: number; ease: any; z: number }[] = [
        // --- 主斜带 (\)：左上 → 右下 ---
        { clip: 'polygon(0% 0%, 50% 0%, 30% 40%, 0% 28%)', offX: -120, offY: -80, rot: -6, dur: 0.70, delay: 0.06, ease: 'easeOut', z: 10 },
        { clip: 'polygon(50% 0%, 84% 36%, 60% 60%, 30% 40%)', offX: -70, offY: -40, rot: -4, dur: 0.60, delay: 0.12, ease: 'backOut', z: 20 },
        { clip: 'polygon(84% 36%, 100% 52%, 100% 100%, 70% 100%)', offX: 110, offY: 70, rot: 5, dur: 0.75, delay: 0.08, ease: 'easeOut', z: 10 },
        { clip: 'polygon(0% 28%, 30% 40%, 24% 70%, 0% 58%)', offX: -110, offY: 60, rot: 4, dur: 0.65, delay: 0.16, ease: 'backOut', z: 20 },
        // --- 副斜带 (/)：右上 → 左下 ---
        { clip: 'polygon(50% 0%, 100% 0%, 100% 30%, 76% 34%)', offX: 110, offY: -80, rot: 6, dur: 0.68, delay: 0.10, ease: 'easeOut', z: 10 },
        { clip: 'polygon(76% 34%, 100% 30%, 100% 66%, 82% 68%)', offX: 90, offY: -30, rot: 3, dur: 0.58, delay: 0.18, ease: 'backOut', z: 20 },
        { clip: 'polygon(0% 58%, 24% 70%, 30% 100%, 0% 100%)', offX: -120, offY: 90, rot: -5, dur: 0.72, delay: 0.05, ease: 'easeOut', z: 10 },
        { clip: 'polygon(24% 70%, 82% 68%, 70% 100%, 30% 100%)', offX: 0, offY: 110, rot: -3, dur: 0.62, delay: 0.15, ease: 'backOut', z: 20 },
        // --- 中心核心菱形（前层，最后归位，弹入）---
        { clip: 'polygon(30% 40%, 60% 60%, 42% 78%, 24% 70%)', offX: 0, offY: -90, rot: 12, dur: 0.55, delay: 0.22, ease: 'backOut', z: 30 },
    ];

    // --- 渲染逻辑重构：场景化设计 ---
    const BASE_WIDTH = 288;
    const BASE_HEIGHT = 448;

    // 2. 场景判断
    const isCombat = location === 'combat';
    const isBench = location === 'bench' || location === 'enemy_bench';

    // [核心新增] 统一的战术棋子状态与阵营判定
    const isTacticalMode = isBench || isCombat;
    const isPlayerSide = location === 'bench' || (location === 'combat' && !isEnemyCombatant);

    // 3. 根据 location 计算外部容器尺寸与缩放
    let scale = 1;
    let containerClass = "";

    if (isPreview) {
        scale = 1;
        containerClass = "w-72 h-[28rem] z-[100] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)]";
    }
    else if (location === 'gacha') {
        scale = 0.7;
        containerClass = "w-full h-full rounded-xl";
    }
    else if (location === 'deck-builder') {
        scale = 0.6;
        containerClass = "w-[180px] h-[268px] rounded-xl shadow-lg";
    } else if (location === 'deck-panel') {
        // [核心新增] 面板内部极其迷你的特制展示尺寸
        scale = 0.28;
        containerClass = "w-[72px] h-[112px] rounded border border-yellow-600/50 shadow-md cursor-pointer hover:border-yellow-400 hover:shadow-[0_0_15px_rgba(234,179,8,0.5)] transition-all";
    } else if (location === 'hand') {
        scale = 0.45;
        containerClass = "w-[130px] h-[202px] rounded-lg";
    } else if (isBench) {
        scale = 1;
        containerClass = "w-[120px] h-[162px] rounded-md"; // 备战席保留原生尺寸
    } else if (isCombat) {
        scale = 1;
        // [核心修改] 战场模式变为 w-full h-full，完全由 Battlefield 父组件控制宽长比
        containerClass = "w-full h-full rounded-md shadow-2xl transition-all duration-500";
    } else {
        scale = 0.45;
        containerClass = "w-[130px] h-[202px] rounded-lg";
    }

    let borderImg = CARD_BORDERS.unit;
    if (data.isChampion) {
        borderImg = CARD_BORDERS.hero;
    } else if (data.type && data.type.includes('spell')) { // 新增安全检查
        borderImg = CARD_BORDERS.spell;
    }


    let animClass = '';
    // [核心修复] 同时监听 attacking 和 delayed_attacking 状态
    if (data.animState === 'attacking' || data.animState === 'delayed_attacking') {
        const hasQuickAttack = !isBlocker && data.keywords && data.keywords.includes('QuickAttack');

        if (isEnemyCombatant) {
            if (hasQuickAttack) {
                animClass = attackType === 'direct'
                    ? 'animate-quick-dash-down-long z-50'
                    : 'animate-quick-dash-down z-50';
            // [核心修复] 如果引擎发来了 delayed_attacking 指令，直接触发滞后反击动画！
            } else if (data.animState === 'delayed_attacking' || isFacingQuickAttack) {
                animClass = 'animate-delayed-bump-down z-50';
            } else {
                animClass = attackType === 'direct' ? 'animate-bump-down-long z-50' : 'animate-bump-down z-50';
            }
        } else {
            if (hasQuickAttack) {
                animClass = attackType === 'direct'
                    ? 'animate-quick-dash-up-long z-50'
                    : 'animate-quick-dash-up z-50';
            // [核心修复] 同理，处理我方作为防守方被快攻打击时的滞后反击
            } else if (data.animState === 'delayed_attacking' || isFacingQuickAttack) {
                animClass = 'animate-delayed-bump-up z-50';
            } else {
                animClass = attackType === 'direct' ? 'animate-bump-up-long z-50' : 'animate-bump-up z-50';
            }
        }
    }
    // [修改] GSAP接手受击震动，animate-shake仅用于localShake（落地/撤回等）
    if (data.animState === 'hit' || localShake) {
        animClass = localShake ? 'animate-shake' : '';
    }

    const hasCantBlock = data.keywords && data.keywords.includes('CantBlock'); // 新增安全检查
    const showAvailabilityGlow = !isPreview && (
        isPlayable ||
        (location === 'bench' && highlightTarget && !hasCantBlock) // <-- 增加 !hasCantBlock
    );
    const targetColor = (location === 'enemy_bench' || isEnemyCombatant) ? 'red' : 'blue';
    const targetableClass = isTargetable
        ? `ring-4 ring-${targetColor}-400 ring-opacity-60 animate-pulse cursor-pointer shadow-[0_0_20px_rgba(${targetColor === 'blue' ? '59,130,246' : '239,68,68'},0.5)]`
        : '';
    const targetedClass = isTargeted
        ? `ring-4 ring-${targetColor}-500 shadow-[0_0_30px_${targetColor === 'blue' ? 'blue' : 'red'}] brightness-110 z-50 scale-105 transition-transform`
        : '';

    // [新增] 隐秘单位在场上 (备战席或战场) 的严谨判定
    const isElusiveOnBoard = isTacticalMode && data.keywords && data.keywords.includes('Elusive');

    const renderFrontFace = () => {

        if (data.type && data.type.includes('spell') && !isCombat) { // 新增安全检查
            return (
                <div
                    style={{
                        width: `${BASE_WIDTH}px`,
                        height: `${BASE_HEIGHT}px`,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left'
                    }}
                    // [修复] 强制置于 z-10，确保它永远盖在 z-0 的龟裂贴花上面！
                    className="absolute top-0 left-0 bg-transparent overflow-hidden rounded-2xl z-10"
                >
                    <SpellCard data={data} burnoutValue={burnoutValue} displayParams={resolvedDisplayParams} damageColor={damageColor} isCostReduced={isCostReduced} />
                    {!isPreview && isSelected && (
                        <div className="absolute inset-0 border-4 border-blue-400 rounded-2xl z-50 pointer-events-none animate-pulse shadow-[0_0_20px_#3b82f6]"></div>
                    )}
                    {isOnBoard && isSpeaking && <SpeechBubble />}
                </div>
            );
        }
        // [召唤入场 V2] 阵营渐变背景（850 容器与切片层碎片共用）
        const regionGradient = data.region === 'Lyfe' ? 'from-gray-950 via-blue-950 to-gray-950'
            : data.region === 'Fenny' ? 'from-gray-950 via-orange-950 to-gray-950'
            : data.region === 'Pupu' ? 'from-gray-950 via-red-950 to-gray-950'
            : data.region === 'Mauxir' ? 'from-gray-950 via-purple-950 to-gray-950'
            : data.region === 'Acacia' ? 'from-gray-950 via-sky-950 to-gray-950'
            : data.region === 'Logistics' ? 'from-gray-950 via-gray-800 to-gray-950'
            : 'bg-slate-900';
        return (
        <>
        {/* [召唤入场 V2] 真·卡面切片碎片重组：卡面样式（阵营渐变+原画+边框）切成 7 片从四周飞回拼合 */}
        {/* 阶段A：切片层盖住 850（850 opacity 0）；summonActive 结束(0.9s)移除，露出完整卡进入阶段B */}
        {summonActive && (
            <>
                {/* 切片层：普通召唤灰白碎片沿弧线飞回拼合；飞剑专属走冰青色斜轴汇聚（无 overflow-hidden，碎片可从卡面外飞入） */}
                <motion.div
                    className={`absolute inset-0 z-[70] pointer-events-none ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'} ${isAcaciaSword ? '' : 'grayscale brightness-[0.35]'}`}
                    style={isAcaciaSword ? { filter: ACACIA_SUMMON_FILTER } : undefined}
                    initial={{ opacity: 1 }}
                >
                    {(isAcaciaSword ? SUMMON_SHARDS_ACACIA : SUMMON_SHARDS).map((piece, i) => (
                        <motion.div
                            key={i}
                            // [关键] 复现 850 原画层布局 + crop，保证拼合与切片移除后无缝衔接
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ clipPath: piece.clip, zIndex: (piece as any).z ?? 10 }}
                            initial={{ x: piece.offX, y: piece.offY, rotate: piece.rot }}
                            // [V2·改进③] 普通召唤弧形轨迹：y 中段抬升形成微弧；飞剑专属为直线斜滑（裂隙滑移感）
                            animate={isAcaciaSword
                                ? { x: [piece.offX, piece.offX * 0.5, 0], y: [piece.offY, piece.offY * 0.5, 0], rotate: [piece.rot, 0, 0] }
                                : { x: [piece.offX, piece.offX * 0.55, 0], y: [piece.offY, piece.offY * 0.55 - 26, 0], rotate: [piece.rot, 0, 0] }}
                            transition={{ duration: piece.dur, times: [0, 0.55, 1], ease: piece.ease }}
                        >
                            {/* 阵营渐变背景（整卡） */}
                            <div className={`absolute inset-0 bg-gradient-to-b ${regionGradient}`} />
                            {/* 原画（flex 居中 + crop） */}
                            <img
                                src={currentImageUrl}
                                alt={data.name}
                                draggable={false}
                                className="max-w-none opacity-90 block"
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    transform: `translate(${crop.offsetX}%, ${crop.offsetY}%) scale(${crop.scale})`
                                }}
                            />
                            {/* 主题边框（整卡 overlay） */}
                            <img src={borderImg} alt="" draggable={false} className="absolute inset-0 w-full h-full object-fill opacity-100 scale-[1.02]" />
                        </motion.div>
                    ))}
                </motion.div>

                {/* [V2·改进③] 汇聚光效：碎片落定瞬间的能量微光爆（飞剑专属偏青，突出棱镜感） */}
                <motion.div
                    className="absolute inset-0 z-[71] pointer-events-none"
                    initial={{ opacity: isAcaciaSword ? 0.7 : 0.6, scale: 0.55 }}
                    animate={{ opacity: isAcaciaSword ? [0.7, 0.3, 0] : [0.6, 0.25, 0], scale: isAcaciaSword ? [0.55, 1.15, 1.45] : [0.55, 1.1, 1.35] }}
                    transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
                    style={{ background: isAcaciaSword
                        ? 'radial-gradient(circle, rgba(56,189,248,0.5) 0%, rgba(56,189,248,0.16) 42%, transparent 72%)'
                        : 'radial-gradient(circle, rgba(125,211,252,0.4) 0%, rgba(125,211,252,0.12) 45%, transparent 70%)' }}
                />
                {/* [飞剑专属·时空裂隙] 斜向棱镜光带：沿 45° 轴扫过，强化裂隙闭合感 */}
                {isAcaciaSword && (
                    <motion.div
                        className="absolute inset-0 z-[72] pointer-events-none overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.35, 0] }}
                        transition={{ duration: 0.5, delay: 0.38, times: [0, 0.5, 1], ease: 'easeOut' }}
                        style={{ background: 'linear-gradient(135deg, transparent 30%, rgba(56,189,248,0.35) 50%, transparent 70%)' }}
                    />
                )}
            </>
        )}
        {/* [修改] 统一外层圆角 */}
        {/* [修复] 强制置于 z-10，确保实体背景盖住 z-0 的贴花，让贴花只从边缘溢出！ */}
        {/* [核心机制] 将外层容器改为 motion.div，严格控制仅隐秘单位在场上时执行 [1, 0.3, 1] 的实体呼吸 */}
        <motion.div
            className={`w-full h-full absolute inset-0 overflow-hidden ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'} z-10 bg-gradient-to-b ${regionGradient} ${
                summonRevealed ? (isAcaciaSword ? 'animate-summon-reveal-color-acacia' : 'animate-summon-reveal-color') : ''
            }`}
            animate={summonActive ? { opacity: 0 } : (isElusiveOnBoard ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 })}
            transition={summonActive ? { duration: 0 } : (isElusiveOnBoard ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : undefined)}
        >
            {isTacticalMode ? (
                // --- A & C 合并：战术棋子与战场弹性模式 (Tactical Token & Elastic Combat) ---
                <div className="relative w-full h-full bg-black flex flex-col overflow-hidden rounded-md">
                    {/* 原画层 - 底层 (接入坐标裁剪) */}
                    <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
                        {/* [核心优化] 动态兜底背景：拥有皮肤时闪耀金色光辉，默认时按阵营配色 */}
                        <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none ${
                            skinId > 0
                                ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5'
                                : data.region === 'Lyfe' ? 'from-blue-600/40 via-blue-500/20 to-blue-300/5'
                                : data.region === 'Fenny' ? 'from-orange-600/40 via-orange-500/20 to-orange-300/5'
                                : data.region === 'Pupu' ? 'from-red-600/40 via-red-500/20 to-red-300/5'
                                : data.region === 'Mauxir' ? 'from-purple-600/40 via-purple-500/20 to-purple-300/5'
                                : data.region === 'Acacia' ? 'from-sky-600/40 via-sky-500/20 to-sky-300/5'
                                : 'from-gray-300/40 via-gray-200/20 to-white/5'
                        }`}></div>
                        <img
                            src={currentImageUrl}
                            alt={data.name}
                            draggable={false}
                            // [修复] 移除多余的 transition-transform，实现状态改变时图像坐标的“瞬切”
                            className="max-w-none opacity-90 block"
                            style={{
                                width: data.type && data.type.includes('spell') ? 'auto' : '100%',
                                height: data.type && data.type.includes('spell') ? '100%' : 'auto',
                                transform: `translate(${crop.offsetX}%, ${crop.offsetY}%) scale(${crop.scale})`
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 pointer-events-none"></div>
                    </div>

                    {/* [微调 1] 动态内边框底座：使用 isPlayerSide 统一判断敌我 */}
                    <div className={`absolute inset-[1.5px] z-10 pointer-events-none border-[2px] border-[#1a1d24] rounded-sm ${isPlayerSide ? 'border-b-[15px]' : 'border-t-[15px]'}`}></div>
                    {/* 内边框高光辅助线 */}
                    <div className={`absolute inset-[1.5px] z-10 pointer-events-none border border-white/10 rounded-sm ${isPlayerSide ? 'border-b-[15px] border-white/20' : 'border-t-[15px] border-white/20'}`}></div>

                    {/* 恢复原版主题边框 */}
                    <div className="absolute inset-0 z-20 pointer-events-none">
                        <img src={borderImg} alt="边框" className="w-full h-full object-fill opacity-100 scale-[1.02]" draggable={false} />
                    </div>

                    {/* --- 根据阵营决定镜像布局 --- */}
                    {isPlayerSide ? (
                        <>
                            {/* [我方] 顶部：数值区 */}
                            {/* [修复 2] 增加底部灰色金属描边，加高尺寸到 h-8，并增加中间分割线 */}
                            <div className="relative z-30 flex w-full h-8 opacity-95 border-b-[2px] border-slate-400/80 shadow-[0_2px_5px_rgba(0,0,0,0.6)]">
                                <div className="relative flex-1 flex items-center justify-center border-r-[2px] border-slate-400/80 overflow-hidden">
                                    {/* [冻结] Layer 0: 橙色原生槽位（始终存在） */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-700" />
                                    {/* [冻结] Layer 1: 冰蓝覆盖层 */}
                                    {hasFrostbite && (
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-cyan-700"
                                            animate={isThawing ? { opacity: [1, 0.8, 0] } : { opacity: 1 }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    )}
                                    {/* [冻结] Layer 2: 解冻冰爆动画 */}
                                    {isThawing && (
                                        <>
                                            {/* 冰裂纹 SVG */}
                                            <motion.div className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <svg className="w-full h-full overflow-visible" viewBox="0 0 100 28" preserveAspectRatio="none">
                                                    <motion.path d="M10,14 L30,6 L25,18 L45,10 L40,22 L60,12 L55,20 L75,8 L70,24 L90,14"
                                                        stroke="white" strokeWidth="1.5" fill="none"
                                                        initial={{ pathLength: 0, opacity: 0 }}
                                                        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
                                                        transition={{ duration: 0.3, ease: 'easeOut' }}
                                                    />
                                                </svg>
                                            </motion.div>
                                            {/* 冰晶碎片飞散（6片菱形） */}
                                            {SHARD_OFFSETS.map((off, i) => (
                                                <motion.div
                                                    key={`shard-${i}`}
                                                    className="absolute z-20 w-2.5 h-2.5 bg-cyan-300/90 pointer-events-none"
                                                    style={{ top: '50%', left: '50%', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
                                                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                                                    animate={{ x: [0, off.x], y: [0, off.y], rotate: [0, off.rot], opacity: [1, 0.8, 0], scale: [1, 0.4, 0.1] }}
                                                    transition={{ duration: 0.6, delay: 0.15 + i * 0.04, ease: 'easeOut' }}
                                                />
                                            ))}
                                            {/* 小型粒子飞散 */}
                                            {[0,1,2,3].map(j => (
                                                <motion.div
                                                    key={`ptcl-${j}`}
                                                    className="absolute z-20 w-1 h-1 bg-sky-200/80 rounded-full pointer-events-none"
                                                    style={{ top: '50%', left: '50%' }}
                                                    initial={{ x: 0, y: 0, opacity: 1 }}
                                                    animate={{ x: [0, (j - 1.5) * 30], y: [0, ((j % 3) - 1) * 28], opacity: [1, 0] }}
                                                    transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                                                />
                                            ))}
                                        </>
                                    )}
                                    <span className={`relative z-5 font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayPower}
                                    </span>
                                </div>
                                <div className="flex-1 flex items-center justify-center relative overflow-hidden"
                                     style={{ background: hasTough ? toughMetallicBg : 'linear-gradient(135deg, #dc2626, #991b1b)' }}>
                                    {/* [坚韧] 金属高光层 */}
                                    {hasTough && <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/40 pointer-events-none" />}
                                    {/* [坚韧] 受击亮度闪烁 */}
                                    {hasTough && (
                                        <motion.div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.3))' }}
                                            initial={{ opacity: 0 }}
                                            animate={data.animState === 'hit' ? { opacity: [0, 0.7, 0] } : { opacity: 0 }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    )}
                                    <span className={`relative z-10 font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayHealth}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 z-10 relative pointer-events-none"></div>

                            {/* [我方] 底部：动态折行黑水晶卡槽 */}
                            {(data.keywords && data.keywords.length > 0 || (data.ability && data.abilityState && data.abilityState !== 'hidden')) && (
                                <div className="relative z-30 w-full flex justify-center mt-auto pb-[2px]">
                                    {/* [替换] 引入智能卡槽，下放进攻/防守状态，由图标自身负责发光与动画 */}
                                    <KeywordTray
                                        keywords={data.keywords}
                                        isAttacking={isCombat && !isBlocker}
                                        isDefending={isCombat && isBlocker}
                                        animState={data.animState}
                                        depletedKeywords={data.depletedKeywords}
                                        titanCount={displayTitanCount}
                                        isOnBoard={true}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* [敌方] 顶部：动态折行黑水晶卡槽 */}
                            {(data.keywords && data.keywords.length > 0 || (data.ability && data.abilityState && data.abilityState !== 'hidden')) && (
                                <div className="relative z-30 w-full flex justify-center mb-auto pt-[2px]">
                                    {/* [替换] 引入智能卡槽 */}
                                    <KeywordTray
                                        keywords={data.keywords}
                                        isAttacking={isCombat && !isBlocker}
                                        isDefending={isCombat && isBlocker}
                                        animState={data.animState}
                                        depletedKeywords={data.depletedKeywords}
                                        titanCount={displayTitanCount}
                                        isOnBoard={true}
                                    />
                                </div>
                            )}

                            <div className="flex-1 z-10 relative pointer-events-none"></div>

                            {/* [敌方] 底部：数值区 */}
                            {/* 敌方数值区在底部，所以是上方增加灰色描边 border-t-[2px] */}
                            <div className="relative z-30 flex w-full h-8 opacity-95 border-t-[2px] border-slate-400/80 shadow-[0_-2px_5px_rgba(0,0,0,0.6)] mt-auto">
                                <div className="relative flex-1 flex items-center justify-center border-r-[2px] border-slate-400/80 overflow-hidden">
                                    {/* [冻结] Layer 0: 橙色原生槽位（始终存在） */}
                                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-orange-700" />
                                    {/* [冻结] Layer 1: 冰蓝覆盖层 */}
                                    {hasFrostbite && (
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-br from-cyan-400 to-cyan-700"
                                            animate={isThawing ? { opacity: [1, 0.8, 0] } : { opacity: 1 }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    )}
                                    {/* [冻结] Layer 2: 解冻冰爆动画 */}
                                    {isThawing && (
                                        <>
                                            {/* 冰裂纹 SVG */}
                                            <motion.div className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                <svg className="w-full h-full overflow-visible" viewBox="0 0 100 28" preserveAspectRatio="none">
                                                    <motion.path d="M10,14 L30,6 L25,18 L45,10 L40,22 L60,12 L55,20 L75,8 L70,24 L90,14"
                                                        stroke="white" strokeWidth="1.5" fill="none"
                                                        initial={{ pathLength: 0, opacity: 0 }}
                                                        animate={{ pathLength: 1, opacity: [0, 0.6, 0] }}
                                                        transition={{ duration: 0.3, ease: 'easeOut' }}
                                                    />
                                                </svg>
                                            </motion.div>
                                            {/* 冰晶碎片飞散（6片菱形） */}
                                            {SHARD_OFFSETS.map((off, i) => (
                                                <motion.div
                                                    key={`shard-e-${i}`}
                                                    className="absolute z-20 w-2.5 h-2.5 bg-cyan-300/90 pointer-events-none"
                                                    style={{ top: '50%', left: '50%', clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
                                                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 1 }}
                                                    animate={{ x: [0, off.x], y: [0, off.y], rotate: [0, off.rot], opacity: [1, 0.8, 0], scale: [1, 0.4, 0.1] }}
                                                    transition={{ duration: 0.6, delay: 0.15 + i * 0.04, ease: 'easeOut' }}
                                                />
                                            ))}
                                            {/* 小型粒子飞散 */}
                                            {[0,1,2,3].map(j => (
                                                <motion.div
                                                    key={`ptcl-e-${j}`}
                                                    className="absolute z-20 w-1 h-1 bg-sky-200/80 rounded-full pointer-events-none"
                                                    style={{ top: '50%', left: '50%' }}
                                                    initial={{ x: 0, y: 0, opacity: 1 }}
                                                    animate={{ x: [0, (j - 1.5) * 30], y: [0, ((j % 3) - 1) * 28], opacity: [1, 0] }}
                                                    transition={{ duration: 0.8, delay: 0.25, ease: 'easeOut' }}
                                                />
                                            ))}
                                        </>
                                    )}
                                    <span className={`relative z-5 font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayPower}
                                    </span>
                                </div>
                                <div className="flex-1 flex items-center justify-center relative overflow-hidden"
                                     style={{ background: hasTough ? toughMetallicBg : 'linear-gradient(135deg, #dc2626, #991b1b)' }}>
                                    {/* [坚韧] 金属高光层 */}
                                    {hasTough && <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/40 pointer-events-none" />}
                                    {/* [坚韧] 受击亮度闪烁 */}
                                    {hasTough && (
                                        <motion.div
                                            className="absolute inset-0 pointer-events-none"
                                            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.3))' }}
                                            initial={{ opacity: 0 }}
                                            animate={data.animState === 'hit' ? { opacity: [0, 0.7, 0] } : { opacity: 0 }}
                                            transition={{ duration: 0.5, ease: 'easeOut' }}
                                        />
                                    )}
                                    <span className={`relative z-10 font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayHealth}
                                    </span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ) : (
                // --- B. 竖向模式 (手牌/预览/构筑) ---
                <div
                    style={{
                        width: `${BASE_WIDTH}px`,
                        height: `${BASE_HEIGHT}px`,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left'
                    }}
                    className={`absolute top-0 left-0 overflow-hidden rounded-2xl ${
                        data.region === 'Lyfe' ? 'bg-gradient-to-b from-gray-950 via-blue-950 to-gray-950'
                        : data.region === 'Fenny' ? 'bg-gradient-to-b from-gray-950 via-orange-950 to-gray-950'
                        : data.region === 'Pupu' ? 'bg-gradient-to-b from-gray-950 via-red-950 to-gray-950'
                        : data.region === 'Mauxir' ? 'bg-gradient-to-b from-gray-950 via-purple-950 to-gray-950'
                        : data.region === 'Acacia' ? 'bg-gradient-to-b from-gray-950 via-sky-950 to-gray-950'
                        : data.region === 'Logistics' ? 'bg-gradient-to-b from-gray-950 via-gray-800 to-gray-950'
                        : 'bg-slate-900'
                    }`}
                >
                    {/* [新增] 边框层 (竖向模式) - z-10 (位于原画之上) */}
                            {/* 注意：如果边框是透明通带，它会透出下面的原画。pointer-events-none 确保不阻挡交互 */}
                            {location !== 'deck-panel' && (
                            <div className="absolute inset-0 z-10 pointer-events-none">
                                <img
                                    src={borderImg}
                                    alt="边框"
                                    draggable={false}
                                    className="w-full h-full object-fill opacity-100"
                                />
                            </div>
                            )}

                    {/* 竖向模式原画层 (接入坐标裁剪) */}
                    <div className="absolute inset-0 bg-black overflow-hidden flex items-center justify-center">
                        {/* [核心优化] 动态兜底背景：拥有皮肤时闪耀金色光辉，默认时按阵营配色 */}
                        {location !== 'deck-panel' && (
                        <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none ${
                            skinId > 0
                                ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5'
                                : data.region === 'Lyfe' ? 'from-blue-600/40 via-blue-500/20 to-blue-300/5'
                                : data.region === 'Fenny' ? 'from-orange-600/40 via-orange-500/20 to-orange-300/5'
                                : data.region === 'Pupu' ? 'from-red-600/40 via-red-500/20 to-red-300/5'
                                : data.region === 'Mauxir' ? 'from-purple-600/40 via-purple-500/20 to-purple-300/5'
                                : data.region === 'Acacia' ? 'from-sky-600/40 via-sky-500/20 to-sky-300/5'
                                : 'from-gray-300/40 via-gray-200/20 to-white/5'
                        }`}></div>
                        )}
                        <img
                            src={currentImageUrl}
                            alt={data.name}
                            draggable={false}
                            // [修复] 移除多余的 transition-transform，实现状态改变时图像坐标的”瞬切”
                            className={location === 'deck-panel' ? 'w-full h-full object-cover block' : 'max-w-none block'}
                            style={location === 'deck-panel' ? undefined : {
                                width: data.type && data.type.includes('spell') ? 'auto' : '100%',
                                height: data.type && data.type.includes('spell') ? '100%' : 'auto',
                                transform: `translate(${crop.offsetX}%, ${crop.offsetY}%) scale(${crop.scale})`
                            }}
                        />
                    </div>

                    {location !== 'deck-panel' && (
                        // [UI重构 4] 重心压低遮罩层高度，使用更密集的渐变阈值，让上半部画幅彻底干净！
                        <div className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/100 via-black/80 to-transparent px-4 pb-0`} style={{ backgroundSize: '100% 60%', backgroundRepeat: 'no-repeat', backgroundPosition: 'bottom' }}>

                             <div className={`absolute top-4 left-4 rounded-full bg-blue-600 border-2 border-yellow-400 flex items-center justify-center font-black shadow-lg z-10 ${isBench ? 'w-16 h-16 text-4xl' : 'w-12 h-12 text-2xl'} ${
                                isCostReduced ? 'text-green-400' :
                                burnoutValue != null && burnoutValue > data.cost ? 'text-red-400' :
                                burnoutValue != null && burnoutValue < data.cost ? 'text-green-400' : 'text-white'
                             }`}>
                                {burnoutValue ?? data.cost}
                             </div>

                             {!isBench && (
                                 // [UI重构 3] 主文本区块：使用 mt-auto 强行顶到底部！
                                 <div className="mt-auto pb-1 flex flex-col">
                                    {/*名字渲染区 */}
                                    <div className="flex flex-col items-center justify-center mb-1">
                                        {data.name && data.name.includes('\n') ? ( // 新增 data.name 检查
                                            <>
                                                <span className="text-white/80 font-bold text-[22px] tracking-widest uppercase drop-shadow-md leading-none mb-1">
                                                    {data.name.split('\n')[0]}
                                                </span>
                                                <div className="text-center font-black text-3xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-100 to-yellow-500 drop-shadow-sm tracking-wide leading-none">
                                                    {data.name.split('\n')[1]}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-center font-black text-3xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-100 to-yellow-500 drop-shadow-sm tracking-wide">
                                                {data.name || 'Unknown Card'} {/* 兜底：name 为空时显示默认值 */}
                                            </div>
                                        )}
                                    </div>
                                    {(data.keywords && data.keywords.length > 0 || (data.ability && data.abilityState && data.abilityState !== 'hidden')) && (
                                        <div className="flex justify-center mb-1">
                                            {/* [替换] 竖向手牌模式也统一使用智能卡槽，自带六边形黑底，视觉更加统一和规整 */}
                                            <KeywordTray
                                                keywords={data.keywords}
                                                animState={data.animState}
                                                depletedKeywords={data.depletedKeywords}
                                                titanCount={displayTitanCount}
                                                className="scale-110" // 微缩以适配紧凑布局
                                                isOnBoard={false}
                                            />
                                        </div>
                                    )}
                                    <div className={`text-center text-gray-200 text-[16px] leading-snug font-medium drop-shadow-md px-1 min-h-[3rem]`}>
                                        <p className="whitespace-pre-wrap">{renderDescription(data.description, resolvedDisplayParams, damageColor)}</p>
                                    </div>
                                 </div>
                             )}

                             {isBench && (data.keywords && data.keywords.length > 0 || (data.ability && data.abilityState && data.abilityState !== 'hidden')) && (
                                 <div className="flex justify-center mb-6">
                                    {/* [替换] 竖向备战席模式使用智能卡槽 */}
                                    <KeywordTray
                                        keywords={data.keywords}
                                        animState={data.animState}
                                        depletedKeywords={data.depletedKeywords}
                                        titanCount={displayTitanCount}
                                        className="scale-[1.8]"
                                        isOnBoard={true}
                                    />
                                 </div>
                             )}

                             {/* [UI重构 2] 英雄升级条件下沉，与攻防数值处于同一视平线 */}
                             {data.type && data.type.includes('unit') ? ( // 新增安全检查
                                <div className="relative flex justify-between items-end px-2 pb-2 h-20 border-t border-white/20 mt-1">
                                    <div className={`font-black drop-shadow-md ${powerColor} ${isBench ? 'text-7xl' : 'text-4xl'} z-10`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayPower}
                                    </div>

                                    {/* [UI重构 1] 删除了无用的多边形，将升级面板直接嵌入在这两个数字中间！ */}
                                    {data.isChampion && data.level === 1 && ['hand', 'preview', 'gacha', 'deck-builder'].includes(location) && data.levelUpCondition ? (
                                        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center justify-end z-0 pointer-events-none opacity-95">
                                            {/* 金色分割线 */}
                                            <div className="text-yellow-500/90 font-black tracking-widest text-[12px] flex items-center gap-1 leading-none mb-0.5">
                                                <span className="w-6 h-px bg-gradient-to-r from-transparent to-yellow-500/60"></span>
                                                — 升级 —
                                                <span className="w-6 h-px bg-gradient-to-l from-transparent to-yellow-500/60"></span>
                                            </div>

                                            {/* 动态进度计算逻辑 */}
                                            {(() => {
                                                let currentProgress = 0;
                                                const target = data.levelUpTarget || 1;

                                                if (data.key === 'fenny') {
                                                    const pHealth = playerNexusHealth ?? 20;
                                                    const eHealth = enemyNexusHealth ?? 20;
                                                    if (pHealth <= 10 || eHealth <= 10) currentProgress = 1;
                                                } else if (data.key === 'lyfe') {
                                                    currentProgress = data.strikeCount || 0;
                                                } else if (data.key === 'pupu_specular_soul') {
                                                    currentProgress = data.customProgress || 0;
                                                } else if (data.key === 'mauxir_lotus_drive') {
                                                    currentProgress = data.customProgress || 0;
                                                } else if (data.key === 'acacia_chrono_echo') {
                                                    // [2026-07-31] 场下升级：朔望之期打出后 customProgress 标记达成（1/1）
                                                    currentProgress = data.customProgress || 0;
                                                }

                                                const displayProgress = Math.min(currentProgress, target);
                                                const progressPercentage = Math.min((displayProgress / target) * 100, 100);

                                                return (
                                                    <>
                                                        <div className="text-white/90 text-[11px] font-bold text-center leading-tight drop-shadow-md px-8 whitespace-nowrap overflow-visible">
                                                            {data.levelUpCondition}
                                                            <div className="font-mono text-blue-300 font-black text-[10px] mt-0.5 leading-none">
                                                                ({displayProgress}/{target})
                                                            </div>
                                                        </div>
                                                        <div className="w-24 h-1.5 bg-gray-800/80 rounded-full overflow-hidden shadow-inner mt-1 mb-0.5 border border-black/40">
                                                            <div
                                                                className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_5px_rgba(59,130,246,0.8)]"
                                                                style={{ width: `${progressPercentage}%` }}
                                                            />
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    ) : (
                                        /* 兜底占位：非英雄单位只渲染一条隐形的横线以保持排版重心 */
                                        <div className="w-1/3 h-px"></div>
                                    )}

                                    <div className={`font-black drop-shadow-md transition-all duration-300 ease-out origin-center ${healthColor} ${isBench ? 'text-7xl' : 'text-4xl'} z-10 ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : finalDisplayHealth}
                                    </div>
                                </div>
                             ) : (
                                <div className="flex justify-center pb-2 text-white/50 text-sm font-mono uppercase tracking-widest border-t border-white/20 mt-1 pt-2">SPELL</div>
                             )}
                        </div>
                    )}
                </div>
            )}
        </motion.div>
        {/* --- 2. 特效层 (VFX) - 附着在正面 --- */}

            <KeywordEffects
                data={data}
                location={location}
                isBlocker={isBlocker}
                isEnemyCombatant={isEnemyCombatant}
                onChallengerClick={onChallengerClick}
                isChallengerActive={isChallengerActive}
                canBeChallenged={canBeChallenged}
                isChallengedTarget={isChallengedTarget}
                highlightTarget={highlightTarget}
                isBlocking={isBlocking}
                titanCount={displayTitanCount}
            />

            {/* [极致重构] 攻击力飘字 (Power Floater) - 左侧双向爆裂 */}
            {!isPreview && powerDelta !== null && (
                <motion.div
                    // [锚点微调] 贴紧左侧(left-4)和上下边界(top-2/bottom-2)，确保精准从数值槽生长出来
                    className={`absolute left-4 ${isPlayerSide ? 'top-2' : 'bottom-2'} ${isTacticalMode ? 'text-3xl' : 'text-5xl'} font-black z-[100] whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] stroke-black
                        ${powerDelta > 0 ? 'text-green-400' : 'text-red-400'}`}
                    initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                    animate={{
                        x: -40,  // 无论是增益还是减益，左侧数值统一向左扩
                        y: powerDelta > 0 ? -50 : 50, // 增益上浮，减益下沉
                        scale: [1, 1.5, 2], // 统一带有爆裂放大感
                        opacity: [1, 1, 0]
                    }}
                    transition={{
                        duration: 1.5, // 统一空中悬停1.5秒
                        ease: "easeOut",
                        times: [0, 0.5, 1]
                    }}
                >
                    {powerDelta > 0 ? `+${powerDelta}` : powerDelta}
                </motion.div>
            )}

            {/* [极致重构] 生命值飘字队列 (Health Floater Queue) - 右侧双向爆裂 */}
            {!isPreview && hitQueue.length > 0 && hitQueue.map((hit, index) => (
                <motion.div
                    key={hit.id}
                    // [锚点微调] 贴紧右侧(right-4)和上下边界(top-2/bottom-2)
                    className={`absolute right-4 ${isPlayerSide ? 'top-2' : 'bottom-2'} ${isTacticalMode ? 'text-3xl' : 'text-5xl'} font-black z-[100] whitespace-nowrap drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] stroke-black
                        ${hit.amount > 0 ? 'text-green-400' : 'text-red-500'}`}
                    initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                    animate={{
                        x: 40,  // 无论是增益还是减益，右侧数值统一向右扩
                        y: (hit.amount > 0 ? -50 : 50) + (isPlayerSide ? -index * 45 : index * 45), // 多段纵轴错开
                        scale: [1, 1.5, 2],
                        opacity: [1, 1, 0]
                    }}
                    transition={{
                        duration: 1.5,
                        ease: "easeOut",
                        times: [0, 0.5, 1]
                    }}
                >
                    {hit.amount > 0 ? `+${hit.amount}` : hit.amount}
                </motion.div>
            ))}


            {/* Enemy Selection Arrow (敌方被选中箭头) */}
            {!isPreview && (location === 'combat' && isEnemyCombatant && isSelected) && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce z-50">
                    <ChevronDown size={32} className="text-orange-500 fill-orange-500" />
                </div>
            )}

            {/* Speech Bubble (台词气泡) */}
            {isOnBoard && isSpeaking && <SpeechBubble />}
            </>
    );
    };

    // --- 内部渲染函数：背面 (保持不变) ---
    const renderBackFace = () => (
        <div className="w-full h-full absolute inset-0 rounded-xl overflow-hidden border-2 border-[#1a1a1a] bg-slate-800 z-10">
            <img
                src={cardBackUrl || "https://placehold.co/300x450/1e293b/ffffff?text=BACK"}
                className="w-full h-full object-cover relative z-10"
                alt="卡背"
                draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none z-20"></div>
        </div>
    );

// [新增] 渲染左上角购物车图标
    const renderShopIcon = () => {
        if (!showShopIcon || location === 'preview') return null;

        // 如果已满 3 张且不是测试卡，不显示购买图标
        if (ownedCount >= 3 && data.region !== 'TEST') return null;

        const isNewCard = ownedCount === 0;
        // 绿色=解锁，蓝色=加购
        const colorClass = isNewCard ? 'bg-green-500 hover:bg-green-400' : 'bg-blue-500 hover:bg-blue-400';

        return (
            <div
                className={`absolute -top-3 -left-3 z-[60] w-8 h-8 rounded-full ${colorClass} flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-white transition-transform hover:scale-110`}
                title={isNewCard ? "Unlock Card" : "Buy More"}
                onClick={(e) => {
                    e.stopPropagation();
                    if (onViewArt) onViewArt(data); // 点击图标进入详情页进行购买
                }}
            >
                <ShoppingCart size={14} className="text-white" />
            </div>
        );
    };

    // --- [新增] 动态计算物理参数 ---
    let dynamicInitial: any = false;
    // [核心修复] 提供绝对兜底的“静止休息状态”！
    // [修缮] 必须移除 boxShadow 属性！否则 FramerMotion 会强行覆盖并抹杀 Tailwind 的 ring 和 shadow 类名，导致手牌蓝色可用高光消失！
    let dynamicAnimate: any = { scale: 1.0, y: 0, rotateX: 0, rotateY: 0 };
    let dynamicTransition: any = { type: 'spring', stiffness: 300, damping: 25 };
    let dynamicWhileHover: any = {};

    if (isTacticalMode) {
        if (isLifting) {
            // 正在被玩家捏起
            dynamicAnimate = { scale: 1.1, y: -15, boxShadow: "0px 25px 35px rgba(0,0,0,0.6)" };
            dynamicTransition = { type: 'spring', stiffness: 400, damping: 25 };
        } else {
            // 依据前置记录，计算初始姿态与砸落曲线
            // 💡 【动画微调指南】：
            // scale: 起飞高度 (例如 1.5 表示放大1.5倍，看起来飞得很高)
            // y: 空中的垂直偏移 (-60 表示向屏幕上方移动 60px)
            // duration: 砸落的耗时 (0.15 = 150毫秒，数值越小下砸越迅猛)
            // ease: 阻力曲线 ("easeIn" 能完美模拟重力加速落地，比 linear 更有打击感)
            if ((prevKnownLoc === 'hand' || prevKnownLoc === 'preview') && location === 'bench') {
                // 场景 1: 重磅空投
                dynamicInitial = { scale: 1.5, y: -60, boxShadow: "0px 50px 50px rgba(0,0,0,0.5)" };
                dynamicTransition = { duration: 0.15, ease: "easeIn" };
            } else if ((prevKnownLoc === 'bench' || prevKnownLoc === 'enemy_bench') && location === 'combat') {
                dynamicInitial = { scale: 1.1, y: -15, boxShadow: "0px 20px 30px rgba(0,0,0,0.5)" };
                dynamicTransition = { duration: 0.1, ease: "linear" };
            } else if (prevKnownLoc === 'combat' && (location === 'bench' || location === 'enemy_bench')) {
                dynamicInitial = { scale: 1.1, y: -15, boxShadow: "0px 20px 30px rgba(0,0,0,0.5)" };
                dynamicTransition = { type: 'spring', stiffness: 200, damping: 20 };
            }
        }
    }

    // 优雅接管原生的 CSS hover 放大，防止底层 Transform 互相冲突
    if (!isPreview && isFaceUp && !isDragging && location !== 'combat' && !isLifting) {
        dynamicWhileHover = { scale: 1.05 };
    }

    // 兼容原版的抽卡翻面逻辑
    if (shouldAnimateDraw) {
        dynamicAnimate = { ...dynamicAnimate, scaleX: [1, 1, 0, 1, 1] };
        dynamicTransition = { times: [0, 0.4, 0.5, 0.6, 1], duration: 1.8, ease: "easeInOut" };
    }

    // --- [核心修改] Framer Motion 根容器 ---
    return (
        <motion.div
            data-entity-id={data.id}
            data-card-key={data.key}
            ref={cardHitRef}

            onClick={handleCardClick} // [核心] 接入我们写的拦截器
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            // [新增] 全局右键拦截：阻止浏览器默认菜单，并直接触发详情界面唤醒
            onContextMenu={(e) => {
                if (onViewArt) {
                    e.preventDefault();
                    e.stopPropagation();
                    onViewArt(data);
                }
            }}
            onPointerDown={onPointerDown} // [新增] 战场拖拽入口
            className={`
                relative cursor-pointer select-none group
                ${containerClass}
                ${className}
                ${!isPreview && isBlocker ? 'scale-90' : ''}
                ${!isPreview && isSelected ? 'ring-4 ring-blue-600 shadow-[0_0_30px_blue] z-50' : ''}
                ${targetableClass}
                ${targetedClass}
                ${animClass}
                ${isLocked ? 'grayscale opacity-80 pointer-events-none' : ''}
                ${isLifting ? 'z-[100]' : ''} /* [新增] 捏起时强制置于顶层 */
                /* [修正] 阵亡第一幕：普通死亡直接褪色，瞬息死亡必须等黄幕结束(Exploded)才褪色 */
                ${(data.animState === 'dying' || isEphemeralExploded) ? 'grayscale transition-all duration-300' : ''}
                border-2
                ${data.region === 'Lyfe' ? 'border-blue-500/20'
                    : data.region === 'Fenny' ? 'border-orange-500/20'
                    : data.region === 'Pupu' ? 'border-red-500/20'
                    : data.region === 'Mauxir' ? 'border-purple-500/20'
                    : data.region === 'Acacia' ? 'border-sky-500/20'
                    : data.region === 'Logistics' ? 'border-white/10'
                    : 'border-transparent'}
            `}
            initial={dynamicInitial}
            animate={dynamicAnimate}
            transition={dynamicTransition}
            whileHover={dynamicWhileHover}
        >
            {/* [修复] 独立高光光环层：彻底与外层 motion.div 的内联物理 boxShadow 解耦，躲在原画背后发光 */}
            {showAvailabilityGlow && !isSelected && (
                <div className={`absolute inset-0 z-[-1] ring-4 animate-pulse-slow ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'} ${isConditionActive ? 'ring-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.6)]' : 'ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]'}`}></div>
            )}

            {/* [新增] 环境互动层：龟裂贴花 (渲染在原画最下层，且允许溢出) */}
            {showDecal && (
                <motion.img
                    src={EFFECT_IMAGES.groundCrack}
                    // [核心破局点] 必须加上 max-w-none！打破 Tailwind 默认的 img { max-width: 100% } 绝对屏障！
                    className="absolute top-1/2 left-1/2 z-0 pointer-events-none max-w-none brightness-150 saturate-200 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                    style={{
                        width: '350px', // 有了 max-w-none，现在的 350px 才是真正的 350px！
                        height: '350px',
                        objectFit: 'contain'
                    }}
                    // 使用 Framer Motion 原生的 x 和 y 偏移来实现居中，它不会与 scale 产生覆盖冲突
                    initial={{ x: "-50%", y: "-50%", scale: 0.8, opacity: 1 }}
                    animate={{ x: "-50%", y: "-50%", scale: 1.2, opacity: 0 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                />
            )}

            {/* [核心修改：金蝉脱壳升级] 延迟卸载DOM，先演完衰亡与裂纹覆盖，最后 isShattering 为 true 时再彻底炸裂！ */}
            {isShattering ? (
                <ShatterEffect isPlayerSide={isPlayerSide} />
            ) : (
                // [修复] 内层 div — 提供 data-shake-target 锚点，供 SpellImpactLayer 隔山打牛做物理震荡
                <div ref={cardInnerRef} data-shake-target={data.id} className="w-full h-full">
                    {visualFaceUp ? renderFrontFace() : renderBackFace()}

                    {/* [全新重构] 纯色金色高光遮罩 (Golden Overlay) - 0%到80%再到0%的快速闪爆 */}
                    {localFlash && (
                        <motion.div
                            className={`absolute inset-0 z-[60] bg-yellow-400 mix-blend-overlay pointer-events-none ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0] }}
                            transition={{ duration: 1, ease: "easeInOut" }}
                        />
                    )}

                    {/* [新增] 阵亡第二幕：蛛网裂纹贴图淡入覆盖 */}
                    {(data.animState === 'dying' || isEphemeralExploded) && (
                        <motion.div
                            className="absolute inset-0 z-[160] pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        >
                            <img
                                // 根据所处位置智能读取对应的碎裂贴图
                                src={isBench ? EFFECT_IMAGES.cardBroken1 : EFFECT_IMAGES.cardBroken2}
                                className="w-full h-full object-cover opacity-90 mix-blend-overlay"
                                alt="碎裂"
                                draggable={false}
                            />
                        </motion.div>
                    )}

                    {/* [新增] 挂载购物车图标 */}
                    {renderShopIcon()}

                    {/* [核心重构] 面板微缩状态专属：天启者左上角动态升级进度气泡 */}
                    {/* 动作 1：放开 data.level === 1 的限制，允许 2 级英雄展示 */}
                    {location === 'deck-panel' && data.isChampion && data.levelUpCondition && (
                        <div className="absolute -top-3 -left-3 w-8 h-8 z-[200] group/levelup cursor-help transition-transform hover:scale-110">
                            {(() => {
                                // 动作 2：提取进度数据
                                let currentProgress = 0;
                                const target = data.levelUpTarget || 1;
                                if (data.key === 'fenny') {
                                    const pHealth = playerNexusHealth ?? 20;
                                    const eHealth = enemyNexusHealth ?? 20;
                                    if (pHealth <= 10 || eHealth <= 10) currentProgress = 1;
                                } else if (data.key === 'lyfe') {
                                    currentProgress = data.strikeCount || 0;
                                } else if (data.key === 'pupu_specular_soul') {
                                    currentProgress = data.customProgress || 0;
                                } else if (data.key === 'mauxir_lotus_drive') {
                                    currentProgress = data.customProgress || 0;
                                }

                                const cappedProgress = Math.min(currentProgress, target);

                                // 动作 3：四段式瀑布流判断法则
                                const getIconType = () => {
                                    if (data.level === 2) return LEVELUP_ICONS.full;
                                    if (cappedProgress === 0) return LEVELUP_ICONS.empty;
                                    if (cappedProgress === target - 1) return LEVELUP_ICONS.almost;
                                    return LEVELUP_ICONS.half;
                                };

                                // 动作 4：DOM 替换，植入质感贴图
                                return (
                                    <>
                                        <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center shadow-lg overflow-hidden border border-yellow-500/30">
                                            <img src={getIconType()} className="w-full h-full object-cover" alt="升级进度" />
                                        </div>

                                        {/* 悬浮弹出的进阶信息黑框 (保留原貌) */}
                                        <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-48 bg-slate-900/95 border border-yellow-600/50 rounded p-3 opacity-0 group-hover/levelup:opacity-100 pointer-events-none transition-all duration-200 shadow-2xl z-[300] scale-95 group-hover/levelup:scale-100">
                                            <div className="text-white text-[10px] text-center mb-1 font-bold whitespace-nowrap">{data.levelUpCondition}</div>
                                            <div className="text-blue-300 font-bold text-center text-xs tracking-widest">
                                                {data.level === 2 ? '(MAX)' : `(${cappedProgress}/${target})`}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* [新增] 锁定黑幕遮罩与提示文字 */}
                    {isLocked && (
                        <div className="absolute inset-0 z-[150] bg-black/60 rounded-2xl flex items-center justify-center">
                            <div className="bg-black/60 border-y-2 border-white/40 w-full py-3 flex justify-center backdrop-blur-sm">
                                <span className="text-white font-black text-xl tracking-[0.2em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                                    {lockedMessage} {/* [修正] 动态渲染传入的锁定原因 */}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
};