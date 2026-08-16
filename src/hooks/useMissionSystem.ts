/**
 * ==============================================================================
 * 《Snowbreak Rivals》 军功结算中枢大脑 (Mission System Hook)
 * ==============================================================================
 * 职责：
 * 1. 负责从 localStorage 读取并维护玩家个人的任务进度。
 * 2. 每天 06:00 跨天重置、每周一 06:00 跨周重置。
 * 3. 接收对局结束的 gameLogger 黑匣子日志，比对达成条件并累加进度。
 * 4. 暴露领奖流，并将奖励信息移交给 UI 层配合 userSystem 提货。
 * ==============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MISSIONS, type MissionDef } from '../data/missionData';
import type {
    LogEvent,
    PlayCardLogEvent,
    AttackLogEvent,
    NexusDamageLogEvent,
    DamageDealtLogEvent,
    LevelUpLogEvent,
    GameEndLogEvent
} from '../utils/gameLogger';

export type MissionStatus = 'ongoing' | 'completed' | 'claimed';

export interface MissionProgress {
    id: string;
    current: number;
    target: number;
    status: MissionStatus;
    sort: number;  // 排序权重：0=已完成待领取, 1~100=进行中(越小越接近完成), 101=已领取
}

/** 根据任务状态与进度计算排序权重 */
export function computeSort(status: MissionStatus, current: number, target: number): number {
    if (status === 'completed') return 0;
    if (status === 'claimed') return 101;
    // ongoing: 进度越高(接近完成) → sort 越小
    const pct = Math.floor((current / Math.max(target, 1)) * 100);
    return Math.max(1, 100 - pct);
}

export interface MissionUpdateResult {
    missionId: string;
    addedAmount: number;     // 刚刚新增的进度量
    current: number;         // 更新后的当前总进度
    target: number;
    justCompleted: boolean;  // 是否在这一瞬间刚刚完成
    title: string;           // 任务标题 (用于 UI 滑动弹窗)
}

// ==========================================
// 辅助工具：逻辑时间戳计算 (以 06:00 AM 为界)
// ==========================================
const getLogicalDay = (timestamp: number): number => {
    const d = new Date(timestamp);
    d.setHours(d.getHours() - 6); // 将时钟拨回 6 小时，让凌晨 6 点成为跨天分界线
    return Math.floor(d.getTime() / 86400000); // 绝对天数
};

const getLogicalWeek = (timestamp: number): number => {
    const d = new Date(timestamp);
    d.setHours(d.getHours() - 6);
    const dayOfWeek = (d.getDay() + 6) % 7; // 让周一成为 0，周日成为 6
    const startOfWeek = new Date(d);
    startOfWeek.setDate(d.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0); // 截断到该周周一的 00:00:00 (即原时间的 06:00:00)
    return startOfWeek.getTime();
};

export const useMissionSystem = (userId: string, registerTime?: string) => {
    const [progress, setProgress] = useState<Record<string, MissionProgress>>({});
    const [isReady, setIsReady] = useState(false);

    // ==========================================
    // 状态雷达：是否有可领取的奖励 (用于点亮大厅黄点)
    // ==========================================
    const hasClaimableReward = useMemo(() => {
        return Object.values(progress).some(p => p.status === 'completed');
    }, [progress]);

    // ==========================================
    // 生命周期：初始化、数据合并与跨期重置
    // ==========================================
    useEffect(() => {
        if (!userId) return;

        const STORAGE_KEY = `sbr_mission_prog_${userId}`;
        const DAILY_KEY = `sbr_mission_reset_d_${userId}`;
        const WEEKLY_KEY = `sbr_mission_reset_w_${userId}`;

        const savedStr = localStorage.getItem(STORAGE_KEY);
        const saved: Record<string, MissionProgress> = savedStr ? JSON.parse(savedStr) : {};

        const merged: Record<string, MissionProgress> = {};
        let needsSave = false;

        // 1. 将新版本 missionData 里的任务动态合入玩家存档
        MISSIONS.forEach(m => {
            // [fix] 不满足 showCondition 的任务直接跳过，不入 progress
            if (m.showCondition?.accountCreatedBefore && registerTime) {
                const regDate = new Date(registerTime);
                const cutoff = new Date(m.showCondition.accountCreatedBefore);
                if (regDate >= cutoff) {
                    if (saved[m.id]) needsSave = true; // 清除旧存档中的隐藏任务
                    return; // 跳过此任务，不给它分配 progress 槽位
                }
            }

            if (saved[m.id]) {
                merged[m.id] = saved[m.id];
                // [fix] 对已有存档也强制修正：direct_claim 任务若尚未领取，直接变为已完成
                if (m.condition.type === 'direct_claim' && merged[m.id].status !== 'claimed') {
                    merged[m.id] = { id: m.id, current: m.targetCount, target: m.targetCount, status: 'completed', sort: 0 };
                    needsSave = true;
                }
            } else {
                // [fix] direct_claim 任务无需对局，初始化即完成
                if (m.condition.type === 'direct_claim') {
                    merged[m.id] = { id: m.id, current: m.targetCount, target: m.targetCount, status: 'completed', sort: 0 };
                } else {
                    merged[m.id] = { id: m.id, current: 0, target: m.targetCount, status: 'ongoing', sort: computeSort('ongoing', 0, m.targetCount) };
                }
                needsSave = true;
            }
        });

        // 2. 检查跨天/跨周重置
        const now = Date.now();
        const currentLogicalDay = getLogicalDay(now);
        const currentLogicalWeek = getLogicalWeek(now);

        const lastDaily = parseInt(localStorage.getItem(DAILY_KEY) || '0');
        const lastWeekly = parseInt(localStorage.getItem(WEEKLY_KEY) || '0');

        if (lastDaily < currentLogicalDay) {
            // 执行跨天大重置
            MISSIONS.filter(m => m.category === 'daily').forEach(m => {
                if (merged[m.id]) {
                    merged[m.id] = { id: m.id, current: 0, target: m.targetCount, status: 'ongoing', sort: computeSort('ongoing', 0, m.targetCount) };
                }
            });
            localStorage.setItem(DAILY_KEY, currentLogicalDay.toString());
            needsSave = true;
        }

        if (lastWeekly < currentLogicalWeek) {
            // 执行跨周大重置
            MISSIONS.filter(m => m.category === 'weekly').forEach(m => {
                if (merged[m.id]) {
                    merged[m.id] = { id: m.id, current: 0, target: m.targetCount, status: 'ongoing', sort: computeSort('ongoing', 0, m.targetCount) };
                }
            });
            localStorage.setItem(WEEKLY_KEY, currentLogicalWeek.toString());
            needsSave = true;
        }

        // 3. 对所有任务补填/刷新排序权重（兼容旧存档 + 新任务）
        Object.values(merged).forEach(p => {
            const newSort = computeSort(p.status, p.current, p.target);
            if (p.sort !== newSort) {
                p.sort = newSort;
                needsSave = true;
            }
        });

        if (needsSave) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }

        setProgress(merged);
        setIsReady(true);
    }, [userId, registerTime]);

    // ==========================================
    // 核心审计算法：扫描对局日志，累加进度
    // ==========================================
    const scanLogs = useCallback((logs: LogEvent[]): MissionUpdateResult[] => {
        if (!userId || logs.length === 0 || !isReady) return [];

        let hasUpdates = false;
        const updates: MissionUpdateResult[] = [];
        const newProgress = { ...progress };

        // 预提全局事件 (降低循环内开销)
        const gameEndEvent = logs.find(l => l.type === 'game_end') as GameEndLogEvent | undefined;
        const isWin = gameEndEvent?.result === 'win';
        const levelUpCards = new Set(
            logs.filter(l => l.type === 'level_up' && l.isPlayerSide).map(l => (l as LevelUpLogEvent).cardKey)
        );

        // 开始对账
        MISSIONS.forEach(mission => {
            const prog = newProgress[mission.id];
            if (!prog || prog.status !== 'ongoing') return; // 只处理正在进行中的任务

            let added = 0;

            switch (mission.condition.type) {
                case 'game_end':
                    if (gameEndEvent) added += 1;
                    break;
                case 'play_card':
                    added += logs.filter(l => l.type === 'play_card' && l.isPlayerSide && (l as PlayCardLogEvent).cardKey === mission.condition.targetKey).length;
                    break;
                case 'attack':
                    added += logs.filter(l => l.type === 'attack' && l.isPlayerSide && (l as AttackLogEvent).cardKey === mission.condition.targetKey).length;
                    break;
                case 'nexus_damage':
                    logs.filter(l => l.type === 'nexus_damage' && l.isPlayerSide && (l as NexusDamageLogEvent).sourceCardKey === mission.condition.targetKey).forEach(l => {
                        added += (l as NexusDamageLogEvent).amount;
                    });
                    break;
                case 'level_up_and_win':
                    if (isWin && mission.condition.targetKey && levelUpCards.has(mission.condition.targetKey)) {
                        added += 1;
                    }
                    break;
                // [2026-06-27] 携带指定英雄获胜：检查对局中是否打出过该英雄且获胜
                case 'win_with_champion':
                    if (isWin && mission.condition.targetKey) {
                        const playedChampion = logs.some(l => l.type === 'play_card' && l.isPlayerSide && (l as PlayCardLogEvent).cardKey === mission.condition.targetKey);
                        if (playedChampion) added += 1;
                    }
                    break;
                // [2026-07-12] 携带指定后勤小队全员获胜：检查是否打出过小队所有成员且获胜
                case 'win_with_squad':
                    if (isWin && mission.condition.targetKeys && mission.condition.targetKeys.length > 0) {
                        const playedCards = new Set(
                            logs.filter(l => l.type === 'play_card' && l.isPlayerSide)
                                .map(l => (l as PlayCardLogEvent).cardKey)
                        );
                        const allPlayed = mission.condition.targetKeys.every(k => playedCards.has(k));
                        if (allPlayed) added += 1;
                    }
                    break;
                // [2026-07-22] 指定单位累计造成伤害 (用于臆莲基座等)
                case 'damage_dealt':
                    logs.filter(l => l.type === 'damage_dealt' && l.isPlayerSide && (l as DamageDealtLogEvent).sourceCardKey === mission.condition.targetKey).forEach(l => {
                        added += (l as DamageDealtLogEvent).amount;
                    });
                    break;
                // [2026-06-27] 直接领取：无需条件，初始即完成
                case 'direct_claim':
                    if (prog.current === 0) added = 1;
                    break;
            }

            // 如果有新增进度，执行结算判定
            if (added > 0) {
                prog.current = Math.min(prog.current + added, prog.target);
                const justCompleted = prog.current >= prog.target;

                if (justCompleted) {
                    prog.status = 'completed'; // 标记完成，触发小黄点
                    prog.sort = 0;             // 已完成未领取 → 置顶
                }

                updates.push({
                    missionId: mission.id,
                    addedAmount: added,
                    current: prog.current,
                    target: prog.target,
                    justCompleted,
                    title: mission.title
                });
                hasUpdates = true;
            }
        });

        // 打包写回数据库
        if (hasUpdates) {
            setProgress(newProgress);
            localStorage.setItem(`sbr_mission_prog_${userId}`, JSON.stringify(newProgress));
        }

        // 返回给 UI 层，以队列形式渲染滑入 Toast
        return updates;
    }, [userId, progress, isReady]);

    // ==========================================
    // 领奖业务流：标记签收并提取奖励配置
    // ==========================================
    const claimReward = useCallback((missionId: string): MissionDef['reward'] | null => {
        const prog = progress[missionId];
        if (!prog || prog.status !== 'completed') return null; // 防止非法提货

        const missionDef = MISSIONS.find(m => m.id === missionId);
        if (!missionDef) return null;

        // 盖上“已签收”印章
        const newProgress = {
            ...progress,
            [missionId]: { ...prog, status: 'claimed' as MissionStatus, sort: 101 }
        };

        setProgress(newProgress);
        localStorage.setItem(`sbr_mission_prog_${userId}`, JSON.stringify(newProgress));

        // 退还奖励清单，交由 UI 层呼叫 userSystem 履行发货
        return missionDef.reward;
    }, [progress, userId]);

    return {
        isReady,
        progress,
        hasClaimableReward,
        scanLogs,
        claimReward
    };
};