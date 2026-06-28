import React, { useState, useEffect, useMemo } from 'react';
import { LOADING_SCREEN_IMAGES } from '../data/imageData';

interface SystemLoadingScreenProps {
    onComplete: () => void;
}

export const SystemLoadingScreen: React.FC<SystemLoadingScreenProps> = ({ onComplete }) => {
    const [progress, setProgress] = useState(0);

    // 随机选择一张背景图 (使用 useMemo 确保组件重绘时背景不变)
    const bgImage = useMemo(() => {
        if (LOADING_SCREEN_IMAGES.length === 0) return '';
        const randomIndex = Math.floor(Math.random() * LOADING_SCREEN_IMAGES.length);
        return LOADING_SCREEN_IMAGES[randomIndex];
    }, []);

    // 模拟加载进度的 Effect
    useEffect(() => {
        // 预设加载时间：2秒 (2000ms)
        const duration = 2000;
        const intervalTime = 20; // 每20ms更新一次
        const steps = duration / intervalTime;
        const increment = 100 / steps;

        const timer = setInterval(() => {
            setProgress(prev => {
                const next = prev + increment;
                if (next >= 100) {
                    clearInterval(timer);
                    setTimeout(onComplete, 200); // 到达100%后稍微停顿一下再结束
                    return 100;
                }
                return next;
            });
        }, intervalTime);

        return () => clearInterval(timer);
    }, [onComplete]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col justify-end">
            {/* 1. 全屏背景图 */}
            <div className="absolute inset-0 z-0">
                <img
                    src={bgImage}
                    alt="加载中..."
                    className="w-full h-full object-cover opacity-80"
                />
                {/* 黑色遮罩，确保底部文字清晰 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/40"></div>
            </div>

            {/* 2. 底部 UI 区域 */}
            <div className="relative z-10 w-full px-12 pb-12 flex flex-col gap-2">

                {/* 进度百分比 (右下角) */}
                <div className="text-right">
                    <span className="text-6xl font-black text-white/20 tracking-tighter">
                        {Math.floor(progress)}%
                    </span>
                </div>

                {/* 进度条轨道 (灰色背景) */}
                <div className="w-full h-1 bg-gray-700/50 rounded-full relative overflow-visible">
                    {/* 进度填充 (白色) */}
                    <div
                        // [修复] 添加 'relative' 类，确立定位上下文
                        // 这样内部的 absolute right-0 才会相对于这个不断变长的白色条定位
                        className="h-full bg-white transition-all duration-75 ease-linear relative"
                        style={{ width: `${progress}%` }}
                    >
                        {/* 滑块 (Slider) */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-32 h-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.8)]"></div>
                        {/* 滑块头部的装饰点 */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-4 bg-white shadow-lg"></div>
                    </div>
                </div>

                {/* 加载提示文字 */}
                <div className="text-xs text-gray-500 font-mono tracking-[0.5em] mt-2">
                    ESTABLISHING NEURAL CONNECTION...
                </div>
            </div>
        </div>
    );
};