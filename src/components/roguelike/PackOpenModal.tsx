// ==========================================
// 悖论迷宫 · 卡包开箱演出（转盘老虎机 · 重构版）
// [2026-09-04 莉莉子 + 程拍板] 四优化：
//   ① 转盘待命型：弹窗打开滚轮匀速往复慢转（预热待命）→ 点开箱 → 加速冲刺 → 减速定格在中间标记线
//   ② 鼠标悬停格子 → ArmamentPreview 大图检视（看清具体是什么武装）
//   ③ 滚动格改六边形武装图标（clip-path 扁六边形，替代原长方形卡）
//   ④ 定格瞬间自动弹出效果详情弹窗（品质 + 描述 + 修饰标签），按钮收进弹窗
// 动画模型：rAF 直接驱动 strip 的 transform（translate3d）——
//   idle    待命慢转：s 在 [0, IDLE_MAX] 正弦往复（无限），目标卡（index=TARGET_INDEX）永不出现在待命带
//   rolling 从触发瞬间的 s 起 easeOutQuart 冲/减速到 TARGET_X（目标卡中心对准窗口标记线）→ result
//   result  定格 + 目标放大光效 + 自动弹详情弹窗；「收起」后回 idle 恢复慢滚待命，可连开
// 换底说明：每次开箱重建 sequence（新 pick 入 TARGET_INDEX 位），切换瞬间 strip 立即高速左冲，单帧贴图替换不可察觉
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X } from 'lucide-react';
import { getEquipmentById, getArmamentDefs, type EquipmentDef } from '../../data/equipment';
import { RARITY_META } from './RarityIcon';
import { bindArmamentGaze, getEquipBadges } from './ArmamentPreview';
import { getGameScale } from '../../utils/gameScale'; // [2026-09-04] 详情 portal 逃出 scale 容器后按 gameScale 补偿

interface PackOpenModalProps {
    isOpen: boolean;
    pendingPacks: number;
    onOpenPack: () => string | null; // 打开一个卡包，返回武装 id
    onClose: () => void;
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

export const PackOpenModal: React.FC<PackOpenModalProps> = ({ isOpen, pendingPacks, onOpenPack, onClose }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [sequence, setSequence] = useState<string[]>([]);
    const [result, setResult] = useState<string | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const stripRef = useRef<HTMLDivElement | null>(null);
    const armsRef = useRef(getArmamentDefs().filter(a => !a.consumable)); // [2026-09-07] 卡包不出现消耗品武装（碳原子板/重修申请），抽取池与滚动带一致排除
    const phaseRef = useRef<Phase>('idle');
    const sRef = useRef(0);        // 当前 strip 位移（px）
    const s0Ref = useRef(0);       // rolling 触发瞬间的起始位移
    const phRef = useRef(0);       // idle 正弦相位
    const tRef = useRef(0);        // rolling 已播放时长
    const isOpenRef = useRef(false);

    const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); console.log(`[PACK] phase → ${p}`); }; // [2026-09-07 排查日志] 阶段切换

    const paint = (s: number) => {
        if (stripRef.current) stripRef.current.style.transform = `translate3d(${-Math.round(s)}px,0,0)`;
    };

    const randArmId = () => {
        const a = armsRef.current;
        return a.length ? a[Math.floor(Math.random() * a.length)].id : '';
    };
    const buildSequence = (targetId?: string) => {
        const seq: string[] = [];
        for (let i = 0; i < SEQ_LEN; i++) seq.push(randArmId());
        if (targetId) seq[TARGET_INDEX] = targetId;
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
        console.log(`[PACK] 到 result,${REVEAL_DELAY}ms 后开详情弹窗`); // [2026-09-07 排查日志]
        const t = setTimeout(() => {
            console.log('[PACK] 定时器到点 → 开详情弹窗'); // [2026-09-07 排查日志]
            setDetailOpen(true);
        }, REVEAL_DELAY);
        return () => { console.log('[PACK] 详情定时器被清理（phase 又变了?）'); clearTimeout(t); }; // [2026-09-07 排查日志]
    }, [phase]);

    // [2026-09-07 排查日志] 详情弹窗渲染条件状态（定位"定格后弹窗不出现"）
    useEffect(() => {
        const rd = result ? getEquipmentById(result) : undefined;
        console.log(`[PACK] 状态→ detailOpen=${detailOpen} phase=${phase} result=${result ?? 'null'} hasDef=${!!rd} hasMeta=${!!(rd && RARITY_META[rd.rarity])}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailOpen, phase, result]);

    if (!isOpen) return null;

    /** 点开箱 / 再开一个：抽目标武装（入库）→ 重建序列 → 高速冲刺 */
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

    const resultDef: EquipmentDef | undefined = result ? getEquipmentById(result) : undefined;
    const resultMeta = resultDef ? RARITY_META[resultDef.rarity] : undefined;
    const canOpen = pendingPacks > 0;
    const gameScale = getGameScale(); // portal 详情浮层分辨率补偿

    /** 悬停检视：仅待命/定格时转发给全局 ArmamentPreview（冲刺期忽略，避免大图闪烁误关） */
    const gazeEnter = (e: React.MouseEvent, id: string) => {
        if (phase === 'rolling') return;
        bindArmamentGaze(id).onMouseEnter(e);
    };
    const gazeLeave = (id: string) => { bindArmamentGaze(id).onMouseLeave(); };

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
                        <h3 className="text-4xl font-black tracking-widest text-white">卡包开箱</h3>
                    </div>
                    <p className="text-sm text-purple-300/70 mb-5 font-mono tracking-wider">
                        {phase === 'idle' ? `待打开卡包 ×${pendingPacks} · 点击开箱` : phase === 'rolling' ? 'ROLLING...' : 'RESULT'}
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
                            {sequence.map((id, i) => {
                                const def = getEquipmentById(id);
                                if (!def) return <div key={i} style={{ width: CARD_W, height: CARD_H }} className="shrink-0" />;
                                const meta = RARITY_META[def.rarity];
                                const isTarget = i === TARGET_INDEX;
                                const isReveal = isTarget && phase === 'result';
                                return (
                                    <div
                                        key={i}
                                        className="relative shrink-0 flex items-center justify-center"
                                        style={{ width: CARD_W, height: CARD_H }}
                                        onMouseEnter={(e) => gazeEnter(e, def.id)}
                                        onMouseLeave={() => gazeLeave(def.id)}
                                    >
                                        {/* 六边形图标：外层铺品质色（clip 露 2px 环 = 品质描边）+ 内层 inset 深底卡面；drop-shadow 辉光不被 clip 裁 */}
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
                                            <div className="absolute inset-[2px] overflow-hidden flex items-center justify-center" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                                <img src={def.icon} alt={def.name} className="w-full h-full object-cover" draggable={false} />
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
                        💡 悬停图标可查看武装详情 · 停下中间的即为抽中
                    </p>

                    {/* ── 底部按钮：待命开箱 / 滚动中（result 时由详情弹窗接管）── */}
                    <div className="h-[60px] flex items-center mt-1">
                        {phase === 'idle' && (
                            <button onClick={handleOpen} disabled={!canOpen}
                                className={`px-10 py-3 rounded-xl font-black text-lg tracking-widest transition-all ${
                                    canOpen
                                        ? 'bg-gradient-to-r from-purple-600 to-purple-400 text-white hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.5)]'
                                        : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                }`}>
                                🎁 开箱！
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
                {detailOpen && phase === 'result' && resultDef && resultMeta && createPortal(
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
                                    ✨ 获得武装 ✨
                                </div>
                                {/* 六边形大图标（外层品质色环 + 内层深底卡面） */}
                                <div className="relative"
                                    style={{ width: BIG_HEX, height: BIG_HEX, clipPath: HEXAGON, background: resultMeta.color, filter: `drop-shadow(0 0 18px ${resultMeta.color}aa)` }}>
                                    <div className="absolute inset-[3px] overflow-hidden flex items-center justify-center" style={{ clipPath: HEXAGON, background: '#0d1320' }}>
                                        <img src={resultDef.icon} alt={resultDef.name} className="w-full h-full object-cover" draggable={false} />
                                    </div>
                                </div>
                                {/* 名称 */}
                                <div className="text-xl font-black tracking-wide text-center" style={{ color: '#fff', textShadow: `0 0 10px ${resultMeta.color}88` }}>
                                    {resultDef.name}
                                </div>
                                {/* 品质 + 武装 chips */}
                                <div className="flex flex-wrap justify-center gap-1.5">
                                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ color: resultMeta.color, border: `1px solid ${resultMeta.color}55`, background: `${resultMeta.color}11` }}>
                                        {resultMeta.label}
                                    </span>
                                    {resultDef.isArmament && (
                                        <span className="text-xs px-2 py-0.5 rounded font-mono text-amber-200 border border-amber-300/30 bg-amber-400/10">武装</span>
                                    )}
                                </div>
                                {/* 效果描述 */}
                                <p className="text-gray-200 text-sm leading-relaxed text-center">{resultDef.description}</p>
                                {/* 修饰标签（费用/攻血/关键词/打出/成长等） */}
                                {getEquipBadges(resultDef).length > 0 && (
                                    <div className="flex flex-wrap justify-center gap-1.5">
                                        {getEquipBadges(resultDef).map(b => (
                                            <span key={b} className="text-xs px-2.5 py-0.5 rounded-full font-mono text-cyan-200 border border-cyan-400/30 bg-cyan-500/10">{b}</span>
                                        ))}
                                    </div>
                                )}
                                {/* 按钮：再开一个 → 直接下一包冲刺；收起 → 恢复慢滚待命 */}
                                <div className="flex gap-2.5 mt-2">
                                    {pendingPacks > 0 && (
                                        <button onClick={handleOpen}
                                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.5)]">
                                            🎁 再开一个（×{pendingPacks}）
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
