import React from 'react';
// [新增] 引入 motion 用于中心图标的缩放动画
import { motion } from 'framer-motion';
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
    isBlocking = false
}) => {
    // 辅助计算
    const isOnBoard = location === 'bench' || location === 'combat' || location === 'enemy_bench';
    const isCombat = location === 'combat';
    const isBench = location === 'bench' || location === 'enemy_bench';

    // SVG 圆角计算：保持与 CSS rounded-* 类一致
    const borderRadius = isCombat ? 16 : (isBench ? 12 : 8);

    return (
        <>
            {/* 1. Barrier (屏障) - [清理] 移除了挡脸的中心大图标，仅保留环境光效 */}
            {isOnBoard && data.keywords.includes('Barrier') && (
                <>
                    <div className="absolute inset-0 border-4 border-yellow-300 rounded-lg z-20 pointer-events-none box-border shadow-[0_0_20px_rgba(253,224,71,0.5)]"></div>
                    <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="40% 160%" className="animate-beam-move opacity-80 filter drop-shadow-[0_0_5px_white]" />
                    </svg>
                </>
            )}

            {/* 2. Elusive (隐秘) - [清理] 移除了挡脸的中心大图标，仅保留环境光效 */}
            {isOnBoard && data.keywords.includes('Elusive') && (
                <>
                    <div className="absolute inset-0 border-4 border-orange-400/60 rounded-lg animate-pulse z-20 pointer-events-none shadow-[0_0_20px_rgba(251,146,60,0.3)] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="40% 160%" className="animate-beam-move opacity-60 filter drop-shadow-[0_0_3px_white]" />
                    </svg>
                </>
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

            {/* 5. Overwhelm FX (碾压) - [修复朝向] */}
            {isCombat && !isBlocker && data.keywords.includes('Overwhelm') && (
                <div className="absolute inset-0 z-30 pointer-events-none text-red-600">
                    {/* A. 红色呼吸边框 (保持不变) */}
                    <motion.div
                        className="absolute inset-0 border-4 border-red-600 rounded-xl box-border shadow-[0_0_30px_rgba(220,38,38,0.8)]"
                        animate={{ opacity: [0, 1, 0.3, 0] }}
                        transition={{ duration: 1.3, times: [0, 0.1, 0.6, 1], repeat: Infinity, ease: "easeOut" }}
                    ></motion.div>

                    {/* B. 白色流光 (保持不变) */}
                    <motion.div
                        className="absolute inset-0 w-full h-full overflow-visible z-10"
                        animate={{ opacity: [0, 1, 0.3, 0] }}
                        transition={{ duration: 1.3, times: [0, 0.1, 0.6, 1], repeat: Infinity, ease: "easeOut" }}
                    >
                        <svg className="w-full h-full overflow-visible">
                            <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray="40% 160%" className="animate-beam-move drop-shadow-[0_0_8px_white]" />
                        </svg>
                    </motion.div>

                    {/* C. 红色尖刺 - [修改] 修复位置逻辑 */}
                    {/* isEnemyCombatant = true (敌方): 位于上方，尖刺应朝下 (rotate-180), 位置 bottom: -X
                        isEnemyCombatant = false (我方): 位于下方，尖刺应朝上 (rotate-0), 位置 top: -X

                        修正：之前的逻辑写反了或者 rotate 没生效。
                        这里我们显式指定 style。
                    */}
                    <motion.div
                        className={`absolute w-[90%] left-[5%] h-6 flex justify-between z-0`}
                        style={{
                            // 如果是敌人(在上面)，尖刺应该出现在卡牌下方，并且朝下 (倒三角)
                            // 如果是我方(在下面)，尖刺应该出现在卡牌上方，并且朝上 (正三角)
                            bottom: isEnemyCombatant ? '-24px' : 'auto',
                            top: isEnemyCombatant ? 'auto' : '-24px',
                            transform: isEnemyCombatant ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}
                        animate={{ opacity: [0, 1, 0.3, 0], scale: [0.8, 1.1, 1, 0.8] }}
                        transition={{ duration: 1.3, times: [0, 0.1, 0.6, 1], repeat: Infinity, ease: "easeOut" }}
                    >
                        <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full fill-red-600 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">
                            <polygon points="0,20 10,0 20,20 30,0 40,20 50,0 60,20 70,0 80,20 90,0 100,20" />
                        </svg>
                    </motion.div>

                    {/* [清理] 移除了巨大且挡脸的中心图标，发光逻辑已下放至底部智能卡槽 */}
                </div>
            )}

            {/* 5. QuickAttack FX (先攻) - [清理] 移除了中心大图标，保留闪电边框 */}
            {isCombat && !isBlocker && data.keywords.includes('QuickAttack') && (
                <div className="absolute inset-0 z-30 pointer-events-none">
                    <div className="absolute inset-0 border-4 border-blue-500 rounded-2xl shadow-[0_0_20px_#3b82f6] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="20% 180%" className="animate-quick-beam opacity-90" />
                    </svg>
                </div>
            )}

            {/* 6. Challenger FX (挑战者 - 主动) */}
            {isOnBoard && data.keywords.includes('Challenger') && onChallengerClick && KEYWORD_DB['Challenger'] && (
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] cursor-pointer w-20 h-20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 ${isCombat ? 'block' : 'hidden'}`}
                    onClick={(e) => { e.stopPropagation(); onChallengerClick(); }}
                >
                    <img
                        src={KEYWORD_DB['Challenger'].icon}
                        alt="Challenge"
                        className={`w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] ${isChallengerActive ? 'animate-pulse brightness-150 scale-110' : 'opacity-90 hover:opacity-100'}`}
                    />
                </div>
            )}

            {/* 7. Challenger Target FX (被挑战目标) */}
            {canBeChallenged && (
                <>
                    <div className="absolute inset-0 border-4 border-orange-500 rounded-xl animate-pulse z-50 pointer-events-none shadow-[0_0_30px_orange] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full z-50 pointer-events-none overflow-visible">
                        <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="3" strokeDasharray="30% 170%" className="animate-beam-move opacity-100" />
                    </svg>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 animate-ping opacity-75 pointer-events-none">
                        {KEYWORD_DB['Challenger'] && <img src={KEYWORD_DB['Challenger'].icon} className="w-16 h-16 object-contain" />}
                    </div>
                </>
            )}

            {/* 4. CantBlock FX (无法格挡) */}
            {isOnBoard && data.keywords.includes('CantBlock') && highlightTarget && isBlocking && KEYWORD_DB['CantBlock'] && (
                <div className="absolute inset-0 z-30 pointer-events-none">

                    {/* A. 银色常亮边框 (保持不变) */}
                    <div className="absolute inset-0 border-4 border-gray-300 rounded-xl box-border shadow-[0_0_15px_rgba(209,213,219,0.5)] opacity-90"></div>

                    {/* B. 被锁住的白色流光 (保持不变) */}
                    <svg className="absolute inset-0 w-full h-full overflow-visible z-10">
                        <motion.rect
                            x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)"
                            rx={borderRadius} ry={borderRadius}
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray="15% 85%"
                            strokeDashoffset={0}
                            animate={{
                                strokeDashoffset: [0, 0, 10, -10, 5, -5, 0, 0]
                            }}
                            transition={{
                                duration: 2.5,
                                times: [0, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1],
                                repeat: Infinity,
                                ease: "linear"
                            }}
                            className="drop-shadow-[0_0_8px_white]"
                        />
                    </svg>

                    {/* [清理] 移除了巨大的中心禁止图标，保留了银色锁链边框即可清楚表达无法格挡的意思 */}
                </div>
            )}

            {isChallengedTarget && (
                <>
                    <div className="absolute inset-0 border-4 border-orange-600 rounded-2xl z-40 pointer-events-none shadow-[0_0_20px_rgba(234,88,12,0.6)] box-border"></div>
                    <svg className="absolute inset-0 w-full h-full z-40 pointer-events-none overflow-visible">
                         <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx={borderRadius} ry={borderRadius} fill="none" stroke="white" strokeWidth="2" strokeDasharray="50% 150%" className="animate-beam-move opacity-80" />
                    </svg>
                </>
            )}
        </>
    );
};