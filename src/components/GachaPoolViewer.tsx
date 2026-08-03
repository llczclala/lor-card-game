import React, { useMemo } from 'react';
import { X, Database } from 'lucide-react';
import { getPoolViewerData, POOLS, type PoolId } from '../logic/gachaLogic';
import { PERSONALIZATION_ASSETS, getSkinImage } from '../data/imageData';
import { CARD_DB } from '../data/cards';
import { eventBus, GameEvents } from '../utils/eventBus';

interface GachaPoolViewerProps {
    poolId: PoolId;
    onClose: () => void;
}

// 统一图片展示卡（高度固定，宽度按比例自适应）
const ViewItem = ({ image, name, ratio }: { image: string, name: string, ratio: string }) => (
    <div className="group/item shrink-0">
        <div className={`w-40 ${ratio} rounded-lg overflow-hidden border border-white/10 bg-black/40 group-hover/item:border-yellow-500/50 transition-all group-hover/item:scale-105 shadow-lg`}>
            <img src={image} className="w-full h-full object-cover" alt={name} loading="lazy" />
        </div>
        <div className="mt-1.5 w-40 text-center">
            <div className="text-[10px] font-bold text-gray-300 truncate px-1">{name}</div>
        </div>
    </div>
);

const PoolSection = ({ title, rate, color, children }: { title: string, rate: string, color: string, children: React.ReactNode }) => (
    <div className="space-y-4">
        <div className="flex items-center gap-4">
            <span className={`text-2xl font-black tracking-[0.3em] italic ${color}`}>{title}</span>
            <span className={`font-mono text-sm font-bold ${color} bg-white/5 px-4 py-1 rounded-full border border-white/10 shadow-[inset_0_0_12px_rgba(255,255,255,0.05)]`}>{rate}</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-3 pt-1 custom-scrollbar items-start">
            {children}
        </div>
    </div>
);

export const GachaPoolViewer: React.FC<GachaPoolViewerProps> = ({ poolId, onClose }) => {
    const poolConfig = POOLS[poolId];
    const data = useMemo(() => getPoolViewerData(poolId), [poolId]);

    // 皮肤补齐卡牌名
    const skins = useMemo(() => data.skins.map(s => {
        const base = CARD_DB[s.cardKey];
        return {
            key: `${s.cardKey}-${s.skinId}`,
            image: getSkinImage(s.cardKey, s.skinId, base?.imageUrl),
            name: base ? `${base.name.replace(/\n/g, '')} · 皮肤` : '皮肤',
        };
    }), [data.skins]);

    return (
        <div
            className="fixed inset-0 z-[600] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in p-6"
            onClick={() => {
                eventBus.emit(GameEvents.UI_BACK);
                onClose();
            }}
        >
            <div
                className="w-[92vw] max-w-6xl h-[86vh] bg-slate-900 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-white/10 bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center border border-yellow-500/50">
                            <Database size={20} className="text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-widest italic">卡池内容 · {poolConfig.name}</h2>
                            <p className="text-xs text-gray-400 font-mono">全部以卡面呈现 · 分稀有度一览可抽取奖品</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK);
                            onClose();
                        }}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* 内容滚动区 */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10 bg-gradient-to-b from-slate-900 to-black">
                    {/* ── 传说 2%：天启者 + 卡背 + 牌桌 ── */}
                    <PoolSection title="传说" rate="2.00%" color="text-yellow-400">
                        {data.heroes.map(h => (
                            <ViewItem key={`hero-${h.key}`} image={h.imageUrl} name={h.name.replace(/\n/g, '')} ratio="aspect-[3/4]" />
                        ))}
                        {data.cardBacks.map(cb => (
                            <ViewItem key={`cb-${cb.index}`} image={PERSONALIZATION_ASSETS.cardBacks[cb.index!]} name={cb.name} ratio="aspect-[2/3]" />
                        ))}
                        {data.desks.map(d => (
                            <ViewItem key={`desk-${d.index}`} image={PERSONALIZATION_ASSETS.desks[d.index!]} name={d.name} ratio="aspect-video" />
                        ))}
                    </PoolSection>

                    {/* ── 史诗 4%：皮肤 ── */}
                    <PoolSection title="史诗" rate="4.00%" color="text-purple-400">
                        {skins.map(s => (
                            <ViewItem key={s.key} image={s.image} name={s.name} ratio="aspect-[3/4]" />
                        ))}
                    </PoolSection>

                    {/* ── 稀有 94%：普通卡牌 ── */}
                    <PoolSection title="稀有" rate="94.00%" color="text-blue-400">
                        {data.commons.map(c => (
                            <ViewItem key={`com-${c.key}`} image={c.imageUrl} name={c.name.replace(/\n/g, '')} ratio="aspect-[3/4]" />
                        ))}
                    </PoolSection>
                </div>
            </div>
        </div>
    );
};
