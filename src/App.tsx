import React, { useState, useEffect,useRef } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { SplashScreen } from './components/SplashScreen'; // [哨兵] 免责启动画面
import { ModeSelectScreen } from './components/ModeSelectScreen'; // [新增]
import { DeckBuilder } from './components/DeckBuilder';
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
import { ShopScreen } from './components/ShopScreen'; // [核心新增] 引入商店组件
import { MissionPanel } from './components/MissionUI'; // [核心新增] 引入军需面板
import { useMissionSystem } from './hooks/useMissionSystem'; // [核心新增] 引入军功大脑
import { SettingsModal } from './components/SettingsModal';
import { eventBus, GameEvents } from './utils/eventBus';
import { ScaleWrapper } from './components/ScaleWrapper'; // [新增]
import { StandardGameWrapper } from './components/modes/StandardGameWrapper';
import { TutorialModeSelect } from './components/Tutorial/TutorialModeSelect';
import { StageSelectScreen } from './components/Tutorial/StageSelectScreen';
import { TutorialGameWrapper } from './components/Tutorial/TutorialGameWrapper';
import { DeckPreviewModal } from './components/Tutorial/DeckPreviewModal';
import type { BgConfig } from './components/GameLobby'; // [修复] 加入 type 关键字，解决纯类型导入报错
import type { ExamCategoryId } from './data/tutorialStages';
import { TUTORIAL_STAGES } from './data/tutorialStages'; // [新增]
import { ENEMY_ARCHETYPES } from './data/enemies/archetypes'; // [新增]
import { buildStandardEncounter } from './logic/encounterBuilder'; // [新增] 引入标准模式敌人生成器
import { getHallBgmByIndex } from './data/movieData'; // [新增] 引入大厅音画联动雷达
import { motion, AnimatePresence } from 'framer-motion';

// [核心修复] AppState 增加 'shop' 状态
type AppState = 'splash' | 'title' | 'system_loading' | 'lobby' | 'mode_select' | 'deck_builder' | 'loading' | 'game' | 'gacha'
    | 'tutorial_mode_select' | 'tutorial_stage_select' | 'tutorial_game' | 'shop';
export default function App() {
  const [appState, setAppState] = useState<AppState>('splash'); // [哨兵] 初始状态改为 splash
  const [pendingAppState, setPendingAppState] = useState<AppState | null>(null);
  const [lobbyVideoIndex, setLobbyVideoIndex] = useState(0);
  const userSystem = useUserSystem();
  const registerTime = React.useMemo(() => {
    if (userSystem.profile?.createdAt) {
      return new Date(userSystem.profile.createdAt).toISOString().split('T')[0];
    }
    return undefined;
  }, [userSystem.profile?.createdAt]);
  const missionSystem = useMissionSystem(userSystem.userId, registerTime); // [核心挂载] 实例化军功大脑
  const [isMissionOpen, setIsMissionOpen] = useState(false); // [新增] 军需面板开关状态
  const [gameId, setGameId] = useState(0);
  const [deckBuilderSource, setDeckBuilderSource] = useState<'lobby' | 'mode_select'>('mode_select');
  const [tutorialCategoryId, setTutorialCategoryId] = useState<ExamCategoryId | null>(null);
  const [tutorialStageId, setTutorialStageId] = useState<string | null>(null);
  const [previewStageId, setPreviewStageId] = useState<string | null>(null);
  const [standardEncounter, setStandardEncounter] = useState<any>(null); // [新增] 提前缓存标准模式的敌人数据

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- [新增] 全局自定义背景状态 (方案A 核心) ---
  const [customBg, setCustomBg] = useState<BgConfig | null>(null);
  const customBgRef = useRef<BgConfig | null>(null); // 使用 ref 以免在 useEffect 中引起闭包过时或重复触发

  useEffect(() => {
      const saved = localStorage.getItem('sbr_lobby_bg');
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              setCustomBg(parsed);
              customBgRef.current = parsed;
          } catch (e) { console.error("Failed to parse saved bg", e); }
      }
  }, []);

  // 暴露给 GameLobby 的更新回调
  const handleUpdateCustomBg = (bg: BgConfig | null) => {
      setCustomBg(bg);
      customBgRef.current = bg;
      if (bg) {
          localStorage.setItem('sbr_lobby_bg', JSON.stringify(bg));
          stopMovie(); // [性能优化] 如果设置了自定义背景，彻底停用底层默认视频解码
          // [新增] 智能切轨：如果自定义背景是视频，切入专属音轨；如果是静态图片，兜底采用 default
          playBgm(bg.type === 'movie' ? getHallBgmByIndex(bg.index) : 'default');
      } else {
          localStorage.removeItem('sbr_lobby_bg');
          if (appState === 'lobby' || appState === 'mode_select' || appState === 'gacha') {
              playHallMovie(lobbyVideoIndex); // 恢复底层播放
              // [新增] 恢复大厅轮播视频的专属 BGM
              playBgm(getHallBgmByIndex(lobbyVideoIndex));
          }
      }
  };
  // ------------------------------------

  const { playBgm, stopBgm, setBgmVolume } = useAudio();
  const { setSfxVolume } = useSfx();
  const {
      currentMovie, isVisible, isLooping,
      playTitleMovie, playLevelUpMovie, playVictoryMovie, stopMovie,isImmediate,
      handleVideoEnded,playHallMovie,setMovieVolume,
      prepareLevelUpMovie, prepareVictoryMovie
  // [核心重构] 将玩家的画质设置作为神经信号注入调度大脑（默认兜底 1k）
  } = useMovie((userSystem.settings as any)?.videoResolution || '1k');

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

  // [哨兵] Splash -> Title
  const handleSplashComplete = () => {
    setAppState('title');
  };

  // 1. [Title -> SystemLoading -> Lobby]
  const handleTitleStart = () => {
      stopBgm();
      stopMovie();
      setAppState('system_loading');
  };

  // 2. [SystemLoading -> Target]
  const handleSystemLoadingComplete = () => {
      playBgm('default');

      if (pendingAppState) {
          setAppState(pendingAppState);
          setPendingAppState(null);
      } else {
          if (!customBgRef.current) playHallMovie(); // [修改] 仅当无自定义背景时，才播放底层视频
          setAppState('lobby');
      }
  };

  // 3. [Lobby -> ModeSelect]
  const handleLobbyStartBattle = () => {
      setAppState('mode_select');
  };

  // [新增] 大厅 -> 抽卡 (Lobby -> Gacha)
  const handleLobbyGacha = () => {
    stopBgm();
    setPendingAppState('gacha');
    setAppState('system_loading');
    stopMovie();
  };

  // [核心新增] 大厅 -> 商店 (Lobby -> Shop)
  const handleOpenShop = () => {
      stopBgm();
      setPendingAppState('shop');
      setAppState('system_loading');
      stopMovie();
  };

  // 4. [ModeSelect -> DeckBuilder]
  const handlePvESelect = () => {
    stopMovie();
    stopBgm();
    setDeckBuilderSource('mode_select');
    setPendingAppState('deck_builder');
    setAppState('system_loading');
  };

  // [新增] 模式选择 -> 教程分类选择
  const handleTutorialSelect = () => {
    setAppState('tutorial_mode_select');
  };

  // [新增] 教程分类选择 -> 关卡选择
  const handleSelectCategory = (id: ExamCategoryId) => {
    setTutorialCategoryId(id);
    setAppState('tutorial_stage_select');
  };

  // [新增] 关卡选择 -> 加载对局
  const handleStartStage = (stageId: string) => {
    setTutorialStageId(stageId);
    stopMovie();
    setAppState('loading');
  };

  // [新增] 返回：关卡选择 -> 教程分类选择
  const handleBackFromStageSelect = () => {
    setAppState('tutorial_mode_select');
  };

  // [新增] 大厅 -> 备战 (Lobby -> DeckBuilder)
  const handleLobbyOpenDeck = () => {
    stopMovie();
    stopBgm();
    setDeckBuilderSource('lobby');
    setPendingAppState('deck_builder');
    setAppState('system_loading');
  };

  // --- [修改] 返回导航逻辑 ---
  const handleBackFromDeckBuilder = () => {
      if (deckBuilderSource === 'lobby') {
          handleBackToLobby();
      } else {
          handleBackToModeSelect();
      }
  };

  // 备战页返回 -> 模式选择
  const handleBackToModeSelect = () => {
      playBgm('default');
      if (!customBgRef.current) playHallMovie(); // [修改] 仅无自定义背景时播放
      setAppState('mode_select');
  };

  // 模式选择返回 -> 大厅
  const handleBackToLobby = () => {
      if (!customBgRef.current) playHallMovie(); // [修改] 仅无自定义背景时播放
      setAppState('lobby');
  };

  // 5. [DeckBuilder -> Loading]
  // 构筑完成点击 "START GAME" 触发
  const handleStartGame = ( ) => {
    // [核心修正] 如果不是教程模式，在进入 Loading 前立即生成并锁定本局敌人！
    if (!tutorialStageId) {
        setStandardEncounter(buildStandardEncounter());
    }
    setAppState('loading');
    stopMovie();
  };

  // 6. [Loading -> Game / Tutorial Game]
  // VS动画结束触发
  const handleLoadingComplete = () => {
    if (tutorialStageId) {
      setAppState('tutorial_game');
    } else {
      setAppState('game');
    }
    setGameId(prev => prev + 1);
  };

  // 7. [Game -> Title] (Exit)
  const handleExitGame = () => {
    stopMovie();
    stopBgm();
    setTutorialStageId(null); // 清理教程状态
    setStandardEncounter(null); // [清理] 清空上局敌人数据
    setPendingAppState('lobby');   // 告诉系统：加载完去大厅
    setAppState('system_loading'); // 立即进入加载界面
  };

  // 背景视频切换
  const handleSwitchLobbyVideo = () => {
      if (playHallMovie) {
          const nextIndex = lobbyVideoIndex + 1;
          const actualIndex = playHallMovie(nextIndex);
          setLobbyVideoIndex(actualIndex);
          // [新增] 视频切台的同时，无缝滑切底层的背景音乐
          playBgm(getHallBgmByIndex(actualIndex));
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
      // [核心修正] 彻底接入智能音画感知系统
      if (customBgRef.current) {
          playBgm(customBgRef.current.type === 'movie' ? getHallBgmByIndex(customBgRef.current.index) : 'default');
      } else {
          playBgm(getHallBgmByIndex(lobbyVideoIndex));
          const idx = playHallMovie(lobbyVideoIndex); // 保持索引不丢
          setLobbyVideoIndex(idx);
      }
    }
    // [核心修复] 让商店和抽卡共享环境底层视效
    else if (appState === 'gacha' || appState === 'shop') {
      playBgm('gacha');
      if (!customBgRef.current && !isVisible) playHallMovie(lobbyVideoIndex); // 强行切自己的BGM
    }
    else if (appState === 'mode_select') {
       // [核心修正] 模式选择界面也完全继承大厅的智能音轨
       if (customBgRef.current) {
           playBgm(customBgRef.current.type === 'movie' ? getHallBgmByIndex(customBgRef.current.index) : 'default');
       } else {
           playBgm(getHallBgmByIndex(lobbyVideoIndex));
           if (!isVisible) playHallMovie(lobbyVideoIndex);
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

  // [新增] 获取敌方加载界面的英雄
  const getEnemyDisplayHero = (): string => {
      // 优先判断是否是教程考核模式
      if (tutorialStageId) {
          const stage = TUTORIAL_STAGES[tutorialStageId];
          if (stage && stage.enemyArchetypeId) {
              const archetype = ENEMY_ARCHETYPES[stage.enemyArchetypeId];
              // [核心升级] 智能回退：如果没统帅，就抓核心池第一张牌当代言人！
              if (archetype && archetype.champion) {
                  return archetype.champion;
              } else if (archetype && archetype.coreCards.length > 0) {
                  const firstCore = typeof archetype.coreCards[0] === 'string' ? archetype.coreCards[0] : (archetype.coreCards[0] as any).key;
                  return firstCore;
              }
          }
      } else if (standardEncounter) {
          // [核心修正] 标准模式直接从刚刚提前生成的配置中读取！
          if (standardEncounter.heroConfig.heroKey) {
              return standardEncounter.heroConfig.heroKey;
          } else if (standardEncounter.deck && standardEncounter.deck.length > 0) {
              return standardEncounter.deck[0];
          }
      }
      // 兜底防崩溃
      return 'fenny';
  };

  // [核心新增] 获取敌方加载界面的显示名称
  const getEnemyDisplayName = (): string => {
      if (tutorialStageId) {
          const stage = TUTORIAL_STAGES[tutorialStageId];
          if (stage && stage.enemyArchetypeId) {
              const archetype = ENEMY_ARCHETYPES[stage.enemyArchetypeId];
              if (archetype) return archetype.name;
          }
      } else if (standardEncounter && standardEncounter.heroConfig) {
          return standardEncounter.heroConfig.customName;
      }
      return 'ENEMY';
  };

  // [哨兵] 静默加载：用户数据加载中显示纯黑屏（隐藏 "LOADING PROFILE..."）
  if (!userSystem.isReady) {
      return <div className="w-full h-full bg-black" />;
  }


  return (
  <ScaleWrapper>
  <FullScreenToggle />
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">



      {/* 0. 免责启动画面 (哨兵) */}
      {appState === 'splash' && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}

      {/* 1. 标题界面 (纯净版) */}
      {appState === 'title' && (
        <TitleScreen
            onTitleStartClick={handleTitleStart}
            userSystem={userSystem}
        />
      )}

      {/* 1.5 模式选择界面 (独立版) */}
      {appState === 'mode_select' && (
        <ModeSelectScreen
            onPvESelect={handlePvESelect}
            onBack={handleBackToLobby}
            onTutorialSelect={handleTutorialSelect} // [新增] 教程入口
        />
      )}

      {/* [新增] 教程模式：分类选择 */}
      {appState === 'tutorial_mode_select' && (
        <TutorialModeSelect
            onSelectCategory={handleSelectCategory}
            onBack={handleBackToModeSelect}
        />
      )}

      {/* [新增] 教程模式：关卡选择 */}
      {appState === 'tutorial_stage_select' && tutorialCategoryId && (
        <StageSelectScreen
            categoryId={tutorialCategoryId}
            onBack={handleBackFromStageSelect}
            onStartStage={handleStartStage}
            onViewDecks={setPreviewStageId}
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
                  onOpenDeck={handleLobbyOpenDeck}
                  onOpenShop={handleOpenShop}
                  onOpenMission={() => setIsMissionOpen(true)} // [新增] 绑定任务面板唤起
                  hasClaimableReward={missionSystem.hasClaimableReward} // [新增] 传递发光黄点信号
                  customBg={customBg}
                  onUpdateCustomBg={handleUpdateCustomBg}
              />
      )}

      {/* [新增] 抽卡界面 */}
      {appState === 'gacha' && (
          <GachaScreen
              userSystem={userSystem}
              onBack={handleBackToLobby}
          />
      )}

      {/* [核心新增] 商店界面 */}
      {appState === 'shop' && (
          <ShopScreen
              userSystem={userSystem}
              onClose={handleBackToLobby}
          />
      )}

      {/* 4. 备战 */}
      {appState === 'deck_builder' && (
        <DeckBuilder
            onStartGame={handleStartGame}
            userSystem={userSystem}
            onBack={handleBackFromDeckBuilder}
            // [新增] 将来源传递给组件
            fromSource={deckBuilderSource}
        />
      )}

      {/* 5. 战斗加载 */}
      {appState === 'loading' && (
          <LoadingScreen
              heroKey={getDisplayHero()}
              enemyHeroKey={getEnemyDisplayHero()} // [核心修复] 动态传入敌方真实英雄
              enemyName={getEnemyDisplayName()} // [核心修复] 下发指挥部赋予的真实姓名！
              onComplete={handleLoadingComplete} // [Link 6]
              skinOverrides={userSystem.activeDeck?.skinOverrides}
              onMatchFound={stopBgm}
          />
      )}

      {/* 6. 战斗 (标准模式) */}
      {appState === 'game' && standardEncounter && (
            <StandardGameWrapper
                key={gameId}
                deck={currentPlayerDeckList}
                encounter={standardEncounter} // [核心修正] 传入在 loading 前就生成好的敌人
                onExitGame={handleExitGame}
                onExit={handleExitGame}
                playBgm={playBgm}
                playLevelUpMovie={playLevelUpMovie}
                prepareLevelUpMovie={prepareLevelUpMovie} // [新增] 下发升级预热
                playVictoryMovie={playVictoryMovie}
                prepareVictoryMovie={prepareVictoryMovie} // [新增] 下发胜利预热
                stopMovie={stopMovie}
                // [核心修复] 优先读取卡组专属配置，没有则回退到全局默认配置
                deskIndex={userSystem.activeDeck?.boardIndex ?? userSystem.settings.customization.currentDeskIndex}
                cardBackIndex={userSystem.activeDeck?.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex}
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
            />
       )}
      {/* [新增] 6b. 战斗 (教程模式) */}
      {appState === 'tutorial_game' && tutorialStageId && (
            <TutorialGameWrapper
                key={`tutorial_${gameId}`}
                stageId={tutorialStageId}
                deck={currentPlayerDeckList}
                onExitGame={handleExitGame}
                onExit={handleExitGame}
                playBgm={playBgm}
                playLevelUpMovie={playLevelUpMovie}
                prepareLevelUpMovie={prepareLevelUpMovie} // [新增] 下发升级预热
                playVictoryMovie={playVictoryMovie}
                prepareVictoryMovie={prepareVictoryMovie} // [新增] 下发胜利预热
                stopMovie={stopMovie}
                // [核心修复] 优先读取卡组专属配置，没有则回退到全局默认配置
                deskIndex={userSystem.activeDeck?.boardIndex ?? userSystem.settings.customization.currentDeskIndex}
                cardBackIndex={userSystem.activeDeck?.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex}
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
            />
       )}
      {/* 全局设置面板 */}
          <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              volumes={userSystem.settings.volume}
              onVolumeChange={handleVolumeChange}
              videoResolution={(userSystem.settings as any)?.videoResolution || '1k'}
              onResolutionChange={(res) => userSystem.updateSettings({ videoResolution: res } as any)}
          />

      {/* [核心挂载] 军需处视觉终端面板 */}
          <MissionPanel
              isOpen={isMissionOpen}
              onClose={() => setIsMissionOpen(false)}
              missionSystem={missionSystem}
              userSystem={userSystem}
          />

      {/* [新增] 教程牌组预览弹窗 */}
      {previewStageId && (
          <DeckPreviewModal
              stageId={previewStageId}
              // [核心修复] 优先读取卡组专属配置，没有则回退到全局默认配置
              deskIndex={userSystem.activeDeck?.boardIndex ?? userSystem.settings.customization.currentDeskIndex}
              cardBackIndex={userSystem.activeDeck?.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex}
              playerCustomDeck={currentPlayerDeckList}
              onClose={() => setPreviewStageId(null)}
              onStart={() => {
                  handleStartStage(previewStageId);
                  setPreviewStageId(null);
              }}
          />
      )}

          <AnimatePresence>
          {/* [核心修复] 将 shop 加入白名单 */}
          {customBg && (appState === 'lobby' || appState === 'mode_select' || appState === 'gacha' || appState === 'shop') && (
              <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[1] bg-black pointer-events-none"
              >
                  {customBg.type === 'pic' ? (
                      <img src={customBg.url} className="w-full h-full object-cover" alt="自定义背景" />
                  ) : (
                      <video src={customBg.url} autoPlay loop muted className="w-full h-full object-cover" />
                  )}
              </motion.div>
          )}
      </AnimatePresence>


      <VideoPlayer
                src={currentMovie}
                isVisible={isVisible}
                isLoop={isLooping}
                onEnded={handleVideoEnded}
                // [核心修复] 将 shop 加入白名单
                zIndex={(appState === 'title' || appState === 'lobby' || appState === 'mode_select' || appState === 'gacha' || appState === 'shop') ? 0 : 500}
                noFade={isImmediate}
            />
        </div>
    </ScaleWrapper>
  );
}