import React, { useState, useEffect } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { DeckBuilder } from './components/DeckBuilder';
import { GameSession } from './components/GameSession';
import { useAudio } from './hooks/useAudio';
import { useSfx } from './hooks/useSfx';
import { useMovie } from './hooks/useMovie';
import { VideoPlayer } from './components/VideoPlayer';
import { FullScreenToggle } from './components/FullScreenToggle';
import { LoadingScreen } from './components/LoadingScreen';
import { CARD_DB } from './data/cards';
import { useUserSystem } from './hooks/useUserSystem';
import { SystemLoadingScreen } from './components/SystemLoadingScreen';
import { GameLobby } from './components/GameLobby';

type AppState = 'title' | 'system_loading' | 'lobby' | 'mode_select' | 'deck_builder' | 'loading' | 'game';

export default function App() {
  const [appState, setAppState] = useState<AppState>('title');
  const [loadingTarget, setLoadingTarget] = useState<AppState>('lobby');
  const [lobbyVideoIndex, setLobbyVideoIndex] = useState(0);
  const userSystem = useUserSystem();
  const [gameId, setGameId] = useState(0);
  const { playBgm, stopBgm } = useAudio();
  useSfx();

  const {
      currentMovie, isVisible, isLooping,
      playTitleMovie, playLevelUpMovie, playVictoryMovie, stopMovie,isImmediate,
      handleVideoEnded,playHallMovie
  } = useMovie();

  // --- 状态流转控制器 (The Chain of Command) ---

  // 1. [Title -> SystemLoading -> Lobby]
  const handleTitleStart = () => {
      stopBgm();
      stopMovie();
      setLoadingTarget('lobby'); // 设定目标为大厅
      setAppState('system_loading');
  };

  // 2. [SystemLoading -> Target]
  const handleSystemLoadingComplete = () => {
      // 根据之前设定的目标跳转
      setAppState(loadingTarget);
  };

  // 3. [Lobby -> ModeSelect]
  // 大厅点击 "BATTLE" 触发
  const handleLobbyStartBattle = () => {
      setAppState('mode_select');
  };

  // 4. [ModeSelect -> SystemLoading -> DeckBuilder]
  // [修改] 现在点击 PvE 会先进入加载页
  const handlePvESelect = () => {
    stopMovie(); // 停止大厅视频
    stopBgm();   // 停止大厅音乐 (或者你想保留也可以，看设计)
    setLoadingTarget('deck_builder'); // 设定目标为备战
    setAppState('system_loading');    // 进入加载
  };

  // --- [新增] 返回导航逻辑 ---

  // 备战页返回 -> 模式选择
  const handleBackToModeSelect = () => {
      // 恢复播放大厅 BGM 和视频 (因为 ModeSelect 共享大厅资源)
      playBgm('default');
      // 如果之前停止了视频，这里可能需要重新 playHallMovie，useEffect 会处理
      setAppState('mode_select');
  };

  // 模式选择返回 -> 大厅
  const handleBackToLobby = () => {
      setAppState('lobby');
  };

  // 5. [DeckBuilder -> Loading]
  // 构筑完成点击 "START GAME" 触发
  const handleStartGame = (deck: string[]) => {
    setAppState('loading');
    stopMovie();
  };

  // 6. [Loading -> Game]
  // VS动画结束触发
  const handleLoadingComplete = () => {
    setAppState('game');
    setGameId(prev => prev + 1);
  };

  // 7. [Game -> Title] (Exit)
  const handleExitGame = () => {
    setAppState('title');
    // useEffect 会处理 BGM/Video 的重置
  };

  // 大厅切换视频逻辑
  const handleSwitchLobbyVideo = () => {
      if (playHallMovie) {
          const nextIndex = lobbyVideoIndex + 1;
          const actualIndex = playHallMovie(nextIndex);
          setLobbyVideoIndex(actualIndex);
      }
  };

  useEffect(() => {
    if (appState === 'title') {
      playBgm('title');
      playTitleMovie();
    }
    // [新增] 大厅状态的处理
    else if (appState === 'lobby') {
      playBgm('default'); // 播放大厅/备战音乐
      // 首次进入大厅，随机播放一个视频
      const idx = playHallMovie();
      setLobbyVideoIndex(idx);
    }
    // [修改] 模式选择状态：保持播放
    else if (appState === 'mode_select') {
       // 确保 BGM 是 default
       playBgm('default');
       // 如果视频断了（比如从构筑退回来），恢复播放当前的大厅视频
       if (!isVisible) {
           playHallMovie(lobbyVideoIndex);
       }
    }
    else {
      // 其他状态 (system_loading 会自己处理，这里只管离开 lobby/title 体系的)
      if (appState !== 'system_loading') {
          stopMovie();
      }
    }
  }, [appState]);

  // 逻辑：从 userSystem.activeDeck 中读取卡牌列表 -> 找第一个英雄 -> 或第一个单位 -> 或默认 'lyfe'
  const getDisplayHero = (): string => {
    if (!userSystem.activeDeck) return 'lyfe';
    const deckKeys = Object.keys(userSystem.activeDeck.cards);
    const championKey = deckKeys.find(key => CARD_DB[key]?.isChampion);
    if (championKey) return championKey;
    const unitKey = deckKeys.find(key => CARD_DB[key]?.type.includes('unit'));
    if (unitKey) return unitKey;
    return 'lyfe';
  };

  // [新增] 转换 activeDeck 为字符串数组 (供 GameSession 使用)
  const currentPlayerDeckList = React.useMemo(() => {
      if (!userSystem.activeDeck) return [];
      return Object.entries(userSystem.activeDeck.cards).flatMap(([key, count]) =>
          Array(count).fill(key)
      );
  }, [userSystem.activeDeck]);


  // [新增] 如果用户数据还没加载好，显示简单的加载中
  if (!userSystem.isReady) {
      return <div className="w-full h-screen bg-black flex items-center justify-center text-white font-mono">LOADING PROFILE...</div>;
  }


  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden">
      <FullScreenToggle />

      {/* 1. 标题体系 */}
      {(appState === 'title' || appState === 'mode_select') && (
        <TitleScreen
            onTitleStartClick={handleTitleStart} // [Link 1]
            playBgm={playBgm}
            mode={appState === 'title' ? 'title' : 'mode_select'}
            onPvESelect={handlePvESelect}       // [Link 4]
            onEnterModeSelect={handlePvESelect}
            onBack={handleBackToLobby}
            userSystem={userSystem}
        />
      )}

      {/* 2. 系统加载 */}
      {appState === 'system_loading' && (
          <SystemLoadingScreen
              onComplete={handleSystemLoadingComplete} // [Link 2]
          />
      )}

      {/* 3. 游戏大厅 */}
      {appState === 'lobby' && (
          <GameLobby
              userSystem={userSystem}
              onStartBattle={handleLobbyStartBattle} // [Link 3]
              onSwitchVideo={handleSwitchLobbyVideo}
              onOpenSettings={() => console.log("Open Settings")}
          />
      )}

      {/* 4. 备战 */}
      {appState === 'deck_builder' && (
        <DeckBuilder
            onStartGame={handleStartGame} // [Link 5]
            userSystem={userSystem}
            onBack={handleBackToModeSelect}
        />
      )}

      {/* 5. 战斗加载 */}
      {appState === 'loading' && (
          <LoadingScreen
              heroKey={getDisplayHero()}
              onComplete={handleLoadingComplete} // [Link 6]
              onMatchFound={stopBgm}
          />
      )}

      {/* 6. 战斗 */}
      {appState === 'game' && (
        <GameSession
            key={gameId}
            deck={currentPlayerDeckList}
            onExit={handleExitGame} // [Link 7]
            playBgm={playBgm}
            playLevelUpMovie={playLevelUpMovie}
            playVictoryMovie={playVictoryMovie}
            stopMovie={stopMovie}
            deskIndex={userSystem.settings.customization.currentDeskIndex}
            cardBackIndex={userSystem.settings.customization.currentCardBackIndex}
        />
      )}

      <VideoPlayer
          src={currentMovie}
          isVisible={isVisible}
          isLoop={isLooping}
          onEnded={handleVideoEnded}
          zIndex={(appState === 'title' || appState === 'lobby' || appState === 'mode_select') ? 0 : 500}
          muted={appState === 'title' || appState === 'lobby' || appState === 'mode_select'}
          noFade={isImmediate}
      />
    </div>
  );
}