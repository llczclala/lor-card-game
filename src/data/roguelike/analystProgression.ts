// ==========================================
// 悖论迷宫 · 评估嘉勉——分析员通行证（数据层）
// [2026-08-29 莉莉子] 程拍板：评估嘉勉 = 肉鸽通行证（区别于军功任务系统）。
//   等级轨道 1~30，每级一个固定奖励槽；经验来自「对局（完成/通关）+ 任务」双来源。
//   奖励类型：稀有武装（ownedArmaments）/ 卡包（打开随机武装）/ 迷宫强化解锁（passUnlockedEnhancements）/
//            局外数据金（大厅货币）。
//
// [2026-10-04 程拍板 · 30 级后**无限成长**] 打破"30 级封顶"：
//   ① **31 级之后每级所需经验 = 与 29→30 同级（1080）**（不递增 ⇒ 产出节奏恒定）
//   ② **每 5 级一个里程碑，只有里程碑给 1 个卡包**；非里程碑等级**不发奖励**
//      （程的原话：避免给玩家太多卡包 → 养成溢出）
//   ③ 领取**不允许跳级**（31+ 走水位 `passClaimedUpTo`，见 useUserSystem）
//   ⚠️ 与 ≤30 的固定奖励表**并存**：≤30 查表；>30 只认里程碑。
//   ⚠️ **经验曲线只定义到 30**（30 个台阶）——31+ 由 `ANALYST_POST_CAP_EXP` 兜住。
// ==========================================

/** ≤ 这个等级：走固定奖励表 `ANALYST_LEVEL_REWARDS` */
export const ANALYST_FIXED_REWARD_MAX = 30;
/** 30 级之后每级所需经验（= 29→30 那一档 1080，程拍板「与 29 级到 30 级一致」） */
export const ANALYST_POST_CAP_EXP = 1080;
/** 里程碑间隔：30 级之后每 N 级一个里程碑（**只有里程碑给卡包**） */
export const ANALYST_MILESTONE_STEP = 5;

/** ⚠️ 兼容旧引用（UI/逻辑曾用 `ANALYST_MAX_LEVEL` 表示"固定表的上限"）。
 *  语义已收窄为**固定奖励表的上限**，**不再**表示"等级封顶"。 */
export const ANALYST_MAX_LEVEL = ANALYST_FIXED_REWARD_MAX;

// 每级升到下一级所需分析员经验（索引 i = 从 Lv(i+1) 升到 Lv(i+2)）。累计约 1.4 万。
// ⚠️ 只覆盖 Lv1→30；31+ 一律取 ANALYST_POST_CAP_EXP。
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
    29: { armamentId: 'arm_triumph_box' }, // [2026-09-28 程拍板 · 神格神经] 原「以战养战」已摘出玩家强化池（"打击+1/+1"改由神格神经节点①提供）→ 本格改发「凯旋之匣」（紫）
    30: { pack: true },
};

/** 通行证解锁的迷宫强化（等级 → 强化 id；初始不可遇，解锁后进玩家强化池） */
export const PASS_UNLOCK_ENHANCEMENTS: Record<number, string> = {};
Object.entries(ANALYST_LEVEL_REWARDS).forEach(([lv, r]) => {
    if (r.unlockEnhancement) PASS_UNLOCK_ENHANCEMENTS[Number(lv)] = r.unlockEnhancement;
});

/** 升到下一级所需经验（**30 级之后恒为 `ANALYST_POST_CAP_EXP`，永不返回 0**） */
export const getAnalystExpToNext = (level: number): number => {
    if (level >= ANALYST_FIXED_REWARD_MAX) return ANALYST_POST_CAP_EXP; // [2026-10-04] 原先返回 0 = 封顶；现改为恒定台阶
    return ANALYST_EXP_CURVE[level - 1] ?? ANALYST_POST_CAP_EXP;
};

/** 30 级之后的里程碑等级（每 `ANALYST_MILESTONE_STEP` 级一个） */
export const isAnalystMilestone = (level: number): boolean =>
    level > ANALYST_FIXED_REWARD_MAX && level % ANALYST_MILESTONE_STEP === 0;

/** 下一个里程碑等级（严格大于当前等级） */
export const getNextAnalystMilestone = (level: number): number =>
    (Math.floor(Math.max(level, ANALYST_FIXED_REWARD_MAX) / ANALYST_MILESTONE_STEP) + 1) * ANALYST_MILESTONE_STEP;

/**
 * **取某等级的奖励 —— 唯一出口**。凡是要知道"这一级给什么"的地方**都必须走它**：
 *   · ≤30：查固定表（1 级无奖励 ⇒ `undefined`）
 *   · >30：**只认里程碑** ⇒ 里程碑给 1 个卡包，其余等级 `undefined`（程拍板 ④）
 *
 * ⚠️ 为什么必须收成一个出口：原先"查表"散在 4 处（领取 / 一键领取 / UI 轨道 / 强化解锁映射），
 *    31+ 一放开就会出现"有的地方认、有的地方不认"⇒ 典型症状是**一键领取静默跳过 31+**。
 */
export const getAnalystReward = (level: number): AnalystLevelReward | undefined => {
    if (level <= ANALYST_FIXED_REWARD_MAX) return ANALYST_LEVEL_REWARDS[level];
    return isAnalystMilestone(level) ? { pack: true } : undefined;
};

/** 升级跨过的等级奖励（供发放） */
export interface AnalystLevelupReward {
    level: number;
    reward: AnalystLevelReward;
}

/**
 * 加分析员经验，连续升级并收集跨过等级的全部奖励（武装/卡包/强化/数据金）。
 * [2026-10-04] 改造为**无限成长**：
 *   · 去掉 `Math.min(ANALYST_MAX_LEVEL, …)` 钳位（否则存档里 31+ 的等级再拿一次经验就被压回 30）
 *   · 去掉"满级清经验"（否则 30 级后的经验每局都被吞掉，永远升不了 31）
 *   · 奖励改走唯一出口 `getAnalystReward`（>30 只有里程碑才有）
 *   · **两道死循环护栏**：`need <= 0` 立即退出 + 迭代上限
 *     ⚠️ 这两道不是多余的：`getAnalystExpToNext` 一旦返回 0，`e -= 0` 永远减不完 ⇒ **等级会被冲到天上**
 * @returns 新等级/经验 + 升级段列表 + 跨过等级的奖励清单
 */
export const computeAnalystLevels = (
    level: number,
    exp: number,
    amount: number,
): { level: number; exp: number; leveled: { from: number; to: number }[]; rewards: AnalystLevelupReward[] } => {
    // [2026-10-04 独立审查 #1 修复] 入口消毒：`JSON.parse('1e999')` 会得到 `Infinity`，
    //   而 `Math.floor(Infinity) || 1` **仍是 Infinity**（truthy）⇒ 旧写法拦不住脏存档。
    //   一旦 lv=Infinity，`lv += 1` 永远不变 ⇒ 护栏跑满却没进展，还会把 `level: Infinity` 写回存档，
    //   进而让 `claimPostCapPassRewards` 的 `for (lv <= level)` **永不终止**（客户端卡死）。
    const lvIn = Number(level);
    let lv = Number.isFinite(lvIn) ? Math.max(1, Math.floor(lvIn)) : 1;
    let e = Number.isFinite(exp) && Number.isFinite(amount) ? exp + amount : 0;
    const leveled: { from: number; to: number }[] = [];
    const rewards: AnalystLevelupReward[] = [];
    let guard = 0;
    // 迭代上限 1000：正常一局最多连升几级，1000 级余量绰绰有余，同时把"脏 exp 造成的巨型数组"封住
    while (lv >= 1 && guard++ < 1000) {
        const need = getAnalystExpToNext(lv);
        if (!Number.isFinite(need) || need <= 0) break; // ⚠️ 护栏一：绝不让 need≤0 进循环
        if (!Number.isFinite(e)) break;                 // ⚠️ 护栏二：e 非有限（NaN/±Infinity）⇒ 立即退出
                                                        //   （NaN 与任何数比较都是 false ⇒ 没有这道就会空转到迭代上限）
        if (e < need) break;
        e -= need;
        const from = lv;
        lv += 1;
        leveled.push({ from, to: lv });
        const reward = getAnalystReward(lv);
        if (reward) rewards.push({ level: lv, reward });
    }
    if (guard >= 1000) {
        console.warn('[通行证] 单次升级迭代触顶（1000 级）—— 疑似存档异常（等级/经验被改成极端值），已截断；剩余经验保留待下次继续');
    }
    return { level: lv, exp: e, leveled, rewards };
};
