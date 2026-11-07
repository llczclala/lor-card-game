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

/**
 * [2026-10-25 莉莉子 · 难度阶梯] **决策能力开关** —— 难度阶梯的第二维度
 *
 * 病根（2026-10-25 盘点，已逐行核对）：
 *   下面的 5 个权重只能调「倾向」（爱不爱进攻），调不了「看得见什么」。
 *   实测三档的实际差异仅为：
 *     · 格挡：只有 threatAwareness ≥ 0.6 一个布尔 ⇒ **normal(0.6) 与 hard(0.9) 逐字相同**；
 *     · 进攻：aggression 0.6/0.7/0.8 对着 0.6/0.7/0.85 三个阈值 ⇒ **normal 与 hard 逐字相同**；
 *     · planningDepth 只在 `evaluate` 签名上挂着、函数体内零读取；comboPlanning 全项目零引用。
 *   ⇒ 「最高难度」目前只是「普通难度」的另一个名字。
 *
 * 口径（程 2026-10-25 拍板）：**hard = 只靠算力变强，不给任何信息特权**
 *   —— AI 永远只看公开信息（战场 / 备战席 / 已公开的牌），看不到玩家手牌与牌库。
 *
 * 用法：能力轴决定「会不会做这道工序」，权重轴决定「做的时候怎么选」。
 *   easy 一列的 false 是**设计**（可被玩家利用的蠢），不是欠债；
 *   唯独「该挡的致命伤害必挡」是所有档位的底线，不进本开关。
 */
export interface AICapabilities {
    /** 格挡前按「放行代价」给攻击者排序。关＝按交战区数组顺序（玩家可用拖拽顺序操纵它） */
    sortAttackers: boolean;
    /** 交换阈值随水晶血量浮动。关＝固定的「攻击 ≥ 2×血」一刀切 */
    dynamicTradeDiff: boolean;
    /** 挡【碾压】前先比较「这个阻挡者省给谁更值」。关＝见碾压就派人 */
    compareTrampleOpt: boolean;
    /** 算完格挡后复查是否仍然致命，不合格就清空重排。关＝一条链走到黑 */
    reassignOnLethal: boolean;
}

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
    /** 威胁感知：高→主动解场/防致命斩杀；低→无视威胁。
     *  ⚠️ [2026-10-25] 本参数在**格挡链上已无消费者**：它原本唯一的作用是给那条致命兜底
     *     加个 `>= 0.6` 的布尔闸门，而「该挡的致命伤害必挡」现在是**全档位底线**
     *     （见 `useAI.ts` 格挡段的「致命兜底」注释）。留字段是为了不破坏性格表结构，
     *     但**别再拿它当难度依据** —— 难度差异请走 `capabilities`。 */
    threatAwareness: number;
    /** 组合技/连击规划：高→规划多步 combo */
    comboPlanning: number;
    /** [2026-10-25] 决策能力开关 —— 难度阶梯的另一根轴，见 AICapabilities */
    capabilities: AICapabilities;
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
        // easy = 现状基线的显式化：会格挡、会换子、该挡致命会挡，
        // 但**不排序、不浮动阈值、不算碾压代价** —— 这些"蠢"是留给玩家利用的入口。
        capabilities: {
            sortAttackers: false,
            dynamicTradeDiff: false,
            compareTrampleOpt: false,
            reassignOnLethal: false,
        },
    },
    normal: {
        mistakeRate: 0.08,
        planningDepth: 2,
        aggression: 0.7,
        conservation: 0.5,
        threatAwareness: 0.6,
        comboPlanning: 0.3,
        // normal = 「不犯明显蠢事」档（Riot 口径）：看得见威胁大小、懂得随血量换子、
        // 不会白送单位给【碾压】。但仍不做事后校验与重排。
        capabilities: {
            sortAttackers: true,
            dynamicTradeDiff: true,
            compareTrampleOpt: true,
            reassignOnLethal: false,
        },
    },
    hard: {
        mistakeRate: 0.02,
        planningDepth: 3,
        aggression: 0.8,
        conservation: 0.8,
        threatAwareness: 0.9,
        comboPlanning: 0.7,
        // hard = 只靠算力变强：多一道「算完再验、不合格重排」的回路。
        // **不含任何信息特权**（看不见玩家手牌/牌库）。
        capabilities: {
            sortAttackers: true,
            dynamicTradeDiff: true,
            compareTrampleOpt: true,
            reassignOnLethal: true,
        },
    },
};

/** 流派性格对基础难度的权重修正 */
export const AI_PERSONALITY_MODIFIER: Record<
    EnemyArchetype['aiPersonality'],
    // [2026-10-25 莉莉子] 从类型层面禁掉 capabilities：**性格只改倾向，不许改能力**。
    //   能力（看得见什么）只由难度档决定，否则"哪个流派更聪明"会变成隐性难度。
    Partial<Omit<AIDifficultyConfig, 'capabilities'>>
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
        // [2026-10-25] 能力开关直接取难度档，**不参与性格修正**
        // [独立审查 #5] 必须浅拷贝：直接引用会让运行时任何一处写 `cfg.capabilities.x` 污染三档全局表
        capabilities: { ...base.capabilities },
    };
};
