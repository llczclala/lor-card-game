// ==========================================
// 卡组码 · 编解码算法（**纯函数，零业务依赖**）
// [2026-10-24 莉莉子 · 卡组码]
//
// 本文件只用一张「卡牌 key → 数字 ID」登记表，**不 import CARD_DB**。
// 这样它才能在 node 里被单独加载跑自证（见 `_scratch/deckcode-selftest.cjs`），
// 而不是只能靠"我读了一遍觉得对"。
//
// 业务层（卡组规则校验、缺卡分析、启动自检）在 `deckCode.ts`。
//
// ── 为什么压成二进制而不是存 JSON ────────────────────────────────
//   卡牌 key 是字符串，最长 36 字符（`SacredChants_Squad_European_Angelica`），
//   平均 16.3 字符。20 种卡直接拼就是 300+ 字符，Base64 后约 435
//   ⇒ **超出项目自带二维码编码器的容量上限（v10-L = 274 字节）**。
//   压成数字 ID 后典型 77 字符、最坏 141 字符，二维码绰绰有余。
//
// ── 线格式（**全程字节对齐**）────────────────────────────────────
//   头 6 字节 = 48 bit：
//     4  format = 1
//     4  version = 1
//     12 heroCardId
//     8  cardBackIndex
//     8  boardIndex
//     8  种类数 N
//     4  保留（恒 0）
//   正文 N × 16 bit：
//     12 cardId
//     2  份数 - 1（0→1 张 / 1→2 张 / 2→3 张）
//     2  保留（恒 0）
//   CRC16（覆盖前面所有字节）2 字节
//
//   ⚠️ 每张卡用 16 bit 而不是 14 bit，是刻意的：
//      14 bit 会让「头+正文」不落在字节边界，CRC 得算在"补零后的字节"上，
//      而补几个零又取决于已读位置 ⇒ 编码端和解码端各写一遍同样的补零推理，
//      错一个 bit 只能靠 CRC 发现且难调试。16 bit 后全程字节对齐，
//      CRC 直接算"前 K 字节"，两端不可能不一致。代价只是长度多约 10 字符。
//
// ── 字母表为什么去掉 I / O / 0 / 1 ──────────────────────────────
//   卡组码会被贴进群聊、也 occasions 被手抄。`0/O`、`1/I` 在多数无衬线字体里
//   几乎一样 ⇒ 抄错一个字符整串作废。去掉这 4 个后正好剩 32 个
//   （A-Z 去 I/O 共 24 + 2-9 共 8），既满足 Base32 又天然抗误读。
// ==========================================

import {
    DECK_CODE_CARD_IDS,
    getDeckCodeCardId,
    getDeckCodeCardKey,
} from '../data/deckCodeCardIds';

// ══════════════════════════════════════════════════════════════════════════
// 常量
// ══════════════════════════════════════════════════════════════════════════

/**
 * 前缀 —— 认不出就直接拒，避免把存档信封（`sbr-save`）之类当成卡组码吃进来。
 *
 * ⚠️ 刻意**只含字母表内的字符**、**不带版本数字**：
 *   最初写的是 `SBD1`，但那个 `1` 不在防误读字母表里 ⇒ 玩家手抄时抄成 `I`，
 *   解码只会报"这不是卡组码"，白挨一次挫折。
 *   版本信息本来就在二进制头的 4 bit version 里，前缀重复一遍反而多一个出错点。
 */
export const DECK_CODE_PREFIX = 'SBD';

/** Base32 字母表（**顺序即取值 0~31**，动它等于让所有旧码失效） */
const DECK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const DECK_CODE_FORMAT = 1;
const DECK_CODE_VERSION = 1;

const HEADER_BYTES = 6;
const CARD_BYTES = 2;
const CRC_BYTES = 2;

/** 一种卡组最多多少「种」卡（40 张全不同 = 40 种；上限给到 63 防越界） */
const MAX_CARD_KINDS = 63;
/** 单种卡最多几张（规则：一种最多 3 张） */
export const MAX_COPIES = 3;

// ══════════════════════════════════════════════════════════════════════════
// CRC16-CCITT（多项式 0x1021、初值 0xFFFF）
// ── 为什么需要：码会被手工抄写、被聊天软件截断、被 OCR 认错。
//    没有校验时一个字符错位会**静默解出另一套看起来正常的卡组**，
//    玩家会以为"作者发错码了"。有 CRC 就能当场拒绝。
// ══════════════════════════════════════════════════════════════════════════

export const crc16 = (bytes: Uint8Array): number => {
    let crc = 0xffff;
    for (const byte of bytes) {
        crc ^= byte << 8;
        for (let i = 0; i < 8; i++) {
            crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc & 0xffff;
};

// ══════════════════════════════════════════════════════════════════════════
// Base32（5 bit ↔ 1 字符）
// ══════════════════════════════════════════════════════════════════════════

export const base32Encode = (bytes: Uint8Array): string => {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of bytes) {
        buffer = (buffer << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += DECK_CODE_ALPHABET[(buffer >> bits) & 0x1f];
        }
    }
    if (bits > 0) out += DECK_CODE_ALPHABET[(buffer << (5 - bits)) & 0x1f];
    return out;
};

export const base32Decode = (text: string): Uint8Array | null => {
    const out: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const ch of text) {
        const value = DECK_CODE_ALPHABET.indexOf(ch);
        if (value < 0) return null;
        buffer = (buffer << 5) | value;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((buffer >> bits) & 0xff);
        }
    }
    return new Uint8Array(out);
};

// ══════════════════════════════════════════════════════════════════════════
// 失败原因（UI 据此给不同提示，不要都弹"卡组码无效"）
// ══════════════════════════════════════════════════════════════════════════

export type DeckCodeErrorKind =
    | 'empty' | 'prefix' | 'alphabet' | 'truncated' | 'format'
    | 'version' | 'checksum' | 'card-count' | 'kind-count' | 'unknown-card';

/** UI 直接拿去用的中文说明（集中一处，避免各界面措辞漂移） */
export const DECK_CODE_ERROR_TEXT: Record<DeckCodeErrorKind, string> = {
    empty: '没有检测到卡组码',
    prefix: '这不是卡组码（应以 SBD 开头）',
    alphabet: '卡组码含有无法识别的字符，可能抄错了',
    truncated: '卡组码不完整，可能被截断了',
    format: '无法识别的卡组码格式',
    version: '这串卡组码来自更新版本的游戏，请先更新',
    checksum: '卡组码校验失败，可能抄错了或没有复制完整',
    'card-count': '卡组码里有一张卡的张数不合法',
    'kind-count': '卡组码里记录的卡牌种类数不合法',
    'unknown-card': '卡组码里含有当前版本不存在的卡牌',
};

export interface DeckCodeDecoded {
    hero: string;
    cards: Record<string, number>;
    cardBackIndex: number;
    boardIndex: number;
}

export interface DeckCodeDecodeSuccess extends DeckCodeDecoded {
    ok: true;
}

export interface DeckCodeDecodeFailure {
    ok: false;
    kind: DeckCodeErrorKind;
    /** 原始补充信息（只用于日志，不要直接给玩家看） */
    detail?: string;
}

export type DeckCodeDecodeResult = DeckCodeDecodeSuccess | DeckCodeDecodeFailure;

export interface DeckCodeInput {
    hero: string;
    cards: Record<string, number>;
    cardBackIndex?: number;
    boardIndex?: number;
}

// ══════════════════════════════════════════════════════════════════════════
// 编码
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把卡组编成码。
 * @throws 卡组里出现登记表没有的 key —— 这是**我们自己的 bug**，直接炸，
 *         不要默默生成一串解不回来的码。
 */
export function encodeDeckCode(input: DeckCodeInput): string {
    const heroId = getDeckCodeCardId(input.hero);
    if (heroId === undefined) throw new Error(`[deckCode] 未登记的英雄 key：${input.hero}`);

    const entries: Array<{ id: number; count: number }> = [];
    for (const [key, count] of Object.entries(input.cards)) {
        if (!count || count <= 0) continue;
        const id = getDeckCodeCardId(key);
        if (id === undefined) throw new Error(`[deckCode] 未登记的卡牌 key：${key}`);
        entries.push({ id, count: Math.min(count, MAX_COPIES) });
    }
    if (entries.length > MAX_CARD_KINDS) {
        throw new Error(`[deckCode] 卡牌种类过多：${entries.length}`);
    }
    // 排序 ⇒ 同一套卡组总产出同一个码（否则分享/比对会误以为改过）
    entries.sort((a, b) => a.id - b.id);

    const body = new Uint8Array(HEADER_BYTES + entries.length * CARD_BYTES);
    const view = new DataView(body.buffer);

    body[0] = (DECK_CODE_FORMAT << 4) | DECK_CODE_VERSION;
    view.setUint16(1, heroId & 0x0fff, false);   // 12 bit hero（高 4 bit 为 0 = 保留位）
    body[3] = (input.cardBackIndex ?? 0) & 0xff;
    body[4] = (input.boardIndex ?? 0) & 0xff;
    body[5] = entries.length & 0xff;

    for (let i = 0; i < entries.length; i++) {
        const { id, count } = entries[i];
        // 12 bit id + 2 bit (份数-1) + 2 bit 保留
        view.setUint16(HEADER_BYTES + i * CARD_BYTES, ((id & 0x0fff) << 4) | (((count - 1) & 0x03) << 2), false);
    }

    const crc = crc16(body);
    const full = new Uint8Array(body.length + CRC_BYTES);
    full.set(body, 0);
    full[body.length] = (crc >> 8) & 0xff;
    full[body.length + 1] = crc & 0xff;

    return DECK_CODE_PREFIX + base32Encode(full);
}

// ══════════════════════════════════════════════════════════════════════════
// 解码
// ══════════════════════════════════════════════════════════════════════════

/** 解析卡组码。**永不抛异常** —— 一切失败走返回值，UI 才能说人话。 */
export function decodeDeckCode(raw: string): DeckCodeDecodeResult {
    const text = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!text) return { ok: false, kind: 'empty' };
    if (!text.startsWith(DECK_CODE_PREFIX)) {
        return { ok: false, kind: 'prefix', detail: text.slice(0, 8) };
    }

    const bytes = base32Decode(text.slice(DECK_CODE_PREFIX.length));
    if (!bytes) return { ok: false, kind: 'alphabet' };
    if (bytes.length < HEADER_BYTES + CRC_BYTES) {
        return { ok: false, kind: 'truncated', detail: `len=${bytes.length}` };
    }

    const format = (bytes[0] >> 4) & 0x0f;
    const version = bytes[0] & 0x0f;
    if (format !== DECK_CODE_FORMAT) return { ok: false, kind: 'format', detail: `format=${format}` };
    if (version > DECK_CODE_VERSION) return { ok: false, kind: 'version', detail: `version=${version}` };

    const kinds = bytes[5];
    if (kinds > MAX_CARD_KINDS) return { ok: false, kind: 'kind-count', detail: `kinds=${kinds}` };

    const bodyLen = HEADER_BYTES + kinds * CARD_BYTES;
    const expected = bodyLen + CRC_BYTES;
    if (bytes.length < expected) {
        return { ok: false, kind: 'truncated', detail: `need=${expected} got=${bytes.length}` };
    }

    const want = (bytes[bodyLen] << 8) | bytes[bodyLen + 1];
    const got = crc16(bytes.subarray(0, bodyLen));
    if (want !== got) {
        return { ok: false, kind: 'checksum', detail: `want=${want.toString(16)} got=${got.toString(16)}` };
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const heroId = view.getUint16(1, false) >> 4;
    const hero = getDeckCodeCardKey(heroId);
    if (hero === undefined) return { ok: false, kind: 'unknown-card', detail: `heroId=${heroId}` };

    const cards: Record<string, number> = {};
    for (let i = 0; i < kinds; i++) {
        const value = view.getUint16(HEADER_BYTES + i * CARD_BYTES, false);
        const id = (value >> 4) & 0x0fff;
        const count = ((value >> 2) & 0x03) + 1;
        if (count > MAX_COPIES) return { ok: false, kind: 'card-count', detail: `count=${count}` };
        const key = getDeckCodeCardKey(id);
        if (key === undefined) return { ok: false, kind: 'unknown-card', detail: `cardId=${id}` };
        // 同一 ID 出现两次 ⇒ 码被改过 / 编码端有 bug，直接拒（否则静默叠加张数）
        if (cards[key] !== undefined) {
            return { ok: false, kind: 'card-count', detail: `duplicate=${key}` };
        }
        cards[key] = count;
    }

    return { ok: true, hero, cards, cardBackIndex: bytes[3], boardIndex: bytes[4] };
}

/** 卡组总张数 */
export const deckTotalCards = (cards: Record<string, number>): number =>
    Object.values(cards).reduce((sum, n) => sum + (n > 0 ? n : 0), 0);

/** 已登记的卡牌数量（自证 / 调试用） */
export const registeredCardIdCount = (): number => Object.keys(DECK_CODE_CARD_IDS).length;
