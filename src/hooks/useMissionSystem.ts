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
    DeckListLogEvent,
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
// [2026-11-07 莉莉子 BUG修复 · 日常任务不刷新]
//   ── 病根：`Math.floor(d.getTime() / 86400000)` 取的是「UTC 绝对天」，
//      getTime() 恒为 UTC 毫秒 ⇒ 换日分界被钉在 **UTC 00:00**，
//      再叠加前面 `setHours(-6)` 的偏移，UTC+8 下的实际跨天点变成**本地 14:00**。
//   ── 后果链：面板倒计时按本地 06:00 算（MissionUI.tsx:822）⇒ 06:00 归零后
//      玩家进面板看不到任务翻页（粉丝侧观感就是"日常没刷新"），
//      真正重置要拖到当天 14:00。
//   ── 修法：先取**本地日历日**（y/m/d），再用 Date.UTC 归一成日序号 ——
//      与 getLogicalWeek 同口径，不受运行时时区影响，跨天点精确落在本地 06:00。
//      （按 y/m/d 归一后，跨时区/夏令时也不会把序号算歪。）
const getLogicalDay = (timestamp: number): number => {
    const d = new Date(timestamp);
    d.setHours(d.getHours() - 6); // 拨回 6 小时：本地 00:00~06:00 归入「前一天」
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

// 每周：返回「该逻辑周周一那一天」的日序号（与 getLogicalDay 同量纲）。
// 跨周点 = 本地周一 06:00。
const getLogicalWeek = (timestamp: number): number => {
    const d = new Date(timestamp);
    d.setHours(d.getHours() - 6);
    const dayOfWeek = (d.getDay() + 6) % 7; // 让周一成为 0，周日成为 6
    const monday = new Date(d);
    monday.setDate(d.getDate() - dayOfWeek);
    return Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / 86400000);
};

// [2026-11-07 莉莉子 · 审查补丁] 周键的**老格式迁移**。
//   老版本 `getLogicalWeek` 返回的是「该周周一 00:00 的**毫秒时间戳**」（约 1.7e12），
//   新版本返回「周一那一日**的日序号**」（约 2e4）。两者量级差 8 个数量级 ⇒
//   直接拿老值做 `lastWeekly < currentLogicalWeek` 恒为假 ⇒ **升级当周会把老玩家的
//   周任务整周跳过**（要等到下周一才恢复）。
//   这里把毫秒量级的值先还原成日序号，再走正常比较。
//   ⚠️ 日键不用迁移：老 `getLogicalDay` 与新的量级相同（都是 ~2e4），且差值至多 1 天，
//      方向也正确（老值偏小 ⇒ 多触发一次「补发式」重置，正是玩家想要的）。
const normalizeLegacyWeekKey = (raw: number): number => {
    if (raw > 1e11) {
        const d = new Date(raw);
        return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    }
    return raw;
};

// ==========================================
// 存档同步（纯函数 · 每次调用都重新读 localStorage，可在任意时机重复执行）
//   职责：① 把 missionData 的新任务动态合入玩家存档
//         ② 跨天 / 跨周重置
//         ③ 补填排序权重
//   ⚠️ 与旧实现的差别：跨天判定从 `last < current` 改为 `!==`。
//      旧写法在**系统时钟被拨到未来**后会往 DAILY_KEY 写一个未来的日戳，
//      之后时钟回到正常也永远满足不了 `last < current` ⇒ 日常任务从此**永久不刷新**
//      （这也是一条粉丝侧"再也不刷新"的独立病根）。
//      新写法：日戳向前走 → 正常重置；日戳向后走（时钟回拨/换时区）→ 只纠正日戳、
//      **不清进度**，既不会让回拨反复刷任务，也不会再死锁。
// ==========================================
const STORAGE_KEY_PREFIX = 'sbr_mission_prog_';
const DAILY_KEY_PREFIX = 'sbr_mission_reset_d_';
const WEEKLY_KEY_PREFIX = 'sbr_mission_reset_w_';

interface MissionSyncResult {
    merged: Record<string, MissionProgress>;
    /** 进度表有实质变更（新任务入槽 / 跨期重置 / 排序刷新）→ 调用方需写回并 setProgress */
    changed: boolean;
    /** 本次跨期重置了哪一档（调试用） */
    reset: 'daily' | 'weekly' | 'both' | null;
}

const syncMissionStore = (
    userId: string,
    registerTime: string | undefined,
    now: number,
): MissionSyncResult => {
    const STORAGE_KEY = STORAGE_KEY_PREFIX + userId;
    const DAILY_KEY = DAILY_KEY_PREFIX + userId;
    const WEEKLY_KEY = WEEKLY_KEY_PREFIX + userId;

    const savedStr = localStorage.getItem(STORAGE_KEY);
    const saved: Record<string, MissionProgress> = savedStr ? JSON.parse(savedStr) : {};

    const merged: Record<string, MissionProgress> = {};
    let needsSave = false;

    // ── 1. 将新版本 missionData 里的任务动态合入玩家存档 ──
    MISSIONS.forEach(m => {
        // 不满足 showCondition 的任务直接跳过，不入 progress
        if (m.showCondition?.accountCreatedBefore && registerTime) {
            const regDate = new Date(registerTime);
            const cutoff = new Date(m.showCondition.accountCreatedBefore);
            if (regDate >= cutoff) {
                if (saved[m.id]) needsSave = true; // 清除旧存档中的隐藏任务
                return;
            }
        }

        if (saved[m.id]) {
            merged[m.id] = saved[m.id];
            // direct_claim 任务若尚未领取，直接变为已完成。
            // ⚠️ [2026-11-07 审查补丁] 只在**真的不一致**时才改写并标记变更 ——
            //    否则下面那个 30s 周期检查每次都会 new 一个对象 + 置 needsSave，
            //    于是 `setProgress` 每 30 秒空转一次（重渲染 + 写盘），
            //    `changed` 判空完全失效。
            if (m.condition.type === 'direct_claim' && saved[m.id].status !== 'claimed') {
                const alreadyDone =
                    saved[m.id].status === 'completed' &&
                    saved[m.id].current >= m.targetCount &&
                    saved[m.id].target === m.targetCount;
                if (!alreadyDone) {
                    merged[m.id] = { id: m.id, current: m.targetCount, target: m.targetCount, status: 'completed', sort: 0 };
                    needsSave = true;
                }
            }
        } else {
            if (m.condition.type === 'direct_claim') {
                merged[m.id] = { id: m.id, current: m.targetCount, target: m.targetCount, status: 'completed', sort: 0 };
            } else {
                merged[m.id] = { id: m.id, current: 0, target: m.targetCount, status: 'ongoing', sort: computeSort('ongoing', 0, m.targetCount) };
            }
            needsSave = true;
        }
    });

    // ── 2. 跨天 / 跨周重置 ──
    const currentLogicalDay = getLogicalDay(now);
    const currentLogicalWeek = getLogicalWeek(now);
    const lastDaily = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);
    // 周键可能是老版本的毫秒时间戳 → 先归一成日序号（见 normalizeLegacyWeekKey 注释）
    const lastWeekly = normalizeLegacyWeekKey(parseInt(localStorage.getItem(WEEKLY_KEY) || '0', 10));

    const resetCategory = (category: 'daily' | 'weekly'): boolean => {
        let touched = false;
        MISSIONS.filter(m => m.category === category).forEach(m => {
            if (!merged[m.id]) return;
            // [2026-11-07 审查补丁] direct_claim 没有「进度」可归零（它初始化即 completed），
            //   重置只会把「可直接领取」打回 ongoing/0，要等下一次补水才自愈。
            //   当前数据里没有 daily/weekly 的 direct_claim（都是 achievement），
            //   这条是防止将来加「每日签到」类任务时踩进同一个坑。
            if (m.condition.type === 'direct_claim') return;
            merged[m.id] = {
                id: m.id,
                current: 0,
                target: m.targetCount,
                status: 'ongoing',
                sort: computeSort('ongoing', 0, m.targetCount),
            };
            touched = true;
        });
        return touched;
    };

    let didDaily = false;
    let didWeekly = false;

    if (lastDaily !== currentLogicalDay) {
        // 只有「日戳向前走」才是真跨天；倒退（时钟回拨）只纠正日戳，保住进度
        if (lastDaily < currentLogicalDay && resetCategory('daily')) {
            didDaily = true;
            needsSave = true;
        }
        localStorage.setItem(DAILY_KEY, currentLogicalDay.toString());
    }

    if (lastWeekly !== currentLogicalWeek) {
        if (lastWeekly < currentLogicalWeek && resetCategory('weekly')) {
            didWeekly = true;
            needsSave = true;
        }
        localStorage.setItem(WEEKLY_KEY, currentLogicalWeek.toString());
    }

    // ── 3. 补填/刷新排序权重（兼容旧存档 + 新任务）──
    Object.values(merged).forEach(p => {
        const newSort = computeSort(p.status, p.current, p.target);
        if (p.sort !== newSort) {
            p.sort = newSort;
            needsSave = true;
        }
    });

    const reset: MissionSyncResult['reset'] = didDaily && didWeekly ? 'both' : didDaily ? 'daily' : didWeekly ? 'weekly' : null;
    return { merged, changed: needsSave, reset };
};

export const useMissionSystem = (userId: string, registerTime?: string) => {
    const [progress, setProgress] = useState<Record<string, MissionProgress>>({});
    const [isReady, setIsReady] = useState(false);

    // ==========================================
    // [2026-09-03 BUG修复] 状态雷达拆成两套：
    //   - hasClaimableReward        普通任务可领 → 点亮大厅任务按钮黄点
    //   - hasRogueClaimableReward   肉鸽任务可领 → 点亮悖论迷宫"推演任务"按钮黄点
    // 之前共用一套导致：肉鸽任务完成也点亮大厅黄点，但大厅面板看不到肉鸽任务
    // ==========================================
    const rogueMissionIds = useMemo(() => new Set(MISSIONS.filter(m => m.rogue).map(m => m.id)), []);
    const normalMissionIds = useMemo(() => new Set(MISSIONS.filter(m => !m.rogue).map(m => m.id)), []);

    // 大厅黄点：只统计普通任务（MissionUI 面板可见的任务）
    const hasClaimableReward = useMemo(() => {
        return Object.values(progress).some(p => p.status === 'completed' && normalMissionIds.has(p.id));
    }, [progress, normalMissionIds]);

    // 肉鸽黄点：只统计 rogue 标记任务（RogueMissionPanel 面板可见的任务）
    const hasRogueClaimableReward = useMemo(() => {
        return Object.values(progress).some(p => p.status === 'completed' && rogueMissionIds.has(p.id));
    }, [progress, rogueMissionIds]);

    // ==========================================
    // 生命周期：初始化、数据合并与跨期重置
    // ==========================================
    useEffect(() => {
        if (!userId) return;

        const { merged, changed } = syncMissionStore(userId, registerTime, Date.now());
        if (changed) {
            localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(merged));
        }

        setProgress(merged);
        setIsReady(true);
    }, [userId, registerTime]);

    // ==========================================
    // [2026-11-07 莉莉子 BUG修复 · 常驻不重启也要能翻页]
    //   旧实现在上面的初始化 effect 里**只做一次**跨期检查（依赖只有 userId/registerTime），
    //   于是「挂着游戏跨过 06:00」的玩家永远等不到重置 —— 必须重启客户端才会翻页，
    //   这也是"日常没刷新"反馈的主力来源之一。
    //   现在补两道闸：
    //     · 每 30s 轮询（跨天点最多迟 30 秒，对玩家无感）
    //     · 窗口重新可见 / 重新获得焦点时立刻补检（切回来就是最新的）
    //   两者都只重读 localStorage 再比对，**没变化就完全不 setProgress**（不产生多余重渲染）。
    // ==========================================
    useEffect(() => {
        if (!userId) return;

        const checkAndApply = () => {
            const { merged, changed } = syncMissionStore(userId, registerTime, Date.now());
            if (!changed) return;
            localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(merged));
            setProgress(merged);
        };

        const timer = window.setInterval(checkAndApply, 30_000);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') checkAndApply();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', checkAndApply);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', checkAndApply);
        };
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
                // [2026-07-12] 携带指定后勤小队全员获胜
                // =====================================
                // [2026-10-05 莉莉子 BUG修复 · 20261005-04] 判据从「**打出过**」改为「**携带**」= 开局牌组快照
                // ── 病根：卡面写「携带XX小队全员（各三张），赢得一场对局胜利」，实现却在查 `play_card` 日志
                //    （等价于"本局必须把三名成员都打出去过"）—— 比卡面严得多；更要命的是**替换打出的那一次
                //    根本没有 play_card 探针**（`useGameState.playCard` 的探针写在"备战席满员 → 进 select_bench
                //    并 return"**之后**，`confirmReplacePlay` 也不补记）⇒ 备战席满员时打出的成员不计数。
                //    而按卡面「各三张」成簇出牌的自然打法（3 张鸽子→3 张乐手→第 7 张才是箭头）里，
                //    第三名成员的第一张**几乎必然正好是需要替换的那一张** ⇒ 任务永远 0/1（程 2026-10-05 报）。
                // ── 修法：改判开局写入的 `deck_list` 快照 —— 与卡面/公告口径一致（「携带全员赢得对局」），
                //    且完全不依赖"怎么打出去的"（替换、法术从手牌打出、一直被沉底没抽到…都不影响）。
                // ── 张数：`requiredCopies` 逐条写在数据里（**作战成功系列 = 3**，对应卡面「各三张」；
                //    缺省回落到 1 = 携带全员各至少一张，供将来其他"携带类"任务复用）。
                //    ⚠️ 需要**拥有** 3 张才放得进卡组（DeckBuilder 单卡上限 3 + 拥有量闸门）——
                //      版本「新版本启航」只发每人 1 张（`card` 奖励 = 每个 key +1），所以这 2 张要靠抽卡攒。
                // =====================================
                case 'win_with_squad': {
                    if (!isWin || !mission.condition.targetKeys || mission.condition.targetKeys.length === 0) break;
                    const required = mission.condition.requiredCopies ?? 1;
                    const deckEvent = logs.find(l => l.type === 'deck_list') as DeckListLogEvent | undefined;
                    const carried = new Map<string, number>();
                    (deckEvent?.cardKeys || []).forEach(k => carried.set(k, (carried.get(k) || 0) + 1));
                    const allCarried = mission.condition.targetKeys.every(k => (carried.get(k) || 0) >= required);
                    if (allCarried) added += 1;
                    break;
                }
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

    // ==========================================
    // [2026-08-29 评估嘉勉] 肉鸽对局结算直接累加（不走 gameLogger 日志）
    //   按"完成 1 场（任意结局）/ 通关 1 次"更新 rogue_run / rogue_win 条件任务
    // ==========================================
    const recordRogueRun = useCallback((info: { won: boolean; elites?: number; enhancements?: number; events?: number; gold?: number }): MissionUpdateResult[] => {
        if (!userId || !isReady) return [];
        const updates: MissionUpdateResult[] = [];
        const newProgress = { ...progress };
        let hasUpdates = false;

        MISSIONS.forEach(mission => {
            // [2026-08-30] 按条件类型处理：肉鸽专属任务 + 外部版本任务（用 rogue_* 条件的都入账）
            const t = mission.condition.type;
            if (t !== 'rogue_run' && t !== 'rogue_win' && t !== 'rogue_elite' && t !== 'rogue_enhance' && t !== 'rogue_event' && t !== 'rogue_gold') return;
            const prog = newProgress[mission.id];
            if (!prog || prog.status !== 'ongoing') return;
            let add = 0;
            if (t === 'rogue_run') add = 1;
            else if (t === 'rogue_win') add = info.won ? 1 : 0;
            else if (t === 'rogue_elite') add = info.elites ?? 0;
            else if (t === 'rogue_enhance') add = info.enhancements ?? 0;
            else if (t === 'rogue_event') add = info.events ?? 0;
            else if (t === 'rogue_gold') add = info.gold ?? 0;
            if (add <= 0) return;
            prog.current = Math.min(prog.current + add, prog.target);
            const justCompleted = prog.current >= prog.target;
            if (justCompleted) { prog.status = 'completed'; prog.sort = 0; }
            updates.push({
                missionId: mission.id, addedAmount: add,
                current: prog.current, target: prog.target,
                justCompleted, title: mission.title,
            });
            hasUpdates = true;
        });

        if (hasUpdates) {
            setProgress(newProgress);
            localStorage.setItem(`sbr_mission_prog_${userId}`, JSON.stringify(newProgress));
        }
        return updates;
    }, [userId, progress, isReady]);

    return {
        isReady,
        progress,
        hasClaimableReward,
        hasRogueClaimableReward,
        scanLogs,
        claimReward,
        recordRogueRun
    };
};