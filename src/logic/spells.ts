import type { CardData, GameState } from '../types';
import { CARD_DB } from '../data/cards';
import { processEffect } from './effectProcessor';
import type { EffectContext } from './effectProcessor';
import { eventBus, GameEvents } from '../utils/eventBus';
import { accumulateMauxirDamage } from '../utils/gameRules'; // [2026-06-27] 引入猫汐尔经验收集器

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
  playerDeck?: CardData[]; // [新增] 为牌库接通底层管道
  setPlayerDeck?: React.Dispatch<React.SetStateAction<CardData[]>>;
  enemyDeck?: CardData[];  // [新增]
  setEnemyDeck?: React.Dispatch<React.SetStateAction<CardData[]>>;
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

  // 2. 构建初始上下文与状态累加器 (Context & Accumulator)
  // [核心重构] 彻底告别陈旧快照！引入累加器实现多效果链的状态流转
  let acc = {
      game: { ...game },
      playerBench: [...playerBench],
      enemyBench: [...enemyBench],
      combatField: combatField ? [...combatField] : undefined,
      playerHand: ctx.playerHand ? [...ctx.playerHand] : [],
      enemyHand: ctx.enemyHand ? [...ctx.enemyHand] : [],
      playerDeck: ctx.playerDeck ? [...ctx.playerDeck] : [], // [核心修补] 将牌库吸入累加器
      enemyDeck: ctx.enemyDeck ? [...ctx.enemyDeck] : []     // [核心修补]
  };

  // 3. 遍历并执行所有效果 (管道式处理)
  cardDef.effects.forEach(effectId => {
      // 每执行一个效果，都把当前累加器中最新鲜的数据组装成上下文
      const currentContext: EffectContext = {
          game: acc.game,
          playerBench: acc.playerBench,
          enemyBench: acc.enemyBench,
          combatField: acc.combatField,
          playerHand: acc.playerHand,
          enemyHand: acc.enemyHand,
          playerDeck: acc.playerDeck, // [核心流转] 每执行一次效果，都传递最新牌库快照
          enemyDeck: acc.enemyDeck,
          owner
      };

      // 调用核心处理器
      const result = processEffect(effectId, targets, currentContext);

      // [状态累加] 将输出作为下一步的输入
      if (result.game) acc.game = result.game;
      if (result.playerBench) acc.playerBench = result.playerBench;
      if (result.enemyBench) acc.enemyBench = result.enemyBench;
      if (result.combatField) acc.combatField = result.combatField;
      if (result.playerHand) acc.playerHand = result.playerHand;
      if (result.enemyHand) acc.enemyHand = result.enemyHand;
      if (result.playerDeck) acc.playerDeck = result.playerDeck; // [接收回传] 承接处理器修改过的牌库
      if (result.enemyDeck) acc.enemyDeck = result.enemyDeck;

      // 立即处理副作用事件 (如飘字、音效等不涉及 React 状态的指令)
      result.events.forEach(event => {
          if (event.type === 'nexus_damage') {
              triggerShake();
              eventBus.emit(GameEvents.NEXUS_STRIKED, event.payload);
          }
          if (event.type === 'unit_damage') {
            eventBus.emit('unit_damage', event.payload);
          }
          if (setMessage && event.type === 'nexus_damage') {
              const targetName = event.payload.target === 'enemy' ? '敌方' : '我方';
              setMessage(`法术生效！对${targetName}水晶造成 ${event.payload.amount} 点伤害`);
          }
          if (event.type === 'sfx_strike'){}
	          // [2026-06-27 巴德尔试剂] 水晶回血飘字
	          if (event.type === 'nexus_heal') {
	            eventBus.emit(GameEvents.NEXUS_HEALED, event.payload);
	          }
      });
  });

  // ==========================================
  // [2026-06-27 斯瓦莉光环] 目睹法术打出 → 触发光环效果
  // ==========================================
  if (owner === 'player' && cardKey === 'dream_lotus_drone') {
    const swaliOnField = (() => {
      if (acc.playerBench.some(c => c.key === 'Illustration_Squad_Swali')) return true;
      if (acc.combatField) {
        return acc.combatField.some(f =>
          (f.attacker && f.owner === 'player' && f.attacker.key === 'Illustration_Squad_Swali') ||
          (f.blocker && f.owner !== 'player' && f.blocker.key === 'Illustration_Squad_Swali')
        );
      }
      return false;
    })();

    if (swaliOnField) {
      accumulateMauxirDamage(
        acc.playerBench, acc.combatField || [], 3,
        (newBench) => { acc.playerBench = newBench; },
        acc.playerHand, (newHand) => { acc.playerHand = newHand; },
        acc.playerDeck, (newDeck) => { acc.playerDeck = newDeck; }
      );
      console.log('[Swali Aura] 目睹梦莲无人机使用，猫汐尔升级进度 +3！');
    }
  }

  // 4. 终极一阳指 (Apply Final Result)
  // 当所有效果链执行完毕后，一次性把最终累加的结果推给 React！
  setGame(acc.game);
  setPlayerBench(acc.playerBench);
  setEnemyBench(acc.enemyBench);
  if (acc.combatField) setCombatField(acc.combatField);
  if (ctx.setPlayerHand) ctx.setPlayerHand(acc.playerHand);
  if (ctx.setEnemyHand) ctx.setEnemyHand(acc.enemyHand);
  if (ctx.setPlayerDeck) ctx.setPlayerDeck(acc.playerDeck); // [核心收网] 最终确认牌库的物理变动！
  if (ctx.setEnemyDeck) ctx.setEnemyDeck(acc.enemyDeck);
};