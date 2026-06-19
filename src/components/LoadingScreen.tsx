import React, { useState, useEffect} from 'react';
import { Sword } from 'lucide-react';
import { HERO_IMAGES, getSkinImage } from '../data/imageData'; // [修改] 引入皮肤提取引擎
// [新增] 引入 CARD_DB 以支持普通单位图片查找
import { CARD_DB } from '../data/cards';

interface LoadingScreenProps {
    heroKey: string;
    enemyHeroKey?: string;
    onComplete: () => void;
    onMatchFound?: () => void; // [新增] 匹配成功回调
    skinOverrides?: Record<string, number>; // [核心新增]
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
    heroKey, 
    enemyHeroKey = 'fenny',
    onComplete,
    onMatchFound, // [新增]
    skinOverrides = {} // [核心新增]
}) => {
    // 阶段控制: 'matching'(匹配中) -> 'found'(匹配成功) -> 'vs'(碰撞展示) -> 'loading'(读条) -> 'end'(结束)
    const [phase, setPhase] = useState<'matching' | 'found' | 'vs' | 'loading' | 'end'>('matching');
    const [matchTimer, setMatchTimer] = useState(0);
    const [progress, setProgress] = useState(0);
    // [核心重构] 智能图片获取函数 (支持高清皮肤动态抓取)
    const getArt = (key: string) => {
        const skinId = skinOverrides[key] || 0;

        // 1. 最高优先级：如果穿了皮肤，直接提取高清皮肤原画！
        // (注：由于我们只有一张高清大图作为 base，所以这里不区分 level 2，直接拿)
        if (skinId > 0) {
            const skinImg = getSkinImage(key, skinId, false);
            if (skinImg) return skinImg;
        }

        // 2. 其次尝试默认英雄图库 (高清竖图)
        if (HERO_IMAGES[key]) return HERO_IMAGES[key].base;

        // 3. 再次尝试卡牌数据库 (普通单位图)
        if (CARD_DB[key]) return CARD_DB[key].imageUrl;

        // 4. 兜底
        return '';
    };



    // 1. 匹配阶段计时器
    useEffect(() => {
        if (phase === 'matching') {
            const timer = setInterval(() => {
                setMatchTimer(prev => {
                    // PVE 模式下，1秒左右强制匹配成功
                    if (prev >= 1.0) {
                        clearInterval(timer);
                        setPhase('found');
                        // [新增] 触发匹配成功回调
                        if (onMatchFound) onMatchFound();
                        return prev;
                    }
                    return prev + 0.1;
                });
            }, 100);
            return () => clearInterval(timer);
        }
    }, [phase, onMatchFound]);

    // 2. 匹配成功 -> VS 动画
    useEffect(() => {
        if (phase === 'found') {
            // 显示"匹配成功" 0.5s 后进入 VS 画面
            const t = setTimeout(() => {
                setPhase('vs');
            }, 800);
            return () => clearTimeout(t);
        }
    }, [phase]);

    // 3. VS 动画 -> 开始加载条
    useEffect(() => {
        if (phase === 'vs') {
            // 碰撞动画播放约 1s 后，显示加载条
            const t = setTimeout(() => {
                setPhase('loading');
            }, 1200);
            return () => clearTimeout(t);
        }
    }, [phase]);

    // 4. 加载条逻辑 (模拟资源加载)
    useEffect(() => {
        if (phase === 'loading') {
            let currentProgress = 0;
            // 目标：3秒内跑完 (3000ms)
            // 这里的 interval 设为 30ms，共需跑 100 次
            const interval = setInterval(() => {
                currentProgress += 1;
                
                // 模拟卡顿：在 95% 处稍微卡一下，模拟等待资源就绪
                if (currentProgress >= 95 && currentProgress < 100) {
                    // 实际项目中这里会检查资源加载器状态
                    // 这里我们简单停留一下，由上面的逻辑自然流转? 
                    // 不，我们需要手动控制 setProgress
                }

                if (currentProgress >= 100) {
                    currentProgress = 100;
                    clearInterval(interval);
                    // 加载完成，进入结束阶段
                    setPhase('end');
                    // 延迟一点点触发回调，让玩家看到 100%
                    setTimeout(onComplete, 800); 
                }
                
                setProgress(currentProgress);
            }, 30); // 30ms * 100 = 3000ms (3秒)

            return () => clearInterval(interval);
        }
    }, [phase, onComplete]);

    const myHeroImg = getArt(heroKey);
    const enemyHeroImg = getArt(enemyHeroKey);

    // [新增] 自适应图片渲染组件 (复用逻辑)
    const AdaptiveImage = ({ src, alt, className }: { src: string, alt: string, className?: string }) => (
        <div className={`relative overflow-hidden ${className}`}>
            {/* 底层：模糊填充 */}
            <div className="absolute inset-0">
                <img src={src} className="w-full h-full object-cover blur-xl opacity-60 scale-110" alt="" />
            </div>
            {/* 顶层：完整展示 */}
            <div className="absolute inset-0 flex items-center justify-center">
                <img src={src} className="w-full h-full object-contain drop-shadow-2xl" alt={alt} />
            </div>
            {/* 统一遮罩 (可选，增加氛围感) */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30 pointer-events-none"></div>
        </div>
    );

    if (phase === 'matching' || phase === 'found') {
        return (
            <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in text-white font-mono">
                <div className="text-2xl font-bold tracking-widest mb-4 animate-pulse">
                    {phase === 'matching' ? '匹配中...' : '匹配成功!'}
                </div>
                <div className="text-4xl font-black text-blue-400">
                    {matchTimer.toFixed(1)}s
                </div>
                <div className="mt-8 text-xs text-gray-400">
                    匹配时间: 00:01
                </div>
            </div>
        );
    }

    return (
        <div className={`
            fixed inset-0 z-[1000] bg-black overflow-hidden flex items-center justify-center
            transition-opacity duration-1000
            ${phase === 'end' ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}>
            {/* 背景动态纹理 */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 animate-pulse-slow"></div>

            {/* --- 英雄原画层 --- */}
            <div className={`relative w-full h-full max-w-7xl flex justify-between items-center transition-transform duration-1000 ${phase === 'end' ? 'scale-110' : 'scale-100'}`}>
                
                {/* 我方英雄 (左) */}
                <div className={`
                    relative w-[45%] h-[80%]
                    /* [修改] 移除 overflow-hidden，因为它现在由 AdaptiveImage 内部控制 */
                    rounded-r-3xl border-r-4 border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.5)]
                    transform transition-all duration-1000 ease-out
                    ${phase === 'end' ? '-translate-x-[150%]' : 'translate-x-0'}
                    animate-[hero-slide-in-left_0.8s_cubic-bezier(0.2,0.8,0.2,1)_forwards]
                `}>
                    {/* [修改] 使用自适应组件替换原本的 img */}
                    <AdaptiveImage src={myHeroImg} alt="Player" className="w-full h-full rounded-r-3xl overflow-hidden" />

                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-10 left-10 text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-white italic tracking-tighter opacity-80 drop-shadow-lg z-10">
                        PLAYER
                    </div>
                </div>

                {/* 敌方英雄 (右) */}
                <div className={`
                    relative w-[45%] h-[80%]
                    rounded-l-3xl border-l-4 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)]
                    transform transition-all duration-1000 ease-out
                    ${phase === 'end' ? 'translate-x-[150%]' : 'translate-x-0'}
                    animate-[hero-slide-in-right_0.8s_cubic-bezier(0.2,0.8,0.2,1)_forwards]
                `}>
                    {/* [修改] 使用自适应组件 */}
                    <AdaptiveImage src={enemyHeroImg} alt="Enemy" className="w-full h-full rounded-l-3xl overflow-hidden" />

                    <div className="absolute inset-0 bg-gradient-to-l from-black/80 via-transparent to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-10 right-10 text-6xl font-black text-transparent bg-clip-text bg-gradient-to-l from-red-400 to-white italic tracking-tighter opacity-80 drop-shadow-lg z-10">
                        ENEMY
                    </div>
                </div>

            </div>

            {/* --- VS 图标 (中心) --- */}
            <div className={`
                absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20
                flex flex-col items-center justify-center
                transition-all duration-500
                ${phase === 'end' ? 'opacity-0 scale-50' : 'opacity-100'}
            `}>
                <div className="relative animate-[vs-pop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_0.6s_both]">
                    <div className="text-9xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] tracking-tighter">
                        VS
                    </div>
                    {/* 装饰剑 */}
                    <Sword className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-yellow-500/30 rotate-45 -z-10" />
                </div>
            </div>

            {/* --- 加载光柱 (Loading Bars) --- */}
            {(phase === 'loading' || phase === 'end') && (
                <div className={`absolute top-1/2 left-0 w-full h-2 z-10 transition-opacity duration-500 ${phase === 'end' ? 'opacity-0' : 'opacity-100'}`}>
                    {/* 左侧光柱 (蓝) -> 向右延伸 */}
                    <div 
                        className="absolute top-0 left-0 h-full bg-blue-500 shadow-[0_0_20px_#3b82f6] transition-all duration-100 ease-linear"
                        style={{ width: `${progress / 2}%` }} // 最终到达 50%
                    ></div>
                    
                    {/* 右侧光柱 (红) -> 向左延伸 */}
                    <div 
                        className="absolute top-0 right-0 h-full bg-red-500 shadow-[0_0_20px_#ef4444] transition-all duration-100 ease-linear"
                        style={{ width: `${progress / 2}%` }} // 最终到达 50%
                    ></div>

                    {/* 中心进度文字 */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-white/50 font-mono text-xs tracking-[0.5em]">
                        LOADING DATA... {progress}%
                    </div>
                </div>
            )}
        </div>
    );
};