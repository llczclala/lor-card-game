import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GameSession } from '../GameSession';
import { TUTORIAL_STAGES } from '../../data/tutorialStages';
import { BASIC_TUTORIAL_SCRIPT, TUTORIAL_SCRIPTS } from '../../data/tutorialScript';
import { buildTutorialEncounter } from '../../logic/encounterBuilder';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { markStageCompleted } from '../../utils/tutorialProgress';
import { TutorialController } from './TutorialController';

/**
 * 教程模式对局包装器
 *
 * 负责：
 *  - 根据 stageId 读取考核关卡配置
 *  - 调用构建器生成敌方配置
 *  - 无缝接入 GameSession 进行对局
 *  - 挂载 TutorialController 覆盖层（不侵入 GameSession）
 *
 *  架构说明：
 *    TutorialGameWrapper 是教程模式唯一的"集成点"。
 *    它同时渲染 GameSession（游戏本体）和 TutorialController（教程覆盖层），
 *    两者通过 eventBus 通信，互不侵入对方代码。
 */

interface TutorialGameWrapperProps {
    /** 考核关卡 ID */
    stageId: string;

    /** 当前用户 ID（用于区分账号的进度存储） */
    userId?: string;

    /** 玩家原始卡组（当关卡未指定固定卡组时使用） */
    deck: string[];

    /** 通用 GameSession 回调 */
    onExit: () => void;
    onExitGame: () => void;
    playBgm: (type: 'title' | 'default' | 'battle' | 'victory' | 'defeat') => void;
    playLevelUpMovie: (heroKey: string, onEnd?: () => void) => void;
    playVictoryMovie: (heroKeys: string[], onEnd?: () => void) => void;
    stopMovie: (immediate?: boolean) => void;
    deskIndex: number;
    cardBackIndex?: number;
}

export const TutorialGameWrapper: React.FC<TutorialGameWrapperProps> = ({
    stageId,
    userId,
    deck: playerCustomDeck,
    onExitGame,
    ...gameSessionProps
}) => {
    // ─── 1. 读取关卡配置 ───
    const stage = TUTORIAL_STAGES[stageId];

    // ─── 2. 构建敌方配置 ───
    const encounter = useMemo(
        () => buildTutorialEncounter(stageId),
        [stageId]
    );

    // ─── 3. 确定玩家卡组 ───
    const playerDeck = useMemo(
        () => stage?.playerDeck ?? playerCustomDeck,
        [stage, playerCustomDeck]
    );

    // ─── 4. 胜利/失败回调 ───
    const handleVictory = () => {
        console.log(`[Tutorial] Stage "${stage?.name}" completed!`);
        // [新增] 保存完成进度到 localStorage（带 userId 区分账号）
        markStageCompleted(stageId, userId);
        onExitGame();
    };

    const handleDefeat = () => {
        console.log(`[Tutorial] Stage "${stage?.name}" failed.`);
        onExitGame();
    };

    // ─── 5. 教程剧本 ───
    const tutorialScript = useMemo(() => {
        // 根据 stageId 匹配剧本
        const script = Object.values(TUTORIAL_SCRIPTS).find(s => s.stageId === stageId);
        return script || BASIC_TUTORIAL_SCRIPT;
    }, [stageId]);

    // ★ 从剧本中提取初始战场配置，传给游戏引擎布置开局
    const tutorialInit = useMemo(() => {
        const init = tutorialScript?.initialState;
        if (!init) return undefined;
        return {
            playerField: init.playerField,
            enemyField: init.enemyField,
            playerBench: init.playerBench,
            playerHand: init.playerHand,
            playerCrystalHp: init.playerCrystalHp,
            enemyCrystalHp: init.enemyCrystalHp,
            playerMana: init.playerMana,
            playerMaxMana: init.playerMaxMana,
            enemyMana: init.enemyMana,
            enemyMaxMana: init.enemyMaxMana,
        };
    }, [tutorialScript]);

    // ─── 6. 教程完成 ───
    const handleTutorialComplete = useCallback(() => {
        console.log('[Tutorial] 教程演出全部完成，进入自由对战');
        // 教程演出结束后，游戏继续，玩家可以自由操作
    }, []);

    // ─── 7. 自动行为桥接 ───
    const handleAutoAction = useCallback((action: string, params: Record<string, unknown>) => {
        console.log(`[Tutorial] 自动行为: ${action}`, params);
        // 🔧 TODO: 后续可根据 action 类型桥接到 GameSession
        // 例如 'enemy_attack' → 触发敌人进攻回合
        // 当前先用 eventBus 广播，由外部监听
        eventBus.emit('TUTORIAL_AUTO_ACTION' as any, { action, params });
    }, []);

    // ─── 8. 法术开场秀（在教程对局开始前演出暗箭连发） ───
    const [spellShowDone, setSpellShowDone] = useState(false);

    useEffect(() => {
        // 等 GameSession 挂载 + 布局完成后再触发
        const timer = setTimeout(() => {
            console.log('[Tutorial] 🎬 法术开场秀开始！');
            eventBus.emit('TUTORIAL_AUTO_ACTION', {
                action: 'spell_show',
                params: {
                    phases: [
                        { cardKey: 'hidden_arrow', owner: 'enemy', targetKey: 'lyfe', count: 2 },
                        { cardKey: 'hidden_arrow', owner: 'player', targetKey: 'titan_gaimer', count: 4 }
                    ]
                }
            });
        }, 800);

        const onComplete = () => {
            console.log('[Tutorial] ✅ 法术开场秀完成！');
            setSpellShowDone(true);
        };
        eventBus.on('TUTORIAL_SPELL_SHOW_COMPLETE', onComplete);

        return () => {
            clearTimeout(timer);
            eventBus.off('TUTORIAL_SPELL_SHOW_COMPLETE', onComplete);
        };
    }, []);

    // ─── 安全检查 ───
    if (!stage) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black text-white">
                <div className="text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <div className="text-lg font-bold mb-2">未知的考核关卡</div>
                    <div className="text-sm text-gray-500 font-mono">ID: {stageId}</div>
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onExitGame(); }}
                        className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
                    >
                        返回
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full">
            {/* 游戏本体 — 完全不变 */}
            <GameSession
                {...gameSessionProps}
                deck={playerDeck}
                key={stageId}
                enemyDeck={encounter.deck}
                enemyHeroConfig={encounter.heroConfig}
                onVictory={handleVictory}
                onDefeat={handleDefeat}
                onExit={onExitGame}
                disableMulligan={true}
                tutorialInit={tutorialInit}
                firstAttacker="enemy"
                disableAI={true}
                turnTimer={999}
            />

            {/* 教程覆盖层 — 法术秀结束后才展示 */}
            {spellShowDone && (
                <TutorialController
                    script={tutorialScript}
                    onComplete={handleTutorialComplete}
                    onAutoAction={handleAutoAction}
                />
            )}
        </div>
    );
};
