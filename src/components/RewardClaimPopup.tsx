// ==========================================
// 共享「奖励领取成功」金光弹窗
// [2026-09-09 莉莉子] 从 MissionUI 抽出，供主大厅军需面板与肉鸽委派面板复用：
//   - 主大厅 MissionPanel 领取任务奖励后弹（原内联实现，现改用本组件，视觉不变）
//   - 肉鸽 RogueMissionPanel 领取委派奖励后弹（此前缺失，现对齐主大厅体验）
// 奖励类型：数据金 / 卡牌 / 武装 / 皮肤 / 卡背 / 分析员经验
// ==========================================
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Sparkles } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { CURRENCY_ICONS, getSkinImage, PERSONALIZATION_ASSETS, HERO_IMAGES } from '../data/imageData';
import { getMissionItems } from '../data/skinData';
import { getEquipmentById } from '../data/equipment';
import type { MissionRewardType } from '../data/missionData';

// ==========================================
// 弹窗数据结构
// ==========================================
export interface RewardPopupData {
    title: string;
    type: MissionRewardType;
    amount?: number;
    imageSrc?: string;
    itemName?: string;
    cards?: Array<{ imageSrc: string; name: string; count: number }>;
}

/** 卡牌奖励封面：英雄立绘 / 皮肤 / 单位图 */
export function getCardRewardImage(cardKey: string): string {
    const skin = getSkinImage(cardKey);
    if (skin) return skin;
    const hero = HERO_IMAGES[cardKey];
    if (hero?.base) return hero.base;
    return '';
}

export interface MissionRewardShape {
    type: MissionRewardType;
    amount?: number;
    cosmeticId?: string;
    cardKeys?: string[];
    armamentId?: string;
}

/** 由任务标题 + 奖励配方组装弹窗数据（两面板领取时共用） */
export const buildRewardPopupData = (title: string, reward: MissionRewardShape): RewardPopupData => {
    const popup: RewardPopupData = { title, type: reward.type };
    if (reward.type === 'dataGold' && reward.amount) {
        popup.amount = reward.amount;
    } else if (reward.type === 'card' && reward.cardKeys) {
        popup.cards = reward.cardKeys.map((cardKey: string) => {
            const imageSrc = getCardRewardImage(cardKey);
            const cardDef = CARD_DB[cardKey];
            return { imageSrc, name: cardDef?.name || cardKey, count: 1 };
        });
    } else if (reward.type === 'skin' || reward.type === 'cardBack') {
        const config = getMissionItems().find(item => item.missionId === reward.cosmeticId);
        if (config) {
            popup.itemName = config.name;
            if (config.type === 'skin' && config.cardKey && config.skinId !== undefined) {
                popup.imageSrc = getSkinImage(config.cardKey, config.skinId);
            } else if (config.type === 'cardBack' && config.index !== undefined) {
                popup.imageSrc = PERSONALIZATION_ASSETS.cardBacks[config.index];
            }
        }
    } else if (reward.type === 'armament' && reward.armamentId) {
        const armDef = getEquipmentById(reward.armamentId);
        popup.imageSrc = armDef?.icon ?? '';
        popup.itemName = armDef?.name ?? '武装';
        popup.amount = reward.amount ?? 1;
    } else if (reward.type === 'analystExp') {
        popup.amount = reward.amount;
    }
    return popup;
};

// ==========================================
// 弹窗本体（原 MissionUI 金光弹窗原样迁移，仅供主大厅/肉鸽复用）
// ==========================================
export const RewardClaimPopup: React.FC<{ data: RewardPopupData; onClose: () => void }> = ({ data, onClose }) => (
    <AnimatePresence>
        <motion.div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            {/* 金光光晕 */}
            <div className="absolute w-[500px] h-[500px] rounded-full bg-gradient-radial from-yellow-500/25 via-yellow-500/10 to-transparent pointer-events-none" />

            <motion.div
                className="relative flex flex-col items-center"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                onClick={e => e.stopPropagation()}
            >
                {/* 标题 */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="text-center mb-6"
                >
                    <span className="text-3xl font-black text-yellow-400 tracking-widest drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                        奖励领取成功
                    </span>
                </motion.div>

                {/* 奖励展示 */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="bg-slate-900/90 border border-yellow-500/30 rounded-2xl p-8 shadow-2xl"
                >
                    {data.type === 'dataGold' ? (
                        <div className="flex flex-col items-center gap-4 px-8">
                            <img src={CURRENCY_ICONS.dataGold} className="w-20 h-20" alt="dataGold" />
                            <span className="text-5xl font-black text-purple-300">+{data.amount}</span>
                            <span className="text-sm text-gray-400 font-mono tracking-widest">数据金</span>
                        </div>
                    ) : data.type === 'card' && data.cards ? (
                        <div className="flex flex-col items-center gap-4 px-4">
                            <span className="text-3xl font-black text-green-400 tracking-widest drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">
                                ✦ 卡牌解锁 ✦
                            </span>
                            <div className="grid grid-cols-2 gap-3">
                                {data.cards.map((card, i) => (
                                    <div key={i} className="relative w-36 h-48 rounded-xl overflow-hidden border-2 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)] bg-slate-900 group">
                                        <img src={card.imageSrc} className="w-full h-full object-cover" alt={card.name} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                                            <span className="text-[10px] font-bold text-green-300 truncate block">{card.name}</span>
                                        </div>
                                        <div className="absolute top-1 right-1 bg-green-600/90 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-lg">
                                            x{card.count}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <span className="text-xs text-gray-400 font-mono tracking-widest">已加入收藏</span>
                        </div>
                    ) : data.type === 'armament' ? (
                        <div className="flex flex-col items-center gap-4 px-8">
                            <span className="text-3xl font-black text-purple-300 tracking-widest drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">✨ 武装获取 ✨</span>
                            {data.imageSrc ? (
                                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-purple-500/60 shadow-[0_0_25px_rgba(168,85,247,0.35)] bg-slate-900">
                                    <img src={data.imageSrc} className="w-full h-full object-cover" alt={data.itemName} />
                                </div>
                            ) : (
                                <div className="w-20 h-20 rounded-full bg-purple-900/40 flex items-center justify-center border border-purple-400/40"><Gift size={40} className="text-purple-300" /></div>
                            )}
                            <span className="text-2xl font-black text-purple-200">{data.itemName}</span>
                            <span className="text-sm text-amber-300 font-mono tracking-widest">已加入武装库 ×{data.amount ?? 1}</span>
                        </div>
                    ) : data.type === 'analystExp' ? (
                        <div className="flex flex-col items-center gap-4 px-8">
                            <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center border border-amber-400/50">
                                <Sparkles size={40} className="text-amber-300" />
                            </div>
                            <span className="text-5xl font-black text-amber-300">+{data.amount ?? 0}</span>
                            <span className="text-sm text-gray-400 font-mono tracking-widest">分析员经验</span>
                        </div>
                    ) : data.imageSrc ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-64 h-80 rounded-xl overflow-hidden border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.3)]">
                                <img src={data.imageSrc} className="w-full h-full object-cover" />
                            </div>
                            <span className="text-lg font-bold text-yellow-400">{data.itemName || '未知奖励'}</span>
                            <span className="text-xs text-gray-400 font-mono tracking-widest uppercase">
                                {data.type === 'skin' ? '🎨 皮肤已解锁' : '🃏 卡背已解锁'}
                            </span>
                        </div>
                    ) : null}
                </motion.div>

                {/* 确认按钮 */}
                <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    onClick={onClose}
                    className="mt-8 px-10 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all active:scale-95"
                >
                    确 认
                </motion.button>
            </motion.div>
        </motion.div>
    </AnimatePresence>
);
