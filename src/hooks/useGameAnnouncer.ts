import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState } from '../types';
import type { AnnouncementData } from '../components/GameAnnouncement';

interface UseGameAnnouncerProps {
    game: GameState;
    drawCards: (count: number, reason?: 'mulligan') => void;
    // [新增] 接收换牌阶段状态，用于判断何时开始第一回合
    isMulliganPhase: boolean;
    // ★ 教程模式：跳过初始抽卡
    disableMulligan?: boolean;
    // [2026-07-08 新增] 开局流程结束回调 — 通知外部释放按钮锁
    onOpeningEnd?: () => void;
}

export const useGameAnnouncer = ({ game, drawCards, isMulliganPhase, disableMulligan = false, onOpeningEnd }: UseGameAnnouncerProps) => {
    const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);

    // 记录状态，用于逻辑判断
    const prevRoundRef = useRef(0);
    // 标记是否处于"开局流程中" (防止开局时直接跳到 Phase Hint)
    const isOpeningSequenceRef = useRef(true);

    // [新增] 记录上一次的进攻权归属，防止重复播报
    const prevAttackTokenRef = useRef<{ player: string | null, enemy: string | null }>({ player: null, enemy: null });


    // [新增] 记录当前回合是否已经播报过"你的回合"
    const hasAnnouncedTurnRef = useRef(false);
    // [新增] 追踪上一帧的 phase，用于检测 animating → main 的跃迁
    const prevPhaseRef = useRef(game.phase);
    // [新增] 用于打断机制的定时器缓存引用，确保能精准捕获并杀死悬空定时器
    const announcerTimeoutRef = useRef<any>(null);
    const sequenceTimeoutRef = useRef<any>(null);


    // 辅助：设置公告
    // [2026-10-05 莉莉子] **同文案去抖**：800ms 内重复的**同一句话**直接忽略。
    // ── 病根：拒绝类播报会在"反复点同一个无效目标"时被**连续触发**
    //    （反复点不可格挡的单位、反复点无效手牌…），而每次都会生成**新 id** ⇒
    //    `GameAnnouncement` 的 `AnimatePresence mode="wait"` 要走"退场 0.3s + 进场 0.4s"
    //    ⇒ 画面持续"闪"，反而看不清说了什么。
    // ── 只对**完全相同**（mainText + subText）的重复生效：文案一变就照常播，
    //    因此不影响「第 N 回合 / 你的进攻回合」这类正常序列（它们的文案各不相同）。
    const lastMsgRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
    const setMsg = (text: string, sub: string, type: AnnouncementData['type'], duration: number = 0) => {
        const dedupKey = `${text}|${sub}`;
        const now = Date.now();
        if (lastMsgRef.current.key === dedupKey && now - lastMsgRef.current.at < 800) return;
        lastMsgRef.current = { key: dedupKey, at: now };
        const id = now.toString();
        setAnnouncement({ id, mainText: text, subText: sub, type, duration });

        // [核心修改] 每次设置新公告前，先掐死上一个未完结的自动销毁定时器
        if (announcerTimeoutRef.current) clearTimeout(announcerTimeoutRef.current);

        if (duration > 0) {
            announcerTimeoutRef.current = setTimeout(() => {
                setAnnouncement(prev => (prev?.id === id ? null : prev));
            }, duration);
        }
    };

    // [修正] 显示攻守提示 (改为非持久，且增加空值检查)
    const showPhaseHint = () => {
        if (game.phase !== 'main') return;

        // 如果双方都没有进攻标识，不显示
        if (!game.attackToken.player && !game.attackToken.enemy) return;

        // [2026-09-03 莉莉子 双剑兼容] 单剑报持剑方；双剑（双方同时持剑）报 turnOwner 方（谁将行动），
        // 避免敌我双持 rally 剑时恒报"你的进攻回合"误导。
        const owners: ('player' | 'enemy')[] = [];
        if (game.attackToken.player) owners.push('player');
        if (game.attackToken.enemy) owners.push('enemy');
        const speaker = owners.length === 1 ? owners[0] : game.turnOwner;
        const isMyTurn = speaker === 'player';
        const text = isMyTurn ? "你的进攻回合" : "对手进攻回合";
        const sub = isMyTurn ? "YOUR ATTACK" : "ENEMY ATTACK";

        setMsg(text, sub, 'phase_hint', 2000);
    };

    // --- 核心剧本逻辑 ---

     useEffect(() => {
        if (prevRoundRef.current === 0 && game.round === 1) {
            setMsg("游戏开始", "GAME START", 'start', 1500);
        }
        else if (game.round > prevRoundRef.current && game.round > 1) {
            isOpeningSequenceRef.current = true;
            hasAnnouncedTurnRef.current = false;

            setMsg(`第 ${game.round} 回合`, `ROUND ${game.round}`, 'round', 1500);
            drawCards(1);

            // [核心修改] 用 sequenceTimeoutRef 接管这个延迟播报，防止回合初操作过快导致的文案错位
            if (sequenceTimeoutRef.current) clearTimeout(sequenceTimeoutRef.current);
            sequenceTimeoutRef.current = setTimeout(() => {
                isOpeningSequenceRef.current = false;
                showPhaseHint();
                // [修正] 更新 ref 为对象副本
                prevAttackTokenRef.current = { ...game.attackToken };
                onOpeningEnd?.(); // [2026-07-08] 通知外部释放按钮锁
            }, 2000);
        }
        prevRoundRef.current = game.round;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.round]);


    // 监听换牌结束
    useEffect(() => {
        console.log(`[Announcer] isMulliganPhase 变化: ${isMulliganPhase}, round=${game.round}, phase=${game.phase}, turnOwner=${game.turnOwner}`);
        if (!isMulliganPhase && game.round === 1) {
             console.log(`[Announcer] ⏰ 触发开局流程 — 800ms 后抽卡`);
             isOpeningSequenceRef.current = true;
             hasAnnouncedTurnRef.current = false;

             if (sequenceTimeoutRef.current) clearTimeout(sequenceTimeoutRef.current);
             sequenceTimeoutRef.current = setTimeout(() => {
                 console.log(`[Announcer] 🎯 800ms 到 — 执行抽卡 disableMulligan=${disableMulligan}`);
                 // ★ 教程模式跳过初始抽卡，由 tutorialInit 布置战场
                 if (!disableMulligan) {
                     setMsg("第一回合", "ROUND 1", 'round', 1500);
                     drawCards(4); // [2026-09-19] 换牌结束后的补抽＝普通抽卡（换牌开局的发牌音在 GameSession 播）
                     console.log(`[Announcer] 📤 drawCards(4) 已调用`);
                 }

                 // 继续用 sequenceTimeoutRef 接管更深层的开局令牌分发时机
                 sequenceTimeoutRef.current = setTimeout(() => {
                     console.log(`[Announcer] 🏁 开局流程收尾 — showPhaseHint`);
                     isOpeningSequenceRef.current = false;
                     showPhaseHint();
                     // [修正] 更新 ref 为对象副本
                     prevAttackTokenRef.current = { ...game.attackToken };
                     onOpeningEnd?.(); // [2026-07-08] 通知外部释放按钮锁
                 }, disableMulligan ? 800 : 5500);
             }, 800);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMulliganPhase]);


    // --- 监听状态以清除/更新持久提示 ---
    // 1. [核心重构] Phase 变化与玩家动作联合监听（硬核打断机制）
    useEffect(() => {
        // 只要脱离了静态的主阶段（进入动画 animating、战斗阶段、施法瞄准等）
        // 或者检测到任何一方执行了动作（lastActionTimestamp 刷新），立刻无条件执行最高级别打断！
        // [2026-08-16 莉莉子] 删除 `|| game.phase === 'animating'`：animating 已含于 !=='main'，冗余死条件（TS2367）
        if (game.phase !== 'main') {
            if (announcerTimeoutRef.current) clearTimeout(announcerTimeoutRef.current);
            if (sequenceTimeoutRef.current) {
                console.log(`[Announcer] ⛔ 清除 sequenceTimeout — phase=${game.phase}`);
                clearTimeout(sequenceTimeoutRef.current);
                sequenceTimeoutRef.current = null;
            }
            setAnnouncement(null); // 强制抹除屏幕中央文字
        }
        // [核心修复] 彻底砸碎这里的 else 兜底分支！
        // 动画结束回到 main 阶段时，绝不能擅自重新唤起 showPhaseHint！
        // 攻守提示必须严格只在回合初或攻守令牌真正转换时触发！
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.lastActionTimestamp]); // 注入动作时间戳依赖，实现动态实时打断！

    // 2 监听进攻权变化 (Attack Token Swap)
    useEffect(() => {
        if (isOpeningSequenceRef.current) return;

        // [关键] 深度比较：检查 player 或 enemy 的状态是否真的变了
        const prev = prevAttackTokenRef.current;
        const curr = game.attackToken;
        const hasChanged = prev.player !== curr.player || prev.enemy !== curr.enemy;

        if (hasChanged) {
            // [2026-10-03 莉莉子 · 进攻标识三层分离 ⑥] **只播"标识"、不再播"回合"**。
            //   病根：备战/侦察在**回合内**追加标识时，这里会调 showPhaseHint() 播「你的进攻回合」
            //   ⇒ 玩家把它数成一个**新回合** ⇒ 于是把"备战抢攻"报成
            //     「连续两个回合都是我的进攻回合 / 进攻标识没有轮换」（粉丝反馈的直接来源）。
            //   真正的"回合"播报只由上方 `round` 变化那条负责（第 N 回合 + showPhaseHint）。
            if (curr.player || curr.enemy) {
                const mine = !!curr.player;
                // [2026-10-03 莉莉子 · 文案口径] 副标题**只在真的"追加"时**才说"可再次进攻"。
                //   病根：`attackToken` 变化有**两种来源** ——
                //     ① 基准轮换（`calculateRoundStart` 写 `'normal'`）：这是本回合的**第一次**进攻权；
                //     ② 追加进攻权（`grantExtraAttackTurn` 写 `'rally'`，来自备战 / 侦察）。
                //   旧实现不区分，于是**每回合开头**也弹「EXTRA ATTACK · 本回合可再次进攻」——
                //   玩家本回合连一次都还没打，却被提示"可再次进攻"，与"回合"侧播报自相矛盾。
                //   ⚠️ 取值判据直接用标识本身（`'rally'` = 追加），**不新增任何状态**。
                const myToken = curr.player;
                const enemyToken = curr.enemy;
                const isExtra = mine ? myToken === 'rally' : enemyToken === 'rally';
                setMsg(
                    mine ? '获得进攻标识' : '对手获得进攻标识',
                    isExtra
                        ? (mine ? 'EXTRA ATTACK · 本回合可再次进攻' : 'EXTRA ATTACK')
                        : (mine ? '本回合的进攻权' : 'NORMAL'),
                    'phase_hint',
                    1500,
                );
            }
            prevAttackTokenRef.current = { ...curr };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.attackToken.player, game.attackToken.enemy]); // 拆分依赖项以确保更新

    // 3. 监听 TurnOwner 变化
    useEffect(() => {
        if (isOpeningSequenceRef.current) return;

        // [新增] 法术结算后 phase 从 animating 弹回 main 时不播报”你的回合”
        // 条件：已经播报过 + 刚从 animating 切回 main = 法术/战斗结算的副作用
        if (prevPhaseRef.current === 'animating' && game.phase === 'main' && hasAnnouncedTurnRef.current) {
            prevPhaseRef.current = game.phase;
            return;
        }

        // [核心修复] 高情商消音器：如果堆叠区有法术，或者天上挂着预提交法术，此时的控制权交替属于”法术响应博弈”，绝对不能播报回合！
        const isSpellBattling = game.spellStack.length > 0 || game.pendingSpell !== null;

        // [追加修复 BUG 2] 增加 game.consecutivePasses === 0 检查，防止法术结算后 AI Pass 导致抢麦！
        if (game.phase === 'main' && game.turnOwner === 'player' && !hasAnnouncedTurnRef.current && !isSpellBattling && game.consecutivePasses === 0) {
            setAnnouncement(prev => {
                if (prev && (prev.mainText.includes("进攻") || prev.type === 'round')) return prev;
                return {
                    id: Date.now().toString(),
                    mainText: "你的回合",
                    subText: "YOUR TURN",
                    type: 'phase_hint',
                    duration: 1500
                };
            });
            // [核心修复] 硬件级单向锁！本回合只要喊过一次”你的回合”，死死锁住，绝不重复播报！
            hasAnnouncedTurnRef.current = true;
        }

        prevPhaseRef.current = game.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.turnOwner, game.phase, game.spellStack.length, game.pendingSpell, game.consecutivePasses]); // [修改] 追加 consecutivePasses 依赖



    // [2026-08-20 莉莉子] 公开播报接口：供外部（格挡拒绝等）主动触发中央大字播报。
    // 用 ref 桥接 setMsg，保证 announce 引用稳定，避免监听组件反复重订阅。
    const setMsgRef = useRef(setMsg);
    setMsgRef.current = setMsg;
    const announce = useCallback((
        text: string,
        sub?: string,
        type: AnnouncementData['type'] = 'phase_hint',
        duration: number = 2000,
    ) => {
        setMsgRef.current(text, sub ?? '', type, duration);
    }, []);

    return { announcement, announce };

};