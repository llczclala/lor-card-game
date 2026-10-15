/**
 * 前后台「听得见的音频」闸门 —— **只管 DOM 里的媒体元素**。
 *
 * [2026-10-15 莉莉子 · 粉丝实测] 切后台必须停掉所有能听见的声音。
 * [2026-10-15 莉莉子 · 独立审查返工] 第一版有两个结构性错误，已按审查结论重写：
 *   🔴 错误①：**用 `pause()` 关影片是不可能的**。`VideoPlayer` 的看门狗每 1 秒跑一次
 *      `if (video.paused && !video.ended) video.play()`（`VideoPlayer.tsx:169-181`），
 *      会把我们的 pause **撤销** —— 切后台约 1 秒后影片**带声复播**。
 *      而我原先引用来"证明安全"的那句 `if (document.hidden …)`（`:185`）在 `:181` 的
 *      `return` **之后**，**永远够不到复活分支** ⇒ 那条守卫保护不了这里。
 *      ⇒ 正解：**置 `el.muted = true`**。看门狗照样 `play()`，但**发不出声**。
 *        （顺带避开另一条坑：pause 后被 `play()` 拒绝会走进"时间轴不前进"的停滞判定，
 *          一次性影片会被**静默跳过** ⇒ 演出错过。）
 *   🔴 错误②：**边沿触发不是门**。第一版只在"状态翻转那一瞬间"扫一次，
 *      切后台**之后**新起的音频完全没人拦（PC/Electron 上游戏甚至全速继续跑）。
 *      ⇒ 增加**电平状态** `isAppHidden()`，由各音频生产者在 `play()` 前自行查询。
 *
 * ⚠️ 为什么只做 DOM 这一半：BGM / 语音 / 音效走的是 `new Audio()`，**从不进入 DOM**
 *    ⇒ `querySelectorAll` 找不到，由各自的 hook 订阅 `subscribeAppVisibility` 自行处理。
 *    ⚠️ 今天项目里**没有**任何 `<audio>` DOM 元素，选择器里的 `audio` 是留给将来的。
 *    ⚠️ 清单不完整之处（审查指出）：`App.tsx` 自定义背景、`RogueStageSelect`、`ChampionLevelUp`
 *      也各有 `<video>`，但它们要么 `muted`、要么从不 `play()` ⇒ 今天不构成"听得见的音频"。
 *
 * ⚠️ 过滤用的是 **`el.muted` 属性（property）**，不是 CSS 属性选择器：
 *   循环视频（`LoopVideo`）是用 JS 设 `el.muted = true` 的，**不会**加 `[muted]` 特性；
 *   而它们本来就没声音，**不该**被我们动（交给 `videoBudget` 的可见性门控）。
 */
const mutedByGate = new Set<HTMLMediaElement>();

/** 电平状态：当前是否处于后台。音频生产者在 `play()` 前查它，避免"后台新起的声音"。 */
let appHidden = false;
export const isAppHidden = (): boolean => appHidden;

/** 切后台：把"有声且在播"的 DOM 媒体**静音**（并顺带暂停，省解码） */
export function pauseAudibleDomMedia(): void {
    appHidden = true;
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLMediaElement>('video,audio').forEach(el => {
        if (el.muted) return; // 静音元素（循环视频）不归我们管
        try {
            el.muted = true;  // ← 关键：看门狗无法撤销它，所以这才是"关声"的正解
            el.pause();       // 顺带停掉解码；回前台由下面的 play() 或看门狗拉回
            mutedByGate.add(el);
        } catch { /* 单个元素异常：忽略，绝不影响其它 */ }
    });
}

/** 回前台：还原**我们自己静音过**的那些元素 */
export function resumeAudibleDomMedia(): void {
    appHidden = false;
    try {
        mutedByGate.forEach(el => {
            if (!el.isConnected) return; // 后台期间已被卸载（切场景/关弹窗）⇒ 不复活
            try {
                el.muted = false;
                const p = el.play();
                if (p !== undefined) p.catch(() => { /* 自动播放策略拦截：等用户交互 */ });
            } catch { /* 单个元素抛错绝不能中断循环 —— 否则 clear() 不执行、集合被永久污染 */ }
        });
    } finally {
        mutedByGate.clear(); // 无论如何都清：否则下次回前台会在同一批旧元素上反复重试
    }
}
