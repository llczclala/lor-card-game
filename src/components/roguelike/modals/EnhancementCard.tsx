// ==========================================
// 悖论迷宫 · 强化卡牌
// [2026-08-10 莉莉子] 参考法术卡牌（SpellCard）样式：无左上角费用，右上角为稀有度图标，
// 卡面颜色随稀有度统一，中间圆形原画显示强化图（当前统一 abc.png 占位）。
// 设计基准尺寸参考法术卡（缩放由外层控制），选中时高亮发光。
// [2026-10-20 莉莉子 · 图鉴 NEW 角标] 粉丝反馈「第一次在迷宫遇到某些强化时没有任何直观提示」
//   ⇒ 本卡左上角加 **NEW!! 斜角缎带**。判定默认自动（`isCodexNew`），可用 `forceNew` 强制覆盖。
//   ✅ 覆盖范围（这 4 个候选界面都用**本文件**这张卡，所以一处改动全线生效）：
//      强化三选一 `NodeEventModal` · 宝箱 `TreasureModal` · 商店 `ShopModal` · 事件奖励 `EventRewardShowcase`
//   ⚠️ 别混淆：项目里还有**另一个同名组件** `roguelike/EnhancementCard.tsx`（props 是 `e`，
//      被 `NodePreviewPanel` / `RogueEnhancementPanel` / `RogueCodex` 使用）—— 那个**没有角标**，
//      本次也刻意没给它加（那是"敌方强化 / 玩家已持有 / 图鉴列表"，都不该标 NEW）。
//   ⚠️ 间接入口：`EnhancementPreview`（悬停大卡）渲染的也是本卡，它由
//      `EnhancementPreviewHover.noNew` 控制是否打角标（已持有 / 敌方时必须传 `true`）。
//
// [2026-10-28 莉莉子 · 尺寸与字号参数化] 病根（程报「迷宫强化三选一的卡太小，看不清描述文字」）：
//   本卡尺寸与字号原本**全部写死在 Tailwind 里**，且与 `uiSpacing.ENH_CARD` **两处各写一份**
//   （`w-[250px] h-[395px]`）⇒ 改一处必然与另一处脱节。
//   而描述是 `text-sm` = 14 设计 px，未选中的卡还被外层 `scale: 0.88` 压一层
//   ⇒ 手机 s≈0.374 时只剩约 4.6 CSS px（PC ≈ 12.6 px 正常）。
//   ⇒ 现在**所有尺寸/字号一律读 `ENH_CARD_UI`**（`uiSpacing.ts`，双平台两套值），
//     本文件不再出现任何写死的 px。PC 端值 = 原 Tailwind 等价，**视觉零变化**。
// ==========================================
import React from 'react';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { RARITY_META, RarityIcon } from '../RarityIcon';
import { isCodexNew } from '../../../utils/codexNew';
import { ENH_CARD_UI } from '../uiSpacing';

interface EnhancementCardProps {
    // [2026-08-11 节点预览] 放宽为 Pick：EnemyBuff 结构天然满足（含 name/description/rarity/icon），NodeEventModal 传完整 MazeEnhancement 仍兼容
    // [2026-10-20] `id` 也纳入（可选）—— 图鉴 NEW 判定要用它；不传就不标 NEW（宁可不标，不误标）
    enhancement: Pick<MazeEnhancement, 'name' | 'description' | 'rarity' | 'icon'> & { id?: string };
    isSelected: boolean;
    onClick: () => void;
    /** 可选：强制指定 NEW 状态（不传 = 按图鉴收录自动判定） */
    forceNew?: boolean;
}

export const EnhancementCard: React.FC<EnhancementCardProps> = ({ enhancement, isSelected, onClick, forceNew }) => {
    const meta = RARITY_META[enhancement.rarity];
    const showNew = forceNew ?? isCodexNew('enhancement', enhancement.id);
    const UI = ENH_CARD_UI;

    return (
        <button
            onClick={onClick}
            className={`relative overflow-hidden border-[4px] flex flex-col items-center transition-all duration-200
                ${isSelected ? 'scale-[1.04]' : 'opacity-90 hover:opacity-100 hover:scale-[1.02]'}`}
            style={{
                width: UI.width,
                height: UI.height,
                borderRadius: UI.radius,
                borderWidth: UI.border,
                paddingTop: UI.paddingTop,
                borderColor: meta.color,
                background: meta.cardBg,
                boxShadow: isSelected ? `0 0 32px ${meta.color}aa, inset 0 0 20px ${meta.color}22` : undefined,
            }}
        >
            {/* [2026-10-20] 左上角 NEW!! 缎带（图鉴首次遇到）—— 必须在卡片内容之上（z-40） */}
            {showNew && (
                <div
                    className="absolute left-0 top-0 z-40 flex items-center rounded-br-2xl
                               bg-gradient-to-br from-amber-300 via-yellow-300 to-amber-500 text-black
                               shadow-[0_2px_16px_rgba(251,191,36,0.95)]"
                    style={{ gap: UI.newGap, paddingLeft: UI.newPadX, paddingRight: UI.newPadX, paddingTop: UI.newPadY, paddingBottom: UI.newPadY }}
                >
                    <span className="font-black italic leading-none tracking-tighter" style={{ fontSize: UI.newFont }}>NEW!!</span>
                    <span className="leading-none" style={{ fontSize: UI.newEmojiFont }}>✨</span>
                </div>
            )}

            {/* 右上角稀有度图标（替代法术速度位） */}
            <div className="absolute z-30" style={{ top: UI.rarityInset, right: UI.rarityInset }}>
                <RarityIcon rarity={enhancement.rarity} size={UI.rarityIconSize} />
            </div>

            {/* 中间圆形原画（强化图，当前统一 abc.png） */}
            <div
                className="relative shrink-0 z-10"
                style={{ width: UI.artSize, height: UI.artSize, marginTop: UI.artMarginTop, marginBottom: UI.artMarginBottom }}
            >
                <div
                    className="absolute rounded-full opacity-60"
                    style={{
                        inset: -UI.artRingInset,
                        borderWidth: UI.artRingBorder,
                        borderColor: meta.color,
                        boxShadow: `0 0 18px ${meta.color}44`,
                    }}
                ></div>
                <div className="w-full h-full rounded-full overflow-hidden bg-black relative shadow-inner border-2 border-black">
                    <img
                        src={enhancement.icon}
                        alt={enhancement.name}
                        className="w-full h-full object-cover scale-110"
                    />
                    <div className="absolute inset-0 rounded-full shadow-[inset_0_0_24px_rgba(0,0,0,0.85)] pointer-events-none"></div>
                </div>
            </div>

            {/* 名称 */}
            <div className="relative z-20 w-full text-center shrink-0" style={{ marginBottom: UI.nameMarginBottom, paddingLeft: UI.namePadX, paddingRight: UI.namePadX }}>
                <h3
                    className="text-white font-black tracking-widest drop-shadow-lg"
                    style={{ fontSize: UI.nameFont, textShadow: `0 0 14px ${meta.color}99` }}
                >
                    {enhancement.name}
                </h3>
                <div
                    className="w-2/3 mx-auto opacity-50"
                    style={{ height: UI.dividerHeight, marginTop: UI.dividerMarginTop, background: `linear-gradient(to right, transparent, ${meta.color}, transparent)` }}
                ></div>
            </div>

            {/* 效果描述框（**程要看清的就是这块** —— 字号走 `descFont`） */}
            <div className="flex-1 relative z-10" style={{ width: `${UI.descBoxWidthPct}%`, marginBottom: UI.descBoxMarginBottom }}>
                <div className="absolute inset-0 bg-black/55 rounded-xl border border-white/10 backdrop-blur-sm shadow-inner"></div>
                <div className="relative h-full flex items-center justify-center text-center overflow-hidden" style={{ padding: UI.descPad }}>
                    <p className="text-gray-100 font-medium" style={{ fontSize: UI.descFont, lineHeight: UI.descLineHeight }}>
                        {enhancement.description}
                    </p>
                </div>
            </div>

            {/* 选中描边层 */}
            {isSelected && (
                <div
                    className="absolute inset-0 z-40 pointer-events-none border-2"
                    style={{ borderRadius: UI.radius, borderColor: meta.color }}
                ></div>
            )}
        </button>
    );
};
