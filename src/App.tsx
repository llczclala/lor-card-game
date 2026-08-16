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
import type { PoolId } from './logic/gachaLogic'; // [2026-08-02] 卡池跳转
import { ShopScreen } from './components/ShopScreen'; // [核心新增] 引入商店组件
import { MissionPanel } from './components/MissionUI'; // [核心新增] 引入军需面板
import { AnnouncementPanel } from './components/AnnouncementPanel'; // [2026-08-09] 引入公告中心面板
import { useMissionSystem } from './hooks/useMissionSystem'; // [核心新增] 引入军功大脑
import { SettingsModal } from './components/SettingsModal';
import { eventBus, GameEvents } from './utils/eventBus';
import { ScaleWrapper } from './components/ScaleWrapper'; // [新增]
import { StandardGameWrapper } from './components/modes/StandardGameWrapper';
import { TutorialModeSelect } from './components/Tutorial/TutorialModeSelect';
import { StageSelectScreen } from './components/Tutorial/StageSelectScreen';
import { TutorialGameWrapper } from './components/Tutorial/TutorialGameWrapper';
import { TutorialGuidance } from './components/Tutorial/TutorialGuidance'; // [新增] 大厅引导层
import { DeckPreviewModal } from './components/Tutorial/DeckPreviewModal';
import type { BgConfig } from './components/GameLobby'; // [修复] 加入 type 关键字，解决纯类型导入报错
import type { ExamCategoryId } from './data/tutorialStages';
import { TUTORIAL_STAGES } from './data/tutorialStages'; // [新增]
import { ENEMY_ARCHETYPES } from './data/enemies/archetypes'; // [新增]
import { buildStandardEncounter, buildRoguelikeEncounter } from './logic/encounterBuilder'; // [新增] 标准模式 + 肉鸽敌人生成器
import type { RogueNodeType } from './data/roguelike/mapLayout';
import { useRoguelikeRun } from './hooks/useRoguelikeRun';
import { RogueHeroSelect } from './components/roguelike/RogueHeroSelect';
import { RogueLobby } from './components/roguelike/RogueLobby'; // [2026-08-07 肉鸽主界面]
import { RogueStageSelect } from './components/roguelike/RogueStageSelect'; // [2026-08-07 关卡选择界面]
import { buildStarterDeck, getConfiguredStarterDeck } from './data/roguelike/rogueStarterDecks'; // [2026-08-07 肉鸽主界面] [2026-08-13 接个性化配置]
import { ROGUE_DIFFICULTIES } from './data/roguelike/difficulties'; // [2026-08-07 难度解锁]
import type { RogueDifficulty } from './data/roguelike/difficulties'; // [2026-08-07 难度]
import { RogueMapScreen } from './components/roguelike/RogueMapScreen';
import { RogueGameWrapper } from './components/roguelike/RogueGameWrapper';
import { useHeroProgression } from './hooks/useHeroProgression'; // [2026-08-12 天启者养成] 每英雄等级/经验
import { getHeroLevelBonus, getRunExp } from './data/roguelike/heroProgression'; // [2026-08-12 天启者养成] 等级加成/经验结算
import { LevelUpToast } from './components/roguelike/LevelUpToast'; // [2026-08-12 天启者养成] 升级弹窗
import { SACRIFICE_MAX_HP, type RandomTreasureResult } from './data/roguelike/treasure'; // [2026-08-12 宝箱节点]
import { getHallBgmByIndex, getHallBgmByVideoUrl } from './data/movieData'; // [核心重构] 新增视频 URL 直查 BGM
import { getCompletedStages, isGuidanceDismissed, dismissGuidance } from './utils/tutorialProgress'; // [新增] 引导层状态
import { motion, AnimatePresence } from 'framer-motion';

// [核心修复] AppState 增加 'shop' 状态
type AppState = 'splash' | 'title' | 'system_loading' | 'lobby' | 'mode_select' | 'deck_builder' | 'loading' | 'game' | 'gacha'
    | 'tutorial_mode_select' | 'tutorial_stage_select' | 'tutorial_game' | 'shop'
    | 'rogue_hero_select' | 'rogue_lobby' | 'rogue_stage_select' | 'rogue_map' | 'rogue_game';
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
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false); // [2026-08-09] 公告中心开关状态
  const [gameId, setGameId] = useState(0);
  const [deckBuilderSource, setDeckBuilderSource] = useState<'lobby' | 'mode_select' | 'rogue_edit'>('mode_select');
  const [rogueEditDeckId, setRogueEditDeckId] = useState<string | null>(null); // [2026-08-13] 肉鸽初始牌组编辑目标
  const [gachaInitPool, setGachaInitPool] = useState<PoolId | undefined>(undefined); // [2026-08-02] 抽卡界面初始卡池（备战详情跳转用）
  const [tutorialCategoryId, setTutorialCategoryId] = useState<ExamCategoryId | null>(null);
  const [tutorialStageId, setTutorialStageId] = useState<string | null>(null);
  const [previewStageId, setPreviewStageId] = useState<string | null>(null);
  const [standardEncounter, setStandardEncounter] = useState<any>(null); // [新增] 提前缓存标准模式的敌人数据
  const [standardDifficulty, setStandardDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal'); // [2026-08-06] 标准对战 AI 难度
  // ★ PVE 模式：每局随机决定谁先手
  const [firstAttacker, setFirstAttacker] = useState<'player' | 'enemy'>('player');
  // ★ 悖论迷宫（肉鸽）
  const rogue = useRoguelikeRun();
  const heroProgression = useHeroProgression(); // [2026-08-12 天启者养成] 每英雄等级/经验
  const [levelUpInfo, setLevelUpInfo] = useState<{ heroKey: string; fromLevel: number; toLevel: number } | null>(null); // [2026-08-12] 升级弹窗信息
  const [expToast, setExpToast] = useState<{ heroKey: string; amount: number } | null>(null); // [2026-08-12] 结算经验浮层
  const [rogueEncounter, setRogueEncounter] = useState<any>(null);
  const [rogueReward, setRogueReward] = useState<{ gold: number; options: { cardKey: string; cardName: string; cardImage: string }[] } | null>(null); // [2026-08-15] 胜利奖励三选一（3 个候选卡）
  const [rogueBattleType, setRogueBattleType] = useState<RogueNodeType | null>(null);
  const [rogueBattleNodeId, setRogueBattleNodeId] = useState<string | null>(null); // [2026-08-10] 当前战斗节点 id（胜利后标记击败）
  const [rogueHeroKey, setRogueHeroKey] = useState<string | null>(null); // [2026-08-07 肉鸽主界面] 已选天启者
  const [rogueMissionOpen, setRogueMissionOpen] = useState(false); // [2026-08-07 肉鸽主界面] 任务面板开关
  const [preBattleHpSnapshot, setPreBattleHpSnapshot] = useState<number | null>(null); // [2026-08-11 全局 HP 衔接] 进战斗前全局 HP 快照（中途退出回滚用）

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
          playBgm(bg.type === 'movie' ? getHallBgmByVideoUrl(bg.url) : 'default');
      } else {
          localStorage.removeItem('sbr_lobby_bg');
          if (['lobby', 'mode_select', 'gacha'].includes(appState)) {
              playHallMovie(lobbyVideoIndex);
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
          // [2026-08-09] 新版本首次进大厅自动弹出公告窗口（对比已读版本标记）
          const ver = import.meta.env.PACKAGE_VERSION;
          if (ver && (userSystem.settings.lastSeenAnnouncementVersion || '') !== ver) {
              setIsAnnouncementOpen(true);
              userSystem.updateSettings({ lastSeenAnnouncementVersion: ver });
          }
      }
  };

  // 3. [Lobby -> ModeSelect]
  const handleLobbyStartBattle = () => {
      setAppState('mode_select');
  };

  // [新增] 大厅 -> 抽卡 (Lobby -> Gacha)
  const handleLobbyGacha = () => {
    stopBgm();
    setGachaInitPool(undefined); // [2026-08-02] 大厅进入默认常驻池
    setPendingAppState('gacha');
    setAppState('system_loading');
    stopMovie();
  };

  // [2026-08-02] 备战 -> 抽卡（带目标卡池，卡牌详情页"前往卡池"）
  const handleDeckToGacha = (poolId: PoolId) => {
    stopBgm();
    setGachaInitPool(poolId);
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

  // [新增] 模式选择 -> 教程分类选择（统一先走系统加载界面，对齐地下清理）
  const handleTutorialSelect = () => {
    stopMovie();
    stopBgm();
    setPendingAppState('tutorial_mode_select');
    setAppState('system_loading');
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
      // [2026-08-13] 肉鸽初始牌组编辑 → 返回回个性化选择界面
      if (deckBuilderSource === 'rogue_edit') {
          setRogueEditDeckId(null);
          setDeckBuilderSource('mode_select');
          setAppState('rogue_hero_select');
          return;
      }
      if (deckBuilderSource === 'lobby') {
          handleBackToLobby();
      } else {
          handleBackToModeSelect();
      }
  };

  // [2026-08-13] 编辑肉鸽初始牌组（开发者专用）：注册到 userSystem 牌组 + 切备战编辑
  const handleEditRogueDeck = (heroKey: string) => {
      const deckId = `rogue_starter_${heroKey}`;
      if (!userSystem.decks.some((d: any) => d.id === deckId)) {
          const starter = buildStarterDeck(heroKey);
          const cards: Record<string, number> = {};
          starter.forEach(k => { cards[k] = (cards[k] || 0) + 1; });
          userSystem.saveDeck({
              id: deckId,
              name: `肉鸽·${CARD_DB[heroKey]?.name ?? heroKey}`,
              hero: heroKey,
              cards,
              skinOverrides: {},
              createdAt: Date.now(),
              updatedAt: Date.now(),
              cardBackIndex: userSystem.settings?.customization?.currentCardBackIndex,
              boardIndex: userSystem.settings?.customization?.currentDeskIndex,
          });
      }
      userSystem.selectDeck(deckId);
      setRogueEditDeckId(deckId);
      setDeckBuilderSource('rogue_edit');
      stopMovie();
      stopBgm();
      setPendingAppState('deck_builder');
      setAppState('system_loading');
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
        // ★ PVE 模式：随机决定先手方
        setFirstAttacker(Math.random() > 0.5 ? 'player' : 'enemy');
    }
    setAppState('loading');
    stopMovie();
  };

  // [2026-08-06] 标准对战 AI 难度选择：由 DeckBuilder 备战界面回传
  const handleDifficultyChange = (d: 'easy' | 'normal' | 'hard') => setStandardDifficulty(d);

  // 6. [Loading -> Game / Tutorial Game]
  // VS动画结束触发
  const handleLoadingComplete = () => {
    if (tutorialStageId) {
      setAppState('tutorial_game');
    } else if (rogue.run && rogue.run.status === 'active') {
      setAppState('rogue_game');
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

  // ==========================================
  // [悖论迷宫] 肉鸽流程控制
  // ==========================================
  const handleRogueSelect = () => {
    stopMovie();
    stopBgm();
    setPendingAppState('rogue_lobby'); // [2026-08-07] 先进入肉鸽主界面
    setAppState('system_loading');
  };

  // [2026-08-07 肉鸽主界面] 天启者选择界面确认 → 保存选择并回主界面
  const handleRogueHeroSelected = (heroKey: string) => {
    setRogueHeroKey(heroKey);
    setAppState('rogue_lobby');
  };

  // [2026-08-07 肉鸽主界面] 主界面「前往推演」→ 进入关卡选择界面
  const handleRogueStartFromLobby = () => {
    if (!rogueHeroKey) return;
    setAppState('rogue_stage_select');
  };

  // [2026-08-07 关卡选择] 「进行推演」→ 按所选难度创建 run 并进地图
  // [2026-08-12 天启者养成] 结算经验浮层 2.5s 自动消失
  useEffect(() => {
    if (!expToast) return;
    const t = setTimeout(() => setExpToast(null), 2500);
    return () => clearTimeout(t);
  }, [expToast]);

  const handleRogueStageStart = (difficulty: RogueDifficulty) => {
    if (!rogueHeroKey) return;
    // [2026-08-12 天启者养成] 按英雄等级应用开局加成（生命/金币/复活/刷新/迷宫强化/装备/稀有度）
    const heroLevel = heroProgression.getHeroLevel(rogueHeroKey);
    const bonus = getHeroLevelBonus(heroLevel);
    rogue.startRun(rogueHeroKey, getConfiguredStarterDeck(userSystem.decks, rogueHeroKey), difficulty, {
      maxHp: bonus.maxHpBonus,
      gold: bonus.goldBonus,
      reviveCount: bonus.reviveBonus,
      refreshCount: bonus.refreshBonus,
      extraEnhancements: bonus.grantedEnhancements,
      extraEquipments: bonus.grantedEquipments,
      heroLevel,
      rarityBonus: bonus.rarityBonus,
    });
    setAppState('rogue_map');
  };

  // [2026-08-11 全局 HP 衔接] 移除 handleRogueBackToLobby：战斗内退出改"放弃本场回地图"（onExit），整局作废由地图 RunEndModal 承担

  const handleRogueBattle = (nodeType: RogueNodeType, archetypeId?: string, nodeId?: string) => {
    if (!rogue.run) return;
    // [2026-08-10] 用节点预分配的敌人流派（保证地图头像与实际对手一致）
    const encounter = buildRoguelikeEncounter(nodeType, rogue.run.act, rogue.run.difficulty, archetypeId);
    setRogueEncounter(encounter);
    setRogueBattleType(nodeType);
    setRogueBattleNodeId(nodeId ?? null); // [2026-08-10] 记录当前战斗节点，胜利后标记击败
    setPreBattleHpSnapshot(rogue.run.hp); // [2026-08-11] 存进战斗前 HP 快照（中途退出回滚）
    stopMovie();
    setAppState('loading');
  };

  const handleRogueVictory = (playerNexus?: number) => {
    if (!rogue.run) return;
    // [2026-08-10] 标记当前战斗节点已击败（地图红叉）
    if (rogueBattleNodeId) rogue.markDefeated(rogueBattleNodeId);
    // [2026-08-11 全局 HP 衔接] 真衔接：把战斗剩余水晶写回全局 HP（setHp 内部 clamp 到 [0, maxHp]）
    rogue.setHp(playerNexus ?? rogue.run.hp);
    if (rogueBattleType === 'boss') {
      // Boss 胜利 → 推进下一 Act（超最后一 Act 则通关）
      rogue.advanceAct();
      // [2026-08-07 难度解锁] 通关当前难度 → 解锁下一难度（递进：普通→机密→绝密）
      const cleared = rogue.run.difficulty;
      const nextToUnlock = ROGUE_DIFFICULTIES.find(d => d.unlockAfter === cleared)?.key;
      if (nextToUnlock) {
        const cur: string[] = userSystem.settings?.unlockedRogueDifficulties ?? [];
        if (!cur.includes(nextToUnlock)) {
          userSystem.updateSettings({ unlockedRogueDifficulties: [...cur, nextToUnlock] });
        }
      }

      // [2026-08-12 天启者养成] 整局通关 → 结算经验（按难度）+ 升级提示
      const heroKey = rogue.run.heroKey;
      const gained = getRunExp(rogue.run.difficulty, true);
      const leveled = heroProgression.addHeroExp(heroKey, gained);
      if (leveled) setLevelUpInfo({ heroKey, fromLevel: leveled.fromLevel, toLevel: leveled.toLevel });
      setExpToast({ heroKey, amount: gained });
      // [2026-08-12 商店经济] Boss 通关大额金币（LOR 参考 Boss +200）
      rogue.addGold(200);
    } else {
      // 普通/精英胜利 → 金币 + 三选一卡牌奖励（[2026-08-15] 程要求胜利奖励三选一）
      const pool = Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);
      const options: { cardKey: string; cardName: string; cardImage: string }[] = [];
      const pickedKeys = new Set<string>();
      let guard = 0;
      while (options.length < 3 && pickedKeys.size < pool.length && guard < 300) {
        guard++;
        const card = pool[Math.floor(Math.random() * pool.length)];
        if (pickedKeys.has(card.key)) continue;
        pickedKeys.add(card.key);
        options.push({ cardKey: card.key, cardName: card.name, cardImage: card.imageUrl });
      }
      // [2026-08-12 商店经济] 提高战斗金币来源（LOR 参考普通敌 +100），按难度上浮
      const baseGold = 50 + rogue.run.act * 25;
      const diffMult = rogue.run.difficulty === 'topsecret' ? 1.5 : rogue.run.difficulty === 'secret' ? 1.25 : 1;
      const gold = Math.round(baseGold * diffMult);
      rogue.addGold(gold);
      // 不再直接加卡，交给三选一弹窗由玩家选择
      setRogueReward({ gold, options });
    }
    playBgm('default'); // [2026-08-15] 返回地图切回大厅 BGM（战斗 BGM 由 GameSession 触发，需在此复位）
    setPreBattleHpSnapshot(null); // [2026-08-11] 战斗已结算，快照失效
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueEncounter(null);
    setAppState('rogue_map');
  };

  const handleRogueDefeat = (_playerNexus?: number) => {
    rogue.completeBattle(false); // → dead，回地图显示死亡结算（败北不写回 HP）
    // [2026-08-12 天启者养成] 整局败北 → 结算经验（少量）+ 升级提示
    if (rogue.run) {
      const heroKey = rogue.run.heroKey;
      const gained = getRunExp(rogue.run.difficulty, false);
      const leveled = heroProgression.addHeroExp(heroKey, gained);
      if (leveled) setLevelUpInfo({ heroKey, fromLevel: leveled.fromLevel, toLevel: leveled.toLevel });
      setExpToast({ heroKey, amount: gained });
    }
    playBgm('default'); // [2026-08-15] 返回地图切回大厅 BGM（战斗 BGM 由 GameSession 触发，需在此复位）
    setPreBattleHpSnapshot(null); // [2026-08-11] 战斗已结算，快照失效
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueEncounter(null);
    setAppState('rogue_map');
  };

  // [2026-08-15 莉莉子] 胜利奖励三选一：玩家选定一张卡 → 加入牌组并关闭弹窗
  const handleRewardPick = (cardKey: string) => {
    if (!rogue.run) return;
    rogue.addCard(cardKey);
    setRogueReward(null);
  };

  const handleRogueRest = () => {
    if (!rogue.run) return;
    rogue.heal(Math.floor(rogue.run.maxHp * 0.3));
  };

  const handleRogueEnhance = (key: string) => {
    rogue.applyEnhancement(key); // [2026-08-05] 迷宫强化：选择并应用效果
  };

  // ==========================================
  // [2026-08-12 商店经济] 商店购买 / 刷新（返回是否成功，金币不足返回 false）
  // ==========================================
  const handleRogueBuyCard = (cardKey: string, equipId: string | undefined, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.addCard(cardKey);
    if (equipId) rogue.addEquippedCard(cardKey, equipId); // 带装备的卡：装备附加到该卡所有副本
    return true;
  };
  const handleRogueBuyEnhancement = (enhancementId: string, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.applyEnhancement(enhancementId); // 即时型生效 / 战斗型进 enhancements
    return true;
  };
  const handleRogueBuyEquipment = (equipmentId: string, price: number) => {
    if (!rogue.run) return false;
    if (!rogue.spendGold(price)) return false;
    rogue.addEquippedCard(rogue.run.heroKey, equipmentId); // 装备挂到英雄卡
    return true;
  };
  const handleRogueRemoveCard = (cardKey: string, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.removeCard(cardKey);
    return true;
  };
  const handleRogueShopRefresh = () => rogue.useRefresh();

  // ==========================================
  // [2026-08-12 宝箱节点] 宝箱领取 handlers
  // ==========================================
  const handleRogueTreasureGold = (amount: number) => { rogue.addGold(amount); };
  const handleRogueTreasureCard = (cardKey: string, equipId: string | undefined) => {
    rogue.addCard(cardKey);
    if (equipId) rogue.addEquippedCard(cardKey, equipId); // 带装备的卡：装备附加到该卡
  };
  const handleRogueTreasureEnhancement = (enhancementId: string) => { rogue.applyEnhancement(enhancementId); };
  const handleRogueTreasureSacrifice = (enhancementId: string) => {
    rogue.adjustMaxHp(-SACRIFICE_MAX_HP); // 牺牲 -10 生命上限
    rogue.applyEnhancement(enhancementId); // 换取史诗强化
  };
  const handleRogueTreasureRandom = (result: RandomTreasureResult) => {
    switch (result.kind) {
      case 'gold': rogue.addGold(result.amount); break;
      case 'card':
        rogue.addCard(result.cardKey);
        if (result.equipId) rogue.addEquippedCard(result.cardKey, result.equipId);
        break;
      case 'enhancement': rogue.applyEnhancement(result.enhancementId); break;
      case 'maxHp': rogue.adjustMaxHp(result.amount); break;
      case 'revive': rogue.addRevive(result.amount); break;
      case 'refresh': rogue.addRefresh(result.amount); break;
    }
  };

  const handleRogueRunEnd = () => {
    rogue.resetRun();
    setPreBattleHpSnapshot(null); // [2026-08-11] 整局结束，快照失效
    setRogueEncounter(null);
    setRogueReward(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    handleBackToModeSelect();
  };

  // [2026-08-11 全局 HP 衔接] 中途退出（放弃本场）：HP 回滚到进战斗前，本局保留
  const handleRogueBattleExit = () => {
    if (preBattleHpSnapshot !== null) rogue.setHp(preBattleHpSnapshot); // 回滚进战前 HP
    playBgm('default'); // [2026-08-15] 返回地图切回大厅 BGM
    setPreBattleHpSnapshot(null);
    setRogueEncounter(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setAppState('rogue_map');
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
          if (e.key !== 'Escape') return;
          // [2026-08-15 莉莉子] 有返回按钮的界面：ESC 等同点击该界面的返回按钮 → 返回上一界面，而非打开设置
          // （capture 阶段的深层界面如 DeckBuilder 已自行拦截并 stopImmediatePropagation，能走到这说明无更深处界面拦截）
          switch (appState) {
              case 'mode_select':          // 模式选择 → 大厅
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  handleBackToLobby();
                  return;
              case 'tutorial_mode_select': // 教程分类选择 → 上一级（模式选择，对齐返回按钮的 BGM/影片处理）
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  handleBackToModeSelect();
                  return;
              case 'tutorial_stage_select': // 教程关卡选择（进入基础/关键词考核后）→ 回教程分类选择
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  handleBackFromStageSelect();
                  return;
              case 'gacha':                // 抽卡 → 大厅
              case 'shop':                 // 商店 → 大厅
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  handleBackToLobby();
                  return;
              case 'rogue_lobby':          // 肉鸽主界面（前往推演）→ 模式选择（上一级）
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  handleBackToModeSelect();
                  return;
              case 'rogue_hero_select':    // 天启者选择 → 回肉鸽主界面
              case 'rogue_stage_select':   // 关卡选择 → 回肉鸽主界面
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  setAppState('rogue_lobby');
                  return;
              case 'rogue_map':            // 肉鸽地图 → 肉鸽大厅（对齐返回按钮）
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  setAppState('rogue_lobby');
                  return;
          }
          if (!isSettingsOpen) {
              eventBus.emit(GameEvents.UI_CLICK);
              setIsSettingsOpen(true);
          }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [appState, isSettingsOpen, handleBackToLobby, handleBackToModeSelect, handleBackFromStageSelect]);


  useEffect(() => {
    console.log(`[App] State changed to: ${appState}`);

    if (appState === 'title') {
      playBgm('title');
      playTitleMovie();
    }
    else if (appState === 'lobby') {
      // [核心修正] 彻底接入智能音画感知系统
      if (customBgRef.current) {
          playBgm(customBgRef.current.type === 'movie' ? getHallBgmByVideoUrl(customBgRef.current.url) : 'default');
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
           playBgm(customBgRef.current.type === 'movie' ? getHallBgmByVideoUrl(customBgRef.current.url) : 'default');
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
    // ★ 悖论迷宫：使用所选天启者
    if (rogue.run && rogue.run.status === 'active') {
      return rogue.run.heroKey;
    }
    // ★ 教程模式：优先使用关卡预设的我方英雄
    if (tutorialStageId) {
        const stage = TUTORIAL_STAGES[tutorialStageId];
        if (stage?.playerHeroConfig?.heroKey) {
            return stage.playerHeroConfig.heroKey;
        }
    }
    // 标准模式：从用户当前卡组读取
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
      // 悖论迷宫：用当前遭遇英雄
      if (rogue.run && rogue.run.status === 'active' && rogueEncounter) {
          return rogueEncounter.heroConfig.heroKey;
      }
      // 优先判断是否是教程考核模式
      if (tutorialStageId) {
          const stage = TUTORIAL_STAGES[tutorialStageId];
          // ★ 优先使用关卡指定的 enemyVisual 视觉配置
          if (stage?.enemyVisual?.cardKey) {
              return stage.enemyVisual.cardKey;
          }
          // 旧逻辑回退（兼容没有 enemyVisual 的老关卡）
          if (stage?.enemyArchetypeId) {
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
      if (rogue.run && rogue.run.status === 'active' && rogueEncounter) {
          return rogueEncounter.heroConfig.customName || '悖论之敌';
      }
      if (tutorialStageId) {
          const stage = TUTORIAL_STAGES[tutorialStageId];
          // ★ 优先使用关卡指定的 enemyVisual 视觉配置
          if (stage?.enemyVisual?.displayName) {
              return stage.enemyVisual.displayName;
          }
          // 旧逻辑回退（兼容旧数据）
          if (stage?.enemyArchetypeId) {
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
            onRogueSelect={handleRogueSelect} // [新增] 悖论迷宫入口
        />
      )}

      {/* [新增] 教程模式：分类选择 */}
      {appState === 'tutorial_mode_select' && (
        <TutorialModeSelect
            onSelectCategory={handleSelectCategory}
            onBack={handleBackToModeSelect}
            onBackToLobby={handleBackToLobby} // [2026-08-07] 分类选择直达大厅
        />
      )}

      {/* [新增] 教程模式：关卡选择 */}
      {appState === 'tutorial_stage_select' && tutorialCategoryId && (
        <StageSelectScreen
            categoryId={tutorialCategoryId}
            userId={userSystem.userId}
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
          <div className="relative w-full h-full">
              <GameLobby
                  userSystem={userSystem}
                  onStartBattle={handleLobbyStartBattle}
                  onSwitchVideo={handleSwitchLobbyVideo}
                  onGachaClick={handleLobbyGacha}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenDeck={handleLobbyOpenDeck}
                  onOpenShop={handleOpenShop}
                  onOpenMission={() => setIsMissionOpen(true)} // [新增] 绑定任务面板唤起
                  onOpenAnnouncement={() => setIsAnnouncementOpen(true)} // [2026-08-09] 绑定公告中心唤起
                  hasClaimableReward={missionSystem.hasClaimableReward} // [新增] 传递发光黄点信号
                  customBg={customBg}
                  onUpdateCustomBg={handleUpdateCustomBg}
              />

              {/* [新增] 大厅新手引导层 */}
              <TutorialGuidance
                  visible={
                      getCompletedStages(userSystem.userId).length === 0 &&
                      !isGuidanceDismissed(userSystem.userId)
                  }
                  onStartTutorial={() => handleStartStage('basic_01_victory')}
                  onClosed={() => dismissGuidance(userSystem.userId)}
              />
          </div>
      )}

      {/* [新增] 抽卡界面 */}
      {appState === 'gacha' && (
          <GachaScreen
              userSystem={userSystem}
              onBack={handleBackToLobby}
              initialPool={gachaInitPool} // [2026-08-02] 备战详情跳转指定卡池
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
            onBackToLobby={handleBackToLobby} // [2026-08-07] 备战界面直达大厅
            // [新增] 将来源传递给组件
            fromSource={deckBuilderSource}
            onGachaNav={handleDeckToGacha} // [2026-08-02] 卡牌详情页跳转抽卡
            onDifficultyChange={handleDifficultyChange} // [2026-08-06] AI 难度选择回调
            initialEditDeckId={rogueEditDeckId} // [2026-08-13] 肉鸽编辑目标牌组
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
                deskIndex={tutorialStageId ? 0 : (userSystem.activeDeck?.boardIndex ?? userSystem.settings.customization.currentDeskIndex)}
                deskDynamic={(userSystem.settings as any)?.deskDynamic || false} // [2026-08-13] 动态牌桌
                heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 动态卡面
                cardBackIndex={tutorialStageId ? 0 : (userSystem.activeDeck?.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex)}
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
                firstAttacker={firstAttacker} // ★ PVE 随机先手
                aiDifficulty={standardDifficulty} // [2026-08-06] 标准对战 AI 难度
            />
       )}
      {/* [新增] 6b. 战斗 (教程模式) */}
      {appState === 'tutorial_game' && tutorialStageId && (
            <TutorialGameWrapper
                key={`tutorial_${gameId}`}
                stageId={tutorialStageId}
                userId={userSystem.userId}
                deck={currentPlayerDeckList}
                onExitGame={handleExitGame}
                onExit={handleExitGame}
                playBgm={playBgm}
                playLevelUpMovie={playLevelUpMovie}
                prepareLevelUpMovie={prepareLevelUpMovie} // [新增] 下发升级预热
                playVictoryMovie={playVictoryMovie}
                prepareVictoryMovie={prepareVictoryMovie} // [新增] 下发胜利预热
                stopMovie={stopMovie}
                // ★ 教程模式使用默认牌桌和卡背
                deskIndex={0}
                cardBackIndex={0}
                deskDynamic={(userSystem.settings as any)?.deskDynamic || false} // [2026-08-13] 动态牌桌
                heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 动态卡面
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
            />
       )}
      {/* [新增] 6c. 悖论迷宫：主界面（大厅） */}
      {appState === 'rogue_lobby' && (
          <RogueLobby
              onBackToModeSelect={handleBackToModeSelect}
              onBackToLobby={handleBackToLobby}
              onSelectHero={() => setAppState('rogue_hero_select')}
              onOpenMission={() => setRogueMissionOpen(true)}
              onStartRun={handleRogueStartFromLobby}
              selectedHeroKey={rogueHeroKey}
          />
      )}

      {/* [新增] 6c1. 悖论迷宫：关卡选择（难度三选一 + 进行推演） */}
      {appState === 'rogue_stage_select' && (
          <RogueStageSelect
              onBack={() => setAppState('rogue_lobby')}
              onStart={handleRogueStageStart}
              userSystem={userSystem}
          />
      )}

      {/* [新增] 6c2. 悖论迷宫：天启者选择（选完回主界面） */}
      {appState === 'rogue_hero_select' && (
          <RogueHeroSelect
              onBack={() => setAppState('rogue_lobby')}
              onSelect={handleRogueHeroSelected}
              initialHeroKey={rogueHeroKey}
              userSystem={userSystem} // [2026-08-13] 个性化界面（dev 判断 + 牌组读取）
              onEditRogueDeck={handleEditRogueDeck} // [2026-08-13] 编辑肉鸽初始牌组
          />
      )}

      {/* [新增] 6d. 悖论迷宫：地图（核心枢纽） */}
      {appState === 'rogue_map' && rogue.run && (
          <RogueMapScreen
              run={rogue.run}
              reward={rogueReward}
              onBack={() => setAppState('rogue_lobby')} // [2026-08-15] 地图返回 → 肉鸽大厅（原回模式选择，程要求回肉鸽大厅）
              onBattle={handleRogueBattle}
              onMoveTo={rogue.moveTo}
              onRest={handleRogueRest}
              onEnhance={handleRogueEnhance}
              onRewardPick={handleRewardPick}
              onRunEndConfirm={handleRogueRunEnd}
              onBuyCard={handleRogueBuyCard}
              onBuyEnhancement={handleRogueBuyEnhancement}
              onBuyEquipment={handleRogueBuyEquipment}
              onRemoveCard={handleRogueRemoveCard}
              onShopRefresh={handleRogueShopRefresh}
              onTreasureGold={handleRogueTreasureGold}
              onTreasureCard={handleRogueTreasureCard}
              onTreasureEnhancement={handleRogueTreasureEnhancement}
              onTreasureSacrifice={handleRogueTreasureSacrifice}
              onTreasureRandom={handleRogueTreasureRandom}
          />
      )}

      {/* [新增] 6e. 悖论迷宫：战斗 */}
      {appState === 'rogue_game' && rogue.run && rogueEncounter && (
          <RogueGameWrapper
              key={`rogue_${gameId}`}
              deck={rogue.run.deck}
              encounter={rogueEncounter}
              run={rogue.run}
              onVictory={handleRogueVictory}
              onDefeat={handleRogueDefeat}
              onExit={handleRogueBattleExit} // [2026-08-11] 中途退出 → 放弃本场回地图 + HP 回滚
              playBgm={playBgm}
              playLevelUpMovie={playLevelUpMovie}
              prepareLevelUpMovie={prepareLevelUpMovie}
              playVictoryMovie={playVictoryMovie}
              prepareVictoryMovie={prepareVictoryMovie}
              stopMovie={stopMovie}
              deskIndex={0}
              cardBackIndex={0}
              deskDynamic={(userSystem.settings as any)?.deskDynamic || false} // [2026-08-13] 动态牌桌
              heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 动态卡面
              missionSystem={missionSystem}
              firstAttacker={Math.random() > 0.5 ? 'player' : 'enemy'}
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
              skipStartDrawAnimation={(userSystem.settings as any)?.skipGameStartDrawAnimation || false}
              onToggleSkipDraw={() => userSystem.updateSettings({ skipGameStartDrawAnimation: !(userSystem.settings as any)?.skipGameStartDrawAnimation } as any)}
              skipLevelupMovie={(userSystem.settings as any)?.skipLevelupMovie || false}
              onToggleSkipLevelup={() => userSystem.updateSettings({ skipLevelupMovie: !(userSystem.settings as any)?.skipLevelupMovie } as any)}
              skipVictoryMovie={(userSystem.settings as any)?.skipVictoryMovie || false}
              onToggleSkipVictory={() => userSystem.updateSettings({ skipVictoryMovie: !(userSystem.settings as any)?.skipVictoryMovie } as any)}
              deskDynamic={(userSystem.settings as any)?.deskDynamic || false} // [2026-08-13] 动态牌桌开关
              onToggleDeskDynamic={() => userSystem.updateSettings({ deskDynamic: !(userSystem.settings as any)?.deskDynamic } as any)}
              heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 动态卡面开关
              onToggleHeroDynamic={() => userSystem.updateSettings({ heroDynamic: !(userSystem.settings as any)?.heroDynamic } as any)}
              onResetSettings={() => userSystem.resetSettings()} // [2026-08-16] 恢复默认设置
              onRestartMatch={() => { setIsSettingsOpen(false); handleStartGame(); }}
              onReturnToLobby={() => { setIsSettingsOpen(false); handleBackToLobby(); }}
              isInGame={appState === 'game' || appState === 'tutorial_game'}
          />

      {/* [核心挂载] 军需处视觉终端面板 */}
          <MissionPanel
              isOpen={isMissionOpen}
              onClose={() => setIsMissionOpen(false)}
              missionSystem={missionSystem}
              userSystem={userSystem}
          />

      {/* [2026-08-09] 公告中心面板 */}
          <AnnouncementPanel
              isOpen={isAnnouncementOpen}
              onClose={() => setIsAnnouncementOpen(false)}
          />

      {/* [2026-08-07 肉鸽主界面] 悖论迷宫·任务系统（复用大厅任务面板） */}
          <MissionPanel
              isOpen={rogueMissionOpen}
              onClose={() => setRogueMissionOpen(false)}
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

      {/* [2026-08-12 天启者养成] 结算经验浮层 */}
      {expToast && (
          <div className="fixed top-16 right-10 z-[1150] px-5 py-2.5 rounded-xl bg-black/85 border border-emerald-400/40 text-emerald-300 font-black text-xl tracking-widest shadow-[0_0_25px_rgba(16,185,129,0.35)] animate-pop-in pointer-events-none">
              +{expToast.amount} 经验
          </div>
      )}

      {/* [2026-08-12 天启者养成] 升级弹窗 */}
      {levelUpInfo && (
          <LevelUpToast
              heroName={CARD_DB[levelUpInfo.heroKey]?.name ?? levelUpInfo.heroKey}
              fromLevel={levelUpInfo.fromLevel}
              toLevel={levelUpInfo.toLevel}
              onClose={() => setLevelUpInfo(null)}
          />
      )}

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