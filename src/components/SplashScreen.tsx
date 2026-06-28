import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SENTRY_IMAGE_HASH, SENTRY_IMAGE_PATH } from '../data/sentryHash';
import titleLogo from '../image/icon/titile.png'; // [哨兵] 游戏标题图片

/** 使用 Web Crypto API 计算 SHA-256 */
async function computeSHA256(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`无法加载校验图片 (HTTP ${response.status})`);
    const buffer = await response.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface SplashScreenProps {
    onComplete: () => void;
}

// =============================================
// 健康游戏忠告文案
// =============================================
const HEALTH_ADVICE = [
    '《健康游戏忠告》',
    '',
    '抵制不良游戏，拒绝盗版游戏。',
    '注意自我保护，谨防受骗上当。',
    '适度游戏益脑，沉迷游戏伤身。',
    '合理安排时间，享受健康生活。',
];

// =============================================
// 免责声明文案
// =============================================
const DISCLAIMER_TEXT = [
    '本游戏为《尘白禁区》二次创作同人作品',
    '由 大话丶EZ 独立开发制作',
    '',
    '本游戏完全免费，不涉及任何盈利行为',
    '所有美术素材、音乐、音效版权归原版权方所有',
    '如果您通过任何付费渠道获得本游戏，请立即联系卖家退款',
    '',
    '严禁任何形式的倒卖、盗用、二次修改后声称原创的行为',
    '如发现侵权行为，请联系 B站：大话丶EZ',
];

type SplashPhase = 'loading' | 'health_advice' | 'disclaimer' | 'failed';

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    const [phase, setPhase] = useState<SplashPhase>('loading');
    const [hashVerified, setHashVerified] = useState(false);
    const [showContinue, setShowContinue] = useState(false);

    // =============================================
    // 阶段 0: 哈希校验（loading 时并行执行）
    // =============================================
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const hash = await computeSHA256(SENTRY_IMAGE_PATH);
                if (cancelled) return;
                if (hash === SENTRY_IMAGE_HASH) {
                    console.log('[哨兵] 头像校验通过 ✅');
                    setHashVerified(true);
                } else {
                    console.warn('[哨兵] 头像校验失败 ❌');
                    if (!cancelled) setPhase('failed');
                }
            } catch (e) {
                console.warn('[哨兵] 校验过程异常:', e);
                if (!cancelled) setPhase('failed');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // =============================================
    // 阶段 0→1: 校验通过后，短延迟进入健康忠告
    // =============================================
    useEffect(() => {
        if (!hashVerified) return;
        const timer = setTimeout(() => setPhase('health_advice'), 300);
        return () => clearTimeout(timer);
    }, [hashVerified]);

    // =============================================
    // 阶段 1→2: 健康忠告淡入淡出后进入免责声明
    // =============================================
    const handleHealthAdviceComplete = () => {
        setPhase('disclaimer');
        // 免责声明显示后，延迟展示"点击进入游戏"按钮
        setTimeout(() => setShowContinue(true), 2000);
    };

    // =============================================
    // [校验失败] 卡死画面——一切静止，没有任何线索
    // =============================================
    if (phase === 'failed') {
        return (
            <div className="fixed inset-0 z-[9999] bg-black" />
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black">
            <AnimatePresence mode="wait">
                {/* ════════════════════════════════════
                    阶段 1: 健康游戏忠告（淡入淡出）
                    ════════════════════════════════════ */}
                {phase === 'health_advice' && (
                    <HealthAdviceScreen key="health" onComplete={handleHealthAdviceComplete} />
                )}

                {/* ════════════════════════════════════
                    阶段 2: 免责声明
                    ════════════════════════════════════ */}
                {phase === 'disclaimer' && (
                    <DisclaimerScreen
                        key="disclaimer"
                        showContinue={showContinue}
                        onComplete={onComplete}
                    />
                )}
            </AnimatePresence>

            {/* ════════════════════════════════════
                阶段 0: loading（校验中）— 纯黑无文字
                ════════════════════════════════════ */}
            {phase === 'loading' && (
                <div className="absolute inset-0 bg-black" />
            )}
        </div>
    );
};

// =============================================
// 健康游戏忠告子组件
// =============================================
const HealthAdviceScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        // 挂载后立即开始淡入
        const fadeIn = setTimeout(() => setShow(true), 50);
        // 2.5s 后开始淡出
        const fadeOut = setTimeout(() => setShow(false), 3000);
        // 3.5s 后切换到下一阶段（淡出动画有 1s）
        const done = setTimeout(() => onComplete(), 4000);

        return () => {
            clearTimeout(fadeIn);
            clearTimeout(fadeOut);
            clearTimeout(done);
        };
    }, [onComplete]);

    return (
        <motion.div
            className="absolute inset-0 bg-black flex flex-col items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 1, ease: 'easeInOut' }}
        >
            <div className="text-center space-y-5 px-8">
                {HEALTH_ADVICE.map((line, i) => (
                    <p
                        key={i}
                        className={`font-sans tracking-wider leading-relaxed ${
                            i === 0
                                ? 'text-4xl font-bold text-white mb-6'
                                : 'text-2xl text-white/90'
                        }`}
                    >
                        {line}
                    </p>
                ))}
            </div>
        </motion.div>
    );
};

// =============================================
// 免责声明子组件
// =============================================
const DisclaimerScreen: React.FC<{
    showContinue: boolean;
    onComplete: () => void;
}> = ({ showContinue, onComplete }) => {
    return (
        <motion.div
            className="absolute inset-0 bg-black flex flex-col items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
        >
            {/* 背景微光 */}
            <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(ellipse_at_center,_rgba(0,200,255,0.6)_0%,_transparent_70%)]" />

            <div className="relative z-10 flex flex-col items-center">
                {/* 标题图片 */}
                <img
                    src={titleLogo}
                    className="w-[420px] mb-10 drop-shadow-[0_0_30px_rgba(0,200,255,0.15)]"
                    alt="尘白禁区 Rivals"
                />

                {/* 免责声明正文 — 蓝色数据流字体，倾斜加粗居中 */}
                <div className="text-center max-w-lg mb-10 space-y-1">
                    {DISCLAIMER_TEXT.map((line, i) => (
                        <p
                            key={i}
                            className={`${
                                line === ''
                                    ? 'h-3'
                                    : 'italic font-bold'
                            } ${
                                i === 0 || i === 1
                                    ? 'text-lg'
                                    : 'text-base'
                            } tracking-wide`
                            }
                            style={{
                                color: '#00d4ff',
                                textShadow: '0 0 8px rgba(0, 212, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.1)',
                                fontFamily: "'Courier New', 'Noto Sans SC', monospace",
                            }}
                        >
                            {line}
                        </p>
                    ))}
                </div>

                {/* 继续按钮 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={showContinue ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.6 }}
                >
                    {showContinue && (
                        <button
                            onClick={onComplete}
                            className="px-10 py-3 rounded-lg bg-white/5 border border-cyan-400/20 text-cyan-300/80
                                       hover:bg-white/10 hover:border-cyan-400/50 hover:text-cyan-200
                                       transition-all duration-300 tracking-[0.2em] text-sm font-mono
                                       active:scale-95"
                            style={{ textShadow: '0 0 6px rgba(0, 212, 255, 0.2)' }}
                        >
                            点击进入游戏
                        </button>
                    )}
                </motion.div>
            </div>

            {/* 底部版本 */}
            <div className="absolute bottom-6 text-[10px] text-slate-800 tracking-wider font-mono">
                v1.0.3 · FAN-MADE · FREE
            </div>
        </motion.div>
    );
};
