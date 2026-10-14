// ==========================================
// 全屏控制
// [2026-10-14 程拍板] **从「右上角独立按钮」收进设置窗口**：
//   原来是一个 `fixed top-0 right-0 z-[9999]` 的悬浮按钮（全局常驻），
//   与设置里的其他显示类开关割裂 ⇒ 现在只导出 `useFullscreen()` hook，
//   由 `SettingsModal` 的「Video Quality → Display」区渲染成一行开关。
//   ⚠️ 文件名保留（项目红线：不删文件），内容已由组件改为 hook。
// ==========================================
import { useState, useEffect } from 'react';

/** 全屏状态 + 切换（监听 fullscreenchange，含用户按 ESC / F11 自行退出） */
export const useFullscreen = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
        handleChange(); // 初次挂载先同步一次（可能已是全屏，如从浏览器记忆恢复）
        document.addEventListener('fullscreenchange', handleChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleChange);
        };
    }, []);

    const toggleFullscreen = async () => {
        try {
            if (!document.fullscreenElement) {
                // 进入全屏
                await document.documentElement.requestFullscreen();
            } else {
                // 退出全屏
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
            }
        } catch (err) {
            console.warn("Fullscreen toggle failed:", err);
        }
    };

    return { isFullscreen, toggleFullscreen };
};
