// ==========================================
// 悖论迷宫 · 通关/败亡结算——天启者养成动画（全屏开放式）
// [2026-08-29 莉莉子] 程拍板：无边框，全屏黑色透明遮罩 + 内容浮层（对齐对局胜利结算）。
//   核心 = 经验可视化：复用选择界面 HeroAvatarRing（头像+等级+经验环），
//   获得经验时数字滚动、经验环同步增长；滚动跨级 → 头像金光爆发 + 等级跳变。
//   通关=金辉 / 败亡=暗涌。
// [2026-09-08 程拍板] 结算演出 v2（布局 + 消耗品演出）：
//   · 布局左移：左半边结算（标题/头像经验环/统计/按钮），右半边天启者手牌大图 + 武装槽列
//   · 碳原子板演出：槽位白光一闪消耗 → 一束白光打进左侧经验环 → 经验值开始滚动
//   · 重修申请演出：槽位发出升到品质的光芒 → 光芒消散后槽位品质变化并泛对应品质微光
//   顺序 = 入场 →(有共鸣)白光打经验→ 经验滚动 →(有重修升档)升槽光芒 → 统计
// ==========================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Skull, Clock } from 'lucide-react';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import type { RogueSettleDetail } from '../../../data/roguelike/rogueExp';
import { getExpToNextLevel, getHeroLevelBonus, combineArmamentRarity, type ArmamentRarity } from '../../../data/roguelike/heroProgression';
import { HeroAvatarRing, HeroHandContent, ArmamentSlot } from '../RogueHeroInfoModal';
import { ROGUE_DIFFICULTIES } from '../../../data/roguelike/difficulties';
import { useHeroProgression } from '../../../hooks/useHeroProgression'; // [2026-09-08] 等级→槽数量/基础品质
import { useArmamentConfig } from '../../../hooks/useArmamentConfig'; // [2026-09-08] 实时武装槽/品质档
import { PackOpenModal } from '../PackOpenModal'; // [2026-09-04] 通关卡包·完整滚轮开箱演出

/** [2026-08-29] 通关/败亡结算信息（经验动画起点/终点 + 倍率明细） */
export interface RunEndInfo {
    won: boolean;
    heroKey: string;
    fromLevel: number; // 结算前等级（动画起点）
    fromExp: number;   // 结算前经验
    toLevel: number;   // 结算后等级
    toExp: number;     // 结算后经验
    expGained: number; // 本次获得经验
    detail: RogueSettleDetail;
}

interface RunEndModalProps {
    run: RoguelikeRunState;
    runEnd: RunEndInfo;
    pendingPacks?: number; // [2026-08-29] 通关待打开卡包
    onOpenPack?: () => string | null; // [2026-08-29] 打开卡包（随机武装）
    onConfirm: () => void;
}

type Phase = 'intro' | 'reso' | 'count' | 'retrain' | 'stats';

// [2026-09-08 演出] 品质档→色/名（重修升档光芒用）
const TIER_COLOR: Record<number, string> = { 1: '#a855f7', 2: '#facc15', 3: '#ef4444' };
const TIER_NAME: Record<number, string> = { 1: '史诗', 2: '传说', 3: '神话' };

export const RunEndModal: React.FC<RunEndModalProps> = ({ run, runEnd, pendingPacks = 0, onOpenPack, onConfirm }) => {
    const { won, heroKey, fromLevel, fromExp, toLevel, toExp, expGained, detail } = runEnd;
    const isWin = won;
    // [2026-09-08] 演出数据
    const resoSlot = detail.resonanceSlot ?? -1;             // 共鸣消耗槽位号（-1=本局无）
    const retrain = detail.retrain;                           // 重修升档槽位/目标档（undefined=无）
    const hasRoll = expGained > 0;

    const [phase, setPhase] = useState<Phase>('intro');
    const [disp, setDisp] = useState({ level: fromLevel, exp: fromExp });
    const [flashLevel, setFlashLevel] = useState(false); // 升级金光
    const [packOpen, setPackOpen] = useState(false); // [2026-09-04] 通关卡包·开箱弹窗（完整滚轮演出）
    // [2026-09-08 演出] 共鸣白光路径（from→to 屏幕坐标）
    const [beam, setBeam] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [ringBurst, setRingBurst] = useState(false); // 经验环受击脉冲
    const [resoFlash, setResoFlash] = useState(false); // 共鸣槽白光
    const [retrainDone, setRetrainDone] = useState(false); // 重修演出完，槽常驻泛光
    // [2026-09-09 莉莉子] 演出期亮出被消耗的消耗品本体图标（结算时武装已清出槽=空槽，玩家看不清谁在生效）
    const [resoIconShow, setResoIconShow] = useState(false); // 共鸣本体亮相 → 白光带走后隐去
    const [retrainIconShow, setRetrainIconShow] = useState(false); // 重修本体亮相 → 升档完成隐去

    // refs：共鸣光束起止点 + 重修槽定位
    const ringRef = useRef<HTMLDivElement | null>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

    // [2026-09-08] 右槽列数据：实时配置（结算后已清消耗品）→ 空槽显示新品质上限色
    const { getQualityTier, getArmament } = useArmamentConfig();
    const heroProgression = useHeroProgression();
    const heroLevel = heroProgression.getHeroLevel(heroKey);
    const heroBonus = getHeroLevelBonus(heroLevel);
    const unlockSlots = heroBonus.armamentSlots;
    const tiers = getQualityTier(heroKey);
    const caps = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, tiers[i] ?? 0)),
        [heroBonus.armamentRarity, tiers],
    );
    const liveValues = getArmament(heroKey, heroLevel);

    /** 阶段推进：当前滚动/演出后去往哪个阶段 */
    const afterRoll = (): 'retrain' | 'stats' => (retrain && retrain.slots.length > 0 ? 'retrain' : 'stats');

    // intro → (reso)→count / retrain / stats
    useEffect(() => {
        if (phase !== 'intro') return;
        const t = setTimeout(() => {
            if (resoSlot >= 0) setPhase('reso');
            else if (hasRoll) setPhase('count');
            else setPhase(retrain && retrain.slots.length > 0 ? 'retrain' : 'stats');
        }, 600);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // [2026-09-08 演出] 共鸣白光 → 经验环
    // [2026-09-09 莉莉子] 时序加"本体亮相"：先亮出碳原子板图标(700ms)让玩家看清是谁在生效 →
    //   白光在图标上一闪并将其带走(图标隐去=化作白光) → 光束飞向经验环 → 经验滚动。
    useEffect(() => {
        if (phase !== 'reso') return;
        setResoIconShow(true); // 1. 槽位亮出碳原子板本体
        const t1 = setTimeout(() => {
            // 测白光起点(共鸣槽中心)与终点(经验环中心)
            const slotEl = slotRefs.current[resoSlot];
            const ringEl = ringRef.current;
            if (slotEl && ringEl) {
                const a = slotEl.getBoundingClientRect();
                const b = ringEl.getBoundingClientRect();
                setBeam({ x1: a.left + a.width / 2, y1: a.top + a.height / 2, x2: b.left + b.width / 2, y2: b.top + b.height / 2 });
            }
            setResoFlash(true);    // 2. 白光在图标上爆闪
            setResoIconShow(false); //    → 图标被白光带走（隐去）
        }, 700);
        const t2 = setTimeout(() => { setResoFlash(false); setRingBurst(true); }, 1250); // 3. 白光命中经验环 → 脉冲
        const t3 = setTimeout(() => {
            setRingBurst(false);
            setBeam(null);
            setPhase(hasRoll ? 'count' : afterRoll());
        }, 1900);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // 经验滚动（从 from→to；升级跨级金光）；结束 → 重修演出 / 统计
    useEffect(() => {
        if (phase !== 'count') return;
        let curLevel = fromLevel;
        let curExp = fromExp;
        const steps = 50;
        const perStep = expGained / steps;
        let done = 0;
        const timer = setInterval(() => {
            done += perStep;
            if (done >= expGained) {
                setDisp({ level: toLevel, exp: toExp });
                setPhase(afterRoll());
                clearInterval(timer);
                return;
            }
            curExp += perStep;
            let toNext = getExpToNextLevel(curLevel);
            let lvlFlash = false;
            while (toNext > 0 && curExp >= toNext) {
                curExp -= toNext;
                curLevel += 1;
                toNext = getExpToNextLevel(curLevel);
                lvlFlash = true;
            }
            if (lvlFlash) {
                setFlashLevel(true);
                setTimeout(() => setFlashLevel(false), 550);
            }
            setDisp({ level: curLevel, exp: curExp });
        }, 750 / steps);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    // [2026-09-08 演出] 重修升槽光芒（按槽串行闪光）→ 结束进统计
    // [2026-09-09 莉莉子] 升槽光芒期间亮出重修申请本体图标，升档完成前图标隐去（被消耗）
    useEffect(() => {
        if (phase !== 'retrain') return;
        setRetrainIconShow(true); // 槽位亮出重修申请本体（品质光在其上闪）
        const dur = 520 + (retrain ? retrain.slots.length : 1) * 420;
        const t1 = setTimeout(() => setRetrainIconShow(false), Math.max(300, dur - 350)); // 光芒收尾前图标隐去
        const t = setTimeout(() => {
            setRetrainDone(true);
            setPhase('stats');
        }, dur);
        return () => { clearTimeout(t); clearTimeout(t1); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    const diffLabel = ROGUE_DIFFICULTIES.find(d => d.key === run.difficulty)?.label ?? run.difficulty;
    const statCards: { label: string; value: string; color: string }[] = [
        { label: '到达层数', value: `Act ${run.act}`, color: 'text-white' },
        { label: '金币', value: `${run.gold}`, color: 'text-amber-300' },
        { label: '迷宫强化', value: `${run.enhancements.length}`, color: 'text-violet-300' },
        { label: '悖论点', value: `+${run.paradoxPoints}`, color: 'text-purple-300' },
        { label: '本局用时', value: `${detail.durationMin} 分钟`, color: 'text-white' },
        { label: '击败 BOSS', value: isWin ? '✓' : '—', color: isWin ? 'text-emerald-400' : 'text-gray-500' },
    ];

    return (
        <div className={`fixed inset-0 z-[700] flex items-center justify-center overflow-hidden ${isWin ? 'bg-black/70' : 'bg-black/80'}`}>
            {/* 氛围光：通关金辉 / 败亡暗涌 */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}
                className={`absolute inset-0 pointer-events-none ${isWin ? 'rogue-win-glow' : 'rogue-lose-glow'}`}
            />

            {/* 共鸣白光飞行路径（全屏覆盖层） */}
            {beam && (
                <motion.div
                    className="absolute z-[60] pointer-events-none w-3 h-3 rounded-full"
                    style={{
                        left: beam.x1, top: beam.y1,
                        background: '#ffffff',
                        boxShadow: '0 0 18px 6px rgba(255,255,255,0.85), 0 0 40px 12px rgba(255,255,255,0.4)',
                    }}
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{ x: beam.x2 - beam.x1, y: beam.y2 - beam.y1, opacity: [0, 1, 1, 1, 0] }}
                    transition={{ duration: 0.55, ease: 'easeInOut' }}
                />
            )}

            {/* 左：结算内容（标题/头像经验环/统计/按钮） + 右：天启者手牌 + 武装槽列 */}
            <div className="relative flex items-center justify-center gap-10 text-white select-none px-6" style={{ maxWidth: 1560, width: '100%' }}>

                {/* ══ 左半：结算 ══ */}
                <div className="w-[560px] shrink-0 flex flex-col items-center gap-5">
                    {/* 大标题 */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.7, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.15 }}
                        className="flex items-center gap-4"
                    >
                        {isWin
                            ? <Trophy size={50} className="text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.7)]" />
                            : <Skull size={50} className="text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.6)]" />}
                        <h2 className={`text-6xl font-black italic tracking-widest drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)] ${isWin ? 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 to-yellow-500' : 'text-red-500'}`}>
                            {isWin ? '悖论瓦解' : '迷宫崩塌'}
                        </h2>
                    </motion.div>

                    {/* 副标题：难度 + 用时 */}
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                        className="flex items-center gap-2 text-gray-400 text-sm font-mono tracking-widest"
                    >
                        <span className={`px-2 py-0.5 rounded-full border ${isWin ? 'border-yellow-400/40 text-yellow-300' : 'border-red-400/40 text-red-300'}`}>{diffLabel}</span>
                        <span className="flex items-center gap-1"><Clock size={14} />{detail.durationMin} 分钟</span>
                    </motion.div>

                    {/* 头像 + 经验环（经验环 ref = 共鸣白光落点） */}
                    <motion.div
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.3 }}
                        className="relative"
                    >
                        <AnimatePresence>
                            {flashLevel && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1.35 }} exit={{ opacity: 0, scale: 1.5 }}
                                    transition={{ duration: 0.5 }}
                                    className="absolute -inset-6 rounded-full bg-yellow-400/50 blur-2xl pointer-events-none"
                                />
                            )}
                        </AnimatePresence>
                        {/* 经验环受击脉冲（共鸣白光抵达） */}
                        <AnimatePresence>
                            {ringBurst && (
                                <motion.div
                                    initial={{ opacity: 0.9, scale: 0.7 }} animate={{ opacity: 0, scale: 1.6 }} exit={{ opacity: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="absolute -inset-4 rounded-full border-2 border-white pointer-events-none"
                                />
                            )}
                        </AnimatePresence>
                        <div ref={ringRef} className="relative rounded-full shadow-[0_0_40px_rgba(59,130,246,0.25)]">
                            <HeroAvatarRing heroKey={heroKey} level={disp.level} exp={disp.exp} expToNext={getExpToNextLevel(disp.level)} size={158} />
                        </div>
                        {/* 经验数字（滚动） */}
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                            <span className="px-4 py-1 rounded-full bg-black/80 border border-cyan-400/40 text-cyan-300 font-black font-mono text-sm tracking-widest shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                                +{expGained} 经验
                            </span>
                        </div>
                    </motion.div>

                    {/* 统计卡片 */}
                    <AnimatePresence>
                        {phase === 'stats' && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                                className="grid grid-cols-3 gap-3 pointer-events-none"
                            >
                                {statCards.map(c => (
                                    <div key={c.label} className="w-28 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-center backdrop-blur-sm">
                                        <div className={`text-base font-black ${c.color}`}>{c.value}</div>
                                        <div className="text-[10px] text-gray-400 mt-0.5 tracking-wider">{c.label}</div>
                                    </div>
                                ))}
                                <div className="col-span-3 text-center text-[11px] text-gray-500 font-mono mt-1 leading-relaxed">
                                    难度 ×{detail.diffMult} · 速通 ×{detail.timeMult}
                                    {detail.ratePct > 0 && ` · 效率 +${detail.ratePct}%`}
                                    {detail.resonance && ' · 共鸣 ×2'}
                                    {detail.clearExp > 0 && ` · 通关 +${detail.clearExp}`}
                                    {detail.resource && detail.resource.exp > 0 && (
                                        <span className="text-emerald-400"> · 剩余资源折算 <b>+{detail.resource.exp}</b></span>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* [2026-08-29] 仅最终 Boss 通关给卡包 */}
                    {isWin && phase === 'stats' && pendingPacks > 0 && (
                        <motion.button
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            onClick={() => setPackOpen(true)}
                            className="px-6 py-2.5 rounded-xl bg-purple-600/30 border-2 border-purple-400/60 text-purple-200 font-black tracking-widest hover:bg-purple-600/50 hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.4)]"
                        >
                            🎁 打开卡包 ×{pendingPacks}
                        </motion.button>
                    )}

                    {/* 返回按钮 */}
                    <AnimatePresence>
                        {phase === 'stats' && (
                            <motion.button
                                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                onClick={onConfirm}
                                className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(168,85,247,0.5)] ${
                                    isWin
                                        ? 'bg-gradient-to-r from-yellow-600 to-amber-400 text-black'
                                        : 'bg-gradient-to-r from-purple-600 to-purple-400 text-white'
                                }`}
                            >
                                {isWin ? '返回肉鸽大厅' : '返回模式选择'}
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                {/* ══ 右半：天启者手牌大图 + 武装槽列（结算演出舞台） ══ */}
                <motion.div
                    initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 160, damping: 20 }}
                    className="flex items-center gap-7 shrink-0"
                >
                    <HeroHandContent heroKey={heroKey} scale={1.3} noLabels equipIds={liveValues.filter((v): v is string => !!v)} />

                    {/* 武装槽列（只画已解锁槽；共鸣/重修演出的舞台） */}
                    <div className="flex flex-col items-center gap-3">
                        {[0, 1, 2].map(i => {
                            const locked = i >= unlockSlots;
                            const liveEquipId = locked ? null : (liveValues[i] ?? null);
                            const capRarity = locked ? undefined : caps[i];
                            const isResoSlot = i === resoSlot;
                            const isRetrainSlot = retrain?.slots.includes(i) ?? false;
                            const tierCol = retrain ? TIER_COLOR[retrain.tier] : undefined;
                            // [2026-09-09 莉莉子] 演出期亮出被消耗的消耗品本体：结算时武装已清出槽（liveValues=空槽），
                            //   玩家看不到是谁在生效 → 特效播放期间临时把对应槽显示为该消耗品（图标走 def.icon 专属图），
                            //   特效播完（resoIconShow/retrainIconShow 变 false）图标消失、槽回归新品质上限空槽
                            const showResoIcon = isResoSlot && resoIconShow;
                            const showRetrainIcon = isRetrainSlot && retrainIconShow;
                            const equipId = showResoIcon ? 'arm_resonance_crystal'
                                : showRetrainIcon ? 'arm_retrain'
                                : liveEquipId;
                            return (
                                <div
                                    key={i}
                                    ref={el => { slotRefs.current[i] = el; }}
                                    className="relative"
                                >
                                    <ArmamentSlot height={84} equipId={equipId} locked={locked} capRarity={capRarity} />
                                    {/* 共鸣：白光消耗演出（白光本身由全局 beam 层飞向经验环） */}
                                    <AnimatePresence>
                                        {isResoSlot && resoFlash && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1.15 }} exit={{ opacity: 0, scale: 1.4 }}
                                                transition={{ duration: 0.18 }}
                                                className="absolute inset-0 z-10 pointer-events-none"
                                                style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', background: '#ffffff', boxShadow: '0 0 30px 12px rgba(255,255,255,0.9)' }}
                                            />
                                        )}
                                    </AnimatePresence>
                                    {/* 重修：升档品质光芒（闪光后常驻泛光，随统计阶段持续） */}
                                    {isRetrainSlot && (phase === 'retrain' || retrainDone) && tierCol && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.4 }}
                                            animate={retrainDone ? { opacity: [0.55, 0.4], scale: 1.15 } : { opacity: [0, 1, 0.2, 1, 0.2], scale: [0.4, 1.6, 1.25, 1.55, 1.2] }}
                                            transition={retrainDone ? { duration: 0.6 } : { duration: 0.9, times: [0, 0.25, 0.5, 0.75, 1] }}
                                            className="absolute inset-0 z-10 pointer-events-none rounded-full"
                                            style={{
                                                background: `radial-gradient(circle, ${tierCol}00 30%, ${tierCol}66 100%)`,
                                                filter: `drop-shadow(0 0 16px ${tierCol})`,
                                                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                        {/* 提示：正在发生什么 */}
                        <div className="h-5 text-[11px] font-mono tracking-wider text-purple-300/80">
                            {phase === 'reso' ? '碳原子板 · 经验翻倍' :
                             phase === 'retrain' ? `重修申请 · 槽位品质升至 ${TIER_NAME[retrain?.tier ?? 1]}` :
                             (phase === 'stats' && retrainDone && retrain ? `✨ 已可装备 ${TIER_NAME[retrain.tier]} 武装` : '')}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* [2026-09-04] 通关卡包·开箱演出 */}
            <PackOpenModal
                isOpen={packOpen}
                pendingPacks={pendingPacks}
                onOpenPack={() => onOpenPack?.() ?? null}
                onClose={() => setPackOpen(false)}
            />
        </div>
    );
};
