// ==========================================
// 悖论迷宫 · 三线任务化框架 · 任务声明类型
// [2026-09-25 莉莉子] 《设计-肉鸽三线任务化框架》v3 §7.0 的代码落地。
//   武装 / 装备 / 迷宫强化 三线共用同一套「任务（event + threshold）→ 兑现」语法：
//     · 强化：quest 只做【解锁门】—— 达成后才开始分发原有的 battleEffect（兑现复用旧声明，零改动）
//     · 装备 / 武装：quest 达成时按 questReward 直接改写卡牌
//   设计文档：技术手册/设计-肉鸽三线任务化框架.md
// ==========================================
import type { Keyword } from '../types';

/**
 * 可被追踪的任务事件（第一版）。
 * 新增事件时同步：questTracker 的推进调用点 + 设计文档第五章「可追踪事件坐标系」。
 */
export type QuestEvent =
    | 'hero_attack'      // 天启者打击后
    | 'unit_attack'      // 此卡自身打击后（装备线用）
    | 'hero_hit_nexus'   // 天启者打击敌方水晶
    | 'unit_kill'        // 此卡击杀单位
    | 'card_block'       // 此卡格挡
    | 'cast_spell'       // 我方施放法术
    | 'unit_die'         // 我方单位阵亡
    | 'play_unit'        // 我方打出单位
    | 'nexus_damaged'    // 我方水晶受伤
    | 'hero_levelup';    // 天启者升级

/** 作用域：battle = 单场（每场重置）；run = 整局（跨战斗累积） */
export type QuestScope = 'battle' | 'run';

/**
 * 常驻条件（"苛刻型"）：**不需要计数**，而是事件发生时对战场求值，满足才算推进。
 * 与 QuestEvent 的关系：event 决定"什么时候检查"，when 决定"这次算不算数"。
 * 例：背水之刃 = 我方水晶被打时（event）检查是否已跌到三成以下（when）。
 */
export interface QuestCondition {
    /** 我方水晶剩余百分比 ≤ value（例：30 = 三成以下） */
    nexusPctLte?: number;
}

/** 任务声明（挂在 EquipmentDef.quest / MazeBuff.quest 上） */
export interface QuestSpec {
    event: QuestEvent;
    /** 达成阈值（次数） */
    threshold: number;
    /** 缺省 'battle'（单场，每场重做） */
    scope?: QuestScope;
    /** 可选常驻条件：不满足则本次事件不计入进度 */
    when?: QuestCondition;
}

/**
 * 装备 / 武装 的任务兑现。
 * ⚠️ 强化线不走这里 —— 强化的兑现就是它原有的 battleEffect，quest 仅作解锁门。
 * 后续条目（闸门之钥的攻击力翻倍 / 血债账簿的改费 / 遗嘱的装备转移…）按需扩这个联合。
 */
export type EquipmentQuestReward =
    | { class: 'STATS'; power?: number; health?: number }        // 永久数值
    | { class: 'KEYWORDS'; keywords: Keyword[] }                 // 追加关键词
    | { class: 'DOUBLE_POWER' }                                  // 攻击力翻倍（闸门之钥）
    | { class: 'COST_SET'; value: number };                      // 费用改写（血债账簿：降为 0）
