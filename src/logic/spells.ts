import type { CardData, GameState } from '../types';
import { CARD_DB } from '../data/cards';
import { processEffect } from './effectProcessor';
import type { EffectContext } from './effectProcessor';

export interface SpellContext {
  game: GameState;
  setGame: React.Dispatch<React.SetStateAction<GameState>>;
  playerBench: CardData[];
  setPlayerBench: React.Dispatch<React.SetStateAction<CardData[]>>;
  enemyBench: CardData[];
  setEnemyBench: React.Dispatch<React.SetStateAction<CardData[]>>;
  combatField: any[]; // [新增] 交战区数据
  setCombatField: React.Dispatch<React.SetStateAction<any[]>>; // [新增] 交战区更新器
  triggerShake: () => void;
  playerHand?: CardData[]; // 可选属性（避免修改所有传参）
  setPlayerHand?: React.Dispatch<React.SetStateAction<CardData[]>>;
  enemyHand?: CardData[];
  setEnemyHand?: React.Dispatch<React.SetStateAction<CardData[]>>;
  setMessage?: React.Dispatch<React.SetStateAction<string>>;
}

// [重构] 通用法术执行器
export const executeSpellEffect = (cardKey: string, owner: 'player' | 'enemy', targets: any[], ctx: SpellContext) => {
  // [修改] 解构新增的 combatField 和 setCombatField
  const { game, playerBench, enemyBench, combatField, setGame, setPlayerBench, setEnemyBench, setCombatField, triggerShake, setMessage} = ctx;

  // 1. 获取卡牌定义 (包含 effects 列表)
  const cardDef = CARD_DB[cardKey];
  if (!cardDef || !cardDef.effects || cardDef.effects.length === 0) {
      console.warn(`No effects configured for card: ${cardKey}`);
      if (setMessage) setMessage(`法术 ${cardKey} 无生效效果！`);
      return;
  }

  // 2. 构建上下文 (Context)
  // 注意：这里需要传入当前时刻的快照。由于 React 的 setXxx 是异步的，
  // 我们这里传入的是 ctx.game 等当前值。
  // 在连续执行多个效果时，可能需要在一个临时变量上累加状态，这里简化为单次执行。
  const context: EffectContext = {
      game,
      playerBench,
      enemyBench,
      combatField, // [新增] 将交战区传入底层 effectProcessor
      playerHand: [],
      enemyHand: [],
      owner
  };

  // 3. 遍历并执行所有效果
  cardDef.effects.forEach(effectId => {
      // 调用核心处理器
      const result = processEffect(effectId, targets, context);

      // 4. 应用结果 (Apply Result)
      // 将纯数据转换回 React 的状态更新
      setGame(result.game);
      setPlayerBench(result.playerBench);
      setEnemyBench(result.enemyBench);
      if (result.combatField) setCombatField(result.combatField); // [新增] 更新交战区状态 (加个防呆判断)

      // 处理副作用事件 (Events)
      result.events.forEach(event => {
          if (event.type === 'nexus_damage') triggerShake();
          if (setMessage && event.type === 'nexus_damage') {
              setMessage(`法术生效！对敌方水晶造成 ${event.payload.amount} 点伤害`);
          }
          if (event.type === 'sfx_strike'){}
      });
  });
};
