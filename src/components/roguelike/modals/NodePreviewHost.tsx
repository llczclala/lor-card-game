// ==========================================
// 悖论迷宫 · 节点内容预览（地图编辑器专用 · 2026-11-20）
//
// 用途：在地图编辑器里提前打开某个节点的界面，看它长什么样 —— **不参与真实对局**。
//   · 覆盖：强化 / 休整 / 商店 / 宝箱 / 事件 / 随机（先掷一次，掷到战斗则提示无面板）
//   · 战斗类（battle / elite / boss）刻意排除：它们的界面是局内对局，不是"节点面板"
//
// ⚠️ 四条硬约束：
//   1. **不写任何数据** —— 所有回调都不落盘、不改 run（商店那几个返回 true 只为走完"已购"反馈）。
//   2. mock run 只在预览期间存在（`useMemo`），关窗即丢；金币/刷新次数都是**虚构值**。
//   3. 内容每次打开**重新抽**（强化三选一 / 商店货架 / 宝箱类型）—— 反复点就能反复看，
//      这正是"模拟测试"要的行为；不需要复现同一批货时不必加种子。
//   4. **必须 `createPortal` 到 body 再包一层 `z-[1200]`**：
//      编辑器挂在 `Studio`（`fixed z-[999]`）里，而 Studio 的左侧工具栏是 `z-20`、
//      内容区是 `z-10` ⇒ 节点弹窗自带的 `z-[700]` 会被**侧栏盖住**。
//      portal + 外层 1200 让整层跳出 Studio 的堆叠上下文，才真的盖在最上面。
// ==========================================
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { RANDOM_NODE_POOL, type RogueNodeType } from '../../../data/roguelike/mapLayout';
import type { RogueDifficulty } from '../../../data/roguelike/difficulties';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { buildStarterDeck } from '../../../data/roguelike/rogueStarterDecks';
import { pickRandomEnhancements } from '../../../data/roguelike/enhancements';
import { generateShopStock } from '../../../data/roguelike/shop';
import { ROGUE_EVENTS } from '../../../data/roguelike/events';
import { NodeEventModal } from './NodeEventModal';
import { ShopModal } from './ShopModal';
import { TreasureModal } from './TreasureModal';

/** 可预览的节点类型（战斗类交给局内对局，不在这里） */
export type PreviewableNodeType = Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>;

const isPreviewable = (t: RogueNodeType): t is PreviewableNodeType =>
    t !== 'battle' && t !== 'elite' && t !== 'boss';

/** 供调用方判断该节点有没有面板可预览（编辑器按钮的显示条件） */
export { isPreviewable };

const NODE_LABEL: Record<RogueNodeType, string> = {
    start: '起点', enhance: '强化', battle: '战斗', elite: '精英', boss: 'Boss',
    rest: '休整', shop: '商店', event: '事件', treasure: '宝箱', random: '随机',
};

/** 预览用的天启者与虚构数值（改这里即可换预览样本） */
const PREVIEW_HERO = 'lyfe';
const PREVIEW_MAX_HP = 40;
/** 故意取 65% —— 不满血，休整四个选项才都点得动（满血时「休整」会被置灰） */
const PREVIEW_HP_PCT = 0.65;
const PREVIEW_GOLD = 600;
const PREVIEW_REFRESH = 2;

const buildMockRun = (difficulty: RogueDifficulty): RoguelikeRunState => ({
    heroKey: PREVIEW_HERO,
    difficulty,
    deck: buildStarterDeck(PREVIEW_HERO),
    hp: Math.round(PREVIEW_MAX_HP * PREVIEW_HP_PCT),
    maxHp: PREVIEW_MAX_HP,
    gold: PREVIEW_GOLD,
    enhancements: [],
    act: 1,
    currentNodeId: null,
    settledShards: 0,
    earnedChests: [],
    refreshCount: PREVIEW_REFRESH,
    reviveCount: 0,
    defeated: [],
    missed: [],
    visited: [],
    status: 'active',
    startedAt: Date.now(),
    expFromNodes: 0,
    expGrantedNodes: [],
    layout: [],
});

export const NodePreviewHost: React.FC<{
    type: RogueNodeType;
    difficulty: RogueDifficulty;
    /** 编辑器里给事件节点指定了事件 ⇒ 预览就打开那一条；不传则随机抽 */
    eventId?: string;
    onClose: () => void;
}> = ({ type, difficulty, eventId, onClose }) => {
    // 随机节点：开窗时掷一次（与编辑器里「试掷一次」同一口径），本窗口内不再变
    const [resolved] = useState<RogueNodeType>(() =>
        type === 'random'
            ? RANDOM_NODE_POOL[Math.floor(Math.random() * RANDOM_NODE_POOL.length)]
            : type);

    const run = useMemo(() => buildMockRun(difficulty), [difficulty]);

    const enhanceOptions = useMemo(
        () => (resolved === 'enhance' ? pickRandomEnhancements(3, difficulty, undefined, undefined, []) : []),
        [resolved, difficulty],
    );

    const stock = useMemo(
        () => (resolved === 'shop'
            ? generateShopStock(undefined, undefined, { difficulty, ownedEnhancements: [] })
            : null),
        [resolved, difficulty],
    );

    const event = useMemo(() => {
        if (resolved !== 'event') return undefined;
        if (eventId) {
            const byId = ROGUE_EVENTS.find(e => e.id === eventId);
            if (byId) return byId;
        }
        return ROGUE_EVENTS[Math.floor(Math.random() * ROGUE_EVENTS.length)];
    }, [resolved, eventId]);

    const content = (() => {
        // 掷到战斗类：没有可预览的面板，给一句说明（否则点「随机」会像"没反应"）
        if (!isPreviewable(resolved)) {
            return (
                <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="relative bg-slate-900 border border-white/15 rounded-2xl px-10 py-8 text-center max-w-md">
                        <button type="button" onClick={onClose}
                            className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300">
                            <X size={18} />
                        </button>
                        <p className="text-lg font-black text-white mb-2">掷出了「{NODE_LABEL[resolved]}」节点</p>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            随机节点掷到战斗类时没有节点面板 —— 战斗界面在局内对局里。
                            <br />关掉重开一次即可再掷。
                        </p>
                    </div>
                </div>
            );
        }

        if (resolved === 'shop' && stock) {
            return (
                <ShopModal
                    run={run}
                    stock={stock}
                    initialPurchased={[]}
                    availableTabs={['card', 'enhancement', 'equipment', 'remove']}
                    // ⚠️ 返回 **true** 是刻意的：商店内部据此把商品标成「已购」并清空选择 ——
                    //   能走完整套交互反馈才是预览的目的；父级这里什么都不写，不会污染数据。
                    //   （关窗重开即复位：`mark` 是商店自己的 state。）
                    onBuyCard={() => true}
                    onBuyEnhancement={() => true}
                    onBuyEquipment={() => true}
                    onRemoveCard={() => true}
                    // 刷新返回 false：真实局的刷新次数有限，预览不给"无限刷货"的错觉
                    onRefresh={() => false}
                    onClose={onClose}
                />
            );
        }

        if (resolved === 'treasure') {
            return (
                <TreasureModal
                    run={run}
                    onCollectGold={() => {}}
                    onPickCard={() => {}}
                    onPickEnhancement={() => {}}
                    onSacrificeForEpic={() => {}}
                    onCollectRandom={() => {}}
                    onClose={onClose}
                />
            );
        }

        // 强化 / 休整 / 事件 / 起点（NodeEventModal 统一承接）
        return (
            <NodeEventModal
                // key 里带 resolved/event：同一次打开内稳定，换类型/换事件会重挂载复位内部步骤
                key={`preview_${resolved}_${event?.id ?? ''}`}
                type={resolved}
                hp={run.hp}
                maxHp={run.maxHp}
                onRest={() => {}}
                onEnhance={() => {}}
                enhanceOptions={enhanceOptions}
                onClose={onClose}
                run={run}
                event={event}
                onEvent={() => []}
                onEventFight={() => {}}
                onEventDeep={() => []}
                onRefresh={() => {}}
                refreshCount={run.refreshCount}
                onRemoveCard={() => {}}
                onAddCard={() => {}}
                onStartScout={() => {}}
                ownedEnhancements={[]}
            />
        );
    })();

    // portal + z-[1200] ⇒ 跳出 Studio(z-999) 的堆叠上下文，才能真盖在编辑器与侧栏之上
    return createPortal(
        <div className="relative z-[1200]">{content}</div>,
        document.body,
    );
};
