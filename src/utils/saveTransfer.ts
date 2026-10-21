/**
 * saveTransfer.ts —— 跨设备存档互通（PC ↔ 手机 · 局域网）· 地基层
 * ============================================================================
 * 这一层只管三件事，**不碰任何 UI、不碰网络**：
 *   ① 把「一个账号的游戏进度」**打包**成一个可传输的信封（`SavePack`）
 *   ② 校验并**解包**一个信封（防御式，见 §校验）
 *   ③ 把信封里的账号**装进本机**（新增/更新），并记录同步基线（用于判定"谁改过"）
 *
 * 📌 需求口径（2026-10-18 程定）：
 *   · 同步范围 = **只同步「游戏进度」**，不含设备相关设置
 *   · 首次同步**不覆盖**：PC 的号出现在手机上（标「PC」），手机的号出现在 PC 上（标「手游」）
 *   · 之后同步**只更新有变化的号**
 *   · 同一个号两边都改过 ⇒ **弹窗让玩家选保留哪个**（不在本层做，本层只负责"检出冲突"）
 *
 * 🔴 两个必须记住的坑（都写在代码里，别"顺手优化"掉）：
 *   1. **`settings` 不能整键同步**：它混着「音量/画质」这类设备项和「武装库存/通行证领取/肉鸽解锁」
 *      这类**硬进度**。整键搬 = 把手机音量搬到电脑；整键不搬 = 丢武装。
 *      ⇒ 必须按 `SYNCED_SETTINGS_FIELDS` 白名单**字段级**同步。
 *   2. **不能拿 `type` 字段做"来源标记"**：`type` 同时是加载语义开关
 *      （`useUserSystem.ts:159-188`，`mode==='full'` 会强制把收藏覆盖成满卡）。
 *      往 `starter|full` 里塞第三个值 ⇒ 同步来的号可能被误判满卡、收藏被覆盖。
 *      ⇒ 用**独立字段** `UserSummary.origin`。
 *
 * ⚠️ 本层**不做**的事（下一步再做）：
 *   · 局域网传输 / 二维码配对（`src/utils/saveSync/` 网络层）
 *   · 冲突弹窗 UI
 *   · HTTPS / 配对码
 */

import { StorageUtils, STORAGE_KEYS, type UserSummary } from './storageUtils';

// ══════════════════════════════════════════════════════════════════════════
// 格式常量
// ══════════════════════════════════════════════════════════════════════════

/** 信封魔数 —— 认不出这个字符串就一律拒绝（防止把别的东西当存档吃进去） */
export const SAVE_FORMAT = 'sbr-save';

/** 信封结构版本 —— 将来改形状时靠它做兼容分支 */
export const SAVE_FORMAT_VERSION = 1;

/** 账号来源标记。**本机原有账号 = `undefined`**（只有"外来户"才带标记） */
export type SaveOrigin = 'pc' | 'mobile';

// ══════════════════════════════════════════════════════════════════════════
// 要同步 / 绝不同步 的键
// ══════════════════════════════════════════════════════════════════════════

/**
 * 参与同步的**整键**（每项都会拼成 `${prefix}_${uid}`）。
 * ⚠️ 注意最后两个**不在 `STORAGE_KEYS` 里** —— 它们是散落在各 hook 里的裸字符串，
 *    写在这里而不是加进 `STORAGE_KEYS`，是为了**不动那个公共枚举**（少一个改动的面）。
 */
const SYNC_KEY_PREFIXES = [
    STORAGE_KEYS.USER_PROFILE,          // 账号档案（名字/头像/等级/经验）
    STORAGE_KEYS.USER_ASSETS,           // 收藏（卡牌/皮肤/货币）
    STORAGE_KEYS.USER_DECKS,            // 卡组
    STORAGE_KEYS.ANALYST_PASS,          // 评估嘉勉通行证（等级/经验）
    STORAGE_KEYS.USER_BATTLE_RECORD,    // 战绩
    STORAGE_KEYS.ROGUE_HERO_PROGRESS,   // 肉鸽 · 天启者等级/经验
    STORAGE_KEYS.ROGUE_ARMAMENT,        // 肉鸽 · 武装槽配置
    STORAGE_KEYS.ROGUE_ARMAMENT_QUALITY,// 肉鸽 · 武装品质档
    STORAGE_KEYS.ROGUE_DIVINITY,        // 肉鸽 · 神格神经
    'sbr_mission_prog',                 // 任务进度（`useMissionSystem.ts:102`）
    'tutorial_completed_stages',        // 教程完成关卡（`tutorialProgress.ts:19`）
] as const;

/**
 * 明确**不**同步的键 —— 写成表只为把"为什么不动"记在代码里。
 * 以后有人想"顺手全同步"时，这里会拦住他。
 * （用数组而不是对象：`STORAGE_KEYS.x` 是 `string` 类型，做对象计算键会踩 TS 的字面量要求）
 */
const NEVER_SYNCED: ReadonlyArray<readonly [key: string, why: string]> = [
    [STORAGE_KEYS.USER_SETTINGS, '设置混着设备项（音量/画质/开关）⇒ 走字段级白名单，不整键搬'],
    [STORAGE_KEYS.ROGUE_PENDING_RUN, '未结算的肉鸽局 —— 跨设备"续上一局"体验很怪，程已确认不同步'],
    ['sbr_mission_reset_d', '每日重置时间戳 —— 各设备自己算（同步会让另一端提前重置）'],
    ['sbr_mission_reset_w', '每周重置时间戳 —— 同上'],
    ['tutorial_guidance_dismissed', '教程引导的"已忽略" —— 设备本地状态，不是进度'],
];

/**
 * `settings` 里**属于游戏进度**的字段白名单（其余一律不同步）。
 * 🔴 这张表漏一个 ⇒ 那个东西跨端同步会丢；多一个设备项 ⇒ 手机设置会污染电脑。
 */
const SYNCED_SETTINGS_FIELDS = [
    'unlockedCardBacks',        // 已解锁卡背
    'unlockedDesks',            // 已解锁牌桌
    'customization',            // 当前佩戴的卡背/牌桌
    'unlockedRogueDifficulties',// 肉鸽已解锁难度
    'unlockedRogueEnhancements',// 肉鸽图鉴 · 强化
    'unlockedRogueEquipments',  // 肉鸽图鉴 · 装备
    'ownedArmaments',           // 已拥有武装（种类名，旧读取兼容）
    'armamentStock',            // 🔴 武装**真数量库存**（权威）
    'armamentVoucher',          // 🔴 匣券余额（重复武装换来的，玩家资产）
    'voucherFirstUsed',         // 匣券「首次兑换优惠」已用过的档位
    'passUnlockedEnhancements', // 通行证解锁的强化
    'pendingPacks',             // 🔴 待打开卡包
    'pendingChests',            // 🔴 待打开奖励匣
    'passClaimedRewards',       // 通行证已领取（≤30 固定表）
    'passClaimedUpTo',          // 通行证领取水位（31+ 无限等级）
] as const;

// ══════════════════════════════════════════════════════════════════════════
// 数据结构
// ══════════════════════════════════════════════════════════════════════════

/** 一个账号的游戏进度快照 */
export interface AccountSave {
    /** 账号在本机的 uid（跨设备**保持不变** —— 靠它做"同一个号"的匹配） */
    uid: string;
    /** 账号摘要（展示用）。`origin` 是来源标记，本机原生账号为 undefined */
    summary: UserSummary;
    /** 整键同步的数据：`{ [键前缀]: 解析后的 JSON }` */
    data: Record<string, unknown>;
    /** `settings` 里被白名单选中的那部分 */
    settingsProgress: Record<string, unknown>;
    /** 内容指纹 —— 用来判定"这个号有没有变过"（不用于安全） */
    contentHash: string;
}

/** 传输信封 —— 一次可以带多个账号 */
export interface SavePack {
    format: typeof SAVE_FORMAT;
    formatVersion: number;
    /** 导出时间（ISO） */
    exportedAt: string;
    /** 导出方平台标记 */
    origin: SaveOrigin;
    /** 导出方环境信息（只用于排查，不参与任何判定） */
    source?: { appVersion?: string; platform?: string };
    /** 账号列表 */
    accounts: AccountSave[];
}

/** 安装结果 */
export interface InstallResult {
    uid: string;
    displayName: string;
    /** `added` = 本机原来没有（首次同步新增）；`updated` = 已有且被覆盖 */
    action: 'added' | 'updated';
}

// ══════════════════════════════════════════════════════════════════════════
// 工具：稳定序列化 + 内容指纹
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ 为什么不用 WebCrypto：安卓 WebView 的 origin scheme 决定了 `crypto.subtle` 是否可用
//    （见 `_scratch/research/决策表-存档互通-v1.md` §6 待实测项）。
//    这里只需要"变了没有"，**不需要抗碰撞** ⇒ 用纯 JS 的 FNV-1a，零依赖、同步、跨端一致。

/** 键排序后的 JSON（保证同样的数据永远得到同样的字符串） */
function stableStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    const walk = (v: unknown): unknown => {
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v as object)) return '[circular]';
        seen.add(v as object);
        if (Array.isArray(v)) return v.map(walk);
        const obj = v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(obj).sort()) out[k] = walk(obj[k]);
        return out;
    };
    return JSON.stringify(walk(value));
}

/** FNV-1a 32 位 → 8 位十六进制（只用于变更检测） */
function fnv1a(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

// ══════════════════════════════════════════════════════════════════════════
// 读：把一个账号的进度攒成 AccountSave
// ══════════════════════════════════════════════════════════════════════════

const keyOf = (prefix: string, uid: string) => `${prefix}_${uid}`;

/** 读 `settings` 里白名单选中的字段（缺的字段不写进结果，避免把 undefined 传出去） */
function readSettingsProgress(uid: string): Record<string, unknown> {
    const settings = StorageUtils.load<Record<string, unknown> | null>(
        keyOf(STORAGE_KEYS.USER_SETTINGS, uid), null,
    );
    const out: Record<string, unknown> = {};
    if (!settings) return out;
    for (const field of SYNCED_SETTINGS_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(settings, field)) {
            out[field] = settings[field];
        }
    }
    return out;
}

/** 内容指纹：整键数据 + settings 进度字段，一起算 */
export function computeContentHash(
    data: Record<string, unknown>,
    settingsProgress: Record<string, unknown>,
): string {
    return fnv1a(stableStringify({ data, settingsProgress }));
}

/**
 * 读出一个账号的进度快照。
 * @returns 账号不存在（profile 键缺失）时返回 `null`
 */
export function readAccountSave(uid: string, summary?: UserSummary): AccountSave | null {
    const data: Record<string, unknown> = {};
    for (const prefix of SYNC_KEY_PREFIXES) {
        const raw = StorageUtils.load<unknown>(keyOf(prefix, uid), null);
        if (raw !== null) data[prefix] = raw;
    }
    // profile 是"这个号存在"的最低判据
    if (!Object.prototype.hasOwnProperty.call(data, STORAGE_KEYS.USER_PROFILE)) return null;

    const settingsProgress = readSettingsProgress(uid);
    const resolvedSummary: UserSummary = summary ?? (
        StorageUtils.getUserIndex().find((u) => u.uid === uid)
        ?? {
            uid,
            displayName: (data[STORAGE_KEYS.USER_PROFILE] as { displayName?: string } | undefined)?.displayName ?? '未命名',
            avatarId: '',
            lastLoginAt: 0,
            type: 'starter' as const,
        }
    );

    return {
        uid,
        summary: resolvedSummary,
        data,
        settingsProgress,
        contentHash: computeContentHash(data, settingsProgress),
    };
}

/** 读出本机**全部**账号的进度快照（跳过读不出来的） */
export function readAllAccountSaves(): AccountSave[] {
    const out: AccountSave[] = [];
    for (const summary of StorageUtils.getUserIndex()) {
        const save = readAccountSave(summary.uid, summary);
        if (save) out.push(save);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 打包 / 解包
// ══════════════════════════════════════════════════════════════════════════

/** 打包成一个信封 */
export function buildSavePack(
    accounts: AccountSave[],
    origin: SaveOrigin,
    source?: { appVersion?: string; platform?: string },
): SavePack {
    return {
        format: SAVE_FORMAT,
        formatVersion: SAVE_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        origin,
        source,
        accounts,
    };
}

export class SavePackError extends Error { }

/**
 * 校验并解析一个信封（**防御式**：任何不合规都抛 `SavePackError`，绝不半装）。
 *
 * ⚠️ 存档按**不透明数据**处理：本层只检查"形状对不对"，**不去解读内部字段**
 *    （避免把对方的数据当可信输入解释 ⇒ 一举绕开原型污染一类问题）。
 */
export function parseSavePack(raw: unknown): SavePack {
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch {
            throw new SavePackError('存档包不是合法 JSON');
        }
    }
    if (!raw || typeof raw !== 'object') throw new SavePackError('存档包不是对象');
    const pack = raw as Partial<SavePack>;

    if (pack.format !== SAVE_FORMAT) throw new SavePackError(`存档包格式不认识：${String(pack.format)}`);
    if (typeof pack.formatVersion !== 'number') throw new SavePackError('存档包缺少 formatVersion');
    if (pack.formatVersion > SAVE_FORMAT_VERSION) {
        throw new SavePackError(
            `对方的存档包版本（${pack.formatVersion}）比本机（${SAVE_FORMAT_VERSION}）新，请先更新本机`,
        );
    }
    if (pack.origin !== 'pc' && pack.origin !== 'mobile') throw new SavePackError('存档包缺少合法的来源标记');
    if (!Array.isArray(pack.accounts)) throw new SavePackError('存档包缺少账号列表');

    const accounts: AccountSave[] = [];
    for (const a of pack.accounts) {
        if (!a || typeof a !== 'object') throw new SavePackError('账号条目不是对象');
        const acc = a as Partial<AccountSave>;
        if (typeof acc.uid !== 'string' || !acc.uid) throw new SavePackError('账号缺少 uid');
        if (!acc.summary || typeof acc.summary !== 'object') throw new SavePackError(`账号 ${acc.uid} 缺少 summary`);
        if (!acc.summary || typeof acc.summary.displayName !== 'string') {
            throw new SavePackError(`账号 ${acc.uid} 的 displayName 不合法`);
        }
        if (!acc.data || typeof acc.data !== 'object') throw new SavePackError(`账号 ${acc.uid} 缺少 data`);
        const settingsProgress = (acc.settingsProgress && typeof acc.settingsProgress === 'object')
            ? acc.settingsProgress as Record<string, unknown>
            : {};
        // 指纹以**本机重算**为准，不信任对方给的 contentHash（防"假哈希骗过变更检测"）
        accounts.push({
            uid: acc.uid,
            summary: acc.summary as UserSummary,
            data: acc.data as Record<string, unknown>,
            settingsProgress,
            contentHash: computeContentHash(acc.data as Record<string, unknown>, settingsProgress),
        });
    }
    if (accounts.length === 0) throw new SavePackError('存档包里一个账号都没有');

    return {
        format: SAVE_FORMAT,
        formatVersion: pack.formatVersion,
        exportedAt: typeof pack.exportedAt === 'string' ? pack.exportedAt : new Date().toISOString(),
        origin: pack.origin,
        source: pack.source,
        accounts,
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 装：把信封里的账号落地到本机
// ══════════════════════════════════════════════════════════════════════════

/** 来源标记 → 展示用的中文标签 */
export const ORIGIN_LABEL: Record<SaveOrigin, string> = {
    pc: 'PC',
    mobile: '手游',
};

/**
 * 把一个账号**装进本机**。
 *
 * @param save    要装的账号
 * @param origin  来源（来自对面平台的哪个端）—— 会写进 `summary.origin`
 * @param force   本机已有同 uid 的号时，是否强行覆盖（默认 `false` = 跳过，保住"首次不覆盖"）
 * @returns `null` = 本机已有且未 force，什么都没做
 */
export function installAccount(
    save: AccountSave,
    origin: SaveOrigin,
    force = false,
): InstallResult | null {
    const existing = StorageUtils.getUserIndex().find((u) => u.uid === save.uid);
    if (existing && !force) return null;

    // ① 整键写入（只写本层认可的键 —— 信封里多出来的键一律忽略）
    for (const prefix of SYNC_KEY_PREFIXES) {
        if (!Object.prototype.hasOwnProperty.call(save.data, prefix)) continue;
        StorageUtils.save(keyOf(prefix, save.uid), save.data[prefix]);
    }

    // ② settings 走**合并**：只覆盖白名单字段，本机的音量/画质/开关全部保住
    if (Object.keys(save.settingsProgress).length > 0) {
        const settingsKey = keyOf(STORAGE_KEYS.USER_SETTINGS, save.uid);
        const localSettings = StorageUtils.load<Record<string, unknown> | null>(settingsKey, null) ?? {};
        const merged = { ...localSettings };
        for (const field of SYNCED_SETTINGS_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(save.settingsProgress, field)) {
                merged[field] = save.settingsProgress[field];
            }
        }
        StorageUtils.save(settingsKey, merged);
    }

    // ③ 账户索引：保留本机的 type（**绝不让对面决定本机的加载语义**），只补/改展示字段 + 来源标记
    const summary: UserSummary = {
        uid: save.uid,
        displayName: save.summary.displayName,
        avatarId: save.summary.avatarId ?? '',
        lastLoginAt: save.summary.lastLoginAt ?? 0,
        // 🔴 关键：一律用**本机已有的 type**；本机没有就按 'starter' 装。
        //    绝不采纳对方的 'full' —— 那会把收藏推进 `mode === 'full'` 的满卡覆盖分支。
        //    （对方的数据本身已经躺在 `data` 里了，不需要靠 type 找回）
        type: existing?.type ?? 'starter',
        origin,
    };
    StorageUtils.updateUserIndex(summary);

    return {
        uid: save.uid,
        displayName: summary.displayName,
        action: existing ? 'updated' : 'added',
    };
}

/**
 * 一键装入整个信封。
 * @returns 每个账号的处理结果；**跳过的不在结果里**（调用方需要自己拿"本机已有"的清单去问玩家）
 */
export function installSavePack(
    pack: SavePack,
    force = false,
): { installed: InstallResult[]; skipped: AccountSave[] } {
    const installed: InstallResult[] = [];
    const skipped: AccountSave[] = [];
    for (const account of pack.accounts) {
        const result = installAccount(account, pack.origin, force);
        if (result) installed.push(result);
        else skipped.push(account);
    }
    return { installed, skipped };
}

// ══════════════════════════════════════════════════════════════════════════
// 同步基线：判定"这个号变过没有"
// ══════════════════════════════════════════════════════════════════════════

/**
 * 同步基线存储键（**全局，不分 uid**）。
 * 形状：`{ [uid]: { hash, syncedAt } }`
 *
 * 用途：把"上次同步时这个号长什么样"记下来 ⇒ 下次就能区分
 *   · 本机没变、对方变了 → 直接拉过来
 *   · 本机变了、对方没变 → 推过去
 *   · **两边都变了 → 冲突，交给 UI 弹窗问玩家**
 *
 * ⚠️ 前缀这里硬编码：`storageUtils.ts` 的 `STORAGE_PREFIX` 没有导出，
 *    而本键是**同步层私有**的（将来即使换前缀也只影响这一处），不值得为它去改公共枚举。
 */
const SYNC_BASELINE_KEY = 'snowbreak_rivals_sync_baseline';

export interface SyncBaselineEntry { hash: string; syncedAt: number }
export type SyncBaseline = Record<string, SyncBaselineEntry>;

export function loadSyncBaseline(): SyncBaseline {
    return StorageUtils.load<SyncBaseline>(SYNC_BASELINE_KEY, {});
}

export function setSyncBaseline(uid: string, hash: string): void {
    const all = loadSyncBaseline();
    all[uid] = { hash, syncedAt: Date.now() };
    StorageUtils.save(SYNC_BASELINE_KEY, all);
}

export function clearSyncBaseline(): void {
    StorageUtils.remove(SYNC_BASELINE_KEY);
}

/** 三向比对的结果 */
export type ChangeKind = 'unchanged' | 'local-only' | 'remote-only' | 'conflict';

/**
 * 判定一个账号的变更情况（**纯函数**，不写任何东西）。
 *
 * @param localHash  本机当前指纹
 * @param remoteHash 对方当前指纹
 * @param baseHash   上次同步时的指纹（没有基线 = `undefined`）
 */
export function classifyChange(
    localHash: string,
    remoteHash: string,
    baseHash: string | undefined,
): ChangeKind {
    // 没有基线 ⇒ 这是第一次见这个号。两边指纹相同 = 内容一致；不同 = 需要玩家裁决
    if (baseHash === undefined) return localHash === remoteHash ? 'unchanged' : 'conflict';

    const localChanged = localHash !== baseHash;
    const remoteChanged = remoteHash !== baseHash;
    if (!localChanged && !remoteChanged) return 'unchanged';
    if (localChanged && !remoteChanged) return 'local-only';
    if (!localChanged && remoteChanged) return 'remote-only';
    // 两边都变过，但结果恰好一样（很少见）⇒ 视为无冲突
    return localHash === remoteHash ? 'unchanged' : 'conflict';
}

// 供调试面板 / 排查用：把"要同步哪些键"暴露出去，别让别处再抄一份
export { SYNC_KEY_PREFIXES, SYNCED_SETTINGS_FIELDS, NEVER_SYNCED };
