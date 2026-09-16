import React from 'react';
import { Play, Settings, Power } from 'lucide-react';

interface PauseOverlayProps {
    onResume: () => void;
    onOpenSettings?: () => void; // 齿轮 → 打开设置面板
    onQuitGame?: () => void;     // 关机 → 退出并关闭游戏
}

/**
 * [2026-08-30 莉莉子] 局内暂停层
 * 对局中按 ESC 后全屏遮罩，中央三按钮：继续(Play) / 设置(Settings) / 退出游戏(Power)
 * z-1000：盖住对局各层(LevelUp/GameOver 300、Overlays 300~400、抉择 500、抽卡动画 999)，低于设置面板(SettingsModal z-1100)
 *
 * [2026-09-15 莉莉子] 原为 z-800，程实测被抽卡动画盖住（CardAnimations 多处 z-[999]，
 * 其中 1761 行是 fixed inset-0 的全屏层）→ 暂停层上调至 1000 越过它；
 * 设置面板同步 1000→1100，以维持「暂停层 < 设置面板」的既有关系（面板从暂停层打开，必须更高）。
 */
export const PauseOverlay: React.FC<PauseOverlayProps> = ({ onResume, onOpenSettings, onQuitGame }) => {
    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center">
            {/* 标题 */}
            <h2 className="text-4xl font-black italic tracking-widest text-white mb-16 drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]">
                游 戏 暂 停
            </h2>

            {/* 中央三按钮 */}
            <div className="flex items-center gap-10">
                <PauseButton label="继 续" onClick={onResume} icon={<Play size={42} />} />
                {onOpenSettings && <PauseButton label="设 置" onClick={onOpenSettings} icon={<Settings size={42} />} />}
                {onQuitGame && <PauseButton label="退出游戏" onClick={onQuitGame} icon={<Power size={42} />} />}
            </div>
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
