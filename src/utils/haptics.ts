// ==========================================
// 触感（震动）总闸 —— `haptics.ts`
// [2026-10-20 莉莉子 · 触屏反馈]
//
// 👤 程的需求原话：「震得太频繁太吵了，我们给点按和长按的震动在手机上的设置界面中
//    增加开关。并且我们新增两处震动的位置，一处是敌方打击我方水晶，一处是我方打击
//    敌方水晶。这两处同样要在手机端的设置界面中增加开关」
//
// ── 为什么要单独一个「总闸」而不是就地 `navigator.vibrate()` ────────────────
//   震动有**两个完全不同的来源**：
//     ① 手势层（`TouchFeedbackLayer`）—— 点按 / 长按达成
//     ② 对局广播（`HapticsBridge`）   —— 水晶受击（`GameEvents.NEXUS_STRIKED`）
//   它们都需要读**同一份开关**，而开关存在 `userSystem.settings` 里（React 状态）。
//   ⇒ 用一个**模块级**总闸：App 负责把设置「写进来」，两个来源只管「读 + 触发」，
//     不必把 settings 一路 prop 穿到手势层里去。
//
// ⚠️ 三个必须遵守的约束：
//   1. **所有震动都必须走 `haptic()`**，不许在组件里直接调 `navigator.vibrate` ——
//      否则就会出现「开关加了但某处照样震」的鬼故事。
//   2. **开关缺省按 `HAPTICS_DEFAULT` 走**（`undefined` 也走默认），
//      因为老存档里没有这 4 个字段 ⇒ 不能当成"关"，也不能当成"开"乱猜。
//   3. **同一个通道要节流**：一次 AOE 可能连发好几发水晶伤害广播，
//      不节流就是「嗡嗡嗡」一串，比不震更吵。
//
// 📱 平台：`navigator.vibrate` 只在触屏设备（安卓 WebView / 手机浏览器）可用，
//   且安卓 WebView 里还需要 `android.permission.VIBRATE`（已声明，见 AndroidManifest.xml）。
//   PC 上要么没有这个函数、要么返回 false —— `haptic()` 内部已做能力检测，静默忽略。
// ==========================================

/** 四个震动通道（= 设置界面的四个开关） */
export type HapticsChannel = 'tap' | 'longPress' | 'nexusIn' | 'nexusOut';

/** 四个通道的开关状态 */
export type HapticsSwitches = Record<HapticsChannel, boolean>;

/**
 * 🎛️ 默认开关值（老存档 / 新账号都按这份来）
 *
 * [2026-10-20 程拍板] **点按默认「关」** —— 程的原话是「震得太频繁太吵了」，
 *   而点按（每次手指按下）正是最频繁的那一个 ⇒ 默认关掉才是"修好"，让玩家想要再自己开。
 *   长按与两处水晶震动**很少发生且有信息量**（长按=你触发了预览；水晶=战局在掉血），
 *   默认保持开。
 */
export const HAPTICS_DEFAULT: HapticsSwitches = {
    tap: false,        // 点按（每次手指按下）
    longPress: true,   // 长按达成（进入悬停预览）
    nexusIn: true,     // 敌方打击我方水晶
    nexusOut: true,    // 我方打击敌方水晶
};

/**
 * 🎛️ 各通道震动时长（ms）—— **程要调手感就改这里**
 *
 * 设计意图（用震动"说话"）：
 *   · 点按 12ms      —— 极轻，像指甲敲一下桌面（只作确认，不抢戏）
 *   · 长按 30ms      —— 略重，像"咔哒"扣上（它对应一次**成功操作**）
 *   · 水晶受击 45ms  —— 明显更重、更长（战局警告，必须让人手上一沉）
 *   · 打敌水晶 24ms  —— 干脆的一下"命中"感，比警告轻、比确认重
 */
export const HAPTICS_MS: Record<HapticsChannel, number> = {
    tap: 12,
    longPress: 30,
    nexusIn: 45,
    nexusOut: 24,
};

/**
 * 同通道最小间隔（ms）—— 防连震。
 * 手势通道取 60（人手一秒也按不了 16 下，正常不会触发）；
 * 水晶通道取 250 —— 一发 AOE 打水晶常常在同一帧里连发几发广播，只震一次就够。
 */
const MIN_GAP_MS: Record<HapticsChannel, number> = {
    tap: 60,
    longPress: 0,
    nexusIn: 250,
    nexusOut: 250,
};

/** 当前生效的开关（模块级；由 `setHapticsSwitches()` 写入） */
let currentSwitches: HapticsSwitches = { ...HAPTICS_DEFAULT };

/** 各通道上次触发时间（`performance.now()`；用于节流） */
const lastFireAt: Partial<Record<HapticsChannel, number>> = {};

/** 把 `undefined` 归一到默认值 —— 老存档没有这 4 个字段 */
const pickBool = (value: boolean | undefined, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

/**
 * 写入当前开关（由 `App.tsx` 在设置变化时调用）。
 * 接受**不完整**的对象：没给的通道保持默认值，`undefined` 也按默认值处理。
 */
export const setHapticsSwitches = (
    next?: Partial<Record<HapticsChannel, boolean | undefined>> | null,
): void => {
    currentSwitches = {
        tap: pickBool(next?.tap, HAPTICS_DEFAULT.tap),
        longPress: pickBool(next?.longPress, HAPTICS_DEFAULT.longPress),
        nexusIn: pickBool(next?.nexusIn, HAPTICS_DEFAULT.nexusIn),
        nexusOut: pickBool(next?.nexusOut, HAPTICS_DEFAULT.nexusOut),
    };
};

/** 读当前开关（只读快照；调试/排查用） */
export const getHapticsSwitches = (): HapticsSwitches => ({ ...currentSwitches });

/** 设备是否支持震动（能力检测，不看平台） */
export const isHapticsSupported = (): boolean => {
    try {
        return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    } catch {
        return false;
    }
};

/**
 * 触发一次震动。
 *
 * 三重闸门，任一不过就静默返回：
 *   ① 该通道的开关是「关」
 *   ② 设备不支持 `navigator.vibrate`
 *   ③ 距上次同通道震动太近（节流）
 *
 * @param channel 通道名（同时也是设置里的开关 key）
 */
export const haptic = (channel: HapticsChannel): void => {
    if (!currentSwitches[channel]) return;

    const ms = HAPTICS_MS[channel];
    if (!(ms > 0)) return;

    if (!isHapticsSupported()) return;

    // ③ 节流（同通道）
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const gap = MIN_GAP_MS[channel];
    const last = lastFireAt[channel];
    if (gap > 0 && typeof last === 'number' && now - last < gap) return;
    lastFireAt[channel] = now;

    try {
        navigator.vibrate(ms);
    } catch {
        /* 不支持 / 被策略拒绝 ⇒ 静默忽略（震动永远不该影响对局） */
    }
};
