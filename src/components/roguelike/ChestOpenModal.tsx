// ==========================================
// 悖论迷宫 · 奖励匣开箱（[2026-09-29 程拍板] 匣子体系）
//
// 与「卡包开匣（PackOpenModal）」的分工：
//   · PackOpenModal ：**卡包 → 匣子**（滚轮抽到一个匣子，入待打开队列）
//   · 本组件        ：**匣子 → 道具**（打开匣子，得到武装 或 神格碎片）
//
// 两类匣子：
//   · 武装匣（armament） → 按**对应品质**随机一件武装入库；未消耗品可配置
//   · 神格碎片匣（shard）→ 按**对应数量**产出碎片；碎片每 5 片为一组，随机归属一位天启者
//                          ⚠️ 万能碎片**不会**从这里开出（唯一来源：每日任务 + 溢出转化）
// ==========================================
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Package, X } from 'lucide-react';
import { ShardIcon } from './ShardIcon'; // [2026-09-29 程拍板] 神格碎片图标（头像菱形 / 万能橙菱形）
import { RARITY_META } from './RarityIcon';
import { getEquipmentById } from '../../data/equipment';
import { CARD_DB } from '../../data/cards';
import { getGameScale } from '../../utils/gameScale';
import {
    CHEST_KIND_LABEL, SHARD_CHEST_AMOUNT, SHARD_GROUP_SIZE,
    type ChestInstance,
} from '../../data/roguelike/divinityShards';

/** openChest 的返回结构（与 useUserSystem.openChest 对齐） */
export interface ChestOpenResult {
    kind: ChestInstance['kind'];
    rarity: ChestInstance['rarity'];
    armamentId?: string;
    shardAmount?: number;
    shardDetail?: { heroKey: string; amount: number; overflow: number }[];
    wallet?: unknown;
}

interface ChestOpenModalProps {
    isOpen: boolean;
    /** 待打开匣子列表（队列） */
    chests: ChestInstance[];
    /** 打开队列里第 index 个匣子 */
    onOpenChest: (index: number) => ChestOpenResult | null;
    onClose: () => void;
    /** 同时持有 useHeroDivinity 的调用方注入：碎片入账 */
    onShardDrop?: (result: ChestOpenResult) => void;
}

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

export const ChestOpenModal: React.FC<ChestOpenModalProps> = ({
    isOpen, chests, onOpenChest, onClose, onShardDrop,
}) => {
    const [result, setResult] = useState<ChestOpenResult | null>(null);
    const [opening, setOpening] = useState(false);
    const gameScale = getGameScale();

    const next = useMemo(() => chests[0], [chests]);

    if (!isOpen) return null;

    const handleOpen = () => {
        if (opening) return;
        setOpening(true);
        const res = onOpenChest(0);
        // 碎片匣：把分配结果交给调用方入账（依赖方向：调用方同时持有 divinity）
        if (res?.kind === 'shard' && onShardDrop) onShardDrop(res);
        setResult(res);
        setOpening(false);
    };

    const meta = result ? RARITY_META[result.rarity] : (next ? RARITY_META[next.rarity] : undefined);
    const armDef = result?.armamentId ? getEquipmentById(result.armamentId) : undefined;

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/85 backdrop-blur-md"
            onClick={() => { if (!opening) onClose(); }}
        >
            <div style={{ transform: `scale(${gameScale})` }} onClick={(e) => e.stopPropagation()}>
                <motion.div
                    initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="relative w-[640px] rounded-3xl bg-gradient-to-b from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 p-8 flex flex-col items-center gap-4 shadow-[0_0_80px_rgba(88,28,135,0.5)]"
                >
                    {/* 标题 */}
                    <div className="flex items-center gap-2">
                        <Package size={28} className="text-purple-300" />
                        <h3 className="text-3xl font-black tracking-widest text-white">奖励匣</h3>
                    </div>
                    <p className="text-xs text-purple-300/70 font-mono tracking-wider">
                        待打开匣子 ×{chests.length}
                    </p>

                    {/* ── 未开：展示下一个匣子 ── */}
                    {!result && next && meta && (
                        <>
                            <div className="relative" style={{ width: 148, height: 148 }}>
                                <motion.div
                                    className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                                    style={{ clipPath: HEXAGON, background: meta.color, filter: `drop-shadow(0 0 22px ${meta.color}bb)` }}
                                    animate={{ scale: [1, 1.05, 1] }}
                                    transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                    <div className="w-[94%] h-[94%] flex flex-col items-center justify-center gap-2" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                        <Package size={44} className="text-white/85" />
                                        <span className="text-xs font-black" style={{ color: meta.color }}>
                                            {next.kind === 'armament' ? '武装' : '碎片'}
                                        </span>
                                    </div>
                                </motion.div>
                            </div>
                            <div className="text-xl font-black text-white" style={{ textShadow: `0 0 12px ${meta.color}88` }}>
                                {meta.label}·{CHEST_KIND_LABEL[next.kind]}
                            </div>
                            <p className="text-sm text-gray-300">
                                {next.kind === 'armament'
                                    ? '打开可获得一件对应品质的武装'
                                    : `打开可获得 ${SHARD_CHEST_AMOUNT[next.rarity]} 片神格碎片`}
                            </p>
                            <button
                                onClick={handleOpen}
                                className="mt-1 px-9 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-lg tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)]"
                            >
                                🔓 打开匣子
                            </button>
                        </>
                    )}

                    {/* 队列空 */}
                    {!result && !next && (
                        <p className="text-gray-400 py-8">没有待打开的匣子了</p>
                    )}

                    {/* ── 已开：展示结果 ── */}
                    {result && meta && (
                        <>
                            <div className="text-lg font-black tracking-widest" style={{ color: meta.color, textShadow: `0 0 18px ${meta.color}88` }}>
                                {result.kind === 'armament' ? '✨ 获得武装 ✨' : '💠 获得神格碎片 💠'}
                            </div>

                            {/* 武装匣结果 */}
                            {result.kind === 'armament' && armDef && (
                                <>
                                    <div className="relative" style={{ width: 120, height: 120 }}>
                                        <div className="w-full h-full" style={{ clipPath: HEXAGON, background: meta.color, filter: `drop-shadow(0 0 18px ${meta.color}aa)` }}>
                                            <div className="absolute inset-[3px] overflow-hidden flex items-center justify-center" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                <img src={armDef.icon} alt={armDef.name} className="w-full h-full object-cover" draggable={false} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-xl font-black text-white">{armDef.name}</div>
                                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ color: meta.color, border: `1px solid ${meta.color}55`, background: `${meta.color}11` }}>
                                        {meta.label}
                                    </span>
                                    <p className="text-sm text-gray-200 text-center leading-relaxed">{armDef.description}</p>
                                </>
                            )}

                            {/* 碎片匣结果：按英雄分条展示（每 5 片一组随机归属） */}
                            {result.kind === 'shard' && (
                                <>
                                    <div className="text-sm text-gray-300">
                                        共开出 <span className="text-cyan-300 font-black">{result.shardAmount}</span> 片
                                        （每 {SHARD_GROUP_SIZE} 片一组，随机归属）
                                    </div>
                                    <div className="w-full max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
                                        {(result.shardDetail ?? []).map(d => {
                                            const heroName = CARD_DB[d.heroKey]?.name ?? d.heroKey;
                                            return (
                                                <div key={d.heroKey} className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-white/10">
                                                    <div className="flex items-center gap-2">
                                                        {/* [2026-09-29 程拍板] 碎片图标 = 天启者头像裁进菱形 */}
                                                        <ShardIcon heroKey={d.heroKey} size={22} />
                                                        <span className="text-sm font-bold text-white">{heroName}的神格碎片</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-black text-cyan-200">×{d.amount}</span>
                                                        {d.overflow > 0 && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-200 border border-amber-300/30"
                                                                title="该英雄专属碎片已达 200 片上限，超出部分 1:1 转为万能碎片">
                                                                溢出 +{d.overflow} 万能
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* 按钮：继续开 / 完成 */}
                            <div className="flex gap-2.5 mt-1">
                                {chests.length > 0 && (
                                    <button
                                        onClick={() => setResult(null)}
                                        className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.45)]"
                                    >
                                        🔓 继续开（×{chests.length}）
                                    </button>
                                )}
                                <button
                                    onClick={onClose}
                                    className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all"
                                >
                                    {chests.length > 0 ? '收起' : '完成'}
                                </button>
                            </div>
                        </>
                    )}

                    {/* 关闭 */}
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all">
                        <X size={20} />
                    </button>
                </motion.div>
            </div>
        </motion.div>,
        document.body,
    );
};
