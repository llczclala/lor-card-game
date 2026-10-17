import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { eventBus, GameEvents } from '../utils/eventBus';
import { useFullscreen } from './FullScreenToggle'; // [2026-10-14 程拍板] 全屏开关（原右上角独立按钮收进此处）
import { X, Music, Volume2, Mic, Film, VolumeX, Settings as SettingsIcon, Power, RotateCw, Home, Swords, RotateCcw } from 'lucide-react';
// ══════════════════════════════════════════════════════════════════════
// 🎛️ 系统设置面板（`SettingsModal`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 标题页右下角 / 局内暂停层里点「设置」盖满全屏的那一屏：
//   顶部标题栏 + 左侧四个标签（音频/画面/游戏/系统）+ 中间内容区 + 底部功能区（重开对局/返回大厅/QUIT GAME）。
// 管：①标题栏 ②左侧标签栏 ③中间内容区外框与小节标题 ④音量行（AUDIO VOLUME 四条）
//     ⑤开关行（全屏/动态特效/游戏三页共用）⑥画面页「分辨率三选一」
//     ⑦系统页（版本信息 + 恢复默认）⑧底部功能区 ⑨QUIT GAME 与二次确认。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 四页（音频/画面/游戏/系统）共用本块 —— 改「开关行」会四页一起变（有意如此）。
// ⚠️ 本屏没有 `max-w-*` / `vh` / `vw`，天生合铁律（1680×1050 画布）。
// ⚠️ 刻意**没搬**的类（都是"铺满/装饰/状态"，不是可调尺寸）：
//     `w-full` · `h-full` · `flex-1` · `min-h-0` · `shrink-0` · `inset-0` · 各 `-0` 定位
//     · `rounded-full`（滚圆，不是尺寸）· `opacity-*` · `tracking-*` · `font-*` · `italic` · `uppercase`
//     · `hover:*` / `group-hover:*` · `transition-*` · `animate-*` · `shadow-*` · `bg-*` / `text-<色>`
//     · `top-1/2` + `-translate-*`（居中惯用法）· 开关圆钮的左右落点（状态驱动，见 `switchKnob*`）
// ⚠️ 开关圆钮：原为 `top-1` + `${enabled ? 'left-8' : 'left-1'}` 两个类，
//     已成 `switchKnobTop` / `switchKnobOnLeft` / `switchKnobOffLeft` 三个值 ——
//     **改 `switchWidth` 时必须同步改 `switchKnobOnLeft`**（否则圆钮会滑出滑轨）。
// ══════════════════════════════════════════════════════════════════════
export const SETTINGS_UI = {
    // ══ ① 顶部标题栏 ══════════════════════════════════════════════════
    /** 左右内边距 px（原 px-8 = 32） */
    headerPadX: 32,
    /** 上下内边距 px（原 py-6 = 24） */
    headerPadY: 24,
    /** 底部分割线 px（原 border-b = 1） */
    headerBorderWidth: 1,
    /** 「系统设置」字号 px（原 text-2xl = 24） */
    titleFontSize: 48,
    /** 标题左侧齿轮图标 px（原 SettingsIcon 的 size=24） */
    titleIconSize: 48,
    /** 齿轮与文字的间距 px（原 gap-3 = 12） */
    titleGap: 12,
    /** 右上关闭按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** 右上 ✕ 图标 px（原 ✕ 的 size=24） */
    closeIconSize: 48,

    // ══ ② 左侧标签栏 ══════════════════════════════════════════════════
    /** 标签栏宽 px（原 w-44 = 176） */
    sidebarWidth: 250,
    /** 右分割线 px（原 border-r = 1） */
    sidebarBorderWidth: 1,
    /** 标签栏内边距 px（原 p-4 = 16） */
    sidebarPad: 16,
    /** 四个标签之间的行距 px（原 space-y-1 = 4） */
    sidebarGap: 8,
    /** 标签内：图标与文字的间距 px（原 gap-3 = 12） */
    tabGap: 12,
    /** 标签左右内边距 px（原 px-4 = 16） */
    tabPadX: 16,
    /** 标签上下内边距 px（原 py-3 = 12） */
    tabPadY: 12,
    /** 标签圆角 px（原 rounded-xl = 12） */
    tabRadius: 12,
    /** 标签字号 px（原 text-sm = 14） */
    tabFontSize: 28,
    /** 标签图标 px（原 size={18}） */
    tabIconSize: 36,
    /** 标签描边 px（原 border = 1） */
    tabBorderWidth: 1,

    // ══ ③ 中间内容区（外框 + 小节标题）═══════════════════════════════
    /** 内容区四周内边距 px（原 p-6 = 24） */
    contentPad: 24,
    /** 各页内容块之间的行距 px（原 space-y-6 = 24） */
    contentGap: 24,
    /**
     * 内容块**内部**的行距 px。原为 `space-y-4`（= 16）。
     * ⚠️ 「Audio Volume」那一块的标题原自带 `mb-4`，块级下它与 `space-y-4` 注入的
     *    margin-top **折叠成同一个 16px** ⇒ 这里用同一个值表达；想让标题更贴近列表就调小它。
     */
    sectionGap: 16,
    /** 小节标题（AUDIO VOLUME / DISPLAY / GAMEPLAY …）字号 px（原 text-xs = 12） */
    sectionTitleFontSize: 24,
    /** 底部块的上内边距 px（原 pt-2 = 8） */
    sectionPadTop: 8,

    // ══ ④ 音量行（AUDIO VOLUME 四条共用）═════════════════════════════
    /** 行内三大块的间距 px（原 gap-6 = 24） */
    volRowGap: 24,
    /** 行内边距 px（原 p-4 = 16） */
    volRowPad: 16,
    /** 行圆角 px（原 rounded-xl = 12） */
    volRowRadius: 12,
    /** 行描边 px（原 border = 1） */
    volRowBorderWidth: 1,
    /** 左侧「图标 + 名称」组内间距 px（原 gap-4 = 16） */
    volLeftGap: 16,
    /** 左侧「图标 + 名称」组宽 px（原 w-32 = 128） */
    volLabelWidth: 140,
    /** 静音按钮内边距 px（原 p-2 = 8） */
    volMutePad: 8,
    /** 静音/音量图标 px（原 size={20}） */
    volMuteIconSize: 40,
    /** 「音乐 / 音效 / 语音 / 过场」字号 px（原 text-sm = 14） */
    volLabelFontSize: 28,
    /** 滑轨高 px（原 h-2 = 8） */
    volTrackHeight: 8,
    /** 滑块圆点直径 px（原 w-4 h-4 = 16） */
    volKnobSize: 32,
    /** 右侧百分比数字区宽 px（原 w-12 = 48） */
    volValueWidth: 48,

    // ══ ⑤ 开关行（全屏 / 动态特效 / 游戏，四页共用）═══════════════════
    /** 行内边距 px（原 p-4 = 16） */
    toggleRowPad: 16,
    /** 行圆角 px（原 rounded-xl = 12） */
    toggleRowRadius: 12,
    /** 行描边 px（原 border = 1） */
    toggleRowBorderWidth: 1,
    /** 标题字号 px（原 text-sm = 14） */
    toggleTitleFontSize: 28,
    /** 说明文字号 px（原 text-xs = 12） */
    toggleDescFontSize: 24,
    /** 说明文字与标题的间距 px（原 mt-0.5 = 2） */
    toggleDescMarginTop: 2,
    /** 开关条宽 px（原 w-14 = 56） */
    switchWidth: 56,
    /** 开关条高 px（原 h-7 = 28） */
    switchHeight: 28,
    /** 开关圆钮直径 px（原 w-5 h-5 = 20） */
    switchKnobSize: 20,
    /** 开关圆钮距顶 px（原 top-1 = 4）—— 竖直居中 ≈ (switchHeight − switchKnobSize) / 2 */
    switchKnobTop: 4,
    /** 「关」时圆钮距左 px（原 left-1 = 4） */
    switchKnobOffLeft: 4,
    /** 「开」时圆钮距左 px（原 left-8 = 32）—— 见块顶注释：改 switchWidth 要同步改这里 */
    switchKnobOnLeft: 32,

    // ══ ⑥ 画面页「分辨率三选一」═══════════════════════════════════════
    /** 外框内边距 px（原 p-1 = 4） */
    segPad: 4,
    /** 外框圆角 px（原 rounded-xl = 12） */
    segRadius: 12,
    /** 外框描边 px（原 border = 1） */
    segBorderWidth: 1,
    /** 三档按钮上下内边距 px（原 py-2.5 = 10） */
    segItemPadY: 10,
    /** 三档按钮字号 px（原 text-sm = 14） */
    segItemFontSize: 28,
    /** 三档按钮圆角 px（原 rounded-lg = 8） */
    segItemRadius: 8,

    // ══ ⑦ 系统页（版本信息 + 恢复默认）════════════════════════════════
    /** 信息块内行距 px（原 gap-4 = 16） */
    sysBoxGap: 16,
    /** 信息块内边距 px（原 p-8 = 32） */
    sysBoxPad: 32,
    /** 信息块圆角 px（原 rounded-xl = 12） */
    sysBoxRadius: 12,
    /** 信息块描边 px（原 border = 1） */
    sysBoxBorderWidth: 1,
    /** 「当前版本」字号 px（原 text-sm = 14） */
    sysTextFontSize: 28,
    /** 版本号与「当前版本」的间距 px（原 ml-1 = 4） */
    sysVersionMarginLeft: 4,
    /** 底部提示语字号 px（原 text-xs = 12） */
    sysHintFontSize: 24,
    /** 「恢复默认设置」图标与文字间距 px（原 gap-2 = 8） */
    resetBtnGap: 8,
    /** 该按钮左右内边距 px（原 px-5 = 20） */
    resetBtnPadX: 20,
    /** 该按钮上下内边距 px（原 py-2.5 = 10） */
    resetBtnPadY: 10,
    /** 该按钮圆角 px（原 rounded-xl = 12） */
    resetBtnRadius: 12,
    /** 该按钮字号 px（原 text-sm = 14） */
    resetBtnFontSize: 28,
    /** 该按钮描边 px（原 border = 1） */
    resetBtnBorderWidth: 1,
    /** 该按钮图标 px（原 size={16}） */
    resetBtnIconSize: 32,

    // ══ ⑧ 底部功能区（重开对局 / 返回大厅）════════════════════════════
    /** 功能区左右内边距 px（原 px-6 = 24） */
    footerPadX: 24,
    /** 功能区上下内边距 px（原 py-4 = 16） */
    footerPadY: 16,
    /** 顶部分割线 px（原 border-t = 1） */
    footerBorderWidth: 1,
    /** 左侧两个按钮的间距 px（原 gap-3 = 12） */
    footerLeftGap: 12,
    /** 按钮内：图标与文字间距 px（原 gap-2 = 8） */
    footBtnGap: 8,
    /** 按钮左右内边距 px（原 px-5 = 20） */
    footBtnPadX: 20,
    /** 按钮上下内边距 px（原 py-2 = 8） */
    footBtnPadY: 8,
    /** 按钮字号 px（原 text-sm = 14） */
    footBtnFontSize: 28,
    /** 按钮描边 px（原 border = 1） */
    footBtnBorderWidth: 1,
    /** 按钮图标 px（原 size={16}） */
    footBtnIconSize: 32,

    // ══ ⑨ QUIT GAME 与二次确认 ════════════════════════════════════════
    /** QUIT GAME 按钮：图标与文字间距 px（原 gap-2 = 8） */
    quitBtnGap: 8,
    /** 该按钮左右内边距 px（原 px-6 = 24） */
    quitBtnPadX: 24,
    /** 该按钮上下内边距 px（原 py-2 = 8） */
    quitBtnPadY: 8,
    /** 该按钮字号 px（原 text-sm = 14） */
    quitBtnFontSize: 26,
    /** 该按钮描边 px（原 border = 1） */
    quitBtnBorderWidth: 1,
    /** 该按钮电源图标 px（原 size={16}） */
    quitBtnIconSize: 32,
    /** 确认条内间距 px（原 gap-2 = 8） */
    confirmGap: 8,
    /** 确认条左右内边距 px（原 px-3 = 12） */
    confirmPadX: 12,
    /** 确认条上下内边距 px（原 py-1.5 = 6） */
    confirmPadY: 6,
    /** 确认条描边 px（原 border = 1） */
    confirmBorderWidth: 1,
    /** 「确认退出游戏？」字号 px（原 text-sm = 14） */
    confirmTextFontSize: 14,
    /** 「是 / 否」两个按钮左右内边距 px（原 px-4 = 16） */
    confirmBtnPadX: 16,
    /** 「是 / 否」两个按钮上下内边距 px（原 py-1 = 4） */
    confirmBtnPadY: 4,
    /** 「是 / 否」两个按钮字号 px（原 text-sm = 14） */
    confirmBtnFontSize: 14,
    /** 「否」按钮描边 px（原 border = 1） */
    confirmNoBorderWidth: 1,
} as const;


interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    // 音量控制回调 (0.0 - 1.0)
    volumes: {
        bgm: number;
        sfx: number;
        voice: number;
        movie: number;
    };
    onVolumeChange: (type: 'bgm' | 'sfx' | 'voice' | 'movie', value: number) => void;
    // [新增] 画质控制回调
    videoResolution?: '1k' | '2k' | '4k';
    onResolutionChange?: (res: '1k' | '2k' | '4k') => void;
    // [新增] 开局抽卡动画跳过开关
    skipStartDrawAnimation?: boolean;
    onToggleSkipDraw?: () => void;
    // [新增] 默认跳过升级影片
    skipLevelupMovie?: boolean;
    onToggleSkipLevelup?: () => void;
    // [新增] 默认跳过胜利影片
    skipVictoryMovie?: boolean;
    onToggleSkipVictory?: () => void;
    // [2026-08-13] 动态牌桌开关
    deskDynamic?: boolean;
    onToggleDeskDynamic?: () => void;
    // [2026-08-16] 天启者动态卡面开关
    heroDynamic?: boolean;
    onToggleHeroDynamic?: () => void;
    // [2026-08-23] 动态卡背开关
    cardBackDynamic?: boolean;
    onToggleCardBackDynamic?: () => void;
    // [2026-09-26] 动态法术/单位卡面开关
    spellDynamic?: boolean;
    onToggleSpellDynamic?: () => void;
    // [2026-08-16] 恢复默认设置（系统标签页入口）
    onResetSettings?: () => void;
    // [新增] 对局操作
    isInGame?: boolean;
    // [2026-08-25 莉莉子 开发者] 肉鸽开发者重开入口：开发者账号在 rogue_game 时也显示"重开对局"（正常账号照旧隐藏）
    isRogueDevRestart?: boolean;
    onRestartMatch?: () => void;
    onReturnToLobby?: () => void;
}

// 设置标签页类型
type SettingsTab = 'audio' | 'video' | 'game' | 'system';

const VolumeSlider = ({ label, icon: Icon, value, onChange }: { label: string, icon: any, value: number, onChange: (val: number) => void }) => {
    const [lastValue, setLastValue] = useState(value > 0 ? value : 0.5);

    const handleMuteToggle = () => {
        eventBus.emit(GameEvents.UI_CLICK); // [新增] 点击音效
        if (value > 0) {
            setLastValue(value);
            onChange(0);
        } else {
            onChange(lastValue);
        }
    };

    return (
        <div className="flex items-center bg-white/5 border-white/5 hover:border-white/10 transition-colors" style={{ gap: SETTINGS_UI.volRowGap, padding: SETTINGS_UI.volRowPad, borderRadius: SETTINGS_UI.volRowRadius, borderWidth: SETTINGS_UI.volRowBorderWidth, borderStyle: 'solid' }}>
            {/* 左侧：图标与标签 */}
            <div className="flex items-center" style={{ gap: SETTINGS_UI.volLeftGap, width: SETTINGS_UI.volLabelWidth }}>
                <button
                    onClick={handleMuteToggle}
                    className={`rounded-full transition-colors ${value === 0 ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`} style={{ padding: SETTINGS_UI.volMutePad }}
                >
                    {value === 0 ? <VolumeX size={SETTINGS_UI.volMuteIconSize} /> : <Icon size={SETTINGS_UI.volMuteIconSize} />}
                </button>
                <span className="font-bold tracking-wider text-gray-300" style={{ fontSize: SETTINGS_UI.volLabelFontSize }}>{label}</span>
            </div>

            {/* 中间：滑块 */}
            <div className="flex-1 relative bg-gray-700 rounded-full group cursor-pointer" style={{ height: SETTINGS_UI.volTrackHeight }}>
                {/* 进度条背景 */}
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    // [新增] 只有在松开鼠标/手指时才播放音效，避免拖动时噪音过于密集
                    onMouseUp={() => eventBus.emit(GameEvents.UI_CLICK)}
                    onTouchEnd={() => eventBus.emit(GameEvents.UI_CLICK)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
                <div
                    className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all group-hover:bg-blue-400"
                    style={{ width: `${value * 100}%` }}
                ></div>
                {/* 滑块圆点 */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full shadow-lg transition-all group-hover:scale-125 pointer-events-none z-10"
                    style={{width: SETTINGS_UI.volKnobSize, height: SETTINGS_UI.volKnobSize, left: `${value * 100}%`, transform: 'translate(-50%, -50%)' }}
                ></div>
            </div>

            {/* 右侧：数值 */}
            <div className="text-right font-mono font-bold text-blue-200" style={{ width: SETTINGS_UI.volValueWidth }}>
                {Math.round(value * 100)}%
            </div>
        </div>
    );
};

// [2026-08-16] 通用开关行（标题 + 描述 + 右侧 toggle），避免多个设置项重复 JSX
const ToggleRow = ({ title, desc, enabled, onToggle }: { title: string; desc: string; enabled: boolean; onToggle?: () => void }) => (
    <div className="flex items-center justify-between bg-white/5 border-white/5 hover:border-white/10 transition-colors" style={{ padding: SETTINGS_UI.toggleRowPad, borderRadius: SETTINGS_UI.toggleRowRadius, borderWidth: SETTINGS_UI.toggleRowBorderWidth, borderStyle: 'solid' }}>
        <div className="flex flex-col">
            <span className="font-bold text-gray-200" style={{ fontSize: SETTINGS_UI.toggleTitleFontSize }}>{title}</span>
            <span className="text-gray-500" style={{ fontSize: SETTINGS_UI.toggleDescFontSize, marginTop: SETTINGS_UI.toggleDescMarginTop }}>{desc}</span>
        </div>
        <button
            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onToggle?.(); }}
            className={`relative rounded-full transition-all duration-300 ${enabled ? 'bg-blue-500' : 'bg-gray-700'}`} style={{ width: SETTINGS_UI.switchWidth, height: SETTINGS_UI.switchHeight }}
        >
            <div className="absolute bg-white rounded-full shadow-md transition-all duration-300" style={{ width: SETTINGS_UI.switchKnobSize, height: SETTINGS_UI.switchKnobSize, top: SETTINGS_UI.switchKnobTop, left: enabled ? SETTINGS_UI.switchKnobOnLeft : SETTINGS_UI.switchKnobOffLeft }}></div>
        </button>
    </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, volumes, onVolumeChange, videoResolution = '1k', onResolutionChange, skipStartDrawAnimation = false, onToggleSkipDraw, skipLevelupMovie = false, onToggleSkipLevelup, skipVictoryMovie = false, onToggleSkipVictory, deskDynamic = false, onToggleDeskDynamic, heroDynamic = false, onToggleHeroDynamic, cardBackDynamic = false, onToggleCardBackDynamic, spellDynamic = false, onToggleSpellDynamic, onResetSettings, isInGame = false, isRogueDevRestart = false, onRestartMatch, onReturnToLobby }) => {

    // [2026-08-16] 当前激活的标签页
    const [activeTab, setActiveTab] = useState<SettingsTab>('audio');

    // [2026-10-14 程拍板] 全屏开关（原为右上角独立悬浮按钮）
    const { isFullscreen, toggleFullscreen } = useFullscreen();

    // ESC 键监听
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭音效
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleExitGame = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        // 在 Electron (nodeIntegration: true) 环境下，这会直接关闭窗口并退出应用
        window.close();
    };

    if (!isOpen) return null;

    // [2026-08-16] 左侧标签栏定义（图标 + 文字，按游戏尺度分组）
    const TABS: { key: SettingsTab; label: string; icon: any }[] = [
        { key: 'audio', label: '音频', icon: Volume2 },
        { key: 'video', label: '画面', icon: Film },
        { key: 'game', label: '游戏', icon: Swords },
        { key: 'system', label: '系统', icon: SettingsIcon },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    /* [2026-09-15 莉莉子] z-1000→1100：配合局内暂停层上调（z-800→1000，让其盖住抽卡动画的 z-999），
                       设置面板需保持更高一级（面板是从暂停层打开的）。与 1150 数据金弹窗 / 9998+ 记录层的既有关系不变。 */
                    className="fixed inset-0 z-[1100] bg-[#0f172a] flex flex-col overflow-hidden"
                >
                        {/* 标题栏 */}
                        <div className="flex justify-between items-center border-white/10 bg-white/5" style={{ paddingLeft: SETTINGS_UI.headerPadX, paddingRight: SETTINGS_UI.headerPadX, paddingTop: SETTINGS_UI.headerPadY, paddingBottom: SETTINGS_UI.headerPadY, borderBottomWidth: SETTINGS_UI.headerBorderWidth, borderBottomStyle: 'solid' }}>
                            <h2 className="font-black italic tracking-widest text-white flex items-center" style={{ fontSize: SETTINGS_UI.titleFontSize, gap: SETTINGS_UI.titleGap }}>
                                <SettingsIcon size={SETTINGS_UI.titleIconSize} className="text-blue-500" />
                                系统设置
                            </h2>
                            <button
                                onClick={() => {
                                    eventBus.emit(GameEvents.UI_BACK); // [新增] 关闭音效
                                    onClose();
                                }}
                                className="hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white" style={{ padding: SETTINGS_UI.closePad }}
                            >
                                <X size={SETTINGS_UI.closeIconSize} />
                            </button>
                        </div>

                        {/* [2026-08-16 重构] 主体：左侧标签栏 + 中间内容区（flex-1 min-h-0 保证内容区可滚动不撑高） */}
                        <div className="flex flex-1 min-h-0">
                            {/* 左侧标签栏 */}
                            <div className="shrink-0 border-white/10 bg-black/20 overflow-y-auto" style={{ width: SETTINGS_UI.sidebarWidth, borderRightWidth: SETTINGS_UI.sidebarBorderWidth, borderRightStyle: 'solid', padding: SETTINGS_UI.sidebarPad, display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sidebarGap }}>
                                {TABS.map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveTab(tab.key); }}
                                        className={`w-full flex items-center font-bold tracking-widest transition-all ${
                                            activeTab === tab.key
                                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 shadow-lg shadow-blue-900/30'
                                                : 'text-gray-400 hover:bg-white/5 hover:text-white border-transparent'
                                        }`} style={{ gap: SETTINGS_UI.tabGap, paddingLeft: SETTINGS_UI.tabPadX, paddingRight: SETTINGS_UI.tabPadX, paddingTop: SETTINGS_UI.tabPadY, paddingBottom: SETTINGS_UI.tabPadY, borderRadius: SETTINGS_UI.tabRadius, fontSize: SETTINGS_UI.tabFontSize, borderWidth: SETTINGS_UI.tabBorderWidth, borderStyle: 'solid' }}
                                    >
                                        <tab.icon size={SETTINGS_UI.tabIconSize} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* 中间内容区：随标签切换（AnimatePresence 淡入过渡）；条目多时内部鼠标滚轮滚动，不撑高面板 */}
                            <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: SETTINGS_UI.contentPad }}>
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeTab}
                                        initial={{ opacity: 0, x: 12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -12 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.contentGap }}
                                    >
                                        {/* ========== 音频标签 ========== */}
                                        {activeTab === 'audio' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap }}>
                                                <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>Audio Volume</h3>
                                                <VolumeSlider label="音乐" icon={Music} value={volumes.bgm} onChange={(v) => onVolumeChange('bgm', v)} />
                                                <VolumeSlider label="音效" icon={Volume2} value={volumes.sfx} onChange={(v) => onVolumeChange('sfx', v)} />
                                                <VolumeSlider label="语音" icon={Mic} value={volumes.voice} onChange={(v) => onVolumeChange('voice', v)} />
                                                <VolumeSlider label="过场" icon={Film} value={volumes.movie} onChange={(v) => onVolumeChange('movie', v)} />
                                            </div>
                                        )}

                                        {/* ========== 画面标签 ========== */}
                                        {activeTab === 'video' && (
                                            <>
                                                {onResolutionChange && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap }}>
                                                        <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>Video Quality</h3>
                                                        <div className="flex bg-black/60 border-white/5" style={{ padding: SETTINGS_UI.segPad, borderRadius: SETTINGS_UI.segRadius, borderWidth: SETTINGS_UI.segBorderWidth, borderStyle: 'solid' }}>
                                                            {(['1k', '2k', '4k'] as const).map(res => (
                                                                <button
                                                                    key={res}
                                                                    onClick={() => {
                                                                        eventBus.emit(GameEvents.UI_CLICK);
                                                                        onResolutionChange(res);
                                                                    }}
                                                                    className={`flex-1 font-black tracking-widest transition-all ${videoResolution === res ? 'bg-gradient-to-b from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-900/50' : 'text-gray-500 hover:text-white hover:bg-white/5'}`} style={{ paddingTop: SETTINGS_UI.segItemPadY, paddingBottom: SETTINGS_UI.segItemPadY, fontSize: SETTINGS_UI.segItemFontSize, borderRadius: SETTINGS_UI.segItemRadius }}
                                                                >
                                                                    {res.toUpperCase()}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* [2026-10-14 程拍板] 全屏开关 —— 原右上角独立按钮收进设置窗口「显示」区 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap, paddingTop: SETTINGS_UI.sectionPadTop }}>
                                                    <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>Display</h3>
                                                    <ToggleRow title="全屏显示" desc="以全屏模式运行游戏（等同 F11）" enabled={isFullscreen} onToggle={toggleFullscreen} />
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap, paddingTop: SETTINGS_UI.sectionPadTop }}>
                                                    <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>动态特效</h3>
                                                    <ToggleRow title="动态牌桌" desc="使用动态视频牌桌（15 张牌桌全部支持）" enabled={deskDynamic} onToggle={onToggleDeskDynamic} />
                                                    <ToggleRow title="动态卡面" desc="对局内英雄卡面使用动态视频（6 位天启者全部支持）" enabled={heroDynamic} onToggle={onToggleHeroDynamic} />
                                                    <ToggleRow title="动态法术卡牌" desc="对局内法术/单位卡面使用动态视频（71 张法术全部支持）" enabled={spellDynamic} onToggle={onToggleSpellDynamic} />
                                                    <ToggleRow title="动态卡背" desc="对局内/选择预览/牌组预览的卡背使用动态视频（19 张卡背支持）" enabled={cardBackDynamic} onToggle={onToggleCardBackDynamic} />
                                                </div>
                                            </>
                                        )}

                                        {/* ========== 游戏标签 ========== */}
                                        {activeTab === 'game' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap }}>
                                                <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>Gameplay</h3>
                                                <ToggleRow title="快速开局抽卡" desc="换牌后直接获得卡牌，跳过抽卡动画" enabled={skipStartDrawAnimation} onToggle={onToggleSkipDraw} />
                                                <ToggleRow title="默认跳过升级影片" desc="英雄升级时自动跳过动画影片" enabled={skipLevelupMovie} onToggle={onToggleSkipLevelup} />
                                                <ToggleRow title="默认跳过胜利影片" desc="对局胜利时自动跳过胜利动画影片" enabled={skipVictoryMovie} onToggle={onToggleSkipVictory} />
                                            </div>
                                        )}

                                        {/* ========== 系统标签 ========== */}
                                        {activeTab === 'system' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: SETTINGS_UI.sectionGap }}>
                                                <h3 className="font-bold text-gray-500 uppercase tracking-widest" style={{ fontSize: SETTINGS_UI.sectionTitleFontSize }}>System</h3>
                                                <div className="flex flex-col items-center justify-center bg-white/5 border-white/5" style={{ gap: SETTINGS_UI.sysBoxGap, padding: SETTINGS_UI.sysBoxPad, borderRadius: SETTINGS_UI.sysBoxRadius, borderWidth: SETTINGS_UI.sysBoxBorderWidth, borderStyle: 'solid' }}>
                                                    <p className="text-gray-400" style={{ fontSize: SETTINGS_UI.sysTextFontSize }}>
                                                        当前版本 <span className="text-blue-300 font-black tracking-widest" style={{ marginLeft: SETTINGS_UI.sysVersionMarginLeft }}>v{import.meta.env.PACKAGE_VERSION}</span>
                                                    </p>
                                                    <button
                                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onResetSettings?.(); }}
                                                        className="flex items-center bg-red-900/30 hover:bg-red-600 border-red-800 hover:border-red-500 text-red-200 hover:text-white transition-all font-bold tracking-wider group" style={{ gap: SETTINGS_UI.resetBtnGap, paddingLeft: SETTINGS_UI.resetBtnPadX, paddingRight: SETTINGS_UI.resetBtnPadX, paddingTop: SETTINGS_UI.resetBtnPadY, paddingBottom: SETTINGS_UI.resetBtnPadY, borderRadius: SETTINGS_UI.resetBtnRadius, fontSize: SETTINGS_UI.resetBtnFontSize, borderWidth: SETTINGS_UI.resetBtnBorderWidth, borderStyle: 'solid' }}
                                                    >
                                                        <RotateCcw size={SETTINGS_UI.resetBtnIconSize} className="group-hover:scale-110 transition-transform" />
                                                        恢复默认设置
                                                    </button>
                                                    <p className="text-gray-500" style={{ fontSize: SETTINGS_UI.sysHintFontSize }}>将重置音频、画面、游戏等所有设置为初始值</p>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* 底部功能区（固定，始终可见） */}
                        <div className="border-white/10 flex justify-between items-center bg-black/20" style={{ paddingLeft: SETTINGS_UI.footerPadX, paddingRight: SETTINGS_UI.footerPadX, paddingTop: SETTINGS_UI.footerPadY, paddingBottom: SETTINGS_UI.footerPadY, borderTopWidth: SETTINGS_UI.footerBorderWidth, borderTopStyle: 'solid' }}>
                            <div className="flex items-center" style={{ gap: SETTINGS_UI.footerLeftGap }}>
                                {(isInGame || isRogueDevRestart) && (
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onRestartMatch?.(); }}
                                        className="flex items-center bg-yellow-900/30 hover:bg-yellow-600 border-yellow-800 hover:border-yellow-500 text-yellow-200 hover:text-white rounded-full transition-all font-bold tracking-wider group" style={{ gap: SETTINGS_UI.footBtnGap, paddingLeft: SETTINGS_UI.footBtnPadX, paddingRight: SETTINGS_UI.footBtnPadX, paddingTop: SETTINGS_UI.footBtnPadY, paddingBottom: SETTINGS_UI.footBtnPadY, fontSize: SETTINGS_UI.footBtnFontSize, borderWidth: SETTINGS_UI.footBtnBorderWidth, borderStyle: 'solid' }}
                                    >
                                        <RotateCw size={SETTINGS_UI.footBtnIconSize} className="group-hover:scale-110 transition-transform" />
                                        重开对局
                                    </button>
                                )}
                                {isInGame && (
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onReturnToLobby?.(); }}
                                        className="flex items-center bg-blue-900/30 hover:bg-blue-600 border-blue-800 hover:border-blue-500 text-blue-200 hover:text-white rounded-full transition-all font-bold tracking-wider group" style={{ gap: SETTINGS_UI.footBtnGap, paddingLeft: SETTINGS_UI.footBtnPadX, paddingRight: SETTINGS_UI.footBtnPadX, paddingTop: SETTINGS_UI.footBtnPadY, paddingBottom: SETTINGS_UI.footBtnPadY, fontSize: SETTINGS_UI.footBtnFontSize, borderWidth: SETTINGS_UI.footBtnBorderWidth, borderStyle: 'solid' }}
                                    >
                                        <Home size={SETTINGS_UI.footBtnIconSize} className="group-hover:scale-110 transition-transform" />
                                        返回大厅
                                    </button>
                                )}
                            </div>

                            <QuitGameButton onConfirm={handleExitGame} />
                        </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

/**
 * [2026-09-25 莉莉子] QUIT GAME 二次确认（是 / 否）。
 * 做成自带确认态的小组件 —— 父组件不必为它新增 state，也不影响既有布局。
 * 退出游戏是不可逆操作，原来一点就走，容易误触。
 */
const QuitGameButton: React.FC<{ onConfirm: () => void }> = ({ onConfirm }) => {
    const [confirming, setConfirming] = useState(false);
    if (!confirming) {
        return (
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setConfirming(true); }}
                className="flex items-center bg-red-900/30 hover:bg-red-600 border-red-800 hover:border-red-500 text-red-200 hover:text-white rounded-full transition-all font-bold tracking-wider group" style={{ gap: SETTINGS_UI.quitBtnGap, paddingLeft: SETTINGS_UI.quitBtnPadX, paddingRight: SETTINGS_UI.quitBtnPadX, paddingTop: SETTINGS_UI.quitBtnPadY, paddingBottom: SETTINGS_UI.quitBtnPadY, fontSize: SETTINGS_UI.quitBtnFontSize, borderWidth: SETTINGS_UI.quitBtnBorderWidth, borderStyle: 'solid' }}
            >
                <Power size={SETTINGS_UI.quitBtnIconSize} className="group-hover:scale-110 transition-transform" />
                QUIT GAME
            </button>
        );
    }
    return (
        <div className="flex items-center rounded-full bg-red-950/40 border-red-800/60" style={{ gap: SETTINGS_UI.confirmGap, paddingLeft: SETTINGS_UI.confirmPadX, paddingRight: SETTINGS_UI.confirmPadX, paddingTop: SETTINGS_UI.confirmPadY, paddingBottom: SETTINGS_UI.confirmPadY, borderWidth: SETTINGS_UI.confirmBorderWidth, borderStyle: 'solid' }}>
            <span className="font-bold text-red-200 tracking-wider" style={{ fontSize: SETTINGS_UI.confirmTextFontSize }}>确认退出游戏？</span>
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onConfirm(); }}
                className="rounded-full bg-red-600 hover:bg-red-500 text-white font-black transition-colors" style={{ paddingLeft: SETTINGS_UI.confirmBtnPadX, paddingRight: SETTINGS_UI.confirmBtnPadX, paddingTop: SETTINGS_UI.confirmBtnPadY, paddingBottom: SETTINGS_UI.confirmBtnPadY, fontSize: SETTINGS_UI.confirmBtnFontSize }}
            >是</button>
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setConfirming(false); }}
                className="rounded-full bg-white/10 hover:bg-white/20 text-gray-200 font-bold border-white/20 transition-colors" style={{ paddingLeft: SETTINGS_UI.confirmBtnPadX, paddingRight: SETTINGS_UI.confirmBtnPadX, paddingTop: SETTINGS_UI.confirmBtnPadY, paddingBottom: SETTINGS_UI.confirmBtnPadY, fontSize: SETTINGS_UI.confirmBtnFontSize, borderWidth: SETTINGS_UI.confirmNoBorderWidth, borderStyle: 'solid' }}
            >否</button>
        </div>
    );
};
