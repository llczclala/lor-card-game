// ==========================================
// 悖论迷宫 · 天启者选择界面
// [2026-08-13 重做 v9] 左上返回 | 头像区(圆环经验槽+黑圆等级数字)+五纯文字按钮(垂直居左中部) | 手牌样式主视觉+确定按钮 | 右内容窗口
// 五按钮：无方框无图标，选中=文字高亮描边 + 左侧圆形指示点
// ==========================================
import React, { useState } from 'react';
import { ArrowLeft, Star, RefreshCcw } from 'lucide-react';
import { MAX_DIVINITY_LEVEL } from '../../data/roguelike/heroDivinity'; // [2026-09-28 神格神经] 星槽数（6）
import { useHeroDivinity } from '../../hooks/useHeroDivinity'; // [2026-09-28 神格神经] 星槽点亮
import { ROGUE_HEROES } from '../../data/roguelike/rogueStarterDecks';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-12 天启者养成] 等级/经验
import { getHeroTheme } from '../../data/roguelike/heroTheme'; // [2026-08-13] 主题色随所选天启者切换
import { OverviewContent, HeroAvatarRing, HeroHandContent, DeckContent, LevelsContent, DivinityContent, ArmamentContent, type HeroInfoWindow } from './RogueHeroInfoModal'; // [2026-08-13] 内容组件 · [2026-09-28] 神格神经占位 → DivinityContent
import { HeroSelectModal } from './HeroSelectModal'; // [2026-08-13] 更换天启者弹窗
import { RoguePersonalize } from './RoguePersonalize'; // [2026-08-13] 个性化界面（照搬 PVE 枢纽详情）

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置界面**外壳**（`RogueHeroSelect`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 肉鸽大厅点头像（或前往推演前）进来、选天启者 + 看六个页签的那一屏。
// 管：① 左上返回 ② 左列（圆环头像 + 名字 + 神格星槽 + 六个页签按钮）
//     ③ 主体（手牌样式大图 + 确定选择按钮）④ 右侧内容窗 ⑤ 左下「更换天启者」
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
//
// 📌 本屏是**两个文件**：外壳（本文件）+ 六个页签的内容（`RogueHeroInfoModal.tsx`）。
//    内容侧另有各自的调参块：`OVERVIEW_UI`（总览）/ `LEVELS_GEOMETRY` / `DECK_GEOMETRY` / `DIV_*` …
//    ⇒ **本文件只管"外壳"**，页签里面的东西去那个文件改。
//
// 📌 2026-10-16 本次顺带**收编了 `LEFT_COLUMN_OFFSET`** —— 它存的是 Tailwind **类名**
//    （`'pt-28'` / `'-mt-64'`），违反本手册硬规矩 1「值是绝对 px、别把类名塞进常量」：
//      · `topGap: 'pt-28'`     → `columnTopGap: 112`（7rem × 16）
//      · `buttonsShift: '-mt-64'` → `tabsShift: -256`（16rem × 16，负值 = 往上）
//    ⇒ **视觉零变化**，只是从"类名"换成了"数字"。
//
// ⚠️ 头像圆环（`HeroAvatarRing`）、手牌样式大图（`HeroHandContent`）的**内部尺寸不在本文件**
//    ⇒ 它们的"整体大小"由内容侧那个文件里的 `scale` / `size` 参数控制（总览页见 `OVERVIEW_UI`）。
// ══════════════════════════════════════════════════════════════════════
export const ROGUE_HERO_UI = {
    // ══ ① 左上返回按钮 ═════════════════════════════════════════════════
    /** 距顶 px（原 top-6 = 24） */
    backTop: 24,
    /** 距左 px（原 left-6 = 24） */
    backLeft: 24,
    /** 按钮内边距 px（原 p-3 = 12） */
    backPad: 12,
    /** 箭头图标 px（原 `<ArrowLeft size={22} />`） */
    backIconSize: 44,

    // ══ ② 整屏框架 ═════════════════════════════════════════════════════
    /** 左右内边距 px（原 px-6 = 24） */
    padX: 24,
    /** 底部内边距 px（原 pb-6 = 24） */
    padBottom: 24,
    /** 内容整体距顶 px（原 `LEFT_COLUMN_OFFSET.topGap` = pt-28 = 112）—— 越大头像区越往下 */
    columnTopGap: 112,

    // ══ ③ 左列：圆环头像 + 名字 + 星槽 ═════════════════════════════════
    /** 左列宽度 px（原 w-[280px] = 280） */
    leftColumnWidth: 380,
    /** 头像 ↔ 右侧文字 间距 px（原 gap-4 = 16） */
    avatarRowGap: 16,
    /** 名字 ↔ 星槽 纵向间距 px（原 gap-2 = 8） */
    nameColumnGap: 8,
    /** 名字字号 px（原 text-2xl = 24） */
    nameFontSize: 42,
    /** 星与星之间间距 px（原 gap-1.5 = 6） */
    starGap: 6,
    /** 单颗星尺寸 px（原 `<Star size={18} />`） */
    starSize: 27,

    // ══ ④ 六个页签按钮（总览 / 初始牌组 / 天启者等级 / 武装 / 神格神经 / 个性化）═══
    /** 页签之间纵向间距 px（原 gap-2 = 8） */
    tabsGap: 8,
    /** 页签整列的上移量 px（原 `LEFT_COLUMN_OFFSET.buttonsShift` = -mt-64 = -256，**负值 = 往上**） */
    tabsShift: -75,
    /** 单个页签内「指示点 ↔ 文字」间距 px（原 gap-3 = 12） */
    tabItemGap: 24,
    /** 单个页签左右内边距 px（原 px-2 = 8） */
    tabItemPadX: 8,
    /** 单个页签上下内边距 px（原 py-2 = 8） */
    tabItemPadY: 8,
    /** 选中指示点直径 px（原 w-3.5 h-3.5 = 14） */
    tabDotSize: 14,
    /** 指示点描边粗细 px（原 border-2） */
    tabDotBorder: 2,
    /** 页签文字字号 px（原 text-xl = 20） */
    tabLabelFontSize: 40,

    // ══ ⑤ 主体：手牌样式大图 + 确定选择 ═════════════════════════════════
    /** 手牌样式列 ↔ 右侧内容窗 的间距 px（原 gap-6 = 24） */
    mainGap: 24,
    /** 手牌样式大图缩放（原 `<HeroHandContent scale={1.35} />`；1 = 原始） */
    handScale: 1.35,
    /** 大图 ↔ 确定按钮 间距 px（原 mt-2 = 8） */
    confirmMarginTop: 8,
    /** 确定按钮左右内边距 px（原 px-10 = 40） */
    confirmPadX: 40,
    /** 确定按钮上下内边距 px（原 py-3 = 12） */
    confirmPadY: 12,
    /** 确定按钮圆角 px（原 rounded-xl = 16） */
    confirmRadius: 16,
    /** 确定按钮字号 px（原 text-lg = 18，与总览页那个同款） */
    confirmFontSize: 18,

    // ══ ⑥ 右侧内容窗 ═══════════════════════════════════════════════════
    /** 内容窗内边距 px（原 p-5 = 20；总览/等级/初始牌组/武装时不套边框，此值只在其余页签生效） */
    rightWindowPad: 20,
    /** 「请在左下角更换天启者」空态字号 px（原 text-sm = 14） */
    emptyFontSize: 14,

    // ══ ⑦ 左下角「更换天启者」═══════════════════════════════════════════
    /** 距左 px（原 left-6 = 24） */
    swapLeft: 24,
    /** 距底 px（原 bottom-6 = 24） */
    swapBottom: 24,
    /** 圆钮 ↔ 文字 间距 px（原 gap-1.5 = 6） */
    swapGroupGap: 6,
    /** 圆钮直径 px（原 w-14 h-14 = 56） */
    swapBtnSize: 84,
    /** 圆钮描边粗细 px（原 border-2） */
    swapBtnBorder: 2,
    /** 圆钮图标 px（原 `<RefreshCcw size={22} />`） */
    swapIconSize: 33,
    /** 「更换天启者」文字字号 px（原 text-[10px] = 10） */
    swapLabelFontSize: 20,
} as const;

interface RogueHeroSelectProps {
    onBack: () => void;
    onSelect: (heroKey: string) => void; // 确定按钮确认后回主界面
    initialHeroKey?: string | null;      // 从主界面进入时已选天启者（用于确定按钮置灰判断）
    userSystem: any;                     // [2026-08-13] 个性化界面（dev 判断 + 牌组读取）
    onEditRogueDeck: (heroKey: string) => void; // [2026-08-13] 编辑肉鸽初始牌组（App 接入 DeckBuilder）
}

export const RogueHeroSelect: React.FC<RogueHeroSelectProps> = ({ onBack, onSelect, initialHeroKey, userSystem, onEditRogueDeck }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(initialHeroKey ?? ROGUE_HEROES[0].key);
    const [activeWindow, setActiveWindow] = useState<HeroInfoWindow>('overview'); // [2026-08-13] 默认点「总览」
    const [isHeroModalOpen, setIsHeroModalOpen] = useState(false); // [2026-08-13] 更换天启者弹窗
    const selectedHero = ROGUE_HEROES.find(h => h.key === selectedKey);
    const heroProgression = useHeroProgression();
    const progress = selectedKey ? heroProgression.getHeroProgress(selectedKey) : null;
    const theme = getHeroTheme(selectedKey ?? ROGUE_HEROES[0].key); // [2026-08-13] 主题色随所选天启者
    const divinity = useHeroDivinity(); // [2026-09-28 神格神经] 星槽点亮（响应式）
    const divinityLevel = selectedKey ? divinity.getLevel(selectedKey) : 0;

    // [2026-08-13] 确定按钮：当前英雄就是进来时已选的 → 置灰不可点
    const isDefaultSelected = selectedKey === initialHeroKey;

    // [2026-08-13] 六信息按钮（纯文字，无图标无方框）
    const infoTabs: { key: HeroInfoWindow; label: string }[] = [
        { key: 'overview', label: '总览' },
        { key: 'deck', label: '初始牌组' },
        { key: 'levels', label: '天启者等级' },
        { key: 'armament', label: '武装' },
        { key: 'divinity', label: '神格神经' },
        { key: 'personalize', label: '个性化' },
    ];

    return (
        <div
            className="w-full h-full flex text-white font-sans relative overflow-hidden select-none"
            style={{ background: `linear-gradient(to bottom, #020617 0%, ${theme.soft} 50%, #020617 100%)` }}
        >
            {/* 返回按钮：左上角 */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBack(); }}
                className="absolute z-[999] rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                style={{
                    top: ROGUE_HERO_UI.backTop,
                    left: ROGUE_HERO_UI.backLeft,
                    padding: ROGUE_HERO_UI.backPad,
                }}
                title="返回"
            >
                <ArrowLeft size={ROGUE_HERO_UI.backIconSize} className="text-gray-300 group-hover:text-white transition-colors" />
            </button>

            <div
                className="flex flex-1 min-h-0 w-full"
                style={{
                    paddingLeft: ROGUE_HERO_UI.padX,
                    paddingRight: ROGUE_HERO_UI.padX,
                    paddingBottom: ROGUE_HERO_UI.padBottom,
                    paddingTop: ROGUE_HERO_UI.columnTopGap,
                }}
            >
                {/* 左列：头像区（左上）+ 五按钮（垂直居左中部） */}
                <div className="flex flex-col shrink-0" style={{ width: ROGUE_HERO_UI.leftColumnWidth }}>
                    {/* [2026-08-13] 头像区：圆环头像 + 黑圆等级数字（底部）+ 名字右侧 */}
                    {selectedHero && progress && (
                        <div className="flex items-center" style={{ gap: ROGUE_HERO_UI.avatarRowGap }}>
                            {/* [2026-08-13] 圆环头像组件（复用：选择界面头像区 / 等级界面顶部）
                                ⚠️ 它的直径在 RogueHeroInfoModal 里（选择界面用默认值，等级页用 LEVELS_GEOMETRY.avatarSize） */}
                            <HeroAvatarRing heroKey={selectedKey!} level={progress.level} exp={progress.exp} expToNext={progress.expToNext} />
                            {/* 名字 + 神格星星槽（右侧，照旧）
                                [2026-09-28 神格神经] 4 → 6 星（= 6 个节点），并按已解锁节点数点亮 */}
                            <div className="flex flex-col" style={{ gap: ROGUE_HERO_UI.nameColumnGap }}>
                                <div className="font-black text-white leading-tight" style={{ fontSize: ROGUE_HERO_UI.nameFontSize }}>{selectedHero.name}</div>
                                <div className="flex" style={{ gap: ROGUE_HERO_UI.starGap }}>
                                    {Array.from({ length: MAX_DIVINITY_LEVEL }).map((_, i) => (
                                        <Star key={i} size={ROGUE_HERO_UI.starSize} className={i < divinityLevel ? 'text-amber-400 fill-amber-400' : 'text-gray-600 fill-gray-600/30'} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* [2026-08-13] 五信息按钮：垂直居中于画面左侧中部，纯文字（上移微调） */}
                    <div
                        className="flex-1 flex flex-col justify-center"
                        style={{ gap: ROGUE_HERO_UI.tabsGap, marginTop: ROGUE_HERO_UI.tabsShift }}
                    >
                        {infoTabs.map(tab => {
                            const isActive = activeWindow === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveWindow(tab.key); }}
                                    className={`group flex items-center transition-all text-left ${isActive ? '' : 'opacity-60 hover:opacity-100'}`}
                                    style={{
                                        gap: ROGUE_HERO_UI.tabItemGap,
                                        paddingLeft: ROGUE_HERO_UI.tabItemPadX,
                                        paddingRight: ROGUE_HERO_UI.tabItemPadX,
                                        paddingTop: ROGUE_HERO_UI.tabItemPadY,
                                        paddingBottom: ROGUE_HERO_UI.tabItemPadY,
                                    }}
                                >
                                    {/* 左侧圆形指示点（选中时亮起，主题色） */}
                                    <span
                                        className="rounded-full shrink-0 transition-all"
                                        style={{
                                            width: ROGUE_HERO_UI.tabDotSize,
                                            height: ROGUE_HERO_UI.tabDotSize,
                                            borderWidth: ROGUE_HERO_UI.tabDotBorder,
                                            borderStyle: 'solid',
                                            ...(isActive
                                                ? { borderColor: theme.color, background: theme.color, boxShadow: `0 0 10px ${theme.glow}` }
                                                : { borderColor: '#4b5563', background: 'transparent' }),
                                        }}
                                    />
                                    {/* 文字（选中时高亮描边，主题色） */}
                                    <span
                                        className={`font-black tracking-wider transition-all ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}
                                        style={{
                                            fontSize: ROGUE_HERO_UI.tabLabelFontSize,
                                            ...(isActive ? { textShadow: `0 0 12px ${theme.glow}, 0 0 3px rgba(255,255,255,0.6)` } : undefined),
                                        }}
                                    >
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 主体：手牌样式 + 右侧窗口（顶部对齐） */}
                <div className="flex flex-1 min-w-0 items-start" style={{ gap: ROGUE_HERO_UI.mainGap }}>
                    {/* 手牌样式（主视觉，大）+ 下方确定按钮（总览/等级/初始牌组/个性化/武装/神格神经时移入内容区，主体隐藏避免重复）
                        [2026-09-28 程拍板] 神格神经界面**只保留神经图** —— 故把 divinity 也加进排除列表
                        ⚠️ 排除列表覆盖了全部六个页签 ⇒ 这一支当前其实**渲染不到**（保留原逻辑，未动） */}
                    {activeWindow !== 'overview' && activeWindow !== 'levels' && activeWindow !== 'deck' && activeWindow !== 'personalize' && activeWindow !== 'armament' && activeWindow !== 'divinity' && (
                        <div className="flex flex-col items-center shrink-0">
                            {selectedKey && <HeroHandContent key={selectedKey} heroKey={selectedKey} scale={ROGUE_HERO_UI.handScale} />}
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (selectedKey) onSelect(selectedKey); }}
                                disabled={isDefaultSelected}
                                className="rounded-xl font-black tracking-widest hover:scale-105 transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                                style={{
                                    marginTop: ROGUE_HERO_UI.confirmMarginTop,
                                    paddingLeft: ROGUE_HERO_UI.confirmPadX,
                                    paddingRight: ROGUE_HERO_UI.confirmPadX,
                                    paddingTop: ROGUE_HERO_UI.confirmPadY,
                                    paddingBottom: ROGUE_HERO_UI.confirmPadY,
                                    borderRadius: ROGUE_HERO_UI.confirmRadius,
                                    fontSize: ROGUE_HERO_UI.confirmFontSize,
                                    background: `linear-gradient(to right, ${theme.color}, ${theme.soft})`,
                                    boxShadow: `0 0 30px ${theme.glow}`,
                                }}
                            >
                                确定选择
                            </button>
                        </div>
                    )}

                    {/* 右侧窗口：随左侧按钮切换（总览/等级/初始牌组/武装去掉最外层边框，窗口自管理） */}
                    <div
                        className={`flex-1 min-w-0 self-stretch overflow-y-auto custom-scrollbar ${(activeWindow === 'overview' || activeWindow === 'levels' || activeWindow === 'deck' || activeWindow === 'armament') ? '' : 'rounded-xl bg-white/5 border border-white/10'}`}
                        style={{ padding: (activeWindow === 'overview' || activeWindow === 'levels' || activeWindow === 'deck' || activeWindow === 'armament') ? undefined : ROGUE_HERO_UI.rightWindowPad }}
                    >
                        {!selectedKey ? (
                            <div className="h-full flex items-center justify-center text-gray-400 font-mono" style={{ fontSize: ROGUE_HERO_UI.emptyFontSize }}>
                                请在左下角更换天启者
                            </div>
                        ) : activeWindow === 'overview' ? (
                            <OverviewContent
                                heroKey={selectedKey}
                                onConfirm={() => { eventBus.emit(GameEvents.UI_CLICK); if (selectedKey) onSelect(selectedKey); }}
                                confirmDisabled={isDefaultSelected}
                                themeColor={theme.color}
                            />
                        ) : activeWindow === 'deck' ? (
                            <DeckContent heroKey={selectedKey} userSystem={userSystem} />
                        ) : activeWindow === 'levels' ? (
                            <LevelsContent heroKey={selectedKey} userSystem={userSystem} />
                        ) : activeWindow === 'divinity' ? (
                            <DivinityContent heroKey={selectedKey} heroName={selectedHero?.name ?? ''} userSystem={userSystem} />
                        ) : activeWindow === 'armament' ? (
                            <ArmamentContent heroKey={selectedKey} userSystem={userSystem} />
                        ) : (
                            <RoguePersonalize heroKey={selectedKey} userSystem={userSystem} onEditDeck={onEditRogueDeck} />
                        )}
                    </div>
                </div>
            </div>

            {/* [2026-08-13] 左下角：放大圆形更换按钮 + 下方文字（无外层方框） */}
            <div
                className="absolute z-[999] flex flex-col items-center"
                style={{
                    bottom: ROGUE_HERO_UI.swapBottom,
                    left: ROGUE_HERO_UI.swapLeft,
                    gap: ROGUE_HERO_UI.swapGroupGap,
                }}
            >
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsHeroModalOpen(true); }}
                    className="rounded-full bg-white/10 hover:bg-purple-800/60 border-white/20 hover:border-purple-400 flex items-center justify-center transition-all group"
                    style={{
                        width: ROGUE_HERO_UI.swapBtnSize,
                        height: ROGUE_HERO_UI.swapBtnSize,
                        borderWidth: ROGUE_HERO_UI.swapBtnBorder,
                        borderStyle: 'solid',
                    }}
                    title="更换天启者"
                >
                    <RefreshCcw size={ROGUE_HERO_UI.swapIconSize} className="text-purple-300 group-hover:text-white transition-colors" />
                </button>
                <span className="font-bold text-gray-300 tracking-wider" style={{ fontSize: ROGUE_HERO_UI.swapLabelFontSize }}>更换天启者</span>
            </div>

            {/* 更换天启者弹窗 */}
            <HeroSelectModal
                isOpen={isHeroModalOpen}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                onClose={() => setIsHeroModalOpen(false)}
            />
        </div>
    );
};
