import { useCallback, useRef } from 'react';

/**
 * 「永远最新、引用永远不变」的回调 Hook。
 *
 * ============================================================
 * [2026-10-02 莉莉子 性能优化] 为什么需要它
 * ------------------------------------------------------------
 * 本项目 `useGameState` / `useSpellSystem` 里 **useMemo 数量为 0**，
 * 于是 `game` / `actions` / `spellSystem` 这类对象**每次渲染都是新引用**。
 *
 * 这带来一个恶性循环：
 *   1. 组件把内联箭头 `onClick={() => {...}}` 传给孩子 ⇒ 每次渲染都是新函数
 *   2. 孩子加了 `React.memo` 也没用 —— 浅比较必然失败
 *   3. 于是全屏 20+ 张卡在任何一次状态变化时**全量重渲染**
 *
 * 而如果直接把 `game` 写进 `useCallback` 的依赖数组，回调同样每次都变 —— 等于没做。
 *
 * 本 Hook 的解法（社区称「latest ref」模式）：
 *   · 每次渲染把**最新的 fn** 存进 ref
 *   · 对外返回一个**依赖数组为空**的稳定函数，调用时转调 `ref.current`
 * ⇒ 引用永久稳定（memo 生效），且读到的永远是最新闭包（**无过期值风险**）。
 *
 * ⚠️ 使用注意
 *   · 只在**事件回调**上用它。不要拿它包渲染期就要用的纯计算函数。
 *   · 被包的函数**允许**闭包捕获任何易变变量（game / actions / state…），这正是它的用途。
 *   · 不能在条件分支 / 循环里调用（Hook 规则）。
 */
export function useStableCallback<A extends unknown[]>(
    fn: (...args: A) => void,
): (...args: A) => void {
    const fnRef = useRef(fn);
    // 每次渲染同步刷新到最新实现（与项目内既有 gameRef 用法一致）
    fnRef.current = fn;
    return useCallback((...args: A) => {
        fnRef.current(...args);
    }, []);
}

/**
 * 同 `useStableCallback`，但保留返回值。
 * 用于被包函数需要 `return` 结果的场景（如返回布尔、返回事件对象）。
 */
export function useStableCallbackR<A extends unknown[], R>(
    fn: (...args: A) => R,
): (...args: A) => R {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    return useCallback((...args: A) => fnRef.current(...args), []);
}
