import React, { useState, useRef, useEffect } from 'react';
import { Eye, Hexagon, Triangle, Sparkles, ChevronDown, ShoppingCart } from 'lucide-react';
// [新增] 引入 Framer Motion
import { motion } from 'framer-motion';
import type { CardData, Keyword } from '../types';
import { CARD_DB } from '../data/cards';
import { KEYWORD_DB } from '../data/keywords';
import { SpeechBubble } from './SpeechBubble';
import { SpellCard } from './SpellCard';
import { KeywordEffects } from './KeywordEffects';
import { CARD_BORDERS } from '../data/imageData';
// [新增] 引入卡面坐标字典与类型
import { CARD_CROP_CONFIG } from '../data/cardCropConfig';
import type { CropConfig } from '../types';
// [新增] 引入全新的智能卡槽模块
import { KeywordTray } from './KeywordTray';

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

interface CardProps {
  data: CardData;
  location: 'hand' | 'bench' | 'combat' | 'enemy_bench' | 'spell_stack' | 'preview' | 'deck-builder' | 'gacha';
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
}
// [修复] 智能裁剪钩子：重构为“同步计算”以消除初次渲染的坐标闪烁与补间滑动
const useCardCrop = (cardKey: string, location: string, level: number = 1): CropConfig => {
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

    const mode = level === 2 ? `${baseMode}_lv2` as keyof CardCropData : baseMode;

    // 2. 同步读取优先级 1：热更新数据
    try {
        const localData = localStorage.getItem('dev_crop_overrides');
        if (localData) {
            const parsed = JSON.parse(localData);
            if (parsed[cardKey] && parsed[cardKey][mode]) {
                return parsed[cardKey][mode];
            }
        }
    } catch (e) { /* ignore */ }

    // 3. 同步读取优先级 2：静态字典
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
    data, location, onClick, isBlocker, isSelected, highlightTarget, onViewArt, isEnemyCombatant, attackType = 'clash',
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
    isDragging = false // [新增] 默认不处于拖拽状态
}) => {
    // 顶级防御
    if (!data) {
        console.warn(`[Card Component] Prevented crash: 'data' is undefined at location: ${location}`);
        return null;
    }

    // [修改] 获取当前卡牌形态的裁剪坐标，传入 data.level 从而智能区分原画
    const crop = useCardCrop(data.key, location, data.level);

    // [升级版] 全能数值反馈系统 (Health & Power)
    // 分别记录两个属性的变化量
    const [healthDelta, setHealthDelta] = useState<number | null>(null);
    const [powerDelta, setPowerDelta] = useState<number | null>(null);

    // 控制震动 (受伤/削弱时触发)
    const [localShake, setLocalShake] = useState(false);
    // 控制高亮闪烁 (获得Buff/回血时触发)
    const [localFlash, setLocalFlash] = useState(false);

    // 计算当前的最终面板数值
    const currentFinalHealth = (data.health || 0) + (data.buffs?.health || 0) - (data.damageTaken || 0);
    const currentFinalPower = (data.power || 0) + (data.buffs?.power || 0);

    // 使用 Ref 记录上一帧的数值
    const prevHealthRef = useRef(currentFinalHealth);
    const prevPowerRef = useRef(currentFinalPower);

    useEffect(() => {
        const prevHealth = prevHealthRef.current;
        const prevPower = prevPowerRef.current;

        // --- 1. 检测生命值变化 ---
        if (currentFinalHealth !== prevHealth) {
            const diff = currentFinalHealth - prevHealth;
            setHealthDelta(diff); // 记录差值 (例如 -3 或 +2)

            if (diff < 0) {
                setLocalShake(true); // 扣血 -> 震动
            } else {
                setLocalFlash(true); // 回血 -> 闪光
            }

            // 动画结束后清理
            setTimeout(() => {
                setHealthDelta(null);
                setLocalShake(false);
                setLocalFlash(false);
            }, 1200);

            prevHealthRef.current = currentFinalHealth;
        }

        // --- 2. 检测攻击力变化 ---
        if (currentFinalPower !== prevPower) {
            const diff = currentFinalPower - prevPower;
            setPowerDelta(diff);

            if (diff < 0) {
                setLocalShake(true); // 减攻 -> 震动
            } else {
                setLocalFlash(true); // 加攻 -> 闪光
            }

            setTimeout(() => {
                setPowerDelta(null);
                setLocalShake(false);
                setLocalFlash(false);
            }, 1200);

            prevPowerRef.current = currentFinalPower;
        }

    }, [currentFinalHealth, currentFinalPower]);


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

    const safeHealth = (data.health || 0) + (data.buffs?.health || 0);
    const safePower = (data.power || 0) + (data.buffs?.power || 0);

    const [displayHealth, isHealthTicking] = useNumberTicker(
        safeHealth,
        isRegenerating ? 500 : 400 // [修改] 加快滚动速度，更有打击感
    );
    const [displayPower] = useNumberTicker(safePower, 1000);

    const handleMouseEnter = () => {
        if (location === 'spell_stack' || location === 'preview') return;
        timerRef.current = setTimeout(() => setShowEye(true), 500);
    };

    const handleMouseLeave = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShowEye(false);
    };

    const handleEyeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onViewArt) onViewArt(data);
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

    const currentPower = data.power || 0;
    const currentHealth = data.health || 0;
    const currentMaxHealth = data.maxHealth || 0;

    const powerColor = currentPower > basePower ? 'text-green-400' : (currentPower < basePower ? 'text-red-500' : 'text-white');
    const isDamaged = currentHealth < currentMaxHealth;
    const isBuffedHealth = currentHealth > baseHealth;
    let healthColor = isDamaged ? 'text-red-500' : (isBuffedHealth ? 'text-green-400' : 'text-white');
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

    if (location === 'spell_stack') {
        return (
            <div className={`relative w-20 h-20 rounded-full border-2 ${data.id && data.id.includes('enemy') ? 'border-red-500' : 'border-blue-500'} bg-gray-900 overflow-hidden shadow-lg hover:scale-110 transition-transform cursor-help group z-30`}>
                <img src={data.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Sparkles size={24} className="text-white drop-shadow-md" />
                </div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    {data.name || 'Spell'} {/* 兜底：name 为空时显示默认值 */}
                </div>
            </div>
        );
    }

    let animClass = '';
    if (data.animState === 'attacking') {
        const hasQuickAttack = !isBlocker && data.keywords && data.keywords.includes('QuickAttack');

        if (isEnemyCombatant) {
            if (hasQuickAttack) {
                animClass = attackType === 'direct'
                    ? 'animate-quick-dash-down-long z-50'
                    : 'animate-quick-dash-down z-50';
            } else if (isFacingQuickAttack) {
                animClass = 'animate-delayed-bump-down z-50';
            } else {
                animClass = attackType === 'direct' ? 'animate-bump-down-long z-50' : 'animate-bump-down z-50';
            }
        } else {
            if (hasQuickAttack) {
                animClass = attackType === 'direct'
                    ? 'animate-quick-dash-up-long z-50'
                    : 'animate-quick-dash-up z-50';
            } else if (isFacingQuickAttack) {
                animClass = 'animate-delayed-bump-up z-50';
            } else {
                animClass = attackType === 'direct' ? 'animate-bump-up-long z-50' : 'animate-bump-up z-50';
            }
        }
    }
    // [修改] 整合震动(Shake)与闪光(Pulse)效果
    if (data.animState === 'hit' || localShake) {
        animClass = 'animate-shake';
    } else if (localFlash) {
        animClass = 'animate-pulse ring-4 ring-yellow-400 brightness-110'; // 强化时亮一下
    }

    // [删除] 废弃原有的 animate-shatter 类名。死亡视觉现在由下方的金蝉脱壳逻辑接管！

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
                    className="absolute top-0 left-0 bg-transparent overflow-hidden rounded-2xl"
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
        <div className={`w-full h-full absolute inset-0 bg-slate-900 overflow-hidden ${isTacticalMode ? 'rounded-md' : 'rounded-2xl'}`}>
            {isTacticalMode ? (
                // --- A & C 合并：战术棋子与战场弹性模式 (Tactical Token & Elastic Combat) ---
                <div className="relative w-full h-full bg-black flex flex-col overflow-hidden rounded-md">
                    {/* 原画层 - 底层 (接入坐标裁剪) */}
                    <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
                        <img
                            src={data.level === 2 && data.level2ImageUrl ? data.level2ImageUrl : data.imageUrl}
                            alt={data.name}
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
                        <img src={borderImg} alt="Border" className="w-full h-full object-fill opacity-100 scale-[1.02]" />
                    </div>

                    {/* --- 根据阵营决定镜像布局 --- */}
                    {isPlayerSide ? (
                        <>
                            {/* [我方] 顶部：数值区 */}
                            {/* [修复 2] 增加底部灰色金属描边，加高尺寸到 h-8，并增加中间分割线 */}
                            <div className="relative z-30 flex w-full h-8 opacity-95 border-b-[2px] border-slate-400/80 shadow-[0_2px_5px_rgba(0,0,0,0.6)]">
                                <div className="flex-1 bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center border-r-[2px] border-slate-400/80">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>{displayPower}</span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>{displayHealth}</span>
                                </div>
                            </div>

                            <div className="flex-1 z-10 relative pointer-events-none"></div>

                            {/* [我方] 底部：动态折行黑水晶卡槽 */}
                            {data.keywords && data.keywords.length > 0 && (
                                <div className="relative z-30 w-full flex justify-center mt-auto pb-[2px]">
                                    {/* [替换] 引入智能卡槽，下放进攻/防守状态，由图标自身负责发光与动画 */}
                                    <KeywordTray
                                        keywords={data.keywords}
                                        isAttacking={isCombat && !isBlocker}
                                        isDefending={isCombat && isBlocker}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {/* [敌方] 顶部：动态折行黑水晶卡槽 */}
                            {data.keywords && data.keywords.length > 0 && (
                                <div className="relative z-30 w-full flex justify-center mb-auto pt-[2px]">
                                    {/* [替换] 引入智能卡槽 */}
                                    <KeywordTray
                                        keywords={data.keywords}
                                        isAttacking={isCombat && !isBlocker}
                                        isDefending={isCombat && isBlocker}
                                    />
                                </div>
                            )}

                            <div className="flex-1 z-10 relative pointer-events-none"></div>

                            {/* [敌方] 底部：数值区 */}
                            {/* 敌方数值区在底部，所以是上方增加灰色描边 border-t-[2px] */}
                            <div className="relative z-30 flex w-full h-8 opacity-95 border-t-[2px] border-slate-400/80 shadow-[0_-2px_5px_rgba(0,0,0,0.6)] mt-auto">
                                <div className="flex-1 bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center border-r-[2px] border-slate-400/80">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${powerColor}`}>{displayPower}</span>
                                </div>
                                <div className="flex-1 bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                                    <span className={`font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] ${healthColor} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>{displayHealth}</span>
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
                    className="absolute top-0 left-0 bg-slate-900 overflow-hidden rounded-2xl"
                >
                    {/* [新增] 边框层 (竖向模式) - z-10 (位于原画之上) */}
                            {/* 注意：如果边框是透明通带，它会透出下面的原画。pointer-events-none 确保不阻挡交互 */}
                            <div className="absolute inset-0 z-10 pointer-events-none">
                                <img
                                    src={borderImg}
                                    alt="Border"
                                    className="w-full h-full object-fill opacity-100"
                                />
                            </div>

                    {/* 竖向模式原画层 (接入坐标裁剪) */}
                    <div className="absolute inset-0 bg-black overflow-hidden flex items-center justify-center">
                         <img
                            src={data.level === 2 && data.level2ImageUrl ? data.level2ImageUrl : data.imageUrl}
                            alt={data.name}
                            // [修复] 移除多余的 transition-transform，实现状态改变时图像坐标的“瞬切”
                            className="max-w-none block"
                            style={{
                                width: data.type && data.type.includes('spell') ? 'auto' : '100%',
                                height: data.type && data.type.includes('spell') ? '100%' : 'auto',
                                transform: `translate(${crop.offsetX}%, ${crop.offsetY}%) scale(${crop.scale})`
                            }}
                        />
                    </div>

                    <div className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/40 to-transparent px-4 ${isBench ? 'pb-2' : 'pb-4'}`}>

                         <div className={`absolute top-4 left-4 rounded-full bg-blue-600 border-2 border-yellow-400 flex items-center justify-center text-white font-black shadow-lg z-10 ${isBench ? 'w-16 h-16 text-4xl' : 'w-12 h-12 text-2xl'}`}>
                            {data.cost}
                         </div>

                         {!isBench && (
                             <>
                                {/*名字渲染区 */}
                            <div className="flex flex-col items-center justify-center mb-2">
                                {data.name && data.name.includes('\n') ? ( // 新增 data.name 检查
                                    <>
                                        <span className="text-white/80 font-bold text-[25px] tracking-widest uppercase drop-shadow-md leading-none mb-1">
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
                                {data.keywords && data.keywords.length > 0 && (
                                    <div className="flex justify-center mb-2">
                                        {/* [替换] 竖向手牌模式也统一使用智能卡槽，自带六边形黑底，视觉更加统一和规整 */}
                                        <KeywordTray keywords={data.keywords} className="scale-125" />
                                    </div>
                                )}
                                <div className="text-center text-gray-200 text-lg leading-snug mb-5 font-medium drop-shadow-md px-2 min-h-[3rem] flex items-center justify-center">
                                    {data.description}
                                </div>
                             </>
                         )}

                         {isBench && data.keywords && data.keywords.length > 0 && (
                             <div className="flex justify-center mb-6">
                                {/* [替换] 竖向备战席模式使用智能卡槽 */}
                                <KeywordTray keywords={data.keywords} className="scale-[1.8]" />
                             </div>
                         )}


                         {data.type && data.type.includes('unit') ? ( // 新增安全检查
                            <div className="flex justify-between items-center px-2 pt-2 border-t border-white/20">
                                <div className={`font-black text-yellow-500 drop-shadow-md ${powerColor} ${isBench ? 'text-7xl' : 'text-4xl'}`}>
                                    {displayPower}
                                </div>
                                <div className="text-orange-500 drop-shadow-lg filter">
                                    {data.isChampion ?
                                        <Hexagon size={isBench ? 60 : 40} fill="rgba(249, 115, 22, 0.2)" strokeWidth={2.5} /> :
                                        <Triangle size={isBench ? 60 : 40} fill="rgba(249, 115, 22, 0.2)" strokeWidth={2.5} />
                                    }
                                </div>
                                <div className={`font-black drop-shadow-md transition-all duration-300 ease-out origin-center ${healthColor} ${isBench ? 'text-7xl' : 'text-4xl'} ${(isRegenerating && isHealthTicking) ? 'scale-125 brightness-125' : 'scale-100'}`}>
                                    {displayHealth}
                                </div>
                            </div>
                         ) : (
                            <div className="flex justify-center pb-2 text-white/50 text-sm font-mono uppercase tracking-widest">SPELL</div>
                         )}
                    </div>
                </div>
            )}
        </div>
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
            />

            {/* [升级版/修正] 攻击力飘字 (Power Floater) - 动态锚定数值区 */}
            {!isPreview && powerDelta !== null && (
                <div className={`absolute left-2 ${isPlayerSide ? 'top-10' : 'bottom-10'} ${isTacticalMode ? 'text-3xl' : 'text-5xl'} font-black animate-float-damage z-[100] whitespace-nowrap drop-shadow-md stroke-black
                    ${powerDelta > 0 ? 'text-yellow-400' : 'text-blue-400'}`}
                >
                    {powerDelta > 0 ? `+${powerDelta}` : powerDelta}
                </div>
            )}

            {/* [升级版/修正] 生命值飘字 (Health Floater) - 动态锚定数值区 */}
            {!isPreview && healthDelta !== null && (
                <div className={`absolute right-2 ${isPlayerSide ? 'top-10' : 'bottom-10'} ${isTacticalMode ? 'text-3xl' : 'text-5xl'} font-black animate-float-damage z-[100] whitespace-nowrap drop-shadow-md stroke-black
                    ${healthDelta > 0 ? 'text-green-400' : 'text-red-500'}`}
                >
                    {healthDelta > 0 ? `+${healthDelta}` : healthDelta}
                </div>
            )}

            {/* Enemy Selection Arrow (敌方被选中箭头) */}
            {!isPreview && (location === 'combat' && isEnemyCombatant && isSelected) && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce z-50">
                    <ChevronDown size={32} className="text-orange-500 fill-orange-500" />
                </div>
            )}

            {/* View Art Eye (查看大图按钮) */}
            {!isPreview && showEye && !isCombat && (
                <div className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-white/20 z-20 transition-opacity duration-200" onClick={handleEyeClick}>
                    <Eye size={16} className="text-white" />
                </div>
            )}

            {/* Speech Bubble (台词气泡) */}
            {isOnBoard && isSpeaking && <SpeechBubble />}
            </>
    );
    };

    // --- 内部渲染函数：背面 (保持不变) ---
    const renderBackFace = () => (
        <div className="w-full h-full absolute inset-0 rounded-xl overflow-hidden border-2 border-[#1a1a1a] bg-slate-800">
            <img
                src={cardBackUrl || "https://placehold.co/300x450/1e293b/ffffff?text=BACK"}
                className="w-full h-full object-cover relative z-10"
                alt="Card Back"
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

    // --- [核心修改] Framer Motion 根容器 ---
    return (
        <motion.div
            // [新增] 添加实体 ID 标记，用于 VFXLayer 获取坐标
            data-entity-id={data.id}

            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={`
                relative cursor-pointer select-none
                ${containerClass}
                ${className}
                ${!isPreview && isBlocker ? 'scale-90 opacity-80' : ''}
                {/* [修改] 增加 !isDragging 判断。如果正在拖拽，就绝对不触发 hover 放大，防止疯狂抖动 */}
                ${!isPreview && isSelected ? 'ring-4 ring-blue-600 shadow-[0_0_30px_blue] z-50' : (!isPreview && !isFaceUp ? '' : (!isDragging && location !== 'combat' ? 'hover:scale-105' : ''))}
                ${showAvailabilityGlow && !isSelected ? 'ring-4 ring-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse-slow' : ''}
                /* [新增] 动态应用施法目标样式 */
                ${targetableClass}
                ${targetedClass}
                ${animClass}
                border-0
            `}
            // [翻面动画逻辑]
            animate={shouldAnimateDraw ? { scaleX: [1, 1, 0, 1, 1] } : {}}
            transition={shouldAnimateDraw ? {
                times: [0, 0.4, 0.5, 0.6, 1],
                duration: 1.8,
                ease: "easeInOut"
            } : {}}
        >
            {/* [核心修改：金蝉脱壳] 如果处于 dying 状态，不再渲染原本的 DOM，而是直接展示粒子爆破！ */}
            {data.animState === 'dying' ? (
                <ShatterEffect isPlayerSide={isPlayerSide} />
            ) : (
                <>
                    {visualFaceUp ? renderFrontFace() : renderBackFace()}
                    {/* [新增] 挂载购物车图标 */}
                    {renderShopIcon()}
                </>
            )}
        </motion.div>
    );
};