import React, { useEffect, useState, useRef } from 'react';

// [关键配置] 你的目标分辨率 (2560x1600)
const GAME_WIDTH = 1680;
const GAME_HEIGHT = 1050;

interface ScaleWrapperProps {
    children: React.ReactNode;
}

export const ScaleWrapper: React.FC<ScaleWrapperProps> = ({ children }) => {
    const [scale, setScale] = useState(1);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleResize = () => {
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            // 1. 计算宽和高的缩放比例
            const scaleX = windowWidth / GAME_WIDTH;
            const scaleY = windowHeight / GAME_HEIGHT;

            // 2. 选择较小的比例 (Contain 模式)
            // 保证游戏内容完整显示在屏幕内，不足的地方留黑边
            const currentScale = Math.min(scaleX, scaleY);

            setScale(currentScale);
        };

        // 初始化计算
        handleResize();

        // 监听窗口变化 (使用防抖可以进一步优化性能，但这里保持实时响应)
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                backgroundColor: '#000000',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'hidden',
                margin: 0,
                padding: 0
            }}
        >
            <div
                id="game-scale-container"
                ref={wrapperRef}
                style={{
                    // [核心修复] 禁止 Flex 容器压缩子元素！
                    // 加上这一行，2560px 就会硬撑开，不会被 1715px 的屏幕挤扁
                    flexShrink: 0,

                    // 强制锁定内部尺寸
                    width: `${GAME_WIDTH}px`,
                    height: `${GAME_HEIGHT}px`,

                    // 缩放控制
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',

                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 0 50px rgba(0,0,0,0.5)'
                }}
            >
                {children}
            </div>
        </div>
    );
};