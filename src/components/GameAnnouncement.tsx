import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AnnouncementData {
    id: string;
    mainText: string;
    subText?: string;
    type: 'round' | 'start' | 'phase_hint' | 'none';
    duration?: number; // 控制显示的持续时间，0 表示持久
}

interface GameAnnouncementProps {
    data: AnnouncementData | null;
}

export const GameAnnouncement: React.FC<GameAnnouncementProps> = ({ data }) => {
    return (
        // [修正] 将 z-[800] 改为 z-[100]
        // 确保它位于 换牌层(z-60) 之上，但位于 弹窗层(z-200) 和 结算层(z-400) 之下
        <div className="absolute inset-0 pointer-events-none z-[100] flex items-center justify-center font-sans select-none">
            <AnimatePresence mode="wait">
                {data && (
                    <motion.div
                        key={data.id}
                        className="flex flex-col items-center justify-center text-center relative"

                        // 进出场动画配置
                        initial={{ opacity: 0, scale: 1.2, y: 20 }}
                        animate={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            filter: "blur(0px)"
                        }}
                        exit={{
                            opacity: 0,
                            scale: 1.1,
                            y: -20,
                            filter: "blur(10px)",
                            transition: { duration: 0.3 }
                        }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                        {/* 背景光效 (仅在 Start/Round 类型显示) */}
                        {(data.type === 'start' || data.type === 'round') && (
                            <motion.div
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[150%] bg-black/60 blur-[80px] -z-10 rounded-full"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            />
                        )}

                        {/* 主标题 - 金色渐变史诗感 */}
                        <motion.h1
                            className={`
                                font-black tracking-widest drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]
                                ${data.type === 'phase_hint' ? 'text-6xl' : 'text-9xl'}
                                text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-700
                            `}
                            style={{
                                textShadow: '0 2px 0 #000, 0 5px 10px rgba(0,0,0,0.5)',
                                WebkitTextStroke: '1px rgba(255,215,0,0.3)' // 描边增强质感
                            }}
                        >
                            {data.mainText}
                        </motion.h1>

                        {/* 副标题 / 装饰线 */}
                        {data.subText && (
                            <motion.div
                                className="mt-6 flex items-center gap-6"
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: "auto" }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="h-[2px] w-24 bg-gradient-to-r from-transparent to-yellow-500"></div>
                                <span className="text-2xl font-mono text-yellow-200 tracking-[0.5em] uppercase drop-shadow-md">
                                    {data.subText}
                                </span>
                                <div className="h-[2px] w-24 bg-gradient-to-l from-transparent to-yellow-500"></div>
                            </motion.div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};