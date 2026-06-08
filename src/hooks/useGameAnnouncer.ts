import { useState, useEffect, useRef } from 'react';
import type { GameState } from '../types';
import type { AnnouncementData } from '../components/GameAnnouncement';

interface UseGameAnnouncerProps {
    game: GameState;
    drawCards: (count: number) => void;
    // [新增] 接收换牌阶段状态，用于判断何时开始第一回合
    isMulliganPhase: boolean;
}

export const useGameAnnouncer = ({ game, drawCards, isMulliganPhase }: UseGameAnnouncerProps) => {
    const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);

    // 记录状态，用于逻辑判断
    const prevRoundRef = useRef(0);
    // 标记是否处于"开局流程中" (防止开局时直接跳到 Phase Hint)
    const isOpeningSequenceRef = useRef(true);

    // [新增] 记录上一次的进攻权归属，防止重复播报
    const prevAttackTokenRef = useRef<{ player: string | null, enemy: string | null }>({ player: null, enemy: null });


    // [新增] 记录当前回合是否已经播报过"你的回合"
    const hasAnnouncedTurnRef = useRef(false);
    // [新增] 用于打断机制的定时器缓存引用，确保能精准捕获并杀死悬空定时器
    const announcerTimeoutRef = useRef<any>(null);
    const sequenceTimeoutRef = useRef<any>(null);


    // 辅助：设置公告
    const setMsg = (text: string, sub: string, type: AnnouncementData['type'], duration: number = 0) => {
        const id = Date.now().toString();
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

        // 优先显示玩家的进攻权
        const isMyTurn = !!game.attackToken.player;
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
            }, 2000);
        }
        prevRoundRef.current = game.round;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.round]);


    // 监听换牌结束
    useEffect(() => {
        if (!isMulliganPhase && game.round === 1) {
             isOpeningSequenceRef.current = true;
             hasAnnouncedTurnRef.current = false;

             if (sequenceTimeoutRef.current) clearTimeout(sequenceTimeoutRef.current);
             sequenceTimeoutRef.current = setTimeout(() => {
                 setMsg("第一回合", "ROUND 1", 'round', 1500);
                 drawCards(4);

                 // 继续用 sequenceTimeoutRef 接管更深层的开局令牌分发时机
                 sequenceTimeoutRef.current = setTimeout(() => {
                     isOpeningSequenceRef.current = false;
                     showPhaseHint();
                     // [修正] 更新 ref 为对象副本
                     prevAttackTokenRef.current = { ...game.attackToken };
                 }, 5500);
             }, 800);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMulliganPhase]);


    // --- 监听状态以清除/更新持久提示 ---
    // 1. [核心重构] Phase 变化与玩家动作联合监听（硬核打断机制）
    useEffect(() => {
        // 只要脱离了静态的主阶段（进入动画 animating、战斗阶段、施法瞄准等）
        // 或者检测到任何一方执行了动作（lastActionTimestamp 刷新），立刻无条件执行最高级别打断！
        if (game.phase !== 'main' || game.phase === 'animating') {
            if (announcerTimeoutRef.current) clearTimeout(announcerTimeoutRef.current);
            if (sequenceTimeoutRef.current) clearTimeout(sequenceTimeoutRef.current);
            setAnnouncement(null); // 强制抹除屏幕中央文字
        } else {
            if (!isOpeningSequenceRef.current && !announcement) {
                showPhaseHint();
            }
        }
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
            // 如果变成了有 Token 的状态，则播报
            if (curr.player || curr.enemy) {
                showPhaseHint();
            }
            prevAttackTokenRef.current = { ...curr };
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.attackToken.player, game.attackToken.enemy]); // 拆分依赖项以确保更新

    // 3. 监听 TurnOwner 变化 (保持不变)
    useEffect(() => {
        if (isOpeningSequenceRef.current) return;
        if (game.phase === 'main' && game.turnOwner === 'player' && !hasAnnouncedTurnRef.current) {
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
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.turnOwner, game.phase]);



    return announcement;

};