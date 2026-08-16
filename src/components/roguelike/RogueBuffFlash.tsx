// ==========================================
// 悖论迷宫 · 迷宫强化触发闪烁
// [2026-08-11 莉莉子 程要求] 任意战斗型迷宫强化触发时，
//   在我方水晶处快速淡入淡出闪烁一下该强化的卡面图。
//   监听 eventBus ROGUE_BUFF_FLASH（逻辑层触发点 emit），
//   framer-motion 播 fade-in → 短暂停留 → fade-out（约 700ms），结束后卸载。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { eventBus, GameEvents } from '../../utils/eventBus';

interface FlashItem { id: number; icon: string; name: string; }

export const RogueBuffFlash: React.FC = () => {
    const [flashes, setFlashes] = useState<FlashItem[]>([]);
    const seq = useRef(0);

    useEffect(() => {
        const handler = (payload: { icon: string; name: string }) => {
            const id = ++seq.current;
            setFlashes(prev => [...prev, { id, icon: payload.icon, name: payload.name }]);
            setTimeout(() => {
                setFlashes(prev => prev.filter(f => f.id !== id));
            }, 700);
        };
        eventBus.on(GameEvents.ROGUE_BUFF_FLASH, handler);
        return () => { eventBus.off(GameEvents.ROGUE_BUFF_FLASH, handler); };
    }, []);

    // 我方水晶位置（与 GameSession nexus_player 一致：bottom-[33.5%] left-[5%]）
    return (
        <div className="pointer-events-none absolute bottom-[33.5%] left-[5%] z-[160] flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
            <AnimatePresence>
                {flashes.map(f => (
                    <motion.div
                        key={f.id}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.05, 0.9] }}
                        transition={{ duration: 0.7, times: [0, 0.2, 0.72, 1], ease: 'easeInOut' }}
                        className="w-28 h-28 rounded-full overflow-hidden border-[3px] border-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.75)] bg-black"
                    >
                        <img src={f.icon} alt={f.name} className="w-full h-full object-cover" />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
