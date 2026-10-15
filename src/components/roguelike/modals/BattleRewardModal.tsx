// ==========================================
// 悖论迷宫 · 战斗胜利奖励弹窗（[2026-08-15] 三选一：金币 + 从 3 张候选卡中选 1 张加入牌组）
// [2026-08-25] 界面重做对齐迷宫强化（NodeEventModal enhance 校准式全屏开放式，程拍板）：
//   ① 无边框全屏开放式（去窗口白边框）
//   ② 奖励卡牌渲染为手牌样式（复用 Card location="hand"，非卡图）
//   ③ 单选选中上浮/金色光晕 + 底部居中「确定」按钮（不再每张卡下方一个"选择这张"）
// ==========================================
import React, { useState, useEffect } from 'react';
import { eventBus, GameEvents } from '../../../utils/eventBus'; // [2026-10-14 莉莉子] 交互音效
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';
import { CARD_DB } from '../../../data/cards';
import type { CardData } from '../../../types';
import { attachEquipment } from '../../../data/equipment';
import type { RewardCardOption } from '../../../data/roguelike/rewards';
import { Card } from '../../Card';
import { PackOpenModal } from '../PackOpenModal'; // [2026-09-04] 完整滚轮开箱演出
import { ConfirmDialog } from '../ConfirmDialog'; // [2026-10-08 交互回响层 批次2] 通用二次确认（跳过奖励）
import type { ChestInstance } from '../../../data/roguelike/divinityShards'; // [2026-09-29 程拍板] 奖励匣
// [2026-10-03 莉莉子] 多卡/多强化并排的**统一间距口径**（唯一出口，见该文件头注释）
import { GAP_HAND_TILTED } from '../uiSpacing';

// ==========================================
// 手牌样式卡牌缩放（程调整处）：放大倍数
//   1 = 原尺寸（130×202）；>1 放大，<1 缩小
//   改完这个数字卡牌整体跟着放大/缩小
//   若放大后三张卡太挤，可同步微调下方 gap-6
// ==========================================
const HAND_CARD_SCALE = 2;

interface BattleRewardModalProps {
    gold: number;
    options: RewardCardOption[];
    onPick: (cardKey: string, equipId?: string) => void;
    onSkip?: () => void; // [2026-08-29] 跳过卡牌奖励（只拿金币）
    onRefresh?: () => void; // [2026-08-29] 刷新三选一（消耗刷新次数）
    refreshCount?: number;  // [2026-08-29] 剩余刷新次数
    pendingPacks?: number;  // [2026-08-29] 胜利附带待打开卡包
    onOpenPack?: () => ChestInstance | null; // [2026-09-29 程拍板] 开包 → 抽到一个奖励匣（原为返回武装 id）
}

export const BattleRewardModal: React.FC<BattleRewardModalProps> = ({ gold, options, onPick, onSkip, onRefresh, refreshCount = 0, pendingPacks = 0, onOpenPack }) => {
    // [2026-08-25] 单选选中态：点卡选中，底部确定生效
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    // [2026-09-04] 卡包开箱弹窗（内嵌完整滚轮演出）
    const [packOpen, setPackOpen] = useState(false);
    // [2026-08-25] 对齐迷宫强化三态动画：enter（升入）→ select（可交互）→ exit（确认后退出）
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');
    // [2026-10-08 莉莉子 · 交互回响层 批次2] 「跳过」= 放弃整张卡加入牌组的机会 ⇒ 二次确认
    const [confirmSkip, setConfirmSkip] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    const handleConfirm = () => {
        if (!selectedKey) return;
        const picked = options.find(o => o.cardKey === selectedKey);
        setAnimPhase('exit');
        setTimeout(() => {
            onPick(selectedKey, picked?.equipId); // [2026-08-25] 透传随机佩戴的装备
        }, 500);
    };
    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                {/* 全屏点击拦截层（无边框，对齐迷宫强化界面） */}
                <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                {/* 顶部标题 */}
                {animPhase === 'select' && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        className="absolute top-[16%] left-0 right-0 w-full text-center pointer-events-auto"
                    >
                        <div className="flex items-center justify-center gap-3 mb-1">
                            <Sparkles size={34} className="text-yellow-400" />
                            <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">战斗胜利</h2>
                        </div>
                        <div className="flex items-center justify-center gap-3 text-amber-300 font-bold mt-2 text-lg">
                            <span className="flex items-center gap-2"><Coins size={18} /> +{gold} 金币</span>
                            {/* [2026-08-29] 正常战斗胜利附带一次抽卡包机会 */}
                            {onOpenPack && pendingPacks > 0 && (
                                <button
                                    onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setPackOpen(true); }}
                                    disabled={packOpen}
                                    className="ml-2 px-4 py-1.5 rounded-full bg-purple-600/30 border border-purple-400/50 text-purple-200 hover:bg-purple-600/50 transition-all disabled:opacity-50"
                                >
                                    🎁 打开卡包 ×{pendingPacks}
                                </button>
                            )}
                        </div>
                        <p className="text-yellow-200 mt-2 font-mono text-sm tracking-[0.2em] opacity-80">CHOOSE A REWARD CARD · 选择一张卡加入牌组</p>
                    </motion.div>
                )}

                {/* 卡牌区域：手牌样式并排 + 每张带角度 + 从下方升入 */}
                <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '63px' }}>
                    {/* [2026-10-03 莉莉子 BUG修复] 原来写死 gap-6(24px)：本行卡既**倾斜 ±9°**（包围盒宽 +47px）
                        又带**右侧外挂的装备图标**（1.55 倍放大后外扩 ~48px）⇒ 相邻卡互相压角/压图标。
                        间距改取 uiSpacing 口径（取两者较大者 + 呼吸位） */}
                    <div className="flex" style={{ gap: GAP_HAND_TILTED }}>
                        {options.length > 0 ? (
                            <AnimatePresence>
                                {options.map((o, index) => {
                                    const card = CARD_DB[o.cardKey] as CardData | undefined;
                                    if (!card) return null;
                                    const isSelected = selectedKey === o.cardKey;
                                    const angle = (index - (options.length - 1) / 2) * 9; // 中心向两侧倾斜
                                    const variants: Variants = {
                                        enter: {
                                            x: 0, y: 60, scale: 0.4, rotate: angle, opacity: 0,
                                            transition: { delay: index * 0.1, duration: 0.6, type: 'spring', damping: 18 },
                                        },
                                        select: {
                                            x: 0, y: isSelected ? -50 : 0,
                                            scale: isSelected ? 1.0 : 0.88,
                                            rotate: isSelected ? 0 : angle,
                                            opacity: 1,
                                            transition: { type: 'spring', stiffness: 300 },
                                        },
                                        exit: {
                                            x: 0, y: 80, scale: 0.3, opacity: 0, rotate: angle * 2,
                                            transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.06 },
                                        },
                                    };
                                    return (
                                        <motion.div
                                            key={o.cardKey}
                                            className="relative flex flex-col items-center cursor-pointer"
                                            variants={variants}
                                            initial="enter"
                                            animate={animPhase}
                                            exit="exit"
                                            onClick={() => { if (animPhase === 'select') { eventBus.emit(GameEvents.SFX_SELECT_UNIT); setSelectedKey(o.cardKey); } }}
                                        >
                                            {/* 选中金色光晕 */}
                                            {isSelected && animPhase === 'select' && (
                                                <div className="absolute -inset-2 rounded-lg border-4 border-yellow-400 shadow-[0_0_25px_#eab308] z-0" />
                                            )}
                                            <div className="relative z-10 origin-bottom">
                                                {/* 手牌样式卡牌（费用/卡名/攻血，非卡图）；缩放由顶部 HAND_CARD_SCALE 控制
                                                    [2026-08-25] 带装备时 attachEquipment 渲染最终形态（pips 品质色自动显示）
                                                    [2026-08-29] 不再在卡牌下方标注装备名/「无装备」——玩家自己看卡面（程拍板） */}
                                                <div style={{ width: 130 * HAND_CARD_SCALE, height: 202 * HAND_CARD_SCALE }}>
                                                    <div style={{ transform: `scale(${HAND_CARD_SCALE})`, transformOrigin: 'top left' }}>
                                                        {/* [2026-10-10 程拍板 ②] **牌组里已有的装备 + 本次新增的**一起挂上去渲染 ——
                                                            程：「看到的应该是这张卡牌既有装备 A 又有新增装备 B，而不是只有 B」。
                                                            ⚠️ 领取端本来就对（装备按卡 key 存、`addEquippedCard` 是**追加**）⇒ 这里补的是**展示口径**。 */}
                                                        <Card
                                                            data={[...(o.existingEquipIds ?? []), ...(o.equipId ? [o.equipId] : [])]
                                                                .reduce((c, id) => attachEquipment(c, id), card)}
                                                            location="hand"
                                                            isFaceUp={true}
                                                            skinId={0}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        ) : (
                            <p className="text-gray-400 text-sm">无可选卡牌奖励</p>
                        )}
                    </div>
                </div>

                {/* 底部：刷新（确定左）+ 确定（选中卡牌后生效）+ 跳过（右） */}
                {animPhase === 'select' && options.length > 0 && (
                    <div className="absolute bottom-[10%] left-0 right-0 z-30 flex justify-center gap-4">
                        {onRefresh && (
                            <motion.button
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                onClick={(e) => { e.stopPropagation(); if (refreshCount > 0) { eventBus.emit(GameEvents.UI_CLICK); onRefresh(); } }}
                                disabled={refreshCount <= 0}
                                className={`px-8 py-3 rounded-xl bg-white/10 font-black text-lg tracking-widest transition-all hover:scale-105 ${refreshCount > 0 ? 'text-cyan-300 hover:bg-cyan-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                            >
                                刷新({refreshCount})
                            </motion.button>
                        )}
                        <motion.button
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); handleConfirm(); }}
                            disabled={!selectedKey}
                            className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                ${selectedKey
                                    ? 'bg-gradient-to-r from-yellow-600 to-amber-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                                    : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                        >
                            确定
                        </motion.button>
                        {onSkip && (
                            <motion.button
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setConfirmSkip(true); }}
                                className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-black text-lg tracking-widest text-gray-300 transition-all hover:scale-105"
                            >
                                跳过
                            </motion.button>
                        )}
                    </div>
                )}

                {/* [2026-09-04] 卡包开启演出：完整滚轮（转盘待命 + 六边形 + 定格详情弹窗）
                    [2026-10-02 莉莉子] 注释里的「悬停检视」已在 09-29 匣子化改造中移除，此处同步修正（功能不恢复）。
                    抽到的匣子会在详情弹窗里提示「已存入待打开匣子」，开启入口见局中右上角「评估嘉勉」。 */}
                <PackOpenModal
                    isOpen={packOpen}
                    pendingPacks={pendingPacks}
                    onOpenPack={() => onOpenPack?.() ?? null}
                    onClose={() => setPackOpen(false)}
                />

                {/* [2026-10-08 莉莉子 · 交互回响层 批次2] 跳过奖励二次确认 */}
                {confirmSkip && (
                    <ConfirmDialog
                        title="确定跳过卡牌奖励？"
                        desc="本次战斗的金币照常入账，但三张候选卡将全部放弃。"
                        notes={['放弃一张卡加入牌组的机会']}
                        confirmLabel="确认跳过"
                        tone="danger"
                        onConfirm={() => { setConfirmSkip(false); onSkip?.(); }}
                        onCancel={() => setConfirmSkip(false)}
                    />
                )}
            </div>
        </AnimatePresence>
    );
};
