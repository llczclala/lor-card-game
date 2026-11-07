// ==========================================
// 悖论迷宫 · 评估嘉勉——肉鸽通行证面板
// [2026-08-29 莉莉子] 程拍板：评估嘉勉 = 肉鸽通行证（区别于军功任务系统）。
//   固定等级轨道 1~30，每级一个奖励槽（稀有武装 / 卡包 / 迷宫强化解锁 / 数据金）；
//   游玩进度（对局 + 任务）给分析员经验 → 升级解锁对应等级奖励。
//   卡包需手动打开（打开随机获得一个武装）。等级/经验复用 UserProfile.level/exp。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Package, Lock, Gem, Sparkles, Ticket } from 'lucide-react';
import { ANALYST_MAX_LEVEL, ANALYST_FIXED_REWARD_MAX, ANALYST_POST_CAP_EXP, getAnalystReward, getNextAnalystMilestone, getAnalystExpToNext } from '../../data/roguelike/analystProgression';
import { getEquipmentById, type EquipmentRarity } from '../../data/equipment';
import { readArmStock } from '../../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import {
    readVoucher, readVoucherFirstUsed, voucherExchangeCostOf, voucherChestCostOf,
    VOUCHER_RARITY_LABEL, EXCHANGEABLE_RARITIES,
} from '../../data/roguelike/armamentVoucher'; // [2026-10-20 程拍板] 匣券：重复武装 → 兑换更高品质武装匣
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs';
import { PackOpenModal } from './PackOpenModal'; // [2026-08-29] 卡包 → 抽到匣子
import { ChestOpenModal, type ChestOpenResult } from './ChestOpenModal'; // [2026-09-29 程拍板] 打开匣子 → 得道具
import type { ChestInstance, ChestKind } from '../../data/roguelike/divinityShards'; // [2026-09-29] 奖励匣 · [2026-11-07] +ChestKind（定向开包）
import { RARITY_META } from './RarityIcon'; // [2026-09-04] 武装品质元数据
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 面板关闭/开包 音效
import { bindArmamentGaze } from './ArmamentPreview'; // [2026-09-04] 悬停大图检视
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview'; // [2026-09-04] 强化悬停大图
// [2026-10-20 莉莉子 🎨 视觉层优化] 匣子插画唯一真源（UI 侧不出现裸图片路径）
import { getChestArt, getChestArtName, VOUCHER_ART } from '../../data/roguelike/chestArt';
import { pickTuning } from '../../platform/tuning'; // [2026-10-25 莉莉子 📱] 双平台调参（平台判定只在这一层）

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 评估嘉勉 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 为什么需要它（2026-10-25 手机端可读性）：
//   界面跑在**固定 1680×1050 画布**里，整画布 `transform: scale(s)` 塞进窗口
//   （`s = min(窗口宽/1680, 窗口高/1050)`）。PC 1920×1080 → s≈1.03；手机横屏 → s≈**0.374**。
//   因为整画布等比缩放，**布局比例永不破**，问题纯粹是"字太小"：
//     原来 `text-[9px]`（奖励名）→ 手机只剩 **3.4 CSS px**；
//     `text-[10px]`（轨道标题/单价/首次优惠）→ **3.7 CSS px**，等于看不见。
//   ⇒ 本面板按 **核心 / 次级 / 装饰** 三档把字号抬到可读下限（见下方分组注释）。
//
// ⚠️ 所有值都是**画布 px 绝对数字**（换算口径 ×1：`text-sm`=14、`text-xs`=12、`text-[9px]`=9），
//    直接进 `style={{}}`，不再走 Tailwind 尺寸类。
// 🔴 行高陷阱：Tailwind 内置行高是**固定 rem**，不随字号走（`text-xs`=12/16、`text-2xl`=24/32、
//    `text-4xl`=36/40）⇒ 每个 fontSize 都必须配一个 Line 字段，否则放大字号后行高不变 = 字叠在一起。
//    原本**没有行高类**的（大量 `text-[9px]/[10px]/[11px]`，以及**没写字号类的按钮 = 继承 16px**），
//    PC 值一律填 `0` ⇒ `lh(0)` 返回 `undefined` ⇒ 回落浏览器 `normal`。
// 🔴 `lh()` 不是装饰，是**必须**：React 把 `lineHeight` 列入 unitless 属性表
//    ⇒ `style={{ lineHeight: 40 }}` 编译成 `line-height: 40` = **40 倍字号**（32px 字 → 1280px 行高）。
//    调参区存的是**画布 px 数字**，故一律套 `lh(EVAL_UI.xLine)`；`tsc` 查不出这类错。
// ⚠️ `fixed inset-0` 的 containing block 是 `#game-scale-container`（带 transform），铺的是**画布**
//    不是窗口 ⇒ 本文件禁用 `vh`/`vw`（改成 px 绝对数字）。
// ⚠️ 两个来源对象**都不要加 `as const`** —— 字面量类型会让合并时类型冲突（`tuning.ts` 注释 §1.3 ④）。
// 用法：改 `EVAL_UI_MOBILE` = 改手机端；改 `EVAL_UI_PC_DIFF` = 改 PC 端。
// ══════════════════════════════════════════════════════════════════════
const EVAL_UI_MOBILE = {
    // ══ 面板外框 ══════════════════════════════════════════════════════
    panelW: 1600,           // 面板宽画布 px（原 w-[880px]）
    panelMaxH: 1000,        // 面板最大高画布 px（原 max-h-[903px]）

    // ══ ① 头部：圆章 / 标题 / 经验条 / 经验读数 ═══════════════════════
    headPad: 20,            // 头部内边距 px（原 p-5）——两端同值
    headGap: 24,            // 圆章 ↔ 文本块 ↔ 按钮组的间距 px（原 gap-4）
    badgeSize: 96,          // 等级圆章直径 px（原 w-20 h-20 = 80）
    levelFontSize: 40,      // 等级大数字字号（次级档；原 text-4xl = 36）
    levelLine: 44,          // 原 text-4xl 内置行高 40 ⇒ PC 填 40
    titleFontSize: 36,      // 面板标题字号（次级档；原 text-2xl = 24）
    titleLine: 44,          // 原 text-2xl 内置行高 32 ⇒ PC 填 32
    expBarH: 10,            // 经验条高度 px（原 h-2.5）——两端同值
    expBarMt: 4,            // 标题 ↓ 经验条 px（原 mt-1）——两端同值
    expFontSize: 32,        // 经验读数字号（核心档；原 text-xs = 12）
    expLine: 38,            // 原 text-xs 内置行高 16 ⇒ PC 填 16
    expTextMt: 4,           // 经验条 ↓ 读数 px（原 mt-1）——两端同值

    // ══ ② 头部按钮组（一键领取 / 打开卡包 / 打开匣子）════════════════
    //  ⚠️ 这三个按钮**原本没有字号类** ⇒ 继承 16px ⇒ PC 值填 0（= 不动，别改 PC 观感）
    headBtnGap: 12,         // 按钮之间的间距 px（原 gap-3）——两端同值
    // [2026-10-28 莉莉子 · 独立验证 P1 修复] 原按钮**内部**图标↔文字是 `gap-2`(=8)，
    //   与按钮**之间**的 `gap-3`(=12) 不是一个值。初版两者共用了 `headBtnGap`
    //   ⇒ PC 端按钮各胖 4px、右端按钮组左移 8px。现拆成独立字段。
    headBtnIconGap: 12,     // 按钮内图标↔文字 px（原 gap-2 = 8 ⇒ PC 填 8）
    headBtnFontSize: 32,    // 按钮标签字号（核心档；原无字号类 = 继承 16）
    headBtnLine: 40,        // 原无行高类 ⇒ PC 填 0
    headBtnPadX: 16,        // 原 px-4 ——两端同值
    headBtnPadY: 10,        // 原 py-2.5 ——两端同值
    headBtnIcon: 26,        // 按钮内 lucide 图标 px（原 <Package size={18} /> / <Gem size={18} />）
    countBadgeSize: 28,     // 数量角标直径 px（原 min-w-5 h-5 = 20）
    countBadgeFontSize: 20, // 角标数字（装饰档；原 text-[10px]）
    countBadgeLine: 24,     // 原无行高类 ⇒ PC 填 0
    countBadgeInset: 8,     // 角标外探距离 px（原 -top-1.5 -right-1.5 = 6）——两端同值
    closeBtnPad: 10,        // 关闭按钮内边距 px（原 p-2）
    closeIcon: 30,          // 关闭图标 px（原 <X size={20} />）

    // ══ ③ 滚动区 ══════════════════════════════════════════════════════
    scrollPadX: 24,         // 左右内边距 px（原 p-5）
    scrollPadTop: 20,       // 上内边距 px（原 p-5）——两端同值
    //  🔴 缺陷修复①：原来滚动条被 `[&::-webkit-scrollbar]:hidden` 显式隐藏，
    //     字号放大后内容大幅变长，用户**不知道下面还有「匣券兑换」「已收集武装」**。
    //     ⇒ 手机端底部内边距 20 → 48（末块不贴边，暗示"还有内容"），
    //     并把隐藏滚动条的类**换成细滚动条**（见 scrollAreaClass）。
    scrollPadBottom: 48,    // 原 p-5 = 20
    // 滚动条外观类：手机 = 可见细条（紫）；PC = 原样隐藏（逐像素不变）
    scrollAreaClass: '[&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-purple-500/50 [&::-webkit-scrollbar-track]:bg-transparent',

    // ══ ④ 区块标题通用间距 ════════════════════════════════════════════
    titleIconGap: 8,        // 区块标题内 图标 ↔ 文字 px（原 gap-1 = 4；四处标题共用）
    blockHeadGap: 16,       // 「30 级之后」「匣券兑换」行内 左文 ↔ 右按钮/计数 px（原 gap-3 = 12）

    // ══ ⑤ 轨道标题 ════════════════════════════════════════════════════
    trackTitleFontSize: 24, // 装饰档（原 text-[10px]）
    trackTitleLine: 30,     // 原无行高类 ⇒ PC 填 0
    trackTitleMb: 8,        // 标题 ↓ 网格 px（原 mb-2）——两端同值
    trackTitleIcon: 20,     // 标题内 <Sparkles size={12} />

    // ══ ⑥ 等级轨道网格（1~30）═════════════════════════════════════════
    trackCols: 4,           // 🔴 列数（原 grid-cols-6）——手机 4 列：单格 376px 才装得下 32px 中文
    trackGap: 12,           // 格间距 px（原 gap-2）

    // ══ ⑦ 轨道单格内部 ════════════════════════════════════════════════
    cellPadY: 12,           // 上下内边距 px（原 py-2.5 = 10）
    cellPadX: 8,            // 左右内边距 px（原 px-1 = 4）
    //  🔴 缺陷修复②：可领取格 / 「✓已领」格 / 未达格 三种内部高度不同 ⇒ 行会跳。
    //     ⇒ 给每格设 minHeight 统一高度；PC 填 0 = 不介入（PC 原样）。
    cellMinH: 236,          // 原无（PC 填 0 ⇒ 代码里 `|| undefined`）
    cellLvFontSize: 28,     // 「Lv.N」字号（核心档；原 text-[11px]）
    cellLvLine: 28,         // 原 leading-none=1 ⇒ 行高 = 字号 ⇒ PC 填 11
    cellIconBox: 56,        // 图标盒边长 px（原 h-8 w-8 = 32）
    cellIconMy: 8,          // 图标盒上下外边距 px（原 my-1.5 = 6）
    cellHexSize: 52,        // 品质六边形图标 px（RarityHex size={30}）
    cellRewardIcon: 34,     // 卡包图标 px（原 <Package size={20}/>）
    cellAltIcon: 34,        // 数据金 / 兜底图标 px（原 <Coins size={18}/> / <Gem size={18}/> / <Sparkles size={18}/>）
    cellPlaceholderFontSize: 32, // 「无奖励」破折号字号（原 text-sm = 14）
    cellPlaceholderLine: 40,     // 原 text-sm 内置行高 20 ⇒ PC 填 20
    cellNameFontSize: 32,   // 奖励名字号（核心档；原 text-[9px]）
    cellNameLine: 40,       // 原 leading-tight=1.25 ⇒ 9×1.25=11.25 ⇒ PC 填 11.25
    cellClaimFontSize: 32,  // 「领取」按钮（核心档；原 text-[10px]）
    cellClaimLine: 40,      // 原无行高类 ⇒ PC 填 0
    cellClaimPadX: 12,      // 原 px-2.5 = 10
    cellClaimPadY: 4,       // 原 py-0.5 = 2
    cellClaimMt: 4,         // 奖励名 ↓ 按钮 px（原 mt-1）——两端同值
    cellClaimedFontSize: 32, // 「✓ 已领」（核心档；原 text-[10px]）
    cellClaimedLine: 40,    // 原无行高类 ⇒ PC 填 0
    cellLockIcon: 18,       // 未达锁定角标 px（原 <Lock size={10} />）
    cellLockInset: 4,       // 角标贴边距离 px（原 top-1 right-1）——两端同值

    // ══ ⑧ 30 级之后 · 无限嘉勉 ════════════════════════════════════════
    postCapMt: 16,          // 与轨道网格的间距 px（原 mt-4）——两端同值
    postCapPadX: 16,        // 原 px-4 ——两端同值
    postCapPadY: 12,        // 原 py-3 ——两端同值
    postCapTitleFontSize: 32, // 「30 级之后 · 无限嘉勉」（核心档；原 text-[11px]）
    postCapTitleLine: 38,   // 原无行高类 ⇒ PC 填 0
    postCapTitleIcon: 20,   // 原 <Sparkles size={12} />
    postCapBodyFontSize: 32, // 等级/里程碑读数（核心档；原 text-[11px]）
    postCapBodyLine: 40,    // 原无行高类 ⇒ PC 填 0
    postCapBodyMt: 2,       // 标题 ↓ 读数 px（原 mt-0.5）——两端同值
    postCapHintFontSize: 24, // 说明文案（装饰档；原 text-[10px]）
    postCapHintLine: 30,    // 原无行高类 ⇒ PC 填 0
    postCapBtnFontSize: 32, // 「领取嘉勉 / 已领完」按钮（原无字号类 ⇒ 继承 16）
    postCapBtnLine: 40,     // 原无行高类 ⇒ PC 填 0
    postCapBtnPadX: 12,     // 原 px-3 ——两端同值
    postCapBtnPadY: 10,     // 原 py-2 = 8

    // ══ ⑨ 匣券兑换 ════════════════════════════════════════════════════
    couponMt: 20,           // 与上方区块的间距 px（原 mt-5）——两端同值
    couponPadX: 16,         // 原 px-4 ——两端同值
    couponPadY: 12,         // 原 py-3 ——两端同值
    couponTitleFontSize: 24,   // 「匣券兑换」（装饰档；原 text-[10px]）
    couponTitleLine: 30,       // 原无行高类 ⇒ PC 填 0
    couponTitleIcon: 18,       // 原 <Ticket size={12} />
    voucherArtSize: 40,        // 券小图边长 px（原 inline style 22）
    couponCountGap: 10,        // 券小图 ↔ 「持有 X 张」px（原 gap-1.5 = 6）
    couponCountFontSize: 24,   // 「持有 X 张」文字（装饰档；原 text-xs）
    couponCountLine: 30,       // 原 text-xs 内置行高 16 ⇒ PC 填 16
    couponBalanceFontSize: 36, // 券数量数字（次级档；原 text-sm）
    couponBalanceLine: 44,     // 原 text-sm 内置行高 20 ⇒ PC 填 20
    couponHintFontSize: 24,    // 说明文案（装饰档；原 text-[10px]）
    couponHintLine: 30,        // 原无行高类 ⇒ PC 填 0
    couponGridMt: 16,          // 说明 ↓ 兑换网格 px（原 mt-2.5 = 10）
    couponCols: 5,          // 列数（原 grid-cols-5）——两端同值
    couponGap: 12,          // 卡间距 px（原 gap-2）
    couponCardGap: 4,       // 卡内纵间距 px（原 gap-0.5 = 2）
    couponCardPadY: 10,     // 卡内上下内边距 px（原 py-2 = 8）
    couponArtSize: 64,      // 武装匣插画边长 px（原 inline style 40）
    couponRarityFontSize: 32, // 「史诗匣」品质名（核心档；原 text-[11px]）
    couponRarityLine: 38,     // 原无行高类 ⇒ PC 填 0
    couponCostFontSize: 32,   // 价格（核心档；原 text-[11px]）
    couponCostLine: 40,       // 原无行高类 ⇒ PC 填 0
    couponTagFontSize: 24,    // 「首次优惠 / 匣券」标签（装饰档；原 text-[9px]）
    couponTagLine: 30,        // 原无行高类 ⇒ PC 填 0

    // ══ ⑩ 已收集武装 ══════════════════════════════════════════════════
    ownedTitleMt: 20,       // 与上方区块的间距 px（原 mt-5）——两端同值
    ownedTitleFontSize: 24, // 区块标题（装饰档；原 text-[10px]）
    ownedTitleLine: 30,     // 原无行高类 ⇒ PC 填 0
    ownedTitleIcon: 18,     // 原 <Gem size={12} />
    ownedListMt: 12,        // 标题 ↓ 徽章流 px（原 mt-2 = 8）
    ownedWrapGap: 12,       // 徽章之间的间距 px（原 gap-2 = 8）
    ownedEmptyFontSize: 32, // 空态文案（核心档；原 text-xs）
    ownedEmptyLine: 38,     // 原 text-xs 内置行高 16 ⇒ PC 填 16
    ownedCardGap: 8,        // 图标 ↔ 名称 px（原 gap-1.5 = 6）
    ownedCardPadX: 14,      // 原 px-2.5 = 10
    ownedCardPadY: 6,       // 原 py-1 = 4
    ownedHexSize: 40,       // 品质六边形 px（RarityHex size={22}）
    ownedNameFontSize: 32,  // 武装名字号（核心档；原 text-xs）
    ownedNameLine: 38,      // 原 text-xs 内置行高 16 ⇒ PC 填 16

    // ══ ⑪ toast（领取反馈）════════════════════════════════════════════
    toastFontSize: 32,      // 原无字号类 ⇒ 继承 16（核心档）
    toastLine: 40,          // 原无行高类 ⇒ PC 填 0
    toastPadX: 20,          // 原 px-5 ——两端同值
    toastPadY: 10,          // 原 py-2.5 ——两端同值
    toastBottom: 40,        // 距底距离 px（原 bottom-10）——两端同值
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 每一项都是**由原 Tailwind 类反推**的当前 PC 值（口径 ×1）⇒ PC 视觉逐像素不变。
// 改这里 = 改 PC 观感；改上面 = 改手机观感。
// ══════════════════════════════════════════════════════════════════════
const EVAL_UI_PC_DIFF = {
    panelW: 880,            // 原 w-[880px]
    panelMaxH: 903,         // 原 max-h-[903px]

    headGap: 16,            // 原 gap-4
    badgeSize: 80,          // 原 w-20 h-20
    levelFontSize: 36,      // 原 text-4xl
    levelLine: 40,          // 原 text-4xl 内置行高
    titleFontSize: 24,      // 原 text-2xl
    titleLine: 32,          // 原 text-2xl 内置行高
    expFontSize: 12,        // 原 text-xs
    expLine: 16,            // 原 text-xs 内置行高

    headBtnFontSize: 0,     // 原无字号类（继承 16）⇒ 0 = 不动
    headBtnLine: 0,         // 原无行高类
    headBtnIconGap: 8,      // 原 gap-2（初版误用 headBtnGap=12 ⇒ 按钮各胖 4px）
    headBtnIcon: 18,        // 原 <Package size={18} /> / <Gem size={18} />
    countBadgeSize: 20,     // 原 min-w-5 h-5
    countBadgeFontSize: 10, // 原 text-[10px]
    countBadgeLine: 0,      // 原无行高类
    countBadgeInset: 6,     // 原 -top-1.5 -right-1.5
    closeBtnPad: 8,         // 原 p-2
    closeIcon: 20,          // 原 <X size={20} />

    scrollPadX: 20,         // 原 p-5
    scrollPadTop: 20,       // 原 p-5
    scrollPadBottom: 20,    // 原 p-5（手机端加到 48，修"看不出还能往下"）
    scrollAreaClass: '[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]', // 原样隐藏

    titleIconGap: 4,        // 原 gap-1
    blockHeadGap: 12,       // 原 gap-3

    trackTitleFontSize: 10, // 原 text-[10px]
    trackTitleLine: 0,      // 原无行高类
    trackTitleIcon: 12,     // 原 <Sparkles size={12} />

    trackCols: 6,           // 原 grid-cols-6
    trackGap: 8,            // 原 gap-2

    cellPadY: 10,           // 原 py-2.5
    cellPadX: 4,            // 原 px-1
    cellMinH: 0,            // 原无（0 = 不介入）
    cellLvFontSize: 11,     // 原 text-[11px]
    cellLvLine: 11,         // 原 leading-none（行高 = 字号）
    cellIconBox: 32,        // 原 h-8 w-8
    cellIconMy: 6,          // 原 my-1.5
    cellHexSize: 30,        // 原 RarityHex size={30}
    cellRewardIcon: 20,     // 原 <Package size={20} />
    cellAltIcon: 18,        // 原 <Coins size={18} /> / <Gem size={18} /> / <Sparkles size={18} />
    cellPlaceholderFontSize: 14, // 原 text-sm
    cellPlaceholderLine: 20,     // 原 text-sm 内置行高
    cellNameFontSize: 9,    // 原 text-[9px]
    cellNameLine: 11.25,    // 原 leading-tight（9 × 1.25）
    cellClaimFontSize: 10,  // 原 text-[10px]
    cellClaimLine: 0,       // 原无行高类
    cellClaimPadX: 10,      // 原 px-2.5
    cellClaimPadY: 2,       // 原 py-0.5
    cellClaimedFontSize: 10, // 原 text-[10px]
    cellClaimedLine: 0,     // 原无行高类
    cellLockIcon: 10,       // 原 <Lock size={10} />

    postCapTitleFontSize: 11, // 原 text-[11px]
    postCapTitleLine: 0,    // 原无行高类
    postCapTitleIcon: 12,   // 原 <Sparkles size={12} />
    postCapBodyFontSize: 11, // 原 text-[11px]
    postCapBodyLine: 0,     // 原无行高类
    postCapHintFontSize: 10, // 原 text-[10px]
    postCapHintLine: 0,     // 原无行高类
    postCapBtnFontSize: 0,  // 原无字号类（继承 16）⇒ 0 = 不动
    postCapBtnLine: 0,      // 原无行高类
    postCapBtnPadY: 8,      // 原 py-2

    couponTitleFontSize: 10, // 原 text-[10px]
    couponTitleLine: 0,     // 原无行高类
    couponTitleIcon: 12,    // 原 <Ticket size={12} />
    voucherArtSize: 22,     // 原 inline style 22
    couponCountGap: 6,      // 原 gap-1.5
    couponCountFontSize: 12, // 原 text-xs
    couponCountLine: 16,    // 原 text-xs 内置行高
    couponBalanceFontSize: 14, // 原 text-sm
    couponBalanceLine: 20,  // 原 text-sm 内置行高
    couponHintFontSize: 10, // 原 text-[10px]
    couponHintLine: 0,      // 原无行高类
    couponGridMt: 10,       // 原 mt-2.5
    couponGap: 8,           // 原 gap-2
    couponCardGap: 2,       // 原 gap-0.5
    couponCardPadY: 8,      // 原 py-2
    couponArtSize: 40,      // 原 inline style 40
    couponRarityFontSize: 11, // 原 text-[11px]
    couponRarityLine: 0,    // 原无行高类
    couponCostFontSize: 11, // 原 text-[11px]
    couponCostLine: 0,      // 原无行高类
    couponTagFontSize: 9,   // 原 text-[9px]
    couponTagLine: 0,       // 原无行高类

    ownedTitleFontSize: 10, // 原 text-[10px]
    ownedTitleLine: 0,      // 原无行高类
    ownedTitleIcon: 12,     // 原 <Gem size={12} />
    ownedListMt: 8,         // 原 mt-2
    ownedWrapGap: 8,        // 原 gap-2
    ownedEmptyFontSize: 12, // 原 text-xs
    ownedEmptyLine: 16,     // 原 text-xs 内置行高
    ownedCardGap: 6,        // 原 gap-1.5
    ownedCardPadX: 10,      // 原 px-2.5
    ownedCardPadY: 4,       // 原 py-1
    ownedHexSize: 22,       // 原 RarityHex size={22}
    ownedNameFontSize: 12,  // 原 text-xs
    ownedNameLine: 16,      // 原 text-xs 内置行高

    toastFontSize: 0,       // 原无字号类（继承 16）⇒ 0 = 不动
    toastLine: 0,           // 原无行高类
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const EVAL_UI_PC = { ...EVAL_UI_MOBILE, ...EVAL_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定收在 `src/platform/tuning.ts`） */
export const EVAL_UI = pickTuning(EVAL_UI_PC, EVAL_UI_MOBILE);

/**
 * 🔴 行高包装 —— **每个 Line 字段都必须过这一层**（与 `RogueMissionPanel.tsx` 同一实现）。
 *
 * 为什么（这一条能让整屏崩，且 `tsc` 查不出来）：React 把 `lineHeight` 列入
 *   **unitless 属性表** ⇒ `style={{ lineHeight: 40 }}` 编译出的是 `line-height: 40`，
 *   即 **40 倍字号**（32px 字 → 1280px 行高）。而调参区里 `xLine` 存的是**画布 px 数字**。
 *   ⇒ 统一在这里补 `px`；`0 ⇒ undefined ⇒ 回落浏览器 normal`
 *   （PC 那些"原本没有行高类"的字段就是靠这条保原样）。
 */
const lh = (px: number): string | undefined => (px ? `${px}px` : undefined);

/**
 * [2026-10-20 莉莉子 🎨] 插画兜底：图加载失败 ⇒ 隐藏 img（本文件两处都是"图 + 文字"，隐藏后文字仍在、不白板）
 */
const hideBrokenChestArt = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.visibility = 'hidden';
};

// [2026-09-04] 品质六边形小图标（武装 / 强化解锁通用）：外层品质色环 + 内层深底卡面
const ARM_HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const RarityHex: React.FC<{ icon: string; rarity: string; title?: string; size?: number }> = ({ icon, rarity, title = '', size = 30 }) => {
    const color = RARITY_META[rarity as keyof typeof RARITY_META]?.color ?? '#e5e7eb';
    return (
        <div className="relative shrink-0" style={{ width: size, height: size, clipPath: ARM_HEX, background: color, filter: `drop-shadow(0 0 5px ${color}99)` }}>
            <div className="absolute inset-[2px] overflow-hidden flex items-center justify-center" style={{ clipPath: ARM_HEX, background: '#0d1320' }}>
                <img src={icon} alt={title} className="w-full h-full object-cover" draggable={false} />
            </div>
        </div>
    );
};

interface EvaluationPanelProps {
    isOpen: boolean;
    onClose: () => void;
    userSystem: any; // useUserSystem（profile/settings/openPack/grantAnalystExp）
    divinity?: any;  // [2026-09-29 程拍板] useHeroDivinity（开匣子后的碎片入账）
}

export const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ isOpen, onClose, userSystem, divinity }) => {
    const [toast, setToast] = useState<string | null>(null);
    const [packOpen, setPackOpen] = useState(false); // [2026-08-29] 卡包开箱演出
    const [chestOpen, setChestOpen] = useState(false); // [2026-09-29] 奖励匣开箱
    // [2026-09-04] 强化解锁悬停大图（EnhancementPreview 受控浮层；500ms delay + 150ms leaveBuffer，同 NodePreviewPanel 手感）
    const [hoverBuff, setHoverBuff] = useState<EnhancementPreviewHover | null>(null);
    const enhEnterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const enhLeaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // [2026-09-04 账号等级] 评估嘉勉通行证等级已迁独立存档（analystPass），profile.level/exp 归账号等级
    const analystPass = userSystem?.analystPass;
    const level = analystPass?.level ?? 1;
    const exp = analystPass?.exp ?? 0;
    const expToNext = getAnalystExpToNext(level);
    // [2026-09-07 数量库存] 已武装列表 = 库存>0 的种类名
    const armStockMap = readArmStock(userSystem?.settings as any);
    const ownedArmaments = Object.keys(armStockMap).filter(id => (armStockMap[id] ?? 0) > 0);
    const pendingPacks = userSystem?.settings?.pendingPacks as number | undefined;
    const pendingChests = (userSystem?.settings?.pendingChests ?? []) as ChestInstance[]; // [2026-09-29] 待打开匣子

    // [2026-10-20 程拍板 · 匣券] 余额 / 已用首兑档位 / 兑换动作
    //   为什么兑换入口放在本面板：它是全仓唯一同时握着「奖励入口 + pendingChests 队列 + ChestOpenModal」的地方
    //   ⇒ 兑换出来的匣子**当场**就能在下面打开，闭环最短（实现审查的选型结论）。
    const voucherBalance = readVoucher(userSystem?.settings);
    const voucherUsed = readVoucherFirstUsed(userSystem?.settings);
    const handleExchangeVoucher = (rarity: EquipmentRarity) => {
        const res = userSystem?.exchangeVoucherChest?.(rarity);
        if (!res) return;
        if (res.ok) {
            eventBus.emit(GameEvents.GACHA_CONVERT); // 复用成交音
            setToast(`已兑换 ${VOUCHER_RARITY_LABEL[rarity]}武装匣（消耗 ${res.spent} 匣券）—— 去下面「待打开匣子」开启`);
        } else if (res.reason === 'insufficient') {
            setToast(`匣券不足：需要 ${res.spent}，当前 ${res.balance}`);
        } else if (res.reason === 'no-chest') {
            setToast('该品质暂不开放兑换');
        }
    };

    // ESC 关闭（capture + stopImmediatePropagation 拦截全局 ESC）
    // [2026-10-02 莉莉子 BUG修复 #16] ①分层：开箱弹窗开着时，ESC 只关**最内层**（先详情、再开箱），
    //   不再"一键把整个推演面板关掉"；②复位：本组件是**常驻挂载**（App 只切 isOpen），
    //   子弹窗状态不会随面板关闭自动清空 —— 否则下次打开面板会**自动弹出开箱界面**（状态残留）。
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            e.stopImmediatePropagation();
            if (packOpen) { setPackOpen(false); return; }
            if (chestOpen) { setChestOpen(false); return; }
            onClose();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, packOpen, chestOpen, onClose]);

    // [2026-10-02 #16] 面板一关就把子弹窗状态复位 —— 杜绝"下次打开自动弹开箱"
    useEffect(() => {
        if (!isOpen) { setPackOpen(false); setChestOpen(false); setHoverBuff(null); }
    }, [isOpen]);

    // 强化悬停定时器清理（unmount 兜底）
    useEffect(() => () => {
        if (enhEnterRef.current) clearTimeout(enhEnterRef.current);
        if (enhLeaveRef.current) clearTimeout(enhLeaveRef.current);
    }, []);

    if (!isOpen) return null;

    /** [2026-09-04] 强化奖励悬停 → 浮出 EnhancementPreview 大卡（500ms delay + 150ms leaveBuffer） */
    const bindBuffHover = (buff: MazeBuff) => ({
        onMouseEnter: (e: React.MouseEvent) => {
            if (enhLeaveRef.current) { clearTimeout(enhLeaveRef.current); enhLeaveRef.current = null; }
            if (enhEnterRef.current) clearTimeout(enhEnterRef.current);
            // ⚠️ 同步取 rect：React 合成事件在异步回调里 currentTarget 会被置 null，延迟读取会报错
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            enhEnterRef.current = setTimeout(() => {
                setHoverBuff({ buff, rect });
            }, 500);
        },
        onMouseLeave: () => {
            if (enhEnterRef.current) { clearTimeout(enhEnterRef.current); enhEnterRef.current = null; }
            if (enhLeaveRef.current) clearTimeout(enhLeaveRef.current);
            enhLeaveRef.current = setTimeout(() => setHoverBuff(null), 150);
        },
    });

    /** 等级奖励槽 → 图标/标签 */
    const rewardMeta = (lv: number): { icon: React.ReactNode; label: string; name: string } => {
        // [2026-10-04] 走**唯一出口** `getAnalystReward`（≤30 与旧查表等价；>30 只认里程碑）
        const r = getAnalystReward(lv);
        // [2026-10-25 莉莉子 📱] 图标尺寸全部随格子放大（原 size={30/20/18} 写死，手机上是 11/7/6 CSS px）
        if (!r) return { icon: <span className="text-gray-600" style={{ fontSize: EVAL_UI.cellPlaceholderFontSize, lineHeight: lh(EVAL_UI.cellPlaceholderLine) }}>—</span>, label: '无奖励', name: '' };
        if (r.armamentId) {
            const def = getEquipmentById(r.armamentId);
            return {
                // [2026-09-04] 品质六边形图标（品质色环可见，替代裸卡图）
                icon: def ? <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={EVAL_UI.cellHexSize} /> : <Gem size={EVAL_UI.cellAltIcon} className="text-purple-300" />,
                label: def?.name ?? '', name: `武装 · ${def?.name ?? ''}`,
            };
        }
        // [2026-10-04] 文案修正：卡包在 09-29 之后开的是**奖励匣**（不再是直接开武装）
        if (r.pack) return { icon: <Package size={EVAL_UI.cellRewardIcon} className="text-purple-300" />, label: '卡包', name: '卡包 · 打开随机奖励匣' };
        if (r.unlockEnhancement) {
            const def = getBuffById(r.unlockEnhancement);
            return {
                // [2026-09-04] 品质六边形图标（与武装奖励同视觉语言）
                icon: def ? <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={EVAL_UI.cellHexSize} /> : <Sparkles size={EVAL_UI.cellAltIcon} className="text-cyan-300" />,
                label: def?.name ?? '', name: `强化解锁 · ${def?.name ?? ''}`,
            };
        }
        if (r.dataGold) return { icon: <Coins size={EVAL_UI.cellAltIcon} className="text-yellow-300" />, label: `+${r.dataGold}`, name: `数据金 +${r.dataGold}` };
        return { icon: null, label: '', name: '' };
    };

    /** 打开卡包：弹出开箱演出界面（CS:GO 风格滚动抽武装） */
    const handleOpenPack = () => setPackOpen(true);
    // [2026-08-29 通行证·手动领取] 已领取等级 + 可领取数 + 领取动作
    const claimedLevels = userSystem?.settings?.passClaimedRewards as number[] | undefined;
    const claimedSet = new Set(claimedLevels ?? []);
    // [2026-10-04] 两条线分别算：≤30 走逐级数组（轨道上每格一个按钮）；31+ 走**水位**（不许跳级）
    const claimableCount = Array.from({ length: Math.min(Math.max(0, level), ANALYST_FIXED_REWARD_MAX) }, (_, i) => i + 1)
        .filter(lv => getAnalystReward(lv) && !claimedSet.has(lv)).length;
    const claimedUpTo = Math.max(ANALYST_FIXED_REWARD_MAX, (userSystem?.passClaimedUpTo as number | undefined) ?? ANALYST_FIXED_REWARD_MAX);
    const postCapPending = level > claimedUpTo;                 // 31+ 还有没领的（水位落后于当前等级）
    const nextMilestone = getNextAnalystMilestone(level);        // 下一个里程碑等级（只它才给卡包）
    const totalClaimable = claimableCount + (postCapPending ? 1 : 0);
    const handleClaimLevel = (lv: number) => {
        if (userSystem?.claimPassReward?.(lv)) { setToast('✨ 奖励已领取'); setTimeout(() => setToast(null), 2000); }
    };
    const handleClaimAll = () => {
        const n = userSystem?.claimAllPassRewards?.() ?? 0;
        const post = userSystem?.claimPostCapPassRewards?.();
        const packs = post?.packs ?? 0;
        const total = n + packs;
        if (postCapPending) {
            setToast(packs
                ? `✨ 里程碑 +${packs} 个卡包${n ? `，另有 ${n} 项等级奖励` : ''}（已领至 Lv ${post?.reachedLevel ?? claimedUpTo}）`
                : `已领至 Lv ${post?.reachedLevel ?? claimedUpTo}（31+ 只有里程碑给卡包）`);
            setTimeout(() => setToast(null), 2400);
        } else if (total) {
            setToast(`✨ 已领取 ${total} 项通行证奖励`);
            setTimeout(() => setToast(null), 2000);
        }
    };

    return (
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[950] flex items-center justify-center font-sans select-none">
                <motion.div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                />
                <motion.div
                    initial={{ scale: 0.94, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.94, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    className="relative bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_80px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
                    // [2026-10-25 📱] 手机 1600×1000 / PC 880×903（原 w-[880px] max-h-[903px]）
                    style={{ width: EVAL_UI.panelW, maxHeight: EVAL_UI.panelMaxH }}
                >
                    {/* 头部：分析员等级 + 经验条 + 待打开卡包 */}
                    <div className="flex items-center border-b border-white/10 bg-slate-800/40 shrink-0"
                        style={{ gap: EVAL_UI.headGap, padding: EVAL_UI.headPad }}>
                        <div className="relative rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center border-2 border-cyan-300/50 shadow-[0_0_25px_rgba(34,211,238,0.4)] shrink-0"
                            style={{ width: EVAL_UI.badgeSize, height: EVAL_UI.badgeSize }}>
                            {/* 等级大数字（次级档：手机 40 / PC text-4xl 36） */}
                            <span className="font-black italic text-white"
                                style={{ fontSize: EVAL_UI.levelFontSize, lineHeight: lh(EVAL_UI.levelLine) }}>
                                {level}
                            </span>
                        </div>
                        <div className="flex-1 min-w-0">
                            {/* 面板标题（次级档：手机 36 / PC text-2xl 24） */}
                            <div className="font-black text-white tracking-widest"
                                style={{ fontSize: EVAL_UI.titleFontSize, lineHeight: lh(EVAL_UI.titleLine) }}>
                                评估嘉勉 · 肉鸽通行证
                            </div>
                            <div className="rounded-full bg-black/50 border border-white/10 overflow-hidden"
                                style={{ marginTop: EVAL_UI.expBarMt, height: EVAL_UI.expBarH }}>
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all"
                                    style={{ width: `${expToNext > 0 ? Math.min(100, (exp / expToNext) * 100) : 100}%` }}
                                />
                            </div>
                            {/* 经验读数（核心档：手机 32 / PC text-xs 12） */}
                            <div className="text-gray-400 font-mono"
                                style={{ fontSize: EVAL_UI.expFontSize, marginTop: EVAL_UI.expTextMt, lineHeight: lh(EVAL_UI.expLine) }}>
                                {/* [2026-10-04] 30 级后不再显示"已达最高等级"——通行证改为**无限成长**（每级 1080 经验） */}
                                {`${exp} / ${expToNext} 分析员经验`}
                                <span className="text-gray-600">（对局/任务可获得）</span>
                            </div>
                        </div>
                        {/* 一键领取 + 待打开卡包（角标显示数量） */}
                        <div className="shrink-0 flex items-center" style={{ gap: EVAL_UI.headBtnGap }}>
                            {totalClaimable > 0 && (
                                <button onClick={handleClaimAll}
                                    className="rounded-xl bg-yellow-600/30 border-2 border-yellow-400/60 text-yellow-200 font-black tracking-wider hover:bg-yellow-600/50 hover:scale-105 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)]"
                                    style={{
                                        fontSize: EVAL_UI.headBtnFontSize || undefined, lineHeight: lh(EVAL_UI.headBtnLine),
                                        paddingLeft: EVAL_UI.headBtnPadX, paddingRight: EVAL_UI.headBtnPadX,
                                        paddingTop: EVAL_UI.headBtnPadY, paddingBottom: EVAL_UI.headBtnPadY,
                                    }}>
                                    一键领取
                                </button>
                            )}
                            <div className="relative">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleOpenPack(); }}
                                    disabled={!pendingPacks || pendingPacks <= 0}
                                    className={`flex items-center rounded-xl font-black tracking-wider transition-all ${pendingPacks && pendingPacks > 0
                                            ? 'bg-gradient-to-r from-purple-600 to-purple-400 hover:scale-105 shadow-[0_0_25px_rgba(168,85,247,0.5)]'
                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                        }`}
                                    style={{
                                        gap: EVAL_UI.headBtnIconGap,
                                        fontSize: EVAL_UI.headBtnFontSize || undefined, lineHeight: lh(EVAL_UI.headBtnLine),
                                        paddingLeft: EVAL_UI.headBtnPadX, paddingRight: EVAL_UI.headBtnPadX,
                                        paddingTop: EVAL_UI.headBtnPadY, paddingBottom: EVAL_UI.headBtnPadY,
                                    }}
                                >
                                    <Package size={EVAL_UI.headBtnIcon} />
                                    打开卡包
                                </button>
                                {/* 卡包数量角标（橙色小圆） */}
                                {(pendingPacks ?? 0) > 0 && (
                                    <span className="absolute rounded-full bg-orange-500 border-2 border-slate-900 font-black text-white flex items-center justify-center"
                                        style={{
                                            top: -EVAL_UI.countBadgeInset, right: -EVAL_UI.countBadgeInset,
                                            minWidth: EVAL_UI.countBadgeSize, height: EVAL_UI.countBadgeSize, paddingLeft: 4, paddingRight: 4,
                                            fontSize: EVAL_UI.countBadgeFontSize, lineHeight: lh(EVAL_UI.countBadgeLine),
                                        }}>
                                        {pendingPacks}
                                    </span>
                                )}
                            </div>
                            {/* [2026-09-29 程拍板] 待打开匣子：卡包抽到的匣子在这里开启 */}
                            <div className="relative">
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setChestOpen(true); }}
                                    disabled={pendingChests.length <= 0}
                                    className={`flex items-center rounded-xl font-black tracking-wider transition-all ${pendingChests.length > 0
                                            ? 'bg-gradient-to-r from-amber-600 to-yellow-400 text-black hover:scale-105 shadow-[0_0_25px_rgba(250,204,21,0.45)]'
                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                        }`}
                                    style={{
                                        gap: EVAL_UI.headBtnIconGap,
                                        fontSize: EVAL_UI.headBtnFontSize || undefined, lineHeight: lh(EVAL_UI.headBtnLine),
                                        paddingLeft: EVAL_UI.headBtnPadX, paddingRight: EVAL_UI.headBtnPadX,
                                        paddingTop: EVAL_UI.headBtnPadY, paddingBottom: EVAL_UI.headBtnPadY,
                                    }}
                                >
                                    <Gem size={EVAL_UI.headBtnIcon} />
                                    打开匣子
                                </button>
                                {/* 匣子数量角标 */}
                                {pendingChests.length > 0 && (
                                    <span className="absolute rounded-full bg-amber-500 border-2 border-slate-900 font-black text-black flex items-center justify-center"
                                        style={{
                                            top: -EVAL_UI.countBadgeInset, right: -EVAL_UI.countBadgeInset,
                                            minWidth: EVAL_UI.countBadgeSize, height: EVAL_UI.countBadgeSize, paddingLeft: 4, paddingRight: 4,
                                            fontSize: EVAL_UI.countBadgeFontSize, lineHeight: lh(EVAL_UI.countBadgeLine),
                                        }}>
                                        {pendingChests.length}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                className="rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                                style={{ padding: EVAL_UI.closeBtnPad }}>
                                <X size={EVAL_UI.closeIcon} />
                            </button>
                        </div>
                    </div>

                    {/* 通行证等级轨道：1~30 每级奖励槽 */}
                    {/* 🔴 缺陷修复①（2026-10-25）：原滚动条被显式隐藏（`[&::-webkit-scrollbar]:hidden`），
                        手机字号放大后内容变长，用户根本不知道下面还有「匣券兑换」「已收集武装」。
                        ⇒ 手机端换成**可见细滚动条** + 底部内边距 48（PC 原样隐藏 + 20）。 */}
                    <div
                        className={`flex-1 overflow-y-auto ${EVAL_UI.scrollAreaClass}`}
                        style={{
                            paddingLeft: EVAL_UI.scrollPadX, paddingRight: EVAL_UI.scrollPadX,
                            paddingTop: EVAL_UI.scrollPadTop, paddingBottom: EVAL_UI.scrollPadBottom,
                        }}
                    >
                        {/* 轨道标题（装饰档：手机 24 / PC text-[10px]） */}
                        <div className="text-purple-300 font-bold tracking-widest uppercase flex items-center"
                            style={{ fontSize: EVAL_UI.trackTitleFontSize, lineHeight: lh(EVAL_UI.trackTitleLine), marginBottom: EVAL_UI.trackTitleMb, gap: EVAL_UI.titleIconGap }}>
                            <Sparkles size={EVAL_UI.trackTitleIcon} /> 通行证奖励轨道（达到等级后点击领取）
                        </div>
                        {/* 🔴 列数走内联 gridTemplateColumns（原 grid-cols-6）——手机 4 列：单格 376px 才装得下 32px 中文 */}
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${EVAL_UI.trackCols}, minmax(0, 1fr))`, gap: EVAL_UI.trackGap }}>
                            {Array.from({ length: ANALYST_MAX_LEVEL }, (_, i) => i + 1).map(lv => {
                                const reached = lv <= level;
                                const meta = rewardMeta(lv);
                                // [2026-10-04] 同样走唯一出口（≤30 与旧查表等价，但杜绝"两处口径"）
                                const lvReward = getAnalystReward(lv);
                                const isArm = lvReward?.armamentId;
                                // [2026-09-04] 该级若是强化解锁 → 取 buff（品质图标 + 悬停大图同源）
                                const enhDef = lvReward?.unlockEnhancement
                                    ? getBuffById(lvReward.unlockEnhancement)
                                    : undefined;
                                return (
                                    <div
                                        key={lv}
                                        /* [2026-09-10 莉莉子 修复] 只有「无自定义大卡」的普通奖励格才留原生提示；
                                           武装/强化格已挂 bindArmamentGaze / bindBuffHover → 摘掉 title 防双弹 */
                                        title={isArm || enhDef ? undefined : meta.name}
                                        {...(isArm ? bindArmamentGaze(isArm)
                                            : enhDef ? bindBuffHover(enhDef) : {})} // [2026-09-04] 武装→武装大图；强化→强化大图
                                        className={`relative rounded-xl border flex flex-col items-center transition-all ${
                                            reached
                                                ? isArm
                                                    ? 'bg-purple-900/40 border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                                                    : 'bg-slate-800/60 border-white/15'
                                                : 'bg-slate-900/40 border-white/5 opacity-40 grayscale'
                                        }`}
                                        // 🔴 缺陷修复②：三种格（可领取 / ✓已领 / 未达）内部高度原本不同 ⇒ 行会跳。
                                        //    minHeight 统一高度（PC = 0 ⇒ `|| undefined` 不介入，PC 原样）。
                                        style={{
                                            minHeight: EVAL_UI.cellMinH || undefined,
                                            paddingTop: EVAL_UI.cellPadY, paddingBottom: EVAL_UI.cellPadY,
                                            paddingLeft: EVAL_UI.cellPadX, paddingRight: EVAL_UI.cellPadX,
                                        }}
                                    >
                                        {/* 等级数字（核心档：手机 28 / PC text-[11px]） */}
                                        <span className={`font-black italic ${reached ? (isArm ? 'text-purple-300' : 'text-cyan-300') : 'text-gray-600'}`}
                                            style={{ fontSize: EVAL_UI.cellLvFontSize, lineHeight: lh(EVAL_UI.cellLvLine) }}>
                                            Lv.{lv}
                                        </span>
                                        {/* 奖励图标盒（手机 56 / PC 32） */}
                                        <div className="flex items-center justify-center"
                                            style={{ width: EVAL_UI.cellIconBox, height: EVAL_UI.cellIconBox, marginTop: EVAL_UI.cellIconMy, marginBottom: EVAL_UI.cellIconMy }}>
                                            {meta.icon}
                                        </div>
                                        {/* 奖励名（截断；核心档：手机 32 / PC text-[9px]） */}
                                        <span className="font-bold text-center w-full truncate text-gray-300"
                                            style={{ fontSize: EVAL_UI.cellNameFontSize, lineHeight: lh(EVAL_UI.cellNameLine) }}>
                                            {meta.label || '—'}
                                        </span>
                                        {/* [2026-08-29] 达到未领 → 领取按钮；已领 → ✓ */}
                                        {reached && getAnalystReward(lv) && !claimedSet.has(lv) && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleClaimLevel(lv); }}
                                                className="rounded-md bg-yellow-600/40 border border-yellow-400/50 text-yellow-200 font-black hover:bg-yellow-600/70 transition-all"
                                                style={{
                                                    marginTop: EVAL_UI.cellClaimMt,
                                                    paddingLeft: EVAL_UI.cellClaimPadX, paddingRight: EVAL_UI.cellClaimPadX,
                                                    paddingTop: EVAL_UI.cellClaimPadY, paddingBottom: EVAL_UI.cellClaimPadY,
                                                    fontSize: EVAL_UI.cellClaimFontSize, lineHeight: lh(EVAL_UI.cellClaimLine),
                                                }}
                                            >
                                                领取
                                            </button>
                                        )}
                                        {/* [2026-10-04] 走唯一出口（原先直接查表 —— 31+ 会露馅） */}
                                        {reached && getAnalystReward(lv) && claimedSet.has(lv) && (
                                            <span className="font-black text-emerald-400"
                                                style={{ marginTop: EVAL_UI.cellClaimMt, fontSize: EVAL_UI.cellClaimedFontSize, lineHeight: lh(EVAL_UI.cellClaimedLine) }}>
                                                ✓ 已领
                                            </span>
                                        )}
                                        {/* 未达锁定角标 */}
                                        {!reached && <Lock size={EVAL_UI.cellLockIcon} className="absolute text-gray-600" style={{ top: EVAL_UI.cellLockInset, right: EVAL_UI.cellLockInset }} />}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ==========================================
                            [2026-10-04 程拍板 ①③④] **30 级之后 · 无限嘉勉**
                              · 每级经验 = 与 29→30 一致（ANALYST_POST_CAP_EXP）
                              · **每 5 级一个里程碑，只有里程碑给 1 个卡包**
                              · 领取**不允许跳级** ⇒ 只推进水位到"当前等级"（结构上天然不跳级）
                            为什么单独一条而不是塞进上面 30 格轨道：
                              31+ 是**无限等级**，网格渲染不出来；且奖励规则不同（只认里程碑）。
                            ========================================== */}
                        {level > ANALYST_FIXED_REWARD_MAX && (
                            <div className="rounded-xl border border-purple-400/30 bg-purple-950/30"
                                style={{ marginTop: EVAL_UI.postCapMt, paddingLeft: EVAL_UI.postCapPadX, paddingRight: EVAL_UI.postCapPadX, paddingTop: EVAL_UI.postCapPadY, paddingBottom: EVAL_UI.postCapPadY }}>
                                <div className="flex items-center justify-between" style={{ gap: EVAL_UI.blockHeadGap }}>
                                    <div className="min-w-0">
                                        {/* 区块标题（核心档：手机 32 / PC text-[11px]） */}
                                        <div className="font-black tracking-widest text-purple-200 flex items-center"
                                            style={{ fontSize: EVAL_UI.postCapTitleFontSize, lineHeight: lh(EVAL_UI.postCapTitleLine), gap: EVAL_UI.titleIconGap }}>
                                            <Sparkles size={EVAL_UI.postCapTitleIcon} /> 30 级之后 · 无限嘉勉
                                        </div>
                                        {/* 等级/里程碑读数（核心档） */}
                                        <div className="text-gray-400"
                                            style={{ fontSize: EVAL_UI.postCapBodyFontSize, lineHeight: lh(EVAL_UI.postCapBodyLine), marginTop: EVAL_UI.postCapBodyMt }}>
                                            当前 <span className="text-white font-black">Lv {level}</span>
                                            {' · '}下一个里程碑 <span className="text-purple-200 font-black">Lv {nextMilestone}</span>
                                            （还差 <span className="text-white font-black">{Math.max(0, nextMilestone - level)}</span> 级）
                                            {' · '}已领至 <span className="text-white font-black">Lv {claimedUpTo}</span>
                                        </div>
                                        {/* 说明文案（装饰档） */}
                                        <div className="text-gray-500"
                                            style={{ fontSize: EVAL_UI.postCapHintFontSize, lineHeight: lh(EVAL_UI.postCapHintLine), marginTop: EVAL_UI.postCapBodyMt }}>
                                            每 5 级一个里程碑，里程碑给 1 个卡包 · 每级需 {ANALYST_POST_CAP_EXP} 分析员经验
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleClaimAll}
                                        disabled={!postCapPending}
                                        className={`shrink-0 rounded-xl font-black tracking-wider transition-all ${postCapPending
                                                ? 'bg-yellow-600/30 border-2 border-yellow-400/60 text-yellow-200 hover:bg-yellow-600/50 hover:scale-105'
                                                : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
                                            }`}
                                        style={{
                                            fontSize: EVAL_UI.postCapBtnFontSize || undefined, lineHeight: lh(EVAL_UI.postCapBtnLine),
                                            paddingLeft: EVAL_UI.postCapBtnPadX, paddingRight: EVAL_UI.postCapBtnPadX,
                                            paddingTop: EVAL_UI.postCapBtnPadY, paddingBottom: EVAL_UI.postCapBtnPadY,
                                        }}>
                                        {postCapPending ? '领取嘉勉' : '已领完'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            [2026-10-20 程拍板 · 匣券] 重复武装 → 匣券 → 兑换更高档武装匣
                              · 抽到"该档已全部拥有"时自动发券（六档含红，通用可换任意档）
                              · 每档**首次兑换**有优惠 = min(半价, 80)：低档减半、红档只减 80
                                （红档一刀切减半会让首个红匣跌破"不贬值"线，见 技术手册/05-方案汇总 §12）
                              · 兑换出来的是**匣子**（进 pendingChests），玩家自己去开 —— 不是直接发武装
                            ══════════════════════════════════════════════════════════ */}
                        <div className="rounded-xl border border-cyan-400/25 bg-cyan-950/20"
                            style={{ marginTop: EVAL_UI.couponMt, paddingLeft: EVAL_UI.couponPadX, paddingRight: EVAL_UI.couponPadX, paddingTop: EVAL_UI.couponPadY, paddingBottom: EVAL_UI.couponPadY }}>
                            <div className="flex items-center justify-between" style={{ gap: EVAL_UI.blockHeadGap }}>
                                {/* 区块标题（装饰档：手机 24 / PC text-[10px]） */}
                                <div className="text-cyan-300 font-bold tracking-widest uppercase flex items-center"
                                    style={{ fontSize: EVAL_UI.couponTitleFontSize, lineHeight: lh(EVAL_UI.couponTitleLine), gap: EVAL_UI.titleIconGap }}>
                                    <Ticket size={EVAL_UI.couponTitleIcon} /> 匣券兑换
                                </div>
                                {/* [2026-10-20 莉莉子 🎨] 券小图 + 持有数（22px：16px 在 512 源图下缩放糊边，22px 才看得清券面纹样） */}
                                <div className="flex items-center text-gray-400" style={{ gap: EVAL_UI.couponCountGap }}>
                                    <img
                                        src={VOUCHER_ART}
                                        alt="武装匣兑换券"
                                        title="武装匣兑换券"
                                        className="object-contain shrink-0"
                                        style={{ width: EVAL_UI.voucherArtSize, height: EVAL_UI.voucherArtSize }}
                                        draggable={false}
                                        onError={hideBrokenChestArt}
                                    />
                                    {/* 「持有 X 张」文字 = 装饰档；券数量数字 = 次级档（手机 36 / PC text-sm 14） */}
                                    <span style={{ fontSize: EVAL_UI.couponCountFontSize, lineHeight: lh(EVAL_UI.couponCountLine) }}>
                                        持有 <span className="text-cyan-200 font-black"
                                            style={{ fontSize: EVAL_UI.couponBalanceFontSize, lineHeight: lh(EVAL_UI.couponBalanceLine) }}>{voucherBalance}</span> 张
                                    </span>
                                </div>
                            </div>
                            <div className="text-gray-500"
                                style={{ fontSize: EVAL_UI.couponHintFontSize, lineHeight: lh(EVAL_UI.couponHintLine), marginTop: EVAL_UI.postCapBodyMt }}>
                                抽到已拥有的武装会变成匣券 · 攒够可换任意品质武装匣 · 每档首次兑换更便宜
                            </div>
                            <div className="grid" style={{ marginTop: EVAL_UI.couponGridMt, gridTemplateColumns: `repeat(${EVAL_UI.couponCols}, minmax(0, 1fr))`, gap: EVAL_UI.couponGap }}>
                                {EXCHANGEABLE_RARITIES.map(r => {
                                    const isFirst = !voucherUsed.includes(r);
                                    const cost = voucherExchangeCostOf(r, isFirst) ?? 0;
                                    const fullCost = voucherChestCostOf(r) ?? 0;
                                    const afford = voucherBalance >= cost;
                                    const color = RARITY_META[r]?.color ?? '#e5e7eb';
                                    return (
                                        <button
                                            key={r}
                                            disabled={!afford}
                                            onClick={() => handleExchangeVoucher(r)}
                                            title={isFirst ? `首次兑换优惠：原价 ${fullCost}，本次只需 ${cost}` : `原价 ${fullCost} 匣券`}
                                            className={`flex flex-col items-center rounded-lg border transition-all ${afford
                                                ? 'bg-white/5 hover:bg-white/10 hover:scale-[1.03] cursor-pointer'
                                                : 'bg-black/20 opacity-45 cursor-not-allowed'}`}
                                            style={{
                                                borderColor: afford ? `${color}66` : '#ffffff14',
                                                gap: EVAL_UI.couponCardGap,
                                                paddingTop: EVAL_UI.couponCardPadY, paddingBottom: EVAL_UI.couponCardPadY,
                                            }}
                                        >
                                            {/* [2026-10-20 莉莉子 🎨] 每张兑换卡加对应品质的武装匣插画（手机 64 / PC 40，整图显示不裁切） */}
                                            <img
                                                src={getChestArt('armament', r)}
                                                alt={getChestArtName('armament', r)}
                                                title={getChestArtName('armament', r)}
                                                className="object-contain shrink-0"
                                                // [2026-10-20 莉莉子 🎨] 品质色外发光（色取 RARITY_META[r].color）
                                                style={{ width: EVAL_UI.couponArtSize, height: EVAL_UI.couponArtSize, filter: `drop-shadow(0 0 6px ${color}88)` }}
                                                draggable={false}
                                                onError={hideBrokenChestArt}
                                            />
                                            {/* 品质名 / 价格（核心档：手机 32 / PC text-[11px]） */}
                                            <span className="font-black"
                                                style={{ color, fontSize: EVAL_UI.couponRarityFontSize, lineHeight: lh(EVAL_UI.couponRarityLine) }}>{VOUCHER_RARITY_LABEL[r]}匣</span>
                                            <span className="font-mono text-white"
                                                style={{ fontSize: EVAL_UI.couponCostFontSize, lineHeight: lh(EVAL_UI.couponCostLine) }}>
                                                {isFirst
                                                    ? <><span className="text-gray-500 line-through mr-1">{fullCost}</span>{cost}</>
                                                    : cost}
                                            </span>
                                            {/* 「首次优惠 / 匣券」标签（装饰档：手机 24 / PC text-[9px]） */}
                                            <span className={`font-bold ${isFirst ? 'text-cyan-300' : 'text-gray-600'}`}
                                                style={{ fontSize: EVAL_UI.couponTagFontSize, lineHeight: lh(EVAL_UI.couponTagLine) }}>
                                                {isFirst ? '首次优惠' : '匣券'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 已收集武装陈列 */}
                        {/* 区块标题（装饰档：手机 24 / PC text-[10px]） */}
                        <div className="text-purple-300 font-bold tracking-widest uppercase flex items-center"
                            style={{ marginTop: EVAL_UI.ownedTitleMt, fontSize: EVAL_UI.ownedTitleFontSize, lineHeight: lh(EVAL_UI.ownedTitleLine), gap: EVAL_UI.titleIconGap }}>
                            <Gem size={EVAL_UI.ownedTitleIcon} /> 已收集武装（{ownedArmaments?.length ?? 0}）
                        </div>
                        <div className="flex flex-wrap" style={{ marginTop: EVAL_UI.ownedListMt, gap: EVAL_UI.ownedWrapGap }}>
                            {(ownedArmaments ?? []).length === 0 && (
                                <span className="text-gray-500"
                                    style={{ fontSize: EVAL_UI.ownedEmptyFontSize, lineHeight: lh(EVAL_UI.ownedEmptyLine) }}>通过通行证等级奖励 / 卡包收集稀有武装</span>
                            )}
                            {(ownedArmaments ?? []).map(id => {
                                const def = getEquipmentById(id);
                                if (!def) return null;
                                return (
                                    <div key={id} className="flex items-center rounded-lg bg-white/5 border border-purple-400/30"
                                        style={{ gap: EVAL_UI.ownedCardGap, paddingLeft: EVAL_UI.ownedCardPadX, paddingRight: EVAL_UI.ownedCardPadX, paddingTop: EVAL_UI.ownedCardPadY, paddingBottom: EVAL_UI.ownedCardPadY }}
                                        {...bindArmamentGaze(id)}>
                                        <RarityHex icon={def.icon} rarity={def.rarity} title={def.name} size={EVAL_UI.ownedHexSize} />
                                        {/* 武装名（核心档：手机 32 / PC text-xs） */}
                                        <span className="text-purple-200 font-bold"
                                            style={{ fontSize: EVAL_UI.ownedNameFontSize, lineHeight: lh(EVAL_UI.ownedNameLine) }}>
                                            {def.name}
                                            {(armStockMap[id] ?? 0) > 1 && <span className="ml-1 text-purple-300/70 font-mono">×{armStockMap[id]}</span>}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>

                {/* 卡包开出提示 */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/85 border border-purple-400/40 text-purple-200 font-black tracking-widest shadow-[0_0_25px_rgba(168,85,247,0.4)]"
                            style={{
                                bottom: EVAL_UI.toastBottom,
                                paddingLeft: EVAL_UI.toastPadX, paddingRight: EVAL_UI.toastPadX,
                                paddingTop: EVAL_UI.toastPadY, paddingBottom: EVAL_UI.toastPadY,
                                fontSize: EVAL_UI.toastFontSize || undefined, lineHeight: lh(EVAL_UI.toastLine),
                            }}
                        >
                            ✨ {toast}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* [2026-09-04] 强化解锁悬停大图浮层（portal body，品质强化卡面） */}
            <EnhancementPreview hover={hoverBuff} />

            {/* [2026-08-29] 卡包开箱演出（卡包 → 抽到一个奖励匣） */}
            <PackOpenModal
                isOpen={packOpen}
                pendingPacks={pendingPacks ?? 0}
                onOpenPack={(anchor?: ChestKind) => userSystem?.openPack?.(anchor) ?? null} // [2026-11-07] 透传 anchor（不传＝花 1 随机 / 传＝花 2 定向）
                onClose={() => setPackOpen(false)}
                onOpenChest={() => setChestOpen(true)}
                armamentStock={armStockMap} // [2026-10-21 莉莉子] 档案卡浮窗按库存判"可能产出 / 已集齐转券"
            />

            {/* [2026-09-29 程拍板] 奖励匣开箱（匣子 → 武装 / 神格碎片） */}
            <ChestOpenModal
                isOpen={chestOpen}
                chests={pendingChests}
                armamentStock={armStockMap} // [2026-10-04 ②] 预览按库存标注（与实际抽取同源）
                onOpenChest={(i) => userSystem?.openChest?.(i) ?? null}
                // [2026-10-04 程拍板] ⚡ 一键全开 —— 走批量 API（**不能**靠循环调 openChest：那会重复开同一个匣子）
                onOpenAllChests={() => userSystem?.openAllChests?.() ?? []}
                onShardDrop={(res: ChestOpenResult) => {
                    // 碎片入账（本组件同时持有 divinity，依赖方向由 App 层注入保证）
                    // [2026-10-02 莉莉子 BUG修复 #18] 判据由 `res?.wallet` 改为 `kind === 'shard'`
                    //   —— 详见 App.tsx 同处的说明（用无关字段当条件 = 数据丢失隐患）。
                    if (res?.kind !== 'shard') return;
                    const details = res.shardDetail ?? [];
                    const totalOverflow = details.reduce((s, d) => s + (d?.overflow > 0 ? d.overflow : 0), 0);
                    divinity?.applyShardDrop?.({ wallet: res.wallet, details, totalOverflow });
                }}
                onClose={() => setChestOpen(false)}
            />
        </AnimatePresence>
    );
};
