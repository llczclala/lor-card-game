// ==========================================
// 悖论迷宫 · 评估嘉勉——分析员通行证（数据层）
// [2026-08-29 莉莉子] 程拍板：评估嘉勉 = 肉鸽通行证（区别于军功任务系统）。
//   等级轨道 1~30，每级一个固定奖励槽；经验来自「对局（完成/通关）+ 任务」双来源。
//   奖励类型：稀有武装（ownedArmaments）/ 卡包（打开随机武装）/ 迷宫强化解锁（passUnlockedEnhancements）/
//            局外数据金（大厅货币）。
// ==========================================

export const ANALYST_MAX_LEVEL = 30;

// 每级升到下一级所需分析员经验（索引 i = 从 Lv(i+1) 升到 Lv(i+2)）。累计约 1.4 万。
export const ANALYST_EXP_CURVE: number[] = [
    80, 100, 120, 140, 160, 180, 200, 220, 240, 260,         // Lv1→11
    290, 320, 350, 380, 410, 440, 470, 500, 540, 580,         // Lv11→21
    620, 660, 700, 750, 800, 850, 900, 960, 1020, 1080,       // Lv21→30
];

/** [2026-08-29 通行证] 每级奖励槽（1 级无奖励；key = 等级） */
export interface AnalystLevelReward {
    armamentId?: string;         // 稀有武装（进 ownedArmaments，武装库可用）
    pack?: boolean;              // 卡包：打开随机抽一个武装（丰富武装获取渠道）
    unlockEnhancement?: string;  // 迷宫强化解锁（进 passUnlockedEnhancements → 强化池可遇到）
    dataGold?: number;           // 局外数据金（大厅货币）
}

export const ANALYST_LEVEL_REWARDS: Record<number, AnalystLevelReward> = {
    2: { dataGold: 100 },
    3: { armamentId: 'arm_regen_seed' },            // 弗拉梅的求生行囊（原「不灭之种」）
    4: { pack: true },
    5: { armamentId: 'arm_power_health' },          // [2026-09-07 程拍板] 原「碳原子板」已消耗品化（改由每日推演任务供给），此格改发香蒲的白兔应援（原「盈实徽记」）
    6: { dataGold: 150 },
    7: { unlockEnhancement: 'enhance_dark_arrow' }, // 暗箭难防
    8: { armamentId: 'arm_barrier_shield' },        // 桃子的前线医箱（原「圣盾壁垒」）
    9: { dataGold: 200 },
    10: { unlockEnhancement: 'enhance_ghost_action' }, // 幽灵行动
    11: { pack: true },
    12: { armamentId: 'arm_quick_feather' },        // 迅捷之羽
    13: { dataGold: 250 },
    14: { unlockEnhancement: 'enhance_seize_moment' }, // 机不可失
    15: { dataGold: 300 },
    16: { armamentId: 'arm_overwhelm_hammer' },     // 破阵之锤
    17: { unlockEnhancement: 'enhance_fighting_spirit' }, // 战意盎然
    18: { dataGold: 350 },
    19: { pack: true },
    20: { armamentId: 'arm_dimension_jump' },       // 次元折跃
    21: { dataGold: 400 },
    22: { unlockEnhancement: 'enhance_shadow_twin' }, // 暗影双生
    23: { dataGold: 450 },
    24: { unlockEnhancement: 'enhance_round_buff' }, // 回合加护
    25: { armamentId: 'arm_titan_core' },           // 泰坦之核
    26: { dataGold: 500 },
    27: { pack: true },
    28: { dataGold: 550 },
    29: { unlockEnhancement: 'enhance_after_attack_buff' }, // 以战养战
    30: { pack: true },
};

/** 通行证解锁的迷宫强化（等级 → 强化 id；初始不可遇，解锁后进玩家强化池） */
export const PASS_UNLOCK_ENHANCEMENTS: Record<number, string> = {};
Object.entries(ANALYST_LEVEL_REWARDS).forEach(([lv, r]) => {
    if (r.unlockEnhancement) PASS_UNLOCK_ENHANCEMENTS[Number(lv)] = r.unlockEnhancement;
});

/** 升到下一级所需经验（满级返回 0） */
export const getAnalystExpToNext = (level: number): number => {
    if (level >= ANALYST_MAX_LEVEL) return 0;
    return ANALYST_EXP_CURVE[level - 1] ?? 0;
};

/** 升级跨过的等级奖励（供发放） */
export interface AnalystLevelupReward {
    level: number;
    reward: AnalystLevelReward;
}

/**
 * 加分析员经验，连续升级并收集跨过等级的全部奖励（武装/卡包/强化/数据金）。
 * @returns 新等级/经验 + 升级段列表 + 跨过等级的奖励清单
 */
export const computeAnalystLevels = (
    level: number,
    exp: number,
    amount: number,
): { level: number; exp: number; leveled: { from: number; to: number }[]; rewards: AnalystLevelupReward[] } => {
    let lv = Math.max(1, Math.min(ANALYST_MAX_LEVEL, level));
    let e = exp + amount;
    const leveled: { from: number; to: number }[] = [];
    const rewards: AnalystLevelupReward[] = [];
    while (lv < ANALYST_MAX_LEVEL) {
        const need = getAnalystExpToNext(lv);
        if (e < need) break;
        e -= need;
        const from = lv;
        lv += 1;
        leveled.push({ from, to: lv });
        const reward = ANALYST_LEVEL_REWARDS[lv];
        if (reward) rewards.push({ level: lv, reward });
    }
    if (lv >= ANALYST_MAX_LEVEL) e = 0; // 满级后经验清零
    return { level: lv, exp: e, leveled, rewards };
};
