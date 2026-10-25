import React, { useState, useRef, useEffect } from 'react';
import {
    Settings, RefreshCw, Eye, EyeOff, Sword, Hexagon, Plus,
    Image as ImageIcon, ClipboardList, ShoppingBag, Users,
    X, Check
} from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { motion, AnimatePresence } from 'framer-motion';
// [2026-10-10 P1] 循环视频统一实现（并发预算 + 探针 + 卸载释放）
import { LoopVideo } from './LoopVideo';
import { useUserSystem } from '../hooks/useUserSystem';
import { HERO_IMAGES, CURRENCY_ICONS, LOADING_SCREEN_IMAGES, UNIT_IMAGES, SPELL_IMAGES, PERSONALIZATION_ASSETS } from '../data/imageData';
import { getAccountExpToNext } from '../data/accountProgression'; // [2026-09-04 账号等级] 档案面板真实经验条
import { CARD_DB } from '../data/cards'; // [2026-09-04 档案面板] 收藏计数 / 代表英雄名
import { getArmamentDefs } from '../data/equipment'; // [2026-09-04 档案面板] 武装收藏计数
import { readArmStock } from '../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import { getHallCharacterEntries, getCharacterScenes, getHallMoviePoster, type HallCharacterKey } from '../data/movieData';
import { ChevronRight, Play, User, Copy, Edit3, Crop, Wrench, Camera, Megaphone } from 'lucide-react'; // [修改] 新增 Camera / [2026-08-09] 新增 Megaphone

// [新增] 引入 GM 工作室主控台
import { Studio } from './Studio/Studio';
// [新增] 引入全新的全息科技图鉴舱
import { GalleryCodex } from './GalleryCodex';
import { pickTuning } from '../platform/tuning';
// [核心重构] 背景配置 —— 增加角色分组支持
export type BgType = 'movie' | 'pic';
export interface BgConfig {
  type: BgType;
  url: string;
  index: number;
  characterKey?: string;  // [新增] 角色标识（大厅视频专用）
  sceneIndex?: number;     // [新增] 当前场景索引 0~3
}

interface GameLobbyProps {
    userSystem: ReturnType<typeof useUserSystem>;
    onStartBattle: () => void;
    onSwitchVideo: () => void;
    onOpenSettings: () => void;
    onGachaClick: () => void;
    onOpenMission?: () => void;
    onOpenShop?: () => void;
    onOpenDeck?: () => void;
    onOpenAnnouncement?: () => void; // [2026-08-09] 公告中心唤起
    onSelectBackground?: () => void;
    // [新增] 背景管理 Props
    customBg: BgConfig | null;
    onUpdateCustomBg: (bg: BgConfig | null) => void;
    hasClaimableReward?: boolean; // [新增] 接收是否有待领取的军功奖励信号
}

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 游戏大厅 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 管：顶部资源栏 / 左上玩家信息 / 左侧控制区 / 右侧行动区 / 右下工具区 / GM 入口。
// 改完存盘即生效（HMR 直接刷新，电脑上就能看到，不用出包）。
// 用法：先拧【主旋钮】btnScale 把按钮整体大小定下来，再动下面的细节值。
// 换算：按钮/图标的最终尺寸 = 基础值 × btnScale；字号 = 基础值 × fontScale。
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// 🎛️ 玩家档案面板（`isProfileOpen` 那一层）· 视觉调参区
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 大厅点头像/档案后弹出的「DEVELOPER (全卡测试)」面板：
//   大号动态头像 + MODIFY 改动按钮 + 名字/UID/账号等级/EXP + 战绩三格 + 收藏三格 + 关闭。
// 管：①面板外壳 ②头像与名字列（含 UID / 等级 / EXP）③战绩三格 ④收藏三格 ⑤底部关闭行
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// 🔴 **本文件已有 `LOBBY_UI`（大厅主界面 6 个区块）** —— 那是**另一屏**，与本块互不相干，别改错块。
// ⚠️ 「关闭」按钮用的是共享件 `GlassButton`（className 传 `w-32 h-12 rounded-sm`）——
//   它的尺寸由那个组件自己决定 ⇒ **不在本块**，本块只暴露外层的上边距。
// ⚠️ 头像画廊 / 头像裁剪是另两条独立分支（`isGalleryOpen` / `isCropperOpen`）⇒ 本块只管档案面板。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】本文件有**两块**调参区，**每块都是两份值**：
//   `XXX_UI_MOBILE`（手机端，程在雷电里调）+ `XXX_UI_PC_DIFF`（PC 端差异项，见各块下方）。
//   判定收在 `src/platform/tuning.ts`；电脑浏览器 = PC 版，雷电 = 手机版。
const PROFILE_UI_MOBILE = {
    // ══ ① 面板外壳 ═══════════════════════════════════════════════════
    /** 面板宽 px（原 w-[600px] = 600） */
    panelWidth: 600,
    /** 面板圆角 px（原 rounded-sm = 2） */
    panelRadius: 2,
    /** 面板内边距 px（原 p-8 = 32） */
    panelPad: 32,
    /** 面板内各分区行距 px（原 gap-8 = 32） */
    panelGap: 32,
    /** 面板描边 px（原 border = 1） */
    panelBorderWidth: 1,

    // ══ ② 头像 + 名字 / UID / 等级 / EXP ══════════════════════════════
    /** 顶部两列间距 px（原 gap-6 = 24） */
    topRowGap: 24,
    /** 头像边长 px（原 w-32 h-32 = 128） */
    avatarSize: 128,
    /** 头像圆角 px（原 rounded-sm = 2） */
    avatarRadius: 2,
    /** 头像描边 px（原 border-4 = 4） */
    avatarBorderWidth: 4,
    /** MODIFY 条上下内边距 px（原 py-1 = 4） */
    modifyPadY: 4,
    /** MODIFY 条字号 px（原 text-xs = 12） */
    modifyFontSize: 24,
    /** MODIFY 条图标与文字间距 px（原 gap-1 = 4） */
    modifyGap: 4,
    /** MODIFY 条图标 px（原 <Crop size={12} /> = 12） */
    modifyIconSize: 24,
    /** 右列各行间距 px（原 gap-3 = 12） */
    nameColGap: 12,
    /** 名字行高 px（原 h-12 = 48） */
    nameRowHeight: 48,
    /** 名字行内间距 px（原 gap-3 = 12） */
    nameRowGap: 12,
    /** 名字行下内边距 px（原 pb-2 = 8） */
    nameRowPadBottom: 8,
    /** 名字行分割线 px（原 border-b = 1） */
    nameRowBorderWidth: 1,
    /** 名字编辑框字号 px（原 text-2xl = 24） */
    nameInputFontSize: 48,
    /** 名字编辑框左右内边距 px（原 px-2 = 8） */
    nameInputPadX: 8,
    /** 名字编辑框上下内边距 px（原 py-1 = 4） */
    nameInputPadY: 4,
    /** 名字编辑框圆角 px（原 rounded-sm = 2） */
    nameInputRadius: 2,
    /** 名字字号 px（原 text-3xl = 30） */
    nameFontSize: 30,
    /** 编辑小按钮内边距 px（原 p-2 = 8） */
    editBtnPad: 8,
    /** 编辑小按钮圆角 px（原 rounded-sm = 2） */
    editBtnRadius: 2,
    /** 编辑图标 px（原 <Edit3 size={18} /> = 18） */
    editIconSize: 18,
    /** UID 行间距 px（原 gap-4 = 16） */
    uidRowGap: 16,
    /** UID 字号 px（原 text-sm = 14） */
    uidFontSize: 21,
    /** 复制图标 px（原 <Copy size={14} /> = 14） */
    copyIconSize: 14,
    /** 等级行间距 px（原 gap-3 = 12） */
    lvRowGap: 12,
    /** 等级行上距 px（原 mt-2 = 8） */
    lvRowMarginTop: 8,
    /** 「账号 LV.」徽章左右内边距 px（原 px-3 = 12） */
    lvBadgePadX: 12,
    /** 「账号 LV.」徽章上下内边距 px（原 py-1 = 4） */
    lvBadgePadY: 4,
    /** 「账号 LV.」徽章圆角 px（原 rounded-sm = 2） */
    lvBadgeRadius: 2,
    /** 「账号 LV.」徽章描边 px（原 border = 1） */
    lvBadgeBorderWidth: 1,
    /** EXP 进度条高 px（原 h-2 = 8） */
    expBarHeight: 8,
    /** EXP 进度条描边 px（原 border = 1） */
    expBarBorderWidth: 1,
    /** EXP 文字字号 px（原 text-xs = 12） */
    expFontSize: 24,

    // ══ ③④ 两个三格区（战绩 / 收藏）共用的分区参数 ════════════════════
    /** 三格之间间距 px（原 gap-4 = 16） */
    gridGap: 16,
    /** 分区上边距（含分割线）px（原 pt-6 = 24） */
    sectionPadTop: 24,
    /** 分区上分割线 px（原 border-t = 1） */
    sectionBorderWidth: 1,
    /** 统计卡内边距 px（原 p-4 = 16） */
    statCardPad: 16,
    /** 统计卡圆角 px（原 rounded-sm = 2） */
    statCardRadius: 2,
    /** 统计卡描边 px（原 border = 1） */
    statCardBorderWidth: 1,

    // ══ ③ 战绩三格 ═══════════════════════════════════════════════════
    /** 标签字号 px（原 text-xs = 12） */
    statLabelFontSize: 15,
    /** 标签下距 px（原 mb-1 = 4） */
    statLabelMarginBottom: 4,
    /** 主数值字号 px（原 text-2xl = 24） */
    statValueFontSize: 36,
    /** 胜负里的「/ 负数」字号 px（原 text-base = 16） */
    statSubFontSize: 36,
    /** 「代表英雄：」整行字号 px（原 text-xs = 12） */
    heroLineFontSize: 36,

    // ══ ④ 收藏三格 ═══════════════════════════════════════════════════
    /** 卡内行距 px（原 gap-1 = 4） */
    collectCardGap: 4,
    /** 标签字号 px（原 text-[10px] = 10） */
    collectLabelFontSize: 20,
    /** 标签下距 px（原 mb-1 = 4） */
    collectLabelMarginBottom: 4,
    /** 主数值字号 px（原 text-xl = 20） */
    collectValueFontSize: 30,
    /** 斜杠后小字字号 px（原 text-xs = 12） */
    collectSubFontSize: 18,
    /** 进度条高 px（原 h-1 = 4） */
    collectBarHeight: 4,
    /** 「棋盘 N/M」小字字号 px（原 text-[10px] = 10） */
    collectNoteFontSize: 20,

    // ══ ⑤ 底部关闭行 ═════════════════════════════════════════════════
    /** 关闭行上边距 px（原 mt-4 = 16） */
    footerMarginTop: 16,
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `PROFILE_UI` PC 端差异项 —— 只列「与手机端不同」的项
// ──────────────────────────────────────────────────────────────────────
// 依据：`chore(tuning)` 提交 `89d1c154` 的**真实 diff**。
// 🔴 **不要以该提交的信息为准** —— 信息只列了 5 项，diff 实际改了 **13 项**
//    （漏报「战绩三格 + 收藏三格」的 8 个字号）。
// ══════════════════════════════════════════════════════════════════════
const PROFILE_UI_PC_DIFF = {
    // ══ ② 头像 + 名字 / UID / 等级 / EXP ══════════════════════════════
    modifyFontSize: 12,       // 原 text-xs
    modifyIconSize: 12,       // 原 <Crop size={12} />
    nameInputFontSize: 24,    // 原 text-2xl
    uidFontSize: 14,          // 原 text-sm
    expFontSize: 12,          // 原 text-xs

    // ══ ③ 战绩三格 ═══════════════════════════════════════════════════
    statLabelFontSize: 12,    // 原 text-xs（提交信息未提）
    statValueFontSize: 24,    // 原 text-2xl（提交信息未提）
    statSubFontSize: 16,      // 原 text-base（提交信息未提）
    heroLineFontSize: 12,     // 原 text-xs（提交信息未提）

    // ══ ④ 收藏三格 ═══════════════════════════════════════════════════
    collectLabelFontSize: 10, // 原 text-[10px]（提交信息未提）
    collectValueFontSize: 20, // 原 text-xl（提交信息未提）
    collectSubFontSize: 12,   // 原 text-xs（提交信息未提）
    collectNoteFontSize: 10,  // 原 text-[10px]（提交信息未提）
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const PROFILE_UI_PC = { ...PROFILE_UI_MOBILE, ...PROFILE_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const PROFILE_UI = pickTuning(PROFILE_UI_PC, PROFILE_UI_MOBILE);

// 🖥️📱 【双平台】本块的**基础值两端完全相同**，被调的只有两个主旋钮：
//   手机端 1.25× ／ PC 端 1× —— 拨回 1 就能让 39 个被 `B()`/`F()` 包住的字段自动回原值。
const LOBBY_UI_MOBILE = {
    /** 【主旋钮】所有按钮 / 图标的尺寸倍率（1 = 原样） */
    btnScale: 1.25,
    /** 【次旋钮】所有文字的字号倍率（1 = 原样） */
    fontScale: 1.25,

    // ══ ① 按钮基础尺寸（逻辑 px）═══════════════════════════════════════
    btn: {
        topIcon:    { w: 48,  h: 40 },   // 顶部 公告 / 设置（原 w-12 h-10）
        ctrlSmall:  { w: 64,  h: 48 },   // 左侧 显示 / 下一张 / 背景 / 场景（原 w-16 h-12）
        mission:    { w: 80,  h: 80 },   // 任务（原 w-20 h-20）
        /** ⚠️ h: 0 = 高度由内容撑开。原来写的 `h-30` 是**无效类**（Tailwind 没有 30 这一档），
         *  所以它一直是内容撑开；想固定高度就填具体 px（如 120）。 */
        battle:     { w: 192, h: 0 },    // 战斗（原 w-48 + h-30[无效]）
        gacha:      { w: 256, h: 80 },   // 共鸣（原 w-64 h-20）
        bottomTool: { w: 128, h: 48 },   // 图鉴 / 商店 / 编队（原 w-32 h-12）
        gm:         { w: 64,  h: 64 },   // GM 开发者入口（原 w-16 h-16）
        bgThumb:    { w: 128, h: 80 },   // 背景选择面板里的缩略图（原 w-32 h-20）
    },

    // ══ ② 按钮内图标尺寸（逻辑 px）═════════════════════════════════════
    icon: {
        topBar: 20,      // 公告 / 设置
        ctrl: 20,        // 左侧控制四个
        sceneBadge: 10,  // 场景按钮右下角的小刷新角标
        mission: 24,
        battle: 40,
        gacha: 24,
        bottomTool: 18,
        gm: 28,
    },

    // ══ ③ 按钮通用 ═════════════════════════════════════════════════════
    labelSize: 14,       // GlassButton 主标签字号（原 text-sm）
    subLabelSize: 10,    // GlassButton 副标签字号（原 text-[10px]）
    labelGap: 4,         // 主标签上方间距（原 mt-1）
    hoverScale: 1.05,    // 悬停放大（原 whileHover 1.05）
    tapScale: 0.95,      // 按下缩小（原 whileTap 0.95）
    skewDeg: 2.5,        // 各区块的透视倾斜角（原 skewY(±2.5deg)；负值那一侧自动取反）

    // ══ ④ 顶部资源栏（右上）════════════════════════════════════════════
    res: {
        margin: 24,       // 容器留白（原 p-6）
        outerGap: 16,     // 资源组 ↔ 公告/设置按钮（原 gap-4）
        rowGap: 12,       // 三条资源之间的横向间距（原 gap-3）
        colGap: 8,        // 资源条的纵向堆叠间距（原 gap-2）
        padX: 16,         // 资源条左右内边距（原 px-4）
        padY: 8,          // 资源条上下内边距（原 py-2）
        minW: 140,        // 资源条最小宽（原 min-w-[140px]）
        minWBit: 120,     // 比特金那条（原 min-w-[120px]）
        coinIcon: 20,     // 货币图标（原 w-5 h-5）
        fontSize: 14,     // 数字字号（原 text-sm）
        plusBox: 16,      // 加号方块（原 w-4 h-4）
        plusIcon: 12,     // 加号图标（原 size 12）
    },

    // ══ ⑤ 左上玩家信息 ═════════════════════════════════════════════════
    player: {
        top: 32, left: 32,  // 原 top-8 left-8
        avatar: 64,         // 头像（原 w-16 h-16）
        avatarIcon: 24,     // 悬停时头像上的 User 图标（原 size 24）
        nameSize: 24,       // 名字字号（原 text-2xl）
        levelSize: 10,      // 等级标签字号（原 text-[10px]）
        uidSize: 12,        // UID 字号（原 text-xs）
        gap: 16,            // 头像 ↔ 文字（原 gap-4）
        lineGap: 8,         // 名字 ↔ 等级行（原 gap-2）
    },

    // ══ ⑥ 左侧控制区 ═══════════════════════════════════════════════════
    ctrlArea: { left: 40, gap: 16 },

    // ══ ⑦ 右侧行动区 ═══════════════════════════════════════════════════
    actionArea: { right: 48, gap: 16, colGap: 16 },

    // ══ ⑧ 右下工具区 ═══════════════════════════════════════════════════
    toolArea: { bottom: 48, right: 32, gap: 16 },

    // ══ ⑨ GM 开发者入口（左下）═════════════════════════════════════════
    gmArea: { bottom: 48, left: 40 },
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `LOBBY_UI` PC 端差异 —— **只有两个主旋钮**（1 = 原样）
// ──────────────────────────────────────────────────────────────────────
// 基础值经父提交 `1f3a4766` 逐条核对，**全部等于原 Tailwind 值** ⇒ 旋钮回 1 即整屏回原。
// ⚠️ 另有 24 个字段没被 `B()`/`F()` 包（`res.margin` / `player.top` / 四个区域值等）
//    ⇒ 它们两端本来就一样，**不受旋钮影响**，也没必要分叉。
// ⚠️ `btn.bgThumb` 是**死旋钮**（全文件引用 0 次）—— 已存在，先留着不动。
// ══════════════════════════════════════════════════════════════════════
const LOBBY_UI_PC_DIFF = {
    btnScale: 1,
    fontScale: 1,
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const LOBBY_UI_PC = { ...LOBBY_UI_MOBILE, ...LOBBY_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const LOBBY_UI = pickTuning(LOBBY_UI_PC, LOBBY_UI_MOBILE);

/** 尺寸换算：基础值 × 主旋钮（取整，避免半像素模糊） */
const B = (v: number) => Math.round(v * LOBBY_UI.btnScale);
/** 字号换算：基础值 × 字旋钮 */
const F = (v: number) => Math.round(v * LOBBY_UI.fontScale);
/** 尺寸速写：直接产出 CSS 宽高对象 */
const sizeStyle = (w: number, h: number): React.CSSProperties => ({
    width: B(w),
    height: h > 0 ? B(h) : 'auto',
});

// [新增] 通用磨砂透视按钮组件
const GlassButton = ({
    onClick, children, className = "", active = false, label, subLabel, style
}: {
    onClick?: () => void, children?: React.ReactNode, className?: string, active?: boolean, label?: string, subLabel?: string, style?: React.CSSProperties
}) => (
    <motion.button
        style={style}
        whileHover={{ scale: LOBBY_UI.hoverScale, backgroundColor: "rgba(255,255,255,0.15)" }}
        whileTap={{ scale: LOBBY_UI.tapScale }}
        onClick={() => {
            eventBus.emit(GameEvents.UI_CLICK);
            if (onClick) onClick();
        }}
        className={`
            relative flex flex-col items-center justify-center
            backdrop-blur-md border transition-all duration-300 group
            ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-black/20 border-white/10 text-gray-300 hover:text-white hover:border-white/30'}
            ${className}
        `}
    >
        {children}
        {label && (
            <span className="font-black tracking-widest" style={{ marginTop: LOBBY_UI.labelGap, fontSize: F(LOBBY_UI.labelSize) }}>
                {label}
            </span>
        )}
        {subLabel && (
            <span className="font-mono opacity-60" style={{ fontSize: F(LOBBY_UI.subLabelSize) }}>
                {subLabel}
            </span>
        )}
    </motion.button>
);

export const GameLobby: React.FC<GameLobbyProps> = ({
    userSystem,
    onStartBattle,
    onSwitchVideo,
    onOpenSettings,
    onGachaClick,
    onOpenMission,
    onOpenShop,
    onOpenDeck,
    onOpenAnnouncement,
    onSelectBackground,
    customBg,
    onUpdateCustomBg,
    hasClaimableReward  // [新增]
}) => {
    const [showUI, setShowUI] = useState(true);
    const { profile, collection } = userSystem;
    // [2026-09-04 账号档案面板] 由真实数据派生（去 mock：等级经验条 / 战绩 / 收藏进度）
    const userSettings = userSystem.settings;
    const br = userSystem.battleRecord;
    const totalMatches = br?.totalMatches ?? 0;
    const wins = br?.wins ?? 0;
    const losses = br?.losses ?? 0;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';
    const accLevel = profile?.level ?? 1;
    const accExp = profile?.exp ?? 0;
    const accExpToNext = getAccountExpToNext(accLevel);
    const accPct = accExpToNext > 0 ? Math.min(100, Math.round((accExp / accExpToNext) * 100)) : 100;
    const serveDays = profile?.createdAt ? Math.max(1, Math.floor((Date.now() - profile.createdAt) / 86400000)) : 1;
    const ownedCardRecord = (collection as any)?.ownedCards as Record<string, number> | undefined;
    const ownedCardsCount = ownedCardRecord ? Object.values(ownedCardRecord).filter(n => n > 0).length : 0;
    const collectibleTotal = Object.values(CARD_DB).filter((c: any) => c.isCollectible !== false).length;
    const armStockMap = readArmStock(userSettings); // [2026-09-07 数量库存]
    const armCount = Object.keys(armStockMap).filter(k => (armStockMap[k] ?? 0) > 0).length;
    const armTotal = getArmamentDefs().length;
    const cardBackTotal = PERSONALIZATION_ASSETS.cardBacks?.length ?? 17;
    const deskTotal = PERSONALIZATION_ASSETS.desks?.length ?? 10;
    const cardBackOwned = userSettings?.unlockedCardBacks?.length ?? 0;
    const deskOwned = userSettings?.unlockedDesks?.length ?? 0;
    // 代表英雄：heroes 中出场最多的卡 key（平手取先出现者）
    const heroEntries = (br?.heroes ?? {}) as Record<string, number>;
    let topHeroKey = '';
    let topHeroCount = 0;
    Object.entries(heroEntries).forEach(([k, v]) => {
        if (v > topHeroCount) { topHeroCount = v; topHeroKey = k; }
    });
    const topHeroName = topHeroKey ? ((CARD_DB as any)[topHeroKey]?.name ?? topHeroKey) : '——';
    // 1. 本地资源状态 (用于实现大厅资源的实时扣除和增加显示)
    const [localRes, setLocalRes] = useState({
        silverCoin: collection?.resources?.silverCoin || 0,
        dataGold: collection?.resources?.dataGold || 0,
        bitGold: collection?.resources?.bitGold || 0,
    });

    // 监听后端数据刷新并同步
    useEffect(() => {
        if (collection?.resources) {
            setLocalRes({
                silverCoin: collection.resources.silverCoin || 0,
                dataGold: collection.resources.dataGold || 0,
                bitGold: collection.resources.bitGold || 0,
            });
        }
    }, [collection?.resources]);

    // 2. 兑换系统状态管理
    const [exchangeConfig, setExchangeConfig] = useState<{
        type: 'DATA_TO_SILVER' | 'BIT_TO_DATA';
        sourceIcon: string; targetIcon: string;
        sourceColor: string; targetColor: string; // Tailwind边框颜色类名
        sourceName: string; targetName: string;
        costPerUnit: number; gainPerUnit: number;
        maxUnits: number;
    } | null>(null);
    const [exchangeAmount, setExchangeAmount] = useState(1);
    const [successData, setSuccessData] = useState<{ icon: string; amount: number; color: string } | null>(null);

    // 3. 长按连续增减逻辑 (Refs)
    const intervalRef = useRef<number | null>(null);
    const timeoutRef = useRef<number | null>(null);

    const stopPress = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const handleAmountChange = (action: 'add' | 'sub', currentMax: number) => {
        setExchangeAmount(prev => {
            if (action === 'add') return Math.min(prev + 1, currentMax);
            return Math.max(prev - 1, 1);
        });
    };

    const startPress = (action: 'add' | 'sub', currentMax: number) => {
        handleAmountChange(action, currentMax);
        timeoutRef.current = setTimeout(() => {
            intervalRef.current = setInterval(() => {
                handleAmountChange(action, currentMax);
            }, 100); // 连续触发速度
        }, 400); // 长按判定延迟
    };

    // 4. 打开兑换弹窗函数
    const openExchange = (type: 'DATA_TO_SILVER' | 'BIT_TO_DATA') => {
        eventBus.emit(GameEvents.UI_CLICK);
        if (type === 'DATA_TO_SILVER') {
            const maxUnits = Math.floor(localRes.dataGold / 10);
            setExchangeConfig({
                type, sourceIcon: CURRENCY_ICONS.dataGold, targetIcon: CURRENCY_ICONS.silverCoin,
                sourceColor: 'border-yellow-400', targetColor: 'border-green-400',
                sourceName: '数据金', targetName: '通用银', costPerUnit: 10, gainPerUnit: 4680, maxUnits
            });
        } else {
            const maxUnits = Math.floor(localRes.bitGold / 1);
            setExchangeConfig({
                type, sourceIcon: CURRENCY_ICONS.bitGold, targetIcon: CURRENCY_ICONS.dataGold,
                sourceColor: 'border-red-500', targetColor: 'border-yellow-400',
                sourceName: '比特金', targetName: '数据金', costPerUnit: 1, gainPerUnit: 1000, maxUnits
            });
        }
        setExchangeAmount(1);
    };

    // 5. 确认兑换结算逻辑
    const confirmExchange = () => {
        if (!exchangeConfig) return;
        const totalCost = exchangeAmount * exchangeConfig.costPerUnit;
        const totalGain = exchangeAmount * exchangeConfig.gainPerUnit;

        // 实时更新大厅资源显示
        setLocalRes(prev => {
            const next = { ...prev };
            if (exchangeConfig.type === 'DATA_TO_SILVER') {
                next.dataGold -= totalCost;
                next.silverCoin += totalGain;
            } else {
                next.bitGold -= totalCost;
                next.dataGold += totalGain;
            }
            return next;
        });

        // 记录成功界面数据并关闭原弹窗
        setSuccessData({
            icon: exchangeConfig.targetIcon,
            amount: totalGain,
            color: exchangeConfig.targetColor
        });
        setExchangeConfig(null);
    };
// --- [修改] 背景自定义系统状态 ---
    // 移除原本本地的 currentBg，改为直接使用 props 中的 customBg
    const [isBgSelecting, setIsBgSelecting] = useState(false);
    const [bgMode, setBgMode] = useState<BgType>(customBg ? customBg.type : 'movie');
    const [previewBg, setPreviewBg] = useState<BgConfig | null>(null);

    const [isSidebarTransitioning, setIsSidebarTransitioning] = useState(false);
    const [isGridOpen, setIsGridOpen] = useState(false);

    // --- [新增] GM 开发者工具状态 ---
    const [isStudioOpen, setIsStudioOpen] = useState(false);
    // [修正] 彻底更名为独立命名空间 isCodexBookOpen，绝不与原版的头像选择相册（isGalleryOpen）发生任何串线
    const [isCodexBookOpen, setIsCodexBookOpen] = useState(false);

    // --- [新增] 玩家档案与头像裁剪系统状态 ---
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [editName, setEditName] = useState("");
    const [isEditingName, setIsEditingName] = useState(false); // [新增] 控制名字编辑模式

    // 画廊与裁剪台状态
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [isCropperOpen, setIsCropperOpen] = useState(false);
    const [cropTarget, setCropTarget] = useState<{ key: string; type: 'hero' | 'unit' | 'spell'; url: string } | null>(null);
    const [cropScale, setCropScale] = useState(1);
    const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 }); // 现已改为存储“百分比(%)”

    const isDragging = useRef(false);
    // [修改] 增加 baseX 和 baseY，用于精准计算百分比拖拽增量
    const dragStart = useRef({ x: 0, y: 0, baseX: 0, baseY: 0 });

    // 动态聚合全图鉴画廊数据
    const galleryItems = React.useMemo(() => {
        const items: { type: 'hero' | 'unit' | 'spell'; key: string; url: string }[] = [];
        Object.entries(HERO_IMAGES).forEach(([key, val]) => items.push({ type: 'hero', key, url: val.base }));
        Object.entries(UNIT_IMAGES).forEach(([key, url]) => items.push({ type: 'unit', key, url }));
        Object.entries(SPELL_IMAGES).forEach(([key, url]) => items.push({ type: 'spell', key, url }));
        return items;
    }, []);

    // 核心渲染器：根据裁剪配置动态渲染1:1头像
    const renderAvatar = (config?: any, fallbackId?: string) => {
        if (config && config.scale !== undefined) {
            let src = HERO_IMAGES['lyfe']?.base;
            if (config.type === 'hero') src = HERO_IMAGES[config.imageKey]?.base || src;
            if (config.type === 'unit') src = UNIT_IMAGES[config.imageKey as keyof typeof UNIT_IMAGES] || src;
            if (config.type === 'spell') src = SPELL_IMAGES[config.imageKey as keyof typeof SPELL_IMAGES] || src;

            // 竖向图片(英雄/单位)宽撑满，横向图片(法术)高撑满，保证最短边对齐容器
            const isPortrait = config.type !== 'spell';

            return (
                <div className="w-full h-full relative overflow-hidden bg-black">
                    <img src={src} draggable={false} className="max-w-none pointer-events-none absolute"
                        style={{
                            top: '50%', left: '50%',
                            width: isPortrait ? '100%' : 'auto',
                            height: isPortrait ? 'auto' : '100%',
                            // 使用 calc 完美结合百分比偏移与缩放
                            transform: `translate(calc(-50% + ${config.offsetX}%), calc(-50% + ${config.offsetY}%)) scale(${config.scale})`
                        }}
                    />
                </div>
            );
        }
        const fallbackSrc = fallbackId ? HERO_IMAGES[fallbackId as keyof typeof HERO_IMAGES]?.base : HERO_IMAGES['lyfe'].base;
        return <img src={fallbackSrc} alt="头像" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />;
    };


    // [核心重构] 背景列表：每个角色只显示 _01 场景作为入口
    const movieList: BgConfig[] = React.useMemo(() => {
        const result: BgConfig[] = [];
        let flatIdx = 0;
        for (const entry of getHallCharacterEntries()) {
            result.push({
                type: 'movie',
                url: entry.scenes[0],
                index: flatIdx++,
                characterKey: entry.characterKey,
                sceneIndex: 0,
            });
        }
        return result;
    }, []);
    const picList: BgConfig[] = React.useMemo(() => LOADING_SCREEN_IMAGES.map((url, i) => ({ type: 'pic', url, index: i })), []);
    const currentList = bgMode === 'movie' ? movieList : picList;

    // 模式切换逻辑
    const handleToggleBgMode = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setIsSidebarTransitioning(true);
        setTimeout(() => {
            setBgMode(prev => prev === 'movie' ? 'pic' : 'movie');
            setTimeout(() => setIsSidebarTransitioning(false), 50);
        }, 300);
    };

    // 保存逻辑 (上报给 App.tsx)
    const handleSaveBg = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        if (previewBg) {
            onUpdateCustomBg(previewBg); // [修改] 交给全局接管
        }
        handleCloseBgSelect();
    };

    // [新增] NEXT 按钮智能切换逻辑
    const handleNextBg = () => {
        if (customBg) {
            const list = customBg.type === 'movie' ? movieList : picList;
            const nextIndex = (customBg.index + 1) % list.length;
            onUpdateCustomBg(list[nextIndex]); // 列表内循环切换
        } else {
            onSwitchVideo(); // 没设置自定义时，调用系统默认切换
        }
    };

    // [新增] 场景切换按钮逻辑：在当前角色的 4 个场景间循环
    const handleSwitchScene = () => {
        if (customBg?.type !== 'movie' || !customBg.characterKey) return;
        const nextSceneIdx = ((customBg.sceneIndex ?? 0) + 1) % 4;
        const scenes = getCharacterScenes(customBg.characterKey as HallCharacterKey);
        if (!scenes.length) return;
        // 直接构造新 BgConfig（保留 index 不变，使"下一张"仍能正确切到下一个角色）
        onUpdateCustomBg({
            ...customBg,
            url: scenes[nextSceneIdx],
            sceneIndex: nextSceneIdx,
        });
    };

    // 全局 ESC 按键拦截 (增强版，支持多层级窗口)
    useEffect(() => {
        if (!isBgSelecting && !isProfileOpen && !isGalleryOpen && !isCropperOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                eventBus.emit(GameEvents.UI_CLICK);

                // 逐级退出逻辑
                if (isCropperOpen) { setIsCropperOpen(false); setIsGalleryOpen(true); }
                else if (isGalleryOpen) { setIsGalleryOpen(false); setIsProfileOpen(true); }
                else if (isProfileOpen) { setIsProfileOpen(false); setShowUI(true); }
                else if (isGridOpen) setIsGridOpen(false);
                else handleCloseBgSelect();
            }
        };
        window.addEventListener('keydown', handleEsc, { capture: true });
        return () => window.removeEventListener('keydown', handleEsc, { capture: true });
    }, [isBgSelecting, isGridOpen, isProfileOpen, isGalleryOpen, isCropperOpen]);

    // 打开背景设置面板
    const handleOpenBgSelect = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setShowUI(false);
        setIsBgSelecting(true);
        setPreviewBg(customBg);  // [修改] 记录打开时的全局背景用于撤销
        if (onSelectBackground) onSelectBackground();
    };

    // 取消并关闭背景设置面板
    const handleCloseBgSelect = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setIsBgSelecting(false);
        setIsGridOpen(false);
        setIsSidebarTransitioning(false);
        setPreviewBg(null);
        setShowUI(true);
    };

    return (
        <div className="relative w-full h-full overflow-hidden">

            {/* --- [修改] 预览覆写层 --- */}
            {/* 现在平时由 App.tsx 在底层渲染，GameLobby 仅在“正在设置预览”时进行遮盖 */}
            <AnimatePresence>
                {isBgSelecting && previewBg && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[5] bg-black"
                    >
                        {previewBg.type === 'pic' ? (
                            <img src={previewBg.url} className="w-full h-full object-cover" alt="预览背景" />
                        ) : (
                            // [2026-10-15 莉莉子 · 安卓] 补 poster 兜底：影片就绪前先显示首帧静图，
                            //   否则安卓 WebView 会画媒体层占位（纯灰底 + 黑色播放图标）。PC 行为不变。
                            <LoopVideo src={previewBg.url} poster={getHallMoviePoster(previewBg.url)} className="w-full h-full object-cover" priority={-20} />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 顶部兜底条 (提升 z-index 到 10，使其覆盖在自定义背景之上) */}
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-gray-200/10 to-transparent blur-2xl z-[10] pointer-events-none" />

            {/* --- 1. 顶部资源栏（尺寸来自顶部 🎛️ LOBBY_UI.res / btn.topIcon）--- */}
            <div
                // 外层：负责定位和进出场位移 (Tailwind transition)
                className={`absolute top-0 right-0 z-50 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'}`}
                style={{ padding: LOBBY_UI.res.margin }}
            >
                {/* 内层：负责透视变形 (Skew) */}
                <div
                    className="flex items-start"
                    style={{ transform: `skewY(${LOBBY_UI.skewDeg}deg)`, gap: LOBBY_UI.res.outerGap }}
                >
                    {/* 资源列表 */}
                    <div className="flex flex-col items-end" style={{ gap: LOBBY_UI.res.colGap }}>
                        <div className="flex" style={{ gap: LOBBY_UI.res.rowGap }}>
                            {/* 1. 通用银 (SILVER) */}
                            <div
                                className="flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-sm justify-between hover:bg-black/60 transition-colors"
                                style={{
                                    gap: LOBBY_UI.res.rowGap,
                                    padding: `${B(LOBBY_UI.res.padY)}px ${B(LOBBY_UI.res.padX)}px`,
                                    minWidth: B(LOBBY_UI.res.minW),
                                }}
                            >
                                <div className="flex items-center" style={{ gap: LOBBY_UI.res.colGap }}>
                                    <img src={CURRENCY_ICONS.silverCoin} className="opacity-90" style={sizeStyle(LOBBY_UI.res.coinIcon, LOBBY_UI.res.coinIcon)} alt="银币" />
                                    <span className="font-mono font-bold text-gray-200" style={{ fontSize: F(LOBBY_UI.res.fontSize) }}>{localRes.silverCoin}</span>
                                </div>
                                <div
                                    onClick={() => openExchange('DATA_TO_SILVER')}
                                    className="bg-gray-700/50 hover:bg-blue-600 rounded-sm flex items-center justify-center cursor-pointer transition-colors"
                                    style={sizeStyle(LOBBY_UI.res.plusBox, LOBBY_UI.res.plusBox)}
                                >
                                    <Plus size={B(LOBBY_UI.res.plusIcon)} className="text-white" />
                                </div>
                            </div>

                            {/* 2. 数据金 (DATA) */}
                            <div
                                className="flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-sm justify-between hover:bg-black/60 transition-colors"
                                style={{
                                    gap: LOBBY_UI.res.rowGap,
                                    padding: `${B(LOBBY_UI.res.padY)}px ${B(LOBBY_UI.res.padX)}px`,
                                    minWidth: B(LOBBY_UI.res.minW),
                                }}
                            >
                                <div className="flex items-center" style={{ gap: LOBBY_UI.res.colGap }}>
                                    <img src={CURRENCY_ICONS.dataGold} className="opacity-90" style={sizeStyle(LOBBY_UI.res.coinIcon, LOBBY_UI.res.coinIcon)} alt="数据金" />
                                    <span className="font-mono font-bold text-gray-200" style={{ fontSize: F(LOBBY_UI.res.fontSize) }}>{localRes.dataGold}</span>
                                </div>
                                <div
                                    onClick={() => openExchange('BIT_TO_DATA')}
                                    className="bg-gray-700/50 hover:bg-blue-600 rounded-sm flex items-center justify-center cursor-pointer transition-colors"
                                    style={sizeStyle(LOBBY_UI.res.plusBox, LOBBY_UI.res.plusBox)}
                                >
                                    <Plus size={B(LOBBY_UI.res.plusIcon)} className="text-white" />
                                </div>
                            </div>

                            {/* 3. 比特金 (BIT) - 移除加号 */}
                            <div
                                className="flex items-center bg-black/40 backdrop-blur-md border border-white/10 rounded-sm justify-between hover:bg-black/60 transition-colors"
                                style={{
                                    gap: LOBBY_UI.res.rowGap,
                                    padding: `${B(LOBBY_UI.res.padY)}px ${B(LOBBY_UI.res.padX)}px`,
                                    minWidth: B(LOBBY_UI.res.minWBit),
                                }}
                            >
                                <div className="flex items-center" style={{ gap: LOBBY_UI.res.colGap }}>
                                    <img src={CURRENCY_ICONS.bitGold} className="opacity-90" style={sizeStyle(LOBBY_UI.res.coinIcon, LOBBY_UI.res.coinIcon)} alt="比特金" />
                                    <span className="font-mono font-bold text-yellow-100" style={{ fontSize: F(LOBBY_UI.res.fontSize) }}>{localRes.bitGold}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* [2026-08-09] 公告按钮：置于设置（齿轮）按钮左侧，仅图标 */}
                    <GlassButton
                        onClick={onOpenAnnouncement}
                        className="rounded-sm"
                        style={sizeStyle(LOBBY_UI.btn.topIcon.w, LOBBY_UI.btn.topIcon.h)}
                    >
                        <Megaphone size={B(LOBBY_UI.icon.topBar)} className="text-gray-300 group-hover:text-white transition-colors duration-300" />
                    </GlassButton>

                    {/* 设置按钮 */}
                    <GlassButton
                        onClick={onOpenSettings}
                        className="rounded-sm"
                        style={sizeStyle(LOBBY_UI.btn.topIcon.w, LOBBY_UI.btn.topIcon.h)}
                    >
                        <Settings size={B(LOBBY_UI.icon.topBar)} className="group-hover:rotate-90 transition-transform duration-500" />
                    </GlassButton>
                </div>
            </div>

            {/* --- 2. 玩家信息（尺寸来自顶部 🎛️ LOBBY_UI.player）--- */}
            <div
                className={`absolute z-50 transition-all duration-500 ${showUI ? 'translate-x-0 opacity-100' : '-translate-x-20 opacity-0'}`}
                style={{ top: LOBBY_UI.player.top, left: LOBBY_UI.player.left }}
            >
                <div
                    className="flex items-center cursor-pointer group"
                    style={{ gap: LOBBY_UI.player.gap, transform: `skewY(${-LOBBY_UI.skewDeg}deg)` }}
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_CLICK);
                        setEditName(profile?.displayName || 'ADJUTANT');
                        setIsProfileOpen(true);
                        setShowUI(false);
                    }}
                >
                    {/* [修改] 头像容器接入伪裁剪渲染器与悬停遮罩 */}
                    <div
                        className="rounded-sm border-2 border-white/20 overflow-hidden shadow-lg relative bg-black/50 group-hover:border-blue-400 transition-colors"
                        style={sizeStyle(LOBBY_UI.player.avatar, LOBBY_UI.player.avatar)}
                    >
                        {renderAvatar(profile?.avatarConfig, profile?.avatarId)}
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <User size={B(LOBBY_UI.player.avatarIcon)} className="text-white drop-shadow-md" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-white tracking-widest drop-shadow-md" style={{ fontSize: F(LOBBY_UI.player.nameSize) }}>{profile?.displayName || 'ADJUTANT'}</span>
                        <div className="flex items-center" style={{ gap: LOBBY_UI.player.lineGap }}>
                            <span
                                className="bg-yellow-500/20 text-yellow-300 font-bold rounded-sm border border-yellow-500/30"
                                style={{ padding: `${B(2)}px ${B(8)}px`, fontSize: F(LOBBY_UI.player.levelSize) }}
                            >
                                账号 Lv.{profile?.level || 1}
                            </span>
                            <span className="text-white font-mono" style={{ fontSize: F(LOBBY_UI.player.uidSize) }}>UID: {userSystem.userId.slice(0, 8)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 3. 左侧视觉控制区（尺寸来自顶部 🎛️ LOBBY_UI.ctrlArea / btn.ctrlSmall）--- */}
            <div
                // [修改] 增加针对 isBgSelecting 的左侧退场位移
                className={`absolute top-1/2 -translate-y-1/2 flex flex-col z-40 transition-all duration-500 ${isBgSelecting ? '-translate-x-32 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}
                style={{ left: LOBBY_UI.ctrlArea.left, gap: LOBBY_UI.ctrlArea.gap }}
            >
                <div
                    className="flex flex-row items-center"
                    style={{ transform: `skewY(${-LOBBY_UI.skewDeg}deg)`, gap: LOBBY_UI.ctrlArea.gap }}
                >
                    <GlassButton
                        onClick={() => setShowUI(!showUI)}
                        className={`rounded-sm transition-opacity duration-500 ${showUI ? 'opacity-100' : 'opacity-30 hover:opacity-100'}`}
                        style={sizeStyle(LOBBY_UI.btn.ctrlSmall.w, LOBBY_UI.btn.ctrlSmall.h)}
                        label={showUI ? "隐藏" : "显示"}
                    >
                        {showUI ? <Eye size={B(LOBBY_UI.icon.ctrl)} /> : <EyeOff size={B(LOBBY_UI.icon.ctrl)} />}
                    </GlassButton>

                    <div
                        className={`flex flex-row transition-all duration-500 ${showUI ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}
                        style={{ gap: LOBBY_UI.ctrlArea.gap }}
                    >
                        {/* [修改] 将原先单纯的 onSwitchVideo 替换为智能切换 handleNextBg */}
                        <GlassButton
                            onClick={handleNextBg}
                            className="rounded-sm"
                            style={sizeStyle(LOBBY_UI.btn.ctrlSmall.w, LOBBY_UI.btn.ctrlSmall.h)}
                            label="下一张"
                        >
                            <RefreshCw size={B(LOBBY_UI.icon.ctrl)} />
                        </GlassButton>
                        <GlassButton
                            onClick={handleOpenBgSelect}
                            className="rounded-sm"
                            style={sizeStyle(LOBBY_UI.btn.ctrlSmall.w, LOBBY_UI.btn.ctrlSmall.h)}
                            label="背景"
                        >
                            <ImageIcon size={B(LOBBY_UI.icon.ctrl)} />
                        </GlassButton>
                        {/* [新增] 场景切换按钮：仅在当前背景为大厅角色视频时可用 */}
                        <GlassButton
                            onClick={handleSwitchScene}
                            className={`rounded-sm transition-all duration-300 ${customBg?.characterKey ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}
                            style={sizeStyle(LOBBY_UI.btn.ctrlSmall.w, LOBBY_UI.btn.ctrlSmall.h)}
                            label="场景"
                        >
                            <span className="relative inline-flex items-center justify-center">
                                <Camera size={B(LOBBY_UI.icon.ctrl)} />
                                <RefreshCw size={B(LOBBY_UI.icon.sceneBadge)} className="absolute -bottom-1 -right-1 text-orange-400 drop-shadow-md" />
                            </span>
                        </GlassButton>
                        {/* [撤销] 移除左侧违和的任务按钮，让辅助功能区保持纯粹 */}
                    </div>
                </div>
            </div>

            {/* --- 4. 右侧核心行动区（尺寸来自顶部 🎛️ LOBBY_UI.actionArea / btn.mission|battle|gacha）--- */}
            <AnimatePresence>
                {showUI && (
                    <div
                        // 外层：绝对定位容器 (不负责动画，避免 conflict)
                        // [关键修复] 将 skew 移到这里！
                        // 因为这里是静态的 div，不会被 framer motion 的 animate 属性覆盖 transform
                        className="absolute bottom-1/2 -translate-y-1/2 z-40"
                        style={{ right: LOBBY_UI.actionArea.right, transform: `skewY(${LOBBY_UI.skewDeg}deg)` }}
                    >
                        <motion.div
                            // 内层：负责进出场动画 (x, opacity)
                            initial={{ x: 100, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 100, opacity: 0 }}
                            className="flex items-center"
                            style={{ gap: LOBBY_UI.actionArea.gap }}
                        >
                            {/* [核心恢复] 让 TASK 带着极其抢眼的脉冲黄点回归行动铁三角！ */}
                            <GlassButton
                                onClick={onOpenMission}
                                className="rounded-sm bg-blue-900 border-blue-500/30 hover:bg-blue-800 text-blue-200"
                                style={sizeStyle(LOBBY_UI.btn.mission.w, LOBBY_UI.btn.mission.h)}
                                label="任务"
                            >
                                <div className="relative">
                                    <ClipboardList size={B(LOBBY_UI.icon.mission)} className="text-blue-300" />
                                    {hasClaimableReward && (
                                        <span className="absolute -top-2 -right-4 w-4 h-4 bg-yellow-400 rounded-full border-2 border-yellow-200 shadow-[0_0_15px_yellow] animate-pulse" />
                                    )}
                                </div>
                            </GlassButton>

                            <div className="flex flex-col" style={{ gap: LOBBY_UI.actionArea.colGap }}>
                                <GlassButton
                                    onClick={() => {eventBus.emit(GameEvents.LOBBY_START_BATTLE);onStartBattle();}}
                                    className="rounded-sm bg-orange-700 border-orange-500/50 hover:bg-orange-600 text-orange-100"
                                    style={sizeStyle(LOBBY_UI.btn.battle.w, LOBBY_UI.btn.battle.h)}
                                    label="战斗"
                                    subLabel="行动开始"
                                >
                                    <Sword size={B(LOBBY_UI.icon.battle)} className="text-orange-200 mb-2" />
                                </GlassButton>

                                <GlassButton
                                    onClick={onGachaClick}
                                    className="rounded-sm bg-purple-900 border-purple-500/50 hover:bg-purple-800 text-purple-100"
                                    style={sizeStyle(LOBBY_UI.btn.gacha.w, LOBBY_UI.btn.gacha.h)}
                                    label="共鸣"
                                >
                                    <div className="flex items-center" style={{ gap: B(12) }}>
                                        <Hexagon size={B(LOBBY_UI.icon.gacha)} className="text-purple-300" />
                                        <span className="text-purple-100/60 font-mono" style={{ fontSize: F(12) }}>新人入队</span>
                                    </div>
                                </GlassButton>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- 5. 右下角工具区（尺寸来自顶部 🎛️ LOBBY_UI.toolArea / btn.bottomTool）--- */}
            <div
                // 外层：负责位移
                className={`absolute z-40 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}
                style={{ bottom: LOBBY_UI.toolArea.bottom, right: LOBBY_UI.toolArea.right }}
            >
                {/* 内层：负责透视 */}
                <div
                    className="flex"
                    style={{ transform: `skewY(${LOBBY_UI.skewDeg}deg)`, gap: LOBBY_UI.toolArea.gap }}
                >
                    {/* [修正] 呼叫正确的状态机，并同步执行 setShowUI(false) 瞬间隐藏大厅所有的倾斜按钮面板 */}
                    <GlassButton
                        onClick={() => {
                            setIsCodexBookOpen(true);
                            setShowUI(false);
                        }}
                        className="rounded-sm flex-row"
                        style={{ ...sizeStyle(LOBBY_UI.btn.bottomTool.w, LOBBY_UI.btn.bottomTool.h), gap: B(8) }}
                        label="图鉴"
                    >
                        <ClipboardList size={B(LOBBY_UI.icon.bottomTool)} />
                    </GlassButton>

                    <GlassButton
                        onClick={onOpenShop}
                        className="rounded-sm flex-row"
                        style={{ ...sizeStyle(LOBBY_UI.btn.bottomTool.w, LOBBY_UI.btn.bottomTool.h), gap: B(8) }}
                        label="商店"
                    >
                        <ShoppingBag size={B(LOBBY_UI.icon.bottomTool)} />
                    </GlassButton>

                    <GlassButton
                        onClick={onOpenDeck}
                        className="rounded-sm flex-row"
                        style={{ ...sizeStyle(LOBBY_UI.btn.bottomTool.w, LOBBY_UI.btn.bottomTool.h), gap: B(8) }}
                        label="编队"
                    >
                        <Users size={B(LOBBY_UI.icon.bottomTool)} />
                    </GlassButton>
                </div>
            </div>

            {/* --- 6. GM 开发者工具入口 (仅管理员可见)（尺寸来自顶部 🎛️ LOBBY_UI.gmArea / btn.gm）--- */}
            {userSystem.userId === 'dev_full_admin' && (
                <div
                    className={`absolute z-50 transition-all duration-500 ${showUI ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}
                    style={{ bottom: LOBBY_UI.gmArea.bottom, left: LOBBY_UI.gmArea.left }}
                >
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsStudioOpen(true); setShowUI(false); }}
                        className="rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.6)] border-2 border-blue-300 transition-all hover:scale-110 hover:rotate-12 group"
                        style={sizeStyle(LOBBY_UI.btn.gm.w, LOBBY_UI.btn.gm.h)}
                        title="开发者工作室"
                    >
                        <Wrench size={B(LOBBY_UI.icon.gm)} className="text-white drop-shadow-md group-hover:text-yellow-300 transition-colors" />
                    </button>
                </div>
            )}

        {/* ================= 新增：兑换设置弹窗 ================= */}
            <AnimatePresence>
                {exchangeConfig && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
                            className="bg-gray-900/90 border border-white/20 p-8 rounded-sm shadow-2xl flex flex-col items-center gap-6 min-w-[400px]"
                        >
                            {/* 标题 */}
                            <h2 className="text-lg text-white font-bold tracking-widest text-center">
                                是否将 {exchangeAmount * exchangeConfig.costPerUnit} {exchangeConfig.sourceName}兑换成 {exchangeAmount * exchangeConfig.gainPerUnit} {exchangeConfig.targetName}
                            </h2>

                            {/* 图标展示区 */}
                            <div className="flex items-center gap-8 my-4">
                                {/* 消耗图标 */}
                                <div className={`relative w-20 h-20 border-2 ${exchangeConfig.sourceColor} bg-transparent flex items-center justify-center rounded-sm`}>
                                    <img src={exchangeConfig.sourceIcon} className="w-12 h-12 object-contain" alt="来源" />
                                    <span className="absolute bottom-1 left-1 text-white text-xs font-mono">{exchangeAmount * exchangeConfig.costPerUnit}</span>
                                </div>

                                {/* 箭头 */}
                                <span className="text-gray-400 font-black tracking-tighter text-xl">》》》</span>

                                {/* 获得图标 */}
                                <div className={`relative w-20 h-20 border-2 ${exchangeConfig.targetColor} bg-transparent flex items-center justify-center rounded-sm`}>
                                    <img src={exchangeConfig.targetIcon} className="w-12 h-12 object-contain" alt="目标" />
                                    <span className="absolute bottom-1 left-1 text-white text-xs font-mono">{exchangeAmount * exchangeConfig.gainPerUnit}</span>
                                </div>
                            </div>

                            {/* 数量控制区 */}
                            <div className="flex items-center gap-4 border border-white/10 bg-black/50 p-2 rounded-sm">
                                {/* 减号按钮 */}
                                <button
                                    onMouseDown={() => { eventBus.emit(GameEvents.UI_CLICK); startPress('sub', exchangeConfig.maxUnits); }}
                                    onMouseUp={stopPress} onMouseLeave={stopPress}
                                    onTouchStart={() => startPress('sub', exchangeConfig.maxUnits)}
                                    onTouchEnd={stopPress}
                                    disabled={exchangeAmount <= 1}
                                    className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${exchangeAmount <= 1 ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'}`}
                                >
                                    <div className="w-4 h-0.5 bg-white rounded-full" />
                                </button>

                                {/* 文本框 */}
                                <input
                                    type="number"
                                    value={exchangeAmount}
                                    onChange={(e) => {
                                        let val = parseInt(e.target.value);
                                        if (isNaN(val) || val < 1) val = 1;
                                        if (val > exchangeConfig.maxUnits) val = Math.max(1, exchangeConfig.maxUnits);
                                        setExchangeAmount(val);
                                    }}
                                    className="w-20 bg-transparent text-center text-white font-mono text-xl outline-none"
                                />

                                {/* 加号按钮 */}
                                <button
                                    onMouseDown={() => { eventBus.emit(GameEvents.UI_CLICK); startPress('add', exchangeConfig.maxUnits); }}
                                    onMouseUp={stopPress} onMouseLeave={stopPress}
                                    onTouchStart={() => startPress('add', exchangeConfig.maxUnits)}
                                    onTouchEnd={stopPress}
                                    disabled={exchangeAmount >= exchangeConfig.maxUnits || exchangeConfig.maxUnits === 0}
                                    className={`w-10 h-10 flex items-center justify-center rounded-sm transition-colors ${exchangeAmount >= exchangeConfig.maxUnits || exchangeConfig.maxUnits === 0 ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700'}`}
                                >
                                    <Plus size={20} className="text-white" />
                                </button>
                            </div>

                            {/* 底部操作按钮 */}
                            <div className="flex w-full gap-4 mt-2">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setExchangeConfig(null); }}
                                    className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white flex items-center justify-center gap-2 rounded-sm transition-colors"
                                >
                                    <X size={18} /> 取消
                                </button>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); confirmExchange(); }}
                                    disabled={exchangeConfig.maxUnits === 0}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white flex items-center justify-center gap-2 rounded-sm transition-colors"
                                >
                                    <Check size={18} /> 确定
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：兑换成功弹窗 ================= */}
            <AnimatePresence>
                {successData && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center gap-8"
                        >
                            <h1 className="text-3xl text-white font-black tracking-[0.3em] drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                                兑换成功
                            </h1>

                            <div className="flex flex-col items-center gap-4">
                                <div className={`w-32 h-32 border-2 ${successData.color} bg-transparent flex items-center justify-center rounded-sm shadow-[0_0_30px_rgba(255,255,255,0.1)]`}>
                                    <img src={successData.icon} className="w-20 h-20 object-contain drop-shadow-xl" alt="奖励" />
                                </div>
                                <span className="text-2xl font-mono text-white tracking-widest">
                                    + {successData.amount}
                                </span>
                            </div>

                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSuccessData(null); }}
                                className="w-16 h-16 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all hover:scale-110"
                            >
                                <Check size={32} className="text-white" />
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：大厅背景自定义系统 UI (修复退场动画) ================= */}

            {/* --- A. 全屏网格面板 --- */}
            <AnimatePresence>
                {isBgSelecting && isGridOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-[50] bg-white/10 backdrop-blur-xl p-16 pt-24 overflow-y-auto no-scrollbar"
                    >
                        <div className="grid grid-cols-4 gap-8 max-w-7xl mx-auto">
                            {currentList.map(bg => (
                                <div
                                    key={bg.url}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewBg(bg); }}
                                    className={`relative w-full aspect-video rounded-sm overflow-hidden cursor-pointer transition-all duration-300 shadow-lg ${previewBg?.url === bg.url ? 'border-4 border-blue-500 scale-105 shadow-[0_0_20px_rgba(37,99,235,0.5)]' : 'border-2 border-white/20 hover:border-white/50 hover:scale-105'}`}
                                >
                                    {bg.type === 'movie' ? (
                                        // [2026-10-15 莉莉子 · 安卓] 缩略图由 `<video preload="metadata">` 改为首帧静图：
                                        //   `preload="metadata"` **永远解不出第一帧** ⇒ 安卓 WebView 由媒体层画占位
                                        //   （纯灰底 + 黑色播放图标），且**永久**不会变。静图与影片同名换扩展名，一一对应。
                                        <img src={getHallMoviePoster(bg.url)} className="w-full h-full object-cover" alt="背景选项" />
                                    ) : (
                                        <img src={bg.url} className="w-full h-full object-cover" alt="背景选项" />
                                    )}
                                    {/* 视频中间的播放图标（设计上的"这是影片"标记，保留） */}
                                    {bg.type === 'movie' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play size={32} className="text-white/70" fill="currentColor" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- B. 左侧滑动模块 --- */}
            <AnimatePresence>
                {isBgSelecting && !isGridOpen && (
                    <motion.div
                        // 动态控制 x 坐标实现两段式进退场
                        initial={{ x: -300, opacity: 0 }}
                        animate={{ x: isSidebarTransitioning ? -300 : 0, opacity: isSidebarTransitioning ? 0 : 1 }}
                        exit={{ x: -300, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute left-10 top-[15%] bottom-[15%] w-64 flex flex-col z-[55] bg-black/40 backdrop-blur-md border border-white/10 rounded-sm p-4"
                    >
                        {/* 顶部模式切换按钮 */}
                        <GlassButton
                            onClick={handleToggleBgMode}
                            className="w-full h-16 rounded-sm bg-white/10 hover:bg-white/20 mb-4 flex-shrink-0"
                            label={bgMode === 'movie' ? 'MOVIE' : 'PIC'}
                        />

                        {/* 资源列表滚动区 */}
                        <div className="flex-1 overflow-y-auto flex flex-col gap-4 no-scrollbar pr-2">
                            {currentList.map(bg => (
                                <div
                                    key={bg.url}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewBg(bg); }}
                                    className={`relative w-full h-28 rounded-sm overflow-hidden cursor-pointer transition-all duration-300 flex-shrink-0 ${previewBg?.url === bg.url ? 'border-2 border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'border border-white/20 hover:border-white/50'}`}
                                >
                                    {bg.type === 'movie' ? (
                                        // [2026-10-15 莉莉子 · 安卓] 同上方缩略图：`preload="metadata"` 解不出帧 ⇒
                                        //   安卓 WebView 永久灰块。侧栏这里是**同一处病根的第二个渲染点**。
                                        <img src={getHallMoviePoster(bg.url)} className="w-full h-full object-cover opacity-80" alt="背景选项" />
                                    ) : (
                                        <img src={bg.url} className="w-full h-full object-cover opacity-80" alt="背景选项" />
                                    )}
                                    {bg.type === 'movie' && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                            <Play size={24} className="text-white/60" fill="currentColor" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 侧边展开网格按钮 (半透明三角形右箭头) */}
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(true); }}
                            className="absolute -right-8 top-1/2 -translate-y-1/2 w-8 h-24 bg-black/40 backdrop-blur-md border border-white/10 border-l-0 rounded-r-sm flex items-center justify-center hover:bg-black/60 transition-colors group"
                        >
                            <ChevronRight size={24} className="text-gray-400 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- C. 右下角操作区 (确保 z-index 最高，覆盖在网格和侧边栏之上) --- */}
            <AnimatePresence>
                {isBgSelecting && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="absolute right-12 bottom-12 z-[60] flex gap-6"
                    >
                        <button
                            onClick={handleCloseBgSelect}
                            className="w-16 h-16 rounded-sm bg-gray-600/80 hover:bg-gray-500 text-white flex items-center justify-center transition-all hover:scale-105 border border-white/20"
                        >
                            <X size={32} />
                        </button>
                        <button
                            onClick={handleSaveBg}
                            className="w-16 h-16 rounded-sm bg-blue-600/80 hover:bg-blue-500 text-white flex items-center justify-center transition-all hover:scale-105 shadow-[0_0_15px_rgba(37,99,235,0.5)] border border-blue-400/50"
                        >
                            <Check size={32} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：玩家档案与头像自定义系统 ================= */}
            <AnimatePresence>
                {/* 1. 玩家档案面板 (Profile Modal) */}
                {isProfileOpen && !isGalleryOpen && !isCropperOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md"
                    >
                        <div className="bg-slate-900 border border-white/10 shadow-2xl flex flex-col" style={{ width: PROFILE_UI.panelWidth, borderRadius: PROFILE_UI.panelRadius, padding: PROFILE_UI.panelPad, gap: PROFILE_UI.panelGap, borderWidth: PROFILE_UI.panelBorderWidth, borderStyle: 'solid', transform: 'skewY(-1deg)' }}>
                            {/* 顶部信息 */}
                            <div className="flex items-start" style={{ gap: PROFILE_UI.topRowGap }}>
                                {/* 大号动态头像 */}
                                <div className="border-gray-600 overflow-hidden relative group" style={{ width: PROFILE_UI.avatarSize, height: PROFILE_UI.avatarSize, borderRadius: PROFILE_UI.avatarRadius, borderWidth: PROFILE_UI.avatarBorderWidth, borderStyle: 'solid' }}>
                                    {renderAvatar(profile?.avatarConfig, profile?.avatarId)}
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGalleryOpen(true); }} // [新增] 音效
                                        className="absolute bottom-0 w-full bg-black/70 text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center"
                                        style={{ paddingTop: PROFILE_UI.modifyPadY, paddingBottom: PROFILE_UI.modifyPadY, fontSize: PROFILE_UI.modifyFontSize, gap: PROFILE_UI.modifyGap }}
                                    >
                                        <Crop size={PROFILE_UI.modifyIconSize} /> MODIFY
                                    </button>
                                </div>
                                {/* 名字与等级 */}
                                <div className="flex-1 flex flex-col" style={{ gap: PROFILE_UI.nameColGap }}>
                                    <div className="flex items-center border-b border-white/10" style={{ gap: PROFILE_UI.nameRowGap, paddingBottom: PROFILE_UI.nameRowPadBottom, height: PROFILE_UI.nameRowHeight, borderBottomWidth: PROFILE_UI.nameRowBorderWidth, borderBottomStyle: 'solid' }}>
                                        {isEditingName ? (
                                            <input
                                                autoFocus
                                                value={editName} onChange={e => setEditName(e.target.value)}
                                                onBlur={() => {
                                                    setIsEditingName(false);
                                                    if (editName !== profile?.displayName && editName.trim().length > 0) {
                                                        userSystem.updateProfile({ displayName: editName });
                                                    } else {
                                                        setEditName(profile?.displayName || 'ADJUTANT'); // 恢复原名
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.currentTarget.blur(); // 回车触发 onBlur 保存
                                                    if (e.key === 'Escape') { setEditName(profile?.displayName || 'ADJUTANT'); setIsEditingName(false); }
                                                }}
                                                className="bg-black/50 border border-blue-500/50 font-black text-white outline-none flex-1 tracking-widest shadow-[0_0_10px_rgba(37,99,235,0.2)]"
                                                style={{ fontSize: PROFILE_UI.nameInputFontSize, paddingLeft: PROFILE_UI.nameInputPadX, paddingRight: PROFILE_UI.nameInputPadX, paddingTop: PROFILE_UI.nameInputPadY, paddingBottom: PROFILE_UI.nameInputPadY, borderRadius: PROFILE_UI.nameInputRadius }}
                                                maxLength={12}
                                            />
                                        ) : (
                                            <>
                                                <span className="font-black text-white outline-none flex-1 tracking-widest truncate" style={{ fontSize: PROFILE_UI.nameFontSize }}>
                                                    {profile?.displayName || 'ADJUTANT'}
                                                </span>
                                                <button
                                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setEditName(profile?.displayName || 'ADJUTANT'); setIsEditingName(true); }}
                                                    className="bg-white/5 hover:bg-white/20 text-gray-400 hover:text-white transition-colors"
                                                    style={{ padding: PROFILE_UI.editBtnPad, borderRadius: PROFILE_UI.editBtnRadius }}
                                                >
                                                    <Edit3 size={PROFILE_UI.editIconSize} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center font-mono text-gray-400" style={{ gap: PROFILE_UI.uidRowGap, fontSize: PROFILE_UI.uidFontSize }}>
                                        <span>UID: {userSystem.userId}</span>
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); navigator.clipboard.writeText(userSystem.userId); }} className="hover:text-white"><Copy size={PROFILE_UI.copyIconSize} /></button> {/* [新增] 音效 */}
                                    </div>
                                    <div className="flex items-center" style={{ gap: PROFILE_UI.lvRowGap, marginTop: PROFILE_UI.lvRowMarginTop }}>
                                        <span
                                            className="bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30"
                                            style={{ paddingLeft: PROFILE_UI.lvBadgePadX, paddingRight: PROFILE_UI.lvBadgePadX, paddingTop: PROFILE_UI.lvBadgePadY, paddingBottom: PROFILE_UI.lvBadgePadY, borderRadius: PROFILE_UI.lvBadgeRadius, borderWidth: PROFILE_UI.lvBadgeBorderWidth, borderStyle: 'solid' }}
                                        >账号 LV.{accLevel}</span>
                                        <div className="flex-1 bg-gray-800 rounded-full overflow-hidden border border-white/5" style={{ height: PROFILE_UI.expBarHeight, borderWidth: PROFILE_UI.expBarBorderWidth, borderStyle: 'solid' }}>
                                            <div className="h-full bg-yellow-500" style={{ width: `${accPct}%` }} />
                                        </div>
                                    </div>
                                    <div className="font-mono text-gray-500" style={{ fontSize: PROFILE_UI.expFontSize }}>
                                        EXP {accExp} / {accExpToNext > 0 ? accExpToNext : 'MAX'} · 服役 {serveDays} 天
                                    </div>
                                </div>
                            </div>

                            {/* 真实战绩（持久记录，非 mock） */}
                            <div className="grid grid-cols-3 border-t border-white/10" style={{ gap: PROFILE_UI.gridGap, paddingTop: PROFILE_UI.sectionPadTop, borderTopWidth: PROFILE_UI.sectionBorderWidth, borderTopStyle: 'solid' }}>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid' }}>
                                    <span className="text-gray-400 font-mono" style={{ fontSize: PROFILE_UI.statLabelFontSize, marginBottom: PROFILE_UI.statLabelMarginBottom }}>TOTAL MATCHES</span>
                                    <span className="font-black text-white" style={{ fontSize: PROFILE_UI.statValueFontSize }}>{totalMatches}</span>
                                </div>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid' }}>
                                    <span className="text-gray-400 font-mono" style={{ fontSize: PROFILE_UI.statLabelFontSize, marginBottom: PROFILE_UI.statLabelMarginBottom }}>WINS / LOSS</span>
                                    <span className="font-black text-green-400" style={{ fontSize: PROFILE_UI.statValueFontSize }}>{wins}<span className="text-white/40 font-mono" style={{ fontSize: PROFILE_UI.statSubFontSize }}> / {losses}</span></span>
                                </div>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid' }}>
                                    <span className="text-gray-400 font-mono" style={{ fontSize: PROFILE_UI.statLabelFontSize, marginBottom: PROFILE_UI.statLabelMarginBottom }}>WIN RATE</span>
                                    <span className="font-black text-green-400" style={{ fontSize: PROFILE_UI.statValueFontSize }}>{winRate}%</span>
                                </div>
                            </div>
                            <div className="text-center font-mono text-gray-500" style={{ fontSize: PROFILE_UI.heroLineFontSize }}>
                                代表英雄：<span className="text-blue-400 font-bold tracking-widest">{topHeroName}</span>
                            </div>

                            {/* 收藏 / 养成进度（真实数据） */}
                            <div className="grid grid-cols-3 border-t border-white/10" style={{ gap: PROFILE_UI.gridGap, paddingTop: PROFILE_UI.sectionPadTop, borderTopWidth: PROFILE_UI.sectionBorderWidth, borderTopStyle: 'solid' }}>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid', gap: PROFILE_UI.collectCardGap }}>
                                    <span className="text-gray-400 font-mono tracking-widest" style={{ fontSize: PROFILE_UI.collectLabelFontSize, marginBottom: PROFILE_UI.collectLabelMarginBottom }}>卡牌收藏</span>
                                    <span className="font-black text-white" style={{ fontSize: PROFILE_UI.collectValueFontSize }}>{ownedCardsCount}<span className="text-white/40" style={{ fontSize: PROFILE_UI.collectSubFontSize }}> / {collectibleTotal}</span></span>
                                    <div className="w-full bg-gray-800 rounded-full overflow-hidden" style={{ height: PROFILE_UI.collectBarHeight }}>
                                        <div className="h-full bg-blue-500" style={{ width: `${collectibleTotal ? Math.min(100, (ownedCardsCount / collectibleTotal) * 100) : 0}%` }} />
                                    </div>
                                </div>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid', gap: PROFILE_UI.collectCardGap }}>
                                    <span className="text-gray-400 font-mono tracking-widest" style={{ fontSize: PROFILE_UI.collectLabelFontSize, marginBottom: PROFILE_UI.collectLabelMarginBottom }}>武装收藏</span>
                                    <span className="font-black text-white" style={{ fontSize: PROFILE_UI.collectValueFontSize }}>{armCount}<span className="text-white/40" style={{ fontSize: PROFILE_UI.collectSubFontSize }}> / {armTotal}</span></span>
                                    <div className="w-full bg-gray-800 rounded-full overflow-hidden" style={{ height: PROFILE_UI.collectBarHeight }}>
                                        <div className="h-full bg-purple-500" style={{ width: `${armTotal ? Math.min(100, (armCount / armTotal) * 100) : 0}%` }} />
                                    </div>
                                </div>
                                <div className="bg-black/30 flex flex-col items-center" style={{ padding: PROFILE_UI.statCardPad, borderRadius: PROFILE_UI.statCardRadius, borderWidth: PROFILE_UI.statCardBorderWidth, borderStyle: 'solid', gap: PROFILE_UI.collectCardGap }}>
                                    <span className="text-gray-400 font-mono tracking-widest" style={{ fontSize: PROFILE_UI.collectLabelFontSize, marginBottom: PROFILE_UI.collectLabelMarginBottom }}>卡背 / 棋盘</span>
                                    <span className="font-black text-white" style={{ fontSize: PROFILE_UI.collectValueFontSize }}>{cardBackOwned}<span className="text-white/40" style={{ fontSize: PROFILE_UI.collectSubFontSize }}> / {cardBackTotal}</span></span>
                                    <span className="font-mono text-gray-500" style={{ fontSize: PROFILE_UI.collectNoteFontSize }}>棋盘 {deskOwned}/{deskTotal}</span>
                                </div>
                            </div>

                            {/* 关闭按钮 */}
                            <div className="flex justify-end" style={{ marginTop: PROFILE_UI.footerMarginTop }}>
                                <GlassButton onClick={() => { setIsProfileOpen(false); setShowUI(true); }} className="w-32 h-12 rounded-sm" label="关闭" />
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* 2. 图像画廊面板 (Gallery) */}
                {isGalleryOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[90] bg-black/90 p-12 overflow-y-auto no-scrollbar">
                        <h2 className="text-3xl font-black text-white mb-8 tracking-widest border-b border-white/20 pb-4">SELECT SOURCE IMAGE</h2>
                        <div className="grid grid-cols-6 gap-6 max-w-7xl mx-auto">
                            {galleryItems.map(item => (
                                <div
                                    key={item.key}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setCropTarget(item); setCropScale(1); setCropOffset({x:0, y:0}); setIsGalleryOpen(false); setIsCropperOpen(true); }} // [新增] 音效
                                    className="aspect-[3/4] border-2 border-white/10 hover:border-blue-500 cursor-pointer overflow-hidden rounded-sm relative group transition-all hover:scale-105"
                                >
                                    <img src={item.url} className="w-full h-full object-cover" />
                                    <div className="absolute bottom-0 w-full bg-black/60 py-1 text-center text-[10px] text-white/50 font-mono font-bold uppercase">{item.type}</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); setIsGalleryOpen(false); }} className="fixed right-12 bottom-12 w-16 h-16 rounded-full bg-gray-600 hover:bg-gray-500 text-white flex items-center justify-center"><X size={32}/></button> {/* [新增] 音效 */}
                    </motion.div>
                )}

                {/* 3. 头像裁剪工作台 (Cropper) - 专业无遮挡级 */}
                {isCropperOpen && cropTarget && (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="absolute inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center select-none cursor-move"
                        // [修复 1] 增加滚轮缩放支持
                        onWheel={(e) => {
                            const zoomAmount = e.deltaY > 0 ? -0.1 : 0.1;
                            setCropScale(prev => Math.min(Math.max(0.5, prev + zoomAmount), 3));
                        }}
                        // 拖拽事件挂载在全屏容器上，避免鼠标滑出框外失效
                        onMouseDown={(e) => {
                            isDragging.current = true;
                            dragStart.current = { x: e.clientX, y: e.clientY, baseX: cropOffset.x, baseY: cropOffset.y };
                        }}
                        onMouseMove={(e) => {
                            if(!isDragging.current) return;
                            const deltaX = e.clientX - dragStart.current.x;
                            const deltaY = e.clientY - dragStart.current.y;
                            // [修复 3] 移除不必要的 scale 除数，保证拖拽完全1:1跟随鼠标
                            const percentX = (deltaX / 300) * 100;
                            const percentY = (deltaY / 300) * 100;
                            setCropOffset({ x: dragStart.current.baseX + percentX, y: dragStart.current.baseY + percentY });
                        }}
                        onMouseUp={() => isDragging.current = false}
                        onMouseLeave={() => isDragging.current = false}
                        // 移动端支持
                        onTouchStart={(e) => {
                            isDragging.current = true;
                            dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, baseX: cropOffset.x, baseY: cropOffset.y };
                        }}
                        onTouchMove={(e) => {
                            if(!isDragging.current) return;
                            const deltaX = e.touches[0].clientX - dragStart.current.x;
                            const deltaY = e.touches[0].clientY - dragStart.current.y;
                            const percentX = (deltaX / 300) * 100;
                            const percentY = (deltaY / 300) * 100;
                            setCropOffset({ x: dragStart.current.baseX + percentX, y: dragStart.current.baseY + percentY });
                        }}
                        onTouchEnd={() => isDragging.current = false}
                    >
                        {/* 顶层标题区 (z-20 确保在暗色蒙版之上) */}
                        <h2 className="text-2xl font-black text-white mb-8 tracking-widest z-20 drop-shadow-lg">ADJUST AVATAR FRAME</h2>

                        {/* 裁剪区核心框 (视觉窗口) */}
                        <div className="w-[300px] h-[300px] relative z-10 flex items-center justify-center">
                            {/* 取消 overflow-hidden，让图片可以渲染到框外 */}
                            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                                <img src={cropTarget.url} draggable={false} className="max-w-none absolute"
                                    style={{
                                        // [核心修复 2] 增加 top 和 left 50%，使裁剪基准点与正式渲染的基准点完全统一！
                                        top: '50%', left: '50%',
                                        width: cropTarget.type !== 'spell' ? '100%' : 'auto',
                                        height: cropTarget.type !== 'spell' ? 'auto' : '100%',
                                        transform: `translate(calc(-50% + ${cropOffset.x}%), calc(-50% + ${cropOffset.y}%)) scale(${cropScale})`
                                    }}
                                />
                            </div>

                            {/* 用一个超巨大的内部 box-shadow 作为周围的暗色蒙版，只把 300x300 的中心留亮 */}
                            <div className="absolute inset-0 z-10 pointer-events-none" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.85)' }}></div>

                            {/* 参考十字线与蓝色亮边 (z-20) */}
                            <div className="absolute inset-0 z-20 border-2 border-blue-500 pointer-events-none shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                                <div className="w-full h-[1px] bg-white/30 absolute top-1/2" />
                                <div className="w-[1px] h-full bg-white/30 absolute left-1/2" />
                            </div>
                        </div>

                        {/* 缩放控制 (z-20，并阻止事件冒泡防止拖拽冲突) */}
                        <div className="flex items-center gap-4 mt-8 w-[300px] bg-white/10 backdrop-blur-md p-4 rounded-sm border border-white/10 z-20"
                             onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                             onWheel={e => e.stopPropagation()} // 防止滑块区域滚轮穿透
                        >
                            <span className="text-white/50 font-mono text-xs">缩放</span>
                            <input
                                type="range" min="0.5" max="3" step="0.05" value={cropScale}
                                onChange={(e) => setCropScale(parseFloat(e.target.value))}
                                className="flex-1 accent-blue-500 cursor-pointer"
                            />
                        </div>

                        {/* 操作按钮 (z-20，阻止冒泡) */}
                        <div className="flex gap-6 mt-8 z-20" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                            <GlassButton onClick={() => { setIsCropperOpen(false); setIsGalleryOpen(true); }} className="w-32 h-14" label="取消"><X size={18}/></GlassButton>
                            <GlassButton
                                onClick={() => {
                                    // 保存时直接提交当前的百分比
                                    userSystem.updateProfile({
                                        avatarConfig: { imageKey: cropTarget.key, type: cropTarget.type, scale: cropScale, offsetX: cropOffset.x, offsetY: cropOffset.y }
                                    });
                                    setIsCropperOpen(false);
                                    setIsProfileOpen(true);
                                }}
                                className="w-32 h-14 bg-blue-600 border-blue-400" label="应用"><Check size={18}/></GlassButton>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ================= 新增：GM 开发者工具全屏覆盖层 ================= */}
            <AnimatePresence>
                {isStudioOpen && (
                    <Studio onClose={() => { setIsStudioOpen(false); setShowUI(true); }} />
                )}
            </AnimatePresence>

            {/* ================= [修正] 挂载正确的组件开关，并在关闭时通过 setShowUI(true) 完美唤醒大厅原本的UI面板 ================= */}
            <AnimatePresence>
                {isCodexBookOpen && (
                    <GalleryCodex
                        onClose={() => {
                            setIsCodexBookOpen(false);
                            setShowUI(true);
                        }}
                        userSystem={userSystem} // [核心修正] 将大厅现有的资产数据完美注入图鉴，一秒点亮全彩与灰阶黑白锁定！
                    />
                )}
            </AnimatePresence>

        </div>
    );
};