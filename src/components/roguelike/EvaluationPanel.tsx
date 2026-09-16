// ==========================================
// 悖论迷宫 · 评估嘉勉——肉鸽通行证面板
// [2026-08-29 莉莉子] 程拍板：评估嘉勉 = 肉鸽通行证（区别于军功任务系统）。
//   固定等级轨道 1~30，每级一个奖励槽（稀有武装 / 卡包 / 迷宫强化解锁 / 数据金）；
//   游玩进度（对局 + 任务）给分析员经验 → 升级解锁对应等级奖励。
//   卡包需手动打开（打开随机获得一个武装）。等级/经验复用 UserProfile.level/exp。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Package, Lock, Gem, Sparkles } from 'lucide-react';
import { ANALYST_LEVEL_REWARDS, ANALYST_MAX_LEVEL, getAnalystExpToNext } from '../../data/roguelike/analystProgression';
import { getEquipmentById } from '../../data/equipment';
import { readArmStock } from '../../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs';
import { PackOpenModal } from './PackOpenModal'; // [2026-08-29] 卡包开箱演出
import { RARITY_META } from './RarityIcon'; // [2026-09-04] 武装品质元数据
import { bindArmamentGaze } from './ArmamentPreview'; // [2026-09-04] 悬停大图检视
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview'; // [2026-09-04] 强化悬停大图

// [2026-09-04] 品质六边形小图标（武装 / 强化解锁通用）：外层品质色环 + 内层深底卡面
const ARM_HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const RarityHex: React.FC<{ icon: string; rarity: string; title?: string; size?: number }> = ({ icon, rarity, title = '', size = 30 }) => {
    const color = RARITY_META[rarity as keyof typeof RARITY_META]?.color ?? '#e5e7eb';
    return (
        <div className="relative shrink-0" style={{ width: size, height: size, clipPath: ARM_HEX, background: color, filter: `drop-shadow(0 0 5px ${color}99)` }}>
            <div className="absolute inset-[2px] overflow-hidden flex items-center justify-center" style={{ clipPath: ARM_HEX, background: '#0d1320' }}>
                <img src={icon} alt={title} className="w-full h-full object-cover" draggable={false} />
            </div>
        </div>
    );
};

interface EvaluationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userSystem: any; // useUserSystem（profile/settings/openPack/grantAnalystExp）
}

export const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ isOpen, onClose, userSystem }) => {
    const [toast, setToast] = useState<string | null>(null);
    const [packOpen, setPackOpen] = useState(false); // [2026-08-29] 卡包开箱演出
    // [2026-09-04] 强化解锁悬停大图（EnhancementPreview 受控浮层；500ms delay + 150ms leaveBuffer，同 NodePreviewPanel 手感）
    const [hoverBuff, setHoverBuff] = useState<EnhancementPreviewHover | null>(null);
    const enhEnterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enhLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // [2026-09-04 账号等级] 评估嘉勉通行证等级已迁独立存档（analystPass），profile.level/exp 归账号等级
    const analystPass = userSystem?.analystPass;
    const level = analystPass?.level ?? 1;
    const exp = analystPass?.exp ?? 0;
    const expToNext = getAnalystExpToNext(level);
    // [2026-09-07 数量库存] 已武装列表 = 库存>0 的种类名
    const armStockMap = readArmStock(userSystem?.settings as any);
    const ownedArmaments = Object.keys(armStockMap).filter(id => (armStockMap[id] ?? 0) > 0);
    const pendingPacks = userSystem?.settings?.pendingPacks as number | undefined;

    // ESC 关闭（capture + stopImmediatePropagation 拦截全局 ESC）
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    // 强化悬停定时器清理（unmount 兜底）
    useEffect(() => () => {
        if (enhEnterRef.current) clearTimeout(enhEnterRef.current);
        if (enhLeaveRef.current) clearTimeout(enhLeaveRef.current);
    }, []);

    if (!isOpen) return null;

    /** [2026-09-04] 强化奖励悬停 → 浮出 EnhancementPreview 大卡（500ms delay + 150ms leaveBuffer） */
    const bindBuffHover = (buff: MazeBuff) => ({
        onMouseEnter: (e: React.MouseEvent) => {
            if (enhLeaveRef.current) { clearTimeout(enhLeaveRef.current); enhLeaveRef.current = null; }
            if (enhEnterRef.current) clearTimeout(enhEnterRef.current);
            // ⚠️ 同步取 rect：React 合成事件在异步回调里 currentTarget 会被置 null，延迟读取会报错
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            enhEnterRef.current = setTimeout(() => {
                setHoverBuff({ buff, rect });
            }, 500);
        },
        onMouseLeave: () => {
            if (enhEnterRef.current) { clearTimeout(enhEnterRef.current); enhEnterRef.current = null; }
            if (enhLeaveRef.current) clearTimeout(enhLeaveRef.current);
            enhLeaveRef.current = setTimeout(() => setHoverBuff(null), 150);
        },
    });

    /** 等级奖励槽 → 图标/标签 */
    const rewardMeta = (lv: number): { icon: React.ReactNode; label: string; name: string } => {
        const r = ANALYST_LEVEL_REWARDS[lv];
        if (!r) return { icon: <span className="text-gray-600 text-sm">—</span>, label: '无奖励', name: '' };
        if (r.armamentId) {
            const def = getEquipmentById(r.armamentId);
            return {
                // [2026-09-04] 品质六边形图标（品质色环可见，替代裸卡图）
                icon: def ? <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={30} /> : <Gem size={18} className="text-purple-300" />,
                label: def?.name ?? '', name: `武装 · ${def?.name ?? ''}`,
            };
        }
        if (r.pack) return { icon: <Package size={20} className="text-purple-300" />, label: '卡包', name: '卡包 · 打开随机武装' };
        if (r.unlockEnhancement) {
            const def = getBuffById(r.unlockEnhancement);
            return {
                // [2026-09-04] 品质六边形图标（与武装奖励同视觉语言）
                icon: def ? <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={30} /> : <Sparkles size={18} className="text-cyan-300" />,
                label: def?.name ?? '', name: `强化解锁 · ${def?.name ?? ''}`,
            };
        }
        if (r.dataGold) return { icon: <Coins size={18} className="text-yellow-300" />, label: `+${r.dataGold}`, name: `数据金 +${r.dataGold}` };
        return { icon: null, label: '', name: '' };
    };

    /** 打开卡包：弹出开箱演出界面（CS:GO 风格滚动抽武装） */
    const handleOpenPack = () => setPackOpen(true);
    // [2026-08-29 通行证·手动领取] 已领取等级 + 可领取数 + 领取动作
    const claimedLevels = userSystem?.settings?.passClaimedRewards as number[] | undefined;
    const claimedSet = new Set(claimedLevels ?? []);
    const claimableCount = Array.from({ length: Math.max(0, level) }, (_, i) => i + 1)
        .filter(lv => ANALYST_LEVEL_REWARDS[lv] && !claimedSet.has(lv)).length;
    const handleClaimLevel = (lv: number) => {
        if (userSystem?.claimPassReward?.(lv)) { setToast('✨ 奖励已领取'); setTimeout(() => setToast(null), 2000); }
    };
    const handleClaimAll = () => {
        const n = userSystem?.claimAllPassRewards?.();
        if (n) { setToast(`✨ 已领取 ${n} 项通行证奖励`); setTimeout(() => setToast(null), 2000); }
    };

    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[950] flex items-center justify-center font-sans select-none">
                <motion.div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                />
                <motion.div
                    initial={{ scale: 0.94, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.94, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    className="relative w-[880px] max-h-[86vh] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_80px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
                >
                    {/* 头部：分析员等级 + 经验条 + 待打开卡包 */}
                    <div className="flex items-center gap-4 p-5 border-b border-white/10 bg-slate-800/40 shrink-0">
                        <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center border-2 border-cyan-300/50 shadow-[0_0_25px_rgba(34,211,238,0.4)] shrink-0">
                            <span className="text-4xl font-black italic text-white">{level}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-2xl font-black text-white tracking-widest">评估嘉勉 · 肉鸽通行证</div>
                            <div className="mt-1 h-2.5 rounded-full bg-black/50 border border-white/10 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all"
                                    style={{ width: `${expToNext > 0 ? Math.min(100, (exp / expToNext) * 100) : 100}%` }}
                                />
                            </div>
                            <div className="text-xs text-gray-400 mt-1 font-mono">
                                {level >= ANALYST_MAX_LEVEL ? '已达最高等级' : `${exp} / ${expToNext} 分析员经验`}
                                <span className="text-gray-600">（对局/任务可获得）</span>
                            </div>
                        </div>
                        {/* 一键领取 + 待打开卡包（角标显示数量） */}
                        <div className="shrink-0 flex items-center gap-3">
                            {claimableCount > 0 && (
                                <button onClick={handleClaimAll}
                                    className="px-4 py-2.5 rounded-xl bg-yellow-600/30 border-2 border-yellow-400/60 text-yellow-200 font-black tracking-wider hover:bg-yellow-600/50 hover:scale-105 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                                    一键领取
                                </button>
                            )}
                            <div className="relative">
                                <button
                                    onClick={handleOpenPack}
                                    disabled={!pendingPacks || pendingPacks <= 0}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black tracking-wider transition-all ${
                                        pendingPacks && pendingPacks > 0
                                            ? 'bg-gradient-to-r from-purple-600 to-purple-400 hover:scale-105 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                    }`}
                                >
                                    <Package size={18} />
                                    打开卡包
                                </button>
                                {/* 卡包数量角标（橙色小圆） */}
                                {(pendingPacks ?? 0) > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-orange-500 border-2 border-slate-900 text-[10px] font-black text-white flex items-center justify-center">
                                        {pendingPacks}
                                    </span>
                                )}
                            </div>
                            <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* 通行证等级轨道：1~30 每级奖励槽 */}
                    <div className="flex-1 overflow-y-auto p-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <div className="text-[10px] text-purple-300 font-bold mb-2 tracking-widest uppercase flex items-center gap-1">
                            <Sparkles size={12} /> 通行证奖励轨道（达到等级后点击领取）
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            {Array.from({ length: ANALYST_MAX_LEVEL }, (_, i) => i + 1).map(lv => {
                                const reached = lv <= level;
                                const meta = rewardMeta(lv);
                                const isArm = ANALYST_LEVEL_REWARDS[lv]?.armamentId;
                                // [2026-09-04] 该级若是强化解锁 → 取 buff（品质图标 + 悬停大图同源）
                                const enhDef = ANALYST_LEVEL_REWARDS[lv]?.unlockEnhancement
                                    ? getBuffById(ANALYST_LEVEL_REWARDS[lv]!.unlockEnhancement!)
                                    : undefined;
                                return (
                                    <div
                                        key={lv}
                                        /* [2026-09-10 莉莉子 修复] 只有「无自定义大卡」的普通奖励格才留原生提示；
                                           武装/强化格已挂 bindArmamentGaze / bindBuffHover → 摘掉 title 防双弹 */
                                        title={isArm || enhDef ? undefined : meta.name}
                                        {...(isArm ? bindArmamentGaze(isArm)
                                            : enhDef ? bindBuffHover(enhDef) : {})} // [2026-09-04] 武装→武装大图；强化→强化大图
                                        className={`relative rounded-xl border flex flex-col items-center py-2.5 px-1 transition-all ${
                                            reached
                                                ? isArm
                                                    ? 'bg-purple-900/40 border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                                                    : 'bg-slate-800/60 border-white/15'
                                                : 'bg-slate-900/40 border-white/5 opacity-40 grayscale'
                                        }`}
                                    >
                                        {/* 等级数字 */}
                                        <span className={`text-[11px] font-black italic leading-none ${reached ? (isArm ? 'text-purple-300' : 'text-cyan-300') : 'text-gray-600'}`}>
                                            Lv.{lv}
                                        </span>
                                        {/* 奖励图标 */}
                                        <div className="my-1.5 flex items-center justify-center h-8 w-8">
                                            {meta.icon}
                                        </div>
                                        {/* 奖励名（截断） */}
                                        <span className="text-[9px] font-bold text-center leading-tight w-full truncate text-gray-300">
                                            {meta.label || '—'}
                                        </span>
                                        {/* [2026-08-29] 达到未领 → 领取按钮；已领 → ✓ */}
                                        {reached && ANALYST_LEVEL_REWARDS[lv] && !claimedSet.has(lv) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleClaimLevel(lv); }}
                                                className="mt-1 px-2.5 py-0.5 rounded-md bg-yellow-600/40 border border-yellow-400/50 text-yellow-200 text-[10px] font-black hover:bg-yellow-600/70 transition-all"
                                            >
                                                领取
                                            </button>
                                        )}
                                        {reached && ANALYST_LEVEL_REWARDS[lv] && claimedSet.has(lv) && (
                                            <span className="mt-1 text-[10px] font-black text-emerald-400">✓ 已领</span>
                                        )}
                                        {/* 未达锁定角标 */}
                                        {!reached && <Lock size={10} className="absolute top-1 right-1 text-gray-600" />}
                                    </div>
                                );
                            })}
                        </div>

                        {/* 已收集武装陈列 */}
                        <div className="mt-5 text-[10px] text-purple-300 font-bold tracking-widest uppercase flex items-center gap-1">
                            <Gem size={12} /> 已收集武装（{ownedArmaments?.length ?? 0}）
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(ownedArmaments ?? []).length === 0 && (
                                <span className="text-xs text-gray-500">通过通行证等级奖励 / 卡包收集稀有武装</span>
                            )}
                            {(ownedArmaments ?? []).map(id => {
                                const def = getEquipmentById(id);
                                if (!def) return null;
                                return (
                                    <div key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-purple-400/30" {...bindArmamentGaze(id)}>
                                        <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={22} />
                                        <span className="text-xs text-purple-200 font-bold">
                                            {def.name}
                                            {(armStockMap[id] ?? 0) > 1 && <span className="ml-1 text-purple-300/70 font-mono">×{armStockMap[id]}</span>}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* 卡包开出提示 */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                            className="absolute bottom-10 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full bg-black/85 border border-purple-400/40 text-purple-200 font-black tracking-widest shadow-[0_0_25px_rgba(168,85,247,0.4)]"
                        >
                            ✨ {toast}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* [2026-09-04] 强化解锁悬停大图浮层（portal body，品质强化卡面） */}
            <EnhancementPreview hover={hoverBuff} />

            {/* [2026-08-29] 卡包开箱演出（CS:GO 风格滚动抽武装） */}
            <PackOpenModal
                isOpen={packOpen}
                pendingPacks={pendingPacks ?? 0}
                onOpenPack={() => userSystem?.openPack?.() ?? null}
                onClose={() => setPackOpen(false)}
            />
        </AnimatePresence>
    );
};
