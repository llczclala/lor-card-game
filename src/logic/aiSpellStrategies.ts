/**
 * AI 法术策略引擎
 *
 * 将法术按「决策模式(Pattern)」分类，每个模式一个 Handler，
 * 避免在主循环中为每张法术单独硬编码。
 *
 * 架构：
 *   evaluate(spell, state, ...) → 按 spell.ai.pattern 路由到对应 Handler
 *   → 每个 Handler 返回 { shouldPlay, targets, score }
 *
 * 新增法术时只需在 cards.ts 中配置 ai: { pattern, priority, config }，
 * 无需改动此文件（除非需要新模式）。
 */
import type { CardData, GameState, AIConfig } from '../types';
import { CARD_DB } from '../data/cards';
import { evaluateChoiceCondition } from '../utils/gameRules';

// ==========================================
// 工具函数
// ==========================================

/** 计算单位的有效生命值 */
function getHp(unit: CardData): number {
  return unit.health + (unit.buffs?.health || 0) - (unit.damageTaken || 0);
}

/** 计算单位的有效攻击力 */
function getPow(unit: CardData): number {
  return unit.power + (unit.buffs?.power || 0);
}

/** 筛选可用的单位（未死亡、非动画中） */
function filterAlive(units: CardData[]): CardData[] {
  return units.filter(u => !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying');
}

// ==========================================
// 返回类型
// ==========================================

export interface AIEvaluation {
  shouldPlay: boolean;
  targets?: { type: string; id?: string }[];
  score: number;       // 价值评分，用于多张法术竞争时择优
  debug?: string;      // 日志用：说明为什么打出/不打出
}

// ==========================================
// Pattern: DAMAGE — 伤害/解场
// ==========================================
// 配置参数:
//   targetType: 'nexus' | 'unit' | 'any'
//   canTargetSelf?: boolean   — 是否可打己方单位（触发类效果）
//   lethalPriority?: boolean  — 优先找可斩杀目标
//   targetCount?: number      — 多目标时可选几个（默认 1）
// ==========================================

function evaluateDAMAGE(
  spell: CardData,
  state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const canTargetNexus = config.targetType === 'nexus' || config.targetType === 'any';
  const canTargetUnit = config.targetType === 'unit' || config.targetType === 'any';
  const canTargetSelf = config.canTargetSelf === true;
  const lethalPriority = config.lethalPriority ?? false;
  const targetCount = config.targetCount ?? 1; // [2026-07-08 新增] 多目标支持

  // ——— 优先级 0：斩杀 (lethal) ———
  // 无论场上有什么，只要能斩杀水晶就出手
  if (canTargetNexus && lethalPriority) {
    const lethalAt = spell.power || 3; // 法术本身没 power 时按 3 算
    if (state.playerNexus <= lethalAt) {
      return {
        shouldPlay: true,
        targets: [{ type: 'player_nexus', id: 'player_nexus' }],
        score: 30,
        debug: `斩杀线，敌方水晶仅 ${state.playerNexus} 血`,
      };
    }
  }

  // ——— 优先级 1：可击杀单位 (优先于无脑打水晶) ———
  if (canTargetUnit) {
    const aliveEnemies = filterAlive(enemyBench);
    const damageValue = config.damageValue ?? spell.power ?? 1;

    // 找可击杀的单位
    const killable = aliveEnemies
      .filter(u => getHp(u) <= damageValue)
      .sort((a, b) => {
        const aScore = (a.isChampion ? 10 : 0) + getPow(a) + a.cost;
        const bScore = (b.isChampion ? 10 : 0) + getPow(b) + b.cost;
        return bScore - aScore;
      });

    if (killable.length > 0) {
      // [2026-07-08 新增] 多目标：取前 targetCount 个
      const selected = killable.slice(0, targetCount);
      const totalScore = 20 + selected.reduce((sum, u) => sum + u.cost, 0);
      const names = selected.map(u => u.name).join(', ');
      return {
        shouldPlay: true,
        targets: selected.map(u => ({ type: 'enemy', id: u.id })),
        score: totalScore,
        debug: `可击杀 ${selected.length} 个目标: ${names}`,
      };
    }


    // 补刀：找已受伤的单位
    const wounded = aliveEnemies
      .filter(u => u.damageTaken && u.damageTaken > 0 && getHp(u) <= damageValue)
      .sort((a, b) => (b.damageTaken || 0) - (a.damageTaken || 0));

    if (wounded.length > 0) {
      return {
        shouldPlay: true,
        targets: [{ type: 'enemy', id: wounded[0].id }],
        score: 16,
        debug: `补刀受伤单位 ${wounded[0].name}`,
      };
    }
  }

  // ——— 优先级 2：打水晶（低于击杀/补刀，高于无作为） ———
  if (canTargetNexus) {
    // [2026-07-08 修复] 移除 holdThreshold 限制，多余法力值就可打水晶
    // 但分数压低（最高14分），始终低于击杀单位(20+)和补刀(16)
    const dmgValue = config.damageValue ?? spell.power ?? 1;
    const nexusScore = Math.min(10 + dmgValue, 14);
    return {
      shouldPlay: true,
      targets: [{ type: 'player_nexus', id: 'player_nexus' }],
      score: nexusScore,
      debug: `打水晶 ${dmgValue} 伤害，评分 ${nexusScore}`,
    };
  }

  // ——— 优先级 3：己方单位（自伤触发遗言等） ———
  if (canTargetSelf) {
    const aliveAllies = filterAlive(playerBench);
    if (aliveAllies.length > 0) {
      const triggerTarget = aliveAllies.find(u =>
        u.keywords.includes('Last Breath') || getHp(u) <= (spell.power || 1) + 1,
      );
      if (triggerTarget) {
        return {
          shouldPlay: true,
          targets: [{ type: 'ally', id: triggerTarget.id }],
          score: 10,
          debug: `触发己方 ${triggerTarget.name} 的遗言效果`,
        };
      }
    }
  }

  // ——— 没有好目标 ———
  return { shouldPlay: false, score: 0, debug: '无合适目标' };
}

// ==========================================
// Pattern: BUFF — 增益
// ==========================================
// 配置参数:
//   targetType: 'ALL_ALLIES' | 'ALLY_UNIT'
//   minAllies?: number       — 至少需要多少友方单位才打
//   onlyWhenAttacking?: boolean — 仅当准备进攻时打
// ==========================================

function evaluateBUFF(
  _spell: CardData,
  state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const targetType = config.targetType ?? 'ALL_ALLIES';
  const minAllies = config.minAllies ?? 1;
  const onlyWhenAttacking = config.onlyWhenAttacking ?? false;

  const aliveAllies = filterAlive(playerBench);

  // ===== 单目标 Buff (ALLY_UNIT) =====
  if (targetType === 'ALLY_UNIT') {
    if (aliveAllies.length === 0) {
      return { shouldPlay: false, score: 0, debug: '无可 Buff 的友方单位' };
    }

    const boostPower = config.power ?? 0;
    const boostHealth = config.health ?? 0;
    const statValue = boostPower + boostHealth;

    // ——— 特化：指定目标（如 无尽霜刃 → 里芙） ———
    const specificKey = config.specificTargetKey;
    if (specificKey) {
      const target = aliveAllies.find(u => u.key === specificKey);
      if (!target) {
        return { shouldPlay: false, score: 0, debug: `未找到指定目标 ${specificKey}` };
      }
      // 0 费法术，有目标就无脑打
      return {
        shouldPlay: true,
        targets: [{ type: 'ally', id: target.id }],
        score: 15,
        debug: `指定目标 ${target.name} +${boostPower}/+${boostHealth}`,
      };
    }

    // ——— 按种族过滤（如 梦莲无人机 → 仅 summon） ———
    const raceFilter: string[] | undefined = config.raceFilter;
    const filteredAllies = raceFilter?.length
      ? aliveAllies.filter(u => u.race?.some(r => raceFilter.includes(r)))
      : aliveAllies;

    if (filteredAllies.length === 0) {
      const raceNote = raceFilter?.length ? `(需种族:${raceFilter.join(',')})` : '';
      return { shouldPlay: false, score: 0, debug: `无可 Buff 的目标 ${raceNote}` };
    }

    // ——— 通用：找最优目标 ———
    const sorted = [...filteredAllies].sort((a, b) => {
      const aScore = (a.isChampion ? 10 : 0) + getPow(a) + getHp(a);
      const bScore = (b.isChampion ? 10 : 0) + getPow(b) + getHp(b);
      return bScore - aScore;
    });

    const best = sorted[0];
    const bestRace = best.race?.join('/') ?? '';
    const score = 10 + statValue * 3 + (best.isChampion ? 5 : 0) + (raceFilter ? 3 : 0);

    return {
      shouldPlay: true,
      targets: [{ type: 'ally', id: best.id }],
      score,
      debug: `单目标 Buff ${best.name}(种族:${bestRace}) (+${boostPower}/+${boostHealth}), 评分 ${score}`,
    };
  }

  // ===== 群体 Buff (ALL_ALLIES) =====
  // [2026-07-08 新增] targetKeyFilter 限制只统计特定单位（如全力净化→无人机）
  const targetKeyFilter: string[] | undefined = config.targetKeyFilter;
  const relevantAllies = targetKeyFilter?.length
    ? aliveAllies.filter(u => targetKeyFilter.includes(u.key))
    : aliveAllies;

  // 条件检查：相关友方单位数
  if (relevantAllies.length < minAllies) {
    const filteredNote = targetKeyFilter?.length ? `(过滤器:${targetKeyFilter.join(',')})` : '';
    return { shouldPlay: false, score: 0, debug: `相关友方单位 ${relevantAllies.length} < ${minAllies} ${filteredNote}` };
  }

  // 条件检查：是否要求准备进攻
  if (onlyWhenAttacking && state.attackToken.enemy !== 'normal' && state.attackToken.enemy !== 'rally') {
    return { shouldPlay: false, score: 0, debug: '未持有进攻权，不打出进攻型 Buff' };
  }

  // 评分：覆盖单位数 × 每个单位的增益价值
  const boostPower = config.power ?? 0;
  const boostHealth = config.health ?? 0;
  const statValue = boostPower + boostHealth;
  const score = relevantAllies.length * statValue * 2;

  return {
    shouldPlay: true,
    targets: [],
    score,
    debug: `群体 Buff 覆盖 ${aliveAllies.length} 个友方单位`,
  };
}

// ==========================================
// Pattern: RALLY — 获得进攻权
// ==========================================
// 配置参数:
//   denyIfHasToken?: boolean   — 已有进攻权时不打
//   minAttackers?: number      — 场上至少有多少可进攻单位才打
// ==========================================

function evaluateRALLY(
  _spell: CardData,
  state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const denyIfHasToken = config.denyIfHasToken ?? true;
  const minAttackers = config.minAttackers ?? 1;

  // 已有进攻权时是否拒绝
  const hasToken = state.attackToken.enemy === 'normal' || state.attackToken.enemy === 'rally';
  if (hasToken && denyIfHasToken) {
    return { shouldPlay: false, score: 0, debug: '已持有进攻权，不打' };
  }

  // 检查可进攻的单位数
  const canAttack = filterAlive(playerBench).filter(u =>
    !u.isDead && u.power > 0 && !u.keywords.includes('CantAttack'),
  );

  if (canAttack.length < minAttackers) {
    return { shouldPlay: false, score: 0, debug: `可进攻单位 ${canAttack.length} < ${minAttackers}` };
  }

  return {
    shouldPlay: true,
    targets: [],
    score: canAttack.length * 5,
    debug: `获得进攻权，${canAttack.length} 个单位可进攻`,
  };
}

// ==========================================
// Pattern: DUEL — 单挑（双方互打）
// ==========================================
// 配置参数:
//   policies: ('favorable' | 'sacrifice' | 'clear_path')[]
//
//   favorable   → 我存活，敌死亡（白吃）
//   sacrifice   → 我死亡，但换掉高威胁目标
//   clear_path  → 清除阻挡者，为进攻开路
// ==========================================

function evaluateDUEL(
  _spell: CardData,
  state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const policies: string[] = config.policies ?? ['favorable'];
  const aliveAllies = filterAlive(playerBench);
  const aliveEnemies = filterAlive(enemyBench);

  if (aliveAllies.length === 0 || aliveEnemies.length === 0) {
    return { shouldPlay: false, score: 0, debug: '一方无单位，无法单挑' };
  }

  let bestScore = 0;
  let bestTargets: { type: string; id: string }[] | undefined;

  for (const myUnit of aliveAllies) {
    const myHp = getHp(myUnit);
    const myAtk = getPow(myUnit);
    if (myHp <= 0 || myAtk <= 0) continue;

    for (const enemyUnit of aliveEnemies) {
      const enHp = getHp(enemyUnit);
      const enAtk = getPow(enemyUnit);
      if (enHp <= 0 || enAtk <= 0) continue;

      const iSurvive = myHp > enAtk;
      const enemyDies = myAtk >= enHp;
      const iDie = myHp <= enAtk;
      const iTrade = enemyDies && iDie; // 互换

      // —— favorable: 我存活，敌死亡 ——
      if (policies.includes('favorable') && iSurvive && enemyDies) {
        const score = enemyUnit.cost * 3 - myUnit.cost * 2 + (enemyUnit.isChampion ? 15 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestTargets = [
            { type: 'ally', id: myUnit.id },
            { type: 'enemy', id: enemyUnit.id },
          ];
        }
      }

      // —— sacrifice: 互换或牺牲 ——
      if (policies.includes('sacrifice') && iTrade) {
        const score = enemyUnit.cost * 2 + (enemyUnit.isChampion ? 20 : 0) - myUnit.cost;
        if (score > bestScore) {
          bestScore = score;
          bestTargets = [
            { type: 'ally', id: myUnit.id },
            { type: 'enemy', id: enemyUnit.id },
          ];
        }
      }

      // —— clear_path: 清除阻挡者 ——
      if (policies.includes('clear_path') && enemyDies) {
        // 如果该敌方单位正在阻挡某个友方单位
        const isBlocking = state.attackToken.enemy && enemyUnit.id; // 简化判断
        const score = (isBlocking ? 10 : 0) + enemyUnit.cost + (enemyUnit.isChampion ? 10 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestTargets = [
            { type: 'ally', id: myUnit.id },
            { type: 'enemy', id: enemyUnit.id },
          ];
        }
      }
    }
  }

  if (bestTargets && bestScore > 0) {
    return {
      shouldPlay: true,
      targets: bestTargets,
      score: bestScore,
      debug: `单挑得分 ${bestScore}`,
    };
  }

  return { shouldPlay: false, score: 0, debug: '未找到有价值的单挑组合' };
}

// ==========================================
// Pattern: HEAL — 治疗
// ==========================================
// 配置参数:
//   targetType: 'unit' | 'nexus' | 'any'
//     — unit: 只奶受伤友方单位
//     — nexus: 只奶水晶
//     — any: 都可
//   healValue?: number     — 治疗量（默认 spell.power || 2）
//   onlyWounded?: boolean  — 是否只治疗受伤目标（默认 true）
//   nexusPriority?: number — 水晶低至多少血优先奶（默认 10）
// ==========================================

function evaluateHEAL(
  spell: CardData,
  state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const targetType = config.targetType ?? 'unit';
  const healValue = config.healValue ?? spell.power ?? 2;
  const onlyWounded = config.onlyWounded ?? true;

  // ——— 优先级 1：奶受伤的友方单位 ———
  if (targetType === 'unit' || targetType === 'any') {
    const aliveAllies = filterAlive(playerBench);
    if (aliveAllies.length > 0) {
      // 筛选受伤的单位（damageTaken > 0 且血量不满）
      const wounded = aliveAllies
        .filter(u => (u.damageTaken ?? 0) > 0 && getHp(u) < u.maxHealth + (u.buffs?.health || 0))
        .sort((a, b) => {
          const aMissing = Math.min(healValue, (a.maxHealth + (a.buffs?.health || 0)) - getHp(a));
          const bMissing = Math.min(healValue, (b.maxHealth + (b.buffs?.health || 0)) - getHp(b));
          // 优先 champion，其次受益量更大的
          return (bMissing + (b.isChampion ? 8 : 0)) - (aMissing + (a.isChampion ? 8 : 0));
        });

      if (wounded.length > 0) {
        const target = wounded[0];
        const missingHp = (target.maxHealth + (target.buffs?.health || 0)) - getHp(target);
        const effectiveHeal = Math.min(healValue, Math.max(missingHp, 0));
        const score = 8 + effectiveHeal * 3 + (target.isChampion ? 8 : 0);
        return {
          shouldPlay: true,
          targets: [{ type: 'ally', id: target.id }],
          score,
          debug: `治疗 ${target.name} ${effectiveHeal} 点 (缺 ${missingHp}), 评分 ${score}`,
        };
      }

      // 如果找不到受伤单位，但允许奶满血（onlyWounded=false）
      if (!onlyWounded) {
        const target = [...aliveAllies].sort((a, b) =>
          (b.isChampion ? 1 : 0) - (a.isChampion ? 1 : 0),
        )[0];
        return {
          shouldPlay: true,
          targets: [{ type: 'ally', id: target.id }],
          score: 5,
          debug: `预防性治疗 ${target.name} (+${healValue})`,
        };
      }
    }
  }

  // ——— 优先级 2：奶水晶 ———
  if (targetType === 'nexus' || targetType === 'any') {
    // [2026-07-08 修复] state.enemyNexus = AI 方水晶，不是 playerNexus！
    const nexusHp = state.enemyNexus;
    const nexusMissing = 20 - nexusHp;

    if (nexusMissing > 0) {
      const effectiveHeal = Math.min(healValue, nexusMissing);
      const score = Math.min(effectiveHeal * 2, 12);
      return {
        shouldPlay: true,
        targets: [{ type: 'enemy_nexus', id: 'enemy_nexus' }],
        score,
        debug: `奶己方水晶 ${effectiveHeal} 点 (缺 ${nexusMissing}), 评分 ${score}`,
      };
    }
  }

  return { shouldPlay: false, score: 0, debug: '无需要治疗的目标' };
}

// ==========================================
// Pattern: DRAW — 抽牌/检索
// ==========================================
// 配置参数:
//   drawCount?: number       — 抽牌数量（默认 1）
//   discardCount?: number    — 弃牌数量（默认 0）
//   tutorChampion?: boolean  — 是否检索天启者法术（能量补充）
//   handFullThreshold?: number — 手牌上限（默认 10）
// ==========================================

function evaluateDRAW(
  spell: CardData,
  _state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
  enemyHand?: CardData[],
): AIEvaluation {
  const drawCount = config.drawCount ?? 1;
  const discardCount = config.discardCount ?? 0;
  const tutorChampion = config.tutorChampion ?? false;

  // ——— 弃牌抽牌型（暗箱操作：弃1抽2） ———
  if (discardCount > 0 && drawCount > 0) {
    // 手牌不足？无法弃牌
    if (!enemyHand || enemyHand.length <= discardCount) {
      return { shouldPlay: false, score: 0, debug: `手牌不足，需弃 ${discardCount} 张` };
    }

    // 找低价值卡来弃：找费用最低的普通卡（排除自己）
    const sortedByValue = [...enemyHand]
      .filter(c => c.id !== spell.id) // [2026-07-08 修复] 不弃自己
      .filter(c => !c.isChampion) // 不弃天启者
      .sort((a, b) => {
        // 评分越低越适合弃：费用低、非天启者
        const aVal = a.cost + (a.type?.includes('spell') ? 0 : 3);
        const bVal = b.cost + (b.type?.includes('spell') ? 0 : 3);
        return aVal - bVal;
      });

    if (sortedByValue.length < discardCount) {
      return { shouldPlay: false, score: 0, debug: '手牌天启者过多，无可弃的普通卡' };
    }

    const netCards = drawCount - discardCount; // 净增手牌
    const score = 8 + Math.max(netCards, 0) * 5;

    // 选最低价值的卡作为弃牌目标
    const discardTargets = sortedByValue.slice(0, discardCount);
    return {
      shouldPlay: true,
      targets: discardTargets.map(c => ({ type: 'ally', id: c.id })),
      score,
      debug: `弃 ${discardCount} 张换抽 ${drawCount}，净增 ${netCards}，评分 ${score}`,
    };
  }

  // ——— 检索天启者法术型（能量补充） ———
  if (tutorChampion) {
    const championsOnField = filterAlive(playerBench).filter(c => c.isChampion);
    if (championsOnField.length > 0) {
      return {
        shouldPlay: true,
        targets: [{ type: 'ally', id: championsOnField[0].id }],
        score: 8 + championsOnField[0].cost,
        debug: `检索 ${championsOnField[0].name} 的英雄法术，评分 ${8 + championsOnField[0].cost}`,
      };
    }
    // 无天启者在场则跳过（无法选取目标）
    return { shouldPlay: false, score: 0, debug: '无天启者在场，无法检索' };
  }

  // ——— 纯抽牌型（无弃牌） ———
  return {
    shouldPlay: true,
    score: 6 + drawCount * 3,
    debug: `纯抽 ${drawCount} 张，评分 ${6 + drawCount * 3}`,
  };
}

// ==========================================
// Pattern: KEYWORD_TRANSFER — 关键词转移
// ==========================================
// 配置参数:
//   keyword?: string      — 要转移的关键词（默认 'Ephemeral'）
// ==========================================

function evaluateKEYWORD_TRANSFER(
  _spell: CardData,
  _state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const keyword = config.keyword ?? 'Ephemeral';
  const aliveAllies = filterAlive(playerBench);
  const aliveEnemies = filterAlive(enemyBench);

  // 找拥有指定关键词的友方单位
  const sourceAlly = aliveAllies.find(u => u.keywords?.includes(keyword));
  if (!sourceAlly) {
    return { shouldPlay: false, score: 0, debug: `无友方单位拥有【${keyword}】` };
  }

  // 需要有敌方单位来转移
  if (aliveEnemies.length === 0) {
    return { shouldPlay: false, score: 0, debug: '无敌方单位可转移' };
  }

  // 选最有价值的敌方目标（高费、天启者优先）
  const sorted = [...aliveEnemies].sort((a, b) => {
    return (b.cost + (b.isChampion ? 15 : 0)) - (a.cost + (a.isChampion ? 15 : 0));
  });

  const bestTarget = sorted[0];
  const score = 8 + bestTarget.cost + (bestTarget.isChampion ? 15 : 0);

  return {
    shouldPlay: true,
    targets: [
      { type: 'ally', id: sourceAlly.id },
      { type: 'enemy', id: bestTarget.id },
    ],
    score,
    debug: `转移【${keyword}】${sourceAlly.name} → ${bestTarget.name}，评分 ${score}`,
  };
}

// ==========================================
// Pattern: SUMMON — 召唤单位到备战席
// ==========================================
// 配置参数:
//   minBoardSpace?: number    — 需要多少空位（默认 1）
//   summonCount?: number      — 召唤数量（默认 1）
//   requireChampionKey?: string — 需要特定天启者在场才打
// ==========================================

function evaluateSUMMON(
  _spell: CardData,
  _state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const minBoardSpace = config.minBoardSpace ?? 1;
  const summonCount = config.summonCount ?? 1;
  const requireChampionKey = config.requireChampionKey;
  const maxPerSide = 6;

  // 检查场上空位
  const aliveAllies = filterAlive(playerBench);
  const emptySlots = maxPerSide - aliveAllies.length;
  if (emptySlots < minBoardSpace) {
    return { shouldPlay: false, score: 0, debug: `空位不足，需 ${minBoardSpace}，仅 ${emptySlots}` };
  }

  // 需要指定天启者在场
  if (requireChampionKey) {
    const champ = aliveAllies.find(u => u.key === requireChampionKey);
    if (!champ) {
      return { shouldPlay: false, score: 0, debug: `需要 ${requireChampionKey} 在场` };
    }
  }

  // 评分：召唤越多越高，场上单位越少（铺场价值）越高
  const boardPresenceBoost = Math.max(0, 3 - aliveAllies.length) * 2;
  const score = 6 + summonCount * 4 + boardPresenceBoost;

  return {
    shouldPlay: true,
    targets: [],
    score,
    debug: `召唤 ${summonCount} 个单位，空位 ${emptySlots}，评分 ${score}`,
  };
}

// ==========================================
// Pattern: SACRIFICE — 牺牲友方造成伤害
// ==========================================
// 配置参数:
//   damageValue?: number       — 造成的伤害值（默认 3）
//   requireKeyword?: string    — 牺牲者需要有关键词（如 'Titan'）
//   sacrificeMaxCost?: number  — 牺牲者费用上限（默认 3，避免卖高费）
// ==========================================

function evaluateSACRIFICE(
  _spell: CardData,
  _state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const damageValue = config.damageValue ?? 3;
  const requireKeyword = config.requireKeyword;
  const sacrificeMaxCost = config.sacrificeMaxCost ?? 3;

  const aliveAllies = filterAlive(playerBench);
  const aliveEnemies = filterAlive(enemyBench);

  // 找可牺牲的友方（不牺牲天启者）
  const sacrificeTargets = aliveAllies.filter(u => {
    if (u.isChampion) return false;
    if (requireKeyword && !u.keywords.includes(requireKeyword)) return false;
    return (u.cost ?? 0) <= sacrificeMaxCost;
  });

  if (sacrificeTargets.length === 0) {
    const kwNote = requireKeyword ? `(需:${requireKeyword})` : '';
    return { shouldPlay: false, score: 0, debug: `无合适牺牲目标${kwNote}` };
  }

  if (aliveEnemies.length === 0) {
    return { shouldPlay: false, score: 0, debug: '无敌方目标' };
  }

  // 选最便宜的牺牲者
  const cheapest = sacrificeTargets.sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
  const sacrificeCost = cheapest.cost ?? 0;

  // 选最有价值的敌方目标
  const bestEnemy = [...aliveEnemies].sort((a, b) => {
    return (b.isChampion ? 15 : 0) + getPow(b) + b.cost
         - ((a.isChampion ? 15 : 0) + getPow(a) + a.cost);
  })[0];

  const enemyValue = (bestEnemy.isChampion ? 15 : 0) + bestEnemy.cost + getPow(bestEnemy);
  const effectiveDmg = Math.min(damageValue, getHp(bestEnemy));
  const score = effectiveDmg * 3 + enemyValue - sacrificeCost * 2;

  if (score <= 4) {
    return { shouldPlay: false, score: 0, debug: `牺牲${sacrificeCost}费换${damageValue}伤不值，评分${score}` };
  }

  return {
    shouldPlay: true,
    targets: [
      { type: 'ally', id: cheapest.id },
      { type: 'enemy', id: bestEnemy.id },
    ],
    score,
    debug: `牺牲${cheapest.name}(${sacrificeCost}费)→${bestEnemy.name} ${damageValue}伤，评分${score}`,
  };
}

// ==========================================
// Pattern: FROST — 冻结敌方低攻单位
// ==========================================
// 配置参数:
//   maxPower?: number   — 冻结攻击力 ≤ 此值的单位（默认 2）
// ==========================================

function evaluateFROST(
  _spell: CardData,
  _state: GameState,
  enemyBench: CardData[],
  _playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const maxPower = config.maxPower ?? 2;
  const aliveEnemies = filterAlive(enemyBench);

  const validTargets = aliveEnemies
    .filter(u => getPow(u) <= maxPower)
    .sort((a, b) => {
      const aScore = (a.isChampion ? 20 : 0) + getPow(a) + a.cost;
      const bScore = (b.isChampion ? 20 : 0) + getPow(b) + b.cost;
      return bScore - aScore;
    });

  if (validTargets.length === 0) {
    return { shouldPlay: false, score: 0, debug: `无攻击力 ≤ ${maxPower} 的敌方单位` };
  }

  const target = validTargets[0];
  const score = 8 + (target.isChampion ? 15 : 0) + getPow(target) * 2;

  return {
    shouldPlay: true,
    targets: [{ type: 'enemy', id: target.id }],
    score,
    debug: `冻结 ${target.name}(攻:${getPow(target)}), 评分${score}`,
  };
}

// ==========================================
// Pattern: STRIKE — 英雄单向打击
// ==========================================
// 配置参数:
//   strikerKey: string       — 执行打击的英雄 key（如 'fenny'）
//   requireOverwhelm?: boolean — 该打击是否附带碾压
// ==========================================

function evaluateSTRIKE(
  _spell: CardData,
  _state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
): AIEvaluation {
  const strikerKey = config.strikerKey;

  if (!strikerKey) {
    return { shouldPlay: false, score: 0, debug: '未配置打击者(strikerKey)' };
  }

  const aliveEnemies = filterAlive(enemyBench);
  if (aliveEnemies.length === 0) {
    return { shouldPlay: false, score: 0, debug: '无敌方目标可打击' };
  }

  // 找打击者（必须在场才有价值）
  const striker = filterAlive(playerBench).find(u => u.key === strikerKey);
  if (!striker) {
    return { shouldPlay: false, score: 0, debug: `打击者 ${strikerKey} 不在场` };
  }

  const strikerPower = getPow(striker);

  // 选可击杀的目标优先，其次高价值目标
  const sorted = [...aliveEnemies].sort((a, b) => {
    const aKillable = getHp(a) <= strikerPower ? 20 : 0;
    const bKillable = getHp(b) <= strikerPower ? 20 : 0;
    const aVal = aKillable + (a.isChampion ? 15 : 0) + getPow(a) + a.cost;
    const bVal = bKillable + (b.isChampion ? 15 : 0) + getPow(b) + b.cost;
    return bVal - aVal;
  });

  const bestTarget = sorted[0];
  const canKill = getHp(bestTarget) <= strikerPower;
  const score = 10 + (canKill ? 10 : 0) + (bestTarget.isChampion ? 15 : 0) + getPow(bestTarget);

  return {
    shouldPlay: true,
    targets: [{ type: 'enemy', id: bestTarget.id }],
    score,
    debug: `${striker.name}(${strikerPower}攻)单向打击 ${bestTarget.name}${canKill?' [可击杀]':''}, 评分${score}`,
  };
}

// ==========================================
// Pattern: RECALL_AND_REPLACE — 召回友方单位并召唤替身
// ==========================================
// 配置参数: 无特殊参数
// 效果：将交战区友方单位撤回，在其位置召唤一个替身（如 异镜来物→镜爻）
// ==========================================

function evaluateRECALL_AND_REPLACE(
  _spell: CardData,
  _state: GameState,
  _enemyBench: CardData[],
  playerBench: CardData[],
  _config: Record<string, any>,
): AIEvaluation {
  const aliveAllies = filterAlive(playerBench);

  if (aliveAllies.length === 0) {
    return { shouldPlay: false, score: 0, debug: '无友方单位可召回' };
  }

  // 选最有价值的单位召回（天启者 > 高费 > 低费）
  const sorted = [...aliveAllies].sort((a, b) => {
    const aScore = (a.isChampion ? 20 : 0) + a.cost + getPow(a) + getHp(a);
    const bScore = (b.isChampion ? 20 : 0) + b.cost + getPow(b) + getHp(b);
    return bScore - aScore;
  });

  const target = sorted[0];
  const score = 8 + (target.isChampion ? 15 : 0) + getPow(target) + getHp(target);

  return {
    shouldPlay: true,
    targets: [{ type: 'ally', id: target.id }],
    score,
    debug: `召回 ${target.name}（价值评分 ${score}）`,
  };
}

// ==========================================
// Pattern: CALIBRATE — 校准（牌库顶展示N张，选1张放回牌库顶）
// ==========================================
// 配置参数: 无特殊参数
// 效果：牌库过滤，有费用时即可使用
// ==========================================

function evaluateCALIBRATE(
  _spell: CardData,
  _state: GameState,
  _enemyBench: CardData[],
  _playerBench: CardData[],
  _config: Record<string, any>,
): AIEvaluation {
  // 校准在任何时候都有正面价值（过滤牌库），有费即可打
  return {
    shouldPlay: true,
    targets: [],
    score: 5,
    debug: `校准：过滤牌库，评分 5`,
  };
}

// ==========================================
// Pattern: CHOICE — 天启者抉择法术（如 里芙的决意 → 无尽霜刃 / 吞噬神座）
// ==========================================
// 配置参数: 无特殊参数
// 效果：打出后弹出抉择 UI，由 AI 自动选择最优子选项
// ==========================================

function evaluateCHOICE(
  spell: CardData,
  state: GameState,
  _enemyBench: CardData[],
  _playerBench: CardData[],
  _config: Record<string, any>,
  _enemyHand?: CardData[],
): AIEvaluation {
  if (!spell.choices || spell.choices.length === 0) {
    return { shouldPlay: false, score: 0, debug: '无可选子选项' };
  }

  // [修复] 检查至少有一个抉择选项是费用足够的
  const hasAffordable = spell.choices.some(key => {
    const data = CARD_DB[key] as CardData | undefined;
    if (!data) return false;
    // [2026-07-30 飞剑减费] AI侧飞剑折扣
    const SWORD_DISCOUNT_KEYS = ['acacia_chrono_echo_ultimate', 'acacia_sword_timeline'];
    let checkData = data;
    if (SWORD_DISCOUNT_KEYS.includes(key)) {
      const fsTotal = state.enemyFlyingSwordsTotal || 0;
      if (fsTotal > 0) {
        checkData = { ...data, cost: Math.max(0, (data.cost || 0) - fsTotal) };
      }
    }
    const { canPlay } = evaluateChoiceCondition(checkData, state.enemyMana, state.enemySpellMana, false, state.phase);
    return canPlay;
  });
  if (!hasAffordable) {
    return { shouldPlay: false, score: 0, debug: '抉择选项费用均不足' };
  }

  return {
    shouldPlay: true,
    targets: [],
    score: 12,
    debug: `抉择法术，${spell.choices.length} 个选项待选`,
  };
}

// ==========================================
// Pattern → Handler 映射表
// ==========================================

const HANDLERS: Record<string, (
  spell: CardData,
  state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  config: Record<string, any>,
  enemyHand?: CardData[],
) => AIEvaluation> = {
  DAMAGE: evaluateDAMAGE,
  BUFF: evaluateBUFF,
  RALLY: evaluateRALLY,
  DUEL: evaluateDUEL,
  HEAL: evaluateHEAL,
  DRAW: evaluateDRAW,
  KEYWORD_TRANSFER: evaluateKEYWORD_TRANSFER,
  SUMMON: evaluateSUMMON,
  SACRIFICE: evaluateSACRIFICE,
  FROST: evaluateFROST,
  STRIKE: evaluateSTRIKE,
  RECALL_AND_REPLACE: evaluateRECALL_AND_REPLACE,
  CALIBRATE: evaluateCALIBRATE,
  CHOICE: evaluateCHOICE,
};

// ==========================================
// 对外入口
// ==========================================

/**
 * 评估一张法术是否应该由 AI 打出。
 * @param spell   — 要评估的法术卡牌（必须含 ai 配置）
 * @param state   — 当前游戏状态
 * @param enemyBench — 敌方（AI）备战席/场上单位
 * @param playerBench — 玩家（对手）备战席/场上单位
 * @returns AIEvaluation
 */
export function evaluate(
  spell: CardData,
  state: GameState,
  enemyBench: CardData[],
  playerBench: CardData[],
  enemyHand?: CardData[],
  difficulty?: { conservation: number; mistakeRate: number; planningDepth: number },
): AIEvaluation {
  const aiConfig: AIConfig | undefined = spell.ai;

  // 没有 AI 配置 → 不处理
  if (!aiConfig) {
    return { shouldPlay: false, score: 0, debug: `[${spell.key}] 无 AI 配置` };
  }

  const handler = HANDLERS[aiConfig.pattern];
  if (!handler) {
    return { shouldPlay: false, score: 0, debug: `[${spell.key}] 未知模式: ${aiConfig.pattern}` };
  }

  // [2026-07-08 修复] 交换 bench 参数：
  // 调用方 useAI → evaluate(spell, g, bench, pBench) 中 bench=AI方, pBench=玩家方
  // 但 Handler 内约定 playerBench=己方, enemyBench=敌方 → 需要交换
  const result = handler(spell, state, playerBench, enemyBench, aiConfig.config, enemyHand);

  // [2026-08-06 莉莉子 法术增强] 资源保存（conservation）修正：
  // 难度越高越"憋"伤害法术——若结果只是"打水晶"（非斩杀/非解场），高保存的困难 AI 会放弃（留牌憋斩杀），
  // 简单 AI（conservation 低）则照样乱打。此修正仅作用于纯"打水晶"的低价值动作。
  if (difficulty && result.shouldPlay) {
    const isPureNexusDmg =
      result.targets?.length === 1 && result.targets[0].type === 'player_nexus' &&
      (aiConfig.pattern === 'DAMAGE') &&
      (result.score || 0) < 15; // 纯打水晶（低于击杀/补刀价值）
    if (isPureNexusDmg) {
      // 是否有足够资源保持"憋一手"的欲望：conservation 越高越不轻易打水晶
      if (difficulty.conservation >= 0.7 && Math.random() < (difficulty.conservation - 0.4)) {
        return { shouldPlay: false, score: 0, debug: `[${spell.key}] 资源保存：伤害法术留手，攒斩杀` };
      }
    }
    // 简单 AI 失误：偶尔浪费一张本该憋的牌（mistakeRate 驱动）
    if (difficulty.conservation < 0.4 && Math.random() < difficulty.mistakeRate && isPureNexusDmg) {
      return { shouldPlay: true, score: result.score, debug: `[${spell.key}] 简单AI乱丢伤害` };
    }
  }

  return result;
}
