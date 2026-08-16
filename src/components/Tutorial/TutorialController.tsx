/**
 * TutorialController — 教程总控编排器
 *
 * 核心职责（不侵入 GameSession / useGameState）：
 *  1. 驱动剧本状态机（useTutorialController）
 *  2. 根据当前步骤渲染对应的教程 UI 组件
 *  3. 通过 eventBus 监听游戏事件，自动检测微任务完成
 *  4. 调度自动行为（auto_action）的信号
 *
 * 架构定位：
 *  本组件是一个覆盖层，悬浮在 GameSession 之上，
 *  通过 fixed 定位的 Portal 和 eventBus 与游戏层通信。
 *
 * 设计者：程
 * 实现者：莉莉子
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useTutorialController } from '../../hooks/useTutorialController';
import type { TutorialScript, TutorialSubTask } from '../../data/tutorialScript';
import { GuideLayer } from './GuideLayer';
import { DialogueBox } from './DialogueBox';
import { TaskPanel } from './TaskPanel';
import { ArrowIndicator } from './ArrowIndicator';

// ════════════════════════════════════════════════════════════

export interface TutorialControllerProps {
  /** 教程剧本数据 */
  script: TutorialScript;
  /** 教程完成回调 */
  onComplete: () => void;
  /** 自动行为发生时触发（由 TutorialGameWrapper 桥接到 GameSession） */
  onAutoAction?: (action: string, params: Record<string, unknown>) => void;
}

/**
 * 根据子任务的预期操作类型，获取需要监听的 eventBus 事件列表
 */
function getWatchEvents(subTask: TutorialSubTask): string[] {
  const events: string[] = [];
  switch (subTask.expectedAction.completionCondition) {
    case 'block_assigned':
      events.push(GameEvents.SFX_BLOCK);
      break;
    case 'block_selected':
      // [2026-08-15] 选中格挡者即完成（用于「尝试格挡隐秘单位」教学：格挡必然失败，不能等 block_assigned）
      events.push(GameEvents.SFX_SELECT_BLOCKER_UNIT);
      break;
    case 'block_recalled':
    case 'attack_recalled':
      events.push(GameEvents.SFX_RECALL_BLOCK);
      break;
    case 'element_clicked':
      events.push(GameEvents.UI_CLICK);
      break;
    case 'block_confirmed':
      events.push(GameEvents.SFX_CONFIRM_BLOCK);
      break;
    case 'free':
      // free 模式无事件监听，由自然完成或引导步推进
      break;
    case 'round_end':
      events.push(GameEvents.ROUND_START);
      break;
    case 'play_card':
      events.push(GameEvents.PLAY_CARD);
      break;
    case 'attack_declared':
      events.push(GameEvents.ATTACK_DECLARE);
      break;
  }
  return events;
}

/**
 * 检查事件是否满足当前活跃子任务的完成条件
 */
function doesEventMatchCondition(
  eventName: string,
  subTask: TutorialSubTask,
): boolean {
  const cond = subTask.expectedAction.completionCondition;
  switch (cond) {
    case 'block_assigned':
      return eventName === GameEvents.SFX_BLOCK;
    case 'block_selected':
      // [2026-08-15] 选中格挡者即完成（对应 SFX_SELECT_BLOCKER_UNIT）
      return eventName === GameEvents.SFX_SELECT_BLOCKER_UNIT;
    case 'block_recalled':
    case 'attack_recalled':
      return eventName === GameEvents.SFX_RECALL_BLOCK;
    case 'element_clicked':
      return eventName === GameEvents.UI_CLICK;
    case 'block_confirmed':
      return eventName === GameEvents.SFX_CONFIRM_BLOCK;
    case 'free':
      return false; // free 模式不由事件驱动
    case 'round_end':
      return eventName === GameEvents.ROUND_START;
    case 'play_card':
      return eventName === GameEvents.PLAY_CARD;
    case 'attack_declared':
      return eventName === GameEvents.ATTACK_DECLARE;
    default:
      return false;
  }
}

// ════════════════════════════════════════════════════════════

export const TutorialController: React.FC<TutorialControllerProps> = ({
  script,
  onComplete,
  onAutoAction,
}) => {
  const { state, actions } = useTutorialController(script);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const scriptRef = useRef(script);
  scriptRef.current = script;

  // ★ 对话完成时：如果下一步是 auto_action，触发后交给 auto_action 自己的 effect 推进
  const handleDialogueComplete = useCallback(() => {
    const nextStep = scriptRef.current.steps[state.currentStepIndex + 1];
    if (nextStep?.type === 'auto_action') {
      onAutoAction?.(nextStep.data.action, nextStep.data.params);
      actions.advanceStep(); // dialogue → auto_action（auto_action effect 会继续推进）
    } else {
      actions.advanceStep();
    }
  }, [state.currentStepIndex, onAutoAction, actions]);

  // ─── 教程完成时 ───
  useEffect(() => {
    if (state.isComplete) {
      const t = setTimeout(() => onCompleteRef.current(), 500);
      return () => clearTimeout(t);
    }
  }, [state.isComplete]);

  // ─── 自动行为步骤处理 ───
  useEffect(() => {
    if (state.currentAutoAction) {
      const action = state.currentAutoAction.action;
      const params = state.currentAutoAction.params;

      if (action === 'wait') {
        // 'wait': 延迟等待，但如果收到升级完成信号则提前结束
        const delay = (params.delay as number) ?? 1500;
        let timer = setTimeout(() => actions.advanceStep(), delay);
        const onLevelUpComplete = () => {
          clearTimeout(timer);
          actions.advanceStep();
        };
        eventBus.on(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE, onLevelUpComplete);
        return () => {
          clearTimeout(timer);
          eventBus.off(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE, onLevelUpComplete);
        };
      }

      if (action === 'pause_upgrade') {
        eventBus.emit(GameEvents.TUTORIAL_PAUSE_UPGRADE, params);
        const t = setTimeout(() => actions.advanceStep(), 600);
        return () => clearTimeout(t);
      }
      if (action === 'resume_upgrade') {
        eventBus.emit(GameEvents.TUTORIAL_RESUME_UPGRADE, params);
        // 不等固定延时，由升级动画播完后的 TUTORIAL_LEVEL_UP_COMPLETE 事件驱动推进
        const onComplete = () => actions.advanceStep();
        eventBus.on(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE, onComplete);
        return () => eventBus.off(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE, onComplete);
      }

      // 其他自动行为（如 enemy_attack）：发射信号给外部 wrapper
      onAutoAction?.(action, params);
      const t = setTimeout(() => actions.advanceStep(), 800);
      return () => clearTimeout(t);
    }
  }, [state.currentAutoAction, actions, onAutoAction]);

  // ─── 教程交互模式控制：通知 GameSession 当前子任务期望的操作类型 ───
  useEffect(() => {
    if (!state.currentTaskGroup) {
      eventBus.emit(GameEvents.TUTORIAL_SET_INTERACTION_MODE, { mode: null });
      return;
    }
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask) {
      eventBus.emit(GameEvents.TUTORIAL_SET_INTERACTION_MODE, { mode: null });
      return;
    }
    eventBus.emit(GameEvents.TUTORIAL_SET_INTERACTION_MODE, { mode: activeTask.expectedAction.type });
  }, [state.currentTaskGroup, state.activeSubTaskIndex]);

  // ─── 教程锁死跳过按钮控制 ───
  // 子任务有 lockSkipButton: true 时锁定跳过按钮，切换或完成时解锁
  useEffect(() => {
    if (!state.currentTaskGroup) {
      eventBus.emit(GameEvents.TUTORIAL_UNLOCK_SKIP);
      return;
    }
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (activeTask?.expectedAction.lockSkipButton) {
      eventBus.emit(GameEvents.TUTORIAL_LOCK_SKIP);
    } else {
      eventBus.emit(GameEvents.TUTORIAL_UNLOCK_SKIP);
    }
  }, [state.currentTaskGroup, state.activeSubTaskIndex]);

  // ─── 教程锁死主操作按钮（从教程开始一直锁到 end_turn 子任务）───
  useEffect(() => {
    if (!scriptRef.current) return;
    eventBus.emit(GameEvents.TUTORIAL_LOCK_ACTION);
    return () => { eventBus.emit(GameEvents.TUTORIAL_UNLOCK_ACTION); };
  }, []);

  useEffect(() => {
    if (!state.currentTaskGroup || state.activeSubTaskIndex === -1) return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (activeTask && ['end_turn', 'free_block', 'free_attack'].includes(activeTask.id)) {
      eventBus.emit(GameEvents.TUTORIAL_UNLOCK_ACTION);
    } else {
      eventBus.emit(GameEvents.TUTORIAL_LOCK_ACTION);
    }
  }, [state.currentTaskGroup, state.activeSubTaskIndex]);

  // ─── 子任务完成时解锁跳过按钮 ───
  const prevSubTaskStatesRef = useRef(state.subTaskStates);
  useEffect(() => {
    // 检测是否有子任务刚变为 completed
    const prev = prevSubTaskStatesRef.current;
    const justCompleted = Object.entries(state.subTaskStates).some(
      ([id, status]) => status === 'completed' && prev[id] !== 'completed'
    );
    prevSubTaskStatesRef.current = state.subTaskStates;
    if (justCompleted) {
      eventBus.emit(GameEvents.TUTORIAL_UNLOCK_SKIP);
    }
  }, [state.subTaskStates]);

  // ─── 微任务完成检测（eventBus 监听） ───
  // 只当处于 task_group 步骤且有活跃子任务时才监听
  const activeSubTask = state.currentTaskGroup?.subTasks[state.activeSubTaskIndex] ?? null;

  const handleGameEvent = useCallback((eventName: string) => {
    if (!activeSubTask) return;
    if (doesEventMatchCondition(eventName, activeSubTask)) {
      actions.completeSubTask(activeSubTask.id);
    }
  }, [activeSubTask, actions]);

  useEffect(() => {
    if (!activeSubTask) return;
    const watchEvents = getWatchEvents(activeSubTask);
    if (watchEvents.length === 0) return;

    // 分别绑定每个事件（以便知道哪个事件名触发了）
    const handlers = watchEvents.map(ev => {
      const cb = () => handleGameEvent(ev);
      eventBus.on(ev, cb);
      return { ev, cb };
    });

    return () => {
      handlers.forEach(({ ev, cb }) => eventBus.off(ev, cb));
    };
  }, [activeSubTask, handleGameEvent]);

  // ─── 引导步推进：选中格挡单位时推进到下一步指引 ───
  // 每个子任务只推进一次，防止反复点击取消选中导致多次推进
  const blockerSelectedRef = useRef(false);
  useEffect(() => {
    blockerSelectedRef.current = false; // 子任务切换时重置
  }, [state.activeSubTaskIndex]);
  useEffect(() => {
    const handler = () => {
      if (!state.currentTaskGroup) return;
      const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
      if (!activeTask || activeTask.expectedAction.type !== 'click_target') return;
      if (!blockerSelectedRef.current) {
        blockerSelectedRef.current = true;
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.SFX_SELECT_BLOCKER_UNIT, handler);
    return () => eventBus.off(GameEvents.SFX_SELECT_BLOCKER_UNIT, handler);
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 引导步推进：自由练习子任务完成格挡分配时推进到确认按钮指引 ───
  const blockAssignedForFreeRef = useRef(false);
  useEffect(() => {
    blockAssignedForFreeRef.current = false;
  }, [state.activeSubTaskIndex]);
  useEffect(() => {
    const handler = () => {
      if (!state.currentTaskGroup) return;
      const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
      if (!activeTask || activeTask.expectedAction.completionCondition !== 'block_confirmed') return;
      if (!blockAssignedForFreeRef.current) {
        blockAssignedForFreeRef.current = true;
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.SFX_BLOCK, handler);
    return () => eventBus.off(GameEvents.SFX_BLOCK, handler);
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 引导步推进+完成：点击以进攻（3步：宣言→芬妮→里芙）───
  const clickAttackStepRef = useRef(0);
  useEffect(() => { clickAttackStepRef.current = 0; }, [state.activeSubTaskIndex]);
  useEffect(() => {
    if (!state.currentTaskGroup) return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask || activeTask.id !== 'click_to_attack') return;
    const handleDeclare = () => {
      if (clickAttackStepRef.current === 0) {
        clickAttackStepRef.current = 1;
        actions.advanceGuidance();
      }
    };
    const handleAssign = () => {
      clickAttackStepRef.current++;
      if (clickAttackStepRef.current >= 3) {
        actions.completeSubTask('click_to_attack');
      } else {
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.ATTACK_DECLARE, handleDeclare);
    eventBus.on(GameEvents.SFX_BLOCK, handleAssign);
    return () => {
      eventBus.off(GameEvents.ATTACK_DECLARE, handleDeclare);
      eventBus.off(GameEvents.SFX_BLOCK, handleAssign);
    };
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 引导步推进+完成：点击以撤回进攻 ───
  // 2次召回分别推进引导步，完成后自动完成子任务
  const recallCountRef = useRef(0);
  useEffect(() => { recallCountRef.current = 0; }, [state.activeSubTaskIndex]);
  useEffect(() => {
    if (!state.currentTaskGroup) return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask || activeTask.id !== 'click_to_recall_attack') return;
    const handleRecall = () => {
      recallCountRef.current++;
      if (recallCountRef.current >= 2) {
        actions.completeSubTask('click_to_recall_attack');
      } else {
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.SFX_RECALL_BLOCK, handleRecall);
    return () => eventBus.off(GameEvents.SFX_RECALL_BLOCK, handleRecall);
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 引导步推进+完成：拖拽以进攻（2步）───
  const dragAttackCountRef = useRef(0);
  useEffect(() => { dragAttackCountRef.current = 0; }, [state.activeSubTaskIndex]);
  useEffect(() => {
    if (!state.currentTaskGroup) return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask || activeTask.id !== 'drag_to_attack') return;
    const handleAssign = () => {
      dragAttackCountRef.current++;
      if (dragAttackCountRef.current >= 2) {
        actions.completeSubTask('drag_to_attack');
      } else {
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.SFX_BLOCK, handleAssign);
    return () => eventBus.off(GameEvents.SFX_BLOCK, handleAssign);
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 引导步推进+完成：拖拽以撤回进攻 ───
  const dragRecallCountRef = useRef(0);
  useEffect(() => { dragRecallCountRef.current = 0; }, [state.activeSubTaskIndex]);
  useEffect(() => {
    if (!state.currentTaskGroup) return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask || activeTask.id !== 'drag_to_recall_attack') return;
    const handleRecall = () => {
      dragRecallCountRef.current++;
      if (dragRecallCountRef.current >= 2) {
        actions.completeSubTask('drag_to_recall_attack');
      } else {
        actions.advanceGuidance();
      }
    };
    eventBus.on(GameEvents.SFX_RECALL_BLOCK, handleRecall);
    return () => eventBus.off(GameEvents.SFX_RECALL_BLOCK, handleRecall);
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── 恭喜通关任务组：激活时自动完成子任务 ───
  useEffect(() => {
    if (!state.currentTaskGroup || state.currentTaskGroup.groupName !== '恭喜通关') return;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (activeTask) {
      // 马上把第一个（也是唯一一个）子任务标为完成
      actions.completeSubTask(activeTask.id);
    }
  }, [state.currentTaskGroup, state.activeSubTaskIndex, actions]);

  // ─── task_group 全部子任务完成 → 推进 ───
  const prevAllCompletedRef = useRef(false);
  useEffect(() => {
    if (!state.currentTaskGroup) {
      prevAllCompletedRef.current = false;
      return;
    }
    const allDone = state.currentTaskGroup.subTasks.every(
      st => state.subTaskStates[st.id] === 'completed'
    );
    if (allDone && !prevAllCompletedRef.current) {
      prevAllCompletedRef.current = true;
      // 所有子任务完成，稍后推进
      const t = setTimeout(() => actions.advanceStep(), 600);
      return () => clearTimeout(t);
    }
  }, [state.currentTaskGroup, state.subTaskStates, actions]);

  // ─── 获取当前活跃子任务的引导箭头配置 ───
  const getGuidanceArrow = (): { targetSelector: string; text: string; direction?: 'top' | 'bottom' | 'left' | 'right'; offset?: { x: number; y: number } } | null => {
    if (!state.currentTaskGroup) return null;
    const activeTask = state.currentTaskGroup.subTasks[state.activeSubTaskIndex];
    if (!activeTask) return null;
    const guidance = activeTask.guidanceSteps[state.currentGuidanceStepIndex];
    if (!guidance || !guidance.arrowTarget) return null;
    return {
      targetSelector: guidance.arrowTarget,
      text: guidance.text,
      direction: guidance.direction,
      offset: guidance.arrowOffset,
    };
  };

  const guidanceArrow = getGuidanceArrow();

  // ════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════

  // --- 引导层（高斯模糊遮罩 + 高亮 + 标注） ---
  const renderGuideLayer = () => {
    if (!state.currentGuideLayer) return null;
    return (
      <GuideLayer
        step={state.currentGuideLayer}
        onDismiss={() => {
          eventBus.emit(GameEvents.TUTORIAL_CLEAR_CARD_PREVIEW);
          actions.advanceStep();
        }}
      />
    );
  };

  // --- 对话气泡 ---
  const renderDialogueBox = () => {
    if (!state.currentDialogue) return null;
    return (
      <DialogueBox
        step={state.currentDialogue}
        onComplete={handleDialogueComplete}
      />
    );
  };

  // --- 微任务面板 ---
  const renderTaskPanel = () => {
    if (!state.currentTaskGroup) return null;
    return (
      <TaskPanel
        taskGroup={state.currentTaskGroup}
        subTaskStates={state.subTaskStates}
        activeSubTaskIndex={state.activeSubTaskIndex}
        currentGuidanceStepIndex={state.currentGuidanceStepIndex}
      />
    );
  };

  // --- 箭头指引 ---
  const renderArrowIndicator = () => {
    if (!guidanceArrow) return null;
    return (
      <ArrowIndicator
        targetSelector={guidanceArrow.targetSelector}
        text={guidanceArrow.text}
        direction={guidanceArrow.direction}
        offset={guidanceArrow.offset}
      />
    );
  };

  // 剧本未开始或已结束 → 不渲染任何覆盖层
  if (!script.steps.length || state.isComplete) return null;

  // 使用 Portal 渲染到 body，确保覆盖层浮在最上层
  return createPortal(
    <>
      {/* 各覆盖层组件 — 仅当当前步骤类型匹配时渲染 */}
      {renderGuideLayer()}
      {renderDialogueBox()}
      {renderTaskPanel()}
      {renderArrowIndicator()}
    </>,
    document.body
  );
};
