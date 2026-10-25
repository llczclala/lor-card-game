// ==========================================
// 卡组码 · 导入 / 导出 / 缺卡提示 弹窗
// [2026-10-24 莉莉子 · 卡组码]
//
// ── 为什么三件事放一个组件 ───────────────────────────────────────
//   导入的完整流程是「粘贴 → 解析 → 入库 → 如果有缺口就提示」，
//   如果拆成两个弹窗，玩家会看到"导入窗关掉、又弹出一个缺卡窗"的闪跳。
//   收在一个组件里用 `step` 切换，视觉上是一件事的连续两步。
//
// ── 缺卡是**每次渲染实时算**的，不缓存 ────────────────────────────
//   补卡成功后 `ownedCards` 从 props 更新 ⇒ 自动重算 ⇒ 缺口消失、卡组恢复可玩。
//   这也是为什么绝不能把缺口写进卡组对象（见 `deckCodeImport.ts` 顶部注释）。
//
// ── 复制为什么要四级降级 ─────────────────────────────────────────
//   正式包跑在 Electron 的 `file://` 上（`electron-main.cjs:36`），
//   `navigator.clipboard` 需要安全上下文、不一定可用（项目里
//   `AccountSelectionModal.tsx:49` 已经为此踩过一次）。
//   所以：Electron 原生剪贴板 → Web Clipboard → execCommand → **兜底全选让玩家自己按 Ctrl+C**。
//   最后一层保证：任何环境下玩家都拿得到码。
// ==========================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Copy, ShoppingCart, Sparkles, Pencil, AlertTriangle, Check } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { CARD_DB } from '../data/cards';
import { Card } from './Card';
import type { CardData, SavedDeck } from '../types';
import {
    encodeDeckCode,
    decodeDeckCode,
    validateDeckShape,
    DECK_CODE_ERROR_TEXT,
    deckTotalCards,
    type DeckCodeInput,
} from '../utils/deckCode';
import { analyzeDeckGap, resolveDeckGapBuyState } from '../utils/deckCodeImport';
// [2026-10-24 莉莉子] 二维码已按程的要求去掉（"分享卡组码的界面有点丑，去掉二维码"）。
//   PC 端本来也扫不了、手机端又主要靠粘贴，留着只占版面还压低了紧凑度。

/** 与 `ShopScreen.tsx:63` 同构 —— 静态卡牌数据补上"对局实例"字段才能交给 `<Card>` 渲染 */
const toFullCardData = (staticData: (typeof CARD_DB)[string]): CardData => ({
    ...(staticData as CardData),
    id: `deckcode_${staticData.key}`,
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 },
});

export type DeckCodeModalMode = 'export' | 'import';

export interface DeckCodeModalProps {
    isOpen: boolean;
    mode: DeckCodeModalMode;
    onClose: () => void;

    /** 导出源（mode==='export' 时必传） */
    deck?: Pick<SavedDeck, 'hero' | 'cards' | 'cardBackIndex' | 'boardIndex'>;
    deckName?: string;

    /**
     * 导入解析 + 规则校验通过后回调（父层负责存卡组）。
     * ⚠️ **必须返回新卡组的 id**（否则「我自己补」无法定位到这套刚导入的卡组，
     *    而如果在这里再存一次就会产生两套重复卡组）。
     */
    onCommitImport?: (deck: DeckCodeInput) => string | void;
    /** 「我自己补」→ 把这套（可能有缺口）的卡组交给 DeckBuilder 继续编辑 */
    onEditImported?: (deck: DeckCodeInput, deckId?: string) => void;
    /** 「去抽卡」→ 走大厅那套「加载界面 → 共鸣」入口 */
    onGoGacha?: () => void;

    /** 实时库存 / 余额（补齐按钮三态依赖它们，**每次渲染重算**） */
    ownedCards?: Record<string, number>;
    silverCoin?: number;
    /** 一键补齐：一次提交；返回是否成功 */
    onPurchaseMissing?: (items: Array<{ key: string; count: number }>, totalCost: number) => boolean;
    /**
     * [2026-10-24 莉莉子] 复制成功后的回调 —— 父层负责**关窗 + 顶部提示**。
     * ⚠️ 只在"真的写进剪贴板"时触发（降级链前 3 层）。
     *    第 4 层兜底（全选让玩家自己 Ctrl+C）**不算成功**，窗口必须留着，
     *    否则玩家刚要按键、窗口没了。
     */
    onCopySuccess?: () => void;
}

export const DeckCodeModal: React.FC<DeckCodeModalProps> = ({
    isOpen,
    mode,
    onClose,
    deck,
    deckName,
    onCommitImport,
    onEditImported,
    onGoGacha,
    ownedCards = {},
    silverCoin = 0,
    onPurchaseMissing,
    onCopySuccess,
}) => {
    // ── 导出视图 ────────────────────────────────────────────────
    const code = useMemo(() => {
        if (mode !== 'export' || !deck) return '';
        try {
            return encodeDeckCode({
                hero: deck.hero,
                cards: deck.cards,
                cardBackIndex: deck.cardBackIndex,
                boardIndex: deck.boardIndex,
            });
        } catch (err) {
            console.error('[deckCode] 导出失败:', err);
            return '';
        }
    }, [mode, deck]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [copyHint, setCopyHint] = useState<string | null>(null);

    // ── 导入视图 ────────────────────────────────────────────────
    const [raw, setRaw] = useState('');
    const [error, setError] = useState<string | null>(null);
    /** 已入库的卡组；非空 ⇒ 说明流程走到"看缺口"这一步了 */
    const [imported, setImported] = useState<DeckCodeInput | null>(null);
    /** 入库后的卡组 id —— 「我自己补」用它定位，避免重复入库 */
    const [importedId, setImportedId] = useState<string | undefined>(undefined);

    // 关闭时清空，避免下次打开看到上次的残留
    useEffect(() => {
        if (!isOpen) {
            setRaw('');
            setError(null);
            setImported(null);
            setImportedId(undefined);
            setCopyHint(null);
        }
    }, [isOpen]);

    // 缺口：实时算（补齐后 `ownedCards` 变 ⇒ 自动消失）
    const gap = useMemo(
        () => (imported ? analyzeDeckGap(imported.cards, ownedCards) : null),
        [imported, ownedCards],
    );
    const buyState = useMemo(
        () => (gap ? resolveDeckGapBuyState(gap, silverCoin) : 'affordable'),
        [gap, silverCoin],
    );

    if (!isOpen) return null;

    // ── 复制：四级降级 ──────────────────────────────────────────
    const doCopy = async () => {
        eventBus.emit(GameEvents.UI_CLICK);
        const text = code;

        // ① Electron 原生剪贴板（正式包最可靠）
        try {
            const req = (window as unknown as { require?: (m: string) => any }).require;
            if (req) {
                const electron = req('electron');
                if (electron?.clipboard?.writeText) {
                    electron.clipboard.writeText(text);
                    onCopySuccess?.();
                    return;
                }
            }
        } catch { /* 落到下一层 */ }

        // ② Web Clipboard（安全上下文 / 安卓 WebView）
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                setCopyHint('已复制');
                return;
            }
        } catch { /* 落到下一层 */ }

        // ③ 老命令
        try {
            const ta = textareaRef.current;
            if (ta) {
                ta.select();
                if (document.execCommand('copy')) {
                    onCopySuccess?.();
                    return;
                }
            }
        } catch { /* 落到最后一层 */ }

        // ④ 兜底：**保证玩家永远拿得到** —— 全选好，让他自己按 Ctrl+C
        textareaRef.current?.select();
        setCopyHint('已全选，按 Ctrl+C 复制');
    };

    // ── 导入：解析 → 规则校验 → 入库 → 看缺口 ──────────────────
    const doImport = () => {
        eventBus.emit(GameEvents.UI_CLICK);
        setError(null);

        const decoded = decodeDeckCode(raw);
        if (!decoded.ok) {
            setError(DECK_CODE_ERROR_TEXT[decoded.kind]);
            return;
        }

        const shape = validateDeckShape(decoded.cards);
        if (!shape.ok) {
            setError(shape.message);
            return;
        }

        const payload: DeckCodeInput = {
            hero: decoded.hero,
            cards: decoded.cards,
            cardBackIndex: decoded.cardBackIndex,
            boardIndex: decoded.boardIndex,
        };

        // 入库（父层返回新卡组 id）—— 只入库这一次，后续「我自己补」靠这个 id 定位
        const newId = onCommitImport?.(payload);
        setImportedId(typeof newId === 'string' ? newId : undefined);
        setImported(payload); // 立刻进入"看缺口"这一步（缺口为空时下面会显示成功态）
    };

    const doPurchase = () => {
        if (!gap || !imported) return;
        eventBus.emit(GameEvents.UI_CLICK);
        const items = gap.missing
            .filter(m => !m.isChampion)   // 天启者不在这里买（比特金那条路）
            .map(m => ({ key: m.key, count: m.short }));
        const ok = onPurchaseMissing?.(items, gap.totalPrice) ?? false;
        if (!ok) setError('购买失败：数据银不足或状态已变化，请重试');
    };

    // ═══════════════════════════════════════════════════════════
    // 渲染
    // ═══════════════════════════════════════════════════════════

    const overlayClass =
        'fixed inset-0 z-[900] flex items-center justify-center bg-black/75 backdrop-blur-sm p-6';
    // 导出只需要"一行摘要 + 一段码 + 一个按钮" ⇒ 窄卡片更紧凑；导入要摆缺卡卡面 ⇒ 保持宽
    const cardClass = `${
        mode === 'export' ? 'w-[min(92vw,520px)]' : 'w-[min(94vw,880px)] max-h-[88vh] overflow-y-auto'
    } rounded-3xl bg-slate-900/95 backdrop-blur-xl border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.6)]`;

    /** 绿按钮三态 —— 文案与可点性都从这里派生，UI 不再各自判断 */
    const buyButton = (() => {
        if (!gap || gap.complete) return null;
        const disabled = buyState !== 'affordable';
        // 程的口径：买得起数字白色、买不起数字红色；而**买不起时按钮本身也是灰的**
        const priceColor = buyState === 'insufficient' ? 'text-rose-400' : 'text-white';

        return (
            <button
                key="buy"
                onClick={doPurchase}
                disabled={disabled}
                className={`flex-1 py-3 rounded-2xl font-black tracking-wider transition-all flex items-center justify-center gap-2 ${
                    disabled
                        ? 'bg-slate-800 text-gray-500 cursor-not-allowed border border-white/10'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:scale-[1.02]'
                }`}
            >
                <ShoppingCart size={18} />
                <span>
                    {buyState === 'champion-blocked' ? (
                        '缺少天启者卡牌'
                    ) : (
                        <>
                            商店一键补齐 需要数据银 ×
                            <span className={priceColor}>{gap.totalPrice}</span>
                        </>
                    )}
                </span>
            </button>
        );
    })();

    return (
        <div className={overlayClass} onClick={onClose}>
            <div className={cardClass} onClick={e => e.stopPropagation()}>
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-black tracking-[0.2em] text-white">
                            {mode === 'export' ? '分享卡组码' : '导入卡组码'}
                        </h2>
                        <p className="text-[10px] font-mono tracking-[0.25em] text-white/35">
                            {mode === 'export' ? 'SHARE DECK CODE' : 'IMPORT DECK CODE'}
                        </p>
                    </div>
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-all p-2"
                        title="关闭"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* ─────────── 导出 ─────────── */}
                {/* [2026-10-24 莉莉子] 按程的要求重排：去掉二维码、收紧留白、复制按钮改成整行主按钮。
                    目标是"一眼看清是什么卡组、一键复制完就走"，没有任何多余元素。 */}
                {mode === 'export' && (
                    <div className="px-5 py-4 flex flex-col gap-3">
                        {/* 卡组摘要：左边名字（过长省略），右边张数与码长 */}
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-[13px] font-bold text-gray-200 truncate">
                                《{deckName || '未命名'}》
                            </span>
                            <span className="text-[11px] font-mono text-gray-500 shrink-0 tabular-nums">
                                {deckTotalCards(deck?.cards ?? {})} 张
                                {code && ` · ${code.length} 字符`}
                            </span>
                        </div>

                        {code ? (
                            <>
                                {/* 码本体：等宽、绿色终端感；点一下自动全选，方便手动复制 */}
                                <textarea
                                    ref={textareaRef}
                                    readOnly
                                    value={code}
                                    onFocus={e => e.currentTarget.select()}
                                    spellCheck={false}
                                    className="w-full h-[90px] bg-black/60 border border-emerald-500/25 rounded-2xl px-3 py-2.5 font-mono text-[12.5px] leading-[1.5] text-emerald-300/90 break-all resize-none focus:outline-none focus:border-emerald-400/60 transition-colors [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                                />

                                <button
                                    onClick={doCopy}
                                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black tracking-[0.15em] transition-all shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.99] flex items-center justify-center gap-2"
                                >
                                    <Copy size={16} /> 复制卡组码
                                </button>

                                {/* 只有**降级到最后一层**才会显示这行（前三层成功就直接关窗了） */}
                                {copyHint ? (
                                    <p className="text-center text-[11px] text-amber-300/90">{copyHint}</p>
                                ) : (
                                    <p className="text-center text-[11px] text-gray-600">
                                        复制后直接粘贴到聊天窗口即可分享
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-rose-400 text-sm py-2">这套卡组里含有未登记卡组码 ID 的卡牌，暂时无法导出。</p>
                        )}
                    </div>
                )}

                {/* ─────────── 导入 · 第一步：粘贴 ─────────── */}
                {mode === 'import' && !imported && (
                    <div className="p-6 flex flex-col gap-4">
                        <textarea
                            value={raw}
                            onChange={e => { setRaw(e.target.value); setError(null); }}
                            placeholder="把卡组码粘贴到这里（以 SBD 开头）"
                            className="w-full h-32 bg-black/50 border border-white/15 rounded-2xl p-3 font-mono text-[13px] text-white break-all resize-none focus:outline-none focus:border-blue-500/60 placeholder:text-gray-600"
                        />
                        {error && (
                            <div className="flex items-start gap-2 text-rose-400 text-sm">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}
                        <button
                            onClick={doImport}
                            disabled={!raw.trim()}
                            className={`py-3 rounded-2xl font-black tracking-wider transition-all ${
                                raw.trim()
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40'
                                    : 'bg-slate-800 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            导入
                        </button>
                    </div>
                )}

                {/* ─────────── 导入 · 第二步：缺口提示 ─────────── */}
                {mode === 'import' && imported && (
                    <div className="p-6 flex flex-col gap-4">
                        {gap?.complete ? (
                            <div className="flex flex-col items-center gap-3 py-6">
                                <Check size={40} className="text-emerald-400" />
                                <p className="text-lg font-black text-white">导入成功</p>
                                <p className="text-sm text-gray-400">
                                    《{CARD_DB[imported.hero]?.name ?? imported.hero}》卡组缺失的卡牌已全部拥有，可以直接开局。
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-white font-bold">
                                            还缺 {gap?.totalShort} 张卡（{gap?.missing.length} 种）
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            卡组已存入你的牌组列表，补齐之前无法用它开局。
                                        </p>
                                    </div>
                                </div>

                                {/* 缺卡：直接用卡面渲染（不写名字，一眼认出是哪张） */}
                                <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                                    {gap?.missing.map(m => {
                                        const data = CARD_DB[m.key];
                                        if (!data) return null;
                                        return (
                                            <div key={m.key} className="shrink-0 relative" style={{ width: 104, height: 162 }}>
                                                <div style={{ transform: 'scale(0.8)', transformOrigin: 'top left' }}>
                                                    <Card data={toFullCardData(data)} location="collection" isFaceUp={true} />
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center">
                                                    <span className="bg-rose-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">
                                                        缺 {m.short}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 text-rose-400 text-sm">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                {/* 三按钮：绿（一键补齐）/ 红（去抽卡）/ 白（我自己补）
                                    ⚠️ 绿按钮的三态由 `resolveDeckGapBuyState` 唯一裁决：
                                       缺天启者 → 灰；买得起 → 可用白字；买不起 → **灰 + 红字** */}
                                <div className="flex flex-col sm:flex-row gap-3 mt-1">
                                    {buyButton}
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onGoGacha?.(); onClose(); }}
                                        className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black tracking-wider transition-all shadow-lg shadow-rose-900/40 hover:scale-[1.02]"
                                    >
                                        <span className="inline-flex items-center gap-2"><Sparkles size={18} /> 去抽卡</span>
                                    </button>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onEditImported?.(imported, importedId); onClose(); }}
                                        className="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black tracking-wider transition-all"
                                    >
                                        <span className="inline-flex items-center gap-2"><Pencil size={18} /> 我自己补</span>
                                    </button>
                                </div>

                                {buyState === 'insufficient' && (
                                    <p className="text-xs text-gray-500">
                                        数据银不足（现有 {silverCoin}，需要 {gap?.totalPrice}）—— 去抽卡或自己补，也可以先关掉这个窗口稍后再补。
                                    </p>
                                )}
                                {buyState === 'champion-blocked' && (
                                    <p className="text-xs text-gray-500">
                                        缺少的卡里有天启者，数据银买不到（商店里天启者走比特金）—— 只能抽卡或稍后再补。
                                    </p>
                                )}
                            </>
                        )}

                        <p className="text-[11px] text-gray-600 text-center">
                            直接关掉这个窗口也可以：卡组会保留，但补齐之前无法开局。
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
