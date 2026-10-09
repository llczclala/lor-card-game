import type { UserSettings } from '../types'; // [2026-08-16] DEFAULT_SETTINGS 显式注解，根治 useUserSystem 类型债
import { CARD_DB } from './cards';
import { SKIN_IMAGES } from './imageData'; // [皮肤] 用于构建全皮肤数据
import { COSMETIC_REGISTRY } from './skinData'; // [2026-09-18] 全解锁列表改为从注册表推导（不再手写）

/**
 * 初始用户数据模板
 * 定义了新用户默认拥有的资产、设置和卡组。
 */

// --- 1. 默认设置 ---
export const DEFAULT_SETTINGS: UserSettings = {
    volume: {
        bgm: 0.5,
        sfx: 0.6,
        voice: 0.8,
        movie: 1.0 // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 补上「过场」通道（原先缺字段 ⇒ 滑块初值 undefined）
    },
    customization: {
        currentCardBackIndex: 0,
        currentDeskIndex: 0
    },
    // 默认解锁的装饰品索引列表
    unlockedCardBacks: [0],
    unlockedDesks: [0],
    videoResolution: '1k', // [新增] 默认 1k
    lastSeenAnnouncementVersion: '', // [2026-08-09] 已读公告版本（空=从未看过，进大厅自动弹公告）
    skipGameStartDrawAnimation: false, // 默认播放开局抽卡动画
    skipLevelupMovie: false,           // 默认播放升级影片
    skipVictoryMovie: false,           // 默认播放胜利影片
    deskDynamic: false,                // [2026-08-13] 默认静态牌桌
    heroDynamic: false,                // [2026-08-16] 默认静态卡面（对局内英雄卡动态视频需玩家手动开启）
    cardBackDynamic: false,            // [2026-08-23] 默认静态卡背（动态卡背视频需玩家手动开启）
    spellDynamic: false,               // [2026-09-26] 默认静态法术/单位卡面（动态视频需玩家手动开启）
};

// --- 2. 卡牌收藏定义 ---

// 辅助：获取所有卡牌 ID
const allCardKeys = Object.keys(CARD_DB);

// [皮肤] 从 SKIN_IMAGES 构建全皮肤数据
const buildFullSkins = (): Record<string, number[]> => {
    const result: Record<string, number[]> = {};
    for (const [cardKey, skinMap] of Object.entries(SKIN_IMAGES)) {
        result[cardKey] = Object.keys(skinMap).map(Number).sort((a, b) => a - b);
    }
    return result;
};

// 方案 A: 全卡全满 (开发/测试模式)
// 给予所有卡牌各 3 张，无限资源
export const FULL_COLLECTION = {
    ownedCards: allCardKeys.reduce((acc, key) => {
        acc[key] = 3;
        return acc;
    }, {} as Record<string, number>),

    ownedSkins: buildFullSkins(), // [皮肤] 全皮肤

    resources: {
        silverCoin: 99999, // [新增] 无限银币
        dataGold: 99999,
        bitGold: 99999
    }
};

// [皮肤] 全卡档专用设置：解锁所有卡背和棋盘
// [2026-09-18] 改为从 COSMETIC_REGISTRY **动态推导**。
//   此前是手写死的数组（卡背 0~16 / 牌桌 0~9），每加一款新资产都要手工同步，
//   已经漏过两次：新池卡背 17~19、新牌桌 11~15 都没进列表 → 开发者号还得自己抽。
//   推导后新增资产自动纳入，不会再漏。
//   注：索引 0 是「默认款」，注册表里没有对应条目，需手动补。
const collectIndices = (type: 'cardBack' | 'desk'): number[] =>
    [0, ...COSMETIC_REGISTRY.filter(i => i.type === type && i.index !== undefined).map(i => i.index as number)]
        .sort((a, b) => a - b);

export const FULL_SETTINGS = {
    ...DEFAULT_SETTINGS,
    unlockedCardBacks: collectIndices('cardBack'), // 全卡背（含任务/商店款）
    unlockedDesks: collectIndices('desk'),         // 全牌桌
};

// 方案 B: 新手初始收藏 (正式上线模式)
// 仅给予英雄和部分基础单位
const STARTER_KEYS = [
    // --- 英雄 ---
    'lyfe', 'fenny',

    // --- 基础法术 (Lyfe) ---
    'single_combat', 'prayer', 'focus',
    'lyfe_support',             // [2026-10-03] 冻沙激流（3 费极速）—— 里芙组第 4 张法术，补足 40 张构筑
    // --- 基础法术 (Fenny) ---
    'hidden_arrow', 'inspire', 'destruction',
    'fenny_support',            // [2026-10-03] 激励之声（4 费快速）—— 芬妮组第 4 张法术

    // --- 1费 基础单位 ---
    'Messenger_Squad_Ah_Hua',   // 信使-阿花
    'Ghost_Squad_Antina',       // 鬼怪-安提娜
    'Argo_Squad_Pigeon',        // 阿尔戈-鸽子
    'Typhoon_Squad_Flameheart', // 堤丰-焰心（2 费）
    'Ulster_Squad_Koni',        // 阿尔斯特-科尼 (再生)
    'Mingyi_Squad_Zhe_hao',     // 明夷-赭毫 (魔免)

    // --- 2-3费 中坚力量 ---
    'Messenger_Squad_Gena',     // 信使-格娜（2 费）
    'Ghost_Squad_Vez',          // 鬼怪-薇兹（2 费）
    'Argo_Squad_Musician',      // 阿尔戈-乐手（4 费）
    'Dream_Guardians_Squad_Martina', // 守梦人-玛蒂娜 (坚韧)

    // --- 4+费 大哥单位 ---
    'Typhoon_Squad_Dornier',    // 堤丰-多尼尔（4 费，反伤+再生）
    'Ghost_Squad_Valen',        // 鬼怪-瓦莲（5 费，凶恶大哥）
    'Mingyi_Squad_Jin_Lang'     // 明夷-金琅（4 费，强力盾牌）
];

export const STARTER_COLLECTION = {
    ownedCards: STARTER_KEYS.reduce((acc, key) => {
        // 确保 key 存在于 DB 中才添加，防止脏数据
        if (CARD_DB[key]) {
            // ==========================================
            // [2026-10-03 程拍板] 新手资产改为「**足以填满两套 40 张预设卡组**」
            // ── 旧口径：「英雄仅 1 张，其余普通卡 2 张 …… 刚好 40 张，**极大激发抽卡欲望**」
            //    ⇒ 后果：构筑规则要求**恰好 40 张**（DeckBuilder 的 `stats.total !== 40` 闸门），
            //      而每种只有 2 张、上限却是 3 张 ⇒ **新手根本凑不出一套合法卡组**
            //      （连"里芙单独一套"最多也只有 1 + 38 = 39 张，永远差 1 张）
            //      ⇒ 粉丝反馈的「一上来 PVE 没有一套完整的新手卡组使用」，根因就在这里。
            // ── 新口径（程原话：「我们不需要在这里诱导抽卡了，新手没有新的天启者自然会去抽卡」）：
            //      · 英雄仍然 **×1** —— 想要第二张天启者，自然去抽卡（这才是抽卡动机）
            //      · 其余基础卡 **×3**（= 构筑单卡上限）⇒ 卡组可以把每种放满 3 张
            //      ⇒ 收藏 = 2×1 + 21×3 = **65 张**（23 种）
            // ==========================================
            const isHero = CARD_DB[key].isChampion;
            acc[key] = isHero ? 1 : 3;
        }
        return acc;
    }, {} as Record<string, number>),

    ownedSkins: {}, // [皮肤] 暂不预设皮肤 (完全纯净的初始号)

    resources: {
        silverCoin: 500000, // [新增] 初始给予 5000 通用银，方便前期合成
        dataGold: 160000,
        bitGold: 0
    }
};

// --- 3. 预设卡组 (Starter Decks) ---

// 卡组 1: 里芙·战术突击 (Lyfe Midrange)
// [2026-10-03 程拍板] 由 15 张 → **40 张**（填满构筑上限）。
//   结构 = 英雄 ×1 + 13 种 ×3 = 40（正好用满"单卡上限 3 张"）。
//   曲线：1 费 12 / 2 费 13 / 3 费 3 / 4 费 12 —— 低费铺场 + 中费大哥，偏中速。
export const STARTER_DECK_LYFE = {
    id: 'starter_deck_lyfe',
    name: '里芙：战术突击',
    hero: 'lyfe',
    cards: {
        'lyfe': 1,                          // 英雄（2 费）

        // ── 里芙阵营法术 ×4 种 ×3 ──
        'prayer': 3,                        // 1 费 慢速
        'single_combat': 3,                 // 2 费 快速
        'lyfe_support': 3,                  // 3 费 极速（冻沙激流）
        'focus': 3,                         // 4 费 慢速

        // ── 单位 ×9 种 ×3 ──
        'Messenger_Squad_Ah_Hua': 3,        // 1 费
        'Argo_Squad_Pigeon': 3,             // 1 费
        'Dream_Guardians_Squad_Martina': 3, // 1 费（坚韧）
        'Messenger_Squad_Gena': 3,          // 2 费
        'Typhoon_Squad_Flameheart': 3,      // 2 费
        'Ghost_Squad_Vez': 3,               // 2 费
        'Argo_Squad_Musician': 3,           // 4 费
        'Typhoon_Squad_Dornier': 3,         // 4 费（反伤+再生）
        'Mingyi_Squad_Jin_Lang': 3,         // 4 费（强力盾牌）
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
};

// 卡组 2: 芬妮·黄金狂热 (Fenny Aggro)
// [2026-10-03 程拍板] 由 15 张 → **40 张**（填满构筑上限）。
//   结构同上 = 英雄 ×1 + 13 种 ×3 = 40。
//   曲线：1 费 12 / 2 费 10 / 4 费 12 / 5 费 6 —— 低费压制 + 凶恶大哥，偏快攻。
export const STARTER_DECK_FENNY = {
    id: 'starter_deck_fenny',
    name: '芬妮：黄金狂热',
    hero: 'fenny',
    cards: {
        'fenny': 1,                         // 英雄（2 费）

        // ── 芬妮阵营法术 ×4 种 ×3 ──
        'hidden_arrow': 3,                  // 1 费 极速（暗箭）
        'fenny_support': 3,                 // 4 费 快速（激励之声）
        'destruction': 3,                   // 4 费 慢速
        'inspire': 3,                       // 5 费 慢速

        // ── 单位 ×9 种 ×3 ──
        'Ghost_Squad_Antina': 3,            // 1 费
        'Ulster_Squad_Koni': 3,             // 1 费（再生）
        'Mingyi_Squad_Zhe_hao': 3,          // 1 费（魔免）
        'Messenger_Squad_Gena': 3,          // 2 费
        'Typhoon_Squad_Flameheart': 3,      // 2 费
        'Ghost_Squad_Vez': 3,               // 2 费
        'Argo_Squad_Musician': 3,           // 4 费
        'Typhoon_Squad_Dornier': 3,         // 4 费（反伤+再生）
        'Ghost_Squad_Valen': 3,             // 5 费（凶恶大哥）
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
};

// 导出卡组列表
export const INITIAL_USER_DECKS = [
    STARTER_DECK_LYFE,
    STARTER_DECK_FENNY
];

// ==========================================================================
// [2026-10-03 莉莉子 · 程拍板] **存量号迁移：两套初始卡组 15 张 → 40 张**
//
// ── 为什么需要迁移：`STARTER_COLLECTION` / `INITIAL_USER_DECKS` **只在账号首次初始化时写入**
//    （`useUserSystem` 的 `if (!userCollection)` / `if (!userDecks)` 分支）
//    ⇒ 卡组改成 40 张后，**已注册的账号拿不到新版**，卡组界面仍是 `15 / 40` +「等待构建卡组」。
//
// ── 口径（程原话：「与其做『登录迁移里静默补两套卡组』，不如**直接把已有的两套初始卡组替换或者补满**，
//    毕竟只要玩家没有删除过卡组，这两套卡组应该是谁都有的」）
//      ⇒ **不补发新卡组**，只**就地升级**那两套（按 id 认）。
//      ⇒ 玩家**删除过**的卡组不会被复活（尊重玩家意图）。
//
// ── 判定「玩家改过没有」用**逐项比对旧的 15 张**——不能只看张数：
//    玩家完全可能自己改成另一套 15 张的卡组。
// ==========================================================================
export const STARTER_DECK_LEGACY: Record<string, Record<string, number>> = {
    starter_deck_lyfe: {
        'lyfe': 1, 'single_combat': 2, 'prayer': 2, 'focus': 2,
        'Messenger_Squad_Ah_Hua': 2, 'Messenger_Squad_Gena': 2,
        'Argo_Squad_Pigeon': 2, 'Argo_Squad_Musician': 2,
    },
    starter_deck_fenny: {
        'fenny': 1, 'hidden_arrow': 2, 'inspire': 2, 'destruction': 2,
        'Ghost_Squad_Antina': 2, 'Ghost_Squad_Vez': 2,
        'Typhoon_Squad_Flameheart': 2, 'Typhoon_Squad_Dornier': 2,
    },
};

/** 卡组总张数 */
const deckTotal = (cards: Record<string, number>): number =>
    Object.values(cards).reduce((s, n) => s + n, 0);

/** 逐项相同（键集合与数量都一致） */
const sameCards = (a: Record<string, number>, b: Record<string, number>): boolean => {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => a[k] === b[k]);
};

type MigratableDeck = { id: string; cards: Record<string, number>; updatedAt?: number };

/**
 * 把**已有的**两套初始卡组升级到 40 张。规则（三条，只增不删）：
 *   ① **未改动**（与旧 15 张逐项一致）⇒ **整份替换**为新预设 40 张
 *   ② **玩家改过**且已满 40 ⇒ **不动**（他自己已经补满了）
 *   ③ **玩家改过**但仍不满 40 ⇒ **补满**：按新预设把缺的补上（每种封顶单卡上限 3、总数封顶 40），
 *      **绝不删除玩家已有的卡**；若补不到 40（卡池被他改得对不上）⇒ **宁可不改，保持原样**
 * 无任何变化时**返回同一引用**（与项目既有"不制造无谓 re-render"一致）。
 */
export const migrateStarterDecks = <T extends MigratableDeck>(decks: T[]): T[] => {
    const presetOf: Record<string, Record<string, number>> = {
        starter_deck_lyfe: STARTER_DECK_LYFE.cards,
        starter_deck_fenny: STARTER_DECK_FENNY.cards,
    };
    let changed = false;

    const next = decks.map(d => {
        const preset = presetOf[d.id];
        const legacy = STARTER_DECK_LEGACY[d.id];
        if (!preset || !legacy || !d.cards) return d;                     // 不是这两套 → 不动

        // ① 未改动 → 替换成新的 40 张
        if (sameCards(d.cards, legacy)) {
            changed = true;
            return { ...d, cards: { ...preset }, updatedAt: Date.now() } as T;
        }

        // ② 玩家改过且已满/超 40 → 不动
        if (deckTotal(d.cards) >= 40) return d;

        // ③ 玩家改过但仍不满 → 补满（只加不删）
        const merged: Record<string, number> = { ...d.cards };
        for (const [k, want] of Object.entries(preset)) {
            const room = 40 - deckTotal(merged);
            if (room <= 0) break;
            const cur = merged[k] ?? 0;
            const add = Math.min(want - cur, 3 - cur, room);
            if (add > 0) merged[k] = cur + add;
        }
        if (deckTotal(merged) === 40) {
            changed = true;
            return { ...d, cards: merged, updatedAt: Date.now() } as T;
        }
        return d;                                                          // 补不满 → 宁可不改
    });

    return changed ? next : decks;
};

// --- 4. 用户档案生成器 ---
export const createInitialProfile = (userId: string) => ({
    uid: userId,
    displayName: `分析员#${userId.slice(-4).toUpperCase()}`,
    level: 1,
    exp: 0,
    avatarId: 'lyfe',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),

    // [新增] 抽卡核心数据字段
    pityCounter: 0,      // 当前垫了多少抽 (100抽保底)
    skinPityCounter: 0,  // [核心新增] 皮肤保底计数器 (30抽保底)
    gachaTarget: null    // 当前定轨目标 (例如 "hero:lyfe")
});

// --- 5. 开发者/管理员专属标识 ---
// 这是整个系统的最高权限通行证，认准这个 UID 即可发卡发资源
export const DEV_ADMIN_UID = 'dev_full_admin';

// 预设好管理员的名片模板，避免每次生成时还要再去覆写
export const DEV_ADMIN_PROFILE = {
    ...createInitialProfile(DEV_ADMIN_UID),
    displayName: 'DEVELOPER (全卡测试)',
    avatarId: 'lyfe',
};