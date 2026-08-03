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
    // 面板右下角在屏幕上的 CSS right/bottom 值（已包含游戏区偏移）
    right: 16,
    bottom: 24,
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

      // 面板在游戏坐标中的位置（距右下角内边距）
      const padRight = 16;   // 游戏坐标
      const padBottom = 24;  // 游戏坐标

      // 转换为屏幕坐标的 CSS right/bottom
      const cssRight = offsetX + padRight * scale;
      const cssBottom = offsetY + padBottom * scale;

      setLayout({ scale, right: cssRight, bottom: cssBottom });
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

  return (
    <div
      className="fixed z-[85] w-72
                 bg-slate-900/90 backdrop-blur-md rounded-xl
                 border border-slate-700/60 shadow-xl
                 transition-all duration-300"
      style={{
        right: layout.right,
        bottom: layout.bottom,
        transform: `scale(${layout.scale})`,
        transformOrigin: 'bottom right',
      }}
    >
      {/* 标题 */}
      <div className="px-4 py-3 border-b border-slate-700/40">
        <div className="text-xs text-cyan-400/60 uppercase tracking-wider font-medium">
          当前任务
        </div>
        <div className="text-white font-bold text-base mt-0.5">
          {taskGroup.groupName}
        </div>
      </div>

      {/* 子任务列表 */}
      <div className="px-3 py-3 space-y-1.5 max-h-[60vh] overflow-y-auto">
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
      <div className="px-4 py-2 border-t border-slate-700/40">
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
