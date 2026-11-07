// ==========================================
// 悖论迷宫 · 圆形地图节点
// 绝对定位在画布内（坐标基于地图原始尺寸），随画布 transform 统一缩放
// ==========================================
import React from 'react';
import { Sword, Skull, Crown, Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles, Check, Lock } from 'lucide-react'; // [2026-08-10] · [2026-11-07] X（击败红叉）已弃用 ⇒ 改 Check（中央对勾）；Lock：未抵达节点锁
import type { RogueNodeType } from '../../data/roguelike/mapLayout';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 当前节点头像读取 avatar 裁剪配置
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 节点点击音效

export const NODE_META: Record<RogueNodeType, { icon: React.ReactNode; color: string; label: string }> = { // [2026-08-11] 导出供 NodePreviewPanel 占位卡面复用
    start: { icon: <Flag size={18} />, color: 'bg-green-600', label: '起点' },
    enhance: { icon: <Sparkles size={18} />, color: 'bg-violet-600', label: '强化' },
    battle: { icon: <Sword size={18} />, color: 'bg-blue-600', label: '战斗' },
    elite: { icon: <Skull size={18} />, color: 'bg-red-600', label: '精英' },
    boss: { icon: <Crown size={20} />, color: 'bg-purple-700', label: 'Boss' },
    rest: { icon: <Flame size={18} />, color: 'bg-amber-600', label: '休息' },
    shop: { icon: <ShoppingBag size={18} />, color: 'bg-emerald-600', label: '商店' },
    event: { icon: <HelpCircle size={18} />, color: 'bg-cyan-600', label: '事件' },
    treasure: { icon: <Gem size={18} />, color: 'bg-yellow-500', label: '宝箱' },
    // [2026-10-09 莉莉子 · 随机节点] 未揭示的"未知节点"：图标仍是问号，但配**石板灰**以区别于青色事件节点
    random: { icon: <HelpCircle size={18} />, color: 'bg-slate-600', label: '未知' },
};

export type MapNodeState = 'available' | 'current' | 'done' | 'locked' | 'missed'; // [2026-08-10] missed：错过（灰）

interface MapNodeProps {
    type: RogueNodeType;
    x: number;
    y: number;
    state: MapNodeState;
    onActivate: () => void;
    enemyKey?: string; // [2026-08-10] 战斗节点：预分配敌人头像（英雄卡 key）
    size?: number; // [2026-08-04] 自定义节点尺寸（px），供地图编辑器调节
    onPreview?: () => void; // [2026-08-11] 右键预览回调（任何状态可触发，不受 isClickable 限制）
    revealDelay?: number; // [2026-08-28 莉莉子] 推演开场：该节点从暗弹出的延迟秒数（不传则无动画，地图编辑器不受影响）
    /** [2026-10-08 莉莉子 · 瓦尔基里大赛] 该节点已登记「**待战**」⇒ 渲染成**战斗节点**（事件结算后它会变成战斗） */
    pendingBattle?: boolean;
    /**
     * [2026-10-09 莉莉子 · 随机节点] **未揭示**：该节点是"随机节点"且真身尚未对玩家公开（`node.wasRandom`）。
     * 为真时一律渲染成"未知"（图标/配色/不显示敌人头像）—— 否则玩家在地图上直接看出真身＝泄露。
     * 由 `RogueMapScreen` 传 `node.wasRandom`。
     */
    unrevealed?: boolean;
}

export const MapNode: React.FC<MapNodeProps> = ({ type, x, y, state, onActivate, enemyKey, size, onPreview, revealDelay, pendingBattle, unrevealed }) => {
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **待战节点用"精英战斗"的元信息渲染**（图标/配色/敌人头像位）
    //   —— 它原本是事件节点，事件结算 + 选择后"变成战斗节点"（程的设计）
    // [2026-10-09 莉莉子 · 随机节点] **未揭示 ⇒ 一律渲染成「未知」**（真身已在开局预掷进 `type`）
    const renderedType: RogueNodeType = unrevealed ? 'random' : (pendingBattle ? 'elite' : type);
    const meta = NODE_META[renderedType];
    const isClickable = state === 'available' || state === 'current';
    const isCurrent = state === 'current';
    const isDiamond = !unrevealed && type === 'enhance'; // [2026-08-04] 迷宫强化节点：菱形而非圆形
    const nodeSize = size ?? (isCurrent ? 64 : 44);
    // [2026-08-10] 战斗节点（战斗/精英/Boss）优先显示预分配敌人头像，替代通用图标
    //   ⚠️ [2026-10-09] 未揭示节点**即使真身是战斗也不显示敌人头像**（否则等于公开真身）
    const isCombatNode = !unrevealed && (renderedType === 'battle' || renderedType === 'elite' || renderedType === 'boss');
    const showEnemyAvatar = isCombatNode && !!enemyKey; // [2026-08-04] 编辑器可自定义尺寸
    // [2026-08-26 莉莉子] 当前节点：蓝色高光包裹白色核心——白色描边 + 外层蓝色光晕（霓虹管效果）
    const nodeStyle = isCurrent ? { boxShadow: '0 0 22px rgba(59,130,246,0.85)' } : undefined;

    // ==========================================
    // [2026-11-07 莉莉子 · 程反馈「精英/Boss/普通战斗外观上看不出区别」]
    //   ── 病根（3 条，都在本文件）：
    //      ① 战斗节点**优先显示敌人头像**（`showEnemyAvatar`）⇒ 头像把整个圆填满，
    //         `NODE_META` 里配的底色（战斗蓝 / 精英红 / Boss 紫）几乎看不见；
    //      ② 同理 `NODE_META` 里的 `Skull` / `Crown` **图标永远不显示**
    //         （只要节点有 enemyKey 就走不到图标分支）—— 王冠其实代码里早就有，只是被头像顶掉了；
    //      ③ 尺寸数据不统一（`mapLayout` 里 Boss 有 76 / 100 / 75，精英有 44 / 76）
    //         ⇒ 连"大小"这条线也不可靠。
    //   ── 结论：分级特征**必须画在圆的外面**，不能跟头像抢内部空间。
    //   ── 本实现只用 CSS 几何（外扩环 / clip-path 尖角与王冠 / 锥形光弧），**零新增美术资源**；
    //      全部 `pointer-events-none`，不影响点击与右键预览；靠 `filter` 继承父级
    //      ⇒ `done` / `missed` / `locked` 的变灰会**连带装饰一起变灰**，不用另写状态分支。
    //   ⚠️ `unrevealed`（未揭示的随机节点）一律不挂装饰 —— 否则角标就直接泄露了真身。
    // ==========================================
    const isEliteNode = !unrevealed && renderedType === 'elite';
    const isBossNode = !unrevealed && renderedType === 'boss';
    const showRankDeco = isEliteNode || isBossNode;

    return (
        <button
            onClick={() => { if (isClickable) { eventBus.emit(GameEvents.UI_CLICK); onActivate(); } }}
            onContextMenu={(e) => {
                // [2026-08-11 节点预览] 右键任意状态节点 → 弹预览；抑制浏览器菜单 + 阻止冒泡到视口（视口据此区分节点/空白右键）
                e.preventDefault();
                e.stopPropagation();
                onPreview?.();
            }}
            style={{
                left: x, top: y, width: nodeSize, height: nodeSize, ...nodeStyle,
                // [2026-08-28 莉莉子] 推演开场：节点从暗弹出（backwards → delay 期间隐藏、结束后恢复自身样式）
                ...(revealDelay !== undefined
                    ? { animation: `rogue-map-node-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${revealDelay}s backwards` }
                    : {}),
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center border-2 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all
                ${meta.color}
                ${isCurrent ? 'border-white z-30' : 'border-white/70'}
                ${isDiamond ? 'rounded-sm rotate-45' : 'rounded-full'}
                ${state === 'available'
                    ? isDiamond
                        ? 'cursor-pointer hover:brightness-125 shadow-[0_0_16px_rgba(255,255,255,0.5)]' // [2026-08-25] 相邻节点静态亮起
                        : 'cursor-pointer hover:scale-125 shadow-[0_0_16px_rgba(255,255,255,0.5)]' // [2026-08-25] 相邻节点静态亮起
                    : state === 'current'
                        ? 'cursor-pointer'
                        : state === 'missed'
                            ? 'cursor-default grayscale brightness-[0.55]' // 错过：灰色实心
                            : state === 'done'
                                // [2026-08-25] 已击败 · [2026-11-07] 红叉改为"中央对勾 + 暗罩"承担，
                                //   这里只留轻微压暗（0.7 → 0.9），避免与暗罩叠加成"糊成一团黑"
                                ? 'cursor-default brightness-[0.9]'
                                : 'cursor-default grayscale brightness-[0.5]'}`} // [2026-08-27] locked：完全灰色（未抵达）
        >
            {/* [当前节点] 蓝色脉冲；节点本体保留类型图标，天启者头像圆悬于节点上方 */}
            {isCurrent && (
                <>
                    <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping" />
                    <span className="absolute -inset-2 rounded-full border border-blue-300/60 animate-ping" style={{ animationDelay: '0.4s' }} />
                    <span className="absolute -inset-4 rounded-full border border-blue-200/40 animate-ping" style={{ animationDelay: '0.8s' }} />
                </>
            )}
            {/* ===== [2026-11-07 莉莉子] 战斗节点分级外观（全部画在圆外 ⇒ 不与敌人头像抢空间） ===== */}
            {showRankDeco && (
                <>
                    {/* ① 外扩环：精英 = 细环 / Boss = 粗环 */}
                    <span
                        className="absolute rounded-full pointer-events-none"
                        style={{
                            inset: isBossNode ? -5 : -4,
                            border: `${isBossNode ? 3 : 2}px solid ${isBossNode ? 'rgba(192,132,252,0.92)' : 'rgba(248,113,113,0.82)'}`,
                            boxShadow: isBossNode
                                ? '0 0 14px rgba(168,85,247,0.6)'
                                : '0 0 10px rgba(239,68,68,0.45)',
                        }}
                    />

                    {/* ② Boss 专属：缓速旋转的锥形光弧（径向遮罩只留外圈一道光；全场通常仅 1 个，性能可忽略） */}
                    {isBossNode && (
                        <span
                            className="absolute rounded-full pointer-events-none animate-spin"
                            style={{
                                inset: -10,
                                animationDuration: '9s',
                                background: 'conic-gradient(from 0deg, rgba(168,85,247,0) 0deg, rgba(216,180,254,0.95) 70deg, rgba(168,85,247,0) 150deg, rgba(168,85,247,0) 360deg)',
                                WebkitMaskImage: 'radial-gradient(circle, transparent 64%, #000 68%, #000 100%)',
                                maskImage: 'radial-gradient(circle, transparent 64%, #000 68%, #000 100%)',
                            }}
                        />
                    )}

                    {/* ③ 顶部轮廓：精英 = 一对向外倾的尖角（恶魔角）/ Boss = 单顶王冠 */}
                    {isBossNode ? (
                        <span
                            className="absolute pointer-events-none"
                            style={{
                                left: '50%', top: -12, transform: 'translateX(-50%)',
                                width: 28, height: 15,
                                background: 'linear-gradient(180deg, #fde68a 0%, #facc15 55%, #eab308 100%)',
                                clipPath: 'polygon(0% 100%, 10% 26%, 32% 62%, 50% 0%, 68% 62%, 90% 26%, 100% 100%)',
                                filter: 'drop-shadow(0 0 5px rgba(250,204,21,0.95))',
                            }}
                        />
                    ) : (
                        <>
                            {/* 角必须**尖到环外**、且用浅→深的对比色，否则会和红色外环糊成一片
                                （第一版就栽在这：角与外环同为红系，44px 下基本看不出角形） */}
                            <span
                                className="absolute pointer-events-none"
                                style={{
                                    left: '8%', top: -14, width: 11, height: 20,
                                    background: 'linear-gradient(180deg, #fee2e2 0%, #ef4444 52%, #7f1d1d 100%)',
                                    clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                                    transform: 'rotate(-26deg)',
                                    filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.55))',
                                }}
                            />
                            <span
                                className="absolute pointer-events-none"
                                style={{
                                    right: '8%', top: -14, width: 11, height: 20,
                                    background: 'linear-gradient(180deg, #fee2e2 0%, #ef4444 52%, #7f1d1d 100%)',
                                    clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                                    transform: 'rotate(26deg)',
                                    filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.55))',
                                }}
                            />
                        </>
                    )}

                    {/* ④ [2026-11-07 莉莉子 · 程反馈「角徽丑爆了，左上右上角徽都不要」]
                        ⇒ **不再有任何角落小圆徽**。精英的身份只靠「顶部双角 + 外扩细环」承担
                        （这两样是**形状**，不是贴上去的章，44px 下也不会显廉价）。
                        原先这里有一个左上角骷髅徽，已删。 */}

                    {/* ⑤ Boss 下方文字标签 */}
                    {isBossNode && (
                        <span
                            className="absolute left-1/2 -translate-x-1/2 pointer-events-none font-black tracking-[0.18em] text-yellow-300"
                            style={{ bottom: -17, fontSize: 10, whiteSpace: 'nowrap', textShadow: '0 0 6px rgba(0,0,0,0.95), 0 0 2px #000' }}
                        >
                            BOSS
                        </span>
                    )}
                </>
            )}

            {/* 节点本体：[2026-08-27] 未抵达=整个节点被灰色锁替代；战斗节点显示敌人头像，其余显示类型图标（菱形节点反旋转保持正立） */}
            {state === 'locked' ? (
                <Lock size={nodeSize * 0.42} className="text-gray-400" strokeWidth={2.5} />
            ) : showEnemyAvatar ? (
                <CroppedAvatar cardKey={enemyKey!} className="w-full h-full rounded-full" />
            ) : (
                <span className={isDiamond ? '-rotate-45' : ''}>{meta.icon}</span>
            )}
            {/* ==========================================
                [2026-11-07 莉莉子 · 程反馈「右上角的角徽也不要」]
                ── 原实现是右上角一枚「红底白叉」小圆章。它和刚删掉的左上角徽是同一类问题：
                   在 44px 节点上它比头像本身还抢眼，两枚角章还会互相打架。
                ── 改成**本体状态表达**：整圆压一层暗罩 + 正中一枚对勾 —— 覆盖头像、不侵占任何角落。
                   「已通过」最直白的语义就是打勾，居中之后也不会产生"角落堆章"的杂乱。
                ── 与 missed / locked 的区分：done 仍保留类型装饰（角 / 王冠）与对勾，
                   只是整体压暗；那两档是**去色**（missed）或**去色 + 锁**（locked）。
                ========================================== */}
            {state === 'done' && (
                <span
                    className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none z-30"
                    style={{ background: 'rgba(6, 10, 20, 0.42)' }}
                >
                    <Check
                        size={nodeSize * 0.52}
                        // 菱形节点（强化）本体被 rotate-45 过，对勾要反向转回来才正立
                        className={`text-emerald-300 ${isDiamond ? '-rotate-45' : ''}`}
                        strokeWidth={4}
                        style={{ filter: 'drop-shadow(0 0 5px rgba(0,0,0,0.95)) drop-shadow(0 0 3px rgba(16,185,129,0.85))' }}
                    />
                </span>
            )}
        </button>
    );
};
