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
// ==========================================
import React from 'react';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { RARITY_META, RarityIcon } from '../RarityIcon';
import { isCodexNew } from '../../../utils/codexNew';

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

    return (
        <button
            onClick={onClick}
            className={`relative w-[250px] h-[395px] overflow-hidden rounded-2xl border-[4px] flex flex-col items-center pt-8 transition-all duration-200
                ${isSelected ? 'scale-[1.04]' : 'opacity-90 hover:opacity-100 hover:scale-[1.02]'}`}
            style={{
                borderColor: meta.color,
                background: meta.cardBg,
                boxShadow: isSelected ? `0 0 32px ${meta.color}aa, inset 0 0 20px ${meta.color}22` : undefined,
            }}
        >
            {/* [2026-10-20] 左上角 NEW!! 缎带（图鉴首次遇到）—— 必须在卡片内容之上（z-40） */}
            {showNew && (
                <div
                    className="absolute left-0 top-0 z-40 flex items-center gap-1 rounded-br-2xl px-2.5 py-1
                               bg-gradient-to-br from-amber-300 via-yellow-300 to-amber-500 text-black
                               shadow-[0_2px_16px_rgba(251,191,36,0.95)]"
                >
                    <span className="font-black italic text-[13px] leading-none tracking-tighter">NEW!!</span>
                    <span className="text-[12px] leading-none">✨</span>
                </div>
            )}

            {/* 右上角稀有度图标（替代法术速度位） */}
            <div className="absolute top-3 right-3 z-30">
                <RarityIcon rarity={enhancement.rarity} size={24} />
            </div>

            {/* 中间圆形原画（强化图，当前统一 abc.png） */}
            <div className="relative w-40 h-40 mt-1 mb-4 shrink-0 z-10">
                <div
                    className="absolute inset-[-5px] rounded-full border-[3px] opacity-60"
                    style={{ borderColor: meta.color, boxShadow: `0 0 18px ${meta.color}44` }}
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
            <div className="relative z-20 w-full text-center mb-2 px-2">
                <h3
                    className="text-white font-black text-xl tracking-widest drop-shadow-lg"
                    style={{ textShadow: `0 0 14px ${meta.color}99` }}
                >
                    {enhancement.name}
                </h3>
                <div
                    className="h-[2px] w-2/3 mx-auto opacity-50 mt-1.5"
                    style={{ background: `linear-gradient(to right, transparent, ${meta.color}, transparent)` }}
                ></div>
            </div>

            {/* 效果描述框 */}
            <div className="flex-1 w-[88%] mb-6 relative z-10">
                <div className="absolute inset-0 bg-black/55 rounded-xl border border-white/10 backdrop-blur-sm shadow-inner"></div>
                <div className="relative h-full flex items-center justify-center p-3.5 text-center overflow-hidden">
                    <p className="text-gray-100 text-sm leading-snug font-medium">{enhancement.description}</p>
                </div>
            </div>

            {/* 选中描边层 */}
            {isSelected && (
                <div
                    className="absolute inset-0 z-40 pointer-events-none rounded-2xl border-2"
                    style={{ borderColor: meta.color }}
                ></div>
            )}
        </button>
    );
};
