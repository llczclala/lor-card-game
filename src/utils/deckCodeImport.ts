// ==========================================
// 卡组码 · 导入分析（缺口计算）
// [2026-10-24 莉莉子 · 卡组码]
//
// ── 这里只做**纯计算**，不碰 UI、不碰存档 ────────────────────────────
//   「缺什么、缺几张、补齐要多少钱、能不能一键补齐」全部收敛成一次分析结果，
//   UI 只负责把结果画出来。这样"绿按钮三态"只有**一个**判据来源，
//   不会出现「按钮说能买、点下去说余额不足」这种自相矛盾。
//
// ── 🔴 最重要的一条：缺口是**派生态**，绝不存进 SavedDeck ──────────────
//   卡组落地后，玩家随时可能抽到缺的卡。如果把 `missing: 3` 写进卡组对象，
//   就会出现「已经抽到了但卡组仍标着缺卡、仍不能开局」——玩家会认为卡组坏了。
//   ⇒ 所有调用方都必须在**需要的那一刻**重新算一遍（本文件就是那个函数）。
// ==========================================

import { CARD_DB } from '../data/cards';
import { getCardPrice } from './gameRules';

/** 一张卡的缺口 */
export interface DeckGapEntry {
    key: string;
    /** 卡牌名（弹窗用图，但日志 / 无障碍文案 / 售罄提示需要文字） */
    name: string;
    /** 卡组要几张 */
    need: number;
    /** 玩家当前有几张 */
    have: number;
    /** 还缺几张（= need - have，恒 > 0） */
    short: number;
    /** 是不是天启者（数据银买不到，会让"一键补齐"整体不可用） */
    isChampion: boolean;
    /** 单张数据银价格；天启者为 0（不参与计价） */
    price: number;
}

export interface DeckGapAnalysis {
    /** 缺的卡（按缺得多的排前面） */
    missing: DeckGapEntry[];
    /** 总共缺几张 */
    totalShort: number;
    /** 用数据银补齐的总价（**不含**天启者） */
    totalPrice: number;
    /** 缺的卡里是否含天启者 —— 含则"一键补齐"整体不可用 */
    hasChampionShort: boolean;
    /** 是否完全齐了（= 可以直接开局） */
    complete: boolean;
}

/**
 * 算一套卡组相对玩家库存的缺口。
 *
 * ⚠️ 按**张数**算，不是按"有没有这张卡"算：
 *    玩家有 2 张、卡组要 3 张 ⇒ 缺 1 张（不是"缺这张卡"）。
 *    现有卡池那套 `ownedCount === 0` 的判据在这里不够用。
 */
export function analyzeDeckGap(
    cards: Record<string, number>,
    ownedCards: Record<string, number>,
): DeckGapAnalysis {
    const missing: DeckGapEntry[] = [];
    let totalShort = 0;
    let totalPrice = 0;
    let hasChampionShort = false;

    for (const [key, need] of Object.entries(cards)) {
        if (!need || need <= 0) continue;
        const have = ownedCards[key] ?? 0;
        if (have >= need) continue;

        const data = CARD_DB[key];
        const isChampion = !!data?.isChampion;
        const short = need - have;
        // 天启者固定走比特金（`ShopScreen.tsx:512-513`），这里不计入数据银总价
        const price = isChampion ? 0 : getCardPrice(data?.cost ?? 0);

        missing.push({
            key,
            name: data?.name ?? key,
            need,
            have,
            short,
            isChampion,
            price,
        });

        totalShort += short;
        if (isChampion) hasChampionShort = true;
        else totalPrice += price * short;
    }

    // 缺得多的排前面，同数量按名字稳定排序（避免每次渲染顺序抖动）
    missing.sort((a, b) => (b.short - a.short) || a.name.localeCompare(b.name));

    return {
        missing,
        totalShort,
        totalPrice,
        hasChampionShort,
        complete: missing.length === 0,
    };
}

/** 「一键补齐」按钮的三态 —— **UI 唯一的判据来源** */
export type DeckGapBuyState = 'champion-blocked' | 'affordable' | 'insufficient';

/**
 * @param silverCoin 玩家当前数据银
 *
 * 规则（2026-10-24 程拍板）：
 *   · 缺的卡里有天启者 → `champion-blocked`（按钮灰，文案改「缺少天启者卡牌」）
 *   · 无天启者 + 余额够 → `affordable`（可用，数字白色）
 *   · 无天启者 + 余额不够 → `insufficient`（**按钮也灰**，数字红色）
 *     ⚠️ 程的原话就是"买不起也是不可用的" —— 别做成"可点但会失败"。
 */
export function resolveDeckGapBuyState(
    analysis: DeckGapAnalysis,
    silverCoin: number,
): DeckGapBuyState {
    if (analysis.hasChampionShort) return 'champion-blocked';
    if (silverCoin >= analysis.totalPrice) return 'affordable';
    return 'insufficient';
}

/**
 * 这套卡组现在能不能开局（只看"卡是否齐"，不看张数是否 40）。
 * ⚠️ 调用方必须**每次实时调用**，不要缓存结果。
 */
export function isDeckPlayable(
    cards: Record<string, number>,
    ownedCards: Record<string, number>,
): boolean {
    return analyzeDeckGap(cards, ownedCards).complete;
}
