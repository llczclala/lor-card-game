// ==========================================
// 悖论迷宫 · 敌方迷宫BUFF（门面）
// [2026-08-11 莉莉子] 门面化：敌人侧从统一库 buffs.ts 过滤 enemyEligible 派生。
// 保留既有导出名（EnemyBuff / ENEMY_BUFFS），兼容历史引用。
// 实际使用：NodePreviewPanel 改读节点预分配的实际携带（node.enemyBuffs → getBuffById），
// 流派可携带库由 EnemyDeckEditor 配置（archetype.rogueBuffs）。
// ==========================================

import { MAZE_BUFFS, type MazeBuff } from './buffs';

export type EnemyBuff = Pick<MazeBuff, 'id' | 'name' | 'description' | 'rarity' | 'icon'>;

// 敌人侧可配置 = enemyEligible 的强化（全量注册表）
export const ENEMY_BUFFS: Record<string, EnemyBuff> = Object.fromEntries(
    MAZE_BUFFS.filter(b => b.enemyEligible).map(b => [b.id, b]),
);
