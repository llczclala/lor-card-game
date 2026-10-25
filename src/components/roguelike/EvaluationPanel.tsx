// ==========================================
// 悖论迷宫 · 评估嘉勉——肉鸽通行证面板
// [2026-08-29 莉莉子] 程拍板：评估嘉勉 = 肉鸽通行证（区别于军功任务系统）。
//   固定等级轨道 1~30，每级一个奖励槽（稀有武装 / 卡包 / 迷宫强化解锁 / 数据金）；
//   游玩进度（对局 + 任务）给分析员经验 → 升级解锁对应等级奖励。
//   卡包需手动打开（打开随机获得一个武装）。等级/经验复用 UserProfile.level/exp。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Package, Lock, Gem, Sparkles, Ticket } from 'lucide-react';
import { ANALYST_MAX_LEVEL, ANALYST_FIXED_REWARD_MAX, ANALYST_POST_CAP_EXP, getAnalystReward, getNextAnalystMilestone, getAnalystExpToNext } from '../../data/roguelike/analystProgression';
import { getEquipmentById, type EquipmentRarity } from '../../data/equipment';
import { readArmStock } from '../../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import {
    readVoucher, readVoucherFirstUsed, voucherExchangeCostOf, voucherChestCostOf,
    VOUCHER_RARITY_LABEL, EXCHANGEABLE_RARITIES,
} from '../../data/roguelike/armamentVoucher'; // [2026-10-20 程拍板] 匣券：重复武装 → 兑换更高品质武装匣
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs';
import { PackOpenModal } from './PackOpenModal'; // [2026-08-29] 卡包 → 抽到匣子
import { ChestOpenModal, type ChestOpenResult } from './ChestOpenModal'; // [2026-09-29 程拍板] 打开匣子 → 得道具
import type { ChestInstance } from '../../data/roguelike/divinityShards'; // [2026-09-29] 奖励匣
import { RARITY_META } from './RarityIcon'; // [2026-09-04] 武装品质元数据
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 面板关闭/开包 音效
import { bindArmamentGaze } from './ArmamentPreview'; // [2026-09-04] 悬停大图检视
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview'; // [2026-09-04] 强化悬停大图
// [2026-10-20 莉莉子 🎨 视觉层优化] 匣子插画唯一真源（UI 侧不出现裸图片路径）
import { getChestArt, getChestArtName, VOUCHER_ART } from '../../data/roguelike/chestArt';

/**
 * [2026-10-20 莉莉子 🎨] 插画兜底：图加载失败 ⇒ 隐藏 img（本文件两处都是"图 + 文字"，隐藏后文字仍在、不白板）
 */
const hideBrokenChestArt = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.visibility = 'hidden';
};

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
    divinity?: any;  // [2026-09-29 程拍板] useHeroDivinity（开匣子后的碎片入账）
}

export const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ isOpen, onClose, userSystem, divinity }) => {
    const [toast, setToast] = useState<string | null>(null);
    const [packOpen, setPackOpen] = useState(false); // [2026-08-29] 卡包开箱演出
    const [chestOpen, setChestOpen] = useState(false); // [2026-09-29] 奖励匣开箱
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
    const pendingChests = (userSystem?.settings?.pendingChests ?? []) as ChestInstance[]; // [2026-09-29] 待打开匣子

    // [2026-10-20 程拍板 · 匣券] 余额 / 已用首兑档位 / 兑换动作
    //   为什么兑换入口放在本面板：它是全仓唯一同时握着「奖励入口 + pendingChests 队列 + ChestOpenModal」的地方
    //   ⇒ 兑换出来的匣子**当场**就能在下面打开，闭环最短（实现审查的选型结论）。
    const voucherBalance = readVoucher(userSystem?.settings);
    const voucherUsed = readVoucherFirstUsed(userSystem?.settings);
    const handleExchangeVoucher = (rarity: EquipmentRarity) => {
        const res = userSystem?.exchangeVoucherChest?.(rarity);
        if (!res) return;
        if (res.ok) {
            eventBus.emit(GameEvents.GACHA_CONVERT); // 复用成交音
            setToast(`已兑换 ${VOUCHER_RARITY_LABEL[rarity]}武装匣（消耗 ${res.spent} 匣券）—— 去下面「待打开匣子」开启`);
        } else if (res.reason === 'insufficient') {
            setToast(`匣券不足：需要 ${res.spent}，当前 ${res.balance}`);
        } else if (res.reason === 'no-chest') {
            setToast('该品质暂不开放兑换');
        }
    };

    // ESC 关闭（capture + stopImmediatePropagation 拦截全局 ESC）
    // [2026-10-02 莉莉子 BUG修复 #16] ①分层：开箱弹窗开着时，ESC 只关**最内层**（先详情、再开箱），
    //   不再"一键把整个推演面板关掉"；②复位：本组件是**常驻挂载**（App 只切 isOpen），
    //   子弹窗状态不会随面板关闭自动清空 —— 否则下次打开面板会**自动弹出开箱界面**（状态残留）。
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            e.stopImmediatePropagation();
            if (packOpen) { setPackOpen(false); return; }
            if (chestOpen) { setChestOpen(false); return; }
            onClose();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, packOpen, chestOpen, onClose]);

    // [2026-10-02 #16] 面板一关就把子弹窗状态复位 —— 杜绝"下次打开自动弹开箱"
    useEffect(() => {
        if (!isOpen) { setPackOpen(false); setChestOpen(false); setHoverBuff(null); }
    }, [isOpen]);

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
        // [2026-10-04] 走**唯一出口** `getAnalystReward`（≤30 与旧查表等价；>30 只认里程碑）
        const r = getAnalystReward(lv);
        if (!r) return { icon: <span className="text-gray-600 text-sm">—</span>, label: '无奖励', name: '' };
        if (r.armamentId) {
            const def = getEquipmentById(r.armamentId);
            return {
                // [2026-09-04] 品质六边形图标（品质色环可见，替代裸卡图）
                icon: def ? <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={30} /> : <Gem size={18} className="text-purple-300" />,
                label: def?.name ?? '', name: `武装 · ${def?.name ?? ''}`,
            };
        }
        // [2026-10-04] 文案修正：卡包在 09-29 之后开的是**奖励匣**（不再是直接开武装）
        if (r.pack) return { icon: <Package size={20} className="text-purple-300" />, label: '卡包', name: '卡包 · 打开随机奖励匣' };
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
    // [2026-10-04] 两条线分别算：≤30 走逐级数组（轨道上每格一个按钮）；31+ 走**水位**（不许跳级）
    const claimableCount = Array.from({ length: Math.min(Math.max(0, level), ANALYST_FIXED_REWARD_MAX) }, (_, i) => i + 1)
        .filter(lv => getAnalystReward(lv) && !claimedSet.has(lv)).length;
    const claimedUpTo = Math.max(ANALYST_FIXED_REWARD_MAX, (userSystem?.passClaimedUpTo as number | undefined) ?? ANALYST_FIXED_REWARD_MAX);
    const postCapPending = level > claimedUpTo;                 // 31+ 还有没领的（水位落后于当前等级）
    const nextMilestone = getNextAnalystMilestone(level);        // 下一个里程碑等级（只它才给卡包）
    const totalClaimable = claimableCount + (postCapPending ? 1 : 0);
    const handleClaimLevel = (lv: number) => {
        if (userSystem?.claimPassReward?.(lv)) { setToast('✨ 奖励已领取'); setTimeout(() => setToast(null), 2000); }
    };
    const handleClaimAll = () => {
        const n = userSystem?.claimAllPassRewards?.() ?? 0;
        const post = userSystem?.claimPostCapPassRewards?.();
        const packs = post?.packs ?? 0;
        const total = n + packs;
        if (postCapPending) {
            setToast(packs
                ? `✨ 里程碑 +${packs} 个卡包${n ? `，另有 ${n} 项等级奖励` : ''}（已领至 Lv ${post?.reachedLevel ?? claimedUpTo}）`
                : `已领至 Lv ${post?.reachedLevel ?? claimedUpTo}（31+ 只有里程碑给卡包）`);
            setTimeout(() => setToast(null), 2400);
        } else if (total) {
            setToast(`✨ 已领取 ${total} 项通行证奖励`);
            setTimeout(() => setToast(null), 2000);
        }
    };

    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[950] flex items-center justify-center font-sans select-none">
                <motion.div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                />
                <motion.div
                    initial={{ scale: 0.94, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.94, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    className="relative w-[880px] max-h-[903px] bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_80px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
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
                                {/* [2026-10-04] 30 级后不再显示"已达最高等级"——通行证改为**无限成长**（每级 1080 经验） */}
                                {`${exp} / ${expToNext} 分析员经验`}
                                <span className="text-gray-600">（对局/任务可获得）</span>
                            </div>
                        </div>
                        {/* 一键领取 + 待打开卡包（角标显示数量） */}
                        <div className="shrink-0 flex items-center gap-3">
                            {totalClaimable > 0 && (
                                <button onClick={handleClaimAll}
                                    className="px-4 py-2.5 rounded-xl bg-yellow-600/30 border-2 border-yellow-400/60 text-yellow-200 font-black tracking-wider hover:bg-yellow-600/50 hover:scale-105 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                                    一键领取
                                </button>
                            )}
                            <div className="relative">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleOpenPack(); }}
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
                            {/* [2026-09-29 程拍板] 待打开匣子：卡包抽到的匣子在这里开启 */}
                            <div className="relative">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setChestOpen(true); }}
                                    disabled={pendingChests.length <= 0}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black tracking-wider transition-all ${
                                        pendingChests.length > 0
                                            ? 'bg-gradient-to-r from-amber-600 to-yellow-400 text-black hover:scale-105 shadow-[0_0_25px_rgba(250,204,21,0.45)]'
                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                    }`}
                                >
                                    <Gem size={18} />
                                    打开匣子
                                </button>
                                {/* 匣子数量角标 */}
                                {pendingChests.length > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-500 border-2 border-slate-900 text-[10px] font-black text-black flex items-center justify-center">
                                        {pendingChests.length}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="p-2 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all">
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
                                // [2026-10-04] 同样走唯一出口（≤30 与旧查表等价，但杜绝"两处口径"）
                                const lvReward = getAnalystReward(lv);
                                const isArm = lvReward?.armamentId;
                                // [2026-09-04] 该级若是强化解锁 → 取 buff（品质图标 + 悬停大图同源）
                                const enhDef = lvReward?.unlockEnhancement
                                    ? getBuffById(lvReward.unlockEnhancement)
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
                                        {reached && getAnalystReward(lv) && !claimedSet.has(lv) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleClaimLevel(lv); }}
                                                className="mt-1 px-2.5 py-0.5 rounded-md bg-yellow-600/40 border border-yellow-400/50 text-yellow-200 text-[10px] font-black hover:bg-yellow-600/70 transition-all"
                                            >
                                                领取
                                            </button>
                                        )}
                                        {/* [2026-10-04] 走唯一出口（原先直接查表 —— 31+ 会露馅） */}
                                        {reached && getAnalystReward(lv) && claimedSet.has(lv) && (
                                            <span className="mt-1 text-[10px] font-black text-emerald-400">✓ 已领</span>
                                        )}
                                        {/* 未达锁定角标 */}
                                        {!reached && <Lock size={10} className="absolute top-1 right-1 text-gray-600" />}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ==========================================
                            [2026-10-04 程拍板 ①③④] **30 级之后 · 无限嘉勉**
                              · 每级经验 = 与 29→30 一致（ANALYST_POST_CAP_EXP）
                              · **每 5 级一个里程碑，只有里程碑给 1 个卡包**
                              · 领取**不允许跳级** ⇒ 只推进水位到"当前等级"（结构上天然不跳级）
                            为什么单独一条而不是塞进上面 30 格轨道：
                              31+ 是**无限等级**，网格渲染不出来；且奖励规则不同（只认里程碑）。
                            ========================================== */}
                        {level > ANALYST_FIXED_REWARD_MAX && (
                            <div className="mt-4 rounded-xl border border-purple-400/30 bg-purple-950/30 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-black tracking-widest text-purple-200 flex items-center gap-1">
                                            <Sparkles size={12} /> 30 级之后 · 无限嘉勉
                                        </div>
                                        <div className="text-[11px] text-gray-400 mt-0.5">
                                            当前 <span className="text-white font-black">Lv {level}</span>
                                            {' · '}下一个里程碑 <span className="text-purple-200 font-black">Lv {nextMilestone}</span>
                                            （还差 <span className="text-white font-black">{Math.max(0, nextMilestone - level)}</span> 级）
                                            {' · '}已领至 <span className="text-white font-black">Lv {claimedUpTo}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">
                                            每 5 级一个里程碑，里程碑给 1 个卡包 · 每级需 {ANALYST_POST_CAP_EXP} 分析员经验
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleClaimAll}
                                        disabled={!postCapPending}
                                        className={`shrink-0 px-3 py-2 rounded-xl font-black tracking-wider transition-all ${
                                            postCapPending
                                                ? 'bg-yellow-600/30 border-2 border-yellow-400/60 text-yellow-200 hover:bg-yellow-600/50 hover:scale-105'
                                                : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
                                        }`}>
                                        {postCapPending ? '领取嘉勉' : '已领完'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            [2026-10-20 程拍板 · 匣券] 重复武装 → 匣券 → 兑换更高档武装匣
                              · 抽到"该档已全部拥有"时自动发券（六档含红，通用可换任意档）
                              · 每档**首次兑换**有优惠 = min(半价, 80)：低档减半、红档只减 80
                                （红档一刀切减半会让首个红匣跌破"不贬值"线，见 技术手册/05-方案汇总 §12）
                              · 兑换出来的是**匣子**（进 pendingChests），玩家自己去开 —— 不是直接发武装
                            ══════════════════════════════════════════════════════════ */}
                        <div className="mt-5 rounded-xl border border-cyan-400/25 bg-cyan-950/20 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[10px] text-cyan-300 font-bold tracking-widest uppercase flex items-center gap-1">
                                    <Ticket size={12} /> 匣券兑换
                                </div>
                                {/* [2026-10-20 莉莉子 🎨] 券小图 + 持有数（22px：16px 在 512 源图下缩放糊边，22px 才看得清券面纹样） */}
                                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                    <img
                                        src={VOUCHER_ART}
                                        alt="武装匣兑换券"
                                        title="武装匣兑换券"
                                        className="object-contain shrink-0"
                                        style={{ width: 22, height: 22 }}
                                        draggable={false}
                                        onError={hideBrokenChestArt}
                                    />
                                    持有 <span className="text-cyan-200 font-black text-sm">{voucherBalance}</span> 张
                                </div>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                                抽到已拥有的武装会变成匣券 · 攒够可换任意品质武装匣 · 每档首次兑换更便宜
                            </div>
                            <div className="mt-2.5 grid grid-cols-5 gap-2">
                                {EXCHANGEABLE_RARITIES.map(r => {
                                    const isFirst = !voucherUsed.includes(r);
                                    const cost = voucherExchangeCostOf(r, isFirst) ?? 0;
                                    const fullCost = voucherChestCostOf(r) ?? 0;
                                    const afford = voucherBalance >= cost;
                                    const color = RARITY_META[r]?.color ?? '#e5e7eb';
                                    return (
                                        <button
                                            key={r}
                                            disabled={!afford}
                                            onClick={() => handleExchangeVoucher(r)}
                                            title={isFirst ? `首次兑换优惠：原价 ${fullCost}，本次只需 ${cost}` : `原价 ${fullCost} 匣券`}
                                            className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border transition-all ${afford
                                                ? 'bg-white/5 hover:bg-white/10 hover:scale-[1.03] cursor-pointer'
                                                : 'bg-black/20 opacity-45 cursor-not-allowed'}`}
                                            style={{ borderColor: afford ? `${color}66` : '#ffffff14' }}
                                        >
                                            {/* [2026-10-20 莉莉子 🎨] 每张兑换卡加对应品质的武装匣插画（40px，整图显示不裁切） */}
                                            <img
                                                src={getChestArt('armament', r)}
                                                alt={getChestArtName('armament', r)}
                                                title={getChestArtName('armament', r)}
                                                className="object-contain shrink-0"
                                                // [2026-10-20 莉莉子 🎨] 品质色外发光（色取 RARITY_META[r].color）
                                                style={{ width: 40, height: 40, filter: `drop-shadow(0 0 6px ${color}88)` }}
                                                draggable={false}
                                                onError={hideBrokenChestArt}
                                            />
                                            <span className="text-[11px] font-black" style={{ color }}>{VOUCHER_RARITY_LABEL[r]}匣</span>
                                            <span className="text-[11px] font-mono text-white">
                                                {isFirst
                                                    ? <><span className="text-gray-500 line-through mr-1">{fullCost}</span>{cost}</>
                                                    : cost}
                                            </span>
                                            <span className={`text-[9px] font-bold ${isFirst ? 'text-cyan-300' : 'text-gray-600'}`}>
                                                {isFirst ? '首次优惠' : '匣券'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
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

            {/* [2026-08-29] 卡包开箱演出（卡包 → 抽到一个奖励匣） */}
            <PackOpenModal
                isOpen={packOpen}
                pendingPacks={pendingPacks ?? 0}
                onOpenPack={() => userSystem?.openPack?.() ?? null}
                onClose={() => setPackOpen(false)}
                onOpenChest={() => setChestOpen(true)}
                armamentStock={armStockMap} // [2026-10-21 莉莉子] 档案卡浮窗按库存判"可能产出 / 已集齐转券"
            />

            {/* [2026-09-29 程拍板] 奖励匣开箱（匣子 → 武装 / 神格碎片） */}
            <ChestOpenModal
                isOpen={chestOpen}
                chests={pendingChests}
                armamentStock={armStockMap} // [2026-10-04 ②] 预览按库存标注（与实际抽取同源）
                onOpenChest={(i) => userSystem?.openChest?.(i) ?? null}
                // [2026-10-04 程拍板] ⚡ 一键全开 —— 走批量 API（**不能**靠循环调 openChest：那会重复开同一个匣子）
                onOpenAllChests={() => userSystem?.openAllChests?.() ?? []}
                onShardDrop={(res: ChestOpenResult) => {
                    // 碎片入账（本组件同时持有 divinity，依赖方向由 App 层注入保证）
                    // [2026-10-02 莉莉子 BUG修复 #18] 判据由 `res?.wallet` 改为 `kind === 'shard'`
                    //   —— 详见 App.tsx 同处的说明（用无关字段当条件 = 数据丢失隐患）。
                    if (res?.kind !== 'shard') return;
                    const details = res.shardDetail ?? [];
                    const totalOverflow = details.reduce((s, d) => s + (d?.overflow > 0 ? d.overflow : 0), 0);
                    divinity?.applyShardDrop?.({ wallet: res.wallet, details, totalOverflow });
                }}
                onClose={() => setChestOpen(false)}
            />
        </AnimatePresence>
    );
};
