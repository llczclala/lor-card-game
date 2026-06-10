// [核心修复] 引入 useState 和 useEffect 构建状态机
import React, { useState, useEffect } from 'react';
// [新增] 引入 motion 和 AnimatePresence 用于无缝淡出
import { motion, AnimatePresence } from 'framer-motion';
import type { CardData } from '../types';
import { KEYWORD_DB } from '../data/keywords';

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

    // SVG 圆角计算：保持与 CSS rounded-* 类一致
    const borderRadius = isCombat ? 16 : (isBench ? 12 : 8);

    // ==========================================
    // [新增] 终极视觉引擎：同步引爆 + 聚光灯轮播
    // ==========================================
    const [vfxState, setVfxState] = useState<'idle' | 'intro' | 'loop'>('idle');
    const [carouselIndex, setCarouselIndex] = useState(0);

    // 自动收集进攻型词条 (加入 Challenger，使其享受 0.9s 的入场狂欢与常驻轮播)
    const offensiveKeywords = data.keywords.filter(k => k === 'Overwhelm' || k === 'QuickAttack' || k === 'Challenger');
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
            {/* 1. Barrier (屏障) - 动态能量护盾 (向上生长 + 中心宣告 + 破裂爆散) */}
            {/* 利用 AnimatePresence 监听词条。无论是打出还是法术赋予，只要获得屏障，立刻触发华丽展开！ */}
            <AnimatePresence>
                {isOnBoard && data.keywords.includes('Barrier') && KEYWORD_DB['Barrier'] && (
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

            {/* 3. Regeneration FX (再生) */}
            {isOnBoard && data.animState === 'regenerating' && KEYWORD_DB['Regeneration'] && (
                <div className="absolute inset-0 z-[70] pointer-events-none animate-regen-fade">
                    <div className="absolute inset-0 border-4 border-green-500 rounded-2xl shadow-[0_0_30px_#22c55e] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                         <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="50% 150%" className="animate-beam-move opacity-80" />
                    </svg>
                    <div className="absolute top-1/2 left-1/2 w-24 h-24 animate-regen-pop">
                        <img src={KEYWORD_DB['Regeneration'].icon} className="w-full h-full object-contain drop-shadow-[0_0_10px_#22c55e]" />
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
                        alt="Challenge"
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
            {/* [泰坦] 脉冲特效 + 预显示数字 + 黯淡态 */}
            {isOnBoard && data.keywords.includes('Titan') && KEYWORD_DB['Titan'] && (
                <>
                    {!data.depletedKeywords?.includes('Titan') && titanCount !== undefined && titanCount > 0 && (
                        <div className="absolute -top-2 -right-2 z-50 w-6 h-6 rounded-full bg-cyan-600 text-white text-xs font-black flex items-center justify-center border-2 border-slate-900 shadow-lg shadow-cyan-500/50">
                            {titanCount}
                        </div>
                    )}
                    {data.animState === 'buff' && (
                        <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden" style={{ borderRadius }}>
                            <motion.div className="absolute inset-0 bg-gradient-to-t from-cyan-500/30 via-blue-400/10 to-transparent"
                                initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }}
                                transition={{ duration: 0.6, ease: "easeOut" }} />
                            {[0, 1, 2].map(i => (
                                <motion.div key={i} className="absolute inset-0 border-2 border-cyan-400/60 rounded-xl"
                                    initial={{ scale: 0.8, opacity: 0.6 }} animate={{ scale: 1.8, opacity: 0 }}
                                    transition={{ duration: 0.8, delay: i * 0.15 }} />
                            ))}
                            <motion.div className="absolute inset-0 flex items-center justify-center"
                                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 0], scale: [0.5, 1.5, 2.5] }}
                                transition={{ duration: 0.7 }}>
                                <img src={KEYWORD_DB['Titan'].icon} className="w-16 h-16 object-contain drop-shadow-[0_0_30px_rgba(6,182,212,1)]" alt="泰坦脉冲" />
                            </motion.div>
                            {titanCount !== undefined && titanCount > 0 && (
                                <motion.div className="absolute -top-5 left-1/2 -translate-x-1/2 text-cyan-300 font-bold text-lg drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                                    initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: -24 }}
                                    transition={{ duration: 1.2, delay: 0.3 }}>
                                    +{titanCount}
                                </motion.div>
                            )}
                        </div>
                    )}
                    {data.depletedKeywords?.includes('Titan') && (
                        <div className="absolute inset-0 z-20 pointer-events-none" style={{ borderRadius }}>
                            <div className="absolute inset-0 bg-gradient-to-br from-slate-700/20 to-slate-800/10 rounded-xl" />
                            <div className="absolute inset-0 border-2 border-slate-600/40 rounded-xl box-border" />
                            <div className="absolute bottom-1 left-1.5 text-[8px] text-slate-500/60 font-medium">黯淡</div>
                        </div>
                    )}
                </>
            )}

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