import React, { useState, useEffect,useRef } from 'react';
import { SkipForward } from 'lucide-react'; // [2026-10-03 莉莉子] 胜利影片跳过按钮图标（与升级按钮同款）
import { TitleScreen } from './components/TitleScreen';
import { SplashScreen } from './components/SplashScreen'; // [哨兵] 免责启动画面
import { ModeSelectScreen } from './components/ModeSelectScreen'; // [新增]
import { DeckBuilder } from './components/DeckBuilder';
import { useAudio } from './hooks/useAudio';
import { useSfx } from './hooks/useSfx';
import { useMovie } from './hooks/useMovie';
import { VideoPlayer } from './components/VideoPlayer';
// [2026-10-14 程拍板] FullScreenToggle 已收进设置窗口（SettingsModal「显示」区），不再全局悬浮
import { TouchFeedbackLayer } from './components/TouchFeedbackLayer'; // [2026-10-14] 触屏点击反馈（涟漪 + 长按进度环 + 震动；仅触屏启用）
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
// [2026-10-05 莉莉子 BUG修复 · 20261005-06] 全局音量快照：让"音量"变成**可读取的当前值**，
//   而不是只能靠一次性事件推给当时的实例（`useVoice` 每场对局都会新挂，收不到那次推送）
import { hydrateVolumes, normalizeVolumes, setVolumeSnapshot } from './utils/audioVolume';
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
import { buildStandardEncounter, buildRoguelikeEncounter, buildEncounterForHeroes } from './logic/encounterBuilder'; // [新增] 标准模式 + 肉鸽敌人生成器 · [2026-10-08 瓦尔基里大赛] +buildEncounterForHeroes（按天启者指定敌方卡组）
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
import { readArmStock } from './data/roguelike/armamentStock'; // [2026-10-04 独立审查 #10] 开匣详情按库存标注（从唯一实例下发）
import { ROGUE_DIFFICULTIES } from './data/roguelike/difficulties'; // [2026-08-07 难度解锁]
import type { RogueDifficulty } from './data/roguelike/difficulties'; // [2026-08-07 难度]
import { RogueMapScreen } from './components/roguelike/RogueMapScreen';
import { RogueLeaveModal } from './components/roguelike/modals/RogueLeaveModal'; // [2026-08-28 对局记录] 返回二次确认（结算/暂离）
import { RogueSettleModal } from './components/roguelike/modals/RogueSettleModal'; // [2026-08-28 对局记录] 中途结算窗
import { generateRewardOptions, buildHeroRecruitOptions, HERO_RECRUIT_HERO_COUNT, type RewardCardOption, type HeroRecruitOption } from './data/roguelike/rewards'; // [2026-08-25] 胜利奖励生成；[2026-09-04] 首战天启者招募；[2026-10-03] 招募本体张数唯一口径
import { pickRandomEnhancements } from './data/roguelike/enhancements'; // [2026-08-28 事件] 随机强化
// [2026-10-05 莉莉子 · 方案 P3/P4] 事件效果注册表（提示与执行同源 + 回报实际结果）
import { applyEffect, type EventApi, type EventApplyResult } from './data/roguelike/eventAppliers';
import { getEquipmentPrice } from './data/roguelike/shop'; // [2026-08-28 事件] 带装备卡 · [2026-09-25] 装备单价（按实际生效件数计价）· [2026-10-05] generateCardOffers 已随注册表迁走
import { equipWeightsFor, weightedPick } from './data/roguelike/difficultyTiers'; // [2026-10-08 难度分层]
import { getEquipPoolForCard, getEquipmentById } from './data/equipment'; // [2026-08-29] 按卡筛装备池 · 探路回归提示
import { ROGUE_EVENT_BY_ID, resolveChoiceEffects, type RogueEventEffect } from './data/roguelike/events'; // [2026-08-28 事件系统] · [2026-10-08 瓦尔基里大赛] +resolveChoiceEffects
import { EventBattleRewardModal } from './components/roguelike/modals/EventBattleRewardModal'; // [2026-10-08 瓦尔基里大赛] 迎战胜利·强化奖励弹窗（第一段）
import { RogueGameWrapper } from './components/roguelike/RogueGameWrapper';
import { useHeroProgression } from './hooks/useHeroProgression'; // [2026-08-12 天启者养成] 每英雄等级/经验
import { getHeroLevelBonus } from './data/roguelike/heroProgression'; // [2026-08-12 天启者养成] 等级加成
import { ACCOUNT_EXP_BY_MODE, ACCOUNT_LEVEL_REWARD_DATA_GOLD } from './data/accountProgression'; // [2026-09-04 账号等级系统]
import { computeNodeExp, getNodeDepth, computeRunExpTotal, computeResourceExp, timeExpMult, DIFFICULTY_EXP_MULT, DIFFICULTY_PAR_MINUTES, CLEAR_EXP, type RogueSettleDetail } from './data/roguelike/rogueExp'; // [2026-08-29] 经验经济（局内渐进/时长/难度/共鸣）· [2026-09-07] 剩余资源折算
// [2026-08-29] 局内经验横幅 → [2026-10-08 莉莉子 · 交互回响层] 升级为**统一局内反馈层**（经验 + 节点交互回执）
import { RogueExpFeed, type ExpFeedItem, type FeedbackTone } from './components/roguelike/RogueExpFeed';
import { getBuffById } from './data/roguelike/buffs'; // [2026-10-08 交互回执] 强化名查询（商店买强化 / 宝箱强化 / 强化节点） // [2026-08-29] 局内经验横幅
import { ReviveModal } from './components/roguelike/modals/ReviveModal'; // [2026-10-04 程拍板] 复活询问弹窗（本场失败 → 消耗 1 次复活重打本节点）
import { EvaluationPanel } from './components/roguelike/EvaluationPanel'; // [2026-08-29 评估嘉勉] 分析员等级面板
import { RogueMissionPanel } from './components/roguelike/RogueMissionPanel'; // [2026-08-29] 肉鸽专属任务面板
import { useArmamentConfig } from './hooks/useArmamentConfig'; // [2026-08-29] 碳原子板武装快照
import { useHeroDivinity } from './hooks/useHeroDivinity'; // [2026-09-28 神格神经] 节点解锁 + [2026-09-29] 神格碎片钱包
import { computeRunShards, type ChestInstance } from './data/roguelike/divinityShards'; // [2026-09-29 程拍板] 奖励匣 · [2026-10-03] 结算碎片改走 divinity.grantUniversalShard · [2026-10-04] +computeRunShards（结算现算，不再回读 state）
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
  const divinity = useHeroDivinity(); // [2026-09-28 神格神经] 节点解锁 + [2026-09-29] 神格碎片钱包
  const [levelUpInfo, setLevelUpInfo] = useState<{ heroKey: string; fromLevel: number; toLevel: number } | null>(null); // [2026-08-12] 升级弹窗信息
  const [expToast, setExpToast] = useState<{ heroKey: string; amount: number } | null>(null); // [2026-08-12] 结算经验浮层
  const [expFeed, setExpFeed] = useState<ExpFeedItem[]>([]); // [2026-08-29] 局内经验/升级横幅队列
  const expFeedIdRef = useRef(0);
  const [rogueEncounter, setRogueEncounter] = useState<any>(null);
  const [rogueEventBattle, setRogueEventBattle] = useState<{ reward: 'enhancement' | 'choose2' } | null>(null); // [2026-08-28 事件] 事件战斗胜利奖励标志
  const [rogueReward, setRogueReward] = useState<{ gold: number; options: RewardCardOption[]; pendingPacks?: number } | null>(null); // [2026-08-15] 胜利奖励三选一（3 个候选卡）；[2026-08-25] 候选卡带 equipId；[2026-08-29] 胜利附带待打开卡包
  const [rogueHeroRecruit, setRogueHeroRecruit] = useState<{ options: HeroRecruitOption[]; subNote?: string } | null>(null); // [2026-09-04 首战大捷] 天启者招募三选一（一次性）
  // [2026-10-08 莉莉子 · 瓦尔基里大赛] 事件战斗胜利的**第一段**奖励弹窗（强化/天启者卡）
  //   关掉它之后才弹第二段（卡牌三选一），见 onClose 的处理
  const [eventBattleReward, setEventBattleReward] = useState<{ results: EventApplyResult[]; thenCards: boolean } | null>(null);
  const [rogueBattleType, setRogueBattleType] = useState<RogueNodeType | null>(null);
  const [rogueBattleNodeId, setRogueBattleNodeId] = useState<string | null>(null); // [2026-08-10] 当前战斗节点 id（胜利后标记击败）
  const [rogueBattleArchetypeId, setRogueBattleArchetypeId] = useState<string | undefined>(undefined); // [2026-08-25 开发者] 进战斗的敌人流派 id（重开当前战斗重建遭遇用）
  const [rogueBattleBuffs, setRogueBattleBuffs] = useState<string[] | undefined>(undefined); // [2026-08-27 莉莉子] 当前战斗节点预分配的迷宫强化（重开重建遭遇用，与地图预览一致）
  const [rogueHeroKey, setRogueHeroKey] = useState<string | null>(null); // [2026-08-07 肉鸽主界面] 已选天启者
  const [rogueMissionOpen, setRogueMissionOpen] = useState(false); // [2026-08-07 肉鸽主界面] 任务面板开关
  const [evaluationOpen, setEvaluationOpen] = useState(false); // [2026-08-29 评估嘉勉] 分析员等级面板开关
  const [rogueCodexOpen, setRogueCodexOpen] = useState(false); // [2026-08-20 逻辑研习] 肉鸽图鉴开关
  const [preBattleHpSnapshot, setPreBattleHpSnapshot] = useState<number | null>(null); // [2026-08-11 全局 HP 衔接] 进战斗前全局 HP 快照（中途退出回滚用）

  // ==========================================
  // [2026-10-03 莉莉子 BUG修复 · 进攻标识 / "同一方连续 2~3 个进攻回合"]
  //   肉鸽战斗的「**先手方**」必须**一场只抽一次**。
  //
  // ── 病根：原先渲染处写的是**内联表达式**
  //    `firstAttacker={Math.random() > 0.5 ? 'player' : 'enemy'}`
  //    JSX 里的表达式会在 **App 每次渲染时重新求值** ⇒ 等于「**每重画一次就重抽一次签**」。
  //    以前 `firstAttacker` **只在开局被用一次**（外层覆盖补偿）⇒ 后面重抽不影响轮换，所以一直没暴露；
  //    但 2026-10-03 改成「**先手方占奇数回合**」后，它变成**每一回合都要读**的坐标系
  //    （`useRoundLifecycle.startRound` → `calculateRoundStart(game, firstAttacker)`）
  //    ⇒ 重抽**直接改轮换** ⇒ 同一方连着拿 2~3 个进攻回合。
  //    📄 群里反馈：2026-10-03 20:15「打补丁之后继续进行暂离的迷宫，第一把我就连续获得了两个进攻回合」、
  //       20:38「我也遇到了对面连着两个进攻回合」、20:59「连续三个进攻回合的几率更高了」。
  //
  // ── 修法：以 `rogue_${gameId}`（= **一场战斗**，见渲染处的 `key`）为界，每场**只抽一次**并存住。
  //    用 ref 按 `gameId` 惰性初始化 ⇒ 同一场战斗内**幂等**（StrictMode 双调用也不会重抽），
  //    `gameId` 变化（进入新战斗 / 重开当前战斗）时自动重新抽。
  //    ⚠️ 与 PVE 侧口径一致（那边 `setFirstAttacker` 抽一次存进 state，见本文件 startPve 处）；
  //       教程侧走剧本写死的值，不受影响。
  // ==========================================
  const rogueFirstAttackerRef = useRef<{ gameId: number; who: 'player' | 'enemy' }>({ gameId: -1, who: 'player' });
  if (rogueFirstAttackerRef.current.gameId !== gameId) {
      rogueFirstAttackerRef.current = { gameId, who: Math.random() > 0.5 ? 'player' : 'enemy' };
  }
  const rogueFirstAttacker = rogueFirstAttackerRef.current.who;
  const [rogueMapReveal, setRogueMapReveal] = useState(false); // [2026-08-28 莉莉子 推演开场] 本局首进地图播开场动画（播完复位，战斗返回不重播）
  // [2026-08-28 对局记录] 未结算对局：暂离存盘可继续 / 结算拿经验
  const [hasPendingRun, setHasPendingRun] = useState(false);          // 是否有未结算的肉鸽对局（大厅显示结算/继续，前往推演置灰）
  const [rogueLeaveConfirm, setRogueLeaveConfirm] = useState(false); // 返回二次确认弹窗开关（地图返回 / 大厅结算共用）
  const [rogueSettleInfo, setRogueSettleInfo] = useState<{ run: RoguelikeRunState; expGained: number; leveled: { fromLevel: number; toLevel: number } | null; detail: RogueSettleDetail } | null>(null); // 中途结算窗数据
  const [rogueRunEnd, setRogueRunEnd] = useState<RogueRunEndInfo | null>(null); // [2026-08-29] 通关/败亡结算（天启者经验动画）
  // [2026-10-04 程拍板] 本场推演失败 → 是否消耗 1 次复活重打本节点（**弹窗询问**，不自动消耗）
  const [rogueRevivePrompt, setRogueRevivePrompt] = useState(false);
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

  const { playBgm, stopBgm, pauseBgm, resumeBgm, setBgmVolume } = useAudio();
  const { setSfxVolume } = useSfx();

  // ==========================================
  // [2026-09-19 莉莉子] 局内暂停 · BGM 冻结
  // ── BGM 是 App 侧 new Audio()（不在 GameSession 的 DOM 里），拿不到也不该拿它的局部 isPaused，
  //    故走事件总线广播：GameSession 进出暂停时发一次，这里执行暂停/续播。
  // ==========================================
  useEffect(() => {
      const onPause = () => pauseBgm();
      const onResume = () => resumeBgm();
      eventBus.on(GameEvents.GAME_PAUSE, onPause);
      eventBus.on(GameEvents.GAME_RESUME, onResume);
      return () => {
          eventBus.off(GameEvents.GAME_PAUSE, onPause);
          eventBus.off(GameEvents.GAME_RESUME, onResume);
      };
  }, [pauseBgm, resumeBgm]);
  const {
      currentMovie, isVisible, isLooping,
      playTitleMovie, playLevelUpMovie, playVictoryMovie, stopMovie,isImmediate,
      handleVideoEnded,playHallMovie,setMovieVolume,
      prepareLevelUpMovie, prepareVictoryMovie,
      movieVolume, // [2026-10-05] 「过场」音量：此前**没被解构出来**，所以永远传不到播放器（滑块是装饰品）
      skipMovie, movieKind, // [2026-10-03 莉莉子] 胜利影片跳过：跳过动作 + 影片用途标记
      currentMoviePoster, // [2026-10-19 莉莉子 · 安卓] 当前影片的 poster 静图（兜底"安卓视频灰块"）
  // [核心重构] 将玩家的画质设置作为神经信号注入调度大脑（默认兜底 1k）
  } = useMovie((userSystem.settings as any)?.videoResolution || '1k');

  // ==========================================
  // [2026-10-03 莉莉子] **胜利影片「跳过」按钮**
  //   规格**逐项对齐**升级动画右上角那颗（`ChampionLevelUp.tsx:263-277`）：
  //     · 功能 = 立即切断影片 + 推进流程（`skipMovie()` 内部会触发完成回调；升级那颗是
  //              "停片 + 自己 setPhase('burst')" —— 两者都是"点一下就直接进下一步"）
  //     · 位置 = **右上角**（`top-8 right-8`）
  //     · 层级 = **`z-[9999]`**（压过下面 App 共享 `<VideoPlayer>` 的 `zIndex` 500）
  //     · 样式 = 同款药丸按钮：半透明黑底 / 白描边 / 圆角 / `SKIP MOVIE` + SkipForward 图标
  //   ⚠️ 只在**胜利**影片显示（`movieKind === 'victory'`）—— 标题/大厅是**循环**影片，不该给跳过。
  //   ⚠️ 影片开始 **1 秒后**才出现，与升级按钮同款（`ChampionLevelUp.tsx:110-111`）。
  // ==========================================
  const [showVictorySkip, setShowVictorySkip] = useState(false);
  useEffect(() => {
      if (!(isVisible && movieKind === 'victory')) {
          setShowVictorySkip(false);
          return;
      }
      const t = setTimeout(() => setShowVictorySkip(true), 1000);
      return () => clearTimeout(t);
  }, [isVisible, movieKind]);

  // --- 初始化同步音量 ---
  // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 这里先 **hydrate 全局音量快照**，再做原有推送。
  //   病根回顾：音量原来只有"推"（下面那次 emit + 设三个 setter），而 `useVoice` 是**每场对局新挂实例**
  //   （`GameSession.tsx:921`）⇒ 新实例收不到推送、用自己的默认 0.8 ⇒「一进新对局语音音量被重置，
  //   必须在局内再拖一次滑块才恢复」（程实测：迷宫每次进新对局必现）。
  //   现在快照在手 ⇒ **任何后挂的播放器实例 mount 时自取现值**；下面那次 emit 只负责"改正在播的那一条"。
  //   ⚠️ 依赖仍只有 `isReady`：快照的存在让"只推一次"不再影响正确性（那个 500ms 延时也不再是正确性依赖）。
  useEffect(() => {
      if (userSystem.isReady && userSystem.settings) {
          const v = hydrateVolumes(userSystem.settings.volume);
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
      // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 先写全局快照 —— 它保证"之后新挂的实例"也拿得到现值
      setVolumeSnapshot(type, value);
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
    // [2026-09-25 莉莉子 武装不叠加] 本局武装快照按同日启者去重（老存档可能残留重复槽）
    const armForHero = Array.from(new Set(armamentConfig.getArmament(rogueHeroKey, heroLevel).filter((v): v is string => !!v)));
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
    // [2026-10-08 莉莉子 · 交互回响层 批次3] 暂离即取消**未开打的「迎战」**
    //   （批次3 把迎战改成"点按钮才切战斗"，于是这个标记可能停在待战态；
    //    不清掉的话，回来后打普通战斗胜利会被误判成事件战斗。事件节点本身已 markNodeResolved，不受影响）
    setRogueEventBattle(null);
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
    setRogueEventBattle(null); // [2026-10-08 · 批次3] 存档里不含"待战"⇒ 恢复时一并清零，杜绝误判
    setAppState('rogue_map');
  };

  // ═══ [2026-08-29 经验重构] 局内渐进经验 + 结算经验 ═══

  /**
   * [2026-08-29] 局内经验/升级轻量横幅（2.5s 自动消失，最多保留 4 条）
   * [2026-10-08 莉莉子 · 交互回响层 批次0] 升级为局内**唯一反馈出口**：经验/升级 与 节点交互回执共用一条队列。
   *   tone：exp/level（沿用，z-300）· gain 获得 / cost 付出 / info 一般（z-950，盖过节点弹窗）
   *   ⚠️ 文案一律在**执行点**产出（下面各 handler 内），UI 只负责渲染 —— 提示与执行同源。
   */
  const pushExpFeed = (text: string, tone: FeedbackTone = 'exp') => {
    const id = ++expFeedIdRef.current;
    setExpFeed(prev => [...prev.slice(-3), { id, text, tone }]);
    setTimeout(() => setExpFeed(prev => prev.filter(f => f.id !== id)), 2500);
  };
  // [2026-10-08 莉莉子 · 交互回响层] 名字取用统一口径（卡名去换行；强化/装备查库；查不到退回 id 原文）
  const nameOfCard = (key: string) => CARD_DB[key]?.name?.replace(/\n/g, '') ?? key;
  const nameOfEnh = (id: string) => getBuffById(id)?.name ?? id;
  const nameOfEquip = (id: string) => getEquipmentById(id)?.name ?? id;

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
  // [2026-10-04 莉莉子 BUG修复] 新增 battleHp：本场**战斗结束时**的剩余水晶。
  //   病根：settleRun 读的是**本次渲染的闭包** rogue.run（见下方若干处 stale 注释），
  //   而 battleHp（原 playerNexus）是战斗中实时值、不经 state ⇒ 只能由调用方显式传进来。
  const settleRun = (opts: { outcome: 'victory' | 'defeat' | 'abandon'; battleHp?: number }): { bonus: number; detail: RogueSettleDetail } => {
    if (!rogue.run) return { bonus: 0, detail: { durationMin: 0, timeMult: 1, diffMult: 1, ratePct: 0, resonance: false, clearExp: 0 } };
    const run = rogue.run;
    const won = opts.outcome === 'victory';
    const durationMs = Math.max(0, Date.now() - run.startedAt);
    // [2026-09-15 程拍板] 中途放弃 = 完全不算一局：不计战绩 / 不满足任务 / 不入账号与分析员经验 /
    //   不发结算经验差额 / 碳原子板不消耗也不翻倍。（局内逐节点已发的经验不回滚 —— 走到节点就该拿）
    if (opts.outcome === 'abandon') {
      return {
        bonus: 0,
        detail: { durationMin: Math.round(durationMs / 6000) / 10, timeMult: 1, timeParMin: DIFFICULTY_PAR_MINUTES[run.difficulty], diffMult: DIFFICULTY_EXP_MULT[run.difficulty], ratePct: 0, resonance: false, clearExp: 0, abandoned: true },
      };
    }
    // [2026-09-15 程拍板] 碳原子板只在通关时发挥（翻倍 + 消耗）：玩家带它是奔着赢去的，败北本就经验少，
    //   再扣一件消耗品 = 赔了夫人又折兵。未通关一律不消耗、不翻倍，原封不动留到下一局。
    // [2026-10-06 莉莉子 · 审计收口 · **模式 C**] 原先靠**硬编码 id** `'arm_resonance_crystal'` 认碳原子板 ——
    //   而它声明的 `runBonus.doubleRunExp` **全项目零消费者** ⇒ 改 id / 加同类会**静默失效**。
    //   现改为**按声明字段读**（数据即真源）；下面卸槽/扣库存那两处同理。
    const resonanceHeld = (run.armaments ?? []).some(id => !!getEquipmentById(id)?.runBonus?.doubleRunExp);
    const resonance = won && resonanceHeld; // 仅通关真正生效（消耗 / 翻倍 / 结算演出全部由此派生）
    const ratePct = run.expRateBonus ?? 0;
    const rate = 1 + ratePct / 100;
    const reso = resonance ? 2 : 1;
    // [2026-09-08 莉莉子] 剩余资源折算天启者经验：仅通关（won）才转换，中途退出/失败不转换。
    // 防"开局即结算刷等级"（原为通关/败北/中途一律折算；死亡剩血按 0 特判随语义一并收敛）。吃效率加成与共鸣翻倍，不吃速通时长。
    // [2026-10-04 莉莉子 BUG修复] 同因：setHp 也是 setRun 异步（见 handleRogueVictory），
    //   这里的 run.hp 是**战前 HP**，不是战斗结束时的剩余水晶 ⇒ 优先用调用方显式传入的 battleHp。
    const aliveHp = run.status === 'dead' ? 0 : (opts.battleHp ?? run.hp);
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
        // [2026-10-06 莉莉子 · 审计收口 · 模式 C] 同上：按 `runBonus.retrainUpgrade` 认重修申请（不再硬编码 id），
        //   消耗时也用槽里那件的**实际 id**。
        if (i >= unlockN || !v) return;
        if (!getEquipmentById(v)?.runBonus?.retrainUpgrade) return;
        if (armamentConfig.upgradeQualityTo(run.heroKey, i, targetTier)) {
          armamentConfig.setArmamentSlot(run.heroKey, i, null); // 该份发挥后卸槽
          userSystem.removeOwnedArmament(v, 1);                 // 库存 -1（不足则忽略）
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
      // [2026-10-06 莉莉子 · 审计收口 · 模式 C] 同上：按 `runBonus.doubleRunExp` 认碳原子板所在槽（不再硬编码 id）
      const heldIds = armamentConfig.getArmament(run.heroKey);
      const slotIdx = heldIds.findIndex(id => !!getEquipmentById(id ?? '')?.runBonus?.doubleRunExp);
      if (slotIdx >= 0) {
        const resoId = heldIds[slotIdx]; // ⚠️ 必须在卸槽**之前**取出（setArmamentSlot 会改这份配置）
        if (resoId) userSystem.removeOwnedArmament(resoId, 1);
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
    // [2026-09-22 莉莉子 修复] 难度收益系数（普通1/机密1.5/绝密2）：
    //   此前通行证经验与分析员经验完全不分难度 —— 玩家打机密/绝密在另外两条养成线上零额外回报。
    const diffRewardMult = DIFFICULTY_EXP_MULT[run.difficulty];
    // [2026-08-29 通行证] 对局给分析员经验（完成任意结局 +150，通关额外 +400 共 550）· [09-22] 按难度加成
    userSystem.grantAnalystExp(Math.round((won ? 550 : 150) * diffRewardMult));
    // [2026-09-04 账号等级系统] 迷宫整局 → 账号经验 + 战绩（settleRun 是整局唯一收口：通关/败北/主动结算各一次）
    // [2026-09-22 莉莉子] 账号经验按难度加成（普通 200/80 · 机密 300/120 · 绝密 400/160）
    const accExp = Math.round(ACCOUNT_EXP_BY_MODE.rogue[won ? 'win' : 'lose'] * diffRewardMult);
    const accLeveled = userSystem.grantAccountExp(accExp);
    userSystem.recordBattle({ won, mode: 'rogue', heroKeys: [run.heroKey] });
    // [2026-09-29 程拍板] 悖论点已废弃 → 本局结算发碎片，直接入碎片钱包
    // [2026-10-03 程拍板] 由「随机归属的**专属**碎片」改为「**万能**碎片」并按难度分档
    //   （普通 5 / 机密 10 / 绝密 15，见 divinityShards.RUN_SETTLE_UNIVERSAL）
    //   理由：原来走 dropShards(undefined, 全体天启者, 60) = 每 5 片随机归属，
    //   想练的那位期望只拿 60/6 = 10 片/局且不可定向；万能可全额替代专属 ⇒ 能全投给她。
    //   唯一收口在 settleRun（通关/败北各一次；中途放弃在上方早返回，不产出）
    // ═══ [2026-10-04 莉莉子 BUG修复 · 结算碎片永不到账] ═══
    //   原写法：`if (run.settledShards > 0) divinity.grantUniversalShard(run.settledShards)`
    //   → **恒不执行**，碎片从未发放（粉丝：「胜利结算给的万能碎片没入库」，但结算窗显示 +N）。
    //   病根 = 读了自己刚写的 state：settledShards 是**同一 tick**里 advanceAct() 通过 setRun
    //   写入的（见 handleRogueVictory：先 advanceAct() 再 settleRun()），React 批处理下新值
    //   要等下一次渲染才可见，而 settleRun 读的是**本次渲染的闭包** rogue.run ⇒ 拿到旧值 0。
    //   而结算窗 RunEndModal 读的是重渲染后的新 state ⇒「界面显示 +N、钱包没加」两头不一致。
    //   修法：按 outcome **现算**（与 advanceAct 写入同源同函数 computeRunShards），彻底避开
    //   闭包时序；UI 仍读 run.settledShards，两者都由 computeRunShards 派生，口径一致。
    //   ⚠️ 回归防线：开发者账号碎片恒显 9999（useHeroDivinity.isDevAccount），
    //      **用 dev 账号验收永远看不到这个 bug**，必须用普通账号验。
    const settleShards = won ? computeRunShards(true, run.difficulty) : 0;
    if (settleShards > 0) {
      divinity.grantUniversalShard(settleShards);
    }
    pushExpFeed(`账号经验 +${accExp}`);
    if (accLeveled.leveled.length > 0) {
      accLeveled.leveled.forEach((l: { from: number; to: number }) => pushExpFeed(`账号 Lv.${l.from} → ${l.to}`, 'level'));
      pushExpFeed(`+${ACCOUNT_LEVEL_REWARD_DATA_GOLD} 数据金`);
    }
    const bonus = Math.max(0, finalTotal - run.expFromNodes) + resourceExp; // 节点差额（通关/时长/效率/共鸣）+ 剩余资源折算
    const detail: RogueSettleDetail = {
      durationMin: Math.round(durationMs / 6000) / 10, // 分钟（一位小数）
      timeMult: won ? timeExpMult(durationMs, run.difficulty) : 1, // [2026-09-15 程拍板] 速通倍率仅通关生效 · [09-22] 分母按难度基准
      timeParMin: DIFFICULTY_PAR_MINUTES[run.difficulty], // [2026-09-22 莉莉子] 本难度基准时长（结算窗展示）
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
    // [2026-10-10 程拍板 · 独立审查 P1] 同 `handleRogueFinalDefeat`：**清掉"事件战斗"标记**。
    //   这里尤其关键 —— 它后面紧跟 `resetRun()`，而 `rogueEventBattle` 是 **App 层 state**、
    //   不随 run 一起清 ⇒ 会跨局活到新开局，把新局第一场普通胜利误判成事件战斗胜利（地图锁死）。
    setRogueEventBattle(null);
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
    rogue.resetBattleFlags(); // [2026-09-25 莉莉子 武装线] 凯旋之匣：本场"天启者是否阵亡"标记复位
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

  /**
   * [2026-09-25 莉莉子 装备不叠加] 从"本局主英雄还能挂"的新装备里随机抽一件（排除英雄卡上已有的）。
   *  全部装完则返回 undefined → 调用方跳过发放，不再塞重复件（重复挂会被 attachEquipment 静默忽略 = 白给）。
   */
  const pickNewEquipForHero = (): string | undefined => {
    const heroKey = rogue.run?.heroKey;
    const cardDef = heroKey ? CARD_DB[heroKey] : undefined;
    if (!cardDef) return undefined;
    const pool = getEquipPoolForCard(cardDef, rogue.run?.equippedCards?.[heroKey!]);
    // [2026-10-08 难度分层] 事件发放的装备改按难度品质权重（原来全池均匀抽 ⇒ 普通也能开出红装）
    const equipTable = equipWeightsFor(rogue.run?.difficulty);
    return weightedPick(pool, e => equipTable[e.rarity] ?? 0)?.id;
  };

  /**
   * [2026-10-10 莉莉子 · 收口] **"战斗结束"两项通用结算 —— 唯一出口**
   *   ① 播种希望投资兑现（`battleWinGold`）  ② 武装/强化线的"战斗结束"金币（凯旋之匣 / 拾荒）。
   *   ⚠️ 为什么必须收成一个出口：**开发者「一键通过」也要跑这两步**（它按"打赢"结算，不能少结算）。
   *     原先这两步内联在 `handleRogueVictory` 开头，而一键通过那条路**绕过** `handleRogueVictory` ⇒
   *     投资不消化、武装结算不发（2026-10-10 独立审查 **P1** 抓出）。
   *   @param playerNexus 战斗结束时的剩余水晶（一键通过没有真打 ⇒ 传当前水晶，等价于"打赢且水晶未受损"）
   */
  const settleBattleEndCommon = (playerNexus?: number) => {
    // [2026-08-28 事件] 战斗胜利投资回报（播种希望）：任何战斗胜利都结算
    const goldInvs = rogue.consumeInvestments('battleWinGold');
    if (goldInvs.length) {
      let invGold = 0;
      for (const g of goldInvs) { rogue.addGold(g.value ?? 0); invGold += g.value ?? 0; }
      // [2026-10-08 莉莉子 · 交互回响层 批次1] HUD 徽章只说"有投资在等"，**兑现这一刻**才是玩家想知道的
      if (invGold > 0) pushExpFeed(`🌱 投资兑现 · 数据金 +${invGold}`, 'gain');
    }
    // [2026-09-25 莉莉子 武装线/强化线] 战斗结束结算（凯旋之匣：天启者存活 +金币 / 拾荒：水晶达标 +金币）。
    //   放在事件战斗早返回之前，两条路径都能吃到；playerNexus 是战斗结束时的剩余水晶
    rogue.settleArmamentBattleEnd(playerNexus);
  };

  /**
   * [2026-10-10 莉莉子 · 收口] **事件战斗（待战）胜利结算 —— 唯一出口**
   *   两条路都走这里：① 真打赢（`handleRogueVictory` 的 `rogueEventBattle` 分支）
   *   ② 开发者「一键通过」（在地图节点面板上直接把这场仗按"打赢"结算，不必先进战斗）。
   *   ⚠️ 为什么必须收成一个出口：这段含**两段式奖励**（强化/固定天启者卡 → 卡牌三选一）、
   *     `clearPendingBattle`、HP 写回、回地图 —— 抄第二份必然漂移（本项目反复踩过的病）。
   *   @param nodeId 这场仗挂在哪个节点（胜利后 `clearPendingBattle` + 取奖励配置）
   *   @param playerNexus 战斗剩余水晶：**真打赢**传数字 ⇒ HP 写回；
   *                      **没有真打过**（一键通过）传 `null` ⇒ **完全不碰 HP**
   *                      [三轮审查 F2] 类型收成 `number | null`（**不要**再留 `undefined`）——
   *                      三值让"没打过"与"漏传"无法区分，且漏传会落进"真打赢"分支写回闭包旧 HP。
   *   @param rewardFallback `pendingBattles` 缺失时的奖励口径兜底（真打赢路径传 `rogueEventBattle.reward`）
   */
  const settleEventBattleVictory = (
    nodeId: string | null,
    playerNexus: number | null,
    rewardFallback: 'enhancement' | 'choose2',
  ) => {
    if (!rogue.run) return;
    const pending = nodeId ? rogue.run.pendingBattles?.[nodeId] : undefined;
    const reward = pending?.reward ?? rewardFallback;
    const rewardResults: EventApplyResult[] = [];
    // ① 执行**选择时扣下**的奖励（指定强化 / 天启者卡）—— 程：「赢了之后才会获得」
    for (const ef of pending?.rewards ?? []) rewardResults.push(...applyEventEffects(ef));
    // ② 旧 fight 事件（ev_ambush / ev_arena）没有 rewards ⇒ 沿用原来的"随机强化"，**老行为零变化**
    if ((pending?.rewards?.length ?? 0) === 0 && reward === 'enhancement') {
      // [2026-09-25 莉莉子 不叠加] 强化排除已拥有
      // [2026-10-08 难度分层] 原第二参写死 `undefined`（假参与）⇒ 现传本局难度
      const enh = pickRandomEnhancements(1, rogue.run.difficulty, { rare: 0, epic: 60, legendary: 40 }, rogue.run.passUnlockedEnhancements, rogue.run.enhancements)[0]; // [2026-08-29 通行证]
      if (enh) {
        rogue.applyEnhancement(enh.id);
        recordCodexUnlock('enhancement', enh.id);
        rewardResults.push({ kind: 'gain', icon: '🧬', text: `迷宫强化「${nameOfEnh(enh.id)}」` });
      }
    }
    for (const r of rewardResults) if (r.kind === 'gain') pushExpFeed(`⚔️ 迎战胜利 · ${r.text}`, 'gain');
    // [2026-10-10 莉莉子 BUG修复 · 二轮独立审查 F2] HP 写回**只在真打过时**做（一键通过传 `null` ⇒ 跳过）。
    //   为什么必须区分：`playerNexus ?? rogue.run.hp` 里的 `rogue.run.hp` 是**渲染期闭包值**，
    //   而本函数上方刚跑过奖励（`applyEventEffects` / `applyEnhancement`）——
    //   将来一旦出现会改 HP / 上限的强化或奖励，这行就会把刚加上去的 HP **回滚掉**（两轮审查都点到）。
    // [2026-10-10 三轮审查 F2] 只在**真拿到数字水晶值**时写回；`null`（一键通过 = 没打过）不碰 HP。
    //   ⚠️ 用运行时 `typeof` 而不是 `!== null`：类型上已收成 `number | null`，但万一有 JS 路径漏传
    //      `undefined`，`!== null` 会放行并写出 `NaN`（三轮 F5 正是同类隐患）⇒ 这里一并堵死。
    if (typeof playerNexus === 'number') rogue.setHp(playerNexus);
    setRogueEventBattle(null);
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] 待战节点已打完 ⇒ 清掉标记（该节点不再要求战斗）
    if (nodeId) rogue.clearPendingBattle(nodeId);
    playBgm('deck_builder'); // [2026-08-28 莉莉子] 事件战斗胜利返回地图：恢复备战曲
    setPreBattleHpSnapshot(null);
    setRogueBattleType(null);
    setRogueBattleNodeId(null);
    setRogueEncounter(null);
    setAppState('rogue_map');
    // ③ 弹**第一段**：强化奖励（`choose2` 时关掉它再弹卡牌三选一）
    setEventBattleReward({ results: rewardResults, thenCards: reward === 'choose2' });
  };

  const handleRogueVictory = (playerNexus?: number, ovType?: RogueNodeType, ovNodeId?: string) => {
    if (!rogue.run) return;
    // [2026-08-29] 一键胜利（节点详情）时用 override 的节点类型/id；否则用当前战斗状态
    const battleType = ovType ?? rogueBattleType;
    const battleNodeId = ovNodeId ?? rogueBattleNodeId;
    // [2026-10-10 莉莉子 · 收口] 这两步抽成 `settleBattleEndCommon`（唯一出口）——
    //   因为开发者「一键通过」也必须跑它们，而它不走本函数（见该函数注释）。
    settleBattleEndCommon(playerNexus);

    // [2026-08-28 事件] 事件战斗胜利 → 事件奖励（不结算节点）
    // [2026-10-10 莉莉子 · 收口] 整段抽成 `settleEventBattleVictory`（**唯一出口**）——
    //   因为开发者「一键通过」也要按同一套结算（发奖励 + 清待战标记 + 两段弹窗 + 回地图），
    //   抄第二份必然漂移。这里只留"是谁触发的"这一层判断。
    if (rogueEventBattle) {
      settleEventBattleVictory(battleNodeId, playerNexus ?? null, rogueEventBattle.reward);
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
      // ══════════════════════════════════════════════════════════════════
      // [2026-10-10 莉莉子 BUG修复 · 程拍板口径] **「是不是最后一关」以"是否通过了 BOSS 节点"判断**
      //   判据 = **刚打赢的这个节点在图上没有后继**（`next` 为空 ⇒ 它就是本图的**终点 BOSS**）。
      //   ⚠️ 不再数 act 数量：图池改造（10-09）后 `ROGUE_MAPS[difficulty].length` 已是"图池里有几张图"
      //      （普通 4 / 机密 5 / 绝密 5），拿关卡序号去比它 ⇒ 永不通关、结算窗不弹，
      //      且会空推进到不存在的关卡（`currentNodeId = null`）＝软锁。
      //   兜底：查不到该节点时按"**是最终 BOSS**"处理 —— 宁可结算，也不能让玩家卡在没有出口的地图上。
      // ══════════════════════════════════════════════════════════════════
      const layoutNodes = (rogue.run.layout ?? []).flatMap(act => act.nodes);
      const clearedNode = battleNodeId ? layoutNodes.find(n => n.id === battleNodeId) : undefined;
      const isFinalBoss = clearedNode ? clearedNode.next.length === 0 : true;
      // Boss 胜利 → 推进下一 Act（**最终 BOSS 则通关**）
      rogue.advanceAct(isFinalBoss);
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
      // [2026-10-04 莉莉子 BUG修复] 显式传本场剩余水晶：settleRun 内的 run.hp 是战前 HP（stale 闭包）
      const { bonus: gained, detail } = settleRun({ outcome: 'victory', battleHp: playerNexus });
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
        // [2026-09-25 莉莉子 装备不叠加] 候选英雄自带的装备排除其卡上已有的
        setRogueHeroRecruit({ options: buildHeroRecruitOptions(rogue.run.heroKey, rogue.run.difficulty, rogue.run.equippedCards), subNote: note });
      } else {
        // 普通/精英胜利 → 卡牌三选一奖励（[2026-08-25] 候选卡随机佩戴装备，品质随 act 渐进；首战之后恢复正常）
        const options = generateRewardOptions(rogue.run.act, 3, {
          difficulty: rogue.run.difficulty,              // [2026-08-29] 难度品质上限
          equipRarityBonus: rogue.run.equipRarityBonus ?? 0, // [2026-08-29] 等级装备稀有度加成
          forceEquip: battleType === 'elite',       // [2026-08-29] 精英必带装备
          equippedCards: rogue.run.equippedCards,   // [2026-09-25 莉莉子 装备不叠加] 候选卡不再佩戴其已有装备
          // [2026-10-10 程拍板 ②③] 传本局牌组 ⇒ 候选**优先出牌组已有的卡**，且**至少一张不是**；
          //   同时展示端会把它"已有的装备"一并渲染（A + B）
          deckKeys: rogue.run.deck,
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
  // [2026-10-10 莉莉子 BUG修复 · 程实测] **待战节点（瓦尔基里大赛变化出来的战斗节点）也要能一键通过**。
  //   ⚠️ 它**不能**走 `handleRogueVictory`：那条路的事件战斗分支靠 `rogueEventBattle` 把关，而它
  //     **只在"进入战斗"那一刻才被赋值**（见 `handleRogueEventFightStart`）⇒ 玩家站在地图面板上点
  //     "一键通过"时它是 null ⇒ 会掉进**普通胜利分支**：`markDefeated` + 经验照发，
  //     **却不会 `clearPendingBattle`** ⇒ 待战标记还挂着、节点照样要求打仗（＝"通过"没真的生效）。
  //   ⇒ 待战节点直接按「**打赢这场事件战斗**」结算（程 2026-10-10 拍板：奖励一起走完）。
  const handleRogueNodeDevWin = (nodeType: RogueNodeType, nodeId: string) => {
    const pending = rogue.run?.pendingBattles?.[nodeId];
    if (pending) {
      // [2026-10-10 独立审查 P1 修复] 一键通过**按"打赢"结算** ⇒ 真打赢跑的两项通用结算也必须跑：
      //   ① 播种希望投资兑现 ② 武装/强化线的"战斗结束"金币（凯旋之匣 / 拾荒）。
      //   ⚠️ 没有真打过 ⇒ 水晶传**当前值**，等价于"打赢且水晶未受损"（阈值类强化照样能达标）。
      settleBattleEndCommon(rogue.run?.hp);
      // ⚠️ 第三参传 `null`（不是 undefined）⇒ 结算**不写回 HP**（理由见该函数注释 F2）
      settleEventBattleVictory(nodeId, null, pending.reward);
      // [2026-10-10 二轮审查 F6] 这条横幅**放在结算之后** push：结算内部还会逐条 push 奖励回响，
      //   而信息流只留最近 4 条 ⇒ 先 push 会被挤掉（绝密档 3+2 条奖励时必现）。
      pushExpFeed('⚡ 开发者一键通过 · 本场迎战按胜利结算', 'gain');
      return;
    }
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
  // [2026-10-08 莉莉子 · 交互回响层 批次1] 休整三个动作此前**做完什么都不说**（弹窗直接关，连横幅都没有）
  /** 休整·净化：免费移除一张卡 */
  const handleRogueRestRemove = (cardKey: string) => {
    if (!rogue.run) return;
    rogue.removeCard(cardKey);
    pushExpFeed(`🗑️ 已移除「${nameOfCard(cardKey)}」`, 'cost');
  };
  /** 休整·复制：复制一张卡进牌组 */
  const handleRogueRestCopy = (cardKey: string) => {
    if (!rogue.run) return;
    rogue.addCard(cardKey);
    pushExpFeed(`🃏 「${nameOfCard(cardKey)}」+1 已入牌组`, 'gain');
  };
  /** 休整·探路：派出单位卡（暂时移出牌组，2 节点后回归带装备） */
  const handleRogueRestScout = (cardKey: string) => {
    rogue.startScout(cardKey);
    // 探路没有可看的"进行中"界面（探路状态只存在于 run.scout）⇒ 至少把"谁出发了、多久回来"讲清楚
    pushExpFeed(`🗺️ 「${nameOfCard(cardKey)}」已出发 · 2 个节点后带装备回归`, 'gain');
  };

  /**
   * [2026-10-04 程拍板] 整局失败的**唯一结算出口** —— 三条路都汇到这里：
   *   ① 复活次数已耗尽 ② 玩家在复活弹窗里选「放弃并结算」 ③ 消耗失败兜底
   * （原实现直接写在 handleRogueDefeat 体内；抽出来，是为了让"询问复活"那条路
   *   能先落子、再由玩家决定要不要真的结算。）
   */
  const handleRogueFinalDefeat = () => {
    // ═══ [2026-10-10 程拍板 · 独立审查 P1] **必须清掉"事件战斗"标记** ═══
    //   删掉"事件战斗失败特例"之后，这条路径接手了它原先顺手做的清理。
    //   漏清的后果（审查给出完整链路）：stale 标记会活到**下一局**，把新局里第一场
    //   **普通**战斗的胜利误判成"事件战斗胜利" ⇒ 跳过 `markDefeated`/节点经验/金币/卡牌奖励
    //   ⇒ 该节点不在 `defeated` ⇒ 地图后继节点全 locked ⇒ **走不动**（且每赢一次白送一次强化）。
    //   与 `handleRogueRunEnd` 的同名清理对齐。
    setRogueEventBattle(null);
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

  const handleRogueDefeat = (_playerNexus?: number) => {
    // ═══ [2026-10-10 程拍板 · **取消特例**] 事件变化出来的战斗节点 = 普通战斗节点 ═══
    //   原先（2026-08-28 的"可选挑战"口径）：事件战斗打输**不判败北**，只扣 30% 生命回地图。
    //   程要求撤销：「变成战斗节点后，就按普通的战斗节点来就行，失败了就算失败、需要耗费复活次数」。
    //   ⇒ 该特例分支已整段删除，直接落到下方的通用失败处置：
    //     ① 还有复活次数 → 回地图弹窗询问（消耗 1 次后**待战标记保留**，可回到同一节点重打）
    //     ② 复活耗尽   → 整局败北结算
    //   ⚠️ 归一之后，"待战"这条线只体现在「入口是迎战、敌人配置来自 `pendingBattles`」；
    //      成功侧（事件奖励）与失败侧的处置都**不再分叉**。
    // ══════════════════════════════════════════════════════════════════════════

    // ═══ [2026-10-04 程拍板] 还有复活次数 → 回地图**弹窗询问**，不直接判败北 ═══
    //   —— 补齐 08-16 手册缺口 #5「败北时无复活重打逻辑」。
    //   为什么先回地图再问：①「重打本节点」本来就是地图上的动作
    //   ② 询问期间**本局状态完全不动**（不 completeBattle / 不结算 / 不扣次数）
    //      ⇒ 玩家选完才落子；将来若要改成"自动消耗"，把这里换成直接调 accept 即可。
    //   ⚠️ 刻意**不**设 status='dead'：那会让地图进"已死亡"态、还可能让结算窗抢跑；
    //      这里保持 active，把决定权交给弹窗。
    //   📌 范围：本改动**只接"被打死"这条路**；投降（handleSurrender）的既有行为一字未动。
    if (rogue.run && (rogue.run.reviveCount ?? 0) > 0) {
      if (preBattleHpSnapshot !== null) rogue.setHp(preBattleHpSnapshot); // HP 回滚到进战前（复活尚未消耗）
      playBgm('deck_builder');
      setPreBattleHpSnapshot(null);
      setRogueBattleType(null);
      setRogueBattleNodeId(null);
      setRogueEncounter(null);
      setRogueEventBattle(null);
      setAppState('rogue_map');
      setRogueRevivePrompt(true);
      return;
    }

    // 复活次数已耗尽 → 整局败北（先给一条横幅，说明为什么这次没有询问）
    pushExpFeed('♻️ 复活次数已耗尽 —— 本局按失败结算', 'level');
    handleRogueFinalDefeat();
  };

  /** [2026-10-04 程拍板] 复活弹窗 · **使用复活**：消耗 1 次 → 退回地图、**仍停在当前节点**可重打 */
  const handleRogueReviveAccept = () => {
    eventBus.emit(GameEvents.UI_CLICK);
    setRogueRevivePrompt(false);
    if (!rogue.consumeRevive()) {
      // 兜底：弹窗只在 >0 时开，理论上到不了这里；真到了就按失败收场，**绝不白给**
      handleRogueFinalDefeat();
      return;
    }
    // ⚠️ 此处读到的 reviveCount 是本渲染的旧值（consumeRevive 的 setRun 是异步的）⇒ 用 -1 推导剩余
    const left = Math.max(0, (rogue.run?.reviveCount ?? 1) - 1);
    // [2026-10-10 程拍板 · **取消特例**] **不再让待战节点在复活后作废** ——
    //   原先（2026-10-08）：「事件战斗打输 ⇒ 复活后该节点不再要求战斗、直接放行、不堵路」。
    //   现按程的口径归一：**待战标记保留** ⇒ 消耗复活后回到同一节点**重新迎战**，
    //   与普通战斗节点（回到本节点重新挑战）完全一致。
    pushExpFeed(`♻️ 消耗 1 次复活 · 剩余 ${left} 次 —— 回到本节点重新挑战`, 'level');
  };

  /** [2026-10-04 程拍板] 复活弹窗 · **放弃并结算** */
  const handleRogueReviveDecline = () => {
    eventBus.emit(GameEvents.UI_CLICK);
    setRogueRevivePrompt(false);
    handleRogueFinalDefeat();
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
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 领奖回执（此前关窗后无从确认是否真的进牌组）
    pushExpFeed(`🃏 「${nameOfCard(cardKey)}」已加入牌组${equipId ? ` · 附装备「${nameOfEquip(equipId)}」` : ''}`, 'gain');
    setRogueReward(null);
  };
  /** [2026-08-29] 跳过卡牌奖励：放弃三选一，只拿金币 */
  const handleRewardSkip = () => {
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 跳过也要有回执（否则玩家分不清"跳过了"和"没发生过"）
    pushExpFeed(`已跳过卡牌奖励 · 数据金 +${rogueReward?.gold ?? 0} 已入账`, 'info');
    setRogueReward(null);
  };
  // [2026-09-04 首战招募] 选定天启者 → 本体卡 ×HERO_RECRUIT_HERO_COUNT + 随行 2 张阵营卡入队；有装备则穿在英雄本体卡上
  // [2026-10-03 程拍板 · BUG-20261002-21] 本体由 ×1 改 ×2（只增加一张天启者，随行卡不变）——
  //   一张本体在局内死一次就再也用不上这位天启者的法术；两张才能持续使用。
  const handleHeroRecruitPick = (heroKey: string) => {
    if (!rogue.run) { setRogueHeroRecruit(null); return; }
    const opt = rogueHeroRecruit?.options.find(o => o.heroKey === heroKey);
    if (!opt) { setRogueHeroRecruit(null); return; }
    for (let i = 0; i < HERO_RECRUIT_HERO_COUNT; i++) rogue.addCard(heroKey);
    (opt.companionKeys ?? []).forEach(k => rogue.addCard(k));
    if (opt.equipId) {
      rogue.addEquippedCard(heroKey, opt.equipId);
      recordCodexUnlock('equipment', opt.equipId); // [2026-08-26] 图鉴解锁
    }
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 入队回执（本体张数 + 随行卡数一次说清）
    pushExpFeed(`⚡ 「${nameOfCard(heroKey)}」已入队（本体 ×${HERO_RECRUIT_HERO_COUNT} + 阵营卡 ×${(opt.companionKeys ?? []).length}）`, 'gain');
    rogue.markHeroRecruited();
    setRogueHeroRecruit(null);
  };
  /** [2026-09-04 首战招募] 跳过招募（放弃英雄，金币保留）；标记已结算防止后续战斗重复触发 */
  const handleHeroRecruitSkip = () => {
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 放弃英雄要有回执
    pushExpFeed('已放弃本次天启者招募（数据金保留）', 'info');
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
      equippedCards: rogue.run.equippedCards, // [2026-09-25 莉莉子 装备不叠加] 候选卡不再佩戴其已有装备
      // [2026-10-10 程拍板 ②③] 刷新也应守同一口径：优先牌组已有卡、至少一张不是
      deckKeys: rogue.run.deck,
    });
    setRogueReward(prev => prev ? { ...prev, options } : prev);
  };
  /** [2026-08-29] 迷宫强化三选一刷新：消耗刷新次数，返回是否成功（RogueMapScreen 重新生成候选） */
  const handleRogueEnhanceRefresh = (): boolean => {
    if (!rogue.useRefresh()) return false;
    return true;
  };
  /** [2026-09-29 程拍板] 三选一/通关界面开包：**抽到一个奖励匣**（先看到匣子，随后开匣子得道具） */
  const handleRewardOpenPack = (): ChestInstance | null => {
    const chest = userSystem.openPack?.();
    return chest ?? null;
  };

  const handleRogueRest = () => {
    if (!rogue.run) return;
    // [2026-08-28 事件] 牺牲祝福：本局休息回血翻倍（一次性投资结算）
    const restInv = rogue.consumeInvestments('restHeal');
    // [2026-10-05 莉莉子 · 方案 P4 残项] 支持 `restHeal` 的**倍率**（value）：
    //   value 缺省 = 2（旧行为：回血翻倍）；牺牲祝福的小档给 1.5 ⇒ 回血 ×1.5
    const restMult = restInv.length ? (restInv[0].value ?? 2) : 0;
    const pct = restMult > 0 ? 0.3 * restMult : 0.3;
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 此前只有 HUD 血条数字会变；满血时更是白白消耗掉节点
    const hpBefore = rogue.run.hp;
    const wantHeal = Math.floor(rogue.run.maxHp * pct);
    const healed = Math.max(0, Math.min(rogue.run.maxHp, hpBefore + wantHeal) - hpBefore);
    rogue.heal(wantHeal);
    pushExpFeed(
      healed > 0
        ? `❤️ 生命值 +${healed}（休整${restMult > 0 ? ` · 祝福 ×${restMult}` : ''}）`
        : '⚠️ 生命值已满 · 本次休整没有回复生命值',
      healed > 0 ? 'gain' : 'cost',
    );
  };

  const handleRogueEnhance = (key: string) => {
    rogue.applyEnhancement(key);
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 选定回执（此前卡片飞走后什么都没说，玩家只能自己去抽屉翻）
    pushExpFeed(`🧬 已获得「${nameOfEnh(key)}」· 可在左下角头像抽屉查看`, 'gain'); // [2026-08-05] 迷宫强化：选择并应用效果
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
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 购买回执（金额 + 到手物；店铺内原本只有按钮变「已购」）
    pushExpFeed(`🃏 「${nameOfCard(cardKey)}」已入牌组${equipId ? ` · 附装备「${nameOfEquip(equipId)}」` : ''} · 数据金 −${price}`, 'gain');
    return true;
  };
  const handleRogueBuyEnhancement = (enhancementId: string, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.applyEnhancement(enhancementId); // 即时型生效 / 战斗型进 enhancements
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 购买回执
    pushExpFeed(`🧬 已获得「${nameOfEnh(enhancementId)}」· 数据金 −${price}`, 'gain');
    return true;
  };
  // [2026-09-10 莉莉子] 装备页签改批量：先选天启者、再多选装备，点购买一次性扣总价并全部挂到该英雄身上（不受武装槽位限制）
  // [2026-09-25 莉莉子 装备不叠加] 兜底：已在英雄身上的装备不再重复挂、也不重复收费（按"实际生效件数"计价；UI 已置灰为「已装」）
  const handleRogueBuyEquipment = (heroKey: string, equipmentIds: string[], _totalPrice: number) => {
    if (!rogue.run) return false;
    const owned = new Set(rogue.run.equippedCards?.[heroKey] ?? []);
    const applicable = equipmentIds.filter(id => !owned.has(id));
    if (applicable.length === 0) return false;
    const price = applicable.reduce((sum, id) => sum + getEquipmentPrice(getEquipmentById(id)?.rarity ?? 'common'), 0);
    if (!rogue.spendGold(price)) return false;
    for (const equipmentId of applicable) {
      rogue.addEquippedCard(heroKey, equipmentId); // 装备挂到所选天启者卡
      recordCodexUnlock('equipment', equipmentId); // [2026-08-26] 图鉴解锁
    }
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 批量装备回执（件数多时不逐件刷屏）
    const equipNames = applicable.map(nameOfEquip);
    pushExpFeed(`⚔️ 「${nameOfCard(heroKey)}」已装备 ${equipNames.length === 1 ? `「${equipNames[0]}」` : `${equipNames.length} 件`} · 数据金 −${price}`, 'gain');
    return true;
  };
  const handleRogueRemoveCard = (cardKey: string, price: number) => {
    if (!rogue.spendGold(price)) return false;
    rogue.removeCard(cardKey);
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 删卡回执
    pushExpFeed(`🗑️ 已移除「${nameOfCard(cardKey)}」· 数据金 −${price}`, 'cost');
    return true;
  };
  const handleRogueShopRefresh = () => {
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 刷新回执（此前只有按钮上的数字静默 −1）
    const refreshBefore = rogue.run?.refreshCount ?? 0;
    if (!rogue.useRefresh()) return false;
    pushExpFeed(`🔄 商品已刷新 · 剩余刷新 ${Math.max(0, refreshBefore - 1)} 次`, 'info');
    return true;
  };

  // ==========================================
  // [2026-08-12 宝箱节点] 宝箱领取 handlers
  // ==========================================
  const handleRogueTreasureGold = (amount: number) => {
    rogue.addGold(amount);
    pushExpFeed(`💰 数据金 +${amount}`, 'gain'); // [2026-10-08 莉莉子 · 交互回响层 批次1]
  };
  const handleRogueTreasureCard = (cardKey: string, equipId: string | undefined) => {
    rogue.addCard(cardKey);
    if (equipId) {
      rogue.addEquippedCard(cardKey, equipId); // 带装备的卡：装备附加到该卡
      recordCodexUnlock('equipment', equipId); // [2026-08-26] 图鉴解锁
    }
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 领奖回执
    pushExpFeed(`🃏 「${nameOfCard(cardKey)}」已入牌组${equipId ? ` · 附装备「${nameOfEquip(equipId)}」` : ''}`, 'gain');
  };
  const handleRogueTreasureEnhancement = (enhancementId: string) => {
    rogue.applyEnhancement(enhancementId);
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
    pushExpFeed(`🧬 已获得「${nameOfEnh(enhancementId)}」`, 'gain'); // [2026-10-08 交互回响层 批次1]
  };
  const handleRogueTreasureSacrifice = (enhancementId: string) => {
    // [2026-10-08 莉莉子 · 交互回响层 批次1] 代价（生命上限）此前完全静默就扣掉了，回执要**先说代价再说所得**
    const maxBefore = rogue.run?.maxHp ?? 0;
    const maxAfter = Math.max(10, maxBefore - SACRIFICE_MAX_HP); // 与 adjustMaxHp 的下限口径一致
    rogue.adjustMaxHp(-SACRIFICE_MAX_HP); // 牺牲 -10 生命上限
    rogue.applyEnhancement(enhancementId); // 换取史诗强化
    recordCodexUnlock('enhancement', enhancementId); // [2026-08-26] 图鉴解锁
    pushExpFeed(`🫀 生命上限 −${maxBefore - maxAfter}（现为 ${maxAfter}）· 换取「${nameOfEnh(enhancementId)}」`, 'cost');
  };
  const handleRogueTreasureRandom = (result: RandomTreasureResult) => {
    switch (result.kind) {
      // [2026-10-08 莉莉子 · 交互回响层 批次1] 随机宝箱：揭示步骤已有，但「领取」这一下也要留回执（结果落袋为准）
      case 'gold': rogue.addGold(result.amount); pushExpFeed(`💰 数据金 +${result.amount}`, 'gain'); break;
      case 'card':
        rogue.addCard(result.cardKey);
        if (result.equipId) {
          rogue.addEquippedCard(result.cardKey, result.equipId);
          recordCodexUnlock('equipment', result.equipId); // [2026-08-26] 图鉴解锁
        }
        pushExpFeed(`🃏 「${nameOfCard(result.cardKey)}」已入牌组${result.equipId ? ` · 附装备「${nameOfEquip(result.equipId)}」` : ''}`, 'gain');
        break;
      case 'enhancement':
        rogue.applyEnhancement(result.enhancementId);
        recordCodexUnlock('enhancement', result.enhancementId); // [2026-08-26] 图鉴解锁
        pushExpFeed(`🧬 已获得「${nameOfEnh(result.enhancementId)}」`, 'gain');
        break;
      case 'maxHp': rogue.adjustMaxHp(result.amount); pushExpFeed(`🫀 生命上限 +${result.amount}`, 'gain'); break;
      case 'revive': rogue.addRevive(result.amount); pushExpFeed(`♻️ 复活 +${result.amount}`, 'gain'); break;
      case 'refresh': rogue.addRefresh(result.amount); pushExpFeed(`🔄 刷新 +${result.amount}`, 'gain'); break;
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
  // [2026-10-05 莉莉子 · 方案 P3/P4 结构重构] **事件效果执行收口到注册表**
  //   （`data/roguelike/eventAppliers.ts`：提示与执行同源、并回报"实际发生了什么"）
  //   这里只负责把 App 的能力注入进去：`rogue.*` + 三个 App 内工具（随机卡 / 污染卡 / 英雄新装备）。
  const buildEventApi = (): EventApi => ({
    run: rogue.run!,
    difficulty: rogue.run!.difficulty, // [2026-10-08 难度分层] 事件奖励按难度分层
    addGold: (n) => rogue.addGold(n),
    heal: (n) => rogue.heal(n),
    setHp: (n) => rogue.setHp(n),
    adjustMaxHp: (n) => rogue.adjustMaxHp(n),
    addRevive: (n) => rogue.addRevive(n),
    addRefresh: (n) => rogue.addRefresh(n),
    addCard: (k) => rogue.addCard(k),
    addEquippedCard: (k, e) => rogue.addEquippedCard(k, e),
    removeCard: (k) => rogue.removeCard(k),
    removeRandomEquipment: () => rogue.removeRandomEquipment(),
    applyEnhancement: (id) => rogue.applyEnhancement(id),
    addInvestment: (inv) => rogue.addInvestment(inv),
    addFightDebuff: (d) => rogue.addFightDebuff(d),
    recordCodexUnlock: (t, id) => recordCodexUnlock(t, id),
    randomCollectibleCard,
    randomJunkCard,
    pickNewEquipForHero,
  });

  const applyEventEffects = (ef: RogueEventEffect): EventApplyResult[] => {
    if (!rogue.run) return [];
    return applyEffect(ef, buildEventApi()); // 递归（gamble / forced）在注册表内部完成
  };

  /** [2026-08-28 事件] 事件选项回调：先删卡（removePicks 自选）→ 执行效果 → 战斗型触发事件战斗
   *  [2026-10-05 · 方案 P3] **返回"实际结果清单"** ⇒ 事件弹窗据此渲染「结果」步骤 */
  const handleRogueEvent = (eventId: string, choiceIndex: number, removePicks?: string[]): EventApplyResult[] => {
    const results: EventApplyResult[] = [];
    if (!rogue.run) return results;
    rogueStatsRef.current.events++; // [2026-08-29 肉鸽任务] 完成事件统计
    const ev = ROGUE_EVENT_BY_ID[eventId];
    if (!ev) return results;
    const choice = ev.choices[choiceIndex];
    if (!choice) return results;
    // [2026-10-05 莉莉子 BUG修复 · 20261005-13] **事件已结算 ⇒ 记下"这个节点做过了"**
    //   粉丝反馈：右键事件节点可反复进入、每次抽新事件刷奖励 ⇒ 用这条记录把"右键面板的进入"挡掉。
    //   记在"做出选择之后"（此处）而不是"打开弹窗时" —— 没结算就走人不该算完成。
    if (rogue.run.currentNodeId) rogue.markNodeResolved(rogue.run.currentNodeId);
    for (const k of removePicks ?? []) {
      const nm = CARD_DB[k]?.name?.replace(/\n/g, '') ?? k;
      rogue.removeCard(k);
      results.push({ kind: 'cost', icon: '🗑️', text: `移除卡牌「${nm}」` }); // [P3] 手选删卡也要出现在结果里
    }
    let shouldFight = false;
    let fightReward: 'enhancement' | 'choose2' = 'enhancement';
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] 收集"打谁 + 敌方持有强化"（由选择决定）
    let fightOpponents: string[] | undefined;
    let fightEnemyEnh: string[] = [];
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **必须走唯一出口** `resolveChoiceEffects` ——
    //   整档难度奖励（`effectsByDifficulty`）的取用要与「选项提示」(NodeEventModal:689) **完全同源**，
    //   否则又是"选项写一套、实际给另一套"（eventAppliers.ts 头注释记过的老病）。
    const diffEffects = resolveChoiceEffects(choice, rogue.run.difficulty);
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **奖励延后**：程的规格是「每个战斗都是**赢了之后**会获得」
    //   ⇒ 本选项若会进战斗，则把"奖励类"效果（指定强化 / 天启者卡）**扣下不发**，
    //     存进 `pendingBattle.rewards`，等打赢了再执行（输了一并作废）。
    const willFight = diffEffects.some(ef => !!ef.fight);
    const deferredRewards: RogueEventEffect[] = [];
    const isBattleReward = (ef: RogueEventEffect) => !!(ef.addEnhancementFrom || ef.grantHeroCard);

    for (const ef of diffEffects) {
      if (ef.fight) {
        shouldFight = true;
        fightReward = ef.fight.reward;
        fightOpponents = ef.fight.opponentHeroKeys;
        fightEnemyEnh = ef.fight.enemyEnhancements ?? [];
        results.push({ kind: 'info', icon: '⚔️', text: '迎战' });
        continue;
      }
      if (willFight && isBattleReward(ef)) { deferredRewards.push(ef); continue; }
      if (ef.removeCards && (removePicks?.length ?? 0) > 0) {
        const { removeCards: _rc, ...rest } = ef;
        results.push(...applyEventEffects(rest as RogueEventEffect));
        continue;
      }
      results.push(...applyEventEffects(ef));
    }
    // 事件战斗：[2026-10-08 莉莉子 · 交互回响层 批次3] **不再立即切 loading**
    //   病根：原来 setAppState('loading') 与弹窗的 setEventStep('result') 落在同一批更新里，
    //   地图屏当帧卸载 ⇒ 「结果」步骤**根本来不及渲染**，玩家既看不到拿到了什么、也没有"我要迎战"的确认。
    //   现在只登记"待战"，真正进战斗交给结果步骤的「迎战」按钮 → handleRogueEventFightStart。
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **通用流程改动（程拍板 🅰️）**：
    //   事件战斗**不再立即切进战斗**，而是把该节点登记为「**待战节点**」——
    //   玩家看到剧情、点确定后**回地图**，那个节点会显示成战斗节点，**点它才开打**。
    //   ⚠️ 这条对**所有 `fight` 类事件**生效（含旧的 ev_ambush / ev_arena），是有意的统一。
    if (shouldFight && rogue.run.currentNodeId) {
      rogue.setPendingBattle(rogue.run.currentNodeId, {
        opponentHeroKeys: fightOpponents,
        enemyEnhancements: fightEnemyEnh,
        reward: fightReward,
        rewards: deferredRewards, // 打赢才发（见上方说明）
      });
    }
    return results; // [P3] 交给事件弹窗渲染「结果」步骤（玩家不必再靠猜血条/金币）
  };

  /**
   * [2026-10-10 莉莉子 · 收口] **事件战斗（待战）遭遇构建 —— 唯一出口**
   *   「迎战」入口（`handleRogueEventFightStart`）与**「重开当前战斗」**共用它 ⇒ 重开后**对手与敌方强化**一致。
   *   ⚠️ [2026-10-10 独立审查 P2] 但**牌组构成与敌方装备仍会重掷** —— 本函数内部走的是 `encounterBuilder`
   *      的随机填充/洗牌 + `rollEnemyEquipments` 随机配装（既有行为）。要"完全可复现的重开"，得改成
   *      **缓存进战时的 encounter 并复用**（未做，见日记待办）。
   *   · `opponentHeroKeys` 非空 ⇒ 走"按天启者构建"（单人反查流派 / 双人**合成混合流派**）
   *   · 缺省（旧的 fight 事件，如 ev_ambush / ev_arena）⇒ 沿用原来的随机流派，**老行为零变化**
   *   ⚠️ 唯一真源是 `pendingBattles[nodeId]` —— **绝不能**改走 `rogueBattleArchetypeId`（那是普通战斗节点的路径）。
   */
  const buildEventBattleEncounter = (nodeId: string) => {
    if (!rogue.run) return null;
    const pending = rogue.run.pendingBattles?.[nodeId];
    if (!pending) return null;
    return pending.opponentHeroKeys?.length
      ? buildEncounterForHeroes(pending.opponentHeroKeys, 'elite', rogue.run.difficulty, pending.enemyEnhancements)
      : buildRoguelikeEncounter('elite', rogue.run.act, rogue.run.difficulty, undefined, pending.enemyEnhancements);
  };

  /** [2026-10-08 莉莉子 · 瓦尔基里大赛] 事件「迎战」：**改由地图的待战节点触发**。
   *  改用 `pendingBattles[currentNodeId]` 作为唯一配置来源（不再依赖弹窗内的即时切换）。
   *  ⚠️ [2026-10-10 三轮审查 F4 更正] `onEventFight` **其实不是"弹窗内按钮回调"**：
   *    `NodeEventModal` 只把它当**真值标志**用（`NodeEventModal.tsx:681` 的 `const willFight = !!onEventFight`
   *    → 决定「离开」文案），**从不调用它**。真正调用的是地图侧两处：
   *    `RogueMapScreen.tsx:555`（`doEnterNode` 的待战分支，当前不可达）与 `:1143`（右键预览面板）。
   *    两处都是**真开打**，配置都从 `pendingBattles` 读。 */
  const handleRogueEventFightStart = () => {
    if (!rogue.run) return;
    const nid = rogue.run.currentNodeId;
    const pending = nid ? rogue.run.pendingBattles?.[nid] : undefined;
    if (!pending) return;
    // [2026-10-10 莉莉子 · 收口] 遭遇构建改走**共用出口** `buildEventBattleEncounter`
    //   （与「重开当前战斗」同源 ⇒ 重建出**同一对手 + 同一份敌方强化**；规则见该函数注释）
    const encounter = nid ? buildEventBattleEncounter(nid) : null;
    if (!encounter) return;
    // ══════════════════════════════════════════════════════════════════
    // [2026-10-10 莉莉子 BUG修复 · 二轮独立审查 F1] **本场"天启者是否阵亡"标记必须在这里复位**
    //   ── 病根（**既有 BUG**，2026-10-08 待战流程引入）：普通战斗入口早就有 `resetBattleFlags()`
    //      （`handleRogueBattle`），**待战入口漏了**；而唯一读它的 `settleArmamentBattleEnd`
    //      正是「凯旋之匣」的判据 ⇒
    //      「待战战斗里她阵亡 → 用复活回同一节点重打 → 这次她没死并打赢」时，
    //      （[2026-10-10 程拍板] 待战失败已改按普通战斗处理 ⇒ 这条"重打同一节点"的路径现在是常规路径）
    //      结算读到**上一场遗留的 `true`** ⇒ **凯旋之匣金币被错误扣下**。
    //   ── 该标记全库只有凯旋之匣一个消费者 ⇒ 战斗开始复位是唯一正确时点。
    // ══════════════════════════════════════════════════════════════════
    rogue.resetBattleFlags(); // 凯旋之匣：本场"天启者是否阵亡"标记复位
    setRogueEncounter(encounter);
    setRogueEventBattle({ reward: pending.reward }); // 保留：胜利时据此走"事件战斗奖励"分支
    setRogueBattleNodeId(nid ?? null);               // 让胜利时能 clearPendingBattle(battleNodeId)
    setPreBattleHpSnapshot(rogue.run.hp);
    stopMovie();
    setAppState('loading');
  };

  /** [2026-10-05 莉莉子 · 方案 P4 §3] 「深层回响」结算：
   *  代价 = 已进入各层的 costPct 之和（% 上限生命）；奖励 = 每层 1 件装备，≥3 层时其中 1 件换成迷宫强化。
   *  ⚠️ 走的是**同一套注册表**（`applyEventEffects`）⇒ 结果文案与其它事件完全一致。 */
  const handleRogueEventDeep = (eventId: string, layers: number): EventApplyResult[] => {
    const results: EventApplyResult[] = [];
    if (!rogue.run) return results;
    const cfg = ROGUE_EVENT_BY_ID[eventId]?.deepEcho;
    if (!cfg) return results;
    if (rogue.run.currentNodeId) rogue.markNodeResolved(rogue.run.currentNodeId); // 与其它事件同口径：结算即"用掉"
    const taken = Math.max(1, Math.min(layers, cfg.costPctByLayer.length)); // 保底 1 层
    const totalPct = cfg.costPctByLayer.slice(0, taken).reduce((s, n) => s + n, 0);
    results.push(...applyEventEffects({ hpPct: -totalPct }));
    for (let i = 0; i < taken; i++) {
      const isLast = i === taken - 1;
      results.push(...applyEventEffects(isLast && taken >= 3 ? { addEnhancement: true } : { addEquipment: true }));
    }
    return results;
  };

  const handleRogueRunEnd = () => {
    const wasWin = rogue.run?.status === 'won'; // [2026-08-29] 通关 → 肉鸽大厅
    rogue.resetRun();
    rogue.clearPendingRun(); // [2026-08-28 对局记录] 整局结束（通关/死亡）清除未结算存档
    setHasPendingRun(false); // [2026-08-28 对局记录]
    setPreBattleHpSnapshot(null); // [2026-08-11] 整局结束，快照失效
    setRogueEncounter(null);
    setRogueReward(null);
    setRogueEventBattle(null); // [2026-10-08 · 批次3] 整局结束 ⇒ 清掉可能滞留的「迎战」待战标记
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
  //
  // [2026-10-10 莉莉子 BUG修复 · 程实测] **修「待战/事件战斗里重开不怎么生效」**：
  //   ── 病根（两处叠加）：① 待战战斗的入口 `handleRogueEventFightStart` **从不写** `rogueBattleType`
  //      （它回地图时被清成 null）② 本函数开头 `if (!rogueBattleType …) return` ⇒ **点了直接 return，毫无反应**；
  //      即便残留了旧值，重建用的也是 `rogueBattleArchetypeId` / `rogueBattleBuffs`（那是**普通战斗节点**的口径）
  //      ⇒ 重开后**对手换人**（丢掉瓦尔基里大赛指定的敌方卡组）。
  //   ── 修法：待战战斗（`pendingBattles[nodeId]` 存在）改走 `buildEventBattleEncounter` —— 与「迎战」入口
  //      **同一个出口**，重建出**同一对手 + 同一份敌方强化**；`rogueBattleType` 只在**普通战斗节点**才是必需的。
  //      ⚠️ [2026-10-10 独立审查 P2 更正] 我原先写的"逐字一致"**说过头了**：`buildEventBattleEncounter`
  //        内部仍是 `encounterBuilder` 那套随机（牌组填充/洗牌 + 敌方装备全随机）⇒
  //        **牌组构成与敌方装备每次重建都会重掷**（与普通战斗节点的重开同性质、也是改动前的既有行为）。
  //        定死的只有「对手（天启者/流派）」与「敌方强化」。
  const handleRogueRestartBattle = () => {
    if (!rogue.run || !rogueBattleNodeId) return;
    // ① 待战/事件战斗 ⇒ 真源是 `pendingBattles`
    const eventEncounter = buildEventBattleEncounter(rogueBattleNodeId);
    // ② 普通战斗节点 ⇒ 同节点同流派 + 同一份预分配迷宫强化
    const encounter = eventEncounter ?? (rogueBattleType
      ? buildRoguelikeEncounter(
          rogueBattleType as 'battle' | 'elite' | 'boss',
          rogue.run.act,
          rogue.run.difficulty,
          rogueBattleArchetypeId,
          rogueBattleBuffs // [2026-08-27 莉莉子] 重开保持同一份预分配迷宫强化
        )
      : null);
    // 两个来源都不成立 ⇒ 无从重建（保守：宁可不重开，也绝不打错人）
    //   ⚠️ [2026-10-10 独立审查 P3] HP 回滚**必须留在这道门之后**：否则"有 nodeId、但两个来源都取不到"
    //      的状态下会「先改 HP、又不重开」（旧代码在回滚之前就 return 了）。
    if (!encounter) return;
    // ══════════════════════════════════════════════════════════════════
    // [2026-10-10 莉莉子 BUG修复 · **三轮独立审查 F1**] 重开也是**战斗入口**，同样必须复位本场标记。
    //   ── 三轮审查证明这条链**普通玩家可达**且症状与 F1 同族：
    //      「迎战」开始（已复位）→ 战斗中天启者阵亡（标记置 true）→ 玩家按 ESC「我遇到了BUG需要重开」
    //      → **重开不复位** → 重开后她存活并打赢 ⇒ 结算读到旧 `true` ⇒ **凯旋之匣金币被错误扣下**。
    //   ── 三处"建立遭遇并进战斗"的点现在**口径一致**：普通战斗 / 迎战 / 重开 都复位。
    //   ⚠️ 遗留（**未修，见日记旁支**）：事件战斗**失败**分支不清该标记 ⇒ 它在回地图期间会挂着；
    //      正常玩家下次胜利必经某个入口（会复位），但开发者在地图上「一键胜利」普通战斗节点时会读到它。
    // ══════════════════════════════════════════════════════════════════
    rogue.resetBattleFlags(); // 凯旋之匣：本场"天启者是否阵亡"标记复位
    if (preBattleHpSnapshot !== null) rogue.setHp(preBattleHpSnapshot); // 回滚进战前 HP（快照保持不变，重开后回到同一点）
    setRogueEncounter(encounter);
    setGameId(id => id + 1); // [重挂] key={rogue_${gameId}} 变化 → RogueGameWrapper/GameSession 重新初始化
    setAppState('loading'); // 走加载界面重进战斗
  };

  // ══════════════════════════════════════════════════════════
  // [2026-09-25 莉莉子 投降] ESC 暂停层的「投降」与「我遇到了BUG需要重开」
  //   背景：原第三按钮是 window.close() 直接关游戏，与设置里的 QUIT GAME 完全重合，
  //   也不符合直觉（玩家点它多半是"这把打不了了"）。现改为投降 + 三选项二级确认。
  // ══════════════════════════════════════════════════════════
  const [surrenderSignal, setSurrenderSignal] = useState(0); // 递增 → GameSession 把本场以战败收场

  /**
   * 投降（认输）
   * [2026-10-04 程拍板] 肉鸽里**与「被打死」走同一条路** —— `handleRogueDefeat` 已完整包含两段：
   *   ① 还有复活 → 弹**复活确认窗**（使用 / 放弃）② 耗尽 → 整局败北。
   *   [2026-10-10 程拍板 · 取消特例] 原先还有第 0 段「事件变化出来的战斗节点失败 → 只扣 30% 生命回地图」
   *   —— 已撤销：**待战节点与普通战斗节点的失败处置完全一致**（见 `handleRogueDefeat` 的注释）。
   *   ⚠️ 原先投降是"自己消费一次复活就回地图"、**不弹确认窗** —— 与"打死了才弹"不一致（程指出这是漏的）。
   */
  const handleSurrender = () => {
    eventBus.emit(GameEvents.UI_CLICK);
    if (appState === 'rogue_game') {
      handleRogueDefeat(); // ← 唯一入口：本场失败的全部处置（含复活确认）都在里面
      return;
    }
    // 标准 / 地下清理：请求本场以战败收场（GameSession 收到后清零水晶 → 走既有失败结算）
    setSurrenderSignal(n => n + 1);
  };

  /** 我遇到了BUG需要重开：重新开始本场战斗，**不消耗任何内容** */
  const handleRestartBattle = () => {
    eventBus.emit(GameEvents.UI_CLICK);
    if (appState === 'rogue_game') {
      handleRogueRestartBattle(); // 复用既有的肉鸽重开（HP 回滚 + 同节点同流派重建，不消耗复活）
      return;
    }
    // 标准 / 地下清理：直接重挂战斗（gameId 递增 → GameSession 重新初始化），牌组与遭遇不变
    setGameId(prev => prev + 1);
    setAppState('loading');
  };

  /** 投降确认窗里的后果说明（按模式给出，玩家一眼知道会发生什么） */
  const surrenderNote = appState === 'rogue_game'
    ? `· 本场视作死亡一次（与战败走同一套流程）\n· 还有复活次数：会弹出确认，可选择「使用复活」重打本关，或「放弃并结算」\n· 复活已耗尽：本局直接按失败结算`
    : '· 本场视作认输，按「战败」流程结算（战绩与经验均按失败计）\n· 该操作不可撤销';

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
          // [2026-10-04] 复活弹窗开着时吞掉 ESC —— 它是**必须二选一**的窗（没有关闭按钮）；
          //   若放行，玩家能把它关掉，留下"战斗已结束、本局却没落子"的悬空状态
          if (rogueRevivePrompt) {
              e.preventDefault(); e.stopImmediatePropagation();
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
    else if (appState === 'game' || appState === 'rogue_game') {
        // 游戏内：BGM 由 GameSession 内部触发 playBgm('battle')，这里不干涉
        // 这样每次进入 GameSession 都会触发它的 useEffect，从而重新随机
        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 语音音量的补偿广播
        // ── 这条补偿**原来只挂 `appState === 'game'`** ⇒ **迷宫（`'rogue_game'`）永远走不到**
        //    ⇒ 每个战斗节点新挂的 `useVoice`（`GameSession.tsx:921`）一直用默认 0.8
        //    = 程实测的「迷宫里每次进新对局语音音量都被重置，得在局内再拖一次滑块」。
        // ── 现在正确性已由全局音量快照（`utils/audioVolume`）兜底（新实例 mount 时自取现值），
        //    这里补上 `rogue_game` 只是让"正在播的那一条"也能被即时校正（双保险，不是唯一依赖）。
        // =====================================
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
  {/* [2026-10-14 程拍板] 全屏按钮已迁入设置窗口 → SettingsModal「Video Quality / Display」 */}
  <TouchFeedbackLayer />
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
                spellDynamic={(userSystem.settings as any)?.spellDynamic || false} // [2026-09-26] 动态法术/单位卡面
                cardBackIndex={tutorialStageId ? 0 : (userSystem.activeDeck?.cardBackIndex ?? userSystem.settings.customization.currentCardBackIndex)}
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
                firstAttacker={firstAttacker} // ★ PVE 随机先手
                aiDifficulty={standardDifficulty} // [2026-08-06] 标准对战 AI 难度
                onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
                onQuitGame={handleQuitGame} onSurrender={handleSurrender} onRestartBattle={handleRestartBattle} surrenderNote={surrenderNote} surrenderSignal={surrenderSignal}
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
                spellDynamic={(userSystem.settings as any)?.spellDynamic || false} // [2026-09-26] 动态法术/单位卡面
                missionSystem={missionSystem} // [核心挂载] 注入军功大脑供结算画面使用
                onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
                onQuitGame={handleQuitGame} // [2026-09-25 莉莉子] 教程模式不接投降（投降对教程无意义），保留原退出
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

      {/* [2026-10-08 莉莉子 · 瓦尔基里大赛] 迎战胜利 · **第一段**奖励弹窗（强化 / 天启者卡）
          程的流程是「先弹强化奖励，再弹卡牌奖励」⇒ 关掉它才弹第二段（卡牌三选一） */}
      {eventBattleReward && rogue.run && (
          <EventBattleRewardModal
              results={eventBattleReward.results}
              onClose={() => {
                  const thenCards = eventBattleReward.thenCards;
                  setEventBattleReward(null);
                  if (!thenCards) return;
                  // 第二段：卡牌三选一（事件战斗不发金币 ⇒ gold 0；走现有的 BattleRewardModal）
                  const options = generateRewardOptions(rogue.run!.act, 3, {
                      difficulty: rogue.run!.difficulty,
                      equipRarityBonus: rogue.run!.equipRarityBonus ?? 0,
                      equippedCards: rogue.run!.equippedCards,
                      // [2026-10-10 程拍板 ②③] 事件战斗的第二段三选一同口径
                      deckKeys: rogue.run!.deck,
                  });
                  setRogueReward({ gold: 0, options });
              }}
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
              pendingChests={(userSystem.settings?.pendingChests ?? []) as ChestInstance[]} // [2026-09-29] 通关结算开匣
              // [2026-10-04 独立审查 #10 修复] ⚡ 一键开匣 + 武装库存：**从本处这个唯一实例下发**
              //   （此前 RunEndModal 自己 new 了第二个 useUserSystem ⇒ settings 是独立快照、互不同步
              //     ⇒ 一边一键全开清空队列后，另一边仍按旧快照列出 ⇒ **匣子可被重复开（双发）**）
              onOpenAllChests={() => userSystem.openAllChests?.() ?? []}
              armamentStock={readArmStock(userSystem.settings)}
              onOpenChest={(i: number) => userSystem.openChest?.(i) ?? null} // [2026-09-29] 打开匣子
              onShardDrop={(res: any) => { // [2026-09-29] 碎片入账（divinity 是钱包真源）
                // [2026-10-02 莉莉子 BUG修复 #18] 判据由 `res?.wallet` 改为 `res?.kind === 'shard'` ——
                //   碎片该不该入账，原来被绑在一个**与业务无关的返回字段**上
                //   （openChest 传的正是 `dropShards(undefined, …)`，就是「吞碎片」那条的同一个坏味道）。
                //   一旦 dropShards 哪天不再返回 wallet，碎片就会被**静默丢弃**（数据丢失）。
                //   `applyShardDrop` 内部已改为按 details 逐笔入账、且**忽略传入的 wallet**，
                //   所以这里只需要正确回答"该不该发"。
                if (res?.kind !== 'shard') return;
                const details = res.shardDetail ?? [];
                const totalOverflow = details.reduce((s: number, d: any) => s + (d?.overflow > 0 ? d.overflow : 0), 0);
                divinity.applyShardDrop({ wallet: res.wallet, details, totalOverflow });
              }}
              // [2026-10-02 莉莉子 BUG修复 #17] 局中「评估嘉勉」入口（此前只有肉鸽大厅有，局中无处开匣子）
              onOpenEvaluation={() => setEvaluationOpen(true)}
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
              onEventFight={handleRogueEventFightStart} // [2026-10-08 · 批次3] 迎战：结果步骤点按钮才进战斗
              onEventDeep={handleRogueEventDeep} // [2026-10-05 · 方案 P4 §3] 深层回响结算
              onMarkNodeResolved={rogue.markNodeResolved} // [2026-10-05 · 方案 P1] 节点服务已用掉（防右键反复进入刷取）
              onConsumeEnhancementRank={() => rogue.consumeInvestments('enhancementRank')} // [2026-08-28] 托付遗物投资消费
              isDev={userSystem.userId === 'dev_full_admin'} // [2026-08-31 莉莉子 开发者] 开发者走任意选强化
              onDevPick={handleRogueDevPick} // [2026-08-31 莉莉子 开发者] 多选确认
              // [2026-10-10 莉莉子 开发者 · 事件审阅台] 切换事件时把整局状态回滚到"刚进这个事件节点"那一份快照
              //   （快照由 RogueMapScreen 持有；这里只做通路，无任何逻辑）
              onDevRestoreRun={rogue.restoreRun}
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
              spellDynamic={(userSystem.settings as any)?.spellDynamic || false} // [2026-09-26] 动态法术/单位卡面
              missionSystem={missionSystem}
              firstAttacker={rogueFirstAttacker} // [2026-10-03 莉莉子 BUG修复] 原为内联 Math.random() ⇒ 每次渲染重抽 ⇒ 同一方连攻；现改为**一场战斗抽一次**（见上方 rogueFirstAttackerRef 注释）
              onOpenSettings={() => setIsSettingsOpen(true)} // [2026-08-30 莉莉子] 暂停层齿轮 → 设置面板
              onQuitGame={handleQuitGame} onSurrender={handleSurrender} onRestartBattle={handleRestartBattle} surrenderNote={surrenderNote} surrenderSignal={surrenderSignal}
              isSettingsOpen={isSettingsOpen} // [2026-08-30 莉莉子] 暂停 ESC 协调
              onAccountSettle={handleRealMatchSettled} // [2026-09-04 账号等级/战绩]（rogue 逐节点在 GameOverScreen 被跳过，整局走 settleRun）
          />
      )}

      {/* 全局设置面板 */}
          <SettingsModal
              isOpen={isSettingsOpen}
              onClose={() => setIsSettingsOpen(false)}
              // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 归一化：补上长期缺失的 `movie` 通道并夹紧越界值
              //   （原来直接传 `settings.volume` —— 而它的类型/默认值里都**没有 movie**，
              //    滑块初值是 `undefined`，拖动之前 UI 与逻辑都不干净）
              volumes={normalizeVolumes(userSystem.settings.volume)}
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
              spellDynamic={(userSystem.settings as any)?.spellDynamic || false} // [2026-09-26] 动态法术/单位卡面开关
              onToggleSpellDynamic={() => userSystem.updateSettings({ spellDynamic: !(userSystem.settings as any)?.spellDynamic } as any)}
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
              divinity={divinity} // [2026-09-29 程拍板] 奖励匣开箱（碎片入账需 divinity）
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

      {/* [2026-10-04 程拍板] 复活询问弹窗 —— 本场推演失败且仍有复活次数时弹出（**必须二选一**，ESC 已被吞掉） */}
      {appState === 'rogue_map' && rogueRevivePrompt && rogue.run && (
          <ReviveModal
              remaining={rogue.run.reviveCount ?? 0}
              onAccept={handleRogueReviveAccept}
              onDecline={handleRogueReviveDecline}
          />
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
                poster={currentMoviePoster} // [2026-10-19 莉莉子 · 安卓] 静态图兜底（undefined ⇒ 不写该属性，PC/旧行为零变化）
                isVisible={isVisible}
                isLoop={isLooping}
                onEnded={handleVideoEnded}
                // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 接上「过场」音量（此前这条通道完全没接 ⇒ 滑块是装饰品）
                volume={movieVolume}
                // [核心修复] 将 shop 加入白名单
                zIndex={(appState === 'title' || appState === 'lobby' || appState === 'mode_select' || appState === 'gacha' || appState === 'shop') ? 0 : 500}
                noFade={isImmediate}
            />

      {/* [2026-10-03 莉莉子] 胜利影片 · 跳过按钮（功能/位置/样式/层级 逐项对齐升级动画右上角那颗） */}
      <AnimatePresence>
          {isVisible && movieKind === 'victory' && showVictorySkip && (
              <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); skipMovie(); }}
                  className="fixed top-8 right-8 z-[9999] flex items-center gap-2 px-6 py-3 bg-black/60 hover:bg-white/20 border border-white/20 hover:border-white/50 rounded-full text-white font-mono tracking-widest text-sm backdrop-blur-md transition-all pointer-events-auto group"
              >
                  <SkipForward size={16} className="group-hover:translate-x-1 transition-transform" />
                  SKIP MOVIE
              </motion.button>
          )}
      </AnimatePresence>
        </div>
    </ScaleWrapper>
  );
}