// ==========================================
// 图鉴「NEW」判定层 —— `codexNew.ts`
// [2026-10-20 莉莉子 · 肉鸽图鉴 NEW 提示]
//
// 👤 粉丝反馈（程转述）：**第一次在迷宫遇到某些强化 / 武装装备时没有任何直观提示**，
//    玩家不知道自己刚见到的是"图鉴里的新东西" ⇒ 收藏欲完全没被点燃。
//    程的主张：右上角挂一个「NEW！！」之类的提示。
//
// ── 为什么要有这一层（而不是直接读 settings 判定）────────────────────────
//   判定"这件是不是新的"= 「图鉴里有没有收录」。而**候选卡要打角标**的地方有 4 处
//   （强化三选一 / 宝箱 / 商店 / 事件奖励），它们都渲染同一个 `modals/EnhancementCard`
//   ——但那张卡**手里没有 userSystem**，而 4 个弹窗的 prop 链又各走各的。
//   ⇒ 与其把 `unlockedRogueEnhancements` 一路 prop 穿进 4 个弹窗（漏一处那处就不长角标），
//     不如跟 `utils/haptics.ts` 同一套路：**App 负责写、卡面直接读**的模块级快照。
//
// ⚠️ 三条约束：
//   1. **未对齐前一律不判 NEW**（`hydratedKinds`）——
//      否则首帧会把老玩家图鉴里已有的东西全闪成 NEW，比不做还难看。
//   2. `hydrateCodexUnlocked` 是**整体替换**（不是并集）——
//      「恢复默认设置」会把图鉴清空，并集会让清空失效。
//   3. 开发者账号（`dev_full_admin`）**现在也会落盘记录**（2026-10-20 改，见 `App.tsx` 的
//      `recordCodexUnlock`），所以角标对开发者号同样按"图鉴维度"判定 —— 程用自己号就能验收。
//      `allUnlocked` 参数保留作兜底（将来若想让某类整类不标 NEW，传 `true` 即可）。
// ==========================================

/** 图鉴两类藏品 */
export type CodexKind = 'enhancement' | 'equipment';

/** 已收录的 id 集合（模块级快照，由 App 写入） */
const unlocked: Record<CodexKind, Set<string>> = {
    enhancement: new Set<string>(),
    equipment: new Set<string>(),
};

/** 已与 settings 对齐过的类别 —— 未对齐时不判 NEW（防首帧误闪） */
const hydratedKinds = new Set<CodexKind>();

/**
 * 用 settings 里的图鉴收录列表整体覆盖本地快照（App 在设置变化时调用）。
 *
 * @param kind 类别
 * @param ids  已收录 id 列表（settings.unlockedRogueEnhancements / unlockedRogueEquipments）
 */
export const hydrateCodexUnlocked = (
    kind: CodexKind,
    ids: readonly string[] | undefined,
): void => {
    unlocked[kind] = new Set<string>((ids ?? []).filter(Boolean));
    hydratedKinds.add(kind);
};

/** 立刻标记某件为"已收录"（获得那一刻调用，保证同一次交互里的后续渲染不再打 NEW） */
export const markCodexUnlocked = (kind: CodexKind, id: string): void => {
    if (!id) return;
    unlocked[kind].add(id);
    hydratedKinds.add(kind);
};

/**
 * 这件东西在**图鉴里**是不是新的（= 还没收录过）。
 * 未对齐 / id 缺失 ⇒ 一律返回 `false`（宁可不标，也不误标）。
 *
 * ⚠️ 调用方注意：**不是所有渲染强化卡的地方都该标 NEW**。
 *   · 该标：候选列表（强化三选一 / 宝箱 / 商店 / 事件奖励）
 *   · 不该标：玩家**已持有**的强化（`RunEnhancementStrip` 的悬停大卡）、
 *             和**敌方**强化（`NodePreviewPanel` 的悬停大卡，敌方与玩家共用同一套 id 空间）
 *   后两处通过 `EnhancementPreviewHover.noNew` → `EnhancementCard.forceNew={false}` 关掉。
 */
export const isCodexNew = (kind: CodexKind, id?: string): boolean => {
    if (!id) return false;
    if (!hydratedKinds.has(kind)) return false;
    return !unlocked[kind].has(id);
};
