import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SENTRY_IMAGE_HASH, SENTRY_IMAGE_PATH } from '../data/sentryHash';
import titleLogo from '../image/icon/titile.webp'; // [哨兵] 游戏标题图片
import { eventBus, GameEvents } from '../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 首次点击音效
import { pickTuning } from '../platform/tuning';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 启动页 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 只管这一段流程：健康游戏忠告 → 免责声明。不碰别的界面。
// 改完存盘即生效（HMR 直接刷新，电脑上就能看到，不用出包）。
// 用法：先调【主旋钮】scale 把整体大小定下来，再动下面的细节值。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】本屏两份值：`SPLASH_UI_MOBILE`（手机端，程在雷电里调）+ `SPLASH_UI_PC`（PC 端，见下方）。
//   判定收在 `src/platform/tuning.ts`；电脑浏览器 = PC 版，雷电 = 手机版，天然可对比。
const SPLASH_UI_MOBILE = {
    /** 【主旋钮】整屏内容整体缩放（1 = 原样） */
    scale: 1,

    /** ① 《健康游戏忠告》 */
    health: {
        titleSize: 120,      // 标题字号 px（原 text-4xl）
        titleGap: 48,       // 标题 ↓ 正文的间距 px（原 mb-6）
        bodySize: 48,       // 正文字号 px（原 text-2xl）
        lineGap: 40,        // 行与行的间距 px（原 space-y-5）
        offsetY: 0,         // 整块上下位置：正数下移 / 负数上移 px
    },

    /** ② 免责声明 */
    legal: {
        logoWidth: 630,     // 标题图宽度 px（原 w-[420px]）
        logoGap: 60,        // 标题图 ↓ 文字的间距 px（原 mb-10）
        strongSize: 27,     // 前 2 行字号 px（原 text-lg）
        bodySize: 24,       // 其余行字号 px（原 text-base）
        lineGap: 6,         // 行与行的间距 px（原 space-y-1）
        blankHeight: 18,    // 空行占位高度 px（原 h-3）
        textGap: 60,        // 文字块 ↓ 按钮的间距 px（原 mb-10）
        btnFontSize: 21,    // 「点击进入游戏」字号 px（原 text-sm）
        btnPadX: 60,        // 按钮左右内边距 px（原 px-10）
        btnPadY: 18,        // 按钮上下内边距 px（原 py-3）
        versionSize: 10,    // 底部版本号字号 px（原 text-[10px]）
        versionBottom: 18,  // 版本号距屏幕底边 px（原 bottom-6）
    },
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`git show e6963262:src/components/SplashScreen.tsx`（2026-10-13，
//       = 本周手机端适配开始前的版本），逐项由那一版的 Tailwind 类反推：
//       `space-y-5` / `text-4xl mb-6` / `text-2xl` / `w-[420px] mb-10` / `space-y-1` / `bottom-6` …
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// 嵌套对象（health / legal）各自浅合并，因为 texture 是两层结构。
// ══════════════════════════════════════════════════════════════════════
const SPLASH_UI_PC = {
    ...SPLASH_UI_MOBILE,
    health: {
        ...SPLASH_UI_MOBILE.health,
        titleSize: 36,   // 原 text-4xl
        titleGap: 24,    // 原 mb-6
        bodySize: 24,    // 原 text-2xl
        lineGap: 20,     // 原 space-y-5
    },
    legal: {
        ...SPLASH_UI_MOBILE.legal,
        logoWidth: 420,      // 原 w-[420px]
        logoGap: 40,         // 原 mb-10
        strongSize: 18,      // 原 text-lg
        bodySize: 16,        // 原 text-base
        lineGap: 4,          // 原 space-y-1
        blankHeight: 12,     // 原 h-3
        textGap: 40,         // 原 mb-10
        btnFontSize: 14,     // 原 text-sm
        btnPadX: 40,         // 原 px-10
        btnPadY: 12,         // 原 py-3
        /** ⚠️ 这是本屏**唯一被手机端调小**的项（18 → 24）：PC 端恢复后版本号会**往上抬** */
        versionBottom: 24,   // 原 bottom-6
    },
};

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const SPLASH_UI = pickTuning(SPLASH_UI_PC, SPLASH_UI_MOBILE);

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
            {/* 尺寸全部来自顶部 🎛️ SPLASH_UI.health */}
            <div
                className="text-center px-8 flex flex-col items-center"
                style={{
                    gap: SPLASH_UI.health.lineGap,
                    marginTop: SPLASH_UI.health.offsetY,
                    transform: `scale(${SPLASH_UI.scale})`,
                    transformOrigin: 'center center',
                }}
            >
                {HEALTH_ADVICE.map((line, i) => (
                    <p
                        key={i}
                        className={`font-sans tracking-wider leading-relaxed ${i === 0 ? 'font-bold text-white' : 'text-white/90'}`}
                        style={
                            i === 0
                                ? { fontSize: SPLASH_UI.health.titleSize, marginBottom: SPLASH_UI.health.titleGap }
                                : { fontSize: SPLASH_UI.health.bodySize }
                        }
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

            {/* 尺寸全部来自顶部 🎛️ SPLASH_UI.legal */}
            <div
                className="relative z-10 flex flex-col items-center"
                style={{
                    transform: `scale(${SPLASH_UI.scale})`,
                    transformOrigin: 'center center',
                }}
            >
                {/* 标题图片 */}
                <img
                    src={titleLogo}
                    className="drop-shadow-[0_0_30px_rgba(0,200,255,0.15)]"
                    style={{ width: SPLASH_UI.legal.logoWidth, marginBottom: SPLASH_UI.legal.logoGap }}
                    alt="尘白禁区 Rivals"
                />

                {/* 免责声明正文 — 蓝色数据流字体，倾斜加粗居中 */}
                <div
                    className="text-center max-w-lg flex flex-col items-center"
                    style={{
                        gap: SPLASH_UI.legal.lineGap,
                        marginBottom: SPLASH_UI.legal.textGap,
                    }}
                >
                    {DISCLAIMER_TEXT.map((line, i) => (
                        <p
                            key={i}
                            className={line === '' ? '' : 'italic font-bold tracking-wide'}
                            style={
                                line === ''
                                    ? { height: SPLASH_UI.legal.blankHeight }
                                    : {
                                        fontSize: i === 0 || i === 1
                                            ? SPLASH_UI.legal.strongSize
                                            : SPLASH_UI.legal.bodySize,
                                        color: '#00d4ff',
                                        textShadow: '0 0 8px rgba(0, 212, 255, 0.3), 0 0 20px rgba(0, 212, 255, 0.1)',
                                        fontFamily: "'Courier New', 'Noto Sans SC', monospace",
                                    }
                            }
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
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onComplete(); }}
                            className="rounded-lg bg-white/5 border border-cyan-400/20 text-cyan-300/80
                                       hover:bg-white/10 hover:border-cyan-400/50 hover:text-cyan-200
                                       transition-all duration-300 tracking-[0.2em] font-mono
                                       active:scale-95"
                            style={{
                                fontSize: SPLASH_UI.legal.btnFontSize,
                                padding: `${SPLASH_UI.legal.btnPadY}px ${SPLASH_UI.legal.btnPadX}px`,
                                textShadow: '0 0 6px rgba(0, 212, 255, 0.2)',
                            }}
                        >
                            点击进入游戏
                        </button>
                    )}
                </motion.div>
            </div>

            {/* 底部版本 */}
            {/* [2026-10-18 莉莉子 BUG修复] 此前这里是**硬编码 `v1.0.7`**，从 1.0.7 之后一路没再跟过版本
                ⇒ 玩家每次开机看到的都是错版本号（v1.0.20 时仍显示 1.0.7）。
                现改用全项目统一的编译期常量 `import.meta.env.PACKAGE_VERSION`
                （由 `vite.config.ts` / `vite.android.config.ts` 从 `package.json` 注入，
                  声明见 `src/vite-env.d.ts:45`；设置页与 `App.tsx` 走的也是这条通路）。
                ⚠️ 防回归：**任何界面都不许再手写版本号** —— 改 `package.json` 一处即可全局跟随。 */}
            <div
                className="absolute text-slate-300 tracking-wider font-mono"
                style={{
                    bottom: SPLASH_UI.legal.versionBottom,
                    fontSize: SPLASH_UI.legal.versionSize,
                }}
            >
                v{import.meta.env.PACKAGE_VERSION} · FAN-MADE · FREE
            </div>
        </motion.div>
    );
};
