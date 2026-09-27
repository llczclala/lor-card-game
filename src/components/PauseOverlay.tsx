import React, { useState } from 'react';
import { Play, Settings, Flag, AlertTriangle } from 'lucide-react';

interface PauseOverlayProps {
    onResume: () => void;
    onOpenSettings?: () => void;   // 齿轮 → 打开设置面板
    /** @deprecated 旧的「退出游戏」（window.close）—— 保留仅为了尚未接完 surrender 的调用点仍可编译 */
    onQuitGame?: () => void;
    onSurrender?: () => void;      // [2026-09-25 莉莉子] 投降（替代原「退出游戏」）
    onRestartBattle?: () => void;  // [2026-09-25 莉莉子] 我遇到了BUG需要重开：重开本场战斗，不消耗任何内容
    surrenderNote?: string;        // 二级确认窗里的后果说明（由 App 按模式给出）
}

/**
 * [2026-08-30 莉莉子] 局内暂停层
 * 对局中按 ESC 后全屏遮罩，中央三按钮：继续(Play) / 设置(Settings) / **投降**(Flag)
 * z-1000：盖住对局各层(LevelUp/GameOver 300、Overlays 300~400、抉择 500、抽卡动画 999)，低于设置面板(SettingsModal z-1100)
 *
 * [2026-09-15 莉莉子] 原为 z-800，程实测被抽卡动画盖住（CardAnimations 多处 z-[999]，
 * 其中 1761 行是 fixed inset-0 的全屏层）→ 暂停层上调至 1000 越过它；
 * 设置面板同步 1000→1100，以维持「暂停层 < 设置面板」的既有关系（面板从暂停层打开，必须更高）。
 *
 * [2026-09-25 莉莉子 投降] 第三按钮由「退出游戏」改为「投降」：
 *   原功能是 window.close() 直接关掉游戏 —— 与设置面板里的 QUIT GAME 完全重合，
 *   也不符合玩家直觉（点它多半是"这把打不了了"，而不是想退游戏）。
 *   现在改为三选项二级确认：是（投降）/ 否 / 我遇到了BUG需要重开（重开本场、不消耗任何内容）。
 *   z-[1200]：确认窗要盖住暂停层(1000)与设置面板(1100)。
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({ onResume, onOpenSettings, onQuitGame, onSurrender, onRestartBattle, surrenderNote }) => {
    const [confirming, setConfirming] = useState(false);
    // 投降优先；尚未接完 surrender 的调用点仍走旧的「退出游戏」
    const third = onSurrender ?? onQuitGame;
    const thirdLabel = onSurrender ? '投 降' : '退出游戏';
    return (
        <div className="pause-overlay fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
            {/* 标题 */}
            <h2 className="text-4xl font-black italic tracking-widest text-white mb-16 drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                游 戏 暂 停
            </h2>

            {/* 中央三按钮 */}
            <div className="flex items-center gap-10">
                <PauseButton label="继 续" onClick={onResume} icon={<Play size={42} />} />
                {onOpenSettings && <PauseButton label="设 置" onClick={onOpenSettings} icon={<Settings size={42} />} />}
                {third && (
                    <PauseButton
                        label={thirdLabel}
                        onClick={() => { if (onSurrender) setConfirming(true); else onQuitGame?.(); }}
                        icon={<Flag size={42} />}
                    />
                )}
            </div>

            {/* 投降二级确认：是 / 否 / 我遇到了BUG需要重开
                风格对齐一级暂停层（玻璃质感 + rounded-3xl + tracking-widest + 英文副标题），并收窄到 336px */}
            {confirming && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={e => e.stopPropagation()}>
                    <div className="w-[min(92vw,336px)] rounded-3xl bg-slate-900/85 backdrop-blur-xl border border-white/15 shadow-2xl p-6 text-center animate-pop-in"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-1 mb-3">
                            <AlertTriangle size={28} className="text-amber-400" />
                            <h3 className="text-xl font-black tracking-[0.2em] text-white">确认要投降？</h3>
                            <p className="text-[10px] font-mono tracking-[0.2em] text-white/35">CONFIRM SURRENDER</p>
                        </div>
                        {surrenderNote && (
                            <div className="text-[12px] text-amber-200/85 mb-4 leading-relaxed whitespace-pre-line text-left bg-white/[0.04] border border-white/10 rounded-2xl px-3.5 py-2.5">
                                {surrenderNote}
                            </div>
                        )}
                        <div className="flex gap-2.5">
                            <button
                                onClick={() => { setConfirming(false); onSurrender?.(); }}
                                className="flex-1 py-2.5 rounded-2xl bg-white/10 hover:bg-red-500/25 border border-white/20 hover:border-red-400/60 text-white font-black tracking-[0.2em] transition-all duration-200 backdrop-blur-md hover:scale-[1.03]"
                            >是</button>
                            <button
                                onClick={() => setConfirming(false)}
                                className="flex-1 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/50 text-white/90 font-black tracking-[0.2em] transition-all duration-200 backdrop-blur-md hover:scale-[1.03]"
                            >否</button>
                        </div>
                        {onRestartBattle && (
                            <>
                                <button
                                    onClick={() => { setConfirming(false); onRestartBattle(); }}
                                    className="mt-2.5 w-full py-2 rounded-2xl bg-transparent hover:bg-sky-500/15 border border-dashed border-sky-400/40 hover:border-sky-400/80 text-sky-300 text-[12px] font-bold tracking-wider transition-all duration-200"
                                >我遇到了BUG需要重开</button>
                                <p className="text-[10px] text-white/35 mt-2 leading-relaxed">重开本场战斗，<span className="text-sky-300/80">不消耗任何内容</span></p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const PauseButton: React.FC<{ label: string; onClick: () => void; icon: React.ReactNode }> = ({ label, onClick, icon }) => (
    <button
        onClick={onClick}
        className="flex flex-col items-center gap-4 w-32 h-32 rounded-3xl bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/50 text-white transition-all duration-200 backdrop-blur-md group"
    >
        <span className="mt-6 text-white/85 group-hover:text-white group-hover:scale-110 transition-transform">{icon}</span>
        <span className="text-sm font-bold tracking-widest text-white/90">{label}</span>
    </button>
);
