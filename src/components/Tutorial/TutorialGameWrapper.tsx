import React, { useMemo } from 'react';
import { GameSession } from '../GameSession';
import { TUTORIAL_STAGES } from '../../data/tutorialStages';
import { buildTutorialEncounter } from '../../logic/encounterBuilder';
import { eventBus, GameEvents } from '../../utils/eventBus'; // [新增] 音效

/**
 * 教程模式对局包装器
 *
 * 根据 stageId 读取考核关卡配置，
 * 调用构建器生成敌方卡组/英雄配置，
 * 然后无缝接入 GameSession 进行对局。
 */
interface TutorialGameWrapperProps {
    /** 考核关卡 ID */
    stageId: string;

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
    deck: playerCustomDeck,
    onExitGame,
    ...gameSessionProps
}) => {
    // 1. 读取关卡配置
    const stage = TUTORIAL_STAGES[stageId];

    // 2. 构建敌方配置
    const encounter = useMemo(
        () => buildTutorialEncounter(stageId),
        [stageId]
    );

    // 3. 确定玩家卡组：关卡指定固定牌组 → 优先使用，否则用玩家自组牌
    const playerDeck = useMemo(
        () => stage?.playerDeck ?? playerCustomDeck,
        [stage, playerCustomDeck]
    );

    // 4. 胜利/失败回调
    const handleVictory = () => {
        console.log(`[Tutorial] Stage "${stage?.name}" completed!`);
        onExitGame();
    };

    const handleDefeat = () => {
        console.log(`[Tutorial] Stage "${stage?.name}" failed.`);
        onExitGame();
    };

    // 安全检查：如果找不到关卡数据，显示错误状态
    if (!stage) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black text-white">
                <div className="text-center">
                    <div className="text-4xl mb-4">⚠️</div>
                    <div className="text-lg font-bold mb-2">未知的考核关卡</div>
                    <div className="text-sm text-gray-500 font-mono">ID: {stageId}</div>
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onExitGame(); }} // [新增] 音效
                        className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition-colors"
                    >
                        返回
                    </button>
                </div>
            </div>
        );
    }

    return (
        <GameSession
            {...gameSessionProps}
            deck={playerDeck}
            key={stageId}
            enemyDeck={encounter.deck}
            enemyHeroConfig={encounter.heroConfig}
            onVictory={handleVictory}
            onDefeat={handleDefeat}
            onExit={onExitGame}
        />
    );
};
