import { useMemo } from 'react';
import { GameEvents, eventBus } from '../utils/eventBus';

// 定义按钮配置的返回类型
export interface ButtonConfig {
    text: string;
    style: string;
    action?: () => void;
    showFlow?: boolean; // 是否显示流光特效 (用于"进攻")
    disabled?: boolean;
}

// 定义 Hook 需要的输入参数
interface UseGameButtonProps {
    phase: string;
    turnOwner: string;
    isAutoAdvancing?: boolean; // [新增] 接收底层引擎的自动推进托管状态

    // 换牌阶段相关参数
    isMulliganPhase: boolean;
    mulliganState?: {
        selectedCount: number;
        isConfirmed: boolean;
    };

    // 战斗/法术相关参数
    combatState?: {
        hasAttackers: boolean;
        spellStackLength: number;
        canInitiateAttack: boolean;
    };

    // [新增] 施法与预提交状态
    spellState?: {
        isCasting: boolean;
        hasPendingSpell: boolean;
    };

    // 动作回调集合
    actions: {
        onPass: () => void;
        onAttack: () => void;
        onBlock: () => void;
        onResolveStack: () => void;
        onCancelAttack: () => void; // 撤回进攻
        onMulliganReplace?: () => void;
        onMulliganConfirm?: () => void;
        onConfirmPendingSpell?: () => void; // [新增] 确认预提交
    };
}

export const useGameButton = ({
    phase,
    turnOwner,
    isAutoAdvancing, // [新增] 从上层透传接收信号
    isMulliganPhase,
    mulliganState,
    combatState,
    spellState, // [新增]
    actions
}: UseGameButtonProps): ButtonConfig | null => {

    return useMemo(() => {
        const baseStyle = "w-36 h-36 rounded-full border-4 shadow-lg flex flex-col items-center justify-center transition-all active:scale-95 z-20 cursor-pointer relative";

        // --- 0. 自动推进托管状态 (Auto-Advancing) --- [最高优先级视觉拦截]
        if (isAutoAdvancing) {
            return {
                style: `${baseStyle} bg-slate-800/80 border-slate-600 text-slate-400 cursor-wait`,
                text: "自动推进...",
                disabled: true
            };
        }

        // --- 1. 换牌阶段 (Mulligan Phase) ---
        if (isMulliganPhase && mulliganState) {
            if (mulliganState.isConfirmed) {
                return { style: `${baseStyle} bg-gray-700 border-gray-600 cursor-not-allowed`, text: "..." };
            }

            if (mulliganState.selectedCount > 0) {
                return {
                    style: `${baseStyle} bg-red-600 hover:bg-red-500 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.5)]`,
                    text: "更换",
                    action: actions.onMulliganReplace
                };
            } else {
                return {
                    style: `${baseStyle} bg-blue-600 hover:bg-blue-500 border-blue-400`,
                    text: "确定",
                    action: actions.onMulliganConfirm
                };
            }
        }

        // --- 1.5 施法与预提交阶段 (Casting & Pending) --- [新增最高优先级]
        if (spellState?.isCasting) {
            return { style: `${baseStyle} bg-gray-700 border-gray-600 cursor-not-allowed`, text: "等待", disabled: true };
        }
        if (spellState?.hasPendingSpell) {
            return {
                style: `${baseStyle} bg-blue-600 hover:bg-blue-500 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.6)]`,
                text: "确定",
                action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onConfirmPendingSpell?.(); }
            };
        }

        // --- 2. 对手回合 (Waiting) ---
        if (turnOwner !== 'player') {
            return { style: `${baseStyle} bg-gray-700 border-gray-600 cursor-not-allowed`, text: "等待", disabled: true };
        }

        // --- 3. 主阶段 (Main Phase) ---
        if (phase === 'main') {
            // A. 法术结算
            if (combatState && combatState.spellStackLength > 0) {
                return {
                    style: `${baseStyle} bg-blue-600 border-blue-400`,
                    text: "确定",
                    action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onResolveStack(); }
                };
            }

            // B. 发起进攻 (Split Button)
            // 返回 null 是为了告诉 UI 层渲染那个特殊的"分裂按钮"
            if (combatState && combatState.canInitiateAttack) {
                return null;
            }

            // C. 结束回合/过
            return {
                style: `${baseStyle} bg-blue-600 border-blue-400`,
                text: "结束回合",
                action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onPass(); }
            };
        }

        // --- 4. 进攻宣言阶段 (Attack Declare) ---
        if (phase === 'attack_declare') {
            if (combatState && combatState.hasAttackers) {
                return {
                    style: `${baseStyle} bg-gradient-to-b from-orange-500 to-red-600 border-orange-300 shadow-[0_0_30px_rgba(234,88,12,0.6)]`,
                    text: "进攻",
                    showFlow: true,
                    action: () => { eventBus.emit(GameEvents.ATTACK_DECLARE); actions.onAttack(); }
                };
            } else {
                return {
                    style: `${baseStyle} bg-blue-600 border-blue-400`,
                    text: "撤回",
                    action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onCancelAttack(); }
                };
            }
        }

        // --- 5. 格挡阶段 (Block Declare) ---
        if (phase === 'block_declare') {
            return {
                style: `${baseStyle} bg-blue-500 border-blue-300`,
                text: "格挡",
                action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onBlock(); }
            };
        }

        // [核心修复] --- 5.5. 格挡后响应阶段 (React to Block) ---
        if (phase === 'react_to_block') {
            // 如果优先权在敌方，按钮置灰等待
            if (turnOwner === 'enemy') {
                return {
                    style: `${baseStyle} bg-slate-800/80 border-slate-600 text-slate-400 cursor-not-allowed`,
                    text: "等待敌方...",
                    disabled: true
                };
            }

            // 如果玩家当前正在把一张法术牌拖拽悬停在目标上（预提交状态）
            if (spellState?.hasPendingSpell) {
                return {
                    style: `${baseStyle} bg-purple-600 border-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.6)]`,
                    text: "施放",
                    action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onPass(); }
                };
            }

            // 智能侦测：如果堆叠区有法术，按钮显示“应对/结算”；如果是空堆叠，显示“确认打击”
            const hasSpellsOnStack = combatState && combatState.spellStackLength > 0;
            return {
                style: `${baseStyle} ${
                    hasSpellsOnStack
                    ? 'bg-purple-600 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                    : 'bg-red-600 border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                }`,
                text: hasSpellsOnStack ? "结算" : "确认决战",
                // 统一调用改造后的 passTurn，由引擎去判断是结算堆叠、踢回优先权，还是直接发动物理碰撞
                action: () => { eventBus.emit(GameEvents.UI_CLICK); actions.onPass(); }
            };
        }

        // Default
        return { style: `${baseStyle} bg-gray-800 border-gray-600 text-gray-400`, text: "...", disabled: true };

    // [新增] 必须将 isAutoAdvancing 加入依赖数组，否则按钮不会随信号重绘
    }, [phase, turnOwner, isAutoAdvancing, isMulliganPhase, mulliganState, combatState, actions]);
};