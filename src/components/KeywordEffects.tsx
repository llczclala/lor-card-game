// [核心修复] 引入 useState 和 useEffect 构建状态机
import React, { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
// [新增] 引入 motion 和 AnimatePresence 用于无缝淡出
import { motion, AnimatePresence } from 'framer-motion';
import type { CardData } from '../types';
import { KEYWORD_DB } from '../data/keywords';
import { eventBus, GameEvents } from '../utils/eventBus'; // [新增] 用于特效完成信号

interface KeywordEffectsProps {
    data: CardData;
    location: string;
    isBlocker?: boolean;
    isEnemyCombatant?: boolean;
    onChallengerClick?: () => void;
    isChallengerActive?: boolean;
    canBeChallenged?: boolean;
    isChallengedTarget?: boolean;
    highlightTarget?: boolean;
    isBlocking?: boolean;
    titanCount?: number;  // [泰坦] 场上泰坦总数，用于预显示数字
}

export const KeywordEffects: React.FC<KeywordEffectsProps> = ({
    data,
    location,
    isBlocker,
    isEnemyCombatant,
    onChallengerClick,
    isChallengerActive,
    canBeChallenged,
    isChallengedTarget,
    highlightTarget,
    isBlocking = false,
    titanCount
}) => {
    // 辅助计算
    const isOnBoard = location === 'bench' || location === 'combat' || location === 'enemy_bench';
    const isCombat = location === 'combat';
    const isBench = location === 'bench' || location === 'enemy_bench';

    // [瞬逝保险丝] 手牌 Volatile 卡挂载计数（供全局火焰档位统计，敌我共用）
    const isHandVolatile = location === 'hand' && data.keywords.includes('Volatile');
    useEffect(() => {
        if (!isHandVolatile) return;
        notifyVolatileHand(1);
        return () => notifyVolatileHand(-1);
    }, [isHandVolatile]);

    // [侦察] 订阅攻击宣言期侦察状态（active=全侦察有效 / invalid=混入无效 / null=非首次即已触发过）
    const scoutState = useSyncExternalStore(subscribeScoutState, getScoutState);
    // [侦察] 仅战斗区显示：侦察单位进入战斗区进攻时，active=有效（翠绿旋转），invalid/null=无效（灰白停转）
    const isScoutAttacker = isCombat && !isBlocker && data.keywords.includes('Scout');
    const isScoutActive = isScoutAttacker && scoutState === 'active';
    const isScoutInvalid = isScoutAttacker && scoutState !== 'active';
    // [侦察] 入场爆发锁：进入战斗区进攻时播放一次图标爆发
    const scoutBurstCount = useRef(0);
    const prevScoutAttacking = useRef(false);
    useEffect(() => {
        if (isScoutAttacker && !prevScoutAttacking.current) {
            scoutBurstCount.current += 1;
        }
        prevScoutAttacking.current = isScoutAttacker;
    }, [isScoutAttacker]);

    // SVG 圆角计算：保持与 CSS rounded-* 类一致
    const borderRadius = isCombat ? 16 : (isBench ? 12 : 8);

    // ==========================================
    // [新增] 终极视觉引擎：同步引爆 + 聚光灯轮播
    // ==========================================
    const [vfxState, setVfxState] = useState<'idle' | 'intro' | 'loop'>('idle');
    const [carouselIndex, setCarouselIndex] = useState(0);
    // [泰坦] 卸载保护锁：捕获 animState:'buff' 后本地持有，确保 2s 动画播完才卸载
    const [titanBuffActive, setTitanBuffActive] = useState(false);

    // [泰坦] 一旦 animState 变成 'buff'，锁住渲染至少 2.3s（略长于完整时序）
    useEffect(() => {
        if (data.animState === 'buff' && isOnBoard && data.keywords.includes('Titan')) {
            setTitanBuffActive(true);
            const timer = setTimeout(() => {
                setTitanBuffActive(false);
                eventBus.emit(GameEvents.ROUND_END_EFFECT_COMPLETE); // [新增] 通知游戏循环可以继续了
            }, 2300);
            return () => clearTimeout(timer);
        }
    }, [data.animState]);

    // [坚韧] 受击触发锁：捕获 animState:'hit' 后播放 1.2s 特效（黄绿高光 + 流光 + 图标爆发）
    const [toughHitActive, setToughHitActive] = useState(false);

    useEffect(() => {
        if (data.animState === 'hit' && isOnBoard && data.keywords.includes('Tough')) {
            setToughHitActive(true);
            const timer = setTimeout(() => setToughHitActive(false), 1200);
            return () => clearTimeout(timer);
        }
    }, [data.animState]);

    // [反伤] 受击触发锁：捕获 animState:'hit' 后播放 0.6s 的高频突刺特效
    const [thornsHitActive, setThornsHitActive] = useState(false);

    useEffect(() => {
        if (data.animState === 'hit' && isOnBoard && data.keywords.includes('Thorns')) {
            setThornsHitActive(true);
            const timer = setTimeout(() => setThornsHitActive(false), 600);
            return () => clearTimeout(timer);
        }
    }, [data.animState]);

    // [Channel 充能] 捕获 animState:'channel_pulse' 后播放 1s 充能特效
    const [channelPulseActive, setChannelPulseActive] = useState(false);

    useEffect(() => {
        if (data.animState === 'channel_pulse' && isOnBoard && data.keywords.includes('Channel')) {
            setChannelPulseActive(true);
            const timer = setTimeout(() => setChannelPulseActive(false), 1000);
            return () => clearTimeout(timer);
        }
    }, [data.animState]);

    // [Frostbite] 入场爆发状态机：检测关键词首次出现或上战场时触发
    const [frostEntryActive, setFrostEntryActive] = useState(false);
    const prevHadFrostbite = useRef(false);

    useEffect(() => {
        const hasFrostbite = isOnBoard && data.keywords.includes('Frostbite');
        if (hasFrostbite && !prevHadFrostbite.current) {
            setFrostEntryActive(true);
        }
        if (!hasFrostbite && prevHadFrostbite.current) {
            setFrostEntryActive(false);
        }
        prevHadFrostbite.current = hasFrostbite;
    }, [isOnBoard, data.keywords]);

    // 入场动画定时器：播放完毕后自动关闭
    useEffect(() => {
        if (!frostEntryActive) return;
        const timer = setTimeout(() => setFrostEntryActive(false), 1200);
        return () => clearTimeout(timer);
    }, [frostEntryActive]);

    // [Frostbite 解冻] 捕获 animState:'thawing' 后播放 1.3s 解冻特效
    const [frostThawActive, setFrostThawActive] = useState(false);

    useEffect(() => {
        if (data.animState === 'thawing' && isOnBoard && data.keywords.includes('Frostbite')) {
            setFrostThawActive(true);
            const timer = setTimeout(() => {
                setFrostThawActive(false);
                eventBus.emit(GameEvents.ROUND_END_EFFECT_COMPLETE);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, [data.animState]);

    // ========== 凶恶 (Fearsome) — 一次性入场 + 阻挡拒绝触发 ==========
    const [fearsomeActive, setFearsomeActive] = useState(false);
    const fearsomeTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const wasFearsomeCombatRef = useRef(false);

    const triggerFearsome = useCallback(() => {
        if (fearsomeTimerRef.current) clearTimeout(fearsomeTimerRef.current);
        setFearsomeActive(true);
        fearsomeTimerRef.current = setTimeout(() => setFearsomeActive(false), 1200);
    }, []);

    // 触发 1：从备战席进入战场时（isCombat 从 false → true）
    useEffect(() => {
        const nowInCombat = isCombat && !isBlocker;
        if (data.keywords.includes('Fearsome') && nowInCombat && !wasFearsomeCombatRef.current) {
            triggerFearsome();
        }
        wasFearsomeCombatRef.current = nowInCombat;
    }, [isCombat, isBlocker, data.keywords, triggerFearsome]);

    // 触发 2：阻挡被凶恶拒绝时（FEARSOME_REJECT 事件）
    useEffect(() => {
        const handler = (payload: { unitId: string }) => {
            if (payload.unitId === data.id) triggerFearsome();
        };
        eventBus.on('FEARSOME_REJECT', handler);
        return () => eventBus.off('FEARSOME_REJECT', handler);
    }, [data.id, triggerFearsome]);

    // 清理定时器
    useEffect(() => {
        return () => { if (fearsomeTimerRef.current) clearTimeout(fearsomeTimerRef.current); };
    }, []);

    // 自动收集进攻型词条 (加入 Challenger，使其享受 0.9s 的入场狂欢与常驻轮播)
    const offensiveKeywords = (data.keywords || []).filter(k => k === 'Overwhelm' || k === 'QuickAttack' || k === 'Challenger' || k === 'Double Attack' || k === 'Sniper' || k === 'Impact');
    const shouldTriggerOffensive = isCombat && !isBlocker && offensiveKeywords.length > 0;

    // 引擎 1：主引信 (控制同步爆发与进入轮播)
    useEffect(() => {
        if (shouldTriggerOffensive) {
            setVfxState('intro'); // 触发！所有词条的 intro 将会同时并联播放！
            const timer = setTimeout(() => {
                setVfxState('loop'); // [修正] 遵从将军指令，将爽感时间恢复至充足的 0.9 秒，让专属大作特效跑完！
            }, 900);
            return () => clearTimeout(timer);
        } else {
            setVfxState('idle'); // 撤回瞬间熄火
            setCarouselIndex(0);
        }
    }, [shouldTriggerOffensive]);

    // 引擎 2：轮播发牌员 (进入 loop 后，每 2.5 秒交替一次光环)
    useEffect(() => {
        if (vfxState === 'loop' && offensiveKeywords.length > 1) {
            const timer = setInterval(() => {
                setCarouselIndex(prev => (prev + 1) % offensiveKeywords.length);
            }, 2500);
            return () => clearInterval(timer);
        }
    }, [vfxState, offensiveKeywords.length]);

    const activeOffensiveKeyword = offensiveKeywords[carouselIndex];

    return (
        <>
            {/* [瞬逝] 手牌白橙火焰常驻预警 */}
            {location === 'hand' && data.keywords.includes('Volatile') && <VolatileFlame />}

            {/* [侦察] 战斗区卡面特效（仅进攻的侦察单位，战场常驻） */}
            {isScoutActive && (
                <div className="absolute inset-0 z-[30] pointer-events-none" style={{ borderRadius }}>
                    {/* 翠绿色高光轮廓 */}
                    <div className="absolute inset-0 border-4 border-emerald-400 rounded-xl box-border shadow-[0_0_20px_rgba(16,185,129,0.6)]" />
                    {/* 白色流光（沿边框流动） */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="30% 170%" className="animate-beam-move opacity-90 filter drop-shadow-[0_0_8px_white]" />
                    </svg>
                    {/* 入场图标爆发（一次性，每次进入战斗区播一次） */}
                    <motion.div
                        key={`scout-burst-${scoutBurstCount.current}`}
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.6, 2.5] }}
                        transition={{ duration: 0.9, ease: 'easeOut' }}
                    >
                        <img src={KEYWORD_DB['Scout'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_rgba(16,185,129,0.9)]" alt="侦察" />
                    </motion.div>
                    {/* 常驻图标：中间左右旋转（不缩放、不改变透明度），带翠绿光晕 */}
                    <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{ rotate: [-12, 12, -12] }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                        <img src={KEYWORD_DB['Scout'].icon} className="w-16 h-16 object-contain"
                            style={{ filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.9)) drop-shadow(0 0 26px rgba(16,185,129,0.55))' }}
                            alt="侦察" />
                    </motion.div>
                </div>
            )}
            {isScoutInvalid && (
                <div className="absolute inset-0 z-[30] pointer-events-none" style={{ borderRadius }}>
                    {/* 灰色高光轮廓 */}
                    <div className="absolute inset-0 border-4 border-gray-400 rounded-xl box-border shadow-[0_0_20px_rgba(156,163,175,0.5)]" />
                    {/* 白色流光（无效态：停转，无 animate-beam-move） */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="30% 170%" className="opacity-60 filter drop-shadow-[0_0_6px_rgba(156,163,175,0.7)]" />
                    </svg>
                    {/* 中间图标：灰白滤镜 + 停止旋转 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img src={KEYWORD_DB['Scout'].icon} className="w-16 h-16 object-contain"
                            style={{ filter: 'grayscale(1) brightness(1.25) drop-shadow(0 0 8px rgba(156,163,175,0.7))' }}
                            alt="侦察无效" />
                    </div>
                </div>
            )}

            {/* 1. Barrier (屏障) - 动态能量护盾 (向上生长 + 中心宣告 + 破裂爆散) */}
            {/* 利用 AnimatePresence 监听词条。无论是打出还是法术赋予，只要获得屏障，立刻触发华丽展开！ */}
            <AnimatePresence>
                {isOnBoard && data.keywords.includes('Barrier') && !data.depletedKeywords?.includes('Barrier') && KEYWORD_DB['Barrier'] && (
                    <motion.div key="barrier-wrapper" className="absolute inset-0 z-40 pointer-events-none">

                        {/* A. 护盾本体 (origin-bottom: 从底部向上撑开，碎裂时膨胀爆散) */}
                        <motion.div
                            className="absolute inset-0 overflow-hidden origin-bottom"
                            style={{ borderRadius }}
                            initial={{ opacity: 0, scaleY: 0 }}
                            animate={{ opacity: 1, scaleY: 1 }}
                            exit={{ opacity: 0, scale: 1.3, filter: "brightness(2.5) blur(6px)" }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                            {/* 金黄色底层能量膜 - 缓吸流转 */}
                            <motion.div
                                className="absolute inset-0 bg-yellow-400/20 mix-blend-screen"
                                animate={{ opacity: [0.1, 0.9, 0.1] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                            />
                            {/* 实体护盾高能边框 */}
                            <div className="absolute inset-0 border-[3px] border-yellow-300/80 box-border shadow-[inset_0_0_20px_rgba(253,224,71,0.5),0_0_15px_rgba(253,224,71,0.6)]" style={{ borderRadius }}></div>

                            {/* 六边形蜂窝网格 (极具科幻防御质感) */}
                            <svg className="absolute inset-0 w-full h-full opacity-40 mix-blend-overlay pointer-events-none">
                                <defs>
                                    <pattern id="hexagons" width="24" height="41.5" patternUnits="userSpaceOnUse" patternTransform="scale(0.7)">
                                        <path d="M24 10.39L12 3.46L0 10.39V24.25L12 31.18L24 24.25V10.39Z" fill="none" stroke="#fde047" strokeWidth="1.5"/>
                                        <path d="M0 31.18L-12 24.25V10.39L0 3.46L12 10.39V24.25L0 31.18Z" fill="none" stroke="#fde047" strokeWidth="1.5"/>
                                        <path d="M24 31.18L12 38.11L0 31.18V17.32L12 10.39L24 17.32V31.18Z" fill="none" stroke="#fde047" strokeWidth="1.5"/>
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#hexagons)" />
                            </svg>

                            {/* 绕边流光 */}
                            <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                                <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeDasharray="30% 170%" className="animate-beam-move opacity-90 filter drop-shadow-[0_0_8px_white]" />
                            </svg>
                        </motion.div>

                        {/* B. 获得护盾瞬间的标志性特效 (护盾闭合后浮现、膨胀、消散) */}
                        {/* 延迟 0.4s，等待底部护盾刚好生长闭合的瞬间，爆发宣告！ */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center z-[50] pointer-events-none"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 2.5] }}
                            exit={{ opacity: 0 }} // 如果中途被击碎，跟随护盾一起立即消失
                            transition={{ duration: 0.9, delay: 0.4, ease: "easeOut" }}
                        >
                            <img src={KEYWORD_DB['Barrier'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_yellow]" />
                        </motion.div>

                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2. Elusive (隐秘) - 全息光学迷彩：反相位双重交错呼吸 */}
            {isOnBoard && data.keywords.includes('Elusive') && (
                <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden" style={{ borderRadius }}>
                    {/* 轴 B：内层橙色幽灵遮罩 */}
                    {/* [修正数学错误] 取消 bg 类的透明度通道，利用 motion 锁定极限值在 20% 到 50% 之间 */}
                    {/* 当卡面最暗 (0.3) 时，遮罩恰好最浓重 (0.5)，完美模拟遁入暗影 */}
                    <motion.div
                        className="absolute inset-0 bg-orange-600"
                        animate={{ opacity: [0.3, 0, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* 轴 A：外边缘脉冲边框与流光 */}
                    {/* [找回丢失的灵魂] 这里包裹整个边框和 SVG，并且和卡面本体的 [1, 0.3, 1] 完全反相 */}
                    <motion.div
                        className="absolute inset-0 pointer-events-none"
                        animate={{ opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                        {/* 橙色脉冲光晕边框 */}
                        <div className="absolute inset-0 border-4 border-orange-500 box-border shadow-[0_0_20px_rgba(249,115,22,0.8)]" style={{ borderRadius }}></div>

                        {/* [修复] 找回丢失的 SVG 边缘跑动白线流光！ */}
                        <svg className="absolute inset-0 w-full h-full overflow-visible">
                            <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="40% 160%" className="animate-beam-move filter drop-shadow-[0_0_3px_white]" />
                        </svg>
                    </motion.div>
                </div>
            )}

            {/* 3a. Tough (坚韧) — 受击时黄绿高光 + 白色流光 + 图标爆发 */}
            <AnimatePresence>
                {toughHitActive && isOnBoard && KEYWORD_DB['Tough'] && (
                    <motion.div
                        key="tough-hit"
                        className="absolute inset-0 z-[70] pointer-events-none overflow-hidden"
                        style={{ borderRadius }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* 金琥珀高能边框 + 光晕 */}
                        <motion.div
                            className="absolute inset-0 border-4 border-[#be8f11] rounded-xl box-border"
                            style={{ boxShadow: '0 0 25px rgba(190, 143, 17, 0.8), inset 0 0 20px rgba(190, 143, 17, 0.3)' }}
                            initial={{ opacity: 0, scale: 0.9, filter: 'brightness(1.5)' }}
                            animate={{
                                opacity: [0, 1, 0.6, 0],
                                scale: [0.9, 1.05, 1, 1],
                                filter: ['brightness(1.5)', 'brightness(2)', 'brightness(1.2)', 'brightness(1)'],
                            }}
                            transition={{ duration: 1.0, times: [0, 0.2, 0.5, 1], ease: 'easeOut' }}
                        />

                        {/* 白色 SVG 绕边流光 */}
                        <motion.svg
                            className="absolute inset-0 w-full h-full overflow-visible"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0.5, 0] }}
                            transition={{ duration: 1.0, times: [0, 0.15, 0.4, 1] }}
                        >
                            <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                                rx={borderRadius} ry={borderRadius}
                                fill="none" stroke="white" strokeWidth="3"
                                strokeLinecap="round" strokeDasharray="30% 170%"
                                className="animate-beam-move opacity-90 filter drop-shadow-[0_0_8px_white]"
                            />
                        </motion.svg>

                        {/* 中央图标爆发 — 膨胀淡出 */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{
                                opacity: [0, 1, 0.8, 0],
                                scale: [0.5, 1.8, 2.2, 2.8],
                            }}
                            transition={{ duration: 1.0, times: [0, 0.2, 0.5, 1], ease: 'easeOut' }}
                        >
                            <img src={KEYWORD_DB['Tough'].icon}
                                className="w-20 h-20 object-contain drop-shadow-[0_0_25px_rgba(190,143,17,0.9)]"
                                alt="坚韧"
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3b. Thorns (反伤) — 物理拒止金属尖刺 */}
            {isOnBoard && data.keywords.includes('Thorns') && (
                <div className="absolute inset-0 z-[25] pointer-events-none overflow-visible" style={{ borderRadius }}>
                    {/* 静态常驻：贴合边缘的暗黑绿荆棘底座 */}
                    <div className="absolute inset-0 border-[3px] border-[#1a2e1a] rounded-xl shadow-[inset_0_0_10px_rgba(20,40,20,0.8)]" />

                    {/* 动态受击突刺层 */}
                    <motion.svg
                        className="absolute inset-0 w-full h-full overflow-visible"
                        style={{ left: '-12px', top: '-12px', width: 'calc(100% + 24px)', height: 'calc(100% + 24px)' }}
                        animate={thornsHitActive ? { scale: [1, 1.1, 1.05, 1], filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)'] } : { scale: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                        {/* 利用虚线偏移结合锯齿路径，生成锐利突刺 */}
                        <rect x="12" y="12" width="calc(100% - 24px)" height="calc(100% - 24px)" rx={borderRadius} ry={borderRadius}
                            fill="none"
                            stroke={thornsHitActive ? "#65a30d" : "#3f6212"} /* 触发时瞬间变为亮毒绿 */
                            strokeWidth={thornsHitActive ? "8" : "4"}
                            strokeDasharray="2 12 6 18 3 15" /* 不规则参差断裂 */
                            strokeLinecap="square"
                            className="drop-shadow-[0_0_6px_rgba(101,163,13,0.8)]"
                        />
                    </motion.svg>
                </div>
            )}

            {/* 3c. Aura (光环) — 纯 CSS 三维领域体积光 */}
            {isOnBoard && data.keywords.includes('Aura') && (
                <div className="absolute inset-0 z-[28] pointer-events-none overflow-hidden" style={{ borderRadius }}>
                    {/* 纯 CSS 圣洁光束：利用重复圆锥渐变叠加与交错旋转，辅以顶部透明遮罩，生成完美丁达尔效应 */}
                    <motion.div
                        className="absolute inset-[-100%] origin-bottom mix-blend-screen opacity-60"
                        style={{
                            background: 'repeating-conic-gradient(from 0deg at 50% 100%, transparent 0deg, rgba(147,197,253,0.1) 10deg, transparent 20deg)',
                            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 60%)',
                            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 60%)'
                        }}
                        animate={{ rotate: [-5, 5, -5] }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* 第二层光束：错开角度和旋转方向，增加光的交织厚度 */}
                    <motion.div
                        className="absolute inset-[-100%] origin-bottom mix-blend-screen opacity-40"
                        style={{
                            background: 'repeating-conic-gradient(from 15deg at 50% 100%, transparent 0deg, rgba(191,219,254,0.15) 15deg, transparent 30deg)',
                            maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)',
                            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 50%)'
                        }}
                        animate={{ rotate: [3, -3, 3] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    />

                    {/* 缓慢上浮的柔焦微尘粒子 */}
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={`dust-${i}`} className="absolute rounded-full bg-blue-100 blur-[1px] animate-dust-float" style={{
                            width: `${3 + (i % 3) * 2}px`, height: `${3 + (i % 3) * 2}px`,
                            left: `${15 + i * 15}%`,
                            bottom: '-10%',
                            animationDelay: `${i * 1.5}s`,
                            ['--dust-x' as any]: `${(i % 2 === 0 ? 1 : -1) * (10 + i * 5)}px`
                        }} />
                    ))}
                </div>
            )}

            {/* 3. Regeneration FX (再生) — 有机生命能量波 */}
            {isOnBoard && data.animState === 'regenerating' && KEYWORD_DB['Regeneration'] && (
                <div className="absolute inset-0 z-[70] pointer-events-none overflow-hidden animate-regen-fade" style={{ borderRadius }}>
                    {/* 液体浸润能量波：自下而上扫过卡面 */}
                    <div className="absolute inset-0 h-[150%] w-full bg-gradient-to-t from-emerald-400/0 via-emerald-300/40 to-green-100/80 mix-blend-screen animate-organic-wave" />

                    {/* 边缘逸散的高光萤火虫粒子 */}
                    <div className="absolute inset-0 overflow-visible">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div key={`firefly-${i}`} className="absolute w-[3px] h-[3px] rounded-full bg-green-200 shadow-[0_0_8px_#4ade80] animate-firefly-rise" style={{
                                left: `${(i / 11) * 100}%`,
                                bottom: '0%',
                                animationDelay: `${(i % 4) * 0.15}s`
                            }} />
                        ))}
                    </div>

                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 animate-regen-pop">
                        <img src={KEYWORD_DB['Regeneration'].icon} className="w-full h-full object-contain drop-shadow-[0_0_20px_#4ade80]" />
                    </div>
                </div>
            )}

            {/* ==================================================== */}
            {/* 进攻类词条：多轨同步爆破与交替轮播 */}
            {/* ==================================================== */}
            {vfxState !== 'idle' && (
                <div className="absolute inset-0 z-30 pointer-events-none">

                    {/* 全局底噪爆闪：增强卡牌落地一瞬间的冲击力 */}
                    {vfxState === 'intro' && (
                        <motion.div
                            className="absolute inset-0 border-4 border-white rounded-xl box-border"
                            initial={{ opacity: 0, scale: 0.9, filter: "brightness(1) drop-shadow(0 0 0px white)" }}
                            animate={{
                                opacity: [0, 1, 0],
                                scale: [0.95, 1.02, 1.05],
                                filter: ["brightness(1) drop-shadow(0 0 0px white)", "brightness(2) drop-shadow(0 0 20px white)", "brightness(1) drop-shadow(0 0 0px white)"]
                            }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        />
                    )}

                    {/* [核心机制]
                        在 intro 阶段：只要卡牌带有该词条，全部强制显示，实现多特效同时爆发！
                        在 loop 阶段：只有被 activeOffensiveKeyword 轮播到的词条才会显示。
                    */}
                    <AnimatePresence mode="popLayout">
                        {/* 轨道 A: 先攻 (QuickAttack) */}
                        {offensiveKeywords.includes('QuickAttack') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'QuickAttack')) && (
                            <motion.div
                                key="quick-attack"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: vfxState === 'intro' ? 0.1 : 0.5 }}
                            >
                                {/* 常驻的蓝色边框与流光 (Intro和Loop都会显示，作为底层锚点) */}
                                <div className="absolute inset-0 border-4 border-blue-500 rounded-xl shadow-[0_0_20px_#3b82f6] box-border"></div>
                                <svg className="absolute inset-0 w-full h-full overflow-visible">
                                    <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="20% 180%" className="animate-quick-beam opacity-90" />
                                </svg>

                                {/* [新增] 神级分镜：撕裂蓝色幕布 + 掉帧级硬切闪现！(仅在打出到战场时触发) */}
                                {vfxState === 'intro' && isCombat && (
                                    <div className="absolute inset-0 z-50 overflow-hidden rounded-xl pointer-events-none">
                                        {/* 左侧幕布：向左撕裂退场 */}
                                        <motion.div
                                            className="absolute left-0 top-0 bottom-0 w-1/2 bg-blue-600/60 backdrop-blur-sm border-r border-blue-300/80 shadow-[5px_0_15px_rgba(59,130,246,0.8)]"
                                            initial={{ x: 0, opacity: 1 }}
                                            animate={{ x: "-100%", opacity: 0 }}
                                            transition={{ duration: 0.4, ease: "easeIn" }}
                                        />
                                        {/* 右侧幕布：向右撕裂退场 */}
                                        <motion.div
                                            className="absolute right-0 top-0 bottom-0 w-1/2 bg-blue-600/60 backdrop-blur-sm border-l border-blue-300/80 shadow-[-5px_0_15px_rgba(59,130,246,0.8)]"
                                            initial={{ x: 0, opacity: 1 }}
                                            animate={{ x: "100%", opacity: 0 }}
                                            transition={{ duration: 0.4, ease: "easeIn" }}
                                        />

                                        {/* 三段硬切爆闪图标 (绝对无尺寸过渡渐变，纯靠时间轴错位闪现) */}
                                        {KEYWORD_DB['QuickAttack'] && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {/* 第一闪: 极小尺寸，瞬间闪现 (0 ~ 0.2s) */}
                                                <motion.img src={KEYWORD_DB['QuickAttack'].icon} className="absolute w-24 h-24 object-contain drop-shadow-[0_0_15px_#3b82f6]"
                                                    initial={{ scale: 0.65, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.3, times: [0, 0.5, 1], ease: "linear" }} />

                                                {/* 第二闪: 中等尺寸，延时跟进 (0.3 ~ 0.5s) */}
                                                <motion.img src={KEYWORD_DB['QuickAttack'].icon} className="absolute w-24 h-24 object-contain drop-shadow-[0_0_20px_#3b82f6]"
                                                    initial={{ scale: 1.3, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.4, delay: 0.3, times: [0, 0.5, 1], ease: "linear" }} />

                                                {/* 第三闪: 巨大尺寸，伴随幕布完全撕裂时的高潮爆发 (0.6 ~ 0.9s) */}
                                                <motion.img src={KEYWORD_DB['QuickAttack'].icon} className="absolute w-24 h-24 object-contain drop-shadow-[0_0_30px_#ffffff]"
                                                    initial={{ scale: 2.6, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.5, delay: 0.6, times: [0, 0.5, 1], ease: "linear" }} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* 轨道 B: 碾压 (Overwhelm) */}
                        {offensiveKeywords.includes('Overwhelm') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'Overwhelm')) && (
                            <motion.div
                                key="overwhelm"
                                className="absolute inset-0 text-red-600"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                {/* [加回] 仅在 intro 阶段才播放的：血红大图标中心爆散 (与快攻的硬切形成极致反差的丝滑膨胀) */}
                                {vfxState === 'intro' && KEYWORD_DB['Overwhelm'] && (
                                    <motion.div
                                        className="absolute inset-0 flex items-center justify-center z-[100] pointer-events-none"
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 2.5] }}
                                        transition={{ duration: 0.9, ease: "easeOut" }}
                                    >
                                        <img src={KEYWORD_DB['Overwhelm'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_red]" />
                                    </motion.div>
                                )}

                                {/* 红色呼吸边框 */}
                                <motion.div
                                    className="absolute inset-0 border-4 border-red-600 rounded-xl box-border shadow-[0_0_30px_rgba(220,38,38,0.8)]"
                                    animate={{ filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"] }}
                                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <motion.div
                                    className="absolute inset-0 w-full h-full overflow-visible z-10"
                                    animate={{ filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"] }}
                                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                >
                                    <svg className="w-full h-full overflow-visible">
                                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="40% 160%" className="animate-beam-move drop-shadow-[0_0_8px_white]" />
                                    </svg>
                                </motion.div>

                                {/* 红色物理尖刺 */}
                                <div
                                    className="absolute w-[90%] left-[5%] h-6 z-0"
                                    style={{
                                        bottom: isEnemyCombatant ? '-24px' : 'auto',
                                        top: isEnemyCombatant ? 'auto' : '-24px',
                                        transform: isEnemyCombatant ? 'rotate(180deg)' : 'rotate(0deg)'
                                    }}
                                >
                                    <motion.div
                                        className="w-full h-full flex justify-between origin-bottom"
                                        initial={{ scaleY: vfxState === 'intro' ? 0 : 1 }}
                                        animate={{ scaleY: 1, scale: [0.9, 1.1, 0.9] }}
                                        transition={{
                                            scaleY: { duration: vfxState === 'intro' ? 0.3 : 0 },
                                            scale: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
                                        }}
                                    >
                                        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full fill-red-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                                            <polygon points="0,20 10,0 20,20 30,0 40,20 50,0 60,20 70,0 80,20 90,0 100,20" />
                                        </svg>
                                    </motion.div>
                                </div>
                            </motion.div>
                        )}

                        {/* 轨道 C: 挑战者 (Challenger) */}
                        {offensiveKeywords.includes('Challenger') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'Challenger')) && (
                            <motion.div
                                key="challenger"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }} // 被轮播踢下舞台时的平滑淡出
                                transition={{ duration: vfxState === 'intro' ? 0.1 : 0.5 }}
                            >
                                {/* 常驻的橙色边框与流光 (Intro和Loop都会显示，作为底层锚点) */}
                                <div className="absolute inset-0 border-4 border-orange-500 rounded-xl shadow-[0_0_20px_#f97316] box-border"></div>
                                <svg className="absolute inset-0 w-full h-full overflow-visible z-10">
                                    <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="30% 170%" className="animate-beam-move opacity-90 filter drop-shadow-[0_0_5px_white]" />
                                </svg>

                                {/* [新增] 专属入场分镜：四维雷达残影扫描 + 阶梯式遮罩剥离 */}
                                {vfxState === 'intro' && isCombat && KEYWORD_DB['Challenger'] && (
                                    <div className="absolute inset-0 z-50 overflow-hidden rounded-xl pointer-events-none">
                                        {/* 橙色压抑遮罩，通过精确的时间轴错位，配合 5 次闪现实现极其凌厉的阶梯式透明度降低 */}
                                        <motion.div
                                            className="absolute inset-0 bg-orange-600"
                                            animate={{ opacity: [0.8, 0.8, 0.6, 0.6, 0.4, 0.4, 0.2, 0.2, 0] }}
                                            transition={{ duration: 0.8, times: [0, 0.249, 0.25, 0.499, 0.5, 0.749, 0.75, 0.999, 1], ease: "linear" }}
                                        />

                                        {/* 利用绝对定位百分比，硬编码错落有致的 5 个视觉坐标，强迫症福音！ */}
                                        <div className="absolute inset-0">
                                            {/* 闪现 1：左上角 */}
                                            <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                                                style={{ top: "20%", left: "20%", x: "-50%", y: "-50%" }}
                                                initial={{ scale: 0.5, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.2, delay: 0, times: [0, 0.5, 1], ease: "linear" }} />

                                            {/* 闪现 2：右下角 */}
                                            <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                                                style={{ top: "80%", left: "80%", x: "-50%", y: "-50%" }}
                                                initial={{ scale: 0.8, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.2, delay: 0.2, times: [0, 0.5, 1], ease: "linear" }} />

                                            {/* 闪现 3：左下角 */}
                                            <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                                                style={{ top: "80%", left: "20%", x: "-50%", y: "-50%" }}
                                                initial={{ scale: 1.2, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.2, delay: 0.4, times: [0, 0.5, 1], ease: "linear" }} />

                                            {/* 闪现 4：右上角 */}
                                            <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                                                style={{ top: "20%", left: "80%", x: "-50%", y: "-50%" }}
                                                initial={{ scale: 1.8, opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.2, delay: 0.6, times: [0, 0.5, 1], ease: "linear" }} />

                                            {/* 闪现 5：正中心最终锁定 (缓慢放大淡出) -> 在它开始淡出的0.8s，遮罩正好剥落到 0 */}
                                            <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_30px_#ffffff]"
                                                style={{ top: "50%", left: "50%", x: "-50%", y: "-50%" }}
                                                initial={{ scale: 3.0, opacity: 0 }} animate={{ scale: [3.0, 4.0], opacity: [0, 1, 0] }} transition={{ duration: 1, delay: 0.8, ease: "easeOut" }} />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* 轨道 D: 连击 (Double Attack) — 橙色双段爆发 */}
                        {offensiveKeywords.includes('Double Attack') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'Double Attack')) && (
                            <motion.div
                                key="double-attack"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: vfxState === 'intro' ? 0.1 : 0.5 }}
                            >
                                <div className="absolute inset-0 border-4 border-orange-400 rounded-xl shadow-[0_0_20px_#fb923c] box-border" />
                                {vfxState === 'intro' && isCombat && KEYWORD_DB['Double Attack'] && (
                                    <div className="absolute inset-0 z-50 overflow-hidden rounded-xl pointer-events-none">
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <motion.img src={KEYWORD_DB['Double Attack'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#fb923c]"
                                                initial={{ scale: 0.4, opacity: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 2.2, 0.4] }} transition={{ duration: 0.3, delay: 0, ease: "easeOut" }} />
                                            <motion.img src={KEYWORD_DB['Double Attack'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_20px_#f97316]"
                                                initial={{ scale: 0.4, opacity: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 2.5, 0.4] }} transition={{ duration: 0.35, delay: 0.3, ease: "easeOut" }} />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* 轨道 E: 狙击 (Sniper) — 青色十字瞄准 + 锁定 */}
                        {offensiveKeywords.includes('Sniper') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'Sniper')) && (
                            <motion.div
                                key="sniper"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: vfxState === 'intro' ? 0.1 : 0.5 }}
                            >
                                <div className="absolute inset-0 border-4 border-cyan-400 rounded-xl shadow-[0_0_20px_#22d3ee] box-border" />
                                {vfxState === 'intro' && isCombat && (
                                    <div className="absolute inset-0 z-50 overflow-hidden rounded-xl pointer-events-none">
                                        <svg className="absolute inset-0 w-full h-full overflow-visible">
                                            <motion.line x1="0" y1="50%" x2="100%" y2="50%" stroke="#22d3ee" strokeWidth="2" animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.6, ease: "easeOut" }} />
                                            <motion.line x1="50%" y1="0" x2="50%" y2="100%" stroke="#22d3ee" strokeWidth="2" animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.6, ease: "easeOut" }} />
                                        </svg>
                                        {KEYWORD_DB['Sniper'] && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <motion.img src={KEYWORD_DB['Sniper'].icon} className="w-24 h-24 object-contain drop-shadow-[0_0_20px_#22d3ee]"
                                                    initial={{ scale: 0.3, opacity: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.3, 2.0, 0.3] }} transition={{ duration: 0.8, ease: "easeOut" }} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* 轨道 F: 冲击 (Impact) — 深红爆破震波 */}
                        {offensiveKeywords.includes('Impact') && (vfxState === 'intro' || (vfxState === 'loop' && activeOffensiveKeyword === 'Impact')) && (
                            <motion.div
                                key="impact"
                                className="absolute inset-0"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: vfxState === 'intro' ? 0.1 : 0.5 }}
                            >
                                <div className="absolute inset-0 border-4 border-red-700 rounded-xl shadow-[0_0_20px_#b91c1c] box-border" />
                                {vfxState === 'intro' && isCombat && (
                                    <div className="absolute inset-0 z-50 overflow-hidden rounded-xl pointer-events-none">
                                        {[0, 1, 2].map(i => (
                                            <motion.div key={i} className="absolute inset-0 border-[3px] border-red-500 rounded-xl"
                                                initial={{ scale: 0.7, opacity: 0.8 }} animate={{ scale: [0.7, 1.6], opacity: [0.8, 0] }} transition={{ duration: 0.5, delay: i * 0.15, ease: "easeOut" }} />
                                        ))}
                                        {KEYWORD_DB['Impact'] && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <motion.img src={KEYWORD_DB['Impact'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_#e11d48]"
                                                    initial={{ scale: 0.4, opacity: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 2.2, 0.4] }} transition={{ duration: 0.7, ease: "easeOut" }} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* 6. Challenger FX (挑战者 - 主动发起方) - Hover 显露獠牙 */}
            {isOnBoard && data.keywords.includes('Challenger') && onChallengerClick && KEYWORD_DB['Challenger'] && (
                <div
                    // [核心逻辑] 平时隐藏(opacity-0)，Hover时显露；但如果处于激活状态，则无视Hover强制常亮！
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] cursor-pointer w-20 h-20 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isCombat ? 'block' : 'hidden'} ${isChallengerActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    onClick={(e) => { e.stopPropagation(); onChallengerClick(); }}
                >
                    <img
                        src={KEYWORD_DB['Challenger'].icon}
                        alt="挑战"
                        className={`w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] ${isChallengerActive ? 'animate-pulse brightness-150 scale-110' : 'opacity-90'}`}
                    />
                </div>
            )}

            {/* 7. Challenger Target FX (猎物惊恐闪烁状态 - 无遮罩版循环残影) */}
            {canBeChallenged && KEYWORD_DB['Challenger'] && (
                <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden rounded-xl">
                    <div className="absolute inset-0 border-4 border-orange-500 rounded-xl z-50 shadow-[0_0_30px_orange] box-border opacity-80"></div>
                    <div className="absolute inset-0">
                        {/* 完美错开的 1.25秒 循环时间轴，实现连续的位移扫描闪现 */}
                        <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                            style={{ top: "20%", left: "20%", x: "-50%", y: "-50%", scale: 0.5 }}
                            animate={{ opacity: [0, 1, 0, 0] }} transition={{ duration: 1.25, times: [0, 0.1, 0.2, 1], repeat: Infinity, ease: "linear" }} />

                        <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                            style={{ top: "80%", left: "80%", x: "-50%", y: "-50%", scale: 0.8 }}
                            animate={{ opacity: [0, 0, 1, 0, 0] }} transition={{ duration: 1.25, times: [0, 0.15, 0.25, 0.35, 1], repeat: Infinity, ease: "linear" }} />

                        <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                            style={{ top: "80%", left: "20%", x: "-50%", y: "-50%", scale: 1.2 }}
                            animate={{ opacity: [0, 0, 1, 0, 0] }} transition={{ duration: 1.25, times: [0, 0.3, 0.4, 0.5, 1], repeat: Infinity, ease: "linear" }} />

                        <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_15px_#f97316]"
                            style={{ top: "20%", left: "80%", x: "-50%", y: "-50%", scale: 1.8 }}
                            animate={{ opacity: [0, 0, 1, 0, 0] }} transition={{ duration: 1.25, times: [0, 0.45, 0.55, 0.65, 1], repeat: Infinity, ease: "linear" }} />

                        {/* 第 5 闪：正中心最终锁定放大 */}
                        <motion.img src={KEYWORD_DB['Challenger'].icon} className="absolute w-20 h-20 object-contain drop-shadow-[0_0_30px_#ffffff]"
                            style={{ top: "50%", left: "50%", x: "-50%", y: "-50%" }}
                            animate={{ scale: [3.0, 3.0, 4.0, 4.0], opacity: [0, 0, 1, 0] }} transition={{ duration: 1.25, times: [0, 0.6, 0.75, 1], repeat: Infinity, ease: "easeOut" }} />
                    </div>
                </div>
            )}

            {/* 4. CantBlock FX (无法格挡) */}
            {isOnBoard && data.keywords.includes('CantBlock') && highlightTarget && isBlocking && KEYWORD_DB['CantBlock'] && (
                <div className="absolute inset-0 z-30 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-gray-300 rounded-xl box-border shadow-[0_0_15px_rgba(209,213,219,0.5)] opacity-90"></div>
                    <svg className="absolute inset-0 w-full h-full overflow-visible z-10">
                        <motion.rect
                            x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                            rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3"
                            strokeLinecap="round" strokeDasharray="15% 85%" strokeDashoffset={0}
                            animate={{ strokeDashoffset: [0, 0, 10, -10, 5, -5, 0, 0] }}
                            transition={{ duration: 2.5, times: [0, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1], repeat: Infinity, ease: "linear" }}
                            className="drop-shadow-[0_0_8px_white]"
                        />
                    </svg>
                </div>
            )}

            {/* 5. CantAttack (无法攻击) — 灰暗禁止覆盖层 */}
            {isOnBoard && data.keywords.includes('CantAttack') && (
                <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden" style={{ borderRadius }}>
                    <motion.div className="absolute inset-0 bg-gray-800/60" style={{ borderRadius }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full border-4 border-gray-400/80 flex items-center justify-center">
                            <div className="w-12 h-1 rounded-full bg-gray-400/80 rotate-45" />
                        </div>
                    </div>
                </div>
            )}

            {/* 5b. 凶恶 (Fearsome) — 一次性入场演出：紫色边框+流光+恶魔角+图标爆闪 */}
            <AnimatePresence>
                {fearsomeActive && data.keywords.includes('Fearsome') && KEYWORD_DB['Fearsome'] && (
                    <motion.div
                        key="fearsome"
                        className="absolute inset-0 z-[80] pointer-events-none"
                        style={{ borderRadius }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                        transition={{ duration: 0.15 }}
                    >
                        {/* 图标中心爆闪（一次） */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center z-[100]"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 2.5] }}
                            transition={{ duration: 0.9, ease: "easeOut" }}
                        >
                            <img src={KEYWORD_DB['Fearsome'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_rgba(147,51,234,0.9)]" />
                        </motion.div>

                        {/* 紫色外发光边框 */}
                        <motion.div
                            className="absolute inset-0 border-4 border-purple-600 rounded-xl box-border shadow-[0_0_30px_rgba(147,51,234,0.8)]"
                            animate={{ filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        />

                        {/* 白色流光 */}
                        <motion.div className="absolute inset-0 w-full h-full overflow-visible z-10">
                            <svg className="w-full h-full overflow-visible">
                                <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                                    rx={borderRadius} ry={borderRadius}
                                    fill="none" stroke="white" strokeWidth="3"
                                    strokeLinecap="round" strokeDasharray="40% 160%"
                                    className="animate-beam-move drop-shadow-[0_0_8px_white]" />
                            </svg>
                        </motion.div>

                        {/* ④ 恶魔角（交战侧上方） */}
                        <div
                            className="absolute w-[90%] left-[5%] h-6 z-0"
                            style={{
                                bottom: isEnemyCombatant ? '-24px' : 'auto',
                                top: isEnemyCombatant ? 'auto' : '-24px',
                                transform: isEnemyCombatant ? 'rotate(180deg)' : 'rotate(0deg)'
                            }}
                        >
                            {/* [核心修复] 增加 overflow-visible 防止边缘抗锯齿被误裁 */}
                            <motion.svg
                                viewBox="0 0 100 20" preserveAspectRatio="none"
                                className="w-full h-full fill-purple-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] overflow-visible"
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                            >
                                {/*
                                    2 只真正锋利的恶魔角：
                                    - 使用三次贝塞尔曲线 (C) 雕刻出极度尖锐的顶部转折。
                                    - 左侧角 (28,0) 和右侧角 (72,0) 的弧度向内收拢，呈现出钳击的威吓感。
                                    - 所有 Y 坐标严格控制在 0~20，彻底解决被削平的 Bug。
                                */}
                                <path d="M 12 20 C 12 8, 18 2, 28 0 C 24 6, 26 15, 34 20 L 66 20 C 74 15, 76 6, 72 0 C 82 2, 88 8, 88 20 Z" />
                            </motion.svg>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 6. Frostbite (冻结) — 常驻描边 + 冰裂纹（纯静态，无动画） */}
            {isOnBoard && data.keywords.includes('Frostbite') && (
                // [修复1] 将 z-35 改为规范的 z-40 (或 z-[35])，确保它绝对盖在 z-10 的卡面之上！
                // [修复2] 移除 overflow-hidden，让 shadow 外发光能够自由溢出容器展现光晕！
                <div className="absolute inset-0 z-40 pointer-events-none" style={{ borderRadius }}>
                    {/* ① 靛蓝描边 + 外发光 */}
                    <div className="absolute inset-0 border-4 border-indigo-500 rounded-xl box-border shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
                    {/* ② 白色冰裂纹流光 — 冻住不动 */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                            rx={borderRadius} ry={borderRadius}
                            fill="none" stroke="white" strokeWidth="2"
                            strokeLinecap="round" strokeDasharray="30% 170%"
                            className="opacity-90 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                    </svg>
                </div>
            )}

            {/* 6b. Frostbite 入场图标爆发 — 一次性，独立于常驻部分 */}
            <AnimatePresence>
                {frostEntryActive && KEYWORD_DB['Frostbite'] && (
                    <motion.div
                        key="frost-entry"
                        className="absolute inset-0 z-[70] pointer-events-none overflow-hidden"
                        style={{ borderRadius }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 2.5] }}
                            transition={{ duration: 0.9, ease: "easeOut" }}
                        >
                            <img src={KEYWORD_DB['Frostbite'].icon}
                                className="w-20 h-20 object-contain drop-shadow-[0_0_25px_rgba(125,211,252,0.9)]"
                                alt="冻结" />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 6c. Frostbite 解冻 — 三段动画：流光复苏 → 冰晶碎裂 → 图标爆散 */}
            {frostThawActive && (
                <div className="absolute inset-0 z-[75] pointer-events-none overflow-hidden" style={{ borderRadius }}>
                    {/* 阶段① 流光复苏（0→0.6s）：白色发光描边重新流动 → 逐渐淡出 */}
                    {/* 发光外边框 — 亮度从暴增到消退（独立 motion.div，不参与 SVG 动画） */}
                    <motion.div
                        className="absolute inset-0 border-4 border-white/90 rounded-xl box-border"
                        style={{ boxShadow: '0 0 30px rgba(255,255,255,0.9), inset 0 0 20px rgba(255,255,255,0.4)' }}
                        initial={{ opacity: 0, filter: 'brightness(1.5)' }}
                        animate={{ opacity: [0, 1, 0.6, 0], filter: ['brightness(1.5)', 'brightness(2.5)', 'brightness(1.2)', 'brightness(0.5)'] }}
                        transition={{ duration: 0.6, times: [0, 0.15, 0.4, 1], ease: 'easeOut' }}
                    />
                    {/* 绕边白色流光 — 使用 motion.svg 直接作为动画宿主（匹配 Tough 模式） */}
                    <motion.svg
                        className="absolute inset-0 w-full h-full overflow-visible"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.6, 0] }}
                        transition={{ duration: 0.6, times: [0, 0.1, 0.4, 1], ease: 'easeOut' }}
                    >
                        <rect
                            x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                            rx={borderRadius} ry={borderRadius}
                            fill="none" stroke="white" strokeWidth="3"
                            strokeLinecap="round" strokeDasharray="30% 170%"
                            className="animate-beam-move opacity-90 filter drop-shadow-[0_0_8px_white]"
                        />
                    </motion.svg>

                    {/* 阶段② 冰晶碎裂（0.3→0.7s）：描边断裂 + 六角碎片飞散 */}
                    <motion.div
                        className="absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.05 }}
                    >
                        {/* 六角冰晶碎片飞散 */}
                        {[0,1,2,3,4,5].map(i => {
                            const angle = (i / 6) * 360;
                            const dist = 40 + i * 8;
                            return (
                                <motion.div
                                    key={`ice-chunk-${i}`}
                                    className="absolute w-3 h-3 bg-indigo-300/70"
                                    style={{
                                        top: '50%', left: '50%',
                                        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                                        borderRadius: '2px',
                                    }}
                                    initial={{ x: 0, y: 0, rotate: 0, opacity: 0.8 }}
                                    animate={{
                                        x: Math.cos(angle * Math.PI / 180) * dist,
                                        y: Math.sin(angle * Math.PI / 180) * dist,
                                        rotate: 180 + i * 30,
                                        opacity: 0,
                                    }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                />
                            );
                        })}
                    </motion.div>

                    {/* 阶段③ 解放爆散（0.7→1.3s）：图标膨胀爆散 + 冰环扩散 + 收尾闪光 */}
                    <motion.div
                        className="absolute inset-0"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.7, duration: 0.05 }}
                    >
                        {/* 冰蓝光环扩散 */}
                        <motion.div
                            className="absolute inset-0 rounded-xl"
                            style={{
                                border: '3px solid rgba(125, 211, 252, 0.8)',
                                boxShadow: '0 0 30px rgba(125, 211, 252, 0.6), inset 0 0 30px rgba(125, 211, 252, 0.2)',
                            }}
                            initial={{ scale: 0.7, opacity: 0.8 }}
                            animate={{ scale: 2.5, opacity: 0 }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                        {/* 中心图标爆发 */}
                        {KEYWORD_DB['Frostbite'] && (
                            <motion.div
                                className="absolute inset-0 flex items-center justify-center"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.8, 3.0] }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                            >
                                <img src={KEYWORD_DB['Frostbite'].icon}
                                    className="w-16 h-16 object-contain drop-shadow-[0_0_30px_rgba(125,211,252,1)]"
                                    alt="解冻" />
                            </motion.div>
                        )}
                        {/* 收尾闪光 */}
                        <motion.div
                            className="absolute inset-0 rounded-xl"
                            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.8) 0%, transparent 70%)' }}
                            initial={{ opacity: 0, scale: 0.3 }}
                            animate={{ opacity: [0, 0.6, 0], scale: [0.3, 1.5, 2] }}
                            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                        />
                    </motion.div>
                </div>
            )}

            {/* 8. Challenger Target Locked (死锁状态) - 结算前压迫，结算时卸除 */}
            {/* [核心精髓] 当进入动画对冲状态 (attacking 或 dying) 时，瞬间撤除所有锁定UI，还卡面以绝对的整洁！ */}
            {isChallengedTarget && data.animState !== 'attacking' && data.animState !== 'dying' && (
                <div className="absolute inset-0 z-40 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-orange-600 rounded-2xl shadow-[0_0_30px_rgba(234,88,12,0.8)] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                         <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="50% 150%" className="animate-beam-move opacity-80 filter drop-shadow-[0_0_5px_white]" />
                    </svg>
                    {/* 中心缓慢呼吸的死兆星锁定图标 */}
                    <motion.div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        {KEYWORD_DB['Challenger'] && <img src={KEYWORD_DB['Challenger'].icon} className="w-20 h-20 object-contain drop-shadow-[0_0_20px_red]" />}
                    </motion.div>
                </div>
            )}
            {/* [泰坦] 脉冲特效 — 2秒完整时序：渐变→遮罩→波纹（可出界）→爆闪→飘字 */}
            {(titanBuffActive || (isOnBoard && data.keywords.includes('Titan') && KEYWORD_DB['Titan'])) && (
                <>
                    {titanBuffActive && (
                        <>
                            {/* 内层容器：渐变/遮罩/爆闪/飘字（裁剪在卡牌边界内） */}
                            <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden" style={{ borderRadius }}>
                                {/* ① 青蓝渐变从底部冲顶（0→0.25s） */}
                                <motion.div className="absolute inset-0 bg-gradient-to-t from-cyan-500/50 via-blue-400/20 to-transparent origin-bottom"
                                    initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }} />

                                {/* ② 青蓝亮度遮罩：同步上升→维持→（0.6s后随波纹褪去） */}
                                <motion.div className="absolute inset-0 bg-cyan-500/[0.2]"
                                    initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0.5, 0] }}
                                    transition={{ duration: 1.0, times: [0, 0.2, 0.6, 1], ease: "easeInOut" }} />

                                {/* ④ 泰坦图标爆闪（0.8s→1.2s，第一道波纹到达最大时触发） */}
                                <motion.div className="absolute inset-0 flex items-center justify-center"
                                    initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 2.2] }}
                                    transition={{ duration: 0.4, delay: 0.8 }}>
                                    <img src={KEYWORD_DB['Titan'].icon} className="w-16 h-16 object-contain drop-shadow-[0_0_30px_rgba(6,182,212,1)]" alt="泰坦脉冲" />
                                </motion.div>

                                {/* ⑤ 一切结束后飘字收尾（1.3s→2.0s） */}
                                {titanCount !== undefined && titanCount > 0 && (
                                    <motion.div className="absolute -top-5 left-1/2 -translate-x-1/2 text-cyan-300 font-black text-xl drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                                        initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: -32 }}
                                        transition={{ duration: 0.7, delay: 1.3 }}>
                                        +{titanCount}
                                    </motion.div>
                                )}
                            </div>

                            {/* ③ 3道蓝色同心波纹（可超出卡牌边界！）0.5s起，错开0.08s */}
                            <div className="absolute inset-0 z-30 pointer-events-none overflow-visible" style={{ borderRadius }}>
                                {[0, 1, 2].map(i => (
                                    <motion.div key={i} className="absolute inset-0 border-[3px] border-cyan-400/80 rounded-xl"
                                        initial={{ scale: 0.85, opacity: 0.8 }} animate={{ scale: [0.85, 2.6], opacity: [0.8, 0] }}
                                        transition={{ duration: 0.5, delay: 0.5 + i * 0.08, times: [0, 0.6, 1], ease: "easeOut" }} />
                                ))}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* [充能] 脉冲特效 — 1s 时序：流光环绕→图标爆发→黯淡过渡 */}
            {channelPulseActive && KEYWORD_DB['Channel'] && (
                <div className="absolute inset-0 z-40 pointer-events-none" style={{ borderRadius }}>
	                    {/* ① 淡蓝高光描边 + 白色流光快速环绕 (0~0.4s) */}
	                    <motion.div className="absolute inset-0 overflow-visible" style={{ borderRadius }}>
	                        <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ borderRadius }}>
	                            <rect x="-1" y="-1" width="calc(100% + 2px)" height="calc(100% + 2px)"
	                                rx={borderRadius} ry={borderRadius}
	                                fill="none" stroke="rgba(125, 211, 252, 0.8)" strokeWidth="3"
	                                strokeLinecap="round" strokeDasharray="30% 170%"
	                                className="animate-quick-beam opacity-90 drop-shadow-[0_0_8px_rgba(125,211,252,0.9)]"
	                                style={{ filter: 'drop-shadow(0 0 6px rgba(125,211,252,0.6))' }}
	                            />
	                        </svg>
	                        {/* 第二道细白光，稍快重叠，制造「流光」感 */}
	                        <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ borderRadius }}>
	                            <rect x="-1" y="-1" width="calc(100% + 2px)" height="calc(100% + 2px)"
	                                rx={borderRadius} ry={borderRadius}
	                                fill="none" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="2"
	                                strokeLinecap="round" strokeDasharray="15% 185%"
	                                className="animate-quick-beam opacity-80"
	                                style={{ animationDelay: '0.05s' }}
	                            />
	                        </svg>
	                    </motion.div>

	                    {/* ② 图标爆发 (0.3s~0.7s)：中心放大 + 亮度飙升 */}
	                    <motion.div className="absolute inset-0 flex items-center justify-center z-50"
	                        initial={{ opacity: 0, scale: 0.5 }}
	                        animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.6, 1.8, 0.3] }}
	                        transition={{ duration: 0.8, times: [0, 0.2, 0.5, 0.9], ease: "easeOut" }}
	                    >
	                        <img src={KEYWORD_DB['Channel'].icon}
	                            className="w-14 h-14 object-contain"
	                            style={{ filter: 'drop-shadow(0 0 25px rgba(125,211,252,1)) brightness(2)' }}
	                            alt="充能" />
	                    </motion.div>

	                    {/* ③ 充能完成的确认闪烁 (0.7s) */}
	                    <motion.div className="absolute inset-0 z-30"
	                        initial={{ opacity: 0 }}
	                        animate={{ opacity: [0, 0.3, 0] }}
	                        transition={{ duration: 0.3, delay: 0.7, ease: "easeOut" }}
	                        style={{ background: 'radial-gradient(circle, rgba(125,211,252,0.3) 0%, transparent 70%)' }}
	                    />
	                </div>
	            )}

            {/* [召唤入场 V2] 真·卡面切片碎片重组已迁移至 Card.tsx（renderFrontFace 切片层），此处移除 V1 白色装饰碎片 */}

            {/* 9. Ephemeral Dying (瞬息消散) - 终极空洞化演出 */}
            <AnimatePresence>
                {data.animState === 'ephemeral_dying' && (
                    <motion.div className="absolute inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden" style={{ borderRadius }}>
                        {/* A. 淡黄色能量耗尽蒙版：配合原画色调，使用正片叠底 */}
                        <motion.div
                            className="absolute inset-0 bg-[#e2d8b5] mix-blend-multiply"
                            animate={{ opacity: [0, 1, 1, 0] }}
                            transition={{
                                duration: 1.5,
                                times: [0, 0.8, 0.9, 1], // 0-1.2s 淡入, 1.2-1.35s 悬停, 1.35-1.5s 褪去
                                ease: "easeInOut"
                            }}
                        />
                        {/* 稍微加深底层暗度，让淡黄色更显诡异 */}
                        <motion.div
                            className="absolute inset-0 bg-black/60"
                            animate={{ opacity: [0, 1, 1, 0] }}
                            transition={{ duration: 1.5, times: [0, 0.8, 0.9, 1], ease: "easeInOut" }}
                        />

                        {/* B. 巨大的紫色幻象图标：收缩 -> 悬停 -> 爆散 */}
                        {KEYWORD_DB['Ephemeral'] && (
                            <motion.img
                                src={KEYWORD_DB['Ephemeral'].icon}
                                className="w-32 h-32 object-contain drop-shadow-[0_0_40px_purple]"
                                animate={{
                                    scale: [2.0, 0.4, 0.4, 3.5], // 200%缩至40%，悬停，最后猛然放大到350%
                                    opacity: [0, 1, 1, 0],
                                    filter: [
                                        "brightness(1) blur(2px)",
                                        "brightness(1) blur(0px)",
                                        "brightness(3) blur(0px)", // 悬停时亮度极速飙升
                                        "brightness(5) blur(4px)"
                                    ]
                                }}
                                transition={{
                                    duration: 1.5,
                                    times: [0, 0.8, 0.9, 1],
                                    ease: ["easeOut", "linear", "easeIn"] // 收缩平滑，爆散迅猛
                                }}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

// ==========================================
// [瞬逝保险丝] 手牌 Volatile 卡总数计数器
// 敌我手牌火焰共享：总数越多 → 火焰档位越低，防 20 张极端场景卡顿
// ==========================================
let volatileHandTotal = 0;
const volatileHandListeners = new Set<() => void>();

export const notifyVolatileHand = (delta: number) => {
    volatileHandTotal = Math.max(0, volatileHandTotal + delta);
    volatileHandListeners.forEach(l => l());
};
export const subscribeVolatileHand = (cb: () => void) => {
    volatileHandListeners.add(cb);
    return () => { volatileHandListeners.delete(cb); };
};
export const getVolatileHandTotal = () => volatileHandTotal;

export type FlameQuality = 'full' | 'medium' | 'lite';
const flameQualityOf = (n: number): FlameQuality => n > 12 ? 'lite' : n > 6 ? 'medium' : 'full';

/**
 * [瞬逝] 高能等离子过载版 (纯白)
 * - 约束力场：断裂虚线
 * - 顶部电弧：高密度交织网格
 * - 卡面内透：隐秘高能扫描线 (z-[5])
 * - 崩解碎片：方块双向抛射、自转 (z-[20])
 */
export const VolatileFlame: React.FC<{ radius?: number }> = ({ radius: _radius = 8 }) => {
    const total = useSyncExternalStore(subscribeVolatileHand, getVolatileHandTotal);
    const q = flameQualityOf(total);

    // 档位控制：由于是双向发射，数量可适当提升
    const shardCount = q === 'full' ? 12 : q === 'medium' ? 8 : 4;
    const topShardCount = q === 'full' ? 8 : q === 'medium' ? 5 : 2;

    return (
        <>
            <div className="absolute inset-0 z-[-1] pointer-events-none overflow-visible">
                {/* 1. 约束力场崩溃：极速流动的纯白断裂虚线边框 */}
                <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ left: '-3px', top: '-3px', width: 'calc(100% + 6px)', height: 'calc(100% + 6px)' }}>
                    <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="10" ry="10"
                        fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="15 8 4 12 25 10"
                        className="animate-plasma-dash drop-shadow-[0_0_4px_rgba(255,255,255,0.9)]" />
                </svg>
                <div className="absolute inset-[-1px] border-[1px] border-white/30 rounded-xl" />
            </div>

            {/* 3. 卡面内透特效 (z-[15]：卡面主体 z-10 之上、攻防文字 z-100 之下) */}
            {/* [修复 2026-08-04] 原 z-[5] 低于卡面主体 z-10，扫描线被原画盖住不可见，故提升至 z-[15] */}
            {/* [升级 2026-08-04] V1 仅 3% 强度不可见，V2 改为青白双色 + 亮青光晕 + 1.2s 快速扫描 */}
            <div className="absolute inset-0 z-[15] pointer-events-none overflow-hidden rounded-xl">
                {/* 扫描线本体：白色主线 + 青色边缘光晕 + 快速扫过 */}
                <div
                    className="absolute inset-0 h-[30%] animate-surface-glitch-v2"
                    style={{
                        background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.9) 35%, rgba(125,211,252,0.75) 50%, rgba(255,255,255,0.9) 65%, transparent 100%)',
                        boxShadow: '0 0 12px rgba(125,211,252,0.8), 0 0 32px rgba(56,189,248,0.5)',
                    }}
                />
                {/* 扫过瞬间的全局轻微白化闪屏（青色微光） */}
                <motion.div className="absolute inset-0 bg-white/10"
                    animate={{ opacity: [0, 0, 0.28, 0, 0] }} transition={{ duration: 1.2, times: [0, 0.55, 0.62, 0.7, 1], repeat: Infinity }} />
            </div>

            {/* 4. 物质崩解几何碎片 (方形，双向发射，独立旋转，多尺寸) */}
            <div className="absolute inset-0 z-20 pointer-events-none overflow-visible">
                {/* A. 底部发射阵列 */}
                {Array.from({ length: shardCount }).map((_, i) => {
                    const size = 3 + (i % 4) * 2; // 3px 到 9px 的方形
                    return (
                        <div key={`shard-b-${i}`} className="absolute bg-white animate-square-eject drop-shadow-[0_0_4px_rgba(255,255,255,1)]" style={{
                            width: `${size}px`, height: `${size}px`,
                            left: `${5 + i * (90 / Math.max(1, shardCount - 1))}%`,
                            bottom: i % 2 === 0 ? '5%' : '25%', // 错落初始高度
                            animationDelay: `${i * 0.15}s`,
                            // 使用 CSS 变量注入随机化的参数
                            ['--shard-x' as any]: `${(i % 2 === 0 ? 1 : -1) * (10 + (i % 3) * 8)}px`,
                            ['--shard-y' as any]: `-${45 + (i % 3) * 20}px`,
                            ['--rot-mid' as any]: `${90 + (i % 4) * 45}deg`,
                            ['--rot-end' as any]: `${180 + (i % 5) * 90}deg`,
                            ['--shard-scale' as any]: 0.5 + (i % 3) * 0.2,
                            ['--anim-duration' as any]: `${0.9 + (i % 3) * 0.3}s`
                        }} />
                    )
                })}

                {/* B. 顶部发射阵列 (直接从卡牌顶端向上喷射) */}
                {Array.from({ length: topShardCount }).map((_, i) => {
                    const size = 2 + (i % 3) * 3; // 2px 到 8px 的方形
                    return (
                        <div key={`shard-t-${i}`} className="absolute bg-white animate-square-eject drop-shadow-[0_0_4px_rgba(255,255,255,1)]" style={{
                            width: `${size}px`, height: `${size}px`,
                            left: `${10 + i * (80 / Math.max(1, topShardCount - 1))}%`,
                            top: '-5%',
                            bottom: 'auto',
                            animationDelay: `${i * 0.2}s`,
                            ['--shard-x' as any]: `${(i % 2 === 0 ? -1 : 1) * (5 + (i % 4) * 10)}px`,
                            ['--shard-y' as any]: `-${35 + (i % 4) * 15}px`,
                            ['--rot-mid' as any]: `${-90 - (i % 3) * 45}deg`,
                            ['--rot-end' as any]: `${-180 - (i % 4) * 90}deg`,
                            ['--shard-scale' as any]: 0.4 + (i % 2) * 0.3,
                            ['--anim-duration' as any]: `${0.7 + (i % 4) * 0.2}s`
                        }} />
                    )
                })}
            </div>
        </>
    );
};

// ==========================================
// [侦察] 攻击宣言期侦察状态 store
// 'active' = 首次进攻全侦察（有效）/ 'invalid' = 混入非侦察 / null = 无侦察或非首次
// GameSession 观察战斗区广播 → KeywordEffects / KeywordTray 订阅
// ==========================================
let scoutState: 'active' | 'invalid' | null = null;
const scoutListeners = new Set<() => void>();
export const notifyScoutState = (s: 'active' | 'invalid' | null) => {
    scoutState = s;
    scoutListeners.forEach(l => l());
};
export const subscribeScoutState = (cb: () => void) => {
    scoutListeners.add(cb);
    return () => { scoutListeners.delete(cb); };
};
export const getScoutState = () => scoutState;