// ==========================================
// [2026-10-05 莉莉子 BUG修复 · 20261005-06] 全局音量快照（模块级单例）
// ── 病根：音量此前是**纯"推"模型** —— App 只在 `userSystem.isReady` 翻 true 时
//    `emit(SET_VOICE_VOLUME, v.voice)` 推一次（`App.tsx` 初始化同步音量 effect），
//    而 `useVoice` 是**每场对局在 GameSession 里新挂一个实例**（`GameSession.tsx:921`），
//    它的音量 ref 硬编码默认 `0.8` ⇒ **新实例收不到那次推送** ⇒
//    「一进新对局语音音量就被重置，必须在局内再拖一次滑块（→ 再 emit 一次）才恢复」。
//    迷宫连打多局时最明显（每个战斗节点都重挂 GameSession）。
// ── 修法：把音量变成"**可读取的当前值**"（模块级快照）——任何播放器实例 mount 时**自取现值**；
//    事件推送仍然保留（用于"实时改正在播的那一条"，与快照互补，不是二选一）。
// ── 默认值与三个 hook 里原有的硬编码**逐字一致**（0.5 / 0.6 / 0.8 / 1.0）⇒ 零行为回归。
// ── 同类先例：`gameLogger` / `animGuard` / `eventBus` 都是模块级单例，这里沿用同一惯例。
// ==========================================

export type VolumeChannel = 'bgm' | 'sfx' | 'voice' | 'movie';
export type VolumeMap = Record<VolumeChannel, number>;

/** 缺省音量：与各 hook 原本的 `useRef(0.5/0.6/0.8)` / `useState(1.0)` 完全一致 */
export const DEFAULT_VOLUMES: VolumeMap = { bgm: 0.5, sfx: 0.6, voice: 0.8, movie: 1.0 };

const CHANNELS = Object.keys(DEFAULT_VOLUMES) as VolumeChannel[];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

let snapshot: VolumeMap = { ...DEFAULT_VOLUMES };

/**
 * 把（可能缺字段 / NaN / 越界的）存档音量补全成一份**合法音量表**（纯函数，不改快照）。
 * ⚠️ 为什么需要：`UserSettings['volume']` 长期缺 `movie` 字段（滑块初值 `undefined`），
 *    老存档里也可能没有 —— 统一在这里兜底，UI 与播放器都拿同一份结果。
 */
export const normalizeVolumes = (partial?: Partial<VolumeMap> | null): VolumeMap => {
    const out = { ...DEFAULT_VOLUMES };
    CHANNELS.forEach(ch => {
        const v = partial?.[ch];
        if (typeof v === 'number' && Number.isFinite(v)) out[ch] = clamp01(v);
    });
    return out;
};

/** 读取当前音量（播放器实例 mount 时用它初始化，别再写死默认值） */
export const getVolume = (channel: VolumeChannel): number => snapshot[channel];

/** 读取整份快照（副本） */
export const getVolumes = (): VolumeMap => ({ ...snapshot });

/** 写入单个通道的当前音量（App 的按需设置 / 初始化都用它） */
export const setVolumeSnapshot = (channel: VolumeChannel, vol: number): void => {
    if (typeof vol !== 'number' || !Number.isFinite(vol)) return;
    snapshot = { ...snapshot, [channel]: clamp01(vol) };
};

/**
 * 用存档音量**补齐并刷新**快照（App 初始化时调用），返回补全后的音量表。
 * 缺失字段保留快照现值（而不是粗暴清零）⇒ 老存档升级到新字段时不会被误置 0。
 */
export const hydrateVolumes = (partial?: Partial<VolumeMap> | null): VolumeMap => {
    const out = { ...snapshot };
    CHANNELS.forEach(ch => {
        const v = partial?.[ch];
        if (typeof v === 'number' && Number.isFinite(v)) out[ch] = clamp01(v);
    });
    snapshot = out;
    return { ...out };
};
