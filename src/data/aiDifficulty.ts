/**
 * AI 难度参数集
 * [2026-08-06 莉莉子] 三档难度 × 流派性格 的参数化配置
 *
 * 核心思想（调研行业共识）：不重写 AI 逻辑，而是"同一套决策引擎 + 参数化配置"。
 * 每个难度/性格 = 一组权重，作用于所有决策点（进攻/格挡/法术/资源管理）。
 *
 * 参考：npzr-ai 的 DifficultyConfig、LoR 官方"难度靠参数不靠算法"的设计哲学。
 */
import type { EnemyArchetype } from './enemies/archetypes';

/** 难度档位 */
export type AIDifficultyLevel = 'easy' | 'normal' | 'hard';

/** 单档难度参数集 */
export interface AIDifficultyConfig {
    // —— 决策质量 ——
    /** 失误概率 0~0.3：简单高（故意做蠢事），困难低（精算） */
    mistakeRate: number;
    /** 前瞻深度 1~3：简单只考虑当前回合，困难做多回合规划 */
    planningDepth: number;
    // —— 行为倾向（0~1 权重）——
    /** 进攻倾向：高→更爱打脸/主动进攻；低→更保守防守 */
    aggression: number;
    /** 资源保存：高→憋牌/憋斩杀法术；低→有费就用乱丢 */
    conservation: number;
    /** 威胁感知：高→主动解场/防致命斩杀；低→无视威胁 */
    threatAwareness: number;
    /** 组合技/连击规划：高→规划多步 combo */
    comboPlanning: number;
}

/** 三档难度配置 */
export const AI_DIFFICULTY: Record<AIDifficultyLevel, AIDifficultyConfig> = {
    easy: {
        mistakeRate: 0.20,
        planningDepth: 1,
        aggression: 0.6,
        conservation: 0.3,
        threatAwareness: 0.3,
        comboPlanning: 0,
    },
    normal: {
        mistakeRate: 0.08,
        planningDepth: 2,
        aggression: 0.7,
        conservation: 0.5,
        threatAwareness: 0.6,
        comboPlanning: 0.3,
    },
    hard: {
        mistakeRate: 0.02,
        planningDepth: 3,
        aggression: 0.8,
        conservation: 0.8,
        threatAwareness: 0.9,
        comboPlanning: 0.7,
    },
};

/** 流派性格对基础难度的权重修正 */
export const AI_PERSONALITY_MODIFIER: Record<
    EnemyArchetype['aiPersonality'],
    Partial<AIDifficultyConfig>
> = {
    aggressive: { aggression: +0.2, conservation: -0.1, comboPlanning: +0.1 },
    control:    { aggression: -0.2, conservation: +0.2, threatAwareness: +0.1 },
    balanced:   { /* 不改基础难度 */ },
};

/** 钳制到 [0,1] */
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * 计算最终生效的 AI 参数 = 基础难度 + 性格修正
 * @param level 难度档位
 * @param personality 流派性格（默认 balanced）
 */
export const resolveAIConfig = (
    level: AIDifficultyLevel,
    personality: EnemyArchetype['aiPersonality'] = 'balanced'
): AIDifficultyConfig => {
    const base = AI_DIFFICULTY[level];
    const mod = AI_PERSONALITY_MODIFIER[personality] || {};
    return {
        mistakeRate: base.mistakeRate, // 失误率不受性格影响
        planningDepth: base.planningDepth,
        aggression: clamp01(base.aggression + (mod.aggression ?? 0)),
        conservation: clamp01(base.conservation + (mod.conservation ?? 0)),
        threatAwareness: clamp01(base.threatAwareness + (mod.threatAwareness ?? 0)),
        comboPlanning: clamp01(base.comboPlanning + (mod.comboPlanning ?? 0)),
    };
};
