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
import { GachaScreen } from './components/GachaScreen';
import { SettingsModal } from './components/SettingsModal';
import { eventBus, GameEvents } from './utils/eventBus';

type AppState = 'title' | 'system_loading' | 'lobby' | 'mode_select' | 'deck_builder' | 'loading' | 'game' | 'gacha';

export default function App() {
  const [appState, setAppState] = useState<AppState>('title');
  const [pendingAppState, setPendingAppState] = useState<AppState | null>(null);
  const [lobbyVideoIndex, setLobbyVideoIndex] = useState(0);
  const userSystem = useUserSystem();
  const [gameId, setGameId] = useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);


  const { playBgm, stopBgm, setBgmVolume } = useAudio();
  const { setSfxVolume } = useSfx();
  const {
      currentMovie, isVisible, isLooping,
      playTitleMovie, playLevelUpMovie, playVictoryMovie, stopMovie,isImmediate,
      handleVideoEnded,playHallMovie,setMovieVolume
  } = useMovie();

  // --- 初始化同步音量 ---
  useEffect(() => {
      if (userSystem.isReady && userSystem.settings) {
          const v = userSystem.settings.volume;
          setBgmVolume(v.bgm);
          setSfxVolume(v.sfx);
          setMovieVolume(v.movie);
          setTimeout(() => {
             eventBus.emit(GameEvents.SET_VOICE_VOLUME, v.voice);
          }, 500);
      }
  }, [userSystem.isReady]);

  // --- 音量变更处理 ---
  const handleVolumeChange = (type: 'bgm' | 'sfx' | 'voice' | 'movie', value: number) => {
      if (type === 'bgm') setBgmVolume(value);
      if (type === 'sfx') setSfxVolume(value);
      if (type === 'movie') setMovieVolume(value);
      if (type === 'voice') {
          eventBus.emit(GameEvents.SET_VOICE_VOLUME, value);
      }

      userSystem.updateSettings({
          volume: {
              ...userSystem.settings.volume,
              [type]: value
          }
      });
  };

  // --- 状态流转控制器 (The Chain of Command) ---

  // 1. [Title -> SystemLoading -> Lobby]
  const handleTitleStart = () => {
      stopBgm();
      stopMovie();
      setAppState('system_loading');
  };

  // 2. [SystemLoading -> Target]
  const handleSystemLoadingComplete = () => {
      playBgm('default');

      // [修正] 检查是否有挂起的目标状态
      if (pendingAppState) {
          setAppState(pendingAppState);
          setPendingAppState(null);
          // [关键] 如果去备战，不要播放大厅视频，保持 isVisible=false (透明)
      } else {
          playHallMovie(); // [关键] 只有去大厅才播放背景视频
          setAppState('lobby');
      }
  };

  // 3. [Lobby -> ModeSelect]
  // [恢复] 核心逻辑：从大厅进入模式选择
  const handleLobbyStartBattle = () => {
      setAppState('mode_select');
  };

  // [新增] 大厅 -> 抽卡 (Lobby -> Gacha)
  const handleLobbyGacha = () => {
      // 抽卡也算一种“场景切换”，可以走 Loading 也可以不走
      // 为了流畅体验，这里直接切，因为 GachaScreen 加载很快
    stopBgm();
    setPendingAppState('gacha');
    setAppState('system_loading');
    stopMovie();
  };

  // 4. [ModeSelect -> DeckBuilder]
  const handlePvESelect = () => {
    stopMovie();
    stopBgm();
    // 注意：这里不需要 stopBgm，因为进入 system_loading 后，
    // handleSystemLoadingComplete 会根据目标状态自动切歌
    setPendingAppState('deck_builder');
    setAppState('system_loading');
  };

  // --- [新增] 返回导航逻辑 ---

  // 备战页返回 -> 模式选择
  const handleBackToModeSelect = () => {
      playBgm('default');
      playHallMovie(); // 重新播放大厅视频
      setAppState('mode_select');
  };

  // 模式选择返回 -> 大厅
  const handleBackToLobby = () => {
      playHallMovie(); // 重新播放大厅视频
      setAppState('lobby');
  };

  // 5. [DeckBuilder -> Loading]
  // 构筑完成点击 "START GAME" 触发
  const handleStartGame = ( ) => {
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
    stopMovie();
    stopBgm();
    setPendingAppState('lobby');   // 告诉系统：加载完去大厅
    setAppState('system_loading'); // 立即进入加载界面
  };

  // 背景视频切换
  const handleSwitchLobbyVideo = () => {
      if (playHallMovie) {
          const nextIndex = lobbyVideoIndex + 1;
          const actualIndex = playHallMovie(nextIndex);
          setLobbyVideoIndex(actualIndex);
      }
  };
  // 全局 ESC 监听
  useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && !isSettingsOpen) {
              eventBus.emit(GameEvents.UI_CLICK);
              setIsSettingsOpen(true);
          }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isSettingsOpen]);


  useEffect(() => {
    console.log(`[App] State changed to: ${appState}`);

    if (appState === 'title') {
      playBgm('title');
      playTitleMovie();
    }
    else if (appState === 'lobby') {
      // 大厅：播放默认 BGM
      playBgm('default');
      const idx = playHallMovie();
      setLobbyVideoIndex(idx);
    }
    else if (appState === 'gacha') {
      // [新增] 抽卡界面：播放抽卡 BGM，背景沿用大厅视频
      playBgm('gacha');
      // 确保视频继续播放（如果在播放的话）
      if (!isVisible) playHallMovie();
    }
    else if (appState === 'mode_select') {
       playBgm('default');
       if (!isVisible) {
           playHallMovie(lobbyVideoIndex);
       }
    }
    else if (appState === 'deck_builder') {
        // [新增] 备战界面：播放备战 BGM
        playBgm('deck_builder');
        stopMovie(); // 备战界面通常不需要视频背景，或者看您设计
    }
    else if (appState === 'game') {
        // 游戏内：BGM 由 GameSession 内部触发 playBgm('battle')，这里不干涉
        // 这样每次进入 GameSession 都会触发它的 useEffect，从而重新随机
        // [新增] 进入游戏时，再次广播一下当前的语音音量，确保 GameSession 里的 useVoice 能收到
        if (userSystem.isReady && userSystem.settings) {
            setTimeout(() => {
                eventBus.emit(GameEvents.SET_VOICE_VOLUME, userSystem.settings.volume.voice);
            }, 500);
        }
    }
    else {
      // system_loading 等其他状态
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
      ) as string[];
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
            // [修复] 使用新定义的函数名
            onTitleStartClick={handleTitleStart}
            mode={appState === 'title' ? 'title' : 'mode_select'}
            onPvESelect={handlePvESelect}
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
                  onStartBattle={handleLobbyStartBattle}
                  onSwitchVideo={handleSwitchLobbyVideo}
                  onGachaClick={handleLobbyGacha}
                  onOpenSettings={() => setIsSettingsOpen(true)}
              />
      )}

      {/* [新增] 抽卡界面 */}
      {appState === 'gacha' && (
          <GachaScreen
              userSystem={userSystem}
              onBack={handleBackToLobby}
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
      {/* 全局设置面板 */}
          <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              volumes={userSystem.settings.volume}
              onVolumeChange={handleVolumeChange}
          />


      <VideoPlayer
          src={currentMovie}
          // 简化 isVisible 逻辑：只要 useMovie 说是 true，就是 true
          isVisible={isVisible}
          isLoop={isLooping}
          onEnded={handleVideoEnded}
          zIndex={(appState === 'title' || appState === 'lobby' || appState === 'mode_select' || appState === 'gacha') ? 0 : 500}
          noFade={isImmediate}
      />
    </div>
  );
}