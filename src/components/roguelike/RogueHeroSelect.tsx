// ==========================================
// 悖论迷宫 · 天启者选择界面
// [2026-08-13 重做 v9] 左上返回 | 头像区(圆环经验槽+黑圆等级数字)+五纯文字按钮(垂直居左中部) | 手牌样式主视觉+确定按钮 | 右内容窗口
// 五按钮：无方框无图标，选中=文字高亮描边 + 左侧圆形指示点
// ==========================================
import React, { useState } from 'react';
import { ArrowLeft, Star, RefreshCcw } from 'lucide-react';
import { ROGUE_HEROES } from '../../data/roguelike/rogueStarterDecks';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-12 天启者养成] 等级/经验
import { getHeroTheme } from '../../data/roguelike/heroTheme'; // [2026-08-13] 主题色随所选天启者切换
import { OverviewContent, HeroAvatarRing, HeroHandContent, DeckContent, LevelsContent, DivinityPlaceholder, ArmamentContent, type HeroInfoWindow } from './RogueHeroInfoModal'; // [2026-08-13] 内容组件
import { HeroSelectModal } from './HeroSelectModal'; // [2026-08-13] 更换天启者弹窗
import { RoguePersonalize } from './RoguePersonalize'; // [2026-08-13] 个性化界面（照搬 PVE 枢纽详情）

// [2026-08-13] 左列头像/按钮垂直位置（程可微调）：
// topGap 数值越大头像区越往下；buttonsShift 负值越大按钮区越往上
const LEFT_COLUMN_OFFSET = {
    topGap: 'pt-28',
    buttonsShift: '-mt-64',
};

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
                className="absolute top-6 left-6 z-[999] p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                title="返回"
            >
                <ArrowLeft size={22} className="text-gray-300 group-hover:text-white transition-colors" />
            </button>

            <div className={`flex flex-1 min-h-0 w-full px-6 pb-6 ${LEFT_COLUMN_OFFSET.topGap}`}>
                {/* 左列：头像区（左上）+ 五按钮（垂直居左中部） */}
                <div className="flex flex-col shrink-0 w-[280px]">
                    {/* [2026-08-13] 头像区：圆环头像 + 黑圆等级数字（底部）+ 名字右侧 */}
                    {selectedHero && progress && (
                        <div className="flex items-center gap-4">
                            {/* [2026-08-13] 圆环头像组件（复用：选择界面头像区 / 等级界面顶部） */}
                            <HeroAvatarRing heroKey={selectedKey!} level={progress.level} exp={progress.exp} expToNext={progress.expToNext} />
                            {/* 名字 + 神格星星槽（右侧，照旧） */}
                            <div className="flex flex-col gap-2">
                                <div className="text-2xl font-black text-white leading-tight">{selectedHero.name}</div>
                                <div className="flex gap-1.5">
                                    {[0, 1, 2, 3].map(i => (
                                        <Star key={i} size={18} className="text-gray-600 fill-gray-600/30" />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* [2026-08-13] 五信息按钮：垂直居中于画面左侧中部，纯文字（上移微调） */}
                    <div className={`flex-1 flex flex-col justify-center gap-2 ${LEFT_COLUMN_OFFSET.buttonsShift}`}>
                        {infoTabs.map(tab => {
                            const isActive = activeWindow === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveWindow(tab.key); }}
                                    className={`group flex items-center gap-3 px-2 py-2 transition-all text-left ${isActive ? '' : 'opacity-60 hover:opacity-100'}`}
                                >
                                    {/* 左侧圆形指示点（选中时亮起，主题色） */}
                                    <span
                                        className="w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-all"
                                        style={isActive
                                            ? { borderColor: theme.color, background: theme.color, boxShadow: `0 0 10px ${theme.glow}` }
                                            : { borderColor: '#4b5563', background: 'transparent' }}
                                    />
                                    {/* 文字（选中时高亮描边，主题色） */}
                                    <span
                                        className={`text-xl font-black tracking-wider transition-all ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}
                                        style={isActive ? { textShadow: `0 0 12px ${theme.glow}, 0 0 3px rgba(255,255,255,0.6)` } : undefined}
                                    >
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 主体：手牌样式 + 右侧窗口（顶部对齐） */}
                <div className="flex flex-1 min-w-0 items-start gap-6">
                    {/* 手牌样式（主视觉，大）+ 下方确定按钮（总览/等级/初始牌组/个性化/武装时移入内容区，主体隐藏避免重复） */}
                    {activeWindow !== 'overview' && activeWindow !== 'levels' && activeWindow !== 'deck' && activeWindow !== 'personalize' && activeWindow !== 'armament' && (
                        <div className="flex flex-col items-center shrink-0">
                            {selectedKey && <HeroHandContent key={selectedKey} heroKey={selectedKey} scale={1.35} />}
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (selectedKey) onSelect(selectedKey); }}
                                disabled={isDefaultSelected}
                                className="mt-2 px-10 py-3 rounded-xl text-lg font-black tracking-widest hover:scale-105 transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                                style={{ background: `linear-gradient(to right, ${theme.color}, ${theme.soft})`, boxShadow: `0 0 30px ${theme.glow}` }}
                            >
                                确定选择
                            </button>
                        </div>
                    )}

                    {/* 右侧窗口：随左侧按钮切换（总览/等级/初始牌组/武装去掉最外层边框，窗口自管理） */}
                    <div className={`flex-1 min-w-0 self-stretch overflow-y-auto custom-scrollbar ${(activeWindow === 'overview' || activeWindow === 'levels' || activeWindow === 'deck' || activeWindow === 'armament') ? '' : 'rounded-xl bg-white/5 border border-white/10 p-5'}`}>
                        {!selectedKey ? (
                            <div className="h-full flex items-center justify-center text-sm text-gray-400 font-mono">
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
                            <DivinityPlaceholder heroName={selectedHero?.name ?? ''} />
                        ) : activeWindow === 'armament' ? (
                            <ArmamentContent heroKey={selectedKey} userSystem={userSystem} />
                        ) : (
                            <RoguePersonalize heroKey={selectedKey} userSystem={userSystem} onEditDeck={onEditRogueDeck} />
                        )}
                    </div>
                </div>
            </div>

            {/* [2026-08-13] 左下角：放大圆形更换按钮 + 下方文字（无外层方框） */}
            <div className="absolute bottom-6 left-6 z-[999] flex flex-col items-center gap-1.5">
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsHeroModalOpen(true); }}
                    className="w-14 h-14 rounded-full bg-white/10 hover:bg-purple-800/60 border-2 border-white/20 hover:border-purple-400 flex items-center justify-center transition-all group"
                    title="更换天启者"
                >
                    <RefreshCcw size={22} className="text-purple-300 group-hover:text-white transition-colors" />
                </button>
                <span className="text-[10px] font-bold text-gray-300 tracking-wider">更换天启者</span>
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
