/**
 * QrScanner.tsx —— 全屏**实时**扫码（不是拍照）+ 现场诊断
 * ============================================================================
 * 2026-10-21 第三次实测反馈后的重做（前两次的坑记在这里，别再踩）：
 *
 * ① 「扫描框好小一个」—— 根因是 `58vmin`。本项目的画面在 `ScaleWrapper` 的
 *    `transform: scale()` 里，**视口单位会被二次缩放**（《规范-界面调参区》硬规矩 6）
 *    ⇒ 框缩成一小坨。现在一律用**容器布局 px**（不含 transform），并跟随容器尺寸算。
 *
 * ② 「扫到了但放错区域」—— 根因：`video` 是 `object-cover`，屏幕上看到的是**视频的一部分**，
 *    而旧代码固定裁"短边 62% 的中心方"，两者毫无换算关系 ⇒ 框里看到的 ≠ 送去解码的。
 *    现在按 object-cover 的公式反算**屏幕上真正可见的那块视频区域**，直接解它：
 *    「屏幕上看到的都会被解码」，框只是"建议摆这里"的提示。
 *
 * ③ 「举了 26 秒、解了约 790 次才成功 1 次」—— 根因见 `qrDecode.ts` 头部（零容错）。
 *    本文件这一层能做的三件事：
 *      · **优先用系统原生识别器**（`BarcodeDetector`）—— 安卓 Chrome / 三星 / UC / QQ 支持，
 *        底层是 ML Kit / Play Services，比 JS 快一个量级。不支持时自动回退到手写解码器。
 *      · **显式要求连续自动对焦**（`focusMode: continuous`）—— 手机上最常见的是"根本没对上焦"。
 *      · 提高送解码的分辨率（旧版 640 长边 → 现在 1000），让模块有足够像素。
 *
 * 诊断条会显示**用的是哪个引擎**（native / js）：一测就知道这台机器上原生识别器可用不可用。
 */

import React, { useEffect, useRef, useState } from 'react';
import { createQrDiag, decodeQrFromGray, rgbaToGray, PAIR_PREFIX } from '../utils/saveSync/qrDecode';

interface QrScannerProps {
    /** 解出内容时回调（只回调一次） */
    onResult: (text: string) => void;
    onClose: () => void;
}

/** 送去解码的最长边（px）。太小 ⇒ 模块像素不够；太大 ⇒ 手机主线程扛不住 */
const FRAME_MAX = 1000;

/** 建议框占容器短边的比例（只是"摆这里"的提示，解码范围比它大） */
const BOX_RATIO = 0.78;

/** object-cover 下，"屏幕上真正可见"的那块视频区域（视频像素坐标） */
function visibleVideoRect(vw: number, vh: number, cw: number, ch: number) {
    if (!vw || !vh || !cw || !ch) return null;
    const scale = Math.max(cw / vw, ch / vh);
    const sw = Math.min(vw, cw / scale);
    const sh = Math.min(vh, ch / scale);
    return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

interface NativeDetector {
    detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

export const QrScanner: React.FC<QrScannerProps> = ({ onResult, onClose }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const rafRef = useRef<number>(0);
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const [found, setFound] = useState(false);
    /** 建议框（容器布局 px，不是 vmin —— 见文件头 ①） */
    const [box, setBox] = useState<{ left: number; top: number; size: number } | null>(null);
    /** 诊断摘要（每 ~300ms 刷新一次，别每帧 setState） */
    const [diag, setDiag] = useState({
        video: '—',
        frames: 0,
        finders: 0,
        bin: '—',
        engine: '探测中',
        step: '准备中',
        err: '',
    });

    useEffect(() => {
        let cancelled = false;
        let done = false;
        let nativeBusy = false;

        const cleanup = () => {
            cancelAnimationFrame(rafRef.current);
            try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* 忽略 */ }
            streamRef.current = null;
        };

        void (async () => {
            try {
                const md = navigator.mediaDevices;
                if (!md || !md.getUserMedia) throw new Error('当前环境不支持调用相机');

                // 相机约束：分辨率 + **连续自动对焦**（手机上扫不到码最常见的原因就是没对上焦）。
                // `advanced` 是标准写法，但个别核会抛 OverconstrainedError ⇒ 逐级回退。
                const base = {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                };
                let stream: MediaStream | null = null;
                const tries: MediaStreamConstraints[] = [
                    { video: { ...base, advanced: [{ focusMode: 'continuous' }] as never }, audio: false },
                    { video: { ...base, focusMode: 'continuous' } as never, audio: false },
                    { video: base, audio: false },
                ];
                let lastErr: unknown = null;
                for (const c of tries) {
                    try { stream = await md.getUserMedia(c); break; } catch (e) { lastErr = e; }
                }
                if (!stream) throw lastErr ?? new Error('打不开相机');

                if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
                streamRef.current = stream;

                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (!video || !canvas) return;

                video.srcObject = stream;
                try { await video.play(); } catch { /* 忽略，autoplay 属性兜底 */ }

                for (let i = 0; i < 100 && !cancelled; i++) {
                    if (video.videoWidth > 0 && video.videoHeight > 0) break;
                    await new Promise((r) => setTimeout(r, 50));
                }
                if (cancelled) return;
                setReady(true);

                // 建议框跟着容器走（容器 = 屏幕那块区域，注意这里是**布局 px**）
                const placeBox = () => {
                    const cw = video.clientWidth;
                    const ch = video.clientHeight;
                    if (!cw || !ch) return;
                    const size = Math.min(cw, ch) * BOX_RATIO;
                    setBox({ left: (cw - size) / 2, top: (ch - size) / 2, size });
                };
                placeBox();
                window.addEventListener('resize', placeBox);

                // ① 原生识别器优先（零依赖、系统级速度）
                let detector: NativeDetector | null = null;
                const ND = (globalThis as unknown as { BarcodeDetector?: new (o?: unknown) => NativeDetector }).BarcodeDetector;
                if (typeof ND === 'function') {
                    try {
                        const formats = await (ND as unknown as { getSupportedFormats?: () => Promise<string[]> })
                            .getSupportedFormats?.();
                        if (!formats || formats.includes('qr_code')) {
                            detector = new ND({ formats: ['qr_code'] });
                        }
                    } catch { detector = null; }
                }
                setDiag((d) => ({ ...d, engine: detector ? 'native' : 'js' }));

                const finish = (text: string) => {
                    done = true;
                    setFound(true);
                    cleanup();
                    window.removeEventListener('resize', placeBox);
                    onResultRef.current(text);
                };

                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                let frames = 0;
                let lastPush = 0;
                const qrDiag = createQrDiag();

                const loop = () => {
                    if (cancelled || done) return;
                    rafRef.current = requestAnimationFrame(loop);
                    if (frames % 2 !== 0) { frames++; return; }   // 每 2 帧解一次
                    frames++;
                    if (video.readyState < 2) return;

                    // ② 原生识别：直接把 video 交给系统，异步、不占主线程
                    if (detector && !nativeBusy) {
                        nativeBusy = true;
                        void detector
                            .detect(video)
                            .then((codes) => {
                                const hit = codes.find((c) => c.rawValue?.startsWith(PAIR_PREFIX));
                                if (hit && !done) finish(hit.rawValue);
                            })
                            .catch(() => { /* 原生失败不致命，JS 路径继续兜底 */ })
                            .finally(() => { nativeBusy = false; });
                    }

                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    const rect = visibleVideoRect(vw, vh, video.clientWidth, video.clientHeight);
                    if (!rect) return;

                    // ③ JS 兜底：只解"屏幕上看得见"的那块，所见即所解
                    const k = Math.min(1, FRAME_MAX / Math.max(rect.sw, rect.sh));
                    const w = Math.max(1, Math.round(rect.sw * k));
                    const h = Math.max(1, Math.round(rect.sh * k));
                    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
                    try {
                        ctx?.drawImage(video, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, w, h);
                    } catch { return; }

                    let px: ImageData;
                    try {
                        if (!ctx) return;
                        px = ctx.getImageData(0, 0, w, h);
                    } catch { return; }

                    try {
                        const res = decodeQrFromGray(rgbaToGray(px.data, w, h), qrDiag);
                        finish(res.text);
                        return;
                    } catch (e) {
                        // 每 ~300ms 刷新一次诊断，避免每帧 setState
                        const now = performance.now();
                        if (now - lastPush > 300) {
                            lastPush = now;
                            setDiag((d) => ({
                                ...d,
                                video: `${vw}×${vh} → ${w}×${h}`,
                                frames,
                                finders: qrDiag.finders,
                                bin: qrDiag.binarizer ?? '—',
                                step: qrDiag.steps[qrDiag.steps.length - 1] ?? '—',
                                err: qrDiag.error ?? (e instanceof Error ? e.message : String(e)),
                            }));
                        }
                    }
                };
                rafRef.current = requestAnimationFrame(loop);
            } catch (e) {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : String(e);
                setError(
                    /permission|denied|not allowed/i.test(msg)
                        ? '相机权限被拒绝了 —— 请在系统设置里允许本应用使用相机'
                        : msg,
                );
            }
        })();

        return () => { cancelled = true; cleanup(); };
    }, []);

    // 诊断条要给出"下一步该干什么"的建议，而不是只报数字
    const advice = (() => {
        if (error) return '打不开相机，先用「手动输入」兜底';
        if (!ready) return '正在打开相机…';
        if (found) return '认到了！正在连接…';
        if (diag.finders === 0) return '还没看到二维码 —— 把它放进方框、让屏幕亮一点';
        if (diag.finders < 3) return `只找到 ${diag.finders} 个定位角 —— 退后一点让整张码进框`;
        return '已经看到码了但解不出 —— 靠近些、正对着、避开反光';
    })();

    return (
        <div className="fixed inset-0 z-[1200] bg-black flex flex-col items-center justify-center select-none">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover opacity-90"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* 建议框：容器布局 px，跟着容器尺寸算（不是 vmin —— 见文件头 ①） */}
            {!error && box && (
                <div
                    className="absolute z-10 pointer-events-none"
                    style={{
                        left: box.left,
                        top: box.top,
                        width: box.size,
                        height: box.size,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                    }}
                >
                    <div
                        className={`w-full h-full border-4 rounded-3xl transition-colors ${diag.finders >= 3 ? 'border-emerald-400' : 'border-white/70'}`}
                    />
                </div>
            )}

            {/* 顶部：主提示 + 可执行的建议 */}
            <div className="absolute top-0 left-0 right-0 z-20 pt-8 px-10 text-center">
                <div className="text-3xl font-black tracking-widest text-white drop-shadow-lg">
                    {error ? '⚠️ 打不开相机' : found ? '✅ 认到了' : '扫一扫，连上电脑'}
                </div>
                <div className="mt-3 text-xl text-emerald-300 font-bold drop-shadow">{advice}</div>
                {error && (
                    <div className="mt-3 text-rose-300 text-lg leading-relaxed max-w-[70vw] mx-auto">{error}</div>
                )}
            </div>

            {/* 底部：诊断条（给程排查用的，能一眼看出卡在哪一步、用的是哪个引擎） */}
            <div className="absolute bottom-0 left-0 right-0 z-20 pb-6 px-8">
                <div className="mx-auto max-w-[900px] bg-black/55 border border-white/15 rounded-2xl px-6 py-4 font-mono text-base text-gray-200 leading-relaxed">
                    <div className="flex flex-wrap gap-x-8 gap-y-1">
                        <span>引擎 <b className="text-cyan-300">{diag.engine}</b></span>
                        <span>相机 <b className="text-cyan-300">{diag.video}</b></span>
                        <span>已处理 <b className="text-cyan-300">{diag.frames}</b> 帧</span>
                        <span>定位角 <b className={diag.finders >= 3 ? 'text-emerald-300' : 'text-amber-300'}>{diag.finders}</b></span>
                        <span>二值化 <b className="text-cyan-300">{diag.bin}</b></span>
                    </div>
                    <div className="mt-1 text-gray-300 truncate">阶段：{diag.step || '—'}</div>
                    {diag.err && <div className="mt-1 text-rose-300 text-sm truncate">错误：{diag.err}</div>}
                </div>

                <div className="mt-4 flex justify-center">
                    <button
                        onClick={onClose}
                        className="px-14 py-4 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xl font-black tracking-wider backdrop-blur transition-colors"
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
};
