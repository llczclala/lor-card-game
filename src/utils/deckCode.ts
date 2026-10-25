// ==========================================
// 卡组码 · 业务层
// [2026-10-24 莉莉子 · 卡组码]
//
// 分工：
//   `utils/deckCodec.ts` —— **纯算法**（Base32 / CRC / 线格式），零业务依赖，可被 node 单独跑自证
//   本文件             —— **业务规则**（40 张 / 天启者 ≤6 / 张数 1~3）+ 启动期 ID 登记表自检
//
// 调用方一律从**本文件** import（它 re-export 了 codec 的全部 API），
// 这样将来若要再拆一次，外部代码不用跟着改。
// ==========================================

import { CARD_DB } from '../data/cards';
import {
    DECK_CODE_CARD_IDS,
    DECK_CODE_CARD_KEYS,
    getDeckCodeCardId,
} from '../data/deckCodeCardIds';
import { MAX_COPIES, deckTotalCards } from './deckCodec';

export * from './deckCodec';

// ══════════════════════════════════════════════════════════════════════════
// 卡组规则校验
// ══════════════════════════════════════════════════════════════════════════

/** 卡组里的天启者张数（规则：**合计**最多 6 张，不是每位 6 张） */
export const deckChampionCount = (cards: Record<string, number>): number =>
    Object.entries(cards).reduce(
        (sum, [key, n]) => (n > 0 && CARD_DB[key]?.isChampion ? sum + n : sum),
        0,
    );

export interface DeckShapeOk {
    ok: true;
}
export interface DeckShapeFail {
    ok: false;
    reason: 'total' | 'champions' | 'unknown-card' | 'count';
    message: string;
}
export type DeckShapeValidation = DeckShapeOk | DeckShapeFail;

/**
 * 卡组**结构**是否合法 —— 只管规则，**不管玩家有没有这些卡**。
 *
 * 为什么落地前必须过一遍：码是外部输入，可能被手工篡改，也可能来自规则不同的版本。
 * 校验顺序按"越致命越靠前"：未知卡 → 张数 → 总数 → 天启者。
 */
export function validateDeckShape(cards: Record<string, number>): DeckShapeValidation {
    for (const [key, n] of Object.entries(cards)) {
        const data = CARD_DB[key];
        if (!data) {
            return { ok: false, reason: 'unknown-card', message: `未知卡牌：${key}` };
        }
        if (n < 1 || n > MAX_COPIES) {
            return { ok: false, reason: 'count', message: `「${data.name}」张数不合法（${n} 张）` };
        }
    }

    const total = deckTotalCards(cards);
    if (total !== 40) {
        return { ok: false, reason: 'total', message: `卡组应为 40 张，这串码是 ${total} 张` };
    }

    const champions = deckChampionCount(cards);
    if (champions > 6) {
        return { ok: false, reason: 'champions', message: `天启者合计 ${champions} 张，超过 6 张上限` };
    }

    return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════
// 启动期自检（仅开发模式）
// ── 目的：ID 登记表与 CARD_DB 一旦不同步，**宁可在开发期把问题喊出来**，
//    也不要让做出来的码在玩家之间静默解错。
// ── 用 console.error 而不是 throw：这属于"数据维护疏漏"，
//    不该让玩家侧白屏；但开发控制台必须显眼。
// ══════════════════════════════════════════════════════════════════════════

// ⚠️ 刻意**不套** `if (import.meta.env.DEV)`：
//   本项目的"开发运行"是 `npm run electron:dev` = `vite build && electron`（**生产构建**），
//   `DEV` 恒为 false ⇒ 放进 DEV 守卫里等于**永远不跑**。
//   这个坑已经踩过一次：38 张带引号的 key 没登记，没有任何地方报警，
//   直到玩家点导出才炸出「未登记的卡牌 key」。
//   代价只是一次 `Object.keys` + 两百来项比对（模块加载时一次），完全值得。
{
    const missing = Object.keys(CARD_DB).filter(k => getDeckCodeCardId(k) === undefined);
    if (missing.length > 0) {
        console.error(
            '[deckCode] 以下卡牌缺少卡组码 ID 登记（请追加到 data/deckCodeCardIds.ts 末尾）：',
            missing,
        );
    }

    const ids = Object.values(DECK_CODE_CARD_IDS);
    const dupIds = Array.from(new Set(ids.filter((id, i) => ids.indexOf(id) !== i)));
    if (dupIds.length > 0) {
        console.error('[deckCode] 卡组码 ID 重复分配：', dupIds);
    }

    // 反向表必须覆盖所有已分配 ID，否则解码会出现"有 ID 没 key"
    const broken = Object.entries(DECK_CODE_CARD_IDS).filter(
        ([key, id]) => DECK_CODE_CARD_KEYS[id] !== key,
    );
    if (broken.length > 0) {
        console.error('[deckCode] 反向表不一致：', broken.slice(0, 10));
    }

    // 已下架的卡保留 ID 是**预期行为**（不复用），只提示
    const retired = Object.keys(DECK_CODE_CARD_IDS).filter(k => !CARD_DB[k]);
    if (retired.length > 0) {
        console.info('[deckCode] 登记表中含已不在 CARD_DB 的卡（ID 已保留、不复用）：', retired);
    }
}
