// ==========================================
// 全屏 + ESC 归属权的唯一真源 —— `fullscreen.ts`
// [2026-10-24 莉莉子 · ESC 归属权改造]
//
// 👤 程的拍板（方案 A）：「全屏时 ESC 一律归游戏」
//
// ── 病根（改本文件之前先读这一段）──────────────────────────────────
//   ESC 在浏览器里是 **UA 级快捷键**：处于 HTML5 全屏时，Chromium 会自己吃掉这个
//   keydown 拿去退出全屏，**页面一个字符都收不到**。
//   ⇒ 所以「对局中按 ESC 暂停」在**窗口模式**下正常、在**全屏**下失效：
//     玩家按第一下只掉了全屏，对局还在**实时跑**（回合倒计时在走、AI 在动），
//     想暂停必须再按第二下 —— 而那第一下是"活时间"，玩家以为已经停了。
//   ⇒ 解法只有一个：用 Keyboard Lock API 把 ESC 从浏览器手里**要回来**
//     （`navigator.keyboard.lock(['Escape'])`），之后 ESC 的语义完全由游戏裁决。
//
// ── 要回来之后，本文件负责两件事 ──────────────────────────────────
//   ① 全屏进出时 lock / unlock —— `installEscapeLock()`
//   ② 给「这一下 ESC 该干什么」一个统一判据 —— `shouldEscapeExitFullscreen()`
//      · 偏好「ESC 优先退出全屏」**开启**（给老习惯留的逃生舱）→ 全屏时先退全屏
//      · **关闭**（默认，即方案 A 的口径）                → 全屏时直接交给游戏
//
// ── 三条必须遵守的约束 ───────────────────────────────────────────
//   1. **lock 只在全屏状态下有效**：非全屏调 `lock()` 会 reject（InvalidStateError），
//      所以必须由 `fullscreenchange` 驱动，不许在别处随手调。
//   2. **能力检测**：`navigator.keyboard` 是**实验性 API**，Electron 老内核 / 部分
//      WebView 里是 `undefined` ⇒ 那种环境自动退化为「ESC 归浏览器」的老行为，
//      **不许因此抛错，更不许把全屏切换搞坏**。
//   3. **退全屏必须 unlock**：否则个别环境会在退出全屏后继续吞掉 ESC。
//
// ── 谁在用 ───────────────────────────────────────────────────────
//   · `App.tsx`         —— 挂 `installEscapeLock()`（全局一次），全局 ESC 也走判据
//   · `GameSession.tsx` —— 对局内 ESC 走判据（决定"退全屏"还是"暂停"）
//   · `TopRightControls.tsx` / `SettingsModal.tsx` —— 全屏开关按钮
// ==========================================

/** Esc 锁定要拦的键（只要 Esc，其他键放给浏览器，别影响 F11/开发者工具等） */
const ESCAPE_KEYS = ['Escape'];

/**
 * 🎛️ 三个 UI/操作偏好的默认值 —— **唯一真源**
 *
 * 三处引用同一份：`data/initialUserData.ts`（新存档）、`SettingsModal`（老存档缺字段的兜底）、
 * `App.tsx`（透传到运行时的值）。改默认操作方式只改这里，别在别处抄字面量。
 *
 * ⚠️ `escExitFullscreenFirst` 是**给老习惯留的逃生舱**，默认 `false` 就是方案 A 的口径：
 *    全屏下 ESC 不抢全屏，直接交给游戏（暂停 / 返回上一级）。
 *    把它改成 `true` 等于把全体玩家的全屏 ESC 退回「先退全屏、再按才暂停」的旧手感。
 */
export const UI_CONTROL_DEFAULT = {
    showFullscreenButton: true,      // 右上角全屏按钮
    showPauseButton: true,           // 右上角暂停按钮（仅对局中可见）
    escExitFullscreenFirst: false,   // 全屏下 ESC 是否优先退全屏（默认=交给游戏）
} as const;

/** `navigator.keyboard` 的最小结构（DOM lib 里对它的类型声明各版本不一致，自己声明最稳） */
interface KeyboardLike {
    lock?: (keys: string[]) => Promise<void>;
    unlock?: () => void;
}

const getKeyboard = (): KeyboardLike | undefined =>
    (navigator as unknown as { keyboard?: KeyboardLike }).keyboard;

/** 当前是否处于（HTML5）全屏 */
export const isFullscreenActive = (): boolean => !!document.fullscreenElement;

/** 进入全屏（已全屏则空转） */
export async function enterFullscreen(): Promise<void> {
    if (isFullscreenActive()) return;
    try {
        await document.documentElement.requestFullscreen();
        // ⚠️ 锁要在**同一条用户手势链**里尽量补上：`keyboard.lock()` 要求 transient activation，
        //    指望异步一拍之后的 `fullscreenchange` 再调，部分环境会因"没有用户激活"被拒。
        //    从这里进的全屏 = 玩家点了按钮，activation 还在窗口内 ⇒ 此处是最佳时机。
        // ⚠️ 但 `fullscreenchange` 也可能**先于**这里到达（浏览器派发时机不固定）——
        //    两者都会走到 `syncEscapeLock`，谁先到谁锁上，后到的被幂等检查短路。
        //    **结果一致**（都在 activation 窗口内），所以不需要强制排序；若先到那次锁失败，
        //    后到那次会看到 `escapeLocked === false` 并重试一次，等于多了一次机会。
        void syncEscapeLock(true);
    } catch (err) {
        // 浏览器可能因为"非用户手势"等原因拒绝，静默失败即可（不要打断游戏流程）
        console.warn('[fullscreen] 进入全屏失败:', err);
    }
}

/** 退出全屏（未全屏则空转） */
export async function leaveFullscreen(): Promise<void> {
    if (!isFullscreenActive()) return;
    try {
        await document.exitFullscreen();
        void syncEscapeLock(false);
    } catch (err) {
        console.warn('[fullscreen] 退出全屏失败:', err);
    }
}

/** 切换全屏 —— 设置面板开关与右上角按钮共用这一个入口 */
export async function toggleFullscreen(): Promise<void> {
    if (isFullscreenActive()) await leaveFullscreen();
    else await enterFullscreen();
}

/**
 * 当前 Esc 是否真的已被我们锁住。
 * ⚠️ 它只能由 `doSyncEscapeLock` 在 `lock()` **成功之后**置真 —— 绝不预先乐观置真。
 */
let escapeLocked = false;

/**
 * 锁操作的串行队列。
 *
 * 🔴 为什么必须有它（2026-10-24 独立审查抓出的真 BUG）：
 *   `enterFullscreen()` 内的主动锁与 `fullscreenchange` 驱动的锁，**可能在同一次进全屏里并发**。
 *   而 `escapeLocked` 要等 `await lock()` 之后才置真 ⇒ 两个调用都能通过幂等检查
 *   ⇒ `lock()` 被并发调两次。更糟的是：若其中一次 reject，catch 会把 `escapeLocked`
 *   谎报成 `false`，之后退全屏时 `active === escapeLocked`（false === false）**提前返回**，
 *   `unlock()` 被跳过 —— 正好踩中本文件第 3 条约束（退全屏必须 unlock）。
 *
 *   修法：把每次同步排进一条 promise 链，串行执行。这样：
 *   · 后到的那次一定看到前一次的真实结果（成功→幂等返回；失败→重试一次）
 *   · 永远不会出现"两次 lock 并发"或"状态与真实不符"
 */
let lockQueue: Promise<void> = Promise.resolve();

/** 实际执行一次锁同步（只会被队列串行调用） */
async function doSyncEscapeLock(active: boolean): Promise<void> {
    const keyboard = getKeyboard();
    if (!keyboard?.lock) return;          // 实验性 API 不可用 → 保持浏览器原生行为
    if (active === escapeLocked) return;  // 状态一致，不用重复调

    try {
        if (active) {
            await keyboard.lock(ESCAPE_KEYS);
            escapeLocked = true;
        } else {
            keyboard.unlock?.();
            escapeLocked = false;
        }
    } catch (err) {
        escapeLocked = false;
        console.warn('[fullscreen] Esc 锁定失败，已退化为浏览器原生行为:', err);
    }
}

/**
 * 按当前全屏状态同步 Esc 锁（排队执行，幂等 + 静默降级）。
 * 环境不支持 / 调用被拒，都只是"没锁上"，绝不上抛。
 */
function syncEscapeLock(active: boolean): Promise<void> {
    lockQueue = lockQueue
        .then(() => doSyncEscapeLock(active))
        .catch(() => { /* doSyncEscapeLock 内部已兜底，这里只保证队列不断链 */ });
    return lockQueue;
}

/** 当前环境是否支持 Keyboard Lock（设置界面据此提示"此开关在本机无效"） */
export const isEscapeLockSupported = (): boolean => !!getKeyboard()?.lock;

/**
 * 安装「全屏 → 锁 Esc / 退全屏 → 解锁」的自动跟随。
 * 在 App 顶层调用一次即可；返回值是清理函数（卸载时顺带解锁，避免把 Esc 忘在锁里）。
 */
export function installEscapeLock(): () => void {
    const handleChange = () => { void syncEscapeLock(isFullscreenActive()); };

    handleChange(); // 挂载时可能已经是全屏（例如从浏览器记忆恢复）
    document.addEventListener('fullscreenchange', handleChange);

    return () => {
        document.removeEventListener('fullscreenchange', handleChange);
        void syncEscapeLock(false);
    };
}

/**
 * ⭐ 核心判据：这一下 ESC 应该**先退出全屏**吗？
 *
 * @param escExitFullscreenFirst 玩家偏好：全屏时 ESC 是否优先退出全屏
 *
 * 返回 `true`  ⇒ 调用方应该 `leaveFullscreen()` 然后 **return**（本次不暂停/不返回上一级）
 * 返回 `false` ⇒ 调用方按原有逻辑处理（对局内=暂停，界面上=返回/开设置）
 *
 * ⚠️ 只在**全屏中**才可能为 true；窗口模式下恒为 false（无需判断偏好）。
 * ⚠️ 「暂停中按 ESC 恢复」的优先级高于本判据 —— 由调用方自己先处理暂停态，
 *    否则会出现"暂停中按 ESC 去退全屏"的怪手感。
 */
export function shouldEscapeExitFullscreen(escExitFullscreenFirst?: boolean): boolean {
    return escExitFullscreenFirst === true && isFullscreenActive();
}
