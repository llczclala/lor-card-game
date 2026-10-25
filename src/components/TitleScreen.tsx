import React, { useState } from 'react';
import { Sword, UserCircle, RefreshCw } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { UI_IMAGES } from '../data/imageData';
import { motion, AnimatePresence } from 'framer-motion';
import { AccountSelectionModal } from './AccountSelectionModal';
import type { useUserSystem } from '../hooks/useUserSystem';
import chengAvatar from '../image/icon/CQWRSZDSA432.webp'; // [哨兵] 程的头像
import { pickTuning } from '../platform/tuning';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 标题页/登录页 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 点掉「点击进入游戏」之后、带「开始游戏」按钮的那一屏。
// 管：标题 logo /「开始游戏」/ PRESS START / 头像+B站 / 左上账号按钮 / 屏与块的留白。
// 改完存盘即生效（HMR 直接刷新，电脑上就能看到，不用出包）。
//
// 🖥️📱 【双平台】本屏有两套值，同一份代码按运行平台自动二选一：
//   · `TITLE_UI_MOBILE` = 手机端（安卓壳）—— **程在雷电里调的就是这份**
//   · `TITLE_UI_PC_DIFF` = PC 端差异项 —— 只列**与手机不同**的项，其余继承手机值
//   判定收在 `src/platform/tuning.ts`（合 `platform/index.ts` 铁律：组件里不出现 isNative）。
//   ⇒ 电脑浏览器开 dev server = PC 版，雷电 = 手机版，天然可对比，不用切换开关。
// 用法：先调【主旋钮】scale 把整块大小定下来，再动下面的细节值。
// ⚠️ scale 的支点在【底部】——放大时内容往上长；若顶部被裁，把组件里的
//    transformOrigin 改成 'center center' 变成上下平分。
// ══════════════════════════════════════════════════════════════════════
// 📱 手机端值（= 原 `TITLE_UI`，值一个没动；程继续在这里调）
const TITLE_UI_MOBILE = {
    /** 【主旋钮】核心内容块整体缩放（1 = 原样）。左上账号按钮不在这个块里。 */
    scale: 1,

    // ══ 屏与块 ════════════════════════════════════════════════════════
    /** 整个屏幕的底部留白 px（原 pb-12，根容器） */
    screenPadBottom: 48,
    /** 核心内容块的底部留白 px（原 pb-20）—— 想让标题整体上移就加大这个 */
    blockPadBottom: 80,
    /** 背景暗纹浓度 0~1（原 opacity-20） */
    bgTextureOpacity: 0.2,

    // ══ ① 标题 logo ══════════════════════════════════════════════════
    logoWidth: 675,     // 宽度 px（原 w-[450px]）
    logoGap: 16,        // logo ↓「开始游戏」的间距 px（原 mb-8）

    // ══ ② 「开始游戏」主按钮 ═════════════════════════════════════════
    startFontSize: 30,  // 字号 px（原 text-xl）
    startIconSize: 36,  // 剑图标尺寸 px（lucide 默认 24）
    startPadX: 72,      // 左右内边距 px（原 px-12）
    startPadY: 24,      // 上下内边距 px（原 py-4）
    startIconGap: 24,   // 图标与文字的间距 px（原 gap-4）


    // ══ ④ 底部行（头像 + B站入口）════════════════════════════════════
    footerGap: 15,      // 提示语 ↓ 底部行的间距 px（原 mt-10）
    avatarSize: 84,     // 头像尺寸 px（原 w-14 / h-14）
    footerItemGap: 30,  // 头像与 B站按钮的间距 px（原 gap-5）
    biliFontSize: 21,   // B站文字字号 px（原 text-sm）
    biliIconSize: 42,   // B站小电视图标 px（原 w-7 / h-7）
    biliPadX: 24,       // B站按钮左右内边距 px（原 px-4）
    biliPadY: 12,        // B站按钮上下内边距 px（原 py-2）
    biliIconGap: 18,    // B站图标与文字的间距 px（原 gap-3）

    // ══ ⑤ 左上角账号按钮 ═════════════════════════════════════════════
    accountFontSize: 18,   // 字号 px（原 text-xs）
    accountIconSize: 24,   // 账号图标尺寸 px（原 UserCircle size=16）
    accountPadX: 24,       // 原 px-4
    accountPadY: 12,        // 原 py-2
    accountIconGap: 12,     // 图标与文字的间距 px（原 gap-2）
    accountTop: 24,        // 距屏幕顶部 px（原 top-4）
    accountLeft: 24,       // 距屏幕左侧 px（原 left-4）

    // ══ ⑥ 临时反馈（切号遮罩 / 欢迎提示，正常情况不用动）══════════════
    switchingIconSize: 48, // 切号转圈图标 px（原 size=48）
    switchingFontSize: 14, // 「SWITCHING ACCOUNT...」字号 px（原 text-sm）
    toastFontSize: 16,     // 欢迎提示字号 px（原未设，走继承 16）
    toastPadX: 32,         // 原 px-8
    toastPadY: 12,         // 原 py-3
    toastGap: 12,          // 原 gap-3
    toastDotSize: 8,       // 绿点尺寸 px（原 w-2 h-2）
    toastY: 20,            // 出现后距屏幕顶部的落点 px（原 animate y:20）
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`git show e6963262:src/components/TitleScreen.tsx`（2026-10-13，
//       = 本周手机端适配开始前的版本），**逐项由那一版的 Tailwind 类反推**，
//       没有采信注释（注释可能过时 —— 先例见 `MAP_BTN` / `DIORAMA_SIZE`）。
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ══════════════════════════════════════════════════════════════════════
const TITLE_UI_PC_DIFF = {
    // ══ ① 标题 logo ══════════════════════════════════════════════════
    logoWidth: 450,     // 原 w-[450px]
    logoGap: 32,        // 原 mb-8（手机端把它压到了 16）

    // ══ ② 「开始游戏」主按钮 ═════════════════════════════════════════
    startFontSize: 20,  // 原 text-xl
    startIconSize: 24,  // 原 <Sword /> 未传 size ⇒ lucide 默认 24
    startPadX: 48,      // 原 px-12
    startPadY: 16,      // 原 py-4
    startIconGap: 16,   // 原 gap-4

    // ══ ④ 底部行（头像 + B站入口）════════════════════════════════════
    footerGap: 40,      // 原 mt-10（手机端把它压到了 15）
    avatarSize: 56,     // 原 w-14 / h-14
    footerItemGap: 20,  // 原 gap-5
    biliFontSize: 14,   // 原 text-sm
    biliIconSize: 28,   // 原 w-7 / h-7
    biliPadX: 16,       // 原 px-4
    biliPadY: 8,        // 原 py-2
    biliIconGap: 12,    // 原 gap-3

    // ══ ⑤ 左上角账号按钮 ═════════════════════════════════════════════
    accountFontSize: 12,   // 原 text-xs
    accountIconSize: 16,   // 原 <UserCircle size={16} />
    accountPadX: 16,       // 原 px-4
    accountPadY: 8,        // 原 py-2
    accountIconGap: 8,     // 原 gap-2
    accountTop: 16,        // 原 top-4
    accountLeft: 16,       // 原 left-4
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const TITLE_UI_PC = { ...TITLE_UI_MOBILE, ...TITLE_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const TITLE_UI = pickTuning(TITLE_UI_PC, TITLE_UI_MOBILE);

interface User {
    uid: string;
    displayName: string;
    // 可补充其他属性（如 avatar、createdAt 等，根据实际业务）
}

interface TitleScreenProps {
    onTitleStartClick: () => void;
    userSystem: ReturnType<typeof useUserSystem>;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
    onTitleStartClick,
    userSystem
}) => {
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false); // 控制全屏遮罩
    const [welcomeToast, setWelcomeToast] = useState<string | null>(null); // 欢迎文本

    // 处理切换逻辑
    const handleSwitch = async (uid: string) => {
        setShowAccountModal(false);
        setIsSwitching(true); // 显示遮罩

        // 模拟网络请求/加载过程 (1.5秒)
        setTimeout(() => {
            userSystem.switchUser(uid);
            setIsSwitching(false); // 关闭遮罩

            // 显示欢迎 Toast
            // 注意：userSystem.switchUser 是同步更新 state，
            // 但 profile 更新需要一点时间，这里我们直接从 list 里找名字显示
            const targetUser = userSystem.userList.find((u: User) => u.uid === uid);
            const name = targetUser ? targetUser.displayName : 'Analyst';
            setWelcomeToast(`欢迎回来, ${name}`);

            // 3秒后关闭 Toast
            setTimeout(() => setWelcomeToast(null), 3000);
        }, 1500);
    };

    return (
        <div
            className="w-full h-full bg-transparent text-white flex flex-col items-center justify-end relative overflow-hidden font-sans select-none z-10"
            style={{ paddingBottom: TITLE_UI.screenPadBottom }}
        >

            <div
                className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] pointer-events-none animate-pulse-slow"
                style={{ opacity: TITLE_UI.bgTextureOpacity }}
            ></div>

                {/* 尺寸来自顶部 🎛️ TITLE_UI.account* */}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setShowAccountModal(true); }}
                    className="absolute z-[50] flex items-center bg-black/40 hover:bg-white/10 rounded-full border border-white/10 hover:border-white/30 transition-all font-mono text-gray-400 hover:text-white group"
                    style={{
                        top: TITLE_UI.accountTop,
                        left: TITLE_UI.accountLeft,
                        gap: TITLE_UI.accountIconGap,
                        fontSize: TITLE_UI.accountFontSize,
                        padding: `${TITLE_UI.accountPadY}px ${TITLE_UI.accountPadX}px`,
                    }}
                >
                    <UserCircle size={TITLE_UI.accountIconSize} className="text-blue-400 group-hover:text-white transition-colors" />
                    {userSystem.profile?.displayName || 'GUEST ACCOUNT'}
                </button>

            {/* --- 弹窗组件 --- */}
            {showAccountModal && (
                <AccountSelectionModal
                    currentUserUid={userSystem.userId}
                    userList={userSystem.userList}
                    onConfirmSwitch={handleSwitch}
                    onDeleteUser={userSystem.deleteUser}
                    onCreateUser={userSystem.createNewUser}
                    onClose={() => setShowAccountModal(false)}
                    onRefreshList={userSystem.refreshUserList}
                />
            )}

            {/* --- 切换账号时的全屏遮罩 (Loading) --- */}
            <AnimatePresence>
                {isSwitching && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center"
                        style={{ gap: 16 }}
                    >
                        <RefreshCw size={TITLE_UI.switchingIconSize} className="text-blue-500 animate-spin" />
                        <span
                            className="text-blue-200 font-mono tracking-widest animate-pulse"
                            style={{ fontSize: TITLE_UI.switchingFontSize }}
                        >
                            SWITCHING ACCOUNT...
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- 欢迎回来 Toast --- */}
            <AnimatePresence>
                {welcomeToast && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }}
                        animate={{ y: TITLE_UI.toastY, opacity: 1 }}
                        exit={{ y: -100, opacity: 0 }}
                        className="fixed top-0 left-1/2 -translate-x-1/2 z-[1500] bg-white text-black font-bold rounded-full shadow-[0_10px_30px_rgba(255,255,255,0.3)] flex items-center border-2 border-blue-500"
                        style={{
                            fontSize: TITLE_UI.toastFontSize,
                            gap: TITLE_UI.toastGap,
                            padding: `${TITLE_UI.toastPadY}px ${TITLE_UI.toastPadX}px`,
                        }}
                    >
                        <div
                            className="rounded-full bg-green-500 animate-pulse"
                            style={{ width: TITLE_UI.toastDotSize, height: TITLE_UI.toastDotSize }}
                        ></div>
                        {welcomeToast}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- 标题页核心内容（尺寸全部来自顶部 🎛️ TITLE_UI）--- */}
            <div
                className="flex flex-col items-center animate-fade-in-up z-20"
                style={{
                    paddingBottom: TITLE_UI.blockPadBottom,
                    transform: `scale(${TITLE_UI.scale})`,
                    transformOrigin: 'center bottom',
                }}
            >
                <img
                    src={UI_IMAGES.titleLogo}
                    className="drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    style={{ width: TITLE_UI.logoWidth, marginBottom: TITLE_UI.logoGap }}
                    alt="尘白禁区 Rivals"
                />

                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.GAME_START);
                        if (onTitleStartClick) onTitleStartClick();
                    }}
                    className="group relative bg-transparent overflow-hidden rounded-full transition-all hover:scale-105"
                    style={{ padding: `${TITLE_UI.startPadY}px ${TITLE_UI.startPadX}px` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
                    <span
                        className="relative z-10 font-black tracking-[0.3em] flex items-center"
                        style={{ fontSize: TITLE_UI.startFontSize, gap: TITLE_UI.startIconGap }}
                    >
                        <Sword size={TITLE_UI.startIconSize} className="fill-white" /> 开始游戏
                    </span>
                </button>

                {/* [哨兵] 程的头像 & B站链接 */}
                <div
                    className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity duration-300"
                    style={{ marginTop: TITLE_UI.footerGap, gap: TITLE_UI.footerItemGap }}
                >
                    {/* 头像 */}
                    <img
                        src={chengAvatar}
                        className="rounded-full object-cover border border-white/20 ring-2 ring-white/10"
                        style={{ width: TITLE_UI.avatarSize, height: TITLE_UI.avatarSize }}
                        alt="大话丶EZ"
                        title="独立开发者：大话丶EZ"
                    />
                    {/* B站小电视按钮 */}
                    <a
                        href="https://space.bilibili.com/45083978?spm_id_from=333.1007.0.0"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center rounded-full bg-white/5 hover:bg-pink-600/20 border border-white/10 hover:border-pink-400/40 transition-all group"
                        style={{
                            gap: TITLE_UI.biliIconGap,
                            padding: `${TITLE_UI.biliPadY}px ${TITLE_UI.biliPadX}px`,
                        }}
                        title="B站主页：大话丶EZ"
                    >
                        {/* B站小电视 SVG */}
                        <svg
                            viewBox="0 0 24 24"
                            className="fill-current text-white/60 group-hover:text-pink-400 transition-colors"
                            style={{ width: TITLE_UI.biliIconSize, height: TITLE_UI.biliIconSize }}
                        >
                            <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.559 3.76v7.36c-.035 1.51-.555 2.765-1.559 3.761-1.004.995-2.263 1.519-3.773 1.574H5.333c-1.51-.055-2.769-.579-3.773-1.574C.556 20.112.036 18.857 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.263-1.52 3.773-1.574h.854L4.134 1.91a.428.428 0 01.058-.488.468.468 0 01.354-.168.467.467 0 01.373.158L7.2 4.653h9.6l2.281-3.241a.467.467 0 01.373-.158.468.468 0 01.354.168.428.428 0 01.058.488l-2.053 2.743zm-2.453 6.507c.211 0 .395-.075.554-.224a.742.742 0 00.229-.546.742.742 0 00-.229-.547.765.765 0 00-.554-.223c-.211 0-.394.074-.553.223a.742.742 0 00-.23.547c0 .22.077.404.23.546.159.15.342.224.553.224zm-6.72 0c.212 0 .396-.075.555-.224a.742.742 0 00.229-.546.742.742 0 00-.229-.547.765.765 0 00-.554-.223c-.212 0-.395.074-.554.223a.742.742 0 00-.23.547c0 .22.077.404.23.546.159.15.343.224.554.224zm5.253 1.973c-.264-.232-.594-.348-.99-.348-.396 0-.726.116-.99.348-.264.232-.396.537-.396.914 0 .377.132.682.396.914.264.232.594.348.99.348.396 0 .726-.116.99-.348.264-.232.396-.537.396-.914 0-.377-.132-.682-.396-.914zM12 17.733c1.912 0 3.507-.442 4.787-1.326a4.6 4.6 0 001.746-1.86.467.467 0 00-.186-.605.475.475 0 00-.6.177 3.722 3.722 0 01-1.4 1.498c-1.092.694-2.395 1.041-3.907 1.041-1.512 0-2.815-.347-3.907-1.041a3.722 3.722 0 01-1.4-1.498.475.475 0 00-.6-.177.467.467 0 00-.186.605 4.6 4.6 0 001.746 1.86c1.28.884 2.875 1.326 4.787 1.326z"/>
                        </svg>
                        <span
                            className="text-white/40 group-hover:text-pink-300 transition-colors tracking-wider font-medium"
                            style={{ fontSize: TITLE_UI.biliFontSize }}
                        >
                            大话丶EZ
                        </span>
                    </a>
                </div>
            </div>
        </div>
    );
};
