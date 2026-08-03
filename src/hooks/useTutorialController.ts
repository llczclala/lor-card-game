/**
 * useTutorialController — 教程剧本状态机
 *
 * 管理教程剧本的流程推进、微任务系统状态追踪。
 * 不直接操作 DOM 或 eventBus，纯状态管理。
 * 事件检测由 TutorialController 组件层负责。
 *
 * 使用方式：
 *   const { state, actions } = useTutorialController(script);
 *   // state.currentDialogue / state.currentGuideLayer / state.currentTaskGroup …
 *   // actions.advanceStep() / actions.completeSubTask(id) / ...
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type {
  TutorialScript,
  TutorialStep,
  DialogueStep,
  GuideLayerStep,
  TaskGroupStep,
  AutoActionStep,
} from '../data/tutorialScript';

// ─── 类型 ───────────────────────────────────────────────────────────

export type SubTaskStatus = 'locked' | 'active' | 'completed';

export interface TutorialControllerState {
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 教程是否全部完成 */
  isComplete: boolean;

  // 当前步骤的降维数据（只有对应类型的步骤才有值）
  currentStep: TutorialStep | null;
  currentDialogue: DialogueStep | null;
  currentGuideLayer: GuideLayerStep | null;
  currentTaskGroup: TaskGroupStep | null;
  currentAutoAction: AutoActionStep | null;

  // ─── 微任务系统状态 ───
  /** 当前任务组中活跃的子任务索引（-1 表示无活跃子任务） */
  activeSubTaskIndex: number;
  /** 所有子任务的状态映射 */
  subTaskStates: Record<string, SubTaskStatus>;
  /** 当前子任务中的引导步索引 */
  currentGuidanceStepIndex: number;
}

export interface TutorialControllerActions {
  /** 推进到下一步 */
  advanceStep: () => void;
  /** 标记某个子任务完成（自动解锁下一个子任务） */
  completeSubTask: (subTaskId: string) => void;
  /** 推进到当前子任务的下一个引导步 */
  advanceGuidance: () => void;
  /** 重置整个教程 */
  reset: () => void;
}

// ─── 工厂函数 ───────────────────────────────────────────────────────

function deriveState(stepIndex: number, steps: TutorialStep[]): {
  currentStep: TutorialStep | null;
  currentDialogue: DialogueStep | null;
  currentGuideLayer: GuideLayerStep | null;
  currentTaskGroup: TaskGroupStep | null;
  currentAutoAction: AutoActionStep | null;
} {
  const step = steps[stepIndex] ?? null;
  if (!step) {
    return { currentStep: null, currentDialogue: null, currentGuideLayer: null, currentTaskGroup: null, currentAutoAction: null };
  }
  return {
    currentStep: step,
    currentDialogue: step.type === 'dialogue' ? step.data : null,
    currentGuideLayer: step.type === 'guide_layer' ? step.data : null,
    currentTaskGroup: step.type === 'task_group' ? step.data : null,
    currentAutoAction: step.type === 'auto_action' ? step.data : null,
  };
}

/**
 * 初始化子任务状态：第一个 active，其余 locked
 */
function initSubTaskStates(taskGroup: TaskGroupStep | null): {
  states: Record<string, SubTaskStatus>;
  activeIdx: number;
} {
  if (!taskGroup || taskGroup.subTasks.length === 0) {
    return { states: {}, activeIdx: -1 };
  }
  const states: Record<string, SubTaskStatus> = {};
  taskGroup.subTasks.forEach((st, i) => {
    states[st.id] = i === 0 ? 'active' : 'locked';
  });
  return { states, activeIdx: 0 };
}

// ─── Hook ───────────────────────────────────────────────────────────

export function useTutorialController(script: TutorialScript | null): {
  state: TutorialControllerState;
  actions: TutorialControllerActions;
} {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [subTaskStates, setSubTaskStates] = useState<Record<string, SubTaskStatus>>({});
  const [activeSubTaskIndex, setActiveSubTaskIndex] = useState(-1);
  const [currentGuidanceStepIndex, setCurrentGuidanceStepIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const steps = script?.steps ?? [];
  const totalSteps = steps.length;

  // 当前步骤降维数据
  const derived = useMemo(() => deriveState(currentStepIndex, steps), [currentStepIndex, steps]);

  // 进入新步骤时，如果是 task_group 则初始化微任务状态
  const initStepState = useCallback((stepIdx: number) => {
    const step = steps[stepIdx];
    if (step?.type === 'task_group') {
      const { states, activeIdx } = initSubTaskStates(step.data);
      setSubTaskStates(states);
      setActiveSubTaskIndex(activeIdx);
      setCurrentGuidanceStepIndex(0);
    } else {
      setSubTaskStates({});
      setActiveSubTaskIndex(-1);
      setCurrentGuidanceStepIndex(0);
    }
  }, [steps]);

  // 推进到下一步
  const advanceStep = useCallback(() => {
    const next = currentStepIndex + 1;
    if (next >= totalSteps) {
      setIsComplete(true);
      return;
    }
    setCurrentStepIndex(next);
    initStepState(next);
  }, [currentStepIndex, totalSteps, initStepState]);

  // 标记子任务完成
  const completeSubTask = useCallback((subTaskId: string) => {
    setSubTaskStates(prev => {
      const next = { ...prev, [subTaskId]: 'completed' as SubTaskStatus };
      return next;
    });
    // 解锁下一个子任务
    const tg = derived.currentTaskGroup;
    if (!tg) return;
    const idx = tg.subTasks.findIndex(st => st.id === subTaskId);
    const nextIdx = idx + 1;
    if (nextIdx < tg.subTasks.length) {
      setActiveSubTaskIndex(nextIdx);
      setCurrentGuidanceStepIndex(0);
      const nextId = tg.subTasks[nextIdx].id;
      setSubTaskStates(prev => ({ ...prev, [nextId]: 'active' }));
    } else {
      // 所有子任务完成 → 自动推进
      setActiveSubTaskIndex(-1);
      // 不在此处调用 advanceStep，由组件层判断推进
    }
  }, [derived.currentTaskGroup]);

  // 推进引导步
  const advanceGuidance = useCallback(() => {
    setCurrentGuidanceStepIndex(prev => prev + 1);
  }, []);

  // 重置
  const reset = useCallback(() => {
    setCurrentStepIndex(0);
    setIsComplete(false);
    setSubTaskStates({});
    setActiveSubTaskIndex(-1);
    setCurrentGuidanceStepIndex(0);
    initStepState(0);
  }, [initStepState]);

  // 首次 init
  useEffect(() => {
    if (steps.length > 0) {
      initStepState(0);
    }
    // 只跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state: TutorialControllerState = useMemo(() => ({
    currentStepIndex,
    totalSteps,
    isComplete,
    ...derived,
    activeSubTaskIndex,
    subTaskStates,
    currentGuidanceStepIndex,
  }), [currentStepIndex, totalSteps, isComplete, derived, activeSubTaskIndex, subTaskStates, currentGuidanceStepIndex]);

  const actions: TutorialControllerActions = useMemo(() => ({
    advanceStep,
    completeSubTask,
    advanceGuidance,
    reset,
  }), [advanceStep, completeSubTask, advanceGuidance, reset]);

  return { state, actions };
}
