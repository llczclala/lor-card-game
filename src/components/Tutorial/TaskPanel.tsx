/**
 * TaskPanel — 教程微任务面板
 *
 * 在屏幕右侧显示任务组名、子任务列表及状态，
 * 底部展示当前步骤的引导文字。
 *
 * 设计者：程
 * 实现者：莉莉子
 *
 * 📐 缩放策略：与 ScaleWrapper 保持一致
 *    游戏内部坐标 1680×1050 → 通过 transform: scale() 适配窗口
 *    本面板通过 Portal 渲染到 body，独立计算 scale 并应用 transform，
 *    从而实现与游戏画面同步缩放。
 */

import React from 'react';
import type { TaskGroupStep, TutorialSubTask } from '../../data/tutorialScript';
import type { SubTaskStatus } from '../../hooks/useTutorialController';
// [2026-10-23 莉莉子] 手机端可读性：任务栏是右侧参考区，地板 0.9（PC 端原样不变）
import { pickUiScale, MIN_TASKPANEL_UI_SCALE } from '../../platform/tuning';

// 与 ScaleWrapper 保持一致的目标分辨率
const GAME_WIDTH = 1680;
const GAME_HEIGHT = 1050;

// ════════════════════════════════════════════════════════════

interface TaskPanelProps {
  /** 任务组数据 */
  taskGroup: TaskGroupStep;
  /** 子任务状态映射 */
  subTaskStates: Record<string, SubTaskStatus>;
  /** 当前活跃的子任务索引 */
  activeSubTaskIndex: number;
  /** 当前子任务中的引导步索引 */
  currentGuidanceStepIndex: number;
}

// ─── 子任务条目 ─────────────────────────────────────────────

const statusIcon: Record<SubTaskStatus, string> = {
  locked: '🔒',
  active: '🎯',
  completed: '✅',
};

const statusStyle: Record<SubTaskStatus, string> = {
  locked: 'opacity-40',
  active: 'opacity-100',
  completed: 'opacity-80',
};

const SubTaskItem: React.FC<{
  subTask: TutorialSubTask;
  status: SubTaskStatus;
  guidanceText?: string;
}> = ({ subTask, status, guidanceText }) => {
  return (
    <div className={`flex items-start gap-3 px-3 py-2 rounded-lg transition-all ${statusStyle[status]}
                    ${status === 'active' ? 'bg-cyan-500/10 border border-cyan-500/30' : 'border border-transparent'}`}>
      <span className="text-lg flex-shrink-0 mt-0.5">{statusIcon[status]}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${status === 'active' ? 'text-white' : 'text-white/70'}`}>
          {subTask.description}
        </div>
        {status === 'active' && guidanceText && (
          <div className="text-xs text-cyan-300/80 mt-1 leading-relaxed">
            ▸ {guidanceText}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 主组件 ─────────────────────────────────────────────────

export const TaskPanel: React.FC<TaskPanelProps> = ({
  taskGroup,
  subTaskStates,
  activeSubTaskIndex,
  currentGuidanceStepIndex,
}) => {
  // 计算与 ScaleWrapper 一致的缩放比和游戏区域位置
  const [layout, setLayout] = React.useState({
    scale: 1,
    // 面板**左下角**在屏幕上的 CSS left/bottom 值（已包含游戏区偏移）
    // [2026-10-24 程拍板] 从右下角挪到左下角 —— 面板放大后右下角会挡住右侧关键按钮
    left: 16,
    bottom: 24,
    // [2026-10-23 莉莉子] 面板的**布局高上限**（已按 uiScale 换算，见下方 updateLayout）
    maxLayoutH: 9999,
  });

  React.useEffect(() => {
    const updateLayout = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 与 ScaleWrapper 同一公式：contain 模式
      const scaleX = vw / GAME_WIDTH;
      const scaleY = vh / GAME_HEIGHT;
      const scale = Math.min(scaleX, scaleY);

      // 游戏区域在屏幕上的实际像素尺寸
      const gameW = GAME_WIDTH * scale;
      const gameH = GAME_HEIGHT * scale;

      // 游戏区域在屏幕上的偏移（居中定位）
      const offsetX = (vw - gameW) / 2;
      const offsetY = (vh - gameH) / 2;

      // 面板在游戏坐标中的位置（距左下角内边距）
      const padSide = 16;    // 游戏坐标（左侧）
      const padBottom = 24;  // 游戏坐标

      // 转换为屏幕坐标的 CSS left/bottom
      const cssLeft = offsetX + padSide * scale;
      const cssBottom = offsetY + padBottom * scale;

      /**
       * [2026-10-23 莉莉子 · 手机端可读性]
       * ── 病根：整块面板只乘了一次画布 `scale`。手机横屏 `scale ≈ 0.374` ⇒
       *    `w-72` 288px 只剩 **108 CSS px 宽**，里面所有文字 4.5~6px（子任务条目每行只放得下 4~5 个字）。
       * ── 修法：改乘 `uiScale`（地板 0.9 ⇒ 面板 259px 宽、正文 12.6px），PC 端返回原 `scale`。
       * ── 但放大后**自然高度**会超出屏幕（列表原本 max-h 630px×0.9 = 567px > 手机 393px 高）
       *    ⇒ 用「屏幕可用高」反算**布局高上限**，头尾固定、列表内部滚动。
       *    PC 端这个上限（约 1010）永远大于内容高（约 740）⇒ **不产生任何影响**。
       */
      const uiScaleNow = pickUiScale(scale, MIN_TASKPANEL_UI_SCALE);
      const panelMaxVisualH = Math.max(160, vh - cssBottom - 16);
      const maxLayoutH = panelMaxVisualH / uiScaleNow;

      setLayout({ scale, left: cssLeft, bottom: cssBottom, maxLayoutH });
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  // 当前活跃子任务的引导文字
  const getCurrentGuidanceText = (): string | undefined => {
    const activeTask = taskGroup.subTasks[activeSubTaskIndex];
    if (!activeTask) return undefined;
    const guidance = activeTask.guidanceSteps[currentGuidanceStepIndex];
    return guidance?.text;
  };

  /** [2026-10-23 莉莉子] 面板内容该用的缩放（手机端地板 0.9；PC 端 = layout.scale，严格不变） */
  const uiScale = pickUiScale(layout.scale, MIN_TASKPANEL_UI_SCALE);

  return (
    <div
      // [2026-10-23] `flex flex-col` + `overflow-hidden`：面板被反算出的高度上限约束后，
      //   头部/底部固定、列表内部滚动（不做这层，放大后列表会把面板顶出屏幕）
      className="fixed z-[85] w-72 flex flex-col overflow-hidden
                 bg-slate-900/90 backdrop-blur-md rounded-xl
                 border border-slate-700/60 shadow-xl
                 transition-all duration-300"
      style={{
        left: layout.left,
        bottom: layout.bottom,
        maxHeight: layout.maxLayoutH,
        transform: `scale(${uiScale})`,
        // [2026-10-24] 锚点在**左下角**：放大只向右上长，左边与下边的间距保持不变
        transformOrigin: 'bottom left',
      }}
    >
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-slate-700/40 flex-shrink-0">
        <div className="text-xs text-cyan-400/60 uppercase tracking-wider font-medium">
          当前任务
        </div>
        <div className="text-white font-bold text-base mt-0.5">
          {taskGroup.groupName}
        </div>
      </div>

      {/* 子任务列表 */}
      <div className="px-3 py-3 space-y-1.5 max-h-[630px] overflow-y-auto grow min-h-0">
        {taskGroup.subTasks.map((st, i) => (
          <SubTaskItem
            key={st.id}
            subTask={st}
            status={subTaskStates[st.id] ?? 'locked'}
            guidanceText={
              i === activeSubTaskIndex
                ? getCurrentGuidanceText()
                : undefined
            }
          />
        ))}
      </div>

      {/* 进度指示 */}
      <div className="px-4 py-2 border-t border-slate-700/40 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>子任务进度</span>
          <span>
            {Object.values(subTaskStates).filter(s => s === 'completed').length}
            {' / '}
            {taskGroup.subTasks.length}
          </span>
        </div>
        {/* 进度条 */}
        <div className="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{
              width: `${(Object.values(subTaskStates).filter(s => s === 'completed').length / taskGroup.subTasks.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
