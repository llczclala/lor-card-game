import React, { useMemo } from 'react';
import { GameSession } from '../GameSession';
import { buildStandardEncounter } from '../../logic/encounterBuilder';

// [修复] 动态提取 GameSession 的 Props 类型。这样就算原文件忘记 export，我们也能拿到它的类型定义！
type GameSessionProps = React.ComponentProps<typeof GameSession>;

// Wrapper 接收 App 传来的通用 Props (如音乐控制、退出回调、玩家卡组)
// 但它负责拦截并注入"敌方配置"
interface StandardGameWrapperProps extends Omit<GameSessionProps, 'enemyDeck' | 'enemyHeroConfig' | 'onVictory' | 'onDefeat'> {
    onExitGame: () => void;
}

export const StandardGameWrapper: React.FC<StandardGameWrapperProps> = (props) => {

    // 1. 调用大厨 (EncounterBuilder) 生成敌方配置
    // 使用 useMemo 确保只在组件挂载时生成一次 (除非还要实现"再来一局")
    const encounter = useMemo(() => buildStandardEncounter(), []);

    // 2. 定义胜利逻辑 (标准 PVE)
    const handleVictory = () => {
        console.log(`[StandardMode] Victory against ${encounter.heroConfig.customName}!`);
        // 可以在这里插入结算逻辑 (如: +50 通用银)
        props.onExitGame();
    };

    // 3. 定义失败逻辑
    const handleDefeat = () => {
        console.log("[StandardMode] Defeat.");
        props.onExitGame();
    };

    return (
        <GameSession
            {...props} // 透传基础 Props (playBgm, stopMovie, deck 等)

            // --- 注入标准模式配置 ---
            enemyDeck={encounter.deck}
            enemyHeroConfig={encounter.heroConfig}

            // --- 规则配置 ---
            // [修复] 移除底层组件未定义的预留属性 aiType
            disableMulligan={false} // 允许换牌

            // --- 回调注入 ---
            onVictory={handleVictory}
            onDefeat={handleDefeat}

            // 保持兼容 (虽然 GameSession 内部可能不再直接调用 onExit，但为了类型安全保留)
            onExit={props.onExitGame}
        />
    );
};