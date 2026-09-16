// ==========================================
// 悖论迷宫 · 迷宫强化触发闪烁
// [2026-08-11 莉莉子 程要求] 任意战斗型迷宫强化触发时，
//   在我方水晶处快速淡入淡出闪烁一下该强化的卡面图。
//   监听 eventBus ROGUE_BUFF_FLASH（逻辑层触发点 emit），
//   framer-motion 播 fade-in → 短暂停留 → fade-out（时长见 FLASH_DURATION），结束后卸载。
// [2026-08-25] 闪烁时长 / 位置 / 图标尺寸全部暴露为常量（程调整处）
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { eventBus, GameEvents } from '../../utils/eventBus';

interface FlashItem { id: number; icon: string; name: string; }

// ═══════════════════════════════════════════════
// 闪烁微调参数（程调整处）
// ═══════════════════════════════════════════════
/** 闪烁总时长（ms）。原 700，程反馈消失太快 → 默认提到 900 */
const FLASH_DURATION = 900;
/** 闪烁位置（与 GameSession 我方水晶 nexus_player 对齐：bottom 33.5% / left 5%） */
const FLASH_POS = { left: '5%', bottom: '33.5%' };
/** 闪烁图标直径（px）。原 w-28 h-28 = 112 */
const FLASH_SIZE = 112;

export const RogueBuffFlash: React.FC = () => {
    // [2026-09-09 莉莉子 重构] 改为时间串行队列：同一时刻只闪一个图标，其余进队等待，
    // 一个播完（FLASH_DURATION）再播下一个 → 图标"先后闪动"，杜绝多图标并列挤压。
    const [current, setCurrent] = useState<FlashItem | null>(null);
    const [queue, setQueue] = useState<FlashItem[]>([]);
    const seq = useRef(0);

    useEffect(() => {
        const handler = (payload: { icon: string; name: string }) => {
            const id = ++seq.current;
            setQueue(q => [...q, { id, icon: payload.icon, name: payload.name }]);
        };
        eventBus.on(GameEvents.ROGUE_BUFF_FLASH, handler);
        return () => { eventBus.off(GameEvents.ROGUE_BUFF_FLASH, handler); };
    }, []);

    // 队头出队播放：当前空闲且有排队时才取下一个
    useEffect(() => {
        if (current) return;
        if (queue.length === 0) return;
        setCurrent(queue[0]);
        setQueue(q => q.slice(1));
    }, [queue, current]);

    // 播完当前 → 置空，让下一个自动上台
    useEffect(() => {
        if (!current) return;
        const timer = setTimeout(() => setCurrent(null), FLASH_DURATION);
        return () => clearTimeout(timer);
    }, [current]);

    // 位置由 FLASH_POS 控制（默认与我方水晶 nexus_player 对齐）
    return (
        <div
            className="pointer-events-none absolute z-[160] flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
            style={{ left: FLASH_POS.left, bottom: FLASH_POS.bottom }}
        >
            <AnimatePresence>
                {current && (
                    <motion.div
                        key={current.id}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1.05, 0.9] }}
                        transition={{ duration: FLASH_DURATION / 1000, times: [0, 0.2, 0.72, 1], ease: 'easeInOut' }}
                        className="rounded-full overflow-hidden border-[3px] border-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.75)] bg-black"
                        style={{ width: FLASH_SIZE, height: FLASH_SIZE }}
                    >
                        <img src={current.icon} alt={current.name} className="w-full h-full object-cover" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
