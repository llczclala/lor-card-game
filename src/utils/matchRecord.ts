/**
 * [2026-11-19 莉莉子 · 编排层分区 L1] 对局操作记录的**纯写入函数**。
 *
 * 从 `useGameState.ts` 的 `recordAction` 里把「怎么往 `gameRecords` 里追加一条」抽出来。
 * 留在 hook 里的只剩「自增 id + 调 setGame」三行 —— 那部分必须持有 ref，搬不走；
 * 而**结构构造**是纯的，抽出来之后可以单独测（给定 prev + 一条记录 ⇒ 得到什么）。
 *
 * 口径与搬家前**逐字一致**：`turn` 取写入那一刻的 `prev.round`，字段顺序无关紧要。
 */
import type { GameState, GameRecordCategory, RecordEntity } from '../types';

export interface GameRecordInput {
    /** 记录 id（由调用方自增生成，形如 `rec-12`） */
    id: string;
    category: GameRecordCategory;
    owner: 'player' | 'enemy';
    summary: string;
    cardKey?: string;
    detail?: string;
    entities?: RecordEntity[];
}

/** 往 `gameRecords` 追加一条操作记录（返回新 state，不改入参） */
export const appendGameRecord = (prev: GameState, rec: GameRecordInput): GameState => ({
    ...prev,
    gameRecords: [
        ...prev.gameRecords,
        {
            id: rec.id,
            turn: prev.round,
            owner: rec.owner,
            category: rec.category,
            summary: rec.summary,
            cardKey: rec.cardKey,
            detail: rec.detail,
            entities: rec.entities,
        },
    ],
});
