/**
 * 教程关卡完成进度存储
 *
 * 基于 localStorage 持久化记录玩家已通关的考核关卡。
 * 程说"从现在开始记录是否完成，不管之前有没有完成过教程模式"，
 * 所以首次运行时，已完成的列表为空。
 */

/**
 * 根据 userId 生成带用户命名空间的存储 key
 * 不同账号之间互不干扰
 */
const userKey = (prefix: string, userId?: string): string =>
    userId ? `${prefix}_${userId}` : prefix;

/** 获取所有已完成的关卡 ID 列表（传入 userId 区分账号） */
export const getCompletedStages = (userId?: string): string[] => {
    try {
        const data = localStorage.getItem(userKey('tutorial_completed_stages', userId));
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
};

/** 将指定关卡标记为已完成（幂等，不会重复添加） */
export const markStageCompleted = (stageId: string, userId?: string): void => {
    try {
        const completed = getCompletedStages(userId);
        if (!completed.includes(stageId)) {
            completed.push(stageId);
            localStorage.setItem(userKey('tutorial_completed_stages', userId), JSON.stringify(completed));
        }
    } catch {
        // 存储失败时静默忽略，不影响游戏流程
    }
};

/** 查询指定关卡是否已完成 */
export const isStageCompleted = (stageId: string, userId?: string): boolean => {
    return getCompletedStages(userId).includes(stageId);
};

// ==========================================
// [新增] 大厅新手引导层状态
// ==========================================

/** 大厅新手引导层是否已被关闭（无论选了萌新还是老玩家） */
export const isGuidanceDismissed = (userId?: string): boolean => {
    try {
        return localStorage.getItem(userKey('tutorial_guidance_dismissed', userId)) === 'true';
    } catch {
        return false;
    }
};

/** 标记大厅新手引导层为已关闭 */
export const dismissGuidance = (userId?: string): void => {
    try {
        localStorage.setItem(userKey('tutorial_guidance_dismissed', userId), 'true');
    } catch {
        // 静默忽略
    }
};

/** 重置引导层状态（用于调试） */
export const resetGuidance = (userId?: string): void => {
    try {
        localStorage.removeItem(userKey('tutorial_guidance_dismissed', userId));
    } catch {
        // 静默忽略
    }
};
