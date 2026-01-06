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


    // 辅助：设置公告
    const setMsg = (text: string, sub: string, type: AnnouncementData['type'], duration: number = 0) => {
        const id = Date.now().toString();
        setAnnouncement({ id, mainText: text, subText: sub, type, duration });

        if (duration > 0) {
            setTimeout(() => {
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
            setTimeout(() => {
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
             setTimeout(() => {
                 setMsg("第一回合", "ROUND 1", 'round', 1500);
                 drawCards(4);
                 setTimeout(() => {
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
    // 1. Phase 变化清除文字 (保持不变)
    useEffect(() => {
        if (game.phase !== 'main') {
            setAnnouncement(null);
        } else {
            if (!isOpeningSequenceRef.current && !announcement) {
                showPhaseHint();
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase]);

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