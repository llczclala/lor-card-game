/**
 * 牌组「立体盒子」（Diorama）尺寸 —— **唯一真源**。
 *
 * [2026-10-15 莉莉子] 合并三处各一份的同名常量（程拍板「我觉得可以」）。
 *   ── 合并前：`DeckBuilder.tsx` / `roguelike/RoguePersonalize.tsx` / `Studio/EnemyDeckEditor.tsx`
 *      各自定义了一份 `DIORAMA_SIZE` ⇒ **改一处对另两处不生效**（典型分叉隐患）。
 *   ── 合并前**逐字段比对**过：`DeckBuilder` 与 `RoguePersonalize` **完全一致**；
 *      `EnemyDeckEditor` 是**故意缩小**的变体（原注释：「概览 Tab 内嵌预览，不再占 256px 大头」）。
 *   ── ⇒ 所以这里是**两个具名变体**，而不是硬塞成一个对象。
 *   ── ⚠️ 每个值都**逐字段等价于合并前的那一份** ⇒ **渲染零变化**；
 *      想调尺寸就改这里的字符串。
 *
 * ⚠️ 值的形式是 **Tailwind 类名**（不是 px）—— 这是这三处的历史写法，合并时**保持原样**，
 *    以免顺手改到渲染。（对比：`规范-界面调参区.md` 推荐的屏级 `*_UI` 用绝对 px。）
 *
 * ⚠️ 仍未合并的旁支（**未做**，与本次无关）：`DeckDiorama` **组件本身也各写了一份**，
 *    且三处实现有差异（遮罩/暗化强度、`top-4` vs `top-5`、右下小卡偏移…）
 *    ⇒ 合并它得逐行对着改，风险另计。程 2026-10-15：「等做到需要调参的地方再说」。
 */

/** 标准尺寸（**牌组选择** / **肉鸽·个性化** 用） */
export const DIORAMA_SIZE = {
    containerWidth: 'w-72',    // 整体容器宽度（从 w-64 放大到 w-72）
    containerHeight: 'h-96',   // 整体容器高度（从 h-80 放大到 h-96）
    cardWidth: 'w-36',         // 正面/卡背卡牌的基础宽度（放大至 w-36）
    cardHeight: 'h-52',        // 正面/卡背卡牌的基础高度（放大至 h-52）
    boardWidth: 'w-[270px]',   // 背景棋盘的平面横向铺开宽度
    boardHeight: 'h-[160px]',  // 背景棋盘的平面横向铺开高度
};

/** 紧凑尺寸（**敌人卡组编辑器「概览」Tab 的内嵌预览**用，2026-08-27 缩小） */
export const DIORAMA_SIZE_COMPACT = {
    containerWidth: 'w-40',
    containerHeight: 'h-44',
    cardWidth: 'w-14',
    cardHeight: 'h-20',
    boardWidth: 'w-[130px]',
    boardHeight: 'h-[72px]',
};
