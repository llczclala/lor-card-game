// ==========================================
// 悖论迷宫 · 逻辑研习（肉鸽图鉴）
// [2026-08-26 莉莉子] 遗物收集式改版：顶部筛选（搜索+品质多选）+ 左侧 tab 侧边栏 + 方形信息块网格
// 数据源：强化 → PLAYER_ENHANCEMENTS（15 个玩家强化，含 battleEffect 触发时机/效果类）；装备 → EQUIPMENT_DEFS（30 件含武装）
// 复用：RarityIcon / RARITY_META（品质图标 + 颜色文案）
// ==========================================
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, RotateCcw, Sparkles, Swords, Inbox, X, Lock, Skull } from 'lucide-react';
import { PLAYER_ENHANCEMENTS, ENEMY_ONLY_ENHANCEMENTS, getBattleEffects, type MazeBuff, type BattleTrigger, type BattleEffectClass } from '../../data/roguelike/buffs';
import type { EnhancementRarity } from '../../data/roguelike/enhancements';
import { EQUIPMENT_DEFS, type EquipmentDef } from '../../data/equipment';
import { RARITY_META } from './RarityIcon';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { pickTuning } from '../../platform/tuning';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 逻辑研习（肉鸽图鉴）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 坐标系：界面跑在固定 **1680×1050 画布**里，整画布 `transform: scale(s)` 塞进窗口，
//   `s = min(窗口宽/1680, 窗口高/1050)` ⇒ PC 1920×1080 ≈ 1.03；雷电 1280×720 ≈ 0.686；
//   **手机横屏 ≈ 0.374**。画布等比缩放 ⇒ 布局比例永不破，问题纯粹是**可读性**
//   （PC 上 text-sm=14px 好看，手机上 14×0.374 = **5.2 CSS px**，读不了）。
// 口径 ×1：本表的值一律是**绝对画布 px**，直接进 `style={{}}`。原 Tailwind 类换算：
//   `text-sm`=14 / `text-xs`=12 / `text-[11px]`=11 / `text-[10px]`=10 / `text-lg`=18。
// 🔴 行高陷阱：Tailwind 内置行高是**固定 rem**、不随字号走（text-xs=12/16、text-sm=14/20、
//   text-lg=18/28）⇒ 光放大 fontSize 会挤成一坨。**每个 fontSize 字段都配一个 Line 字段**；
//   原本**没有行高类**的（`text-[10px]` / `text-[11px]`）**PC 值填 0**，代码写
//   `lineHeight: lh(CODEX_UI.xLine)` 回落浏览器 `normal`。
// 双平台：`CODEX_UI_MOBILE` = 手机端（程在雷电里调的就是这份）；
//   `CODEX_UI_PC_DIFF` = PC 端差异项 —— 只列**与手机不同、且严格等于原 Tailwind 换算值**的项。
//   ⚠️ 两个来源对象都**不要加 `as const`**（字面量类型会让合并时类型冲突）。
// ══════════════════════════════════════════════════════════════════════
const CODEX_UI_MOBILE = {
    // ══ ① 顶栏（返回 / 标题 / 搜索 / 品质筛选 / 重置）═════════════════
    topPadX: 34,             // 左右内边距（原 px-6 = 24，手机 ×1.4）
    topPadTop: 28,           // 上内边距（原 pt-5 = 20）
    topPadBottom: 22,        // 下内边距（原 pb-4 = 16）
    topGap: 16,              // 顶栏内元素间距（原 gap-4 = 16，两端相同 ⇒ 不进 PC_DIFF）
    titleFontSize: 44,       // 「逻辑研习」（原 text-lg = 18）
    titleLine: 52,           // 行高（原 text-lg = 28）
    subtitleFontSize: 22,    // 「悖论图鉴 · CODEX」（原 text-[11px] = 11）
    subtitleLine: 26,        // 行高（原无行高类 ⇒ PC 填 0）

    backIconSize: 30,        // 返回箭头（原 <ArrowLeft size={20} />）
    backPad: 12,             // 返回键内边距（原 p-2.5 = 10）

    searchFontSize: 32,      // 搜索框文字（原 text-sm = 14）
    searchLine: 38,          // 行高（原 text-sm = 20）
    searchWidth: 240,        // 搜索框宽度（原 w-44 = 176）
    searchPadLeft: 52,       // 左内边距·让开放大镜（原 pl-8 = 32）
    searchPadRight: 46,      // 右内边距·让开清除键（原 pr-7 = 28）
    searchPadY: 10,          // 上下内边距（原 py-1.5 = 6）
    searchIconSize: 26,      // 放大镜图标（原 size={14}）
    searchIconLeft: 14,      // 放大镜左边距（原 left-3 = 12）
    searchClearRight: 12,    // 清除键右边距（原 right-2.5 = 10）

    chipFontSize: 32,        // 品质筛选 chip 文字（原 text-xs = 12）
    chipLine: 38,            // 行高（原 text-xs = 16）
    chipPadX: 16,            // chip 左右内边距（原 px-2.5 = 10）
    chipPadY: 10,            // chip 上下内边距（原 py-1.5 = 6）
    chipIconSize: 22,        // chip 品质图标（原 size={13}）
    chipGap: 10,             // chip 之间 / chip 内图标与文字 / 重置按钮图标与文字（原 gap-1.5 = 6）

    resetFontSize: 32,       // 「重置」文字（原 text-xs = 12）
    resetLine: 38,           // 行高（原 text-xs = 16）
    resetPadX: 20,           // 左右内边距（原 px-3 = 12）
    resetPadY: 10,           // 上下内边距（原 py-1.5 = 6）
    resetIconSize: 22,       // 重置图标（原 size={13}）

    // ══ ② 左侧 tab 侧边栏 ═════════════════════════════════════════════
    sideWidth: 280,          // 左栏宽度（原 w-44 = 176）
    sidePad: 20,             // 左栏内边距（原 p-3 = 12）
    sideGap: 12,             // tab 之间间距（原 gap-1.5 = 6）
    tabFontSize: 32,         // tab 文字（原 text-sm = 14）
    tabLine: 38,             // 行高（原 text-sm = 20）
    tabPadX: 20,             // tab 左右内边距（原 px-3 = 12）
    tabPadY: 20,             // tab 上下内边距（原 py-3 = 12）
    tabIconSize: 30,         // tab 图标（原 size={16}）
    tabGap: 18,              // tab 内图标与文字间距（原 gap-2.5 = 10）
    countFontSize: 20,       // tab 右侧条数（原 text-[10px] = 10）
    countLine: 24,           // 行高（原无行高类 ⇒ PC 填 0）

    // ══ ③ 右侧网格区 ═════════════════════════════════════════════════
    gridCols: 3,             // 列数（原 grid-cols-[repeat(auto-fill,minmax(210px,1fr))]，实测 6 列）
    gridGap: 16,             // 卡片间距（原 gap-3 = 12）
    gridPadX: 34,            // 网格区左右内边距（原 px-6 = 24）
    gridPadY: 24,            // 网格区上下内边距（原 py-5 = 20）
    emptyFontSize: 32,       // 「无匹配条目」（原 text-sm = 14）
    emptyLine: 38,           // 行高（原 text-sm = 20）
    emptyIconSize: 64,       // 空态 Inbox 图标（原 size={44}）
    emptyGap: 12,            // 空态图标与文字间距（原 gap-3 = 12）

    // ══ ④ 三种卡片（强化 / 装备 / 锁定）共用外框 ══════════════════════
    cardPad: 22,             // 卡片内边距（原 p-4 = 16）
    cardGap: 16,             // 卡片内纵向间距（原 gap-3 = 12）
    cardMinH: 560,           // 卡片最小高（原只有锁定卡有 min-h-[190px] ⇒ 现三种共用同一值）
    iconBoxSize: 96,         // 六边形图标框（原 w-16 h-16 = 64；锁定卡的圆形占位同用此值）
    nameFontSize: 36,        // 卡片名称（原 text-sm = 14）
    nameLine: 44,            // 行高（原 text-sm = 20）

    // 小胶囊（品质 / 触发时机 / 效果类 / 装备徽）——原 text-[10px]
    badgeFontSize: 32,       // 胶囊文字（原 text-[10px] = 10）
    badgeLine: 38,           // 行高（原无行高类 ⇒ PC 填 0）
    badgePadY: 4,            // 胶囊上下内边距（原 py-0.5 = 2）
    badgePadXSm: 10,         // 窄内边距·品质胶囊 / 触发 / 「武装」/「未解锁」（原 px-1.5 = 6）
    badgePadXMd: 12,         // 宽内边距·效果类 / 装备徽（原 px-2 = 8）
    badgeGap: 10,            // 胶囊之间间距（原 gap-1.5 = 6）

    // 描述正文 —— 原 `text-xs leading-snug line-clamp-3 min-h-[3rem]`
    descFontSize: 32,
    descLine: 44,
    descMaxLines: 5,         // 原 line-clamp-3
    descMinH: 220,           // 原 min-h-[3rem] = 48（= descLine × descMaxLines，保证短描述卡片也齐行）

    // NEW 角标 —— 原 `text-[10px] font-black tracking-widest`
    newFontSize: 20,
    newLine: 24,
    newPadX: 10,             // 原 px-1.5 = 6
    newPadY: 4,              // 原 py-0.5 = 2

    armFontSize: 20,         // 「武装」标记（原 text-[10px] = 10）
    armLine: 24,             // 行高（原无行高类 ⇒ PC 填 0）

    // 锁定卡内部
    lockFontSize: 20,        // 「未解锁」（原 text-[10px] = 10）
    lockLine: 24,            // 行高（原无行高类 ⇒ PC 填 0）
    lockQFontSize: 36,       // 「？？？」（原 text-sm = 14）
    lockQLine: 44,           // 行高（原 text-sm = 20）
    lockIconSize: 40,        // 锁图标（原 <Lock size={22} />）
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机不同」的项，且**必须严格等于原 Tailwind 换算值**
//     （= 改完 PC 端逐像素零变化；改这里 = 改 PC 观感，改上面 = 改手机观感）
// ══════════════════════════════════════════════════════════════════════
const CODEX_UI_PC_DIFF = {
    // 顶栏
    topPadX: 24, topPadTop: 20, topPadBottom: 16,
    titleFontSize: 18, titleLine: 28,
    subtitleFontSize: 11, subtitleLine: 0,
    backIconSize: 20, backPad: 10,
    searchFontSize: 14, searchLine: 20, searchWidth: 176, searchPadLeft: 32, searchPadRight: 28,
    searchPadY: 6, searchIconSize: 14, searchIconLeft: 12, searchClearRight: 10,
    chipFontSize: 12, chipLine: 16, chipPadX: 10, chipPadY: 6, chipIconSize: 13, chipGap: 6,
    resetFontSize: 12, resetLine: 16, resetPadX: 12, resetPadY: 6, resetIconSize: 13,
    // 左栏
    sideWidth: 176, sidePad: 12, sideGap: 6,
    tabFontSize: 14, tabLine: 20, tabPadX: 12, tabPadY: 12, tabIconSize: 16, tabGap: 10,
    countFontSize: 10, countLine: 0,
    // 网格
    gridCols: 6, gridGap: 12, gridPadX: 24, gridPadY: 20,
    emptyFontSize: 14, emptyLine: 20, emptyIconSize: 44, emptyGap: 12,
    // 卡片
    cardPad: 16, cardGap: 12, cardMinH: 190, iconBoxSize: 64,
    nameFontSize: 14, nameLine: 20,
    badgeFontSize: 10, badgeLine: 0, badgePadY: 2, badgePadXSm: 6, badgePadXMd: 8, badgeGap: 6,
    descFontSize: 12, descLine: 16.5, descMaxLines: 3, descMinH: 48,
    newFontSize: 10, newLine: 0, newPadX: 6, newPadY: 2,
    armFontSize: 10, armLine: 0,
    lockFontSize: 10, lockLine: 0, lockQFontSize: 14, lockQLine: 20, lockIconSize: 22,
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const CODEX_UI_PC = { ...CODEX_UI_MOBILE, ...CODEX_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定收在 `src/platform/tuning.ts`） */
export const CODEX_UI = pickTuning(CODEX_UI_PC, CODEX_UI_MOBILE);

/**
 * 🔴 **行高必须过这一层**（2026-10-28 莉莉子 · 三屏并行改造时踩出来的硬坑）。
 *
 * React 把 `lineHeight` 列入 **unitless 属性表** ⇒ `style={{ lineHeight: 44 }}`
 * 编译出的是 `line-height: 44`，即 **44 倍字号**（32px 字 → 1408px 行高，整屏直接崩）。
 * 而调参区里的 `xLine` 存的是**画布 px 数字**（如 44 = 44px），语义完全不同。
 *
 * ⇒ 凡 Line 字段一律走本函数：`lineHeight: lh(CODEX_UI.descLine)`。
 * `0` ⇒ `undefined` ⇒ 不设该属性 ⇒ 回落浏览器 `normal`（用于原本无行高类的元素，保 PC 零变化）。
 *
 * ⚠️ `tsc` 查不出这个错（number 是 `lineHeight` 的合法类型），只能靠人眼/验证环节发现。
 */
const lh = (px: number): string | undefined => (px ? `${px}px` : undefined);

/** 描述正文运行时样式（`line-clamp` 的动态版：行数可调，故不能再用固定 `line-clamp-3` 类） */
const CODEX_DESC_STYLE: React.CSSProperties = {
    fontSize: CODEX_UI.descFontSize,
    lineHeight: lh(CODEX_UI.descLine),
    minHeight: CODEX_UI.descMinH,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: CODEX_UI.descMaxLines,
    overflow: 'hidden',
};

// [2026-08-27] 六档品质：白/绿/蓝/紫/金/红
const QUALITY_ORDER: EnhancementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** [2026-08-26 莉莉子] 品质排序权重（图鉴按品质排序，不按定义顺序） */
const QUALITY_RANK: Record<EnhancementRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** [2026-08-26 莉莉子] 战斗触发时机 → 中文标签 */
export const TRIGGER_LABELS: Record<BattleTrigger, string> = {
    game_start: '开局',
    round_start: '回合开始',
    on_summon: '召唤时',
    on_first_summon: '首次召唤',
    after_attack: '打击后',
    after_attacked: '被打击后',
    on_cast_spell: '施法后',
    on_play_unit: '打出单位后',
    on_first_play_unit: '每回合首个单位',
    on_nexus_strike: '敌方水晶受击',
    // [2026-08-27 莉莉子] 高级强化触发时机
    round_end: '回合结束',
    unit_die: '单位阵亡',
    // [2026-09-28 莉莉子 神格神经] 新增时机（芬妮/卜卜/茉莉安）
    on_attack_declare: '进攻宣告',
    on_pull_exposed: '拉取暴露',
    // [2026-10-06 程拍板] 新时机（「霜锋乘势」= 每次获得进攻标识时冻结最强）
    on_get_attack_token: '获得进攻标识时',
};

/** [2026-08-26 莉莉子] 战斗效果类 → 中文标签 */
export const EFFECT_LABELS: Record<BattleEffectClass, string> = {
    GENERATE: '生成',
    SUMMON: '召唤',
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] 从原处（牌库 / 手牌）召唤（世纪和解）—— 与上方"造卡召唤"区分
    // [2026-10-10 莉莉子 BUG修复] **文案同步**：该 handler 现在**牌库 + 手牌都查**
    //   （原先只查牌库 ⇒ 有一张被起手抽进手牌时就不会被召唤）⇒ 这里的标签必须跟着改，
    //   否则玩家在**图鉴 / 敌人详情 / 悬浮预览**里看到的仍是旧说法「从牌库召唤」。
    // [2026-10-21 莉莉子] 该 handler 又加了「两处都没有 ⇒ 直接召唤 + 随机 3 件装备」的兜底。
    //   ⚠️ **标签刻意不加长**（本标签渲染成 `text-[10px]` 的小胶囊，塞长句会撑破）⇒
    //      兜底口径只写在卡面 `description` 里（`data/roguelike/buffs.ts` 的 enhance_century_reconciliation）。
    SUMMON_FROM_DECK: '从牌库与手牌召唤',
    BUFF: '增益',
    RALLY: '备战',
    CLONE_AND_SUMMON: '克隆召唤',
    BUFF_SELF: '自身增益',
    RANDOM_ALLY_BUFF: '随机友军增益',
    DECK_TOP_BUFF: '牌库顶增益',
    STAT_BALANCE: '攻血互等',
    // [2026-08-27 莉莉子] 高级强化效果类
    FREEZE_STRONGEST: '冻结最强',
    DUEL_STRONGEST: '双方最强互打',
    SET_STRONGEST_STATS: '设1/1最强',
    SET_RANDOM_STATS: '设1/1随机',  // [2026-10-06 程拍板] 新增强化「衰弱蔓延」
    HAND_DISCOUNT: '手牌减费',
    DEATH_GIFT: '亡语赋予',
    // [2026-08-27 莉莉子] 品质扩充批效果类
    BARRIER_NEXUS: '水晶屏障',
    NEXUS_TOUGH: '水晶坚韧', // [2026-08-30 莉莉子] 固若金汤重设计：受击伤害永久 -1
    NEXUS_IMMUNE: '水晶免疫',      // [2026-09-29 程拍板] 不死之身：我方水晶免疫任何伤害
    NEXUS_SELF_DAMAGE: '水晶自扣', // [2026-09-29 程拍板] 不死之身的代价：回合结束自扣水晶
    NEXUS_HEAL: '水晶回复',
    HAND_COST_DOWN: '手牌降费',
    DEATH_DISCOUNT: '亡语降费',
    ALL_BUFF: '全体增益',
    RESURRECT: '复活',
    SPELL_DOUBLE: '法术翻倍',
    KEYWORD_POWER: '关键词成长',
    NEXUS_HP_BOOST: '水晶生命', // [2026-08-28] 敌方水晶生命强化
    CHAMPION_TO_HAND: '抽天启者', // [2026-09-01] 天启共鸣：开局从牌库抽天启者到手牌
    DRAW_CARDS: '开局抽牌',       // [2026-09-25 莉莉子 三线任务化框架] 开局抽 N 张（武装任务兑现与后续条目共用）
    DISCARD_LOWEST_BUFF_CHAMPION: '弃牌养核', // [2026-09-25 莉莉子 武装线] 噬牌之匣
    SUMMON_INHERIT_LAST_DEAD: '召唤继承',     // [2026-09-25 莉莉子 武装线] 亡者低语
    SPREAD_CHAMPION_KEYWORDS: '关键词扩散',   // [2026-09-25 莉莉子 武装线] 共鸣水晶
    TAX_ENEMY_HAND: '敌方手牌加费',           // [2026-09-25 莉莉子 武装线] 破晓号令
    DEATH_NEXUS_DAMAGE: '亡语灼水晶',         // [2026-09-25 莉莉子 强化线] 余烬
    DEATH_STRIKE_RANDOM_ENEMY: '亡语打击',    // [2026-09-25 莉莉子 强化线] 献祭回响
    DEATH_GIFT_KEYWORD: '亡语传承',           // [2026-09-25 莉莉子 强化线] 返祖
    OPENING_ZERO_COST: '开局零费',            // [2026-09-25 莉莉子 强化线] 终焉回响
    BOUNTY_CYCLE: '悬赏标记',                 // [2026-09-25 莉莉子 强化线] 悬赏
    LONE_GUARD_BUFF: '孤军强化',              // [2026-09-25 莉莉子 强化线] 孤军
    // [2026-09-28 莉莉子 神格神经线] 神格神经专属效果类
    START_MANA_BONUS: '开局法力',             // [2026-09-29] 规则查询型：开局最大法力 +N（神格·潮汐 / 敌方先机三档）
    ALL_UNITS_GRANT_KEYWORD: '全军赋关键词',  // 里芙⑥：我方全体与此后召唤的单位 +N/+M 并获关键词
    // [2026-09-28 莉莉子 神格神经 · 进攻宣告类]
    RALLY_IF_ATTACK_POWER: '达标即备战',      // 芬妮②④：进攻单位攻击力总和达阈值 → 备战
    CLONE_ON_DECLARE: '进攻时复制',           // 卜卜①③：进攻宣告时复制我方单位（以进攻中入场）
    NEXUS_REPEAT_STRIKE: '水晶再击',          // 卜卜⑥：打击水晶记账 → 回合结束最强单位再打一次
    // [2026-09-28 神格神经 · 猫汐尔]
    MANA_PER_SUMMON_ROUND: '衍生物换法力',    // ①按当前衍生物数给本回合法力
    MANA_PER_SUMMON_PERMANENT: '召唤永久涨法力', // ③每召唤 1 个衍生物 → 本场永久法力 +1
    SPELL_COST_DOWN_ALL: '全法术减费',        // ⑥开局手牌+牌库法术魔耗 -N
    REMOVE_MAX_POWER: '解除攻击上限',         // ⑥清除臆莲基座的攻击力上限
    // [2026-09-28 神格神经 · 茉莉安]
    EXPOSE_AND_DAMAGE: '暴露并造成伤害',      // ②④回合开始暴露一个敌人并造成伤害
    BEACON_DAMAGE_MULT: '信标伤害翻倍',       // ⑥常驻查询：獠牙信标亡语伤害翻倍
    // [2026-10-24 莉莉子] 开局给我方手牌 + 牌库每张卡挂一件指定品质装备（紫/蓝/白三档）
    EQUIP_ALL_CARDS: '全卡挂装备',
    // [2026-10-24 莉莉子] 指定费用的我方单位 +N/+M（1 费 +3/+3）
    BUFF_COST_UNITS: '定向费用增益',
    // [2026-10-24 莉莉子] 按费用选卡的两条
    SUMMON_BY_COST_FROM_DECK: '按费召唤',
    SUMMON_LOWER_COST_ON_DEATH: '阵亡递补',
    // [2026-10-24 莉莉子] 费用修饰器三套（查询/标记型）
    SPELL_COST_UP_ALL: '全法术加费',
    COST_TAX: '费用税',
    CHAIN_PLAY_TAX: '连出加费',
    // [2026-10-24 莉莉子] 第 14 条：开局塞 Lv2 天启者进牌库
    UPGRADED_CHAMPIONS_TO_DECK: '升级天启入库',
    // [2026-10-24 莉莉子] 第 19 条：随机整队召唤
    SUMMON_RANDOM_SQUAD: '整队召唤',
    // [2026-10-24 莉莉子] 第 16 条：回合末处决
    MASSACRE_EXCEPT_STRONGEST: '除最强全灭',
    // [2026-10-24 莉莉子] 第 21 条：水晶受击限伤
    NEXUS_DAMAGE_CAP: '水晶受击限伤',
};

/** [2026-08-26 莉莉子] 装备静态修饰/效果 → 标签列表（方块底部展示） */
function getEquipBadges(e: EquipmentDef): string[] {
    const tags: string[] = [];
    if (e.costMod) tags.push(`费用${e.costMod > 0 ? '+' : ''}${e.costMod}`);
    if (e.powerMod || e.healthMod) tags.push(`+${e.powerMod ?? 0}/${e.healthMod ?? 0}`);
    if (e.keywords?.length) tags.push(e.keywords.join('·'));
    if (e.onPlay) tags.push('打出');
    if (e.onRoundStart) tags.push('回合开始');
    if (e.onTrigger) tags.push('成长');
    return tags;
}

// [2026-10-26 莉莉子] 新增 `'enemy'`：敌方专属强化页签（此前图鉴只能看玩家池，粉丝反馈"看不到敌人能拿到什么"）
type CodexTab = 'enhancement' | 'equipment' | 'enemy';

interface RogueCodexProps {
    isOpen: boolean;
    onClose: () => void;
    userSystem?: any; // [2026-08-26 逻辑研习] 账号系统：读解锁记录；开发者账号（dev_full_admin）全解锁
}

export const RogueCodex: React.FC<RogueCodexProps> = ({ isOpen, onClose, userSystem }) => {
    const [tab, setTab] = useState<CodexTab>('enhancement');
    const [search, setSearch] = useState('');
    const [qualities, setQualities] = useState<Set<EnhancementRarity>>(new Set());

    // ESC 关闭（App 全局 ESC 分发优先处理本层，这里兜底）
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // 打开时重置筛选（下次进入干净状态）
    useEffect(() => {
        if (isOpen) { setSearch(''); setQualities(new Set()); }
    }, [isOpen]);

    const toggleQuality = (q: EnhancementRarity) => {
        setQualities(prev => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q); else next.add(q);
            return next;
        });
    };
    const resetFilter = () => { setSearch(''); setQualities(new Set()); };
    const hasFilter = search.trim() !== '' || qualities.size > 0;

    /** 通用过滤：品质多选（OR）+ 文字搜索（名称/描述） */
    const applyFilter = useMemo(() => (items: { name: string; description: string; rarity: EnhancementRarity }[]) => {
        const kw = search.trim().toLowerCase();
        return items.filter(it => {
            if (qualities.size > 0 && !qualities.has(it.rarity)) return false;
            if (kw) {
                const hay = `${it.name} ${it.description}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });
    }, [search, qualities]);

    // [2026-08-26 莉莉子] 解锁判定：开发者账号全解锁；普通账号按 settings 记录（获得过才解锁）
    const isDev = userSystem?.userId === 'dev_full_admin';
    const unlockedEnhSet = useMemo(() => new Set<string>(userSystem?.settings?.unlockedRogueEnhancements ?? []), [userSystem]);
    // [2026-10-26 莉莉子 · 程拍板] 已读集：与"已收录"分开 —— NEW 角标 = 收录了但还没在图鉴里看过
    const seenEnhSet = useMemo(() => new Set<string>(userSystem?.settings?.codexSeenEnhancements ?? []), [userSystem]);
    const unlockedEquipSet = useMemo(() => new Set<string>(userSystem?.settings?.unlockedRogueEquipments ?? []), [userSystem]);
    const isEnhUnlocked = (id: string) => isDev || unlockedEnhSet.has(id);
    const isEquipUnlocked = (id: string) => isDev || unlockedEquipSet.has(id);
    /** [2026-10-26 莉莉子] 图鉴内的 NEW：**已收录但还没看过**。
     *  ⚠️ 刻意**不给开发者号特判** —— 它现在也落盘记录（见 `App.recordCodexUnlock`），
     *    所以程用自己的号就能验收这个角标。 */
    const isEnhNew = (id: string) => unlockedEnhSet.has(id) && !seenEnhSet.has(id);

    // [2026-08-26 莉莉子] 过滤后按品质排序（common→rare→epic→legendary，同品质保持原顺序）
    const enhList = useMemo(() =>
        applyFilter(PLAYER_ENHANCEMENTS).sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]),
        [applyFilter]);
    const equipList = useMemo(() =>
        applyFilter(EQUIPMENT_DEFS).sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]),
        [applyFilter]);
    // [2026-10-26 莉莉子] 敌方专属强化（玩家永远拿不到的那批）—— 与「强化图鉴」互补，不重复列通用的
    const enemyEnhList = useMemo(() =>
        applyFilter(ENEMY_ONLY_ENHANCEMENTS).sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]),
        [applyFilter]);

    /** 六边形图标容器（品质色描边发光）—— 原 `w-16 h-16 mx-auto` */
    const hexIcon = (icon: string, alt: string, color: string) => (
        <div
            className="mx-auto flex items-center justify-center"
            style={{
                width: CODEX_UI.iconBoxSize,
                height: CODEX_UI.iconBoxSize,
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                background: `${color}18`,
                border: `1px solid ${color}66`,
                boxShadow: `0 0 18px ${color}22`,
            }}
        >
            <img src={icon} alt={alt} className="w-full h-full object-cover" draggable={false} />
        </div>
    );

    /** 品质标签 —— 原 `text-[10px] px-1.5 py-0.5` */
    const rarityBadge = (rarity: EnhancementRarity) => {
        const meta = RARITY_META[rarity];
        return (
            <span className="shrink-0 rounded font-mono"
                style={{
                    color: meta.color,
                    fontSize: CODEX_UI.badgeFontSize,
                    lineHeight: lh(CODEX_UI.badgeLine),
                    paddingLeft: CODEX_UI.badgePadXSm,
                    paddingRight: CODEX_UI.badgePadXSm,
                    paddingTop: CODEX_UI.badgePadY,
                    paddingBottom: CODEX_UI.badgePadY,
                    border: `1px solid ${meta.color}44`,
                    background: `${meta.color}11`,
                }}>
                {meta.label}
            </span>
        );
    };

    /** 强化信息块 */
    const renderEnhBlock = (e: MazeBuff, isNew = false) => {
        const meta = RARITY_META[e.rarity];
        const trigger = getBattleEffects(e)[0]?.trigger;
        const effectClass = getBattleEffects(e)[0]?.effectClass;
        return (
            <div
                key={e.id}
                className="relative rounded-2xl border flex flex-col transition-all hover:scale-[1.03] hover:-translate-y-0.5 cursor-pointer"
                style={{
                    background: meta.cardBg,
                    borderColor: `${meta.color}55`,
                    boxShadow: `0 0 20px ${meta.color}1f`,
                    padding: CODEX_UI.cardPad,       // 原 p-4
                    gap: CODEX_UI.cardGap,           // 原 gap-3
                    minHeight: CODEX_UI.cardMinH,    // 三种卡片统一最小高（缺陷②）
                }}
            >
                {/* [2026-10-26 莉莉子] 图鉴内 NEW 角标 —— 收录了但还没看过的那几条（原 text-[10px] + px-1.5 py-0.5） */}
                {isNew && (
                    <span className="absolute -top-2 -right-2 z-10 rounded-md font-black tracking-widest text-black bg-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.85)]"
                        style={{
                            fontSize: CODEX_UI.newFontSize,
                            lineHeight: lh(CODEX_UI.newLine),
                            paddingLeft: CODEX_UI.newPadX,
                            paddingRight: CODEX_UI.newPadX,
                            paddingTop: CODEX_UI.newPadY,
                            paddingBottom: CODEX_UI.newPadY,
                        }}>
                        NEW
                    </span>
                )}
                {hexIcon(e.icon, e.name, meta.color)}
                <div className="text-center font-bold tracking-wide truncate"
                    style={{
                        color: '#fff',
                        textShadow: `0 0 10px ${meta.color}66`,
                        fontSize: CODEX_UI.nameFontSize,          // 原 text-sm
                        lineHeight: lh(CODEX_UI.nameLine),
                    }}>{e.name}</div>
                <div className="flex flex-wrap justify-center" style={{ gap: CODEX_UI.badgeGap }}>
                    {rarityBadge(e.rarity)}
                    {trigger && (
                        <span className="shrink-0 rounded font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/10"
                            style={{
                                fontSize: CODEX_UI.badgeFontSize,     // 原 text-[10px] px-1.5 py-0.5
                                lineHeight: lh(CODEX_UI.badgeLine),
                                paddingLeft: CODEX_UI.badgePadXSm,
                                paddingRight: CODEX_UI.badgePadXSm,
                                paddingTop: CODEX_UI.badgePadY,
                                paddingBottom: CODEX_UI.badgePadY,
                            }}>
                            {TRIGGER_LABELS[trigger]}
                        </span>
                    )}
                </div>
                <p className="text-gray-400" style={CODEX_DESC_STYLE}>{e.description}</p>
                {effectClass && (
                    <div className="mt-auto text-center">
                        <span className="rounded-full font-mono text-purple-200 border border-purple-400/30 bg-purple-500/10"
                            style={{
                                fontSize: CODEX_UI.badgeFontSize,     // 原 text-[10px] px-2 py-0.5
                                lineHeight: lh(CODEX_UI.badgeLine),
                                paddingLeft: CODEX_UI.badgePadXMd,
                                paddingRight: CODEX_UI.badgePadXMd,
                                paddingTop: CODEX_UI.badgePadY,
                                paddingBottom: CODEX_UI.badgePadY,
                            }}>
                            {EFFECT_LABELS[effectClass]}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    /** 装备信息块 */
    const renderEquipBlock = (e: EquipmentDef) => {
        const meta = RARITY_META[e.rarity];
        const badges = getEquipBadges(e);
        return (
            <div
                key={e.id}
                className="rounded-2xl border flex flex-col transition-all hover:scale-[1.03] hover:-translate-y-0.5 cursor-pointer"
                style={{
                    background: meta.cardBg,
                    borderColor: `${meta.color}55`,
                    boxShadow: `0 0 20px ${meta.color}1f`,
                    padding: CODEX_UI.cardPad,       // 原 p-4
                    gap: CODEX_UI.cardGap,           // 原 gap-3
                    minHeight: CODEX_UI.cardMinH,    // 三种卡片统一最小高（缺陷②）
                }}
            >
                {hexIcon(e.icon, e.name, meta.color)}
                <div className="text-center font-bold tracking-wide truncate"
                    style={{
                        color: '#fff',
                        textShadow: `0 0 10px ${meta.color}66`,
                        fontSize: CODEX_UI.nameFontSize,          // 原 text-sm
                        lineHeight: lh(CODEX_UI.nameLine),
                    }}>{e.name}</div>
                <div className="flex flex-wrap justify-center" style={{ gap: CODEX_UI.badgeGap }}>
                    {rarityBadge(e.rarity)}
                    {e.isArmament && (
                        <span className="shrink-0 rounded font-mono text-amber-200 border border-amber-300/30 bg-amber-400/10"
                            style={{
                                fontSize: CODEX_UI.armFontSize,       // 原 text-[10px] px-1.5 py-0.5
                                lineHeight: lh(CODEX_UI.armLine),
                                paddingLeft: CODEX_UI.badgePadXSm,
                                paddingRight: CODEX_UI.badgePadXSm,
                                paddingTop: CODEX_UI.badgePadY,
                                paddingBottom: CODEX_UI.badgePadY,
                            }}>武装</span>
                    )}
                </div>
                <p className="text-gray-400" style={CODEX_DESC_STYLE}>{e.description}</p>
                {badges.length > 0 && (
                    <div className="mt-auto flex flex-wrap justify-center" style={{ gap: CODEX_UI.badgeGap }}>
                        {badges.map(b => (
                            <span key={b} className="shrink-0 rounded-full font-mono text-cyan-200 border border-cyan-400/30 bg-cyan-500/10"
                                style={{
                                    fontSize: CODEX_UI.badgeFontSize,   // 原 text-[10px] px-2 py-0.5
                                    lineHeight: lh(CODEX_UI.badgeLine),
                                    paddingLeft: CODEX_UI.badgePadXMd,
                                    paddingRight: CODEX_UI.badgePadXMd,
                                    paddingTop: CODEX_UI.badgePadY,
                                    paddingBottom: CODEX_UI.badgePadY,
                                }}>{b}</span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    /** [2026-08-26 莉莉子] 未解锁占位块：灰块 + 问号 + 锁定（刺激收集，类似遗物收藏）
     *  ⚠️ 原 `min-h-[190px]` 比解锁卡矮约 58px ⇒ 全锁定的一行会跳行高。
     *     现改用与解锁卡**同一个** `CODEX_UI.cardMinH`（缺陷②）。 */
    const renderLockedBlock = () => (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 flex flex-col items-center justify-center"
            style={{
                padding: CODEX_UI.cardPad,       // 原 p-4
                gap: CODEX_UI.cardGap,           // 原 gap-3
                minHeight: CODEX_UI.cardMinH,    // 原 min-h-[190px]
            }}>
            <div className="rounded-full flex items-center justify-center bg-white/[0.04] border border-white/10"
                style={{ width: CODEX_UI.iconBoxSize, height: CODEX_UI.iconBoxSize }}>
                <Lock size={CODEX_UI.lockIconSize} className="text-gray-600" />
            </div>
            <div className="font-bold text-gray-600 tracking-widest"
                style={{
                    fontSize: CODEX_UI.lockQFontSize,          // 原 text-sm
                    lineHeight: lh(CODEX_UI.lockQLine),
                }}>？？？</div>
            <span className="rounded font-mono text-gray-500 border border-white/10 bg-white/[0.04]"
                style={{
                    fontSize: CODEX_UI.lockFontSize,           // 原 text-[10px] px-1.5 py-0.5
                    lineHeight: lh(CODEX_UI.lockLine),
                    paddingLeft: CODEX_UI.badgePadXSm,
                    paddingRight: CODEX_UI.badgePadXSm,
                    paddingTop: CODEX_UI.badgePadY,
                    paddingBottom: CODEX_UI.badgePadY,
                }}>未解锁</span>
        </div>
    );

    const currentList = tab === 'enhancement' ? enhList : tab === 'enemy' ? enemyEnhList : equipList;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[1000] bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 text-white font-sans select-none overflow-hidden flex flex-col"
        >
            {/* 顶部栏：返回 + 标题 + 筛选（搜索 + 品质多选 + 重置）—— 原 px-6 pt-5 pb-4 gap-4 */}
            <div className="relative z-20 shrink-0 flex items-center border-b border-white/10 bg-black/30 backdrop-blur-sm"
                style={{
                    paddingLeft: CODEX_UI.topPadX,
                    paddingRight: CODEX_UI.topPadX,
                    paddingTop: CODEX_UI.topPadTop,
                    paddingBottom: CODEX_UI.topPadBottom,
                    gap: CODEX_UI.topGap,
                }}>
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                    className="rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/40 transition-all group"
                    style={{ padding: CODEX_UI.backPad }}   // 原 p-2.5
                    title="返回"
                >
                    <ArrowLeft size={CODEX_UI.backIconSize} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
                <div className="flex flex-col">
                    <span className="font-black tracking-widest drop-shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                        style={{
                            fontSize: CODEX_UI.titleFontSize,          // 原 text-lg
                            lineHeight: lh(CODEX_UI.titleLine),
                        }}>逻辑研习</span>
                    <span className="text-gray-400 font-mono tracking-wider"
                        style={{
                            fontSize: CODEX_UI.subtitleFontSize,       // 原 text-[11px]
                            lineHeight: lh(CODEX_UI.subtitleLine),
                        }}>悖论图鉴 · CODEX</span>
                </div>

                {/* 筛选区 */}
                <div className="ml-auto flex items-center gap-2">
                    {/* 文字搜索 —— 原 w-44 pl-8 pr-7 py-1.5 text-sm */}
                    <div className="relative" style={{ width: CODEX_UI.searchWidth }}>
                        <Search size={CODEX_UI.searchIconSize} className="absolute top-1/2 -translate-y-1/2 text-gray-500"
                            style={{ left: CODEX_UI.searchIconLeft }} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="搜索名称 / 描述…"
                            className="w-full rounded-full bg-white/[0.06] border border-white/15 focus:border-purple-400/60 focus:bg-white/[0.09] outline-none placeholder-gray-500 transition-all"
                            style={{
                                fontSize: CODEX_UI.searchFontSize,
                                lineHeight: lh(CODEX_UI.searchLine),
                                paddingLeft: CODEX_UI.searchPadLeft,
                                paddingRight: CODEX_UI.searchPadRight,
                                paddingTop: CODEX_UI.searchPadY,
                                paddingBottom: CODEX_UI.searchPadY,
                            }}
                        />
                        {search && (
                            <button onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setSearch(''); }}
                                className="absolute top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                style={{ right: CODEX_UI.searchClearRight }}>
                                <X size={CODEX_UI.searchIconSize} />
                            </button>
                        )}
                    </div>

                    {/* 品质多选 —— 原 gap-1.5 px-2.5 py-1.5 text-xs */}
                    <div className="flex items-center" style={{ gap: CODEX_UI.chipGap }}>
                        {QUALITY_ORDER.map(q => {
                            const meta = RARITY_META[q];
                            const active = qualities.has(q);
                            const Icon = meta.Icon;
                            return (
                                <button
                                    key={q}
                                    onClick={() => {eventBus.emit(GameEvents.UI_CLICK); toggleQuality(q); }}
                                    className="flex items-center rounded-full border transition-all"
                                    style={{
                                        gap: CODEX_UI.chipGap,
                                        paddingLeft: CODEX_UI.chipPadX,
                                        paddingRight: CODEX_UI.chipPadX,
                                        paddingTop: CODEX_UI.chipPadY,
                                        paddingBottom: CODEX_UI.chipPadY,
                                        fontSize: CODEX_UI.chipFontSize,
                                        lineHeight: lh(CODEX_UI.chipLine),
                                        borderColor: active ? `${meta.color}aa` : 'rgba(255,255,255,0.12)',
                                        background: active ? `${meta.color}22` : 'rgba(255,255,255,0.04)',
                                        color: active ? meta.color : '#9ca3af',
                                    }}
                                    title={meta.label}
                                >
                                    <Icon size={CODEX_UI.chipIconSize} fill={active ? meta.color : 'none'} strokeWidth={1.8} style={{ color: meta.color }} />
                                    {meta.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* 重置筛选 —— 原 gap-1.5 px-3 py-1.5 text-xs */}
                    {hasFilter && (
                        <button
                            onClick={() => {eventBus.emit(GameEvents.UI_CLICK); resetFilter(); }}
                            className="flex items-center rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 hover:bg-amber-500/25 transition-all"
                            style={{
                                gap: CODEX_UI.chipGap,
                                paddingLeft: CODEX_UI.resetPadX,
                                paddingRight: CODEX_UI.resetPadX,
                                paddingTop: CODEX_UI.resetPadY,
                                paddingBottom: CODEX_UI.resetPadY,
                                fontSize: CODEX_UI.resetFontSize,
                                lineHeight: lh(CODEX_UI.resetLine),
                            }}
                        >
                            <RotateCcw size={CODEX_UI.resetIconSize} />
                            重置
                        </button>
                    )}
                </div>
            </div>

            {/* 主体：左侧 tab 侧边栏 + 方块网格
                🔴 原为 `h-[calc(100%-80px)]`：用硬编码 80 去抵消顶栏高度，而顶栏实际约 77px
                   ⇒ 字号一放大差值就露出来。现改由 flex 让主体自然 `flex-1` 撑满（缺陷①，无魔法数字）。 */}
            <div className="relative flex-1 min-h-0 flex">
                {/* 左侧侧边栏：装备 / 强化 tab —— 原 w-44 gap-1.5 p-3 */}
                <div className="shrink-0 border-r border-white/10 bg-black/20 flex flex-col"
                    style={{
                        width: CODEX_UI.sideWidth,
                        padding: CODEX_UI.sidePad,
                        gap: CODEX_UI.sideGap,
                    }}>
                    <button
                        onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setTab('equipment'); }}
                        className={`flex items-center rounded-xl border transition-all
                            ${tab === 'equipment'
                                ? 'bg-purple-500/20 border-purple-400/50 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)]'
                                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                        style={{
                            gap: CODEX_UI.tabGap,
                            paddingLeft: CODEX_UI.tabPadX,
                            paddingRight: CODEX_UI.tabPadX,
                            paddingTop: CODEX_UI.tabPadY,
                            paddingBottom: CODEX_UI.tabPadY,
                            fontSize: CODEX_UI.tabFontSize,        // 原 text-sm
                            lineHeight: lh(CODEX_UI.tabLine),
                        }}
                    >
                        <Swords size={CODEX_UI.tabIconSize} className="shrink-0" />
                        <span className="font-medium">装备图鉴</span>
                        <span className="ml-auto font-mono opacity-60"
                            style={{
                                fontSize: CODEX_UI.countFontSize,   // 原 text-[10px]
                                lineHeight: lh(CODEX_UI.countLine),
                            }}>{EQUIPMENT_DEFS.length}</span>
                    </button>
                    <button
                        onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setTab('enhancement'); }}
                        className={`flex items-center rounded-xl border transition-all
                            ${tab === 'enhancement'
                                ? 'bg-purple-500/20 border-purple-400/50 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)]'
                                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                        style={{
                            gap: CODEX_UI.tabGap,
                            paddingLeft: CODEX_UI.tabPadX,
                            paddingRight: CODEX_UI.tabPadX,
                            paddingTop: CODEX_UI.tabPadY,
                            paddingBottom: CODEX_UI.tabPadY,
                            fontSize: CODEX_UI.tabFontSize,        // 原 text-sm
                            lineHeight: lh(CODEX_UI.tabLine),
                        }}
                    >
                        <Sparkles size={CODEX_UI.tabIconSize} className="shrink-0" />
                        <span className="font-medium">强化图鉴</span>
                        <span className="ml-auto font-mono opacity-60"
                            style={{
                                fontSize: CODEX_UI.countFontSize,   // 原 text-[10px]
                                lineHeight: lh(CODEX_UI.countLine),
                            }}>{PLAYER_ENHANCEMENTS.length}</span>
                    </button>
                    {/* [2026-10-26 莉莉子] 敌方强化页签 —— 程报「只能看到玩家能拿到什么，看不到敌人能拿什么」 */}
                    <button
                        onClick={() => {eventBus.emit(GameEvents.UI_CLICK); setTab('enemy'); }}
                        className={`flex items-center rounded-xl border transition-all
                            ${tab === 'enemy'
                                ? 'bg-red-500/20 border-red-400/50 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)]'
                                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                        style={{
                            gap: CODEX_UI.tabGap,
                            paddingLeft: CODEX_UI.tabPadX,
                            paddingRight: CODEX_UI.tabPadX,
                            paddingTop: CODEX_UI.tabPadY,
                            paddingBottom: CODEX_UI.tabPadY,
                            fontSize: CODEX_UI.tabFontSize,        // 原 text-sm
                            lineHeight: lh(CODEX_UI.tabLine),
                        }}
                    >
                        <Skull size={CODEX_UI.tabIconSize} className="shrink-0" />
                        <span className="font-medium">敌方强化</span>
                        <span className="ml-auto font-mono opacity-60"
                            style={{
                                fontSize: CODEX_UI.countFontSize,   // 原 text-[10px]
                                lineHeight: lh(CODEX_UI.countLine),
                            }}>{ENEMY_ONLY_ENHANCEMENTS.length}</span>
                    </button>
                </div>

                {/* 方块网格（[2026-08-26] 隐藏滚动条保留滚轮；未解锁显示锁定块）—— 原 px-6 py-5 */}
                <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    style={{
                        paddingLeft: CODEX_UI.gridPadX,
                        paddingRight: CODEX_UI.gridPadX,
                        paddingTop: CODEX_UI.gridPadY,
                        paddingBottom: CODEX_UI.gridPadY,
                    }}>
                    {currentList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-500"
                            style={{ gap: CODEX_UI.emptyGap }}>
                            <Inbox size={CODEX_UI.emptyIconSize} />
                            <span className="font-mono"
                                style={{
                                    fontSize: CODEX_UI.emptyFontSize,   // 原 text-sm
                                    lineHeight: lh(CODEX_UI.emptyLine),
                                }}>无匹配条目</span>
                        </div>
                    ) : (
                        <div className="grid"
                            style={{
                                gridTemplateColumns: `repeat(${CODEX_UI.gridCols}, minmax(0, 1fr))`,  // 原 repeat(auto-fill,minmax(210px,1fr)) = 实测 6 列
                                gap: CODEX_UI.gridGap,                                              // 原 gap-3
                            }}>
                            {currentList.map(it => {
                                if (tab === 'enhancement') {
                                    const e = it as MazeBuff;
                                    return isEnhUnlocked(e.id) ? renderEnhBlock(e, isEnhNew(e.id)) : renderLockedBlock();
                                }
                                // [2026-10-26 莉莉子 · 程拍板「遇到过才解锁」]
                                //   敌方强化同样走解锁门槛 —— 进入战斗时敌人携带的强化已被记为已收录，
                                //   没遭遇过的显示为锁定块（否则"收集图鉴"这件事对敌方那半完全不存在）。
                                if (tab === 'enemy') {
                                    const e = it as MazeBuff;
                                    return isEnhUnlocked(e.id) ? renderEnhBlock(e, isEnhNew(e.id)) : renderLockedBlock();
                                }
                                const e = it as EquipmentDef;
                                return isEquipUnlocked(e.id) ? renderEquipBlock(e) : renderLockedBlock();
                            })}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
