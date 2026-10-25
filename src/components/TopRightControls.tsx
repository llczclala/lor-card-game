// ==========================================
// 右上角悬浮控制条 —— 全屏 + 暂停
// [2026-10-24 莉莉子 · ESC 归属权改造]
//
// 👤 程的需求：设置界面「全屏显示」下方新增三个开关，其中两个是**右上角按钮**：
//    ① 在右上角显示全屏按钮（= 之前那个被收进设置窗口的常驻按钮，现在可开关）
//    ② 在右上角显示暂停按钮（原先暂停只能按 ESC，触屏/手柄玩家没有入口）
//
// ── 这里为什么是「App 全局层」而不是画在 GameSession 里 ──────────────
//   全屏按钮**大厅也要有**（选卡组/抽卡时也想切全屏），
//   而 GameSession 只在三个对局 Wrapper 里挂载 ⇒ 只能放全局。
//   暂停按钮虽然只在对局中有意义，搭同一趟车（同一根悬浮条）最省事，
//   可见性由 `inGame` + 设置项两个条件同时把关。
//
// ── 暂停为什么要走事件而不是 prop ─────────────────────────────────
//   暂停态是 GameSession 的局部 state（`isPaused`），而本组件在 App 层。
//   ⇒ 点击发 `GAME_TOGGLE_PAUSE`，GameSession 收到后切自己的 state；
//     反过来本组件订阅 `GAME_PAUSE` / `GAME_RESUME` 把图标同步成播放/暂停两态。
//     一套广播两头用，不新增状态通道。
//
// ⚠️ z-[9999]：沿用原全屏按钮的层级，**刻意高于**暂停层(1000)与设置面板(1100)，
//   这样暂停层打开时这个按钮依然可点（点它=恢复游戏），不会"暂停了就点不到"。
// ==========================================
import React, { useEffect, useState } from 'react';
import { Maximize, Minimize, Pause, Play } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { isFullscreenActive, toggleFullscreen, UI_CONTROL_DEFAULT } from '../utils/fullscreen';

interface TopRightControlsProps {
    /** 是否处于对局中（标准 / 教程 / 肉鸽战斗）—— 暂停按钮只在这种情况下出现 */
    inGame?: boolean;
    /** 设置项「右上角：全屏按钮」 */
    showFullscreen?: boolean;
    /** 设置项「右上角：暂停按钮」 */
    showPause?: boolean;
    /**
     * 临时隐藏（设置面板打开时）。
     *
     * ⚠️ 为什么必须这么做：本条的 `z-[9999]` **高于**设置面板的 `z-[1100]`，
     *   而设置面板的关闭按钮 X 正好在右上角（`SettingsModal` 标题栏 `justify-between` 的右端）
     *   ⇒ 不止损就会**把关闭按钮压住**，玩家只能靠 ESC 退出设置。
     *   原来只有一个 40px 按钮时勉强算既存瑕疵，现在两个并排（约 80px）必然撞上。
     *
     * ⚠️ 用 `return null` 而不是在 App 侧条件渲染（卸载）：组件一旦卸载，
     *   内部的 `GAME_PAUSE/GAME_RESUME` 订阅会解绑、`isPaused` 会丢
     *   ⇒ 从暂停层点开设置、再关掉设置时，暂停按钮的图标会错成"暂停"而实际还在暂停。
     */
    hidden?: boolean;
}

/** 悬浮按钮的统一外观（复刻 2026-10 之前那个常驻全屏按钮的皮） */
const BTN_CLASS =
    'pointer-events-auto p-2 bg-slate-900/50 hover:bg-slate-800/80 text-gray-400 hover:text-white rounded-full ' +
    'backdrop-blur-sm transition-all duration-200 border border-white/10 hover:scale-110 shadow-lg group';

export const TopRightControls: React.FC<TopRightControlsProps> = ({
    inGame = false,
    // 默认值一律取 `UI_CONTROL_DEFAULT`（唯一真源），不在这里写死 true/false
    showFullscreen = UI_CONTROL_DEFAULT.showFullscreenButton,
    showPause = UI_CONTROL_DEFAULT.showPauseButton,
    hidden = false,
}) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    // 暂停入口是否可用：结算后 GameSession 会广播 false（那边 `handleTogglePause` 会直接 return，
    // 按钮留着就是"死按钮"，且图标可能与真实状态错位）
    const [pauseAvailable, setPauseAvailable] = useState(true);

    // 全屏状态跟随（含玩家按 F11 / 系统手势自行切换）
    useEffect(() => {
        const handleChange = () => setIsFullscreen(isFullscreenActive());
        handleChange();
        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);

    // 暂停状态跟随 —— 只认 GameSession 真正进出暂停时发的那对事件
    useEffect(() => {
        const onPause = () => setIsPaused(true);
        const onResume = () => setIsPaused(false);
        eventBus.on(GameEvents.GAME_PAUSE, onPause);
        eventBus.on(GameEvents.GAME_RESUME, onResume);
        return () => {
            eventBus.off(GameEvents.GAME_PAUSE, onPause);
            eventBus.off(GameEvents.GAME_RESUME, onResume);
        };
    }, []);

    // 离开对局后残留的暂停标记要清掉，否则下次进对局按钮一上来显示"播放"
    useEffect(() => {
        if (!inGame) {
            setIsPaused(false);
            setPauseAvailable(true); // 离开对局 → 下次进局默认可用（GameSession 挂载后会自行校正）
        }
    }, [inGame]);

    // 暂停入口可用性跟随 —— 结算后 GameSession 会广播 false
    //   🔴 为什么要这条（2026-10-24 独立审查抓出）：结算时 `inGame`（= appState）仍是 'game'，
    //      而 GameSession 的 `handleTogglePause` 有 `if (game.gameResult) return` 守卫
    //      ⇒ 按钮留在右上角、点着没反应；若暂停态有残留，图标还会显示"继续"而实际不可点。
    useEffect(() => {
        const onAvailable = (available?: unknown) => setPauseAvailable(available !== false);
        eventBus.on(GameEvents.GAME_PAUSE_AVAILABLE, onAvailable);
        return () => eventBus.off(GameEvents.GAME_PAUSE_AVAILABLE, onAvailable);
    }, []);

    const pauseVisible = showPause && inGame && pauseAvailable;
    // `hidden` 的 `return null` 发生在所有 hook 之后 ⇒ 组件仍挂载、订阅与 state 都保留
    if (hidden) return null;
    if (!showFullscreen && !pauseVisible) return null;

    return (
        // ⚠️ `pointer-events-none` 在容器、`pointer-events-auto` 在按钮：
        //   本容器是 `fixed top-0 right-0`，如果自己也接收指针事件，`p-2` 与 `gap-2` 的
        //   那些**空隙**会吃掉下层 UI 的点击（大厅资源栏 / 抽卡返回键就在这个角）。
        //   只有按钮本身该吃点击。
        <div className="fixed top-0 right-0 z-[9999] flex items-center gap-2 p-2 pointer-events-none">
            {pauseVisible && (
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_CLICK);
                        eventBus.emit(GameEvents.GAME_TOGGLE_PAUSE);
                    }}
                    className={BTN_CLASS}
                    title={isPaused ? '继续游戏' : '暂停游戏'}
                >
                    {isPaused ? (
                        <Play size={24} className="group-hover:text-emerald-400 transition-colors" />
                    ) : (
                        <Pause size={24} className="group-hover:text-amber-400 transition-colors" />
                    )}
                </button>
            )}

            {showFullscreen && (
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_CLICK);
                        void toggleFullscreen();
                    }}
                    className={BTN_CLASS}
                    title={isFullscreen ? '退出全屏' : '全屏模式'}
                >
                    {isFullscreen ? (
                        <Minimize size={24} className="group-hover:text-blue-400 transition-colors" />
                    ) : (
                        <Maximize size={24} className="group-hover:text-yellow-400 transition-colors" />
                    )}
                </button>
            )}
        </div>
    );
};
