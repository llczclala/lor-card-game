// ==========================================
// 悖论迷宫 · 神格神经等级 + 天启者状态筛选（占位数据 + 接口）
// [2026-08-14 莉莉子] 神格神经系统尚未实装，本文件提供占位数据与接口：
//   1) 神格神经等级 = 星级（0-MAX_DIVINITY_LEVEL 星），当前全部占位 0；
//      实装后填真实等级，更换天启者界面的排序 / 卡面空槽自动生效
//   2) 天启者状态（已解锁 / 未解锁 / 可升级 / 战役中）= 留接口 getHeroStatus，
//      当前恒返回 null（未判定）；后续接入肉鸽任务 / 解锁体系时实现
// ==========================================

/** 神格神经空槽数（卡面右侧 4 星） */
export const MAX_DIVINITY_LEVEL = 4;

/** 神格神经等级占位表（heroKey → 星级 0-4）。实装后填真实等级 */
export const HERO_DIVINITY_LEVEL: Record<string, number> = {
    lyfe: 0,
    fenny: 0,
    pupu_specular_soul: 0,
    mauxir_lotus_drive: 0,
    acacia_chrono_echo: 0,
};

/** 获取某天启者神格神经等级（星级，无记录 → 0） */
export const getHeroDivinityLevel = (heroKey: string): number => HERO_DIVINITY_LEVEL[heroKey] ?? 0;

// ── 天启者状态筛选（占位接口）──
export type HeroStatus = 'unlocked' | 'locked' | 'upgradable' | 'inCampaign';

export const HERO_STATUS_LABELS: Record<HeroStatus, string> = {
    unlocked: '已解锁',
    locked: '未解锁',
    upgradable: '可升级',
    inCampaign: '战役中',
};

/**
 * 获取某天启者的当前状态。
 * ⚠️ 占位：神格神经 / 肉鸽任务解锁体系未实装，恒返回 null（「未判定」）。
 * 后续接入时：解锁判定 → 'unlocked' / 'locked'；有可升级神格神经 → 'upgradable'；战役进行中 → 'inCampaign'。
 */
export const getHeroStatus = (_heroKey: string): HeroStatus | null => null;
