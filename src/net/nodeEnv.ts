/**
 * nodeEnv.ts —— 超元链接 · Node 内置模块获取（唯一的取用入口）
 * ============================================================================
 * 渲染进程开了 `nodeIntegration`（见 `electron-main.cjs:16-17`），所以 `net` /
 * `os` / `dgram` 都能直接用。但有两个坑必须在这里一次性处理掉：
 *
 *   ① **ESM 下不能裸写 `require`** —— Vite 打的是 ESM 包，裸 `require` 会被当成
 *      未定义标识符（`saveSync/lan.ts:50-51` 踩过）。
 *   ② **纯 Node 环境里没有全局 `require`** —— 单测 / 未来的 headless 场景会拿不到，
 *      于是 Node 22.3+ 的 `process.getBuiltinModule` 作为第二条路。
 *
 * 浏览器与安卓 WebView 两条都拿不到，返回 `null` —— 调用方据此降级，
 * 而不是抛异常炸掉整个界面。
 * ============================================================================
 */

/** 从当前运行环境取一个 Node 内置模块；拿不到返回 null。 */
export function nodeRequire(mod: string): unknown {
    // ① Electron 渲染进程（nodeIntegration: true）—— 全局直接有 require
    try {
        const req = (globalThis as unknown as { require?: (m: string) => unknown }).require;
        if (typeof req === 'function') return req(mod);
    } catch { /* 落到下一种 */ }

    // ② Node 22.3+ 的内置模块直取（纯 Node / 单测 / 未来若关掉 nodeIntegration）
    try {
        const proc = (globalThis as unknown as {
            process?: { getBuiltinModule?: (m: string) => unknown };
        }).process;
        if (proc && typeof proc.getBuiltinModule === 'function') {
            return proc.getBuiltinModule(mod);
        }
    } catch { /* 不可用 */ }

    return null;
}

/**
 * 当前环境是否具备联机能力。
 * 判据只用 `net`：没有它就连不了，`os` / `dgram` 只是锦上添花。
 */
export function isNetAvailable(): boolean {
    return !!nodeRequire('net');
}
