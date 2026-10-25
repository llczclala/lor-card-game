// ==========================================
// 全屏控制
// [2026-10-14 程拍板] **从「右上角独立按钮」收进设置窗口**：
//   原来是一个 `fixed top-0 right-0 z-[9999]` 的悬浮按钮（全局常驻），
//   与设置里的其他显示类开关割裂 ⇒ 现在只导出 `useFullscreen()` hook，
//   由 `SettingsModal` 的「Video Quality → Display」区渲染成一行开关。
//   ⚠️ 文件名保留（项目红线：不删文件），内容已由组件改为 hook。
//
// [2026-10-24 莉莉子 · ESC 归属权改造] 两处变更：
//   ① 真正的全屏动作 / Esc 判据**全部收进** `utils/fullscreen.ts`（唯一真源），
//      本文件只留"React 状态镜像"，避免两份 toggle 实现迟早漂移。
//   ② 右上角悬浮按钮**回来了**，但不是常驻 —— 由设置项「右上角：全屏按钮」控制，
//      与新增的「暂停按钮」一起住在 `TopRightControls.tsx`。
// ==========================================
import { useState, useEffect } from 'react';
import { isFullscreenActive, toggleFullscreen as toggleFullscreenImpl } from '../utils/fullscreen';

/** 全屏状态 + 切换（监听 fullscreenchange，含用户按 ESC / F11 自行退出） */
export const useFullscreen = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleChange = () => setIsFullscreen(isFullscreenActive());
        handleChange(); // 初次挂载先同步一次（可能已是全屏，如从浏览器记忆恢复）
        document.addEventListener('fullscreenchange', handleChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleChange);
        };
    }, []);

    return { isFullscreen, toggleFullscreen: toggleFullscreenImpl };
};
