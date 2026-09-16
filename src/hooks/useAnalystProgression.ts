// ==========================================
// 悖论迷宫 · 评估嘉勉——分析员通行证薄 hook
// [2026-08-29 莉莉子] 读 UserProfile.level/exp（大厅 LEVEL 徽章联动），
//   加分析员经验 → 连续升级并返回跨级奖励（武装/卡包/强化/数据金）。
//   实际发放由 useUserSystem.grantAnalystExp 统一处理（本 hook 仅供 UI 读取/计算）。
// ==========================================
import { computeAnalystLevels, getAnalystExpToNext, type AnalystLevelupReward } from '../data/roguelike/analystProgression';

export interface AnalystProgressionProps {
    profile: { level: number; exp: number } | null;
    updateProfile: (p: { level: number; exp: number }) => void;
}

export const useAnalystProgression = ({ profile, updateProfile }: AnalystProgressionProps) => {
    const level = profile?.level ?? 1;
    const exp = profile?.exp ?? 0;
    const expToNext = getAnalystExpToNext(level);

    /** 加分析员经验：升级（写回 profile），返回跨级奖励（发放由 userSystem 负责） */
    const addAnalystExp = (amount: number): { level: number; exp: number; leveled: { from: number; to: number }[]; rewards: AnalystLevelupReward[] } => {
        const res = computeAnalystLevels(level, exp, amount);
        updateProfile({ level: res.level, exp: res.exp });
        return res;
    };

    return { level, exp, expToNext, addAnalystExp };
};
