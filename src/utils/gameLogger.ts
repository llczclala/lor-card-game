/**
 * ==============================================================================
 * 《Snowbreak Rivals》 战术审计黑匣子 (Game Logger)
 * ==============================================================================
 * 职责：
 * 1. 独立于 React 渲染周期，静默收集局内发生的所有关键战术事件。
 * 2. 避免引起组件重绘（Re-render），保证战斗帧率极致丝滑。
 * 3. 在对局结算时，将打包好的审计日志输出给任务大脑 (Mission System)。
 * ==============================================================================
 */

// ==========================================
// 1. 结构化日志类型定义 (Event Types)
// ==========================================

export type LogActionType =
    | 'play_card'      // 打出卡牌 (用于普通卡牌皮肤解锁任务)
    | 'attack'         // 发起攻击 (用于里芙卡背任务)
    | 'nexus_damage'   // 对水晶造成伤害 (用于芬妮卡背任务)
    | 'damage_dealt'   // 造成伤害 (用于莲驱臆莲基座累计伤害任务)
    | 'level_up'       // 英雄升级 (用于卜卜卡背任务)
    | 'game_end';      // 对局结束 (用于每日/每周活跃任务)

// 基础事件结构
export interface BaseLogEvent {
    type: LogActionType;
    turn: number;            // 发生回合
    timestamp: number;       // 物理时间戳
    isPlayerSide: boolean;   // 是否是我方(玩家)触发的行为 (任务系统通常只关心玩家行为)
}

// 派生事件结构：打出卡牌
export interface PlayCardLogEvent extends BaseLogEvent {
    type: 'play_card';
    cardKey: string;
}

// 派生事件结构：发起攻击
export interface AttackLogEvent extends BaseLogEvent {
    type: 'attack';
    cardKey: string;
}

// 派生事件结构：水晶伤害
export interface NexusDamageLogEvent extends BaseLogEvent {
    type: 'nexus_damage';
    sourceCardKey: string;   // 造成伤害的来源实体
    amount: number;          // 伤害数值
}

// 派生事件结构：单位/技能造成伤害 (用于臆莲基座累计伤害等任务)
export interface DamageDealtLogEvent extends BaseLogEvent {
    type: 'damage_dealt';
    sourceCardKey: string;   // 造成伤害的来源实体
    amount: number;          // 总伤害数值 (单次结算)
}

// 派生事件结构：英雄升级
export interface LevelUpLogEvent extends BaseLogEvent {
    type: 'level_up';
    cardKey: string;
}

// 派生事件结构：对局结束
export interface GameEndLogEvent extends BaseLogEvent {
    type: 'game_end';
    result: 'win' | 'loss' | 'draw';
}

// 联合类型
export type LogEvent =
    | PlayCardLogEvent
    | AttackLogEvent
    | NexusDamageLogEvent
    | DamageDealtLogEvent
    | LevelUpLogEvent
    | GameEndLogEvent;

// 供外部调用的简易参数类型 (去除了自动生成的 timestamp)
// [2026-08-06 莉莉子] 修复：Omit 对 union 不分布会丢失判别字段，改用分布式条件类型
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type LogEventPayload = DistributiveOmit<LogEvent, 'timestamp'>;


// ==========================================
// 2. 黑匣子控制核心 (Logger Class)
// ==========================================

class GameLogger {
    private logs: LogEvent[] = [];

    /**
     * 写入一条战术事件日志
     * @param payload 事件载荷 (无需提供时间戳)
     */
    public logEvent(payload: LogEventPayload): void {
        const event: LogEvent = {
            ...payload,
            timestamp: Date.now()
        } as LogEvent;

        this.logs.push(event);

        // 开发模式下可选开启的隐秘调试流
        if (import.meta.env.DEV) {
            // console.debug(`[GameLogger] Logged: ${event.type}`, event);
        }
    }

    /**
     * 结算并清空黑匣子 (对局结束时由发奖中枢提取)
     * @returns 完整的本局结构化日志数组
     */
    public flushLogs(): LogEvent[] {
        const currentLogs = [...this.logs];
        this.logs = []; // 提取后立即销毁本地记录，释放内存
        return currentLogs;
    }

    /**
     * 强制物理清空日志 (通常用于玩家中途强退对局时的异常重置)
     */
    public clearLogs(): void {
        this.logs = [];
    }

    /**
     * 实时获取当前累积日志快照 (用于沙盒监控，不会清空数据)
     */
    public peekLogs(): LogEvent[] {
        return [...this.logs];
    }
}

// ==========================================
// 3. 导出唯一单例实例
// ==========================================
export const gameLogger = new GameLogger();