import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Shield, Palette, Layout, AlertTriangle, Target } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { eventBus, GameEvents } from '../utils/eventBus';

// 例如: "hero:lyfe", "cardBack:1", "desk:2"

interface GachaTargetSelectorProps {
    currentTarget: string | null; // 当前已定轨的目标 (如果有)
    onConfirm: (target: string) => void;
    onClose: () => void;
}

type TabType = 'hero' | 'cardBack' | 'desk';

export const GachaTargetSelector: React.FC<GachaTargetSelectorProps> = ({
    currentTarget,
    onConfirm,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('hero');
    const [selectedId, setSelectedId] = useState<string | null>(currentTarget);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // --- 1. 数据准备 ---
    const data = useMemo(() => {
        // A. 英雄列表
        const heroes = Object.values(CARD_DB)
            .filter(c => c.isChampion)
            .map(c => ({
                id: `hero:${c.key}`,
                name: c.name,
                image: c.imageUrl, // 使用立绘
                type: 'hero' as const
            }));

        // B. 卡背列表 (跳过默认的 index 0)
        const cardBacks = PERSONALIZATION_ASSETS.cardBacks
            .map((img, idx) => ({
                id: `cardBack:${idx}`,
                name: `Card Style #${idx + 1}`,
                image: img,
                type: 'cardBack' as const,
                idx
            }))
            .filter(item => item.idx > 0); // 排除默认

        // C. 牌桌列表 (跳过默认的 index 0)
        const desks = PERSONALIZATION_ASSETS.desks
            .map((img, idx) => ({
                id: `desk:${idx}`,
                name: `Battlefield #${idx + 1}`,
                image: img,
                type: 'desk' as const,
                idx
            }))
            .filter(item => item.idx > 0); // 排除默认

        return { hero: heroes, cardBack: cardBacks, desk: desks };
    }, []);

    // 获取当前选中的物品详情 (用于展示确认弹窗)
    const selectedItemDetail = useMemo(() => {
        if (!selectedId) return null;
        const [type] = selectedId.split(':');
        const list = data[type as TabType];
        return list.find(i => i.id === selectedId);
    }, [selectedId, data]);

    // 处理最终确认
    const handleFinalConfirm = () => {
        if (selectedId) {
            eventBus.emit(GameEvents.UI_CLICK);
            onConfirm(selectedId);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-8">

            {/* 主面板 */}
            <div className="relative w-full max-w-5xl h-[80vh] bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden">

                {/* 1. 顶部标题栏 */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                            <Target className="text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-widest italic">定向共鸣</h2>
                            <p className="text-xs text-yellow-500/80 font-mono">随时更换你想要的稀有奖励</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭音效
                            onClose();
                        }}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* 2. 内容区域 (左右布局) */}
                <div className="flex flex-1 overflow-hidden">

                    {/* 左侧：分类 Tabs */}
                    <div className="w-64 bg-black/20 border-r border-white/5 flex flex-col py-6 gap-2">
                        <TabButton
                            isActive={activeTab === 'hero'}
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增]
                                setActiveTab('hero');
                            }}
                            icon={<Shield size={18} />}
                            label="天启者"
                        />
                        <TabButton
                            isActive={activeTab === 'cardBack'}
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增]
                                setActiveTab('cardBack');
                            }}
                            icon={<Palette size={18} />}
                            label="卡背"
                        />
                        <TabButton
                            isActive={activeTab === 'desk'}
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_CLICK); // [新增]
                                setActiveTab('desk');
                            }}
                            icon={<Layout size={18} />}
                            label="牌桌"
                        />
                    </div>

                    {/* 右侧：网格列表 */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-gradient-to-b from-slate-900 to-black">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {data[activeTab].map((item) => {
                                const isSelected = selectedId === item.id;
                                const isCurrentTarget = currentTarget === item.id;

                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK); // [新增] 选中音效
                                            setSelectedId(item.id);
                                        }}
                                        className={`
                                            relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300
                                            ${activeTab === 'hero' ? 'aspect-[3/4]' : (activeTab === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video')}
                                            ${isSelected
                                                ? 'border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)] scale-105 z-10'
                                                : 'border-white/10 hover:border-white/30 hover:scale-105 opacity-80 hover:opacity-100'
                                            }
                                        `}
                                    >
                                        <img src={item.image} className="w-full h-full object-cover" alt={item.name} />

                                        {/* 遮罩与名字 */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-3">
                                            <div className={`text-sm font-bold truncate ${isSelected ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                {item.name}
                                            </div>
                                        </div>

                                        {/* 选中标记 */}
                                        {isSelected && (
                                            <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center shadow-lg">
                                                <Check size={14} className="text-black stroke-[4]" />
                                            </div>
                                        )}

                                        {/* 当前正在生效的定轨标记 */}
                                        {isCurrentTarget && (
                                            <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600/90 text-white text-[10px] font-black tracking-wider rounded border border-blue-400 shadow-lg">
                                                当前选择
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 3. 底部确认栏 */}
                <div className="px-8 py-4 border-t border-white/10 bg-white/5 flex justify-end items-center gap-4">
                    <div className="text-gray-400 text-sm mr-auto">
                        * 选中后100次抽取内必定掉落.
                    </div>
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK); // [新增]
                            onClose();
                        }}
                        className="px-6 py-2 rounded-full border border-white/20 text-gray-300 hover:bg-white/10 transition-colors font-bold text-sm"
                    >
                        取消
                    </button>
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增]
                            setShowConfirmModal(true);
                        }}
                        disabled={!selectedId || selectedId === currentTarget}
                        className={`
                            px-8 py-2 rounded-full font-black tracking-widest text-sm transition-all flex items-center gap-2
                            ${(!selectedId || selectedId === currentTarget)
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-[0_0_20px_rgba(234,179,8,0.4)]'
                            }
                        `}
                    >
                        确认
                    </button>
                </div>
            </div>

            {/* --- 二次确认弹窗 --- */}
            <AnimatePresence>
                {showConfirmModal && selectedItemDetail && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[800] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK); // [新增] 点击背景关闭
                            setShowConfirmModal(false);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            className="w-[400px] bg-slate-900 border border-yellow-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center"
                        >
                            <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mb-4 border border-yellow-500/20">
                                <AlertTriangle size={32} className="text-yellow-500" />
                            </div>

                            <h3 className="text-xl font-black text-white mb-2">确认您的选择?</h3>
                            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                                您确定要定向选择：（可以随时更换定向共鸣）
                                <br/>
                                <span className="text-yellow-400 font-bold text-lg block mt-2">{selectedItemDetail.name}</span>
                            </p>

                            <div className="w-full h-32 rounded-lg overflow-hidden border border-white/10 mb-6 bg-black">
                                <img src={selectedItemDetail.image} className="w-full h-full object-cover opacity-80" alt="Preview" />
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => {
                                        eventBus.emit(GameEvents.UI_BACK); // [新增]
                                        setShowConfirmModal(false);
                                    }}
                                    className="flex-1 py-3 rounded-lg border border-white/10 hover:bg-white/5 text-gray-300 font-bold transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleFinalConfirm}
                                    className="flex-1 py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-black transition-colors"
                                >
                                    确认
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

// 子组件：左侧 Tab 按钮
const TabButton = ({ isActive, onClick, icon, label }: { isActive: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button
        onClick={onClick}
        className={`
            w-full px-6 py-4 flex items-center gap-4 transition-all duration-200 border-l-4
            ${isActive
                ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border-yellow-500 text-yellow-400'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }
        `}
    >
        {icon}
        <span className="font-bold tracking-widest text-sm">{label}</span>
    </button>
);