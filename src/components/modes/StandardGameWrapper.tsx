import React from 'react';
import { GameSession } from '../GameSession';

// [修复] 动态提取 GameSession 的 Props 类型。这样就算原文件忘记 export，我们也能拿到它的类型定义！
type GameSessionProps = React.ComponentProps<typeof GameSession>;

// Wrapper 接收 App 传来的通用 Props (如音乐控制、退出回调、玩家卡组)
interface StandardGameWrapperProps extends Omit<GameSessionProps, 'enemyDeck' | 'enemyHeroConfig' | 'onVictory' | 'onDefeat'> {
    onExitGame: () => void;
    encounter: any; // [新增] 接收 App 层提前传来的已敲定敌人配置
}

export const StandardGameWrapper: React.FC<StandardGameWrapperProps> = (props) => {


    // 2. 定义胜利逻辑 (标准 PVE)
    const handleVictory = () => {
        console.log(`[StandardMode] Victory against ${props.encounter.heroConfig.customName}!`);
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
            {...props} // 透传通用属性
            enemyDeck={props.encounter.deck}
            enemyHeroConfig={props.encounter.heroConfig}
            aiPersonality={props.encounter.aiPersonality ?? 'balanced'} // [2026-08-06] 透传流派性格
            onVictory={handleVictory}
            onDefeat={handleDefeat}
        />
    );
};