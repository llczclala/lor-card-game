// ==========================================
// 悖论迷宫 · 卡包开箱演出（转盘老虎机 · 重构版）
// [2026-09-04 莉莉子 + 程拍板] 四优化：
//   ① 转盘待命型：弹窗打开滚轮匀速往复慢转（预热待命）→ 点开箱 → 加速冲刺 → 减速定格在中间标记线
//   ② 鼠标悬停格子 → 大图检视（看清具体是什么）
//   ③ 滚动格改六边形图标（clip-path 扁六边形，替代原长方形卡）
//   ④ 定格瞬间自动弹出效果详情弹窗（品质 + 描述），按钮收进弹窗
// [2026-09-29 程拍板 · 匣子化改造] **卡包改为开出「奖励匣」，不再直接开武装**：
//   开包 → 滚轮定格在一个**匣子**（武装匣 / 神格碎片匣 × 六档品质）→ 匣子入待打开队列
//   → 玩家随后在「待打开匣子」里开匣子，才得到对应品质武装 / 对应数量神格碎片。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X } from 'lucide-react';
import { RARITY_META } from './RarityIcon';
import {
    CHEST_KIND_LABEL, describeChestContent, CHEST_RARITY_ORDER,
    type ChestInstance, type ChestKind,
} from '../../data/roguelike/divinityShards';
import { getGameScale } from '../../utils/gameScale'; // [2026-09-04] 详情 portal 逃出 scale 容器后按 gameScale 补偿

interface PackOpenModalProps {
    isOpen: boolean;
    pendingPacks: number;
    /** 打开一个卡包 → 返回抽到的**匣子**（[2026-09-29] 原为返回武装 id） */
    onOpenPack: () => ChestInstance | null;
    onClose: () => void;
    /** 打开背包里的匣子（跳去待打开匣子列表 / 直接开） */
    onOpenChest?: () => void;
}

// ── 滚轮几何（可调）──
const CARD_W = 76;        // 每格宽（六边形格子贴格排列）
const CARD_H = 138;       // 每格高（滚动窗口高）
const WINDOW_W = 640;     // 可见窗口宽（约 8.4 格）
const HEX_SIZE = 68;      // 滚动格内六边形图标边长
const BIG_HEX = 120;      // 详情弹窗大图标边长
const SEQ_LEN = 41;       // 序列长度
const TARGET_INDEX = 34;  // 目标卡位置（中后段：前有长随机铺垫，后有尾巴）
const TARGET_X = TARGET_INDEX * CARD_W + CARD_W / 2 - WINDOW_W / 2; // 目标卡中心对准窗口中心的 strip 位移

// ── 待命慢转参数 ──
const IDLE_MAX = 720;     // 待命往复带最远位移（远在 target 前，永不见底牌）
const IDLE_PERIOD = 10;   // 往复一个完整周期（秒）→ 单程 5s，末速极慢便于悬停检视

// ── 冲刺参数 ──
const ROLL_DUR = 2.6;     // 冲刺减速时长
const REVEAL_DELAY = 1500; // 定格后停留展示（放大发光揭示）多久，再自动弹详情弹窗 (ms)

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'; // 对齐 Card.tsx EQUIPMENT_HEXAGON_CLIP 同款
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

type Phase = 'idle' | 'rolling' | 'result';

/** [2026-09-29] 匣子序列项 = 大类 + 品质（滚轮里滚的就是匣子） */
type ChestEntry = ChestInstance;

export const PackOpenModal: React.FC<PackOpenModalProps> = ({ isOpen, pendingPacks, onOpenPack, onClose, onOpenChest }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [sequence, setSequence] = useState<ChestEntry[]>([]);
    const [result, setResult] = useState<ChestEntry | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const stripRef = useRef<HTMLDivElement | null>(null);
    // [2026-09-29] 滚轮素材 = 12 种匣子（2 大类 × 6 品质）
    const chestPoolRef = useRef<ChestEntry[]>(
        (['armament', 'shard'] as ChestKind[]).flatMap(kind =>
            CHEST_RARITY_ORDER.map(rarity => ({ kind, rarity }))),
    );
    const phaseRef = useRef<Phase>('idle');
    const sRef = useRef(0);        // 当前 strip 位移（px）
    const s0Ref = useRef(0);       // rolling 触发瞬间的起始位移
    const phRef = useRef(0);       // idle 正弦相位
    const tRef = useRef(0);        // rolling 已播放时长
    const isOpenRef = useRef(false);

    const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    const paint = (s: number) => {
        if (stripRef.current) stripRef.current.style.transform = `translate3d(${-Math.round(s)}px,0,0)`;
    };

    const randChest = (): ChestEntry => {
        const a = chestPoolRef.current;
        return a[Math.floor(Math.random() * a.length)];
    };
    const buildSequence = (target?: ChestEntry) => {
        const seq: ChestEntry[] = [];
        for (let i = 0; i < SEQ_LEN; i++) seq.push(randChest());
        if (target) seq[TARGET_INDEX] = target;
        setSequence(seq);
    };

    // isOpen：重建序列 + 启动 rAF 主循环
    useEffect(() => {
        if (!isOpen) return;
        isOpenRef.current = true;
        sRef.current = 0; phRef.current = 0; tRef.current = 0;
        buildSequence();
        setPh('idle');
        setResult(null);
        setDetailOpen(false);
        let raf = 0;
        let last = performance.now();
        const tick = (ts: number) => {
            if (!isOpenRef.current) return;
            const dt = Math.min(0.05, (ts - last) / 1000);
            last = ts;
            const st = phaseRef.current;
            if (st === 'idle') {
                phRef.current += dt * (Math.PI * 2 / IDLE_PERIOD);
                const s = (IDLE_MAX / 2) * (1 - Math.cos(phRef.current));
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'rolling') {
                tRef.current += dt;
                const p = tRef.current / ROLL_DUR;
                if (p >= 1) {
                    sRef.current = TARGET_X; paint(TARGET_X);
                    setPh('result');
                    raf = requestAnimationFrame(tick); // [2026-09-07 修复] 定格后必须续帧保活循环——否则「收起回 idle / 再开一个」时 rAF 已死,第二次永远停在 ROLLING/不弹
                    return;
                }
                const e = easeOutQuart(Math.min(1, p));
                const s = s0Ref.current + (TARGET_X - s0Ref.current) * e;
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'result') {
                // 定格展示：不移动，但保持循环存活 → 「收起」回 idle 时无缝续转
                raf = requestAnimationFrame(tick);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => {
            isOpenRef.current = false;
            cancelAnimationFrame(raf);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // result → 延迟自动弹详情弹窗
    useEffect(() => {
        if (phase !== 'result') { setDetailOpen(false); return; }
        const t = setTimeout(() => setDetailOpen(true), REVEAL_DELAY);
        return () => clearTimeout(t);
    }, [phase]);

    if (!isOpen) return null;

    /** 点开箱 / 再开一个：抽一个匣子（入库）→ 重建序列 → 高速冲刺 */
    const handleOpen = () => {
        if (phaseRef.current === 'rolling') return;
        const pick = onOpenPack?.();
        if (!pick) return;
        s0Ref.current = sRef.current; // 从当前位移无缝续冲
        tRef.current = 0;
        setResult(pick);
        setDetailOpen(false);
        buildSequence(pick);
        setPh('rolling');
    };

    const resultMeta = result ? RARITY_META[result.rarity] : undefined;
    const canOpen = pendingPacks > 0;
    const gameScale = getGameScale(); // portal 详情浮层分辨率补偿

    /** 匣子显示名：品质 + 大类（例：紫色 神格碎片匣） */
    const chestName = (c: ChestEntry): string => `${RARITY_META[c.rarity].label}·${CHEST_KIND_LABEL[c.kind]}`;

    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[1200] flex items-center justify-center font-sans select-none">
                {/* 全屏遮罩：滚动中不响应点击关闭 */}
                <motion.div
                    className="absolute inset-0 bg-black/85 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => { if (phase !== 'rolling') onClose(); }}
                />
                <motion.div
                    initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className="relative w-[860px] rounded-3xl bg-gradient-to-b from-slate-900 via-purple-950/50 to-slate-900 border border-purple-500/30 p-8 flex flex-col items-center shadow-[0_0_80px_rgba(88,28,135,0.5)] overflow-hidden"
                >
                    {/* 标题 */}
                    <div className="flex items-center gap-2 mb-1">
                        <Package size={32} className="text-purple-300" />
                        <h3 className="text-4xl font-black tracking-widest text-white">卡包开匣</h3>
                    </div>
                    <p className="text-sm text-purple-300/70 mb-5 font-mono tracking-wider">
                        {phase === 'idle' ? `待打开卡包 ×${pendingPacks} · 点击开匣` : phase === 'rolling' ? 'ROLLING...' : 'RESULT'}
                    </p>

                    {/* ── 滚动展示窗（老虎机转盘）── */}
                    <div
                        className="relative overflow-hidden rounded-xl bg-black/60 border border-white/10"
                        style={{ width: WINDOW_W, height: CARD_H }}
                    >
                        {/* 中间标记线（+ 停住脉冲光） */}
                        <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[2px] bg-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.9)] z-20" />
                        {/* 两侧渐隐 */}
                        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" />
                        <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" />
                        {/* 底部轨道条 */}
                        <div className="absolute bottom-0 left-0 right-0 h-5 bg-black/50 border-t border-white/5 z-10 pointer-events-none" />

                        {/* 滚动序列（rAF 手动 transform） */}
                        <div ref={stripRef} className="absolute top-0 left-0 flex will-change-transform">
                            {sequence.map((chest, i) => {
                                const meta = RARITY_META[chest.rarity];
                                const isTarget = i === TARGET_INDEX;
                                const isReveal = isTarget && phase === 'result';
                                return (
                                    <div
                                        key={i}
                                        className="relative shrink-0 flex items-center justify-center"
                                        style={{ width: CARD_W, height: CARD_H }}
                                    >
                                        {/* 六边形图标：外层铺品质色（clip 露 2px 环 = 品质描边）+ 内层深底 + 匣子标识 */}
                                        <motion.div
                                            className="relative"
                                            style={{
                                                width: HEX_SIZE,
                                                height: HEX_SIZE,
                                                clipPath: HEXAGON,
                                                background: meta.color,
                                                filter: `drop-shadow(0 0 ${isReveal ? 20 : 7}px ${meta.color}${isReveal ? 'ee' : '66'})`,
                                            }}
                                            animate={isReveal ? { scale: 1.6 } : { scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                                        >
                                            <div className="absolute inset-[2px] overflow-hidden flex flex-col items-center justify-center gap-0.5" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                <Package size={20} className="text-white/80" />
                                                <span className="text-[9px] font-black leading-none" style={{ color: meta.color }}>
                                                    {chest.kind === 'armament' ? '武装' : '碎片'}
                                                </span>
                                            </div>
                                        </motion.div>
                                        {/* 停住后目标加皇冠/选中标记 */}
                                        {isReveal && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18 }}
                                                className="absolute -top-1 left-1/2 -translate-x-1/2 z-30 text-yellow-300 text-sm drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]"
                                            >
                                                ▲
                                            </motion.div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* [2026-09-04] 中奖揭示：定格后目标格扩散品质色六边形光环（在放大发光之上再强调一次被抽中） */}
                        {phase === 'result' && resultMeta && (
                            <motion.div
                                className="pointer-events-none absolute z-[15]"
                                style={{
                                    left: '50%', top: '50%',
                                    width: HEX_SIZE, height: HEX_SIZE,
                                    marginLeft: -HEX_SIZE / 2, marginTop: -HEX_SIZE / 2,
                                    clipPath: HEXAGON,
                                    border: `3px solid ${resultMeta.color}`,
                                    filter: `drop-shadow(0 0 14px ${resultMeta.color})`,
                                }}
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: [0.95, 0], scale: 1.9 }}
                                transition={{ duration: 1.1, ease: 'easeOut', repeat: 1, repeatDelay: 0.45 }}
                            />
                        )}
                    </div>

                    <p className="text-[11px] text-gray-500 mt-3 font-mono tracking-wider pointer-events-none">
                        🎁 卡包开出的是**奖励匣** · 停下中间的即为抽中，随后可在「待打开匣子」里开启
                    </p>

                    {/* ── 底部按钮：待命开匣 / 滚动中（result 时由详情弹窗接管）── */}
                    <div className="h-[60px] flex items-center mt-1">
                        {phase === 'idle' && (
                            <button onClick={handleOpen} disabled={!canOpen}
                                className={`px-10 py-3 rounded-xl font-black text-lg tracking-widest transition-all ${
                                    canOpen
                                        ? 'bg-gradient-to-r from-purple-600 to-purple-400 text-white hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.5)]'
                                        : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                }`}>
                                🎁 开匣！
                            </button>
                        )}
                        {phase === 'rolling' && (
                            <div className="px-10 py-3 rounded-xl bg-white/5 text-gray-500 font-black text-lg tracking-widest cursor-wait">ROLLING...</div>
                        )}
                    </div>

                    {/* 右上关闭（滚动中禁用） */}
                    {phase !== 'rolling' && (
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    )}

                </motion.div>

                {/* ── 详情效果弹窗（portal 到 body 全屏浮层，脱离 modal 高度与 overflow 裁剪）
                     [2026-09-07 修复] 去掉包裹 portal 的 AnimatePresence：portal 不是 AnimatePresence 可识别的 motion child，
                     进入动画不触发 → 弹窗停在 opacity:0 全透明却仍拦截点击（"定格后没弹窗、点不动"）；改普通条件渲染，portal 内 motion 自播进入动画。
                     分辨率补偿 scale 移入独立纯 div，避免被 framer 的 transform 动画覆盖。 */}
                {detailOpen && phase === 'result' && result && resultMeta && createPortal(
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ transform: `scale(${gameScale})` }}>
                            <motion.div
                                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                                className="w-[460px] rounded-2xl border p-7 flex flex-col items-center gap-3 shadow-[0_0_60px_rgba(0,0,0,0.9)]"
                                style={{ background: resultMeta.cardBg, borderColor: `${resultMeta.color}66`, boxShadow: `0 0 40px ${resultMeta.color}44` }}
                            >
                                <div className="text-lg font-black tracking-widest" style={{ color: resultMeta.color, textShadow: `0 0 18px ${resultMeta.color}88` }}>
                                    ✨ 获得奖励匣 ✨
                                </div>
                                {/* 六边形大图标（外层品质色环 + 内层深底 + 匣子标识） */}
                                <div className="relative"
                                    style={{ width: BIG_HEX, height: BIG_HEX, clipPath: HEXAGON, background: resultMeta.color, filter: `drop-shadow(0 0 18px ${resultMeta.color}aa)` }}>
                                    <div className="absolute inset-[3px] overflow-hidden flex flex-col items-center justify-center gap-1" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                        <Package size={38} className="text-white/85" />
                                        <span className="text-[11px] font-black" style={{ color: resultMeta.color }}>
                                            {result.kind === 'armament' ? '武装' : '碎片'}
                                        </span>
                                    </div>
                                </div>
                                {/* 名称 */}
                                <div className="text-xl font-black tracking-wide text-center" style={{ color: '#fff', textShadow: `0 0 10px ${resultMeta.color}88` }}>
                                    {chestName(result)}
                                </div>
                                {/* 品质 + 大类 chips */}
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ color: resultMeta.color, border: `1px solid ${resultMeta.color}55`, background: `${resultMeta.color}11` }}>
                                        {resultMeta.label}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded font-mono text-amber-200 border border-amber-300/30 bg-amber-400/10">
                                        {CHEST_KIND_LABEL[result.kind]}
                                    </span>
                                </div>
                                {/* 开出内容预告 */}
                                <p className="text-gray-200 text-sm leading-relaxed text-center">
                                    {describeChestContent(result.kind, result.rarity)}
                                    {result.kind === 'shard' && (
                                        <span className="block text-[11px] text-cyan-300/80 mt-1">
                                            碎片每 {5} 片为一组，随机归属一位天启者 · 万能碎片不会从这里开出
                                        </span>
                                    )}
                                </p>
                                {/* 按钮：开匣（去开刚拿到的匣子）/ 再开一包 / 收起 */}
                                <div className="flex flex-wrap justify-center gap-2.5 mt-2">
                                    {onOpenChest && (
                                        <button onClick={() => { onClose(); onOpenChest(); }}
                                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.5)]">
                                            🔓 去开匣子
                                        </button>
                                    )}
                                    {pendingPacks > 0 && (
                                        <button onClick={handleOpen}
                                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.5)]">
                                            🎁 再开一包（×{pendingPacks}）
                                        </button>
                                    )}
                                    <button onClick={() => {
                                        if (pendingPacks > 0) {
                                            // 还有卡包：收起详情 → 恢复慢滚待命，可随时再开
                                            setDetailOpen(false); setPh('idle'); phRef.current = Math.PI / 2;
                                        } else {
                                            // 开完了：直接退出
                                            onClose();
                                        }
                                    }}
                                        className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all">
                                        {pendingPacks > 0 ? '收起' : '完成'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>,
                    document.body,
                )}
            </motion.div>
        </AnimatePresence>
    );
};
