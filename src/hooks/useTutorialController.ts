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

export function useTutorialController(
  script: TutorialScript | null,
  /**
   * [2026-10-16 莉莉子] 子任务完成瞬间可触发的"敌方演出"回调。
   * ── 为什么需要：某些教学桥段要求"玩家刚做完 A，敌方立刻做 B"（如
   *    「里芙格挡焰心」→「敌方单挑反打」）。若把 B 写成独立的 auto_action 步骤，
   *    task_group 全部完成与步骤推进会形成时序竞争（600ms 自动 advanceStep），
   *    B 可能跑在 A 之后很久、甚至在别的步骤里。这里改为在子任务落地的瞬间同步触发。
   * 触发约定：子任务 id 以 `enemy_cast_` 开头 ⇒ 调用 `onAutoAction(action, params)`，
   *   其中 action 为去掉该前缀的剩余部分（如 `enemy_cast_single_combat` → `single_combat`）。
   */
  onAutoAction?: (action: string, params: Record<string, unknown>) => void,
): {
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
    // [2026-10-16 莉莉子] 敌方演出钩子：id 前缀 `enemy_cast_` ⇒ 子任务完成后触发敌方自动施法。
    //   ⚠️ 触发时机的**唯一**来源就是这里（单一给定路径）——此前还额外挂过一个
    //      「等 COMBAT_RESOLVED 再放行」的监听器，那个监听器在子任务**激活**时就挂了 pending，
    //      导致上一场战斗的结算事件一冒出来就把敌方法术提前放了出去
    //      （程实测：「我一用里芙去格挡焰心，单挑就锁定了里芙和焰心」）⇒ 已彻底删除，不再双路径。
    //   `delayMs`：从子任务完成到敌方出手的等待时间。用于"玩家点完确定、还要等战斗结算播完
    //      才轮到敌方出手"这类场景（本关「确认防线」用的就是它）。
    //   ⚠️ 映射规则：剥掉前缀后若仍是 `single_combat*` 形态，统一归一成 `single_combat`
    //      —— 否则会变成不存在的 action，消费端（GameSession 的 'single_combat' 分支）永远收不到。
    if (subTaskId.startsWith('enemy_cast_') && onAutoAction) {
      let action = subTaskId.slice('enemy_cast_'.length);
      if (action.startsWith('single_combat')) action = 'single_combat';
      const selfTask = derived.currentTaskGroup?.subTasks.find(st => st.id === subTaskId);
      const cfg = selfTask?.expectedAction.onCompleteAction;
      // 🛡️ [2026-10-16 莉莉子 BUG修复 · 硬防线]
      //   此前是"只认 id 前缀就开火"，没配 `onCompleteAction` 的也照打（退化成 150ms + 空参数）。
      //   于是当另一处子任务**重名**沿用该前缀时，就静默多打了一发敌方「单挑」
      //   （程实测："我一用里芙去格挡焰心，单挑就锁定了里芙和焰心"）。
      //   ⇒ 现在要求**必须显式配置 `onCompleteAction`** 才施法：前缀只是命名习惯，
      //     配置才是开火开关。谁再重名也不会误开火。
      if (!cfg) {
        console.warn(`[Tutorial] 子任务 ${subTaskId} 带 enemy_cast_ 前缀但未配置 onCompleteAction ⇒ 不触发敌方施法`);
        return;
      }
      const extraParams = cfg.params ?? {};
      const delayMs = typeof cfg.delayMs === 'number' ? cfg.delayMs : 150;
      setTimeout(() => onAutoAction(action, extraParams), delayMs);
    }
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
  }, [derived.currentTaskGroup, onAutoAction]);

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
