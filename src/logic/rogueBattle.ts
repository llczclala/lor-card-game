// ==========================================
// 悖论迷宫 · 战斗内强化分发（共享查询 + 特效触发）
// [2026-08-11 莉莉子] 迷宫强化战斗内生效的核心支撑：
//   逻辑层（useGameState / useRoundLifecycle）按 trigger 查询玩家已拥有的战斗型强化，
//   再按 battleEffect.effectClass 执行（复用 createCard / RALLY 等现有机制）。
// ==========================================
import { MAZE_BUFFS, type MazeBuff, type BattleTrigger } from '../data/roguelike/buffs';
import { eventBus, GameEvents } from '../utils/eventBus';

/** 按触发时机筛选玩家已拥有的战斗型迷宫强化（无则返回空数组） */
export const getRogueDefs = (ids: string[] | undefined, trigger: BattleTrigger): MazeBuff[] =>
    (ids ?? [])
        .map(id => MAZE_BUFFS.find(b => b.id === id))
        .filter((b): b is MazeBuff => !!b && !!b.battleEffect && b.battleEffect.trigger === trigger);

/** 触发强化特效：我方水晶处卡面淡入淡出闪烁（复用，各处统一 emit） */
export const flashRogueBuff = (def: MazeBuff) => {
    eventBus.emit(GameEvents.ROGUE_BUFF_FLASH, { icon: def.icon, name: def.name });
};
