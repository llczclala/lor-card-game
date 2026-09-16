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
import type { RoguelikeRunState } from './hooks/useRoguelikeRun'; // [2026-08-28 对局记录] 结算窗类型
import { RogueHeroSelect } from './components/roguelike/RogueHeroSelect';
import { RogueLobby } from './components/roguelike/RogueLobby'; // [2026-08-07 肉鸽主界面]
import { RogueCodex } from './components/roguelike/RogueCodex'; // [2026-08-20 逻辑研习] 肉鸽图鉴
import { ArmamentPreview } from './components/roguelike/ArmamentPreview'; // [2026-08-26 莉莉子] 武装悬停大卡预览（全局监听）
import { KeywordPreview } from './components/KeywordPreview'; // [2026-09-10 莉莉子] 关键词悬停大卡预览（全局监听，取代原生 title）
import { RogueStageSelect } from './components/roguelike/RogueStageSelect'; // [2026-08-07 关卡选择界面]
import { buildStarterDeck, getConfiguredStarterDeck } from './data/roguelike/rogueStarterDecks'; // [2026-08-07 肉鸽主界面] [2026-08-13 接个性化配置]
import { ROGUE_DIFFICULTIES } from './data/roguelike/difficulties'; // [2026-08-07 难度解锁]
import type { RogueDifficulty } from './data/roguelike/difficulties'; // [2026-08-07 难度]
import { RogueMapScreen } from './components/roguelike/RogueMapScreen';
import { RogueLeaveModal } from './components/roguelike/modals/RogueLeaveModal'; // [2026-08-28 对局记录] 返回二次确认（结算/暂离）
import { RogueSettleModal } from './components/roguelike/modals/RogueSettleModal'; // [2026-08-28 对局记录] 中途结算窗
import { generateRewardOptions, buildHeroRecruitOptions, type RewardCardOption, type HeroRecruitOption } from './data/roguelike/rewards'; // [2026-08-25] 胜利奖励生成；[2026-09-04] 首战天启者招募
import { pickRandomEnhancements } from './data/roguelike/enhancements'; // [2026-08-28 事件] 随机强化
import { generateCardOffers } from './data/roguelike/shop'; // [2026-08-28 事件] 带装备卡
import { EQUIPMENT_DEFS, getEquipPoolForCard, getEquipmentById } from './data/equipment'; // [2026-08-28 事件] 随机装备 · [2026-08-29] 按卡筛装备池 · 探路回归提示
import { ROGUE_EVENT_BY_ID, type RogueEventEffect } from './data/roguelike/events'; // [2026-08-28 事件系统]
import { RogueGameWrapper } from './components/roguelike/RogueGameWrapper';
import { useHeroProgression } from './hooks/useHeroProgression'; // [2026-08-12 天启者养成] 每英雄等级/经验
import { getHeroLevelBonus } from './data/roguelike/heroProgression'; // [2026-08-12 天启者养成] 等级加成
import { ACCOUNT_EXP_BY_MODE, ACCOUNT_LEVEL_REWARD_DATA_GOLD } from './data/accountProgression'; // [2026-09-04 账号等级系统]
import { computeNodeExp, getNodeDepth, computeRunExpTotal, computeResourceExp, timeExpMult, DIFFICULTY_EXP_MULT, CLEAR_EXP, type RogueSettleDetail } from './data/roguelike/rogueExp'; // [2026-08-29] 经验经济（局内渐进/时长/难度/共鸣）· [2026-09-07] 剩余资源折算
import { RogueExpFeed, type ExpFeedItem } from './components/roguelike/RogueExpFeed'; // [2026-08-29] 局内经验横幅
import { EvaluationPanel } from './components/roguelike/EvaluationPanel'; // [2026-08-29 评估嘉勉] 分析员等级面板
import { RogueMissionPanel } from './components/roguelike/RogueMissionPanel'; // [2026-08-29] 肉鸽专属任务面板
import { useArmamentConfig } from './hooks/useArmamentConfig'; // [2026-08-29] 碳原子板武装快照
import { LevelUpToast } from './components/roguelike/LevelUpToast'; // [2026-08-12 天启者养成] 升级弹窗
import { SACRIFICE_MAX_HP, type RandomTreasureResult } from './data/roguelike/treasure'; // [2026-08-12 宝箱节点]
import { getHallBgmByIndex, getHallBgmByVideoUrl } from './data/movieData'; // [核心重构] 新增视频 URL 直查 BGM
import { getCompletedStages, isGuidanceDismissed, dismissGuidance } from './utils/tutorialProgress'; // [新增] 引导层状态
import { motion, AnimatePresence } from 'framer-motion';

// [2026-08-29] 通关/败亡结算信息（天启者经验动画：起点/终点 + 倍率明细）
type RogueRunEndInfo = {
    won: boolean;
    heroKey: string;
    fromLevel: number; // 结算前等级（动画起点）
    fromExp: number;   // 结算前经验
    toLevel: number;   // 结算后等级
    toExp: number;     // 结算后经验
    expGained: number; // 本次获得经验
    detail: RogueSettleDetail;
};

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
  const armamentConfig = useArmamentConfig(); // [2026-08-29] 碳原子板等武装快照
  const [levelUpInfo, setLevelUpInfo] = useState<{ heroKey: string; fromLevel: number; toLevel: number } | null>(null); // [2026-08-12] 升级弹窗信息
  const [expToast, setExpToast] = useState<{ heroKey: string; amount: number } | null>(null); // [2026-08-12] 结算经验浮层
  const [expFeed, setExpFeed] = useState<ExpFeedItem[]>([]); // [2026-08-29] 局内经验/升级横幅队列
  const expFeedIdRef = useRef(0);
  const [rogueEncounter, setRogueEncounter] = useState<any>(null);
  const [rogueEventBattle, setRogueEventBattle] = useState<{ reward: 'enhancement' | 'choose2' } | null>(null); // [2026-08-28 事件] 事件战斗胜利奖励标志
  const [rogueReward, setRogueReward] = useState<{ gold: number; options: RewardCardOption[]; pendingPacks?: number } | null>(null); // [2026-08-15] 胜利奖励三选一（3 个候选卡）；[2026-08-25] 候选卡带 equipId；[2026-08-29] 胜利附带待打开卡包
  const [rogueHeroRecruit, setRogueHeroRecruit] = useState<{ options: HeroRecruitOption[]; subNote?: string } | null>(null); // [2026-09-04 首战大捷] 天启者招募三选一（一次性）
  const [rogueBattleType, setRogueBattleType] = useState<RogueNodeType | null>(null);
  const [rogueBattleNodeId, setRogueBattleNodeId] = useState<string | null>(null); // [2026-08-10] 当前战斗节点 id（胜利后标记击败）
  const [rogueBattleArchetypeId, setRogueBattleArchetypeId] = useState<string | undefined>(undefined); // [2026-08-25 开发者] 进战斗的敌人流派 id（重开当前战斗重建遭遇用）
  const [rogueBattleBuffs, setRogueBattleBuffs] = useState<string[] | undefined>(undefined); // [2026-08-27 莉莉子] 当前战斗节点预分配的迷宫强化（重开重建遭遇用，与地图预览一致）
  const [rogueHeroKey, setRogueHeroKey] = useState<string | null>(null); // [2026-08-07 肉鸽主界面] 已选天启者
  const [rogueMissionOpen, setRogueMissionOpen] = useState(false); // [2026-08-07 肉鸽主界面] 任务面板开关
  const [evaluationOpen, setEvaluationOpen] = useState(false); // [2026-08-29 评估嘉勉] 分析员等级面板开关
  const [rogueCodexOpen, setRogueCodexOpen] = useState(false); // [2026-08-20 逻辑研习] 肉鸽图鉴开关
  const [preBattleHpSnapshot, setPreBattleHpSnapshot] = useState<number | null>(null); // [2026-08-11 全局 HP 衔接] 进战斗前全局 HP 快照（中途退出回滚用）
  const [rogueMapReveal, setRogueMapReveal] = useState(false); // [2026-08-28 莉莉子 推演开场] 本局首进地图播开场动画（播完复位，战斗返回不重播）
  // [2026-08-28 对局记录] 未结算对局：暂离存盘可继续 / 结算拿经验
  const [hasPendingRun, setHasPendingRun] = useState(false);          // 是否有未结算的肉鸽对局（大厅显示结算/继续，前往推演置灰）
  const [rogueLeaveConfirm, setRogueLeaveConfirm] = useState(false); // 返回二次确认弹窗开关（地图返回 / 大厅结算共用）
  const [rogueSettleInfo, setRogueSettleInfo] = useState<{ run: RoguelikeRunState; expGained: number; leveled: { fromLevel: number; toLevel: number } | null; detail: RogueSettleDetail } | null>(null); // 中途结算窗数据
  const [rogueRunEnd, setRogueRunEnd] = useState<RogueRunEndInfo | null>(null); // [2026-08-29] 通关/败亡结算（天启者经验动画）
  const rogueStatsRef = useRef({ elites: 0, enhancements: 0, events: 0 }); // [2026-08-29] 肉鸽任务对局统计（结算时入账）
  const leaveSourceRef = useRef<'map' | 'lobby'>('map'); // 返回确认弹窗来源（地图=暂离存盘；大厅=仅关闭）

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

  // [2026-08-28 对局记录] 启动时恢复未结算的肉鸽对局（暂离后刷新页面也能找回）
  useEffect(() => {
      const saved = rogue.loadPendingRun();
      if (saved) setHasPendingRun(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } else if (rogueEncounter && rogue.run && rogue.run.status === 'active') {
      // [2026-09-02 莉莉子 修复] 加 rogueEncounter 判据：暂离肉鸽只 savePendingRun 不清内存，
      // 残留 rogue.run.status='active' 会把后续 PvE（地下清理）的 loading 完成劫持成 rogue_game；
      // 而 PvE 从不 setRogueEncounter（肉鸽进战斗先 setRogueEncounter 再 loading），
      // 加判据后仅"确实来自肉鸽战斗"才进 rogue_game，杜绝黑屏卡死。
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

  // [2026-08-30 莉莉子] 暂停层「关机」按钮：退出并关闭游戏（Electron nodeIntegration 下 window.close 关窗）
  const handleQuitGame = () => {
    eventBus.emit(GameEvents.UI_CLICK);
    window.close();
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
    // [2026-08-29] 开局重置本局任务统计
    rogueStatsRef.current = { elites: 0, enhancements: 0, events: 0 };
    // [2026-08-29 经验重构] 本局武装快照（碳原子板"通关经验翻倍"，未通关不消耗不翻倍）
    const armForHero = armamentConfig.getArmament(rogueHeroKey, heroLevel).filter((v): v is string => !!v);
    rogue.startRun(rogueHeroKey, getConfiguredStarterDeck(userSystem.decks, rogueHeroKey), difficulty, {
      maxHp: bonus.maxHpBonus,
      gold: bonus.goldBonus,
      reviveCount: bonus.reviveBonus,
      refreshCount: bonus.refreshBonus,
      extraEnhancements: bonus.grantedEnhancements,
      extraEquipments: bonus.grantedEquipments,
      grantedSpellEquips: bonus.grantedSpellEquips, // [2026-08-29] 随机法术卡持减费装（现名「海基的推演手记」，原「微缩回路」）
      grantedUnitEquips: bonus.grantedUnitEquips,   // [2026-08-29] 随机非英雄单位获均衡增补/强攻模板
      armaments: armForHero,                        // [2026-08-29] 武装快照（碳原子板）
      expRateBonus: bonus.expRateBonus,             // [2026-08-29] 经验获取效率加成
      passUnlockedEnhancements: userSystem.settings?.passUnlockedEnhancements, // [2026-08-29 通行证] 已解锁强化
      equipRarityBonus: bonus.equipRarityBonus, // [2026-08-29] 装备稀有度加成
      heroLevel,
      rarityBonus: bonus.rarityBonus,
    });
    playBgm('deck_builder'); // [2026-08-28 莉莉子 推演开场] 地图播备战曲（配老电视显影开场）
    setRogueMapReveal(true); // [2026-08-28 莉莉子 推演开场] 本局首进地图播推演开场动画
    rogue.clearPendingRun(); // [2026-08-28 对局记录] 开新局清除旧的未结算存档
    setHasPendingRun(false); // [2026-08-28 对局记录] 开新局
    setAppState('rogue_map');
  };

  // ═══ [2026-08-28 对局记录] 返回二次确认 / 暂离 / 结算 / 继续 ═══

  /** 打开返回二次确认弹窗（地图返回 / ESC / 大厅结算共用） */
  const openRogueLeaveConfirm = () => setRogueLeaveConfirm(true);

  /** 暂离：保存当前对局到 localStorage，回大厅可「继续」 */
  const handleRogueLeave = () => {
    rogue.savePendingRun();
    setHasPendingRun(true);
    setRogueLeaveConfirm(false);
    playBgm('default'); // 回大厅 BGM
    setAppState('rogue_lobby');
  };

  /** 继续：恢复未结算对局进地图 */
  const handleRogueResume = () => {
    if (!rogue.loadPendingRun()) return; // 读回（幂等，已在启动时恢复则无副作用）
    rogue.resetStartedAt(); // [2026-08-29] 恢复对局重开计时（排除暂离离线时长，速通计时只算在场）
    setHasPendingRun(false);
    setAppState('rogue_map');
  };

  // ═══ [2026-08-29 经验重构] 局内渐进经验 + 结算经验 ═══

  /** 局内经验/升级轻量横幅（2.5s 自动消失，最多保留 4 条） */
  const pushExpFeed = (text: string, tone: 'exp' | 'level' = 'exp') => {
    const id = ++expFeedIdRef.current;
    setExpFeed(prev => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setExpFeed(prev => prev.filter(f => f.id !== id)), 2500);
  };

  /** [2026-09-04 账号等级/战绩] 标准 PvE / 教程 真实对局结算：账号经验 + 战绩（由 GameOverScreen 一次性上抛）
   *  迷宫不在这里计（整局在 settleRun 结算一次，避免逐节点重复）。 */
  const handleRealMatchSettled = ({ result, mode, heroKeys }: { result: 'victory' | 'defeat'; mode: 'pve' | 'tutorial' | 'rogue'; heroKeys: string[] }) => {
    if (mode === 'rogue') return;
    const expCfg = ACCOUNT_EXP_BY_MODE[mode];
    const exp = expCfg[result === 'victory' ? 'win' : 'lose'];
    const accLeveled = userSystem.grantAccountExp(exp);
    userSystem.recordBattle({ won: result === 'victory', mode, heroKeys });
    pushExpFeed(`账号经验 +${exp}`);
    if (accLeveled.leveled.length > 0) {
      accLeveled.leveled.forEach((l: { from: number; to: number }) => pushExpFeed(`账号 Lv.${l.from} → ${l.to}`, 'level'));
      pushExpFeed(`+${ACCOUNT_LEVEL_REWARD_DATA_GOLD} 数据金`);
    }
  };

  /** 过节点发经验（深度×难度；按节点去重；局内只弹横幅，升级不弹全屏 LevelUpToast） */
  const grantNodeExp = (nodeId: string, type: RogueNodeType) => {
    if (!rogue.run) return;
    const depthFrac = getNodeDepth(rogue.run.difficulty).get(nodeId) ?? 0;
    const amount = computeNodeExp(type, depthFrac, rogue.run.difficulty);
    if (!rogue.grantNodeExp(nodeId, amount)) return; // 已发过该节点 → 跳过
    const leveled = heroProgression.addHeroExp(rogue.run.heroKey, amount);
    pushExpFeed(`+${amount} 经验`);
    if (leveled) pushExpFeed(`Lv ${leveled.fromLevel} → ${leveled.toLevel}`, 'level');
  };

  /** 整局结算：经验差额（节点已发部分不重复入账；时长/效率/共鸣/通关在此补入）+ 倍率明细（结算窗展示）
   *  [2026-09-15 程拍板] 结局三态，判定完全分开：victory 通关 / defeat 败北 / abandon 中途放弃（完全不算一局） */
  const settleRun = (opts: { outcome: 'victory' | 'defeat' | 'abandon' }): { bonus: number; detail: RogueSettleDetail } => {
    if (!rogue.run) return { bonus: 0, detail: { durationMin: 0, timeMult: 1, diffMult: 1, ratePct: 0, resonance: false, clearExp: 0 } };
    const run = rogue.run;
    const won = opts.outcome === 'victory';
    const durationMs = Math.max(0, Date.now() - run.startedAt);
    // [2026-09-15 程拍板] 中途放弃 = 完全不算一局：不计战绩 / 不满足任务 / 不入账号与分析员经验 /
    //   不发结算经验差额 / 碳原子板不消耗也不翻倍。（局内逐节点已发的经验不回滚 —— 走到节点就该拿）
    if (opts.outcome === 'abandon') {
      return {
        bonus: 0,
        detail: { durationMin: Math.round(durationMs / 6000) / 10, timeMult: 1, diffMult: DIFFICULTY_EXP_MULT[run.difficulty], ratePct: 0, resonance: false, clearExp: 0, abandoned: true },
      };
    }
    // [2026-09-15 程拍板] 碳原子板只在通关时发挥（翻倍 + 消耗）：玩家带它是奔着赢去的，败北本就经验少，
    //   再扣一件消耗品 = 赔了夫人又折兵。未通关一律不消耗、不翻倍，原封不动留到下一局。
    const resonanceHeld = (run.armaments ?? []).includes('arm_resonance_crystal');
    const resonance = won && resonanceHeld; // 仅通关真正生效（消耗 / 翻倍 / 结算演出全部由此派生）
    const ratePct = run.expRateBonus ?? 0;
    const rate = 1 + ratePct / 100;
    const reso = resonance ? 2 : 1;
    // [2026-09-08 莉莉子] 剩余资源折算天启者经验：仅通关（won）才转换，中途退出/失败不转换。
    // 防"开局即结算刷等级"（原为通关/败北/中途一律折算；死亡剩血按 0 特判随语义一并收敛）。吃效率加成与共鸣翻倍，不吃速通时长。
    const aliveHp = run.status === 'dead' ? 0 : run.hp;
    const resourceRaw = won ? computeResourceExp({ hp: aliveHp, gold: run.gold, revive: run.reviveCount, refresh: run.refreshCount }) : null;
    const resourceExp = resourceRaw ? Math.round(resourceRaw.exp * rate * reso) : 0;
    // [2026-09-08 程拍板] 重修申请·难度档消耗品：通关按难度定目标档（普通→史诗 / 机密→传说 / 绝密→神话），
    // 本局每个装有重修且该槽未达目标档的槽各升一档、各消耗 1 份库存并卸下该槽（多槽可同局分别升；已达更高档不发挥不消耗）。
    let retrainFiredSlots: number[] = [];
    let retrainTier = 0;
    if (won) {
      const unlockN = getHeroLevelBonus(run.heroLevel ?? 1).armamentSlots;
      const targetTier = run.difficulty === 'topsecret' ? 3 : run.difficulty === 'secret' ? 2 : 1;
      const slotsBefore = armamentConfig.getArmament(run.heroKey); // 改动前快照（防升档/卸槽互相干扰定位）
      slotsBefore.forEach((v, i) => {
        if (i >= unlockN || v !== 'arm_retrain') return;
        if (armamentConfig.upgradeQualityTo(run.heroKey, i, targetTier)) {
          armamentConfig.setArmamentSlot(run.heroKey, i, null); // 该份发挥后卸槽
          userSystem.removeOwnedArmament('arm_retrain', 1);     // 库存 -1（不足则忽略）
          retrainFiredSlots.push(i);
        }
      });
      retrainTier = targetTier;
      if (retrainFiredSlots.length > 0) {
        const tierLabel = targetTier === 3 ? '神话' : targetTier === 2 ? '传说' : '史诗';
        pushExpFeed(`🔧 重修申请生效：${retrainFiredSlots.length} 个武装槽品质提升至【${tierLabel}】`, 'level');
      }
    }
    // [2026-09-15 程拍板 取代 09-08 旧规则] 碳原子板·消耗品：仅通关时经验翻倍生效 → 消耗 1 份并卸下所在槽
    //（败北 / 中途放弃不消耗也不翻倍 —— 玩家带它是奔着赢去的，败北还扣道具等于赔了夫人又折兵）
    //（共鸣为整局型单次效果，同英雄限装 1 份，见武装界面 stockOf 约束）
    let resoSlotFired = -1;
    if (resonance) {
      const slotIdx = armamentConfig.getArmament(run.heroKey).indexOf('arm_resonance_crystal');
      if (slotIdx >= 0) {
        userSystem.removeOwnedArmament('arm_resonance_crystal', 1);
        armamentConfig.setArmamentSlot(run.heroKey, slotIdx, null);
        resoSlotFired = slotIdx;
      }
    }
    const finalTotal = computeRunExpTotal(run.expFromNodes, {
      won,
      difficulty: run.difficulty,
      durationMs,
      expRateBonusPct: ratePct,
      resonance,
    });
    // [2026-08-29 评估嘉勉] 对局结束 → 累加肉鸽专属任务（完成/通关/精英/强化/事件/金币）
    missionSystem.recordRogueRun({
        won,
        elites: rogueStatsRef.current.elites,
        enhancements: rogueStatsRef.current.enhancements,
        events: rogueStatsRef.current.events,
        gold: run.gold,
    });
    // [2026-08-29 通行证] 对局给分析员经验（完成任意结局 +150，通关额外 +400 共 550）
    userSystem.grantAnalystExp(won ? 550 : 150);
    // [2026-09-04 账号等级系统] 迷宫整局 → 账号经验 + 战绩（settleRun 是整局唯一收口：通关/败北/主动结算各一次）
    const accExp = ACCOUNT_EXP_BY_MODE.rogue[won ? 'win' : 'lose'];
    const accLeveled = userSystem.grantAccountExp(accExp);
    userSystem.recordBattle({ won, mode: 'rogue', heroKeys: [run.heroKey] });
    pushExpFeed(`账号经验 +${accExp}`);
    if (accLeveled.leveled.length > 0) {
      accLeveled.leveled.forEach((l: { from: number; to: number }) => pushExpFeed(`账号 Lv.${l.from} → ${l.to}`, 'level'));
      pushExpFeed(`+${ACCOUNT_LEVEL_REWARD_DATA_GOLD} 数据金`);
    }
    const bonus = Math.max(0, finalTotal - run.expFromNodes) + resourceExp; // 节点差额（通关/时长/效率/共鸣）+ 剩余资源折算
    const detail: RogueSettleDetail = {
      durationMin: Math.round(durationMs / 6000) / 10, // 分钟（一位小数）
      timeMult: won ? timeExpMult(durationMs) : 1, // [2026-09-15 程拍板] 速通倍率仅通关生效
      diffMult: DIFFICULTY_EXP_MULT[run.difficulty],
      ratePct,
      resonance,
      clearExp: won ? CLEAR_EXP[run.difficulty] : 0,
      resource: resourceRaw ? { ...resourceRaw, exp: resourceExp } : undefined, // [2026-09-08 莉莉子] 仅通关结算才带剩余资源折算（中途/失败为 undefined，结算窗自动隐藏）
      resonanceSlot: resoSlotFired >= 0 ? resoSlotFired : undefined, // [2026-09-08 结算演出] 共鸣消耗槽位
      retrain: retrainFiredSlots.length > 0 ? { slots: retrainFiredSlots, tier: retrainTier } : undefined, // [2026-09-08 结算演出] 重修升档槽位/目标档
    };
    return { bonus, detail };
  };

  /** 结算本场（中途主动结算 / 大厅结算）：[2026-09-15 程拍板] 完全不算一局 —— 不发经验/不计战绩/不满足任务，仅展示进度窗并结束对局 */
  const handleRogueSettle = () => {
    if (!rogue.run) return;
    const run = rogue.run;
    const heroKey = run.heroKey;
    const { bonus: gained, detail } = settleRun({ outcome: 'abandon' }); // [2026-09-15 程拍板] 中途放弃：完全不算一局，不结算任何经验
    const leveled = heroProgression.addHeroExp(heroKey, gained);
    if (leveled) setLevelUpInfo({ heroKey, fromLevel: leveled.fromLevel, toLevel: leveled.toLevel });
    setExpToast({ heroKey, amount: gained });
    setRogueSettleInfo({ run: { ...run }, expGained: gained, leveled, detail }); // 快照供结算窗展示
    rogue.clearPendingRun();
    rogue.resetRun();
    setHasPendingRun(false);
    setRogueLeaveConfirm(false);
    setPreBattleHpSnapshot(null);
    setRogueEncounter(null);
    setRogueReward(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    playBgm('default');
  };

  /** 结算窗关闭 → 回大厅 */
  const handleRogueSettleDone = () => {
    setRogueSettleInfo(null);
    setAppState('rogue_lobby');
  };

  // [2026-08-11 全局 HP 衔接] 移除 handleRogueBackToLobby：战斗内退出改"放弃本场回地图"（onExit），整局作废由地图 RunEndModal 承担

  const handleRogueBattle = (nodeType: RogueNodeType, archetypeId?: string, nodeId?: string, enemyBuffs?: string[]) => {
    if (!rogue.run) return;
    // [2026-08-10] 用节点预分配的敌人流派（保证地图头像与实际对手一致）
    // [2026-08-16 莉莉子] nodeType 断言收窄：buildRoguelikeEncounter 仅支持 battle/elite/boss（其余节点不会进战斗）
    // [2026-08-27 莉莉子] 断链修复：把节点预分配的迷宫强化（roll 子集）传给战斗，与地图预览一致
    // [2026-08-31 莉莉子 开发者] 合并开发者注入的敌方强化（任意增强节点选的，注入下一场战斗）
    const mergedEnemyBuffs = [
      ...(enemyBuffs ?? []),
      ...(rogue.run.devEnemyEnhancements ?? []),
    ];
    const encounter = buildRoguelikeEncounter(nodeType as 'battle' | 'elite' | 'boss', rogue.run.act, rogue.run.difficulty, archetypeId, mergedEnemyBuffs);
    // [2026-08-28 事件] 未来敌人强化（饥渴的虚空）：构建遭遇时消耗一层，追加敌方水晶血量
    const fightDebuff = rogue.consumeFightDebuff();
    if (fightDebuff && encounter.enemyNexusHp != null) {
      encounter.enemyNexusHp += fightDebuff.enemyHpBonus;
    }
    setRogueEncounter(encounter);
    setRogueBattleType(nodeType);
    setRogueBattleNodeId(nodeId ?? null); // [2026-08-10] 记录当前战斗节点，胜利后标记击败
    setRogueBattleArchetypeId(archetypeId); // [2026-08-25 开发者] 缓存流派，重开当前战斗重建遭遇用
    setRogueBattleBuffs(mergedEnemyBuffs); // [2026-08-27 莉莉子] 缓存节点预分配迷宫强化，重开当前战斗保持同一份
    setPreBattleHpSnapshot(rogue.run.hp); // [2026-08-11] 存进战斗前 HP 快照（中途退出回滚）
    stopMovie();
    setAppState('loading');
  };

  const handleRogueVictory = (playerNexus?: number, ovType?: RogueNodeType, ovNodeId?: string) => {
    if (!rogue.run) return;
    // [2026-08-29] 一键胜利（节点详情）时用 override 的节点类型/id；否则用当前战斗状态
    const battleType = ovType ?? rogueBattleType;
    const battleNodeId = ovNodeId ?? rogueBattleNodeId;
    // [2026-08-28 事件] 战斗胜利投资回报（播种希望）：任何战斗胜利都结算
    const goldInvs = rogue.consumeInvestments('battleWinGold');
    if (goldInvs.length) for (const g of goldInvs) rogue.addGold(g.value ?? 0);

    // [2026-08-28 事件] 事件战斗胜利 → 事件奖励（不结算节点）
    if (rogueEventBattle) {
      const enh = pickRandomEnhancements(1, undefined, { rare: 0, epic: 60, legendary: 40 }, rogue.run.passUnlockedEnhancements)[0]; // [2026-08-29 通行证]
      if (enh) { rogue.applyEnhancement(enh.id); recordCodexUnlock('enhancement', enh.id); }
      if (rogueEventBattle.reward === 'choose2') {
        const equip = EQUIPMENT_DEFS[Math.floor(Math.random() * EQUIPMENT_DEFS.length)];
        rogue.addEquippedCard(rogue.run.heroKey, equip.id);
        recordCodexUnlock('equipment', equip.id);
      }
      rogue.setHp(playerNexus ?? rogue.run.hp);
      setRogueEventBattle(null);
      playBgm('deck_builder'); // [2026-08-28 莉莉子] 事件战斗胜利返回地图：恢复备战曲
      setPreBattleHpSnapshot(null);
      setRogueBattleType(null);
      setRogueBattleNodeId(null);
      setRogueEncounter(null);
      setAppState('rogue_map');
      return;
    }
    // [2026-08-10] 标记当前战斗节点已击败（地图红叉）
    if (battleNodeId) rogue.markDefeated(battleNodeId);
    // [2026-08-29 经验重构] 战斗胜利 → 发该节点经验（深度×难度；事件战斗已提前 return 不在此发）
    if (battleNodeId) grantNodeExp(battleNodeId, battleType ?? 'battle');
    // [2026-08-29 肉鸽任务] 击败精英统计（对局累计）
    if (battleType === 'elite') rogueStatsRef.current.elites++;
    // [2026-08-11 全局 HP 衔接] 真衔接：把战斗剩余水晶写回全局 HP（setHp 内部 clamp 到 [0, maxHp]）
    rogue.setHp(playerNexus ?? rogue.run.hp);
    if (battleType === 'boss') {
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

      // [2026-08-29 经验重构] 整局通关 → 结算经验（节点已发 + 通关大额 + 时长/效率/共鸣倍率）
      const heroKey = rogue.run.heroKey;
      const before = heroProgression.getHeroProgress(heroKey); // [2026-08-29] 结算前快照（动画起点）
      const { bonus: gained, detail } = settleRun({ outcome: 'victory' });
      const leveled = heroProgression.addHeroExp(heroKey, gained);
      const after = heroProgression.getHeroProgress(heroKey);
      setRogueRunEnd({ won: true, heroKey, fromLevel: before.level, fromExp: before.exp, toLevel: after.level, toExp: after.exp, expGained: gained, detail });
      if (leveled) setLevelUpInfo({ heroKey, fromLevel: leveled.fromLevel, toLevel: leveled.toLevel });
      setExpToast({ heroKey, amount: gained });
      // [2026-08-29 程拍板] 仅最终 Boss 通关给卡包（通关结算界面可打开随机武装）
      userSystem.grantPendingPack();
      // [2026-08-12 商店经济] Boss 通关大额金币（LOR 参考 Boss +200）
      rogue.addGold(200);
    } else {
      // [2026-08-12 商店经济] 提高战斗金币来源（LOR 参考普通敌 +100），按难度上浮
      const baseGold = 50 + rogue.run.act * 25;
      const diffMult = rogue.run.difficulty === 'topsecret' ? 1.5 : rogue.run.difficulty === 'secret' ? 1.25 : 1;
      const gold = Math.round(baseGold * diffMult);
      rogue.addGold(gold);
      if (!rogue.run.heroRecruitDone) {
        // [2026-09-04 程拍板] 首战胜利奖励替换：天启者招募三选一（一次性；招募/跳过后续战斗恢复正常卡奖励）
        const note = rogue.run.difficulty === 'normal'
          ? '普通推演 · 招募不携带装备'
          : rogue.run.difficulty === 'secret'
            ? '机密推演 · 候选天启者自带 绿/蓝 装备'
            : '绝密推演 · 候选天启者自带 蓝/紫 装备';
        setRogueHeroRecruit({ options: buildHeroRecruitOptions(rogue.run.heroKey, rogue.run.difficulty), subNote: note });
      } else {
        // 普通/精英胜利 → 卡牌三选一奖励（[2026-08-25] 候选卡随机佩戴装备，品质随 act 渐进；首战之后恢复正常）
        const options = generateRewardOptions(rogue.run.act, 3, {
          difficulty: rogue.run.difficulty,              // [2026-08-29] 难度品质上限
          equipRarityBonus: rogue.run.equipRarityBonus ?? 0, // [2026-08-29] 等级装备稀有度加成
          forceEquip: battleType === 'elite',       // [2026-08-29] 精英必带装备
        });
        // [2026-08-29 程拍板] 普通/精英战斗不再送卡包（仅最终 Boss 通关给）；三选一由玩家选择
        setRogueReward({ gold, options });
      }
    }
    playBgm('deck_builder'); // [2026-08-28 莉莉子] 返回地图切回备战曲（战斗 BGM 由 GameSession 触发，需在此复位）
    setPreBattleHpSnapshot(null); // [2026-08-11] 战斗已结算，快照失效
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueEncounter(null);
    setAppState('rogue_map');
  };
  /** [2026-08-29] 开发者一键胜利：节点详情直接跳过战斗（复用胜利结算：击败/经验/奖励/通关） */
  const handleRogueNodeDevWin = (nodeType: RogueNodeType, nodeId: string) => {
    handleRogueVictory(undefined, nodeType, nodeId);
  };
  // ═══ [2026-08-29 休整节点] 移动推进探路 + 休整三功能 ═══
  /** 移动节点：推进探路，回归时横幅提示 */
  const handleRogueMoveTo = (nodeId: string) => {
    const scoutRet = rogue.moveTo(nodeId);
    if (scoutRet?.returned) {
      const cardName = CARD_DB[scoutRet.cardKey]?.name ?? scoutRet.cardKey;
      const equipName = scoutRet.equipId ? getEquipmentById(scoutRet.equipId)?.name : '';
      pushExpFeed(`🗺️ ${cardName} 探路归来${equipName ? `，获得装备「${equipName}」` : ''}`, 'level');
    }
  };
  /** 休整·净化：免费移除一张卡 */
  const handleRogueRestRemove = (cardKey: string) => { if (rogue.run) rogue.removeCard(cardKey); };
  /** 休整·复制：复制一张卡进牌组 */
  const handleRogueRestCopy = (cardKey: string) => { if (rogue.run) rogue.addCard(cardKey); };
  /** 休整·探路：派出单位卡（暂时移出牌组，2 节点后回归带装备） */
  const handleRogueRestScout = (cardKey: string) => { rogue.startScout(cardKey); };

  const handleRogueDefeat = (_playerNexus?: number) => {
    // [2026-08-28 事件] 事件战斗失败 → 不死亡，扣 30% 当前命返回地图（可选挑战的代价）
    if (rogueEventBattle) {
      if (rogue.run) rogue.setHp(rogue.run.hp - Math.floor(rogue.run.maxHp * 0.3));
      setRogueEventBattle(null);
      playBgm('deck_builder'); // [2026-08-28 莉莉子] 事件战斗失败返回地图：恢复备战曲
      setPreBattleHpSnapshot(null);
      setRogueBattleType(null);
      setRogueBattleNodeId(null);
      setRogueEncounter(null);
      setAppState('rogue_map');
      return;
    }
    rogue.completeBattle(false); // → dead，回地图显示死亡结算（败北不写回 HP）
    // [2026-08-29 经验重构] 整局败北 → 结算经验（节点已发 + 时长/效率/共鸣差额）
    if (rogue.run) {
      const heroKey = rogue.run.heroKey;
      const before = heroProgression.getHeroProgress(heroKey); // [2026-08-29] 结算前快照（动画起点）
      const { bonus: gained, detail } = settleRun({ outcome: 'defeat' });
      const leveled = heroProgression.addHeroExp(heroKey, gained);
      const after = heroProgression.getHeroProgress(heroKey);
      setRogueRunEnd({ won: false, heroKey, fromLevel: before.level, fromExp: before.exp, toLevel: after.level, toExp: after.exp, expGained: gained, detail });
      if (leveled) setLevelUpInfo({ heroKey, fromLevel: leveled.fromLevel, toLevel: leveled.toLevel });
      setExpToast({ heroKey, amount: gained });
    }
    playBgm('deck_builder'); // [2026-08-28 莉莉子] 返回地图切回备战曲（战斗 BGM 由 GameSession 触发，需在此复位）
    setPreBattleHpSnapshot(null); // [2026-08-11] 战斗已结算，快照失效
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueEncounter(null);
    setAppState('rogue_map');
  };

  // [2026-08-26 莉莉子] 逻辑研习·图鉴解锁记录：获得强化/装备时写入 settings（开发者账号全解锁不记录）
  const recordCodexUnlock = (type: 'enhancement' | 'equipment', id: string) => {
    if (!id || userSystem.userId === 'dev_full_admin') return;
    const cur = type === 'enhancement'
      ? (userSystem.settings?.unlockedRogueEnhancements ?? [])
      : (userSystem.settings?.unlockedRogueEquipments ?? []);
    if (cur.includes(id)) return;
    if (type === 'enhancement') userSystem.updateSettings({ unlockedRogueEnhancements: [...cur, id] });
    else userSystem.updateSettings({ unlockedRogueEquipments: [...cur, id] });
  };

  // [2026-08-15 莉莉子] 胜利奖励三选一：玩家选定一张卡 → 加入牌组并关闭弹窗
  // [2026-08-25] 候选卡可能带装备 → 选定后一并 addEquippedCard（装备附加到该卡所有副本）
  const handleRewardPick = (cardKey: string, equipId?: string) => {
    if (!rogue.run) return;
    rogue.addCard(cardKey);
    if (equipId) {
      rogue.addEquippedCard(cardKey, equipId);
      recordCodexUnlock('equipment', equipId); // [2026-08-26] 图鉴解锁
    }
    setRogueReward(null);
  };
  /** [2026-08-29] 跳过卡牌奖励：放弃三选一，只拿金币 */
  const handleRewardSkip = () => setRogueReward(null);
  // [2026-09-04 首战招募] 选定天启者 → 本体卡 + 随行 2 张阵营卡入队；有装备则穿在英雄本体卡上
  const handleHeroRecruitPick = (heroKey: string) => {
    if (!rogue.run) { setRogueHeroRecruit(null); return; }
    const opt = rogueHeroRecruit?.options.find(o => o.heroKey === heroKey);
    if (!opt) { setRogueHeroRecruit(null); return; }
    rogue.addCard(heroKey);
    (opt.companionKeys ?? []).forEach(k => rogue.addCard(k));
    if (opt.equipId) {
      rogue.addEquippedCard(heroKey, opt.equipId);
      recordCodexUnlock('equipment', opt.equipId); // [2026-08-26] 图鉴解锁
    }
    rogue.markHeroRecruited();
    setRogueHeroRecruit(null);
  };
  /** [2026-09-04 首战招募] 跳过招募（放弃英雄，金币保留）；标记已结算防止后续战斗重复触发 */
  const handleHeroRecruitSkip = () => {
    rogue.markHeroRecruited();
    setRogueHeroRecruit(null);
  };
  /** [2026-08-29] 刷新战斗奖励三选一：消耗刷新次数，重新生成候选卡 */
  const handleRewardRefresh = () => {
    if (!rogue.run) return;
    if (!rogue.useRefresh()) return; // 刷新次数不足
    const options = generateRewardOptions(rogue.run.act, 3, {
      difficulty: rogue.run.difficulty,
      equipRarityBonus: rogue.run.equipRarityBonus ?? 0,
      forceEquip: rogueBattleType === 'elite',
    });
    setRogueReward(prev => prev ? { ...prev, options } : prev);
  };
  /** [2026-08-29] 迷宫强化三选一刷新：消耗刷新次数，返回是否成功（RogueMapScreen 重新生成候选） */
  const handleRogueEnhanceRefresh = (): boolean => {
    if (!rogue.useRefresh()) return false;
    return true;
  };
  /** [2026-08-29] 三选一界面打开卡包：随机武装，返回武装 id（BattleRewardModal 展示） */
  const handleRewardOpenPack = (): string | null => {
    const pick = userSystem.openPack?.();
    return pick ?? null;
  };

  const handleRogueRest = () => {
    if (!rogue.run) return;
    // [2026-08-28 事件] 牺牲祝福：本局休息回血翻倍（一次性投资结算）
    const restInv = rogue.consumeInvestments('restHeal');
    const pct = restInv.length ? 0.6 : 0.3;
    rogue.heal(Math.floor(rogue.run.maxHp * pct));
  };

  const handleRogueEnhance = (key: string) => {
    rogue.applyEnhancement(key); // [2026-08-05] 迷宫强化：选择并应用效果
    recordCodexUnlock('enhancement', key); // [2026-08-26] 图鉴解锁
    rogueStatsRef.current.enhancements++; // [2026-08-29 肉鸽任务] 获得强化统计
  };

  /** [2026-08-31 莉莉子 开发者] 开发者任意选强化确认：玩家强化多选叠加 + 敌方强化注入下一场战斗 */
  const handleRogueDevPick = (playerIds: string[], enemyIds: string[]) => {
    if (playerIds.length) {
      rogue.applyDevEnhancements(playerIds); // 多选叠加（applyEnhancement 自带去重）
      playerIds.forEach(id => { recordCodexUnlock('enhancement', id); rogueStatsRef.current.enhancements++; }); // [2026-08-26] 图鉴解锁 + 任务统计
    }
    if (enemyIds.length) rogue.setDevEnemyEnhancements(enemyIds); // 敌方强化注入（覆盖式，便于反复调组合）
  };

  // ==========================================
  // [2026-08-12 商店经济] 商店购买 / 刷新（返回是否成功，金币不足返回 false）
  // ==========================================
  const handleRogueBuyCard = (cardKey: string, equipId: string | undefined, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.addCard(cardKey);
    if (equipId) {
      rogue.addEquippedCard(cardKey, equipId); // 带装备的卡：装备附加到该卡所有副本
      recordCodexUnlock('equipment', equipId); // [2026-08-26] 图鉴解锁
    }
    return true;
  };
  const handleRogueBuyEnhancement = (enhancementId: string, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.applyEnhancement(enhancementId); // 即时型生效 / 战斗型进 enhancements
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
    return true;
  };
  // [2026-09-10 莉莉子] 装备页签改批量：先选天启者、再多选装备，点购买一次性扣总价并全部挂到该英雄身上（不受武装槽位限制）
  const handleRogueBuyEquipment = (heroKey: string, equipmentIds: string[], totalPrice: number) => {
    if (!rogue.run) return false;
    if (equipmentIds.length === 0) return false;
    if (!rogue.spendGold(totalPrice)) return false;
    for (const equipmentId of equipmentIds) {
      rogue.addEquippedCard(heroKey, equipmentId); // 装备挂到所选天启者卡
      recordCodexUnlock('equipment', equipmentId); // [2026-08-26] 图鉴解锁
    }
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
    if (equipId) {
      rogue.addEquippedCard(cardKey, equipId); // 带装备的卡：装备附加到该卡
      recordCodexUnlock('equipment', equipId); // [2026-08-26] 图鉴解锁
    }
  };
  const handleRogueTreasureEnhancement = (enhancementId: string) => {
    rogue.applyEnhancement(enhancementId);
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
  };
  const handleRogueTreasureSacrifice = (enhancementId: string) => {
    rogue.adjustMaxHp(-SACRIFICE_MAX_HP); // 牺牲 -10 生命上限
    rogue.applyEnhancement(enhancementId); // 换取史诗强化
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
  };
  const handleRogueTreasureRandom = (result: RandomTreasureResult) => {
    switch (result.kind) {
      case 'gold': rogue.addGold(result.amount); break;
      case 'card':
        rogue.addCard(result.cardKey);
        if (result.equipId) {
          rogue.addEquippedCard(result.cardKey, result.equipId);
          recordCodexUnlock('equipment', result.equipId); // [2026-08-26] 图鉴解锁
        }
        break;
      case 'enhancement':
        rogue.applyEnhancement(result.enhancementId);
        recordCodexUnlock('enhancement', result.enhancementId); // [2026-08-26] 图鉴解锁
        break;
      case 'maxHp': rogue.adjustMaxHp(result.amount); break;
      case 'revive': rogue.addRevive(result.amount); break;
      case 'refresh': rogue.addRefresh(result.amount); break;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // [2026-08-28 事件系统] 随机抽取辅助 + 效果执行器 + 事件回调
  // ═══════════════════════════════════════════════════════════
  const randomCollectibleCard = (): string => {
    const pool = Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].key : 'fenny';
  };
  const randomJunkCard = (): string => {
    const pool = Object.values(CARD_DB).filter(c => c.isCollectible === false && !c.isChampion);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].key : randomCollectibleCard();
  };

  /** [2026-08-28 事件] 效果执行器：即时资源 / 卡牌 / 强化 / 装备 / 赌注 / 强制随机 / 投资 / 未来强化
   *  removeCards 在 forced 内为随机删（强制型）；顶层 removeCards 由弹窗自选（removePicks 在 handleRogueEvent 处理） */
  const applyEventEffects = (ef: RogueEventEffect) => {
    if (!rogue.run) return;
    if (ef.gold) rogue.addGold(ef.gold);
    if (ef.hp) { if (ef.hp > 0) rogue.heal(ef.hp); else rogue.setHp(rogue.run.hp + ef.hp); }
    if (ef.hpPct) {
      const amt = Math.floor(rogue.run.maxHp * ef.hpPct / 100);
      if (amt > 0) rogue.heal(amt); else rogue.setHp(rogue.run.hp + amt);
    }
    if (ef.maxHp) rogue.adjustMaxHp(ef.maxHp);
    if (ef.revive) rogue.addRevive(ef.revive);
    if (ef.refresh) rogue.addRefresh(ef.refresh);
    if (ef.addRandomCard) { const k = randomCollectibleCard(); if (k) rogue.addCard(k); }
    if (ef.addEquippedCard) {
      const offer = generateCardOffers(1)[0];
      rogue.addCard(offer.cardKey);
      if (offer.equipId) { rogue.addEquippedCard(offer.cardKey, offer.equipId); recordCodexUnlock('equipment', offer.equipId); }
    }
    if (ef.polluteDeck) { const k = randomJunkCard(); if (k) rogue.addCard(k); }
    if (ef.upgradeCard) {
      const nonHero = rogue.run.deck.filter(k => !CARD_DB[k]?.isChampion);
      if (nonHero.length) {
        const cardKey = nonHero[Math.floor(Math.random() * nonHero.length)];
        const equipPool = getEquipPoolForCard(CARD_DB[cardKey]); // [2026-08-29] 按卡筛：法术只配减费装备
        if (equipPool.length) {
          const equip = equipPool[Math.floor(Math.random() * equipPool.length)];
          rogue.addEquippedCard(cardKey, equip.id);
          recordCodexUnlock('equipment', equip.id);
        }
      }
    }
    if (ef.removeCards) {
      for (let i = 0; i < ef.removeCards; i++) {
        const deck = rogue.run.deck;
        if (!deck.length) break;
        rogue.removeCard(deck[Math.floor(Math.random() * deck.length)]);
      }
    }
    if (ef.addEnhancement) {
      const enh = pickRandomEnhancements(1, undefined, rogue.run.rarityBonus, rogue.run.passUnlockedEnhancements)[0]; // [2026-08-29 通行证]
      if (enh) { rogue.applyEnhancement(enh.id); recordCodexUnlock('enhancement', enh.id); }
    }
    if (ef.addEquipment) {
      const equip = EQUIPMENT_DEFS[Math.floor(Math.random() * EQUIPMENT_DEFS.length)];
      rogue.addEquippedCard(rogue.run.heroKey, equip.id);
      recordCodexUnlock('equipment', equip.id);
    }
    if (ef.removeEquipment) rogue.removeRandomEquipment();
    if (ef.gamble) {
      const won = Math.random() < ef.gamble.prob;
      for (const sub of (won ? ef.gamble.win : ef.gamble.lose)) applyEventEffects(sub);
    }
    if (ef.forced && ef.forced.length) {
      for (const sub of ef.forced[Math.floor(Math.random() * ef.forced.length)]) applyEventEffects(sub);
    }
    if (ef.invest) rogue.addInvestment(ef.invest);
    if (ef.fightDebuff) rogue.addFightDebuff(ef.fightDebuff);
  };

  /** [2026-08-28 事件] 事件选项回调：先删卡（removePicks 自选）→ 执行效果 → 战斗型触发事件战斗 */
  const handleRogueEvent = (eventId: string, choiceIndex: number, removePicks?: string[]) => {
    if (!rogue.run) return;
    rogueStatsRef.current.events++; // [2026-08-29 肉鸽任务] 完成事件统计
    const ev = ROGUE_EVENT_BY_ID[eventId];
    if (!ev) return;
    const choice = ev.choices[choiceIndex];
    if (!choice) return;
    for (const k of removePicks ?? []) rogue.removeCard(k);
    let shouldFight = false;
    let fightReward: 'enhancement' | 'choose2' = 'enhancement';
    for (const ef of choice.effects) {
      if (ef.fight) { shouldFight = true; fightReward = ef.fight.reward; continue; }
      if (ef.removeCards && (removePicks?.length ?? 0) > 0) {
        const { removeCards: _rc, ...rest } = ef;
        applyEventEffects(rest as RogueEventEffect);
        continue;
      }
      applyEventEffects(ef);
    }
    // 事件战斗：切换到战斗（胜利走 handleRogueVictory 事件奖励分支）
    if (shouldFight) {
      setRogueEventBattle({ reward: fightReward });
      const encounter = buildRoguelikeEncounter('elite', rogue.run.act, rogue.run.difficulty, undefined, undefined);
      setRogueEncounter(encounter);
      setPreBattleHpSnapshot(rogue.run.hp);
      stopMovie();
      setAppState('loading');
    }
  };

  const handleRogueRunEnd = () => {
    const wasWin = rogue.run?.status === 'won'; // [2026-08-29] 通关 → 肉鸽大厅
    rogue.resetRun();
    rogue.clearPendingRun(); // [2026-08-28 对局记录] 整局结束（通关/死亡）清除未结算存档
    setHasPendingRun(false); // [2026-08-28 对局记录]
    setPreBattleHpSnapshot(null); // [2026-08-11] 整局结束，快照失效
    setRogueEncounter(null);
    setRogueReward(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueRunEnd(null); // [2026-08-29] 结算信息清空
    if (wasWin) setAppState('rogue_lobby'); // 通关 → 返回肉鸽大厅
    else handleBackToModeSelect(); // 败亡 → 回模式选择
  };

  // [2026-08-11 全局 HP 衔接] 中途退出（放弃本场）：HP 回滚到进战斗前，本局保留
  const handleRogueBattleExit = () => {
    if (preBattleHpSnapshot !== null) rogue.setHp(preBattleHpSnapshot); // 回滚进战前 HP
    playBgm('deck_builder'); // [2026-08-28 莉莉子] 放弃本场返回地图：恢复备战曲
    setPreBattleHpSnapshot(null);
    setRogueEncounter(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setAppState('rogue_map');
  };

  // [2026-08-25 莉莉子 开发者] 重开当前肉鸽战斗（开发者账号测试用）：
  // HP 回滚到战斗前 → 重建同节点/同流派遭遇 → gameId 递增强制重挂战斗（loading 重进）
  const handleRogueRestartBattle = () => {
    if (!rogue.run || !rogueBattleType || !rogueBattleNodeId) return;
    if (preBattleHpSnapshot !== null) rogue.setHp(preBattleHpSnapshot); // 回滚进战前 HP（快照保持不变，重开后回到同一点）
    const encounter = buildRoguelikeEncounter(
      rogueBattleType as 'battle' | 'elite' | 'boss',
      rogue.run.act,
      rogue.run.difficulty,
      rogueBattleArchetypeId,
      rogueBattleBuffs // [2026-08-27 莉莉子] 重开保持同一份预分配迷宫强化
    );
    setRogueEncounter(encounter);
    setGameId(id => id + 1); // [重挂] key={rogue_${gameId}} 变化 → RogueGameWrapper/GameSession 重新初始化
    setAppState('loading'); // 走加载界面重进战斗
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
          // [2026-08-20 逻辑研习] 图鉴打开时 ESC 优先关闭图鉴（覆盖层，不改变 appState）
          if (rogueCodexOpen) {
              e.preventDefault(); e.stopImmediatePropagation();
              setRogueCodexOpen(false);
              return;
          }
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
              case 'rogue_map':            // [2026-08-28] 肉鸽地图 → 打开「结算/暂离」二次确认（不再直接切大厅丢局）
                  e.preventDefault(); e.stopImmediatePropagation();
                  eventBus.emit(GameEvents.UI_BACK);
                  leaveSourceRef.current = 'map';
                  openRogueLeaveConfirm();
                  return;
          }
          if (!isSettingsOpen) {
              eventBus.emit(GameEvents.UI_CLICK);
              setIsSettingsOpen(true);
          }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [appState, isSettingsOpen, rogueCodexOpen, handleBackToLobby, handleBackToModeSelect, handleBackFromStageSelect]);


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
    // ★ 悖论迷宫：使用所选天启者（[2026-09-02 莉莉子 修复] 加 rogueEncounter 判据，对齐 getEnemyDisplayHero，
    //   防暂离肉鸽残留 active run 时 PvE 加载界面误显肉鸽英雄）
    if (rogueEncounter && rogue.run && rogue.run.status === 'active') {
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
          // [2026-08-29 程拍板] 编辑器固定「加载界面卡面」优先（修碎图 / 固定显示）
          const arch = rogueBattleArchetypeId ? ENEMY_ARCHETYPES[rogueBattleArchetypeId] : undefined;
          if (arch?.loadingCardKey && CARD_DB[arch.loadingCardKey]) return arch.loadingCardKey;
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
                onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
                onQuitGame={handleQuitGame} // [2026-08-30 莉莉子] 暂停层关机 → 退出游戏
                isSettingsOpen={isSettingsOpen} // [2026-08-30 莉莉子] 暂停 ESC 协调
                onAccountSettle={handleRealMatchSettled} // [2026-09-04 账号等级/战绩]
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
                onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
                onQuitGame={handleQuitGame} // [2026-08-30 莉莉子] 暂停层关机 → 退出游戏
                isSettingsOpen={isSettingsOpen} // [2026-08-30 莉莉子] 暂停 ESC 协调
                onAccountSettle={handleRealMatchSettled} // [2026-09-04 账号等级/战绩]
            />
       )}
      {/* [新增] 6c. 悖论迷宫：主界面（大厅） */}
      {appState === 'rogue_lobby' && (
          <RogueLobby
              onBackToModeSelect={handleBackToModeSelect}
              onBackToLobby={handleBackToLobby}
              onSelectHero={() => setAppState('rogue_hero_select')}
              onOpenMission={() => setRogueMissionOpen(true)}
              onOpenEvaluation={() => setEvaluationOpen(true)} // [2026-08-29 评估嘉勉]
              onOpenCodex={() => setRogueCodexOpen(true)}
              onStartRun={handleRogueStartFromLobby}
              selectedHeroKey={rogueHeroKey}
              hasPendingRun={hasPendingRun} // [2026-08-28 对局记录] 未结算对局：前往推演置灰 + 显示结算/继续
              onSettleRun={() => { leaveSourceRef.current = 'lobby'; openRogueLeaveConfirm(); }} // 大厅结算 → 二次确认
              onResumeRun={handleRogueResume} // 继续上一局
              hasRogueClaimableReward={missionSystem.hasRogueClaimableReward} // [2026-09-03 BUG修复] 肉鸽任务可领 → 推演任务按钮黄点
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
              onBackRequest={() => { leaveSourceRef.current = 'map'; openRogueLeaveConfirm(); }} // [2026-08-28 对局记录] 地图返回 → 结算/暂离二次确认
              reveal={rogueMapReveal} // [2026-08-28 莉莉子 推演开场] 本局首进地图播开场动画
              onRevealEnd={() => setRogueMapReveal(false)} // [2026-08-28 莉莉子] 开场播完复位（战斗返回不重播）
              onBattle={handleRogueBattle}
              onMoveTo={handleRogueMoveTo} // [2026-08-29] 推进探路 + 回归提示
              onEnterNode={(node) => grantNodeExp(node.id, node.type)} // [2026-08-29] 过节点发经验
              runEnd={rogueRunEnd ?? undefined} // [2026-08-29] 通关/败亡结算（天启者经验动画）
              onRest={handleRogueRest}
              onRestRemove={handleRogueRestRemove} // [2026-08-29] 休整·净化删卡
              onRestCopy={handleRogueRestCopy}     // [2026-08-29] 休整·复制卡
              onRestScout={handleRogueRestScout}   // [2026-08-29] 休整·探路
              onEnhance={handleRogueEnhance}
              onRewardPick={handleRewardPick}
              onRewardSkip={handleRewardSkip} // [2026-08-29] 跳过卡牌奖励
              onRewardRefresh={handleRewardRefresh} // [2026-08-29] 刷新三选一
              heroRecruit={rogueHeroRecruit} // [2026-09-04] 首战天启者招募三选一
              onHeroRecruitPick={handleHeroRecruitPick}
              onHeroRecruitSkip={handleHeroRecruitSkip}
              onRefreshEnhance={handleRogueEnhanceRefresh} // [2026-08-29] 刷新强化三选一
              onOpenPack={handleRewardOpenPack} // [2026-08-29] 三选一打开卡包
              onDevWin={userSystem.userId === 'dev_full_admin' ? handleRogueNodeDevWin : undefined} // [2026-08-29] 开发者一键胜利
              pendingPacks={userSystem.settings?.pendingPacks ?? 0} // [2026-08-29] 通关结算卡包
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
              onEvent={handleRogueEvent} // [2026-08-28 事件系统]
              onConsumeEnhancementRank={() => rogue.consumeInvestments('enhancementRank')} // [2026-08-28] 托付遗物投资消费
              isDev={userSystem.userId === 'dev_full_admin'} // [2026-08-31 莉莉子 开发者] 开发者走任意选强化
              onDevPick={handleRogueDevPick} // [2026-08-31 莉莉子 开发者] 多选确认
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
              // [2026-08-28 莉莉子 修复] 肉鸽战斗用该英雄个性化配置的卡背/牌桌（rogue_starter_{heroKey} 牌组，兜底全局设置）
              deskIndex={userSystem.decks.find((d: any) => d.id === `rogue_starter_${rogue.run!.heroKey}`)?.boardIndex ?? (userSystem.settings.customization?.currentDeskIndex ?? 0)}
              cardBackIndex={userSystem.decks.find((d: any) => d.id === `rogue_starter_${rogue.run!.heroKey}`)?.cardBackIndex ?? (userSystem.settings.customization?.currentCardBackIndex ?? 0)}
              deskDynamic={(userSystem.settings as any)?.deskDynamic || false} // [2026-08-13] 动态牌桌
              heroDynamic={(userSystem.settings as any)?.heroDynamic || false} // [2026-08-16] 动态卡面
              missionSystem={missionSystem}
              firstAttacker={Math.random() > 0.5 ? 'player' : 'enemy'}
              onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
              onQuitGame={handleQuitGame} // [2026-08-30 莉莉子] 暂停层关机 → 退出游戏
              isSettingsOpen={isSettingsOpen} // [2026-08-30 莉莉子] 暂停 ESC 协调
              onAccountSettle={handleRealMatchSettled} // [2026-09-04 账号等级/战绩]（rogue 逐节点在 GameOverScreen 被跳过，整局走 settleRun）
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
              cardBackDynamic={(userSystem.settings as any)?.cardBackDynamic || false} // [2026-08-23] 动态卡背开关
              onToggleCardBackDynamic={() => userSystem.updateSettings({ cardBackDynamic: !(userSystem.settings as any)?.cardBackDynamic } as any)}
              onResetSettings={() => userSystem.resetSettings()} // [2026-08-16] 恢复默认设置
              onRestartMatch={() => { setIsSettingsOpen(false); (userSystem.userId === 'dev_full_admin' && appState === 'rogue_game') ? handleRogueRestartBattle() : handleStartGame(); }}
              onReturnToLobby={() => { setIsSettingsOpen(false); handleBackToLobby(); }}
              isInGame={appState === 'game' || appState === 'tutorial_game'}
              isRogueDevRestart={userSystem.userId === 'dev_full_admin' && appState === 'rogue_game'} // [2026-08-25 开发者] 肉鸽开发者重开入口
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

      {/* [2026-08-29 肉鸽专属任务] 悖论推演委派（肉鸽专属任务面板，普通军功面板已过滤 rogue 任务） */}
          <RogueMissionPanel
              isOpen={rogueMissionOpen}
              onClose={() => setRogueMissionOpen(false)}
              missionSystem={missionSystem}
              userSystem={userSystem}
          />

      {/* [2026-08-29 评估嘉勉] 肉鸽通行证面板（等级轨道 + 每级奖励 + 卡包） */}
          <EvaluationPanel
              isOpen={evaluationOpen}
              onClose={() => setEvaluationOpen(false)}
              userSystem={userSystem}
          />

      {/* [2026-08-20 逻辑研习] 悖论迷宫·肉鸽图鉴（强化/装备图鉴 + 右侧抽屉筛选） */}
      <AnimatePresence>
          {rogueCodexOpen && (
              <RogueCodex isOpen={rogueCodexOpen} onClose={() => setRogueCodexOpen(false)} userSystem={userSystem} />
          )}
      </AnimatePresence>

      {/* [2026-08-26 莉莉子] 武装悬停大卡预览：全局监听 eventBus，各处武装图标悬停生效 */}
      <ArmamentPreview />
      {/* [2026-09-10 莉莉子] 关键词悬停大卡预览：全局监听 eventBus，各处关键词图标悬停生效（取代原生 title 小白框） */}
      <KeywordPreview />

      {/* [2026-08-28 对局记录] 返回二次确认（地图返回 / ESC / 大厅结算共用）：
          结算对局 → 中途结算发经验；暂离对局 → 存盘回大厅可继续（大厅场景暂离=关闭弹窗） */}
      {rogueLeaveConfirm && (
          <RogueLeaveModal
              onSettle={handleRogueSettle}
              onLeave={() => { if (leaveSourceRef.current === 'map') handleRogueLeave(); else setRogueLeaveConfirm(false); }}
              onClose={() => setRogueLeaveConfirm(false)}
          />
      )}

      {/* [2026-08-28 对局记录] 中途结算窗：展示本场统计 + 获得经验 + 悖论点 + 升级提示 */}
      {rogueSettleInfo && (
          <RogueSettleModal
              run={rogueSettleInfo.run}
              expGained={rogueSettleInfo.expGained}
              leveled={rogueSettleInfo.leveled}
              detail={rogueSettleInfo.detail} // [2026-08-29] 结算倍率明细
              onConfirm={handleRogueSettleDone}
          />
      )}

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

      {/* [2026-08-29 经验重构] 局内渐进经验/升级轻量横幅 */}
      <RogueExpFeed feed={expFeed} />

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