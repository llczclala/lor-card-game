import React, { useState, useEffect } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export const FullScreenToggle: React.FC = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    // 监听全屏状态变化 (包括用户按 ESC 退出)
    useEffect(() => {
        const handleChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        // 绑定标准事件
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

    return (
        <button
            onClick={toggleFullscreen}
            // [修复] 将 right-4 修改为 left-4，将全屏按钮移至屏幕左上角
            className="fixed top-4 left-4 z-[9999] p-2 bg-slate-900/50 hover:bg-slate-800/80 text-gray-400 hover:text-white rounded-full backdrop-blur-sm transition-all duration-200 border border-white/10 hover:scale-110 shadow-lg group"
            title={isFullscreen ? "退出全屏" : "全屏模式"}
        >
            {isFullscreen ? (
                <Minimize size={24} className="group-hover:text-blue-400 transition-colors" />
            ) : (
                <Maximize size={24} className="group-hover:text-yellow-400 transition-colors" />
            )}
        </button>
    );
};