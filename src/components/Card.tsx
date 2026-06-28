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
  onPointerDown?: (e: React.PointerEvent) => void; // [新增] 供战场→备战席拖拽使用
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
    let baseMode: 'hand' | 'bench' | 'combat' = 'hand';
    if (location === 'bench' || location === 'enemy_bench') baseMode = 'bench';
    else if (location === 'combat') baseMode = 'combat';

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
    onPointerDown,           // [新增] 战场拖拽
    // [切除] 删掉这行重复的 skinId = 0，因为参数最上面已经解构过一遍了
}) => {
    // 顶级防御
    if (!data) {
        console.warn(`[Card Component] Prevented crash: 'data' is undefined at location: ${location}`);
        return null;
    }

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
    // [修复] currentFinalPower 不加 roundBuffs.power：因为 ROUND 类 Buff 同时记入了 buffs 和 roundBuffs，
    // 显示时再加 roundBuffs 会导致双倍显示（health 正确是因为它根本没读 roundBuffs.health）
    const currentFinalHealth = (data.health || 0) + (data.buffs?.health || 0) - (data.damageTaken || 0);
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
                    <SpellCard data={data} />
                    {!isPreview && isSelected && (
                        <div className="absolute inset-0 border-4 border-blue-400 rounded-2xl z-50 pointer-events-none animate-pulse shadow-[0_0_20px_#3b82f6]"></div>
                    )}
                    {isOnBoard && isSpeaking && <SpeechBubble />}
                </div>
            );
        }
        return (
        <>
        {/* [修改] 统一外层圆角 */}
        {/* [修复] 强制置于 z-10，确保实体背景盖住 z-0 的贴花，让贴花只从边缘溢出！ */}
        {/* [核心机制] 将外层容器改为 motion.div，严格控制仅隐秘单位在场上时执行 [1, 0.3, 1] 的实体呼吸 */}
        <motion.div
            className={`w-full h-full absolute inset-0 overflow-hidden ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'} z-10 ${
                data.region === 'Lyfe' ? 'bg-gradient-to-b from-gray-950 via-blue-950 to-gray-950'
                : data.region === 'Fenny' ? 'bg-gradient-to-b from-gray-950 via-orange-950 to-gray-950'
                : data.region === 'Pupu' ? 'bg-gradient-to-b from-gray-950 via-red-950 to-gray-950'
                : data.region === 'Mauxir' ? 'bg-gradient-to-b from-gray-950 via-purple-950 to-gray-950'
                : data.region === 'Logistics' ? 'bg-gradient-to-b from-gray-950 via-gray-800 to-gray-950'
                : 'bg-slate-900'
            }`}
            animate={isElusiveOnBoard ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
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
                                <div className="flex-1 bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center border-r-[2px] border-slate-400/80">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayPower}
                                    </span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayHealth}
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
                                        titanCount={titanCount}
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
                                        titanCount={titanCount}
                                        isOnBoard={true}
                                    />
                                </div>
                            )}

                            <div className="flex-1 z-10 relative pointer-events-none"></div>

                            {/* [敌方] 底部：数值区 */}
                            {/* 敌方数值区在底部，所以是上方增加灰色描边 border-t-[2px] */}
                            <div className="relative z-30 flex w-full h-8 opacity-95 border-t-[2px] border-slate-400/80 shadow-[0_-2px_5px_rgba(0,0,0,0.6)] mt-auto">
                                <div className="flex-1 bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center border-r-[2px] border-slate-400/80">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayPower}
                                    </span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayHealth}
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
                        : data.region === 'Logistics' ? 'bg-gradient-to-b from-gray-950 via-gray-800 to-gray-950'
                        : 'bg-slate-900'
                    }`}
                >
                    {/* [新增] 边框层 (竖向模式) - z-10 (位于原画之上) */}
                            {/* 注意：如果边框是透明通带，它会透出下面的原画。pointer-events-none 确保不阻挡交互 */}
                            <div className="absolute inset-0 z-10 pointer-events-none">
                                <img
                                    src={borderImg}
                                    alt="边框"
                                    draggable={false}
                                    className="w-full h-full object-fill opacity-100"
                                />
                            </div>

                    {/* 竖向模式原画层 (接入坐标裁剪) */}
                    <div className="absolute inset-0 bg-black overflow-hidden flex items-center justify-center">
                        {/* [核心优化] 动态兜底背景：拥有皮肤时闪耀金色光辉，默认时按阵营配色 */}
                        <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none ${
                            skinId > 0
                                ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5'
                                : data.region === 'Lyfe' ? 'from-blue-600/40 via-blue-500/20 to-blue-300/5'
                                : data.region === 'Fenny' ? 'from-orange-600/40 via-orange-500/20 to-orange-300/5'
                                : data.region === 'Pupu' ? 'from-red-600/40 via-red-500/20 to-red-300/5'
                                : data.region === 'Mauxir' ? 'from-purple-600/40 via-purple-500/20 to-purple-300/5'
                                : 'from-gray-300/40 via-gray-200/20 to-white/5'
                        }`}></div>
                         <img
                            src={currentImageUrl}
                            alt={data.name}
                            draggable={false}
                            // [修复] 移除多余的 transition-transform，实现状态改变时图像坐标的“瞬切”
                            className="max-w-none block"
                            style={{
                                width: data.type && data.type.includes('spell') ? 'auto' : '100%',
                                height: data.type && data.type.includes('spell') ? '100%' : 'auto',
                                transform: `translate(${crop.offsetX}%, ${crop.offsetY}%) scale(${crop.scale})`
                            }}
                        />
                    </div>

                    {location !== 'deck-panel' && (
                        // [UI重构 4] 重心压低遮罩层高度，使用更密集的渐变阈值，让上半部画幅彻底干净！
                        <div className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/100 via-black/80 to-transparent px-4 pb-0`} style={{ backgroundSize: '100% 60%', backgroundRepeat: 'no-repeat', backgroundPosition: 'bottom' }}>

                             <div className={`absolute top-4 left-4 rounded-full bg-blue-600 border-2 border-yellow-400 flex items-center justify-center text-white font-black shadow-lg z-10 ${isBench ? 'w-16 h-16 text-4xl' : 'w-12 h-12 text-2xl'}`}>
                                {data.cost}
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
                                                titanCount={titanCount}
                                                className="scale-110" // 微缩以适配紧凑布局
                                                isOnBoard={false}
                                            />
                                        </div>
                                    )}
                                    <div className={`text-center text-gray-200 text-[16px] leading-snug font-medium drop-shadow-md px-1 flex items-center justify-center min-h-[3rem]`}>
                                        {data.description}
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
                                        titanCount={titanCount}
                                        className="scale-[1.8]"
                                        isOnBoard={true}
                                    />
                                 </div>
                             )}

                             {/* [UI重构 2] 英雄升级条件下沉，与攻防数值处于同一视平线 */}
                             {data.type && data.type.includes('unit') ? ( // 新增安全检查
                                <div className="relative flex justify-between items-end px-2 pb-2 h-20 border-t border-white/20 mt-1">
                                    <div className={`font-black drop-shadow-md ${powerColor} ${isBench ? 'text-7xl' : 'text-4xl'} z-10`}>
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayPower}
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
                                        {ephemeralEmpty ? <span className="transition-none">0</span> : displayHealth}
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
                titanCount={titanCount}
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