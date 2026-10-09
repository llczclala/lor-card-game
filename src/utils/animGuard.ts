// [2026-09-03 莉莉子] animating 停滞看门狗心跳模块
//
// 背景：resolveCombatAnimation / resolveStack / commitSpell / executeRoundEndSequence
// 等异步链会把 phase 置为 'animating'（该阶段倒计时暂停、AI 冻结、超时兜底全部失效）。
// 一旦链条中途异常中断，phase 会永久停在 animating → 对局死锁（单位卡战场、法术悬空）。
//
// 本模块提供一个模块级"心跳"：
//  - 各 animating 异步链在关键推进点调用 bumpAnimProgress()（纯模块级写，不触发 React 渲染）；
//  - GameSession 的看门狗 effect 若发现 phase 停在 animating 且超过 ANIM_STALL_MS 无心跳推进，
//    则强制恢复 phase:main 并清空交战区，防死锁并打印现场快照。

export const animGuard = { lastBump: Date.now() };

/** 标记动画流程仍在推进。在异步链的每个可观测推进点调用。 */
export const bumpAnimProgress = () => {
    animGuard.lastBump = Date.now();
};

/** 停滞阈值：超过该时长无任何心跳推进即视为卡死。合法长演出均远小于它（升级影片走 levelUpCard 豁免）。 */
export const ANIM_STALL_MS = 25000;

/**
 * [2026-10-04 莉莉子 · AI 停机保护性修复] 升级链"宽限"阈值。
 *
 * 病根：原看门狗只要 `levelUpCard`/升级队列非空就**整体 return**（连 interval 都不建）⇒
 *   升级链一旦断掉（画面中途被撤、onComplete 没来），phase 停在 animating 就再也没有任何兜底
 *   —— **唯一会永久卡死的状态，恰好被唯一的看门狗豁免掉了。**
 *
 * 现在豁免仍然保留（正常长演出不该被打断），但必须"看得见进展"：
 *   以 (levelUpCard.id + 队列长度) 作为进展指纹，指纹一变就刷新计时；
 *   指纹连续本常量时长不变 ⇒ 判定断链，强制清队列 + 恢复 main。
 *   取值依据：真实影片 9.83~12.38s（ChampionLevelUp.tsx:116-118）+ spin/burst，
 *   单英雄正常 ≤ ~20s；60s 既不会误伤正常演出，也不会让玩家无限等。
 */
export const LEVELUP_STALL_GRACE_MS = 60000;
