import React, { useState, useEffect, useCallback, useRef,useMemo } from 'react';
import { Clock, Home } from 'lucide-react';
import type { CardData, SpellStackItem } from '../types';
import { Card, HeroCardMediaContext } from './Card';
import { SmartNexus, Deck } from './GameUI';
import { RogueModPanel } from './roguelike/RogueModPanel'; // [2026-08-11] 迷宫强化战斗内状态栏
import { RogueBuffFlash } from './roguelike/RogueBuffFlash'; // [2026-08-11] 迷宫强化触发水晶闪烁
import { FullArtOverlay, LevelUpOverlay, GameOverScreen } from './Overlays';
import { useGameState } from '../hooks/useGameState';
import { useAI } from '../hooks/useAI';
import { evaluateChoiceCondition, canAffordCard } from '../utils/gameRules';
import { Battlefield } from './Battlefield';
import { CARD_DB, createCard } from '../data/cards';
import { eventBus, GameEvents, StrikeEvents } from '../utils/eventBus';
import { useVoice } from '../hooks/useVoice';
// [核心引入] 引入 LEVELUP_ICONS
import { UI_IMAGES, PERSONALIZATION_ASSETS, getSkinImage, LEVELUP_ICONS } from '../data/imageData';
import { DeskMedia } from './DeskMedia'; // [2026-08-13] 动态牌桌媒体组件（兜底静态图 + 日志）
import { ManaGemSystem } from './ManaGemSystem';
import { calculateNewMana } from '../utils/gameRules';
import { getCardBackUrl} from '../utils/styleUtils';
// [修改] 引用新的 Hook
import { PlayerHand, EnemyHand, OpeningMulligan, CalibratePanel, HandAnimOverlay, DrawAnimOverlay } from './CardAnimations';
import { notifyScoutState } from './KeywordEffects'; // [侦察] 攻击宣言期侦察状态广播
import { RecordPanel } from './RecordPanel';
import { GameAnnouncement } from './GameAnnouncement';
import { useGameAnnouncer } from '../hooks/useGameAnnouncer';
import { useSpellSystem, waitForStrikeComplete } from '../hooks/useSpellSystem'; // [新增]
import { useGameButton } from '../hooks/useGameButton'; // [新增]
import { useMulligan } from '../hooks/useMulligan';
import { useCursor } from '../hooks/useCursor'; // [新增] 引入全局指针控制器
import { useUserSystem } from '../hooks/useUserSystem'; // [核心新增] 引入用户系统以读取当前卡组皮肤
import { EFFECT_DB } from '../data/effectRegistry';
import { VFXLayer } from './VFXLayer'; // [新增]
// [新增] 法术弹道特效
import SpellProjectile from './SpellProjectile';
import { SpellImpactLayer } from './SpellImpactLayer'; // [核心新增] 引入独立的受击特效兵工厂
// [新增] 法术弹道事件
// [新增] 悬停预览统一方案
import { useCardGaze } from '../hooks/useCardGaze';
import { FloatingCardPreview } from './FloatingCardPreview';
import { AnimatePresence, motion } from 'framer-motion'; // [新增] 确保引入了 framer-motion 用于施法UI动画
import type { EnemyHeroConfig } from '../types/gameModeTypes'; // [新增] 引入类型
import { AttackToken } from './AttackToken';
import { DragGhostCard } from './DragGhostCard'; // [新增] 备战席替身拖拽


// [修正] 专用的 Mana 计数动画 Hook (Drain -> Fill 模式)
const useManaTicker = (target: number, round: number) => {
    const [display, setDisplay] = useState(target);
    const [prevRound, setPrevRound] = useState(round);
    // 使用 Ref 标记动画状态，防止普通数值更新打断回合动画
    const isAnimating = React.useRef(false);
    // [2026-07-15] targetRef 让异步充能循环始终读取最新的 target（幻莲音蛇的额外法力在动画途中才加入）
    const targetRef = React.useRef(target);
    targetRef.current = target;

    useEffect(() => {
        // 场景 1: 回合更替 (触发 消耗->充能 序列动画)
        if (round > prevRound) {
            setPrevRound(round);
            isAnimating.current = true;

            // 定义异步动画序列
            const playSequence = async () => {
                // A. 消耗阶段 (Drain): 从当前值一个个减到 0
                // 利用闭包中的 display 作为起始值 (即上一回合剩余的法力)
                let current = display;
                while (current > 0) {
                    await new Promise(r => setTimeout(r, 150)); // 消耗速度：0.15s/个
                    current--;
                    setDisplay(current);
                }

                // B. 停顿阶段: 展示空槽状态
                await new Promise(r => setTimeout(r, 200));

                // C. 充能阶段 (Fill): 从 0 一个个加到 targetRef.current（实时读取，支持动画途中法力增加）
                while (current < targetRef.current) {
                    await new Promise(r => setTimeout(r, 200)); // 充能速度：0.2s/个
                    current++;
                    setDisplay(current);
                }

                isAnimating.current = false;
                // [2026-07-15] 动画结束后，若 target 仍有变化（如幻莲音蛇额外法力），同步显示
                setDisplay(targetRef.current);
            };

            playSequence();
        }
        // 场景 2: 同一回合内的数值变化 (如打牌扣费)
        else {
            // 只有当不在播放回合动画时，才允许即时更新
            if (!isAnimating.current) {
                setDisplay(target);
            }
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [round, target]); // 注意：不依赖 display，防止循环触发

    return display;
};

interface GameSessionProps {
    deck: string[];
    onExit: () => void;
    playBgm: (type: 'title' | 'default' | 'battle' | 'victory' | 'defeat') => void;
    playLevelUpMovie: (heroKey: string, onEnd?: () => void) => void;
    prepareLevelUpMovie?: (heroKey: string) => void; // [新增]
    playVictoryMovie: (heroKeys: string[], onEnd?: () => void) => void;
    prepareVictoryMovie?: (heroKeys: string[]) => void; // [新增]
    stopMovie: (immediate?: boolean) => void;
    deskIndex: number;
    cardBackIndex?: number;
    deskDynamic?: boolean; // [2026-08-13] 动态牌桌（开启且有对应视频时用 video 替代静态图）
    heroDynamic?: boolean; // [2026-08-16] 动态卡面（开启时对局内手牌/场上英雄卡用视频替代静态立绘）
    enemyDeck: string[];
    enemyHeroConfig?: EnemyHeroConfig;
    onVictory?: (playerNexus?: number) => void; // [2026-08-11] 带剩余水晶（肉鸽全局 HP 衔接）
    onDefeat?: (playerNexus?: number) => void; // [2026-08-11] 带剩余水晶（败北时不写回）
    initialPlayerNexus?: number; // [2026-08-11] 战斗内玩家水晶初值（肉鸽=run.hp，缺省 20）
    playerNexusMax?: number; // [2026-08-11] 玩家水晶回血上限（肉鸽=run.maxHp，缺省 20）
    rogueEnhancements?: string[]; // [2026-08-11] 玩家迷宫强化 id（战斗内 battleEffect 被动生效）
    rogueEquipments?: Record<string, string[]>; // [2026-08-12 天启者养成] 卡 key → 装备 id 列表（开局挂载，等级解锁）
    disableMulligan?: boolean; // [新增] 教程模式跳过换牌
    disableAI?: boolean; // [2026-08-06 莉莉子] 关闭 AI 出牌（教程用）
    aiPersonality?: 'aggressive' | 'control' | 'balanced'; // [2026-08-06] AI 流派性格
    aiDifficulty?: 'easy' | 'normal' | 'hard'; // [2026-08-06] AI 难度档位（标准对战用）
    tutorialInit?: import('../hooks/useGameState').TutorialInitState; // ★ 教程初始战场
    firstAttacker?: 'player' | 'enemy'; // ★ 第一回合先手方
    missionSystem?: any;
    turnTimer?: number; // [新增] 倒计时秒数，教程模式用 999
}

export const GameSession: React.FC<GameSessionProps> = ({
    deck, onExit, playBgm,
    playLevelUpMovie, prepareLevelUpMovie, playVictoryMovie, prepareVictoryMovie, stopMovie, // [修改] 提取预热方法
    deskIndex, cardBackIndex = 0,
    deskDynamic = false, // [2026-08-13] 动态牌桌
    heroDynamic = false, // [2026-08-16] 动态卡面
    enemyDeck,
    enemyHeroConfig: _enemyHeroConfig,
    onVictory,
    missionSystem,
    onDefeat,
    initialPlayerNexus, // [2026-08-11] 玩家水晶初值注入（肉鸽）
    playerNexusMax, // [2026-08-11] 玩家水晶回血上限注入（肉鸽）
    rogueEnhancements, // [2026-08-11] 玩家迷宫强化注入（肉鸽，战斗内 battleEffect）
    rogueEquipments, // [2026-08-12 天启者养成] 玩家开局装备注入（肉鸽，卡 key → 装备列表）
    disableMulligan = false, // [新增] 教程模式跳过换牌
    tutorialInit, // ★ 教程初始战场
    firstAttacker = 'player', // ★ 第一回合先手方
    disableAI = false, // ★ 禁用AI自动行动
    aiPersonality, // [2026-08-06] AI 流派性格
    aiDifficulty, // [2026-08-06] AI 难度档位
    turnTimer = 99, // [新增] 倒计时秒数，默认 99，教程模式 999
}) => {

    const {
        game, setGame,
        playerHand, setPlayerHand, enemyHand, setEnemyHand,
        playerBench, setPlayerBench,
        enemyBench, setEnemyBench,
        combatField, setCombatField,
        actions,
        setMessage, winningHeroKeys,
        // 👇 新增：从useGameState解构初始卡组信息
        playerDeck,
        enemyDeckState, // ✅ 正确获取敌方牌库
        playerInitialDeckInfo,
        enemyInitialDeckInfo,
        onHandAnimComplete
    } = useGameState(deck, enemyDeck, false, disableMulligan, tutorialInit, firstAttacker, initialPlayerNexus, playerNexusMax, rogueEnhancements, rogueEquipments);

    // ==========================================
    // [教程] 暂停/恢复升级系统（必须放在升级仲裁前面，避免 TDZ）
    // ==========================================
    const [tutorialUpgradeTrigger, setTutorialUpgradeTrigger] = useState(0);
    const tutorialPauseUpgradeRef = useRef(false);
    useEffect(() => {
        const pause = () => { tutorialPauseUpgradeRef.current = true; };
        const resume = () => {
            tutorialPauseUpgradeRef.current = false;
            setTutorialUpgradeTrigger(n => n + 1); // 触发重检
        };
        eventBus.on(GameEvents.TUTORIAL_PAUSE_UPGRADE, pause);
        eventBus.on(GameEvents.TUTORIAL_RESUME_UPGRADE, resume);
        return () => {
            eventBus.off(GameEvents.TUTORIAL_PAUSE_UPGRADE, pause);
            eventBus.off(GameEvents.TUTORIAL_RESUME_UPGRADE, resume);
        };
    }, []);

    // ==========================================
    // [新增] 统一升级系统：仲裁导演 (Animation Director)
    // 死盯 pendingLevelUps 队列。只要有人排队且大屏幕空闲，立刻接管屏幕！
    // [教程] 如果 tutorialPauseUpgradeRef 为 true，跳过触发
    // ==========================================
    useEffect(() => {
        if (tutorialPauseUpgradeRef.current) return;
        if (!game.levelUpCard && game.pendingLevelUps && game.pendingLevelUps.length > 0) {
            const nextHero = game.pendingLevelUps[0];
            setGame(prev => ({
                ...prev,
                phase: 'animating', // 霸道锁死底层舞台，禁止任何操作
                levelUpCard: nextHero // 触发全屏视频
            }));
        }
    }, [game.pendingLevelUps, game.levelUpCard, setGame, tutorialUpgradeTrigger]);

    // [新增] 使用 Mulligan Hook 接管换牌逻辑
    const mulligan = useMulligan({
        initialHand: playerHand,
        onReplace: async (indices) => {
            await actions.replaceOpeningHand(indices);
        },
        onComplete: () => {
            actions.requeueHandToDeck();

            // [2026-07-07 换牌锁定] 用独立状态锁按钮，不碰 game.phase
            // 防误触 drawCards(4) 执行前窗口内点"结束回合"
            // ⚠️ 不能用 phase: 'animating'，否则 useGameAnnouncer 的播报打断
            // 会 clearTimeout(sequenceTimeoutRef) 导致 drawCards 永远不触发！
            setMulliganDrawLock(true);
            // [2026-07-08] 同时锁住后续开幕过渡期，直到进攻标识动画播完
            setPostMulliganLock(true);
            // [2026-07-19] 移除强制赋予进攻标识——标识已由 startRound() + firstAttacker 正确管理
        },
        skip: disableMulligan // ★ 教程模式：完全跳过换牌环节
    });

    // ==========================================
    // [核心修复] 活体数据提取器：替换死板的初始英雄快照
    // ==========================================
    const playerLiveHeroes = useMemo(() => {
        if (!playerInitialDeckInfo?.heroes) return [];
        return playerInitialDeckInfo.heroes.map(initialHero => {
            // 按优先级寻找该英雄最新鲜的「活体」状态！
            return (
                playerBench.find(c => c.key === initialHero.key) ||
                playerHand.find(c => c.key === initialHero.key) ||
                (combatField.find(f => f.owner === 'player' && f.attacker?.key === initialHero.key)?.attacker) ||
                (combatField.find(f => f.owner === 'enemy' && f.blocker?.key === initialHero.key)?.blocker) ||
                playerDeck.find(c => c.key === initialHero.key) ||
                initialHero // 兜底：如果全都找不到（比如死了），用死前的最后遗照
            );
        });
    }, [playerInitialDeckInfo, playerBench, playerHand, combatField, playerDeck]);

    const enemyLiveHeroes = useMemo(() => {
        if (!enemyInitialDeckInfo?.heroes) return [];
        return enemyInitialDeckInfo.heroes.map(initialHero => {
            return (
                enemyBench.find(c => c.key === initialHero.key) ||
                enemyHand.find(c => c.key === initialHero.key) ||
                (combatField.find(f => f.owner === 'enemy' && f.attacker?.key === initialHero.key)?.attacker) ||
                (combatField.find(f => f.owner === 'player' && f.blocker?.key === initialHero.key)?.blocker) ||
                enemyDeckState.find(c => c.key === initialHero.key) ||
                initialHero
            );
        });
    }, [enemyInitialDeckInfo, enemyBench, enemyHand, combatField, enemyDeckState]);

    // ==========================================
    // [核心新增] 天启者阶跃反馈仪 (Level-up Progress Watchdog)
    // ==========================================
    const prevHeroIconsRef = useRef<Record<string, string>>({});
    // [修复 BUG 1] 增加 isEnemy 标识，以便在渲染时区分是从上方弹出还是下方弹出
    const [levelUpToast, setLevelUpToast] = useState<{ hero: CardData, oldIcon: string, newIcon: string, isEnemy: boolean } | null>(null);

    useEffect(() => {
        let triggered = false;

        // [修复 BUG 1] 合并敌我双方的存活天启者，实现全域监听！
        const allHeroes = [
            ...playerLiveHeroes.map(h => ({ hero: h, isEnemy: false })),
            ...enemyLiveHeroes.map(h => ({ hero: h, isEnemy: true }))
        ];

        allHeroes.forEach(({ hero, isEnemy }) => {
            if (!hero.isChampion) return;

            let currentProgress = 0;
            const target = hero.levelUpTarget || 1;

            if (hero.key === 'fenny') {
                const pHealth = game.playerNexus ?? 20;
                const eHealth = game.enemyNexus ?? 20;
                if (pHealth <= 10 || eHealth <= 10) currentProgress = 1;
            } else if (hero.key === 'lyfe') {
                currentProgress = hero.strikeCount || 0;
            } else if (hero.key === 'pupu_specular_soul') {
                currentProgress = hero.customProgress || 0;
            } else if (hero.key === 'mauxir_lotus_drive') {
                currentProgress = hero.customProgress || 0;
            }

            const cappedProgress = Math.min(currentProgress, target);

            const getIconType = () => {
                if (hero.level === 2) return LEVELUP_ICONS.full;
                if (cappedProgress === 0) return LEVELUP_ICONS.empty;
                if (cappedProgress === target - 1) return LEVELUP_ICONS.almost;
                return LEVELUP_ICONS.half;
            };

            const newIcon = getIconType();
            // [细致修复] 为防止敌我同名英雄（镜像对局）状态串线，加上 isEnemy 作为记忆后缀
            const memoryKey = `${hero.key}_${isEnemy}`;
            const oldIcon = prevHeroIconsRef.current[memoryKey];

            if (oldIcon && oldIcon !== newIcon && newIcon !== LEVELUP_ICONS.empty && !triggered) {
                setLevelUpToast({ hero, oldIcon, newIcon, isEnemy });
                triggered = true;
            }

            prevHeroIconsRef.current[memoryKey] = newIcon;
        });

        // [修复 BUG 4] 删除了这里的 setTimeout，移交给下方独立的守护者处理！
    }, [playerLiveHeroes, enemyLiveHeroes, game.playerNexus, game.enemyNexus]); // 追加 enemyLiveHeroes 依赖

    // [修复 BUG 4] 独立的销毁守护者：只受 levelUpToast 变化影响，绝不被误杀！
    useEffect(() => {
        if (!levelUpToast) return;
        const timer = setTimeout(() => {
            setLevelUpToast(null);
        }, 2200);
        return () => clearTimeout(timer);
    }, [levelUpToast]);

    // [新增] 悬停卡牌状态与法力预览计算
    const [hoveredCard, setHoveredCard] = useState<CardData | null>(null);

    // 新增的代码内容
    const currentCardBackUrl = getCardBackUrl(cardBackIndex);


    const isMulliganPhase = mulligan.isActive;

    // [新增] 移动到这里：控制开局动画显示时机
    const [showMulliganUI, setShowMulliganUI] = useState(false);
    // [2026-07-07 换牌锁定] 换牌卡片完全展示前锁定"确定"按钮
    const [mulliganCardsReady, setMulliganCardsReady] = useState(false);
    // [2026-07-07 换牌锁定] 换牌结束后→抽卡完成前，锁定右侧按钮
    // 注意：不能用 game.phase='animating'，否则会触发 useGameAnnouncer 的播报打断机制
    // 清除 sequenceTimeoutRef，导致 drawCards(4) 永远不会被调用！
    const [mulliganDrawLock, setMulliganDrawLock] = useState(false);
    // [2026-07-08 新增] 换牌→抽卡→进攻标识动画 过渡期锁
    // 覆盖 drawCards 释放 mulliganDrawLock 后到 showPhaseHint 之间的窗口
    const [isPostMulliganLock, setPostMulliganLock] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShowMulliganUI(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    // [修改] 挂载信息播报 Hook (传入 isMulliganPhase)
    const announcement = useGameAnnouncer({
        game,
        drawCards: async (count) => {
            const skipAnim = (userSystem.settings as any)?.skipGameStartDrawAnimation;
            if (skipAnim) {
                console.log(`[DrawCards] ⚡ 快速模式：跳过抽卡动画`);
                actions.instantDrawCards(count, 'player');
                actions.instantDrawCards(count, 'enemy');
                actions.triggerGameStartGenerate();
                actions.triggerFirstRoundRogueEnhance(); // [2026-08-15] 换牌结束后第一回合触发 round_start 强化（暗箭等），参考安卡库效修复
                setMulliganDrawLock(false);
                setPostMulliganLock(false);
                console.log(`[DrawCards] ⚡ 快速模式完成`);
            } else {
                console.log(`[DrawCards] 开始抽卡 count=${count} isPostMulliganLock=${isPostMulliganLock} mulliganDrawLock=${mulliganDrawLock}`);
                setGame(prev => prev.phase === 'main' ? { ...prev, phase: 'animating' } : prev);
                console.log(`[DrawCards] 开始抽玩家 ${count} 张`);
                await actions.drawCards(count, 'player');
                console.log(`[DrawCards] 玩家抽卡完成，开始抽敌方 ${count} 张`);
                await actions.drawCards(count, 'enemy');
                console.log(`[DrawCards] 敌方抽卡完成，回到 main 阶段`);
                setGame(prev => ({ ...prev, phase: 'main' }));
                actions.triggerGameStartGenerate();
                actions.triggerFirstRoundRogueEnhance(); // [2026-08-15] 换牌结束后第一回合触发 round_start 强化（暗箭等），参考安卡库效修复
                setMulliganDrawLock(false);
                setPostMulliganLock(false);
                console.log(`[DrawCards] ✅ 全部完成 — 按钮锁已释放`);
            }
        },
        isMulliganPhase, // 关键参数
        disableMulligan, // ★ 教程模式：跳过初始抽卡
    });
    const spellSystem = useSpellSystem({
        onComplete: (card, targets) => {
            // 当目标选择完成后，调用游戏状态的 finalizeSpell
            actions.finalizeSpell(card, 'player', targets);
        }
    });
    // ==========================================
    // [核心新增] 手牌索敌预瞄侦察兵 (Hand Target Watchdog)
    // 实时查阅当前生效法术的效果基因库，判断其是否有针对手牌（HAND_CARD）的战术契约
    // ==========================================
    const isCastingForHand = useMemo(() => {
        // [2026-06-27] 同时检查 spellSystem 和 game.spellCasting，消除一帧延迟
        const isActive = spellSystem.isCasting || !!game.spellCasting;
        if (!isActive) return false;

        // [2026-07-09 瓦莱莉] select_discard 步骤直接激活手牌选择
        // [2026-07-14 通用] select_hand_target 同
        if (game.spellCasting?.step === 'select_discard' || game.spellCasting?.step === 'select_hand_target') return true;

        // 抓取当前正在施放的法术实体
        const cCard = game.activeCard || playerHand.find(c => c.id === game.spellCasting?.cardId);
        if (!cCard || !cCard.effects) return false;
        const effectDef = EFFECT_DB[cCard.effects[0]];
        return effectDef?.targetRequirements?.some(req => req.type === 'HAND_CARD') || false;
    }, [spellSystem.isCasting, game.spellCasting, game.activeCard, playerHand]);

    // [2026-08-08 莉莉子] HAND_CARD 施法瞄准的目标过滤条件（战术闪击等：类型 + 费用上限），用于手牌高亮
    const handTargetFilter = useMemo(() => {
        if (!isCastingForHand) return null;
        const req = spellSystem.currentRequirement;
        if (!req || req.type !== 'HAND_CARD') return null;
        const castingCardDef = spellSystem.activeCard?.effects?.[0]
            ? EFFECT_DB[spellSystem.activeCard.effects[0]]
            : null;
        return {
            cardTypeFilter: req.cardTypeFilter,
            maxCost: castingCardDef?.params?.maxCost,
        };
    }, [isCastingForHand, spellSystem.currentRequirement, spellSystem.activeCard]);

    const finalAnnouncement = announcement;

    // [核心新增] 提取玩家当前激活卡组的皮肤配置字典！
    const userSystem = useUserSystem();
    const skinOverrides = userSystem.activeDeck?.skinOverrides || {};

    // [新增] 状态同步枢纽：监听底层大脑的施法请求，自动唤醒前台 UI 的瞄准射线！
    // ============================================================
    // ★ 选择模式接入点 ① — 每个 select_* step 需要在此添加分支，
    //    调用 spellSystem.startCasting(card, true) 激活视觉层。
    //    已实现: select_discard | select_hand_target | select_bench
    //    未来: select_enemy_bench | select_enemy_hand
    // ============================================================
    useEffect(() => {
        // 0. [2026-07-09 瓦莱莉] 弃牌选择模式：激活 spellSystem 让视觉层工作
        if (game.spellCasting?.step === 'select_discard' && !spellSystem.isCasting) {
            const targetCard = game.activeCard;
            if (targetCard) {
                spellSystem.startCasting(targetCard, true); // skipAutoComplete
            }
            return;
        }

        // [2026-07-14 通用] 手牌选择模式：激活 spellSystem 让视觉层工作
        if (game.spellCasting?.step === 'select_hand_target' && !spellSystem.isCasting) {
            const targetCard = game.activeCard;
            if (targetCard) {
                spellSystem.startCasting(targetCard, true); // skipAutoComplete
            }
            return;
        }

        // [2026-07-20 替换打出] 激活瞄准线视觉层
        if (game.spellCasting?.step === 'select_bench' && !spellSystem.isCasting) {
            const targetCard = game.activeCard;
            if (targetCard) {
                spellSystem.startCasting(targetCard, true);
            }
            return;
        }

        // [占位] 未来 select_enemy_bench：选择敌方备战席
        // [占位] 未来 select_enemy_hand：选择敌方手牌

        // 1. 如果底层要求选目标，且前台还没开始瞄准
        if (game.spellCasting && game.spellCasting.step !== 'choose_mode' && !spellSystem.isCasting) {
            // [SBA] 如果 spellCasting 已预填目标 → 敌方自动施法，不启动玩家瞄准 UI
            if (game.spellCasting.targets && game.spellCasting.targets.length > 0) return;
            // 这张法术可能在 activeCard 里 (英雄法术变身而来)，也可能在手牌里
            const targetCard = game.activeCard || playerHand.find(c => c.id === game.spellCasting!.cardId);
            if (targetCard) {
                spellSystem.startCasting(targetCard);
            }
        }
        // 2. 如果底层清除了施法状态，前台也要同步关闭 (如发生异常撤销)
        else if (!game.spellCasting && spellSystem.isCasting) {
            // [LILITH-DEBUG] 施法状态同步诊断
            console.log(`[LILITH-DEBUG][SYNC] 检测到 spellCasting 已清空 → cancelCasting() 被调用 (isCasting=${spellSystem.isCasting})`);
            spellSystem.cancelCasting();
        } else {
            // [LILITH-DEBUG] 施法状态同步诊断
            if (game.spellCasting || spellSystem.isCasting) {
                console.log(`[LILITH-DEBUG][SYNC] 施法状态: spellCasting=${game.spellCasting?.step ?? 'null'} activeCard=${game.activeCard ? game.activeCard.key : 'null'} isCasting=${spellSystem.isCasting} (未走到 cancelCasting 分支)`);
            }
        }
    }, [game.spellCasting, spellSystem.isCasting, game.activeCard, playerHand]);

    let previewManaCost = 0;
    let previewSpellManaCost = 0;
    let isHoveringPlayableUnit = false; // [新增] 预判手牌单位是否可部署

    if (hoveredCard && game.phase === 'main' && game.turnOwner === 'player') {
        const cost = hoveredCard.cost;
        const currentMana = game.playerMana;
        const currentSpellMana = game.playerSpellMana;
        const isUnit = hoveredCard.type.includes('unit');

        const { newMana, newSpellMana } = calculateNewMana(cost, currentMana, currentSpellMana, isUnit);

        previewManaCost = currentMana - newMana;
        previewSpellManaCost = currentSpellMana - newSpellMana;

        // [新增] 如果是单位牌、法力值足够、且备战席未满（满员时走替换打出，不显示部署位）
        if (isUnit && canAffordCard(hoveredCard, game.playerMana, game.playerSpellMana) && playerBench.length < 6) {
            isHoveringPlayableUnit = true;
        }
    }

    // [保留] 使用动画 Hook 获取显示的数值 (如果您想保留数字显示作为辅助)
    const displayPlayerMana = useManaTicker(game.playerMana, game.round);
    const displayEnemyMana = useManaTicker(game.enemyMana, game.round);
    const displayPlayerSpellMana = useManaTicker(game.playerSpellMana, game.round);
    const displayEnemySpellMana = useManaTicker(game.enemySpellMana, game.round);

    useAI({
        game,
        enemyHand,
        enemyBench,
        playerBench,
        combatField,
        setMessage,
        actions: { ...actions, setGame, setEnemyHand, setEnemyBench, setCombatField, setPlayerBench },
        disabled: disableAI,
        difficulty: aiDifficulty ?? 'normal', // [2026-08-06] 标准对战难度（默认普通）
        personality: aiPersonality ?? 'balanced', // [2026-08-06] 流派性格
    });

    // ★ 教程模式：监听剧本自动行为事件
    useEffect(() => {
        const handleTutorialAction = (payload) => {
            if (payload.action === 'spell_show') {
                tutorialSpellShowRef.current?.(payload.params);
                return;
            }
            if (payload.action === 'enemy_attack') {
                const attackers = enemyBench.filter(c =>
                    !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' &&
                    (c.power || 0) > 0 && !c.keywords.includes('CantAttack')
                );
                if (attackers.length > 0 && actions.commitAttack) {
                    const remainingBench = enemyBench.filter(b => !attackers.some(a => a.id === b.id));
                    setEnemyBench(remainingBench);
                    setCombatField(prev => [
                        ...prev,
                        ...attackers.map(c => ({ attacker: c, blocker: null, owner: 'enemy' as const }))
                    ]);
                    setTimeout(() => actions.commitAttack(), 100);
                }
            }
        };
        eventBus.on('TUTORIAL_AUTO_ACTION', handleTutorialAction);
        return () => { eventBus.off('TUTORIAL_AUTO_ACTION', handleTutorialAction); };
    }, [enemyBench, actions, setEnemyBench, setCombatField]);

    // ─── 教程法术演出 ──────────────────────────────────────────
    // Ref：缓存最新 bench 状态供异步法术秀使用
    const playerBenchRef = useRef(playerBench);
    useEffect(() => { playerBenchRef.current = playerBench; }, [playerBench]);
    const enemyBenchRef = useRef(enemyBench);
    useEffect(() => { enemyBenchRef.current = enemyBench; }, [enemyBench]);

    // Ref：法术秀执行器（通过 ref 让 auto_action handler 调用）
    const tutorialSpellShowRef = useRef<((params: any) => Promise<void>) | null>(null);

    useEffect(() => {
        tutorialSpellShowRef.current = async (params) => {
            const { phases } = params; // [{cardKey, owner, targetKey, count}]
            const stackItems: SpellStackItem[] = [];

            // 通过卡牌 key 在当前战场上查找目标实体
            const findEntityByKey = (key: string): { id: string; bench: 'player' | 'enemy' } | null => {
                const pb = playerBenchRef.current.find(c => c.key === key);
                if (pb) return { id: pb.id, bench: 'player' };
                const eb = enemyBenchRef.current.find(c => c.key === key);
                if (eb) return { id: eb.id, bench: 'enemy' };
                return null;
            };

            // 构建所有堆叠项
            for (const phase of phases) {
                const target = findEntityByKey(phase.targetKey);
                if (!target) {
                    console.warn(`[TutorialSpellShow] 找不到目标: ${phase.targetKey}`);
                    continue;
                }
                for (let i = 0; i < phase.count; i++) {
                    const base = createCard(phase.cardKey);
                    const card: CardData = {
                        ...base,
                        id: `tutorial_spell_${phase.cardKey}_${stackItems.length}`,
                        strikeCount: 0,
                        animState: 'idle' as const,
                        damageTaken: 0,
                        buffs: {},
                    } as CardData;
                    stackItems.push({
                        card,
                        owner: phase.owner,
                        targets: [{ id: target.id, type: phase.owner === 'player' ? 'enemy' : 'ally' }]
                    });
                }
            }
            if (stackItems.length === 0) {
                eventBus.emit('TUTORIAL_SPELL_SHOW_COMPLETE', null);
                return;
            }

            // Phase 1: 保存原始 phase，全部入栈（画面中央显示所有暗箭 + 瞄准线）
            // 保存当前 game phase（从闭包游戏状态读取）
            setGame(prev => ({ ...prev, spellStack: stackItems, phase: 'animating' }));
            setMessage('⚔️ 暗箭连发！');
            await new Promise(r => setTimeout(r, 2000));

            // Phase 2: 逐发开火
            for (const item of stackItems) {
                setMessage(`⚡ ${item.owner === 'player' ? '我方' : '敌方'}·暗箭`);

                // [2026-07-07 修复] 弹道飞行前清除当前法术的瞄准线
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.map(s =>
                        s.card.id === item.card.id ? { ...s, targets: [] } : s
                    )
                }));

                // 发射弹道
                eventBus.emit(StrikeEvents.COMMAND, {
                    sourceId: item.card.id,
                    spellKey: item.card.key,
                    bullets: (item.targets || []).map(t => ({ targetId: t.id, damage: 0, barrierPopped: false })),
                    interval: 0,
                });
                await waitForStrikeComplete();

                // 造成 1 点伤害
                const targetId = item.targets[0]?.id;
                if (targetId) {
                    setPlayerBench(prev =>
                        prev.map(c => c.id === targetId
                            ? { ...c, damageTaken: (c.damageTaken || 0) + 1, animState: 'hit' as const }
                            : c
                        )
                    );
                    setEnemyBench(prev =>
                        prev.map(c => c.id === targetId
                            ? { ...c, damageTaken: (c.damageTaken || 0) + 1, animState: 'hit' as const }
                            : c
                        )
                    );
                }

                // 从堆叠移除已结算的卡
                setGame(prev => ({
                    ...prev,
                    spellStack: prev.spellStack.filter(s => s.card.id !== item.card.id)
                }));

                await new Promise(r => setTimeout(r, 400));
            }

            // 结算完成，恢复 phase 到 main
            setGame(prev => ({ ...prev, phase: 'main', spellStack: [] }));
            setMessage('');

            // 通知教程控制器
            eventBus.emit('TUTORIAL_SPELL_SHOW_COMPLETE', null);
        };
    }, [setGame, setMessage, setPlayerBench, setEnemyBench]);

    // 获取当前选中的卡背图片
    const currentCardBack = PERSONALIZATION_ASSETS.cardBacks[cardBackIndex];
    const { speakingCardId } = useVoice({ playerBench });
    // [核心新增] 施法中心物理锚点，用于跨组件穿透 ScaleWrapper 的缩放结界
    const spellCenterRef = useRef<HTMLDivElement>(null);

    // ★ 筹码式堆叠：记录每个法术卡牌的固定 x 位置（入栈时确定，永不改变）
    const spellStackXPositions = useRef<Map<string, number>>(new Map());

    // ★ 教程交互模式：当前子任务期望的操作类型（'click_target'/'drag_target' 有拦截效果，其他值不拦截）
    const tutorialInteractionMode = useRef<string | null>(null);
    useEffect(() => {
        const handler = (payload: { mode: string | null }) => {
            // 'click_target' / 'drag_target' / null 有实际拦截效果，其他值不拦截
            tutorialInteractionMode.current = payload.mode as any;
        };
        eventBus.on(GameEvents.TUTORIAL_SET_INTERACTION_MODE, handler);
        return () => eventBus.off(GameEvents.TUTORIAL_SET_INTERACTION_MODE, handler);
    }, []);

    // ★ 教程锁死跳过按钮
    const [tutorialLockSkip, setTutorialLockSkip] = useState(false);
    useEffect(() => {
        const lock = () => setTutorialLockSkip(true);
        const unlock = () => setTutorialLockSkip(false);
        eventBus.on(GameEvents.TUTORIAL_LOCK_SKIP, lock);
        eventBus.on(GameEvents.TUTORIAL_UNLOCK_SKIP, unlock);
        return () => {
            eventBus.off(GameEvents.TUTORIAL_LOCK_SKIP, lock);
            eventBus.off(GameEvents.TUTORIAL_UNLOCK_SKIP, unlock);
        };
    }, []);

    // ★ 教程锁死主操作按钮（格挡/确认等）
    const [tutorialLockAction, setTutorialLockAction] = useState(false);
    useEffect(() => {
        const lock = () => setTutorialLockAction(true);
        const unlock = () => setTutorialLockAction(false);
        eventBus.on(GameEvents.TUTORIAL_LOCK_ACTION, lock);
        eventBus.on(GameEvents.TUTORIAL_UNLOCK_ACTION, unlock);
        return () => {
            eventBus.off(GameEvents.TUTORIAL_LOCK_ACTION, lock);
            eventBus.off(GameEvents.TUTORIAL_UNLOCK_ACTION, unlock);
        };
    }, []);

    // ★ 教程强制悬停卡牌预览
    const [tutorialForcedPreview, setTutorialForcedPreview] = useState<{ cardKey: string } | null>(null);
    useEffect(() => {
        const show = (payload: { cardKey: string }) => setTutorialForcedPreview(payload);
        const hide = () => setTutorialForcedPreview(null);
        eventBus.on(GameEvents.TUTORIAL_FORCE_CARD_PREVIEW, show);
        eventBus.on(GameEvents.TUTORIAL_CLEAR_CARD_PREVIEW, hide);
        return () => {
            eventBus.off(GameEvents.TUTORIAL_FORCE_CARD_PREVIEW, show);
            eventBus.off(GameEvents.TUTORIAL_CLEAR_CARD_PREVIEW, hide);
        };
    }, []);

    // 从各状态数组中通过 cardKey 查找卡牌数据
    const findCardByKey = useCallback((key: string): CardData | undefined => {
        const combatCards = combatField.flatMap(f => [f.attacker, f.blocker].filter(Boolean));
        const allCards = [
            ...(playerHand || []),
            ...(playerBench || []),
            ...(enemyHand || []),
            ...(enemyBench || []),
            ...combatCards,
        ];
        return allCards.find(c => c.key === key);
    }, [playerHand, playerBench, enemyHand, enemyBench, combatField]);

    // [卡牌导航] 从 combatField 提取我方/敌方战场卡牌列表
    const playerField = useMemo(() =>
        combatField.flatMap(f => {
            const cards: CardData[] = [];
            if (f.attacker?.owner === 'player') cards.push(f.attacker);
            if (f.blocker?.owner === 'player') cards.push(f.blocker);
            return cards;
        }),
    [combatField]);
    const enemyField = useMemo(() =>
        combatField.flatMap(f => {
            const cards: CardData[] = [];
            if (f.attacker?.owner === 'enemy') cards.push(f.attacker);
            if (f.blocker?.owner === 'enemy') cards.push(f.blocker);
            return cards;
        }),
    [combatField]);

    // ═══════════════════════════════════════════════
    // 备战席替身拖拽系统（单卡版）
    // ═══════════════════════════════════════════════

    /** 🔧 程调这个！拖拽时 GhostCard 的缩放比 */
    const GHOST_CARD_SCALE = 1.5;
    /** 🔧 程调这个！向上拖动多少像素算"拖入战场"（Y 轴阈值） */
    const BENCH_DRAG_THRESHOLD = 120;
    /** 🔧 程调这个！战场拖拽时 GhostCard 的缩放比 */
    const COMBAT_GHOST_SCALE = 1;

    const [ghostState, setGhostState] = useState<{
        cards: CardData[];
        x: number;
        y: number;
        scale?: number;
        w?: number;
        h?: number;
        location?: 'hand' | 'bench' | 'combat';
    } | null>(null);
    const dragCardIdRef = useRef<string | null>(null);          // 主拖拽卡（第一张抓起的那张）
    const dragGroupRef = useRef<string[]>([]);                  // [多卡] 拖拽组内所有卡 ID
    const hiddenCardElsRef = useRef<Map<string, HTMLElement>>(new Map()); // [多卡] 被隐藏的原卡 DOM 映射
    const hiddenCardElRef = useRef<HTMLElement | null>(null);   // [兼容] 主拖拽卡的原卡 DOM
    const dragActivatedRef = useRef(false);
    const dragJustFinishedRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    const combatDragSlotRef = useRef<number | null>(null);
    const combatDragRoleRef = useRef<'attacker' | 'blocker' | null>(null);

    const { setCursor } = useCursor(); // [新增] 挂载全局指针遥控器

    // [新增] 统一悬停预览（备战席 & 战场 800ms 长凝视）
    const { gazeTarget, bindGazeEvents } = useCardGaze({
        delay: 800,
        isDragging: ghostState !== null,
        isCasting: spellSystem.isCasting,
    });

    // [新增] 拖拽预瞄准系统 (Drag Preview System) 状态
    const [dragPreviewSlots, setDragPreviewSlots] = useState<number[]>([]); // 记录被高亮的格挡槽位
    const [previewAttackerCount, setPreviewAttackerCount] = useState<number>(0); // 记录即将冲锋的进攻者数量
    const [isDraggingToBench, setIsDraggingToBench] = useState<boolean>(false); // 记录是否正在撤回备战席

    // 稳定的 ref 副本，供异步事件处理器读取最新状态
    const gameRef = useRef(game);
    gameRef.current = game;
    const benchRef = useRef(playerBench);
    benchRef.current = playerBench;
    const combatFieldRef = useRef(combatField);
    combatFieldRef.current = combatField;

    // [侦察] 观察玩家攻击宣言 → 计算侦察状态（active=全侦察有效 / invalid=混入无效 / null=无）
    // 纯观察：只读 combatField + attackToken，不改战斗逻辑；广播给卡面/卡槽特效层
    useEffect(() => {
        const isFirstAttack = game.attackToken.player === 'normal';
        const playerAttackers = combatField.filter(f => f.owner === 'player' && f.attacker);
        const scoutCount = playerAttackers.filter(f => f.attacker?.keywords?.includes('Scout')).length;
        let state: 'active' | 'invalid' | null = null;
        if (isFirstAttack && playerAttackers.length > 0 && scoutCount > 0) {
            state = scoutCount === playerAttackers.length ? 'active' : 'invalid';
        }
        notifyScoutState(state);
    }, [combatField, game.attackToken.player]);
    const msgRef = useRef(setMessage);
    msgRef.current = setMessage;

    // [2026-08-06 莉莉子 敌我修复] 格挡高亮前置条件：场上存在"可格的敌方进攻者"
    // （owner==='enemy' 且尚未分配格挡者）。避免己方飞剑/己方进攻在场时备战席被误点亮，
    // 导致玩家把单位派去格挡自己的飞剑。
    const hasBlockableEnemyAttacker = combatField.some(f =>
        f.owner === 'enemy' && f.blocker === null && f.attacker
    );

    // ==========================================
    // [新增] 全局鼠标状态调度器 (The Cursor Director)
    // ==========================================
    useEffect(() => {
        // 如果正在拖拽，指针状态交由物理拖拽引擎(onMove)直接超频控制，这里不予干涉
        if (ghostState !== null) return;

        // 判定：当前是否是对方的行动回合 (AI思考中)
        const isAITurn = game.turnOwner === 'enemy' && game.phase === 'main';
        // 判定：游戏处于播放全屏动画、结算界面、或AI正在思考时，视为系统繁忙
        const isSystemBusy = game.phase === 'animating' || game.gameResult !== null || isAITurn;

        if (isSystemBusy) {
            setCursor('BUSY');       // 亮起等待轮盘
        } else if (spellSystem.isCasting) {
            setCursor('TARGET');     // 亮起瞄准准星
        } else {
            setCursor(null);         // 恢复空状态，交由 index.css 里的悬停规则(HOVER)接管
        }

        // 组件卸载时安全清理
        return () => setCursor(null);
    }, [game.phase, game.turnOwner, game.gameResult, spellSystem.isCasting, ghostState, setCursor]);

    /** 备战席 pointerDown 入口（事件委托） */
    const onBenchPointerDown = (e: React.PointerEvent) => {
        const target = (e.target as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
        if (!target) return;
        const cardId = target.getAttribute('data-entity-id');
        const card = playerBench.find(c => c.id === cardId);
        if (!card) return;

        // ★ 教程：如果期望点击操作，屏蔽拖拽
        if (tutorialInteractionMode.current === 'click_target') {
            setMessage('请使用点击来完成格挡');
            return;
        }

        // 阶段检查：只允许在主阶段(有进攻标识)/进攻宣告/格挡宣告时拖拽
        const phase = game.phase;
        const isPlayerTurn = game.turnOwner === 'player';
        const hasAttackToken = game.attackToken.player !== null;
        if (phase === 'block_declare' && isPlayerTurn && card.keywords.includes('CantBlock')) {
            setMessage('该单位无法进行格挡！');
            return;
        }
        const canDrag =
            ((phase === 'main' && hasAttackToken && game.spellStack.length === 0) || phase === 'attack_declare') && isPlayerTurn ||
            (phase === 'block_declare' && isPlayerTurn && hasBlockableEnemyAttacker);
        if (!canDrag) return;

        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        dragCardIdRef.current = cardId;
        dragGroupRef.current = [cardId]; // [多卡] 初始化拖拽组
        hiddenCardElsRef.current.clear(); // [多卡] 清空隐藏映射
        dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };

        // 立即显示 GhostCard（多卡队列）
        setGhostState({ cards: [card], x: rect.left, y: rect.top, w: rect.width, h: rect.height, location: 'bench' });

        // ── 全局 pointer 监听 ──
        const onMove = (ev: PointerEvent) => {
            if (!dragCardIdRef.current) return;
            const dx = ev.clientX - dragStartRef.current.x;
            const dy = ev.clientY - dragStartRef.current.y;

            // 移动超过阈值 → 标记为"正在拖拽"，隐藏原卡
            if (!dragActivatedRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                dragActivatedRef.current = true;
                const el = document.querySelector(
                    `[data-entity-id="${dragCardIdRef.current}"]`,
                ) as HTMLElement | null;
                if (el) {
                    hiddenCardElRef.current = el;
                    hiddenCardElsRef.current.set(dragCardIdRef.current, el); // [多卡] 同步记录
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0';
                }
            }

            // ═══════════════════════════════════════════════
            // [多卡] 扫过检测：指针位置下方是否有其他备战席卡牌？
            // ═══════════════════════════════════════════════
            if (dragActivatedRef.current) {
                // [新增] 拖拽预瞄雷达：实时计算发光槽位
                const dragUpDistance = dragStartRef.current.y - ev.clientY;
                const isDraggedToBattlefield = dragUpDistance > BENCH_DRAG_THRESHOLD;
                const p = gameRef.current.phase;
                const turn = gameRef.current.turnOwner;

                if (isDraggedToBattlefield && turn === 'player') {
                    // [新增] 动态指针：如果向上越过边界，主阶段/进攻阶段化为剑刃(ATTACK)，格挡阶段化为准星(TARGET)
                    setCursor(p === 'main' || p === 'attack_declare' ? 'ATTACK' : 'TARGET');

                    const numCards = dragGroupRef.current.length;
                    if (p === 'main' || p === 'attack_declare') {
                        setPreviewAttackerCount(numCards); // 预示生成几个进攻槽
                        setDragPreviewSlots([]);
                    } else if (p === 'block_declare') {
                        setPreviewAttackerCount(0);
                        let dropStartIndex = 0;
                        const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                        for (const el of elements) {
                            const dropZone = (el as HTMLElement).closest('[data-combat-index]');
                            if (dropZone) {
                                dropStartIndex = parseInt(dropZone.getAttribute('data-combat-index') || '0', 10);
                                break;
                            }
                        }
                        const previews: number[] = [];
                        const usedSlots = new Set<number>();
                        dragGroupRef.current.forEach(id => {
                            const c = benchRef.current.find(card => card.id === id);
                            if (!c) return;
                            let foundIdx = -1;
                            const totalSlots = combatFieldRef.current.length;
                            for (let offset = 0; offset < totalSlots; offset++) {
                                const checkIdx = (dropStartIndex + offset) % totalSlots;
                                const f = combatFieldRef.current[checkIdx];
                                if (f.blocker !== null || usedSlots.has(checkIdx)) continue;
                                if (f.attacker.keywords.includes('Elusive') && !c.keywords.includes('Elusive')) continue;
                                const cPower = (c.power || 0) + (c.buffs?.power || 0) + (c.roundBuffs?.power || 0);
                                if (f.attacker.keywords.includes('Fearsome') && cPower < 3) continue;
                                foundIdx = checkIdx;
                                break;
                            }
                            if (foundIdx !== -1) {
                                usedSlots.add(foundIdx);
                                previews.push(foundIdx);
                                dropStartIndex = (foundIdx + 1) % totalSlots;
                            }
                        });
                        setDragPreviewSlots(previews); // 预示格挡目标发蓝光
                    }
                } else {
                    // [新增] 动态指针：如果还在备战席徘徊，显示紧握的手套(HAND_GRAB)
                    setCursor('HAND_GRAB');

                    setDragPreviewSlots([]);
                    setPreviewAttackerCount(0);
                }

                const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                for (const el of elements) {
                    const cardEl = (el as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
                    if (!cardEl) continue;
                    const entityId = cardEl.getAttribute('data-entity-id');
                    if (!entityId) continue;

                    // 跳过主拖拽卡和已在组里的卡
                    if (entityId === dragCardIdRef.current) continue;
                    if (dragGroupRef.current.includes(entityId)) continue;

                    // 确认是己方备战席卡牌
                    const card = benchRef.current.find(c => c.id === entityId);
                    if (!card) continue;

                    // 阶段有效性检查（与 onBenchPointerDown 入口一致）
                    const p = gameRef.current.phase;
                    const isPlayerTurn = gameRef.current.turnOwner === 'player';
                    const hasAttackToken = gameRef.current.attackToken.player !== null;
                    const canAdd =
                        ((p === 'main' && hasAttackToken) || p === 'attack_declare') && isPlayerTurn ||
                        (p === 'block_declare' && isPlayerTurn && !card.keywords.includes('CantBlock'));

                    if (!canAdd) continue;

                    // ← 扫到了！加入拖拽组
                    dragGroupRef.current.push(entityId);
                    cardEl.style.pointerEvents = 'none';
                    cardEl.style.opacity = '0';
                    hiddenCardElsRef.current.set(entityId, cardEl);

                    // 更新 Ghost 多卡列表
                    setGhostState(prev => {
                        if (!prev) return null;
                        const newCards = [...prev.cards, card];
                        return { ...prev, cards: newCards };
                    });

                    break; // 单次事件只加一张，pointermove 频率够快
                }
            }

            // 持续更新 Ghost 位置
            setGhostState(prev =>
                prev
                    ? {
                          ...prev,
                          x: ev.clientX - dragStartRef.current.ox,
                          y: ev.clientY - dragStartRef.current.oy,
                      }
                    : null,
            );
        };

        const onUp = (ev: PointerEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);

            const wasDragging = dragActivatedRef.current;
            dragJustFinishedRef.current = wasDragging;

            if (wasDragging) {
                const p = gameRef.current.phase;
                const turn = gameRef.current.turnOwner;
                const dragUpDistance = dragStartRef.current.y - ev.clientY;
                const isDraggedToBattlefield = dragUpDistance > BENCH_DRAG_THRESHOLD;

                if (isDraggedToBattlefield && turn === 'player') {
                    // [多卡] 收集拖拽组内所有有效卡牌
                    const groupCards = dragGroupRef.current
                        .map(id => benchRef.current.find(c => c.id === id))
                        .filter((c): c is CardData => c !== undefined);

                    if (groupCards.length > 0) {
                        if (p === 'main') {
                            // main 阶段：先发起进攻宣言，再逐个上场
                            eventBus.emit(GameEvents.UI_CLICK);
                            actions.initiateAttack();
                            requestAnimationFrame(() => {
                                // [错频优化] 每张卡间隔 60ms 依次发起冲锋，避免音效炸耳
                                groupCards.forEach((c, index) => {
                                    setTimeout(() => {
                                        actions.toggleAttacker(c, true);
                                    }, index * 60);
                                });
                            });
                        } else if (p === 'attack_declare') {
                            // attack_declare 阶段：直接全部上场
                            eventBus.emit(GameEvents.UI_CLICK);
                            groupCards.forEach((c, index) => {
                                setTimeout(() => {
                                    actions.toggleAttacker(c, true);
                                }, index * 60);
                            });
                        } else if (p === 'block_declare') {
                            eventBus.emit(GameEvents.UI_CLICK);

                            // [修复 Bug E] 智能指针锚定：读取玩家鼠标松开时，指针悬停的敌方槽位作为起始点
                            let dropStartIndex = 0;
                            const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                            for (const el of elements) {
                                const dropZone = (el as HTMLElement).closest('[data-combat-index]');
                                if (dropZone) {
                                    dropStartIndex = parseInt(dropZone.getAttribute('data-combat-index') || '0', 10);
                                    break;
                                }
                            }

                            // [继承 Bug C 修复] 记录已被占用的槽位
                            const usedSlots = new Set<number>();

                            groupCards.forEach((c, index) => {
                                let foundIdx = -1;
                                const totalSlots = combatFieldRef.current.length;

                                // 环形查找算法：从鼠标指引的槽位开始向右找，到头了就从 0 折返继续找
                                for (let offset = 0; offset < totalSlots; offset++) {
                                    const checkIdx = (dropStartIndex + offset) % totalSlots;
                                    const f = combatFieldRef.current[checkIdx];

                                    if (f.blocker !== null || usedSlots.has(checkIdx)) continue;
                                    if (f.attacker.keywords.includes('Elusive') && !c.keywords.includes('Elusive')) continue;

                                    const cPower = (c.power || 0) + (c.buffs?.power || 0) + (c.roundBuffs?.power || 0);
                                    if (f.attacker.keywords.includes('Fearsome') && cPower < 3) continue;

                                    foundIdx = checkIdx;
                                    break; // 找到了最近的合法空位
                                }

                                if (foundIdx !== -1) {
                                    usedSlots.add(foundIdx);
                                    // [错频优化] 计算依然是瞬间同步完成的，但是执行上阵动作带上了级联延迟！
                                    setTimeout(() => {
                                        actions.assignBlocker(foundIdx, c.id);
                                    }, index * 60);
                                    // [核心推进] 下一张拖拽队列中的卡，默认顺延到刚刚填入槽位的下一个位置
                                    dropStartIndex = (foundIdx + 1) % totalSlots;
                                }
                            });
                        }
                    }
                }
                // 如果没拖够距离（放回备战席）→ 啥也不做，全部归位
            }

            // [多卡] 恢复所有被隐藏的卡牌
            dragCardIdRef.current = null;
            dragGroupRef.current = [];
            dragActivatedRef.current = false;
            setGhostState(null);

            // [新增] 松手时清空预瞄状态并剥离指针强制覆盖
            setDragPreviewSlots([]);
            setPreviewAttackerCount(0);
            setCursor(null);

            hiddenCardElsRef.current.forEach((el) => {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            });
            hiddenCardElsRef.current.clear();

            const el = hiddenCardElRef.current;
            hiddenCardElRef.current = null;
            if (el) {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            }

            setTimeout(() => { dragJustFinishedRef.current = false; }, 0);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    };

    /** 战场卡牌 pointerDown — 战场→备战席反向拖拽 */
    const onCombatPointerDown = (e: React.PointerEvent, card: CardData, index: number, role: 'attacker' | 'blocker') => {
        // 只允许在有效阶段拖拽我方单位
        const phase = game.phase;
        const isPlayerTurn = game.turnOwner === 'player';
        const canDrag =
            (phase === 'attack_declare' && role === 'attacker' && isPlayerTurn) ||
            (phase === 'block_declare' && role === 'blocker' && isPlayerTurn);
        if (!canDrag) return;

        // ★ 教程：如果期望点击操作，屏蔽反向拖拽
        if (tutorialInteractionMode.current === 'click_target') {
            setMessage('请使用点击来完成格挡');
            return;
        }

        const target = (e.target as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        combatDragSlotRef.current = index;
        combatDragRoleRef.current = role;
        dragCardIdRef.current = card.id;
        dragGroupRef.current = [card.id]; // [多卡] 初始化拖拽组（战场版）
        hiddenCardElsRef.current.clear();
        dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };

        // 显示 GhostCard（多卡队列）
        setGhostState({ cards: [card], x: rect.left, y: rect.top, w: rect.width, h: rect.height, scale: COMBAT_GHOST_SCALE, location: 'combat' });

        const onMove = (ev: PointerEvent) => {
            if (!dragCardIdRef.current) return;
            const dx = ev.clientX - dragStartRef.current.x;
            const dy = ev.clientY - dragStartRef.current.y;

            if (!dragActivatedRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                dragActivatedRef.current = true;
                const el = document.querySelector(
                    `[data-entity-id="${dragCardIdRef.current}"]`,
                ) as HTMLElement | null;
                if (el) {
                    hiddenCardElRef.current = el;
                    hiddenCardElsRef.current.set(dragCardIdRef.current!, el);
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0';
                }
            }

            // [多卡] 战场拖拽扫过检测
            if (dragActivatedRef.current) {
                // [新增] 动态指针：一旦在战场上开始拖拽，指针立刻变成紧握的手套(HAND_GRAB)
                setCursor('HAND_GRAB');

                // [新增] 撤回预瞄雷达：向下越过阈值时，点亮备战席
                const dragDownDistance = ev.clientY - dragStartRef.current.y;
                setIsDraggingToBench(dragDownDistance > BENCH_DRAG_THRESHOLD);

                const roleType = combatDragRoleRef.current;
                if (roleType) {
                    const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                    for (const el of elements) {
                        const cardEl = (el as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
                        if (!cardEl) continue;
                        const entityId = cardEl.getAttribute('data-entity-id');
                        if (!entityId) continue;
                        if (dragGroupRef.current.includes(entityId)) continue;

                        // [修复 Bug F] 同步修正战区多卡扫过检测的"所有权倒置"问题，等比复刻 onUp 的检索逻辑
                        const combatIdx = combatFieldRef.current.findIndex(
                            f => (roleType === 'attacker' && f.attacker.id === entityId && f.owner === 'player') ||
                                 (roleType === 'blocker' && f.blocker?.id === entityId)
                        );
                        if (combatIdx === -1) continue;

                        // 根据拖拽身份提取对应的卡牌
                        const combatCard = roleType === 'attacker'
                            ? combatFieldRef.current[combatIdx].attacker
                            : combatFieldRef.current[combatIdx].blocker!;

                        if (!combatCard) continue;
                        const phase = gameRef.current.phase;
                        if (roleType === 'attacker' && phase !== 'attack_declare') continue;
                        if (roleType === 'blocker' && phase !== 'block_declare') continue;
                        dragGroupRef.current.push(entityId);
                        cardEl.style.pointerEvents = 'none';
                        cardEl.style.opacity = '0';
                        hiddenCardElsRef.current.set(entityId, cardEl);
                        setGhostState(prev => {
                            if (!prev) return null;
                            const newCards = [...prev.cards, combatCard];
                            return { ...prev, cards: newCards };
                        });
                        break;
                    }
                }
            }

            setGhostState(prev =>
                prev
                    ? { ...prev, x: ev.clientX - dragStartRef.current.ox, y: ev.clientY - dragStartRef.current.oy }
                    : null,
            );
        };

        const onUp = (ev: PointerEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);

            const wasDragging = dragActivatedRef.current;
            dragJustFinishedRef.current = wasDragging;

            if (wasDragging) {
                // 向下拖够距离 → 撤回（多卡版）
                const dragDownDistance = ev.clientY - dragStartRef.current.y;
                if (dragDownDistance > BENCH_DRAG_THRESHOLD) {
                    const roleType = combatDragRoleRef.current;
                    const phase = gameRef.current.phase;
                    // [多卡] 处理拖拽组内所有卡牌
                    const groupCards = dragGroupRef.current
                        .map(id => {
                            // [修复 Bug B] 完美区分攻守双方的身份检索！
                            // 进攻方撤回：必须校验 owner === 'player' 且 id 匹配 attacker
                            // 防守方撤回：战区 owner 是敌方，我们只需校验 blocker 的 id 即可
                            const fi = combatFieldRef.current.findIndex(f =>
                                (roleType === 'attacker' && f.attacker.id === id && f.owner === 'player') ||
                                (roleType === 'blocker' && f.blocker?.id === id)
                            );
                            if (fi === -1) return null;

                            // 精准提取对应的卡牌实体
                            const card = roleType === 'attacker' ? combatFieldRef.current[fi].attacker : combatFieldRef.current[fi].blocker!;
                            return { card, idx: fi };
                        })
                        .filter(Boolean);

                    // [错频优化] 利用 index 将每张卡的撤回时间错开 60 毫秒，瞬间消除刺耳的重叠爆音
                    groupCards.forEach((item, index) => {
                        if (!item) return;
                        setTimeout(() => {
                            if (roleType === 'attacker' && phase === 'attack_declare') {
                                eventBus.emit(GameEvents.RECALL_UNIT);
                                actions.toggleAttacker(item.card, false);
                            } else if (roleType === 'blocker' && phase === 'block_declare') {
                                eventBus.emit(GameEvents.RECALL_UNIT);
                                actions.recallBlocker(item.idx);
                            }
                        }, index * 60);
                    });
                } else {
                    // ============================================
                    // [2026-07-08 新增] 战场内拖拽重排！
                    //   没撤回备战席 → 判定落点槽位 → 重新排列
                    //   进攻阶段：重新排序攻击者位置
                    //   格挡阶段：交换格挡者分配
                    // ============================================
                    const roleType = combatDragRoleRef.current;
                    const sourceSlot = combatDragSlotRef.current;
                    const phase = gameRef.current.phase;

                    if (roleType !== null && sourceSlot !== null) {
                        const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                        let targetSlot: number | null = null;
                        for (const el of elements) {
                            const slotEl = (el as HTMLElement).closest('[data-combat-index]');
                            if (slotEl) {
                                targetSlot = parseInt(slotEl.getAttribute('data-combat-index') || '', 10);
                                break;
                            }
                        }

                        if (targetSlot !== null && targetSlot >= 0 && targetSlot < combatFieldRef.current.length) {
                            const newField = combatFieldRef.current.map(s => ({ ...s }));

                            if (roleType === 'attacker' && phase === 'attack_declare') {
                                // —— 进攻方重排：抽出一组攻击者，插入到目标位置 ——
                                const draggedIds = dragGroupRef.current;
                                // 按原索引排序，从后往前删除不影响索引
                                const draggedIndices = draggedIds
                                    .map(id => newField.findIndex(f => f.attacker.id === id && f.owner === 'player'))
                                    .filter(i => i !== -1)
                                    .sort((a, b) => a - b);

                                if (draggedIndices.length > 0) {
                                    // 跳过：单卡拖到原位
                                    if (draggedIndices.length === 1 && draggedIndices[0] === targetSlot) {
                                        console.log(`[CombatDrag] ⏭️ 进攻方单卡原位，跳过`);
                                    } else {
                                        const entries = draggedIndices.map(i => newField[i]);
                                        for (let i = draggedIndices.length - 1; i >= 0; i--) newField.splice(draggedIndices[i], 1);
                                        let insertAt = targetSlot;
                                        for (const idx of draggedIndices) if (targetSlot > idx) insertAt--;
                                        newField.splice(insertAt, 0, ...entries);
                                        setCombatField(newField);
                                        console.log(`[CombatDrag] 🔄 进攻方重排: ${draggedIndices.length} 张 → 位置 ${insertAt}`);
                                    }
                                }
                            } else if (roleType === 'blocker' && phase === 'block_declare') {
                                // —— 格挡方交换：与目标槽位的格挡者互换 ——
                                if (targetSlot === sourceSlot) {
                                    console.log(`[CombatDrag] ⏭️ 格挡者原位，跳过`);
                                } else {
                                    const firstId = dragGroupRef.current[0];
                                    const srcIdx = newField.findIndex(f => f.blocker?.id === firstId);
                                    if (srcIdx !== -1 && srcIdx !== targetSlot) {
                                        const temp = newField[targetSlot].blocker;
                                        newField[targetSlot].blocker = newField[srcIdx].blocker;
                                        newField[srcIdx].blocker = temp;
                                        setCombatField(newField);
                                        console.log(`[CombatDrag] 🔄 格挡者交换: 槽位 ${srcIdx} ↔ ${targetSlot}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // [多卡] 恢复所有被隐藏的原卡
            dragCardIdRef.current = null;
            dragGroupRef.current = [];
            dragActivatedRef.current = false;
            combatDragSlotRef.current = null;
            combatDragRoleRef.current = null;
            setGhostState(null);

            // [新增] 松手时清空撤回预瞄状态并剥离指针强制覆盖
            setIsDraggingToBench(false);
            setCursor(null);

            hiddenCardElsRef.current.forEach((el) => {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            });
            hiddenCardElsRef.current.clear();

            const el = hiddenCardElRef.current;
            hiddenCardElRef.current = null;
            if (el) {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            }

            setTimeout(() => { dragJustFinishedRef.current = false; }, 0);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    };

    useEffect(() => {
        playBgm('battle');
    }, []);


    useEffect(() => {
        if (game.gameResult === 'victory') {
            playBgm('victory');
        } else if (game.gameResult === 'defeat') {
            playBgm('defeat');
        }
    }, [game.gameResult, playBgm]);

    // [核心新增] 胜利演出预热：计算出候选视频池，喂给底层放映机
    const handlePrepareVictorySequence = useCallback(() => {
        if (prepareVictoryMovie) {
            const survivingHeroes = playerBench.filter(c => c.isChampion);
            const mvp = survivingHeroes.length > 0
                ? survivingHeroes[Math.floor(Math.random() * survivingHeroes.length)]
                : playerBench[0];

            const videoCandidates: string[] = [];
            if (mvp && mvp.isChampion) videoCandidates.push(mvp.key);
            if (winningHeroKeys && winningHeroKeys.length > 0) videoCandidates.push(...winningHeroKeys);
            videoCandidates.push(...deck);

            prepareVictoryMovie(videoCandidates);
        }
    }, [playerBench, winningHeroKeys, deck, prepareVictoryMovie]);

    const handleVictorySequence = useCallback((onEnd: () => void) => {
        // [2026-07-30] 默认跳过胜利影片
        const skipVictory = (userSystem.settings as any)?.skipVictoryMovie;
        if (skipVictory) {
            if (onEnd) onEnd();
            return;
        }

    // [新增] 预加载胜利影片（利用 blackout_in 过渡时间提前 fetch 解码）
        const heroKeys = playerBench.filter(c => c.isChampion).map(c => c.key);
        if (heroKeys.length > 0) {
            // [核心修复] 从 userSystem 提取当前画质设置，喂给预加载器，确保精准命中 4K 缓存！
            const res = (userSystem.settings as any)?.videoResolution || '1k';
            import('../utils/videoPreloader').then(m => m.preloadVictoryMovieByKeys(heroKeys, res));
        }

    // 1. 挑选 MVP (保持原逻辑：用于语音互动)
        const survivingHeroes = playerBench.filter(c => c.isChampion);
        const mvp = survivingHeroes.length > 0
            ? survivingHeroes[Math.floor(Math.random() * survivingHeroes.length)]
            : playerBench[0];

        if (mvp) {
            // 触发 MVP 语音 (小兵也可以说话)
            eventBus.emit(GameEvents.GAME_VICTORY, { hero: mvp });
        }

        // [修复] 2. 视频播放逻辑 (Fix: 解决 MVP 是小兵导致没视频播的问题)
        // 我们构建一个候选列表，只要列表里任何一个 key 有视频，就能播放
        const videoCandidates: string[] = [];

        // 优先级 A: MVP 本人 (如果是英雄)
        if (mvp && mvp.isChampion) {
            videoCandidates.push(mvp.key);
        }

        // 优先级 B: 系统计算的获胜英雄 (原始成功逻辑的核心)
        if (winningHeroKeys && winningHeroKeys.length > 0) {
            videoCandidates.push(...winningHeroKeys);
        }

        // 优先级 C: 整个卡组 (兜底，movieData 会自动筛选有视频的卡)
        // 这样即使场上只有小兵，只要你带了里芙，就能放里芙的视频
        videoCandidates.push(...deck);

        // 3. 播放视频
        playVictoryMovie(videoCandidates, () => {
            // [核心修复：战术四] 影片播完后，不再强制调用 onVictory 或 onExit。
            // 只需要调用 onEnd() 关闭视频播放器，让玩家安安静静地停留在 GameOverScreen 结算界面欣赏战绩。
            // 真正的退出动作，交由玩家主动点击结算界面上的退出按钮来触发。
            if (onEnd) onEnd();
        });

    }, [playerBench, winningHeroKeys, deck, playVictoryMovie, onVictory, onExit, userSystem]);


    // [修改] 主回合倒计时逻辑
    const [timeLeft, setTimeLeft] = useState(turnTimer);
    useEffect(() => {
        // 每次回合/阶段变化重置时间
        setTimeLeft(turnTimer);
    }, [game.turnOwner, game.phase, game.lastActionTimestamp]);

    useEffect(() => {
        // [修正] 如果处于换牌阶段或校准阶段，暂停主倒计时
        if (isMulliganPhase || game.calibratePending || game.phase === 'animating' || game.gameResult || game.spellCasting?.step === 'choose_mode' || game.spellCasting?.step === 'select_bench') return;

        if (timeLeft <= 0) {
            // [修复 1] 在法术响应阶段超时，等同于放弃响应 (passTurn)
            if (game.phase === 'main' || game.phase === 'react_to_block') actions.passTurn();
            else if (game.phase === 'attack_declare') actions.commitAttack();
            // [修复 2] 防守方超时，应视为确认当前格挡方案，进入响应博弈，而非强制物理结算
            else if (game.phase === 'block_declare') actions.confirmBlock();
            return;
        }
        const timer = setTimeout(() => setTimeLeft(p => p - 1), 1000);
        return () => clearTimeout(timer);
    }, [timeLeft, game.phase, game.gameResult, game.spellCasting, isMulliganPhase]); // 添加 isMulliganPhase 依赖

    // [教程模式] AI被禁用时，敌方回合自动让过，防止流程卡死
    // [新增] 格挡阶段会自动从敌方备战席分配格挡者
    useEffect(() => {
        if (!disableAI) return;
        if (game.turnOwner !== 'enemy') return;
        if (game.gameResult || game.phase === 'animating') return;

        const timer = setTimeout(() => {
            // [新增] 格挡阶段：自动分配敌方备战席的可用单位作为格挡者
            if (game.phase === 'block_declare') {
                const isPlayerAttacking = combatField.some(f => f.attacker && f.owner === 'player');
                if (isPlayerAttacking && enemyBench.length > 0) {
                    const newField = combatField.map(f => ({ ...f }));
                    const remainingBlockers = [...enemyBench];

                    newField.forEach((fight) => {
                        if (!fight.attacker || fight.owner !== 'player') return;
                        if (remainingBlockers.length === 0) return;
                        const blocker = remainingBlockers.shift()!;
                        fight.blocker = blocker;
                    });

                    // 先更新 UI 显示格挡分配，再确认防线
                    setEnemyBench(remainingBlockers);
                    setCombatField(newField);

                    setTimeout(() => {
                        actions.confirmBlock();
                    }, 500);
                    return;
                }
            }
            actions.passTurn();
        }, 800);

        return () => clearTimeout(timer);
    }, [disableAI, game.turnOwner, game.phase, game.gameResult, actions, combatField, enemyBench, setEnemyBench, setCombatField]);

    const handleCardClick = (card: CardData, location: string, owner: string): boolean => {
        if (game.phase === 'animating' || game.gameResult) return false;

        // [2026-07-09 瓦莱莉 优先] 弃牌选择模式：先于 spellSystem.isCasting 拦截
        if (location === 'hand' && owner === 'player' && game.spellCasting?.step === 'select_discard') {
            const sc = game.spellCasting;
            const currentIds = sc.targets.map((t: any) => t.id);
            const newTargets = currentIds.includes(card.id)
                ? sc.targets.filter((t: any) => t.id !== card.id)
                : [...sc.targets, { type: 'ally' as const, id: card.id }];
            actions.updateSpellCasting({ ...sc, targets: newTargets });
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);
            return false;
        }

        // [2026-07-14 通用] 手牌选择模式：先于 spellSystem.isCasting 拦截
        if (location === 'hand' && owner === 'player' && game.spellCasting?.step === 'select_hand_target') {
            const sc = game.spellCasting as any;
            const mode = sc.mode || 'single';
            const cardTypeFilter = sc.cardTypeFilter;
            // 卡牌类型过滤
            if (cardTypeFilter === 'unit' && card.type !== 'unit' && !card.type?.includes('unit')) {
                setMessage("只能选择单位卡牌！");
                return false;
            }
            if (cardTypeFilter === 'spell' && !card.type?.includes('spell')) {
                setMessage("只能选择法术卡牌！");
                return false;
            }
            // [2026-07-14 白猎] 费用上限过滤
            const maxCost = sc.maxCost;
            if (maxCost !== undefined && (card.cost || 0) >= maxCost) {
                setMessage(`只能选择费用低于${maxCost}的卡牌！`);
                return false;
            }
            const currentIds = sc.targets.map((t: any) => t.id);
            let newTargets;
            if (mode === 'multi') {
                // 多选（toggle）
                newTargets = currentIds.includes(card.id)
                    ? sc.targets.filter((t: any) => t.id !== card.id)
                    : [...sc.targets, { type: 'ally' as const, id: card.id }];
            } else {
                // 单选（默认）：点击已选中则取消，否则替换
                newTargets = currentIds.includes(card.id)
                    ? []
                    : [{ type: 'ally' as const, id: card.id }];
            }
            actions.updateSpellCasting({ ...sc, targets: newTargets });
            eventBus.emit(GameEvents.SFX_SELECT_UNIT);
            return false;
        }

        if (spellSystem.isCasting) {
            // [2026-08-08 莉莉子修复] HAND_CARD 施法瞄准：类型/费用过滤拦截（战术闪击等只能选指定类型与费用上限的手牌）
            if (spellSystem.currentRequirement?.type === 'HAND_CARD' && location === 'hand') {
                const req = spellSystem.currentRequirement;
                const castingCardDef = spellSystem.activeCard?.effects?.[0]
                    ? EFFECT_DB[spellSystem.activeCard.effects[0]]
                    : null;
                if (req.cardTypeFilter === 'unit' && !card.type?.includes('unit')) {
                    setMessage("只能选择单位卡牌！");
                    return false;
                }
                if (req.cardTypeFilter === 'spell' && !card.type?.includes('spell')) {
                    setMessage("只能选择法术卡牌！");
                    return false;
                }
                const maxCost = castingCardDef?.params?.maxCost;
                if (maxCost !== undefined && (card.cost || 0) >= maxCost) {
                    setMessage(`只能选择费用低于${maxCost}的卡牌！`);
                    return false;
                }
            }
            spellSystem.handleTargetClick(card, owner as 'player' | 'enemy', location as 'hand' | 'field');
            return false;
        }

        if (location === 'hand') {
            if (owner !== 'player') return false;

            if (game.turnOwner !== 'player') return false;

            eventBus.emit(GameEvents.PLAY_CARD);

            if (card.type.includes('unit')) {
                // [2026-07-20 替换打出] 备战席满员时不拦截，交给 playCard 走替换流程
                if (playerBench.length >= 6) { setMessage("选择一个己方单位进行替换"); }
                // [2026-07-16 修复] 战斗阶段不能打出单位卡牌（isPlayable 已正确拦截高光，但点击仍能打出）
                const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare' || game.phase === 'react_to_block';
                if (isCombatPhase) {
                    setMessage("战斗阶段无法派出单位！");
                    return false;
                }
                actions.playCard(card, 'player');
                return true; // [关键] 判定：单位出牌成功！
            } else {
                // [2026-07-27 莉莉子] 战斗阶段不能打出慢速法术（isPlayable 已拦截高光，点击也要拦住）
                const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare' || game.phase === 'react_to_block';
                if (isCombatPhase && card.type === 'spell-slow') {
                    setMessage("战斗阶段无法施放慢速法术！");
                    return false;
                }

                const effectId = card.effects && card.effects.length > 0 ? card.effects[0] : null;
                const effectDef = effectId ? EFFECT_DB[effectId] : null;
                // [核心修复] 不仅要看是否有 targetRequirements，更要看是否真的需要玩家"手动选人" (count > 0)
                const needsTarget = effectDef && effectDef.targetRequirements.some(req => req.count > 0);

                if (needsTarget) {
                    spellSystem.startCasting(card);
                    actions.startSpellCasting(card);
                    return true; // [关键] 判定：法术出牌成功并进入选目标阶段！
                } else {
                    actions.playCard(card, 'player');
                    return true; // [关键] 判定：直接法术出牌成功！
                }
            }
        }

        // --- 以下针对非手牌区的点击操作 ---
        // [新增] 如果刚结束拖拽，忽略这次 click（拖拽路径已经处理过了）
        if (dragJustFinishedRef.current) return false;

        if (game.phase === 'attack_declare') {
            if (location === 'bench') {
                // ★ 教程：如果期望拖拽操作，屏蔽点击选攻击者（防止批量多拖）
                if (tutorialInteractionMode.current === 'drag_target') {
                    setMessage('请使用拖拽来指派进攻单位');
                    return false;
                }
                eventBus.emit(GameEvents.UI_CLICK);
                actions.toggleAttacker(card, true);
            }
            else if (location === 'combat') {
                eventBus.emit(GameEvents.RECALL_UNIT);
                actions.toggleAttacker(card, false);
            }
        }
        else if (game.phase === 'block_declare' && game.turnOwner === 'player' && location === 'bench') {
            // [2026-08-06 莉莉子 敌我修复] 无"可格的敌方进攻者"时不允许选择格挡者
            // （防止己方飞剑/己方进攻在场时，玩家把单位派去格挡自己的飞剑）
            if (!hasBlockableEnemyAttacker) {
                setMessage('当前没有可格挡的敌方进攻者');
                return false;
            }
            // ★ 教程：如果期望拖拽操作，屏蔽点击选格挡者
            if (tutorialInteractionMode.current === 'drag_target') {
                setMessage('请使用拖拽来完成格挡');
                return false;
            }
            eventBus.emit(GameEvents.UI_CLICK);
            actions.selectBlocker(card.id);
        }

        return false; // 兜底返回
    };



    // [新增] 判断是否可以发起进攻
    const canInitiateAttack = game.phase === 'main' && game.attackToken.player !== null && game.turnOwner === 'player' && playerBench.length > 0 && game.spellStack.length === 0;

    // [新增] 撤回进攻宣言 (Cancel Attack)
    const handleCancelAttack = () => {
        // 1. 找出所有已上场的我方单位
        const myAttackers = combatField.filter(f => f.owner === 'player').map(f => f.attacker);

        // 2. 归还到备战席
        if (myAttackers.length > 0) {
            setPlayerBench(prev => [...prev, ...myAttackers]);
        }

        // 3. 清空战场并回退阶段
        setCombatField([]);
        setGame(prev => ({ ...prev, phase: 'main' }));
        eventBus.emit(GameEvents.RECALL_UNIT);
    };

    const btnConfig = useGameButton({
        phase: game.phase,
        turnOwner: game.turnOwner,

        // [修改] 告诉 Hook 是否处于换牌阶段 (由 Mulligan Hook 决定)
        isMulliganPhase: mulligan.isActive,

        // [修改] 将 Mulligan Hook 的状态透传给按钮配置
        mulliganState: {
            selectedCount: mulligan.selectedCount,
            isConfirmed: mulligan.isConfirmed,
            isLocked: !mulliganCardsReady || mulliganDrawLock // [2026-07-07 换牌锁定] 卡片展示完前 或 换牌→抽卡过渡期 均不可确认
        },

        combatState: {
            hasAttackers: combatField.some(f => f.owner === 'player'),
            spellStackLength: game.spellStack.length,
            canInitiateAttack: canInitiateAttack,
            // [2026-08-02 莉莉子] 飞剑攻击者检测：格挡阶段若存在飞剑来袭，按钮应切换为"进攻"
            hasSwordAttacker: combatField.some(f =>
                f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
            )
        },

        // [新增] 透传施法与预提交状态
        // ★ 选择模式接入点 ②③ — 每个 select_* step 需在此配置
        //   isCasting: 排除选择模式（不触发法术覆盖层/瞄准线独立控制）
        //   hasPendingSpell: 包含选择模式（触发右侧确认/取消按钮）
        //   已实现: select_discard | select_hand_target | select_bench
        //   未来: select_enemy_bench | select_enemy_hand
        spellState: {
            isCasting: (spellSystem.isCasting || game.spellCasting !== null) && game.spellCasting?.step !== 'choose_mode' && game.spellCasting?.step !== 'select_discard' && game.spellCasting?.step !== 'select_hand_target' && game.spellCasting?.step !== 'select_bench',
            hasPendingSpell: (game.pendingSpell !== null && game.pendingSpell !== undefined)
                || game.spellCasting?.step === 'select_discard'
                || game.spellCasting?.step === 'select_hand_target'
                || game.spellCasting?.step === 'select_bench'
        },

        // [2026-07-08] 开局过渡期禁用锁 — 覆盖抽卡后到进攻标识动画播完的窗口
        disabled: isPostMulliganLock,

        actions: {
            onPass: actions.passTurn,
            onAttack: actions.commitAttack,
            onBlock: actions.confirmBlock,
            onResolveStack: actions.resolveStack,
            onCancelAttack: handleCancelAttack,
            onMulliganReplace: mulligan.confirmMulligan,
            onMulliganConfirm: mulligan.confirmMulligan,
            // ★ 选择模式接入点 ⑤ — 每个 select_* step 在此路由到对应的 confirmXxx 函数
            //    已实现: select_discard(confirmValerieDiscard) | select_hand_target(confirmHandTargetSelect) | select_bench(confirmReplacePlay)
            //    未来: select_enemy_bench → confirmEnemyBenchSelect | select_enemy_hand → confirmEnemyHandSelect
            onConfirmPendingSpell: () => {
                // [2026-07-09 瓦莱莉] 弃牌模式走自定义确认，不走法术确认
                if (game.spellCasting?.step === 'select_discard') {
                    actions.confirmValerieDiscard();
                // [2026-07-14 通用] 手牌选择模式走统一确认
                } else if (game.spellCasting?.step === 'select_hand_target') {
                    actions.confirmHandTargetSelect();
                // [2026-07-20 替换打出] 替换确认
                } else if (game.spellCasting?.step === 'select_bench') {
                    if (game.spellCasting?.targets?.length > 0) actions.confirmReplacePlay();
                } else {
                    actions.confirmPendingSpell();
                }
            }
        }
    });

    const [viewCard, setViewCard] = useState<CardData | null>(null);
    // [卡牌导航] 游戏内翻页
    const [viewCardList, setViewCardList] = useState<CardData[]>([]);
    const [viewCardIndex, setViewCardIndex] = useState(0);
    const [showRecordPanel, setShowRecordPanel] = useState(false); // [2026-07-20] 对局记录面板

    // [卡牌导航] 智能判断卡牌来源并构建导航列表
    const handleViewCard = useCallback((card: CardData) => {
        // 按优先级检查各列表：手牌 > 我方备战席 > 我方战场 > 敌方备战席 > 敌方战场
        const checks: { list: CardData[]; type: string }[] = [
            { list: playerHand, type: 'hand' },
            { list: playerBench, type: 'friendly_bench' },
            { list: playerField, type: 'friendly_field' },
            { list: enemyBench, type: 'enemy_bench' },
            { list: enemyField, type: 'enemy_field' },
        ];
        for (const { list } of checks) {
            const idx = list.findIndex(c => c.id === card.id);
            if (idx >= 0) {
                setViewCardList(list);
                setViewCardIndex(idx);
                setViewCard(card);
                return;
            }
        }
        // 未找到列表 → 简单展示，不启用导航
        setViewCardList([]);
        setViewCardIndex(0);
        setViewCard(card);
    }, [playerHand, playerBench, playerField, enemyBench, enemyField]);

    // [新增] 控制打出卡牌时的通用放大动画
    const [showPlayAnimation, setShowPlayAnimation] = useState(false);

    // [新增] 监听 activeCard 变化，触发短时间的放大展示
    useEffect(() => {
        if (game.activeCard) {
            setShowPlayAnimation(true);
            // [2026-07-09 瓦莱莉] 弃牌选择模式：卡牌常驻中央，不自动隐藏
            // [2026-07-14 白猎] 手牌选择模式：同样保持展示
            if (game.spellCasting?.step === 'select_discard' || game.spellCasting?.step === 'select_hand_target') {
                return; // 不清除，保持展示
            }
            // 800ms 后结束放大动画，如果是法术则会自动无缝切换到 Ritual UI
            const timer = setTimeout(() => setShowPlayAnimation(false), 800);
            return () => clearTimeout(timer);
        } else {
            setShowPlayAnimation(false);
        }
    }, [game.activeCard, game.spellCasting?.step]);

    // [2026-07-18] AI抉择：自动选择（延迟让玩家看到过程）
    // [2026-07-20 修复] 移除 turnOwner 依赖，防止 AI 被暂停前 timer 被清除导致卡死
    useEffect(() => {
        if (!game.activeCard || game.turnOwner !== 'enemy' || game.spellCasting?.step !== 'choose_mode') return;

        const choices = game.activeCard.choices;
        if (!choices || choices.length === 0) return;

        const autoSelectTimer = setTimeout(() => {
            // 选第一个费用足够的选项
            let pickedKey: string | null = null;
            for (const key of choices) {
                const data = CARD_DB[key] as CardData;
                if (data) {
                    // [2026-07-30 飞剑减费] AI侧同样应用飞剑折扣
                    const FLYING_SWORD_DISCOUNT_KEYS = ['acacia_chrono_echo_ultimate', 'acacia_sword_timeline'];
                    let checkData = data;
                    if (FLYING_SWORD_DISCOUNT_KEYS.includes(key)) {
                        const fsTotal = game.enemyFlyingSwordsTotal || 0;
                        if (fsTotal > 0) {
                            checkData = { ...data, cost: Math.max(0, (data.cost || 0) - fsTotal) };
                        }
                    }
                    const { canPlay } = evaluateChoiceCondition(
                        checkData, game.enemyMana, game.enemySpellMana,
                        game.spellCasting?.isHeroLeveled,
                        game.phase
                    );
                    if (canPlay) {
                        pickedKey = key;
                        break;
                    }
                }
            }
            if (pickedKey) {
                actions.resolveChoice(pickedKey);
            } else {
                // [修复] 无费用足够的选项时撤回抉择，退回法力
                actions.cancelChoice();
            }
        }, 2000);

        return () => clearTimeout(autoSelectTimer);
    }, [game.activeCard?.id, game.spellCasting?.step]);

    // [2026-08-11 肉鸽全局 HP 衔接] 统一结算退出：把剩余水晶传给上层回调
    const settleExit = () => {
        if (game.gameResult === 'victory') {
            if (onVictory) onVictory(game.playerNexus); else onExit();
        } else {
            if (onDefeat) onDefeat(game.playerNexus); else onExit();
        }
    };

    return (
        <HeroCardMediaContext.Provider value={heroDynamic}>
        <div className="w-full h-full bg-black text-white overflow-hidden relative font-sans select-none">

            {/* 1. 背景层（[2026-08-13] 动态牌桌：DeskMedia 统一处理，无视频自动兜底静态图） */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <DeskMedia deskIndex={deskIndex} dynamic={deskDynamic} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20"></div>
            </div>

            {/* ================= [新增] Step 3: 特效指引层 ================= */}
            {/* 放置在背景之上，Z轴层级需低于 UI 但高于棋盘背景 */}
            {/* ★ 选择模式接入点 ④ — 每个 select_* step 在此控制瞄准线鼠标跟随 */}
            {/*    select_discard: 始终跟随 | select_bench: 选中前跟随，选中后隐藏 */}
            <VFXLayer
                isCasting={spellSystem.isCasting}
                showMousePreview={spellSystem.isCasting && (game.spellCasting?.step === 'select_discard' || (game.spellCasting?.step === 'select_bench' && (!game.spellCasting?.targets?.length)) || !spellSystem.isSelectionComplete) && !(game.spellCasting?.step === 'select_hand_target' && (game.spellCasting as any).mode === 'single' && (game.spellCasting?.targets?.length || 0) > 0)}
                selectedTargets={[...spellSystem.selectedTargets, ...(game.spellCasting?.targets || [])]}
                castingSpellRef={spellSystem.activeCard ? spellCenterRef : undefined}
                // [2026-08-15 莉莉子] 抵抗/抗拒（反制堆叠法术）启用回力镖瞄准：先下坠再水平指向目标（敌方目标）
                boomerang={(spellSystem.activeCard?.key === 'temp_spell_06' || spellSystem.activeCard?.key === 'temp_spell_07') ? 'down' : undefined}
                // [核心修复] 将所有堆叠区的法术及其目标传入特效层，用于绘制持久化连线
                persistentLines={[
                    // [修正] 直接提取卡牌底层的原生 id 作为起点定位符，不搞花里胡哨的自定义前缀
                    ...(game.pendingSpell ? [{ sourceId: game.pendingSpell.card.id, targets: game.pendingSpell.targets, owner: game.pendingSpell.owner }] : []),
                    ...game.spellStack.map(s => ({ sourceId: s.card.id, targets: s.targets, owner: s.owner }))
                ]}
            />
            {/* ========================================================== */}

            {/* [新增] Step 3.5: 法术弹道特效层 */}
            <SpellProjectile />

            {/* [新增] Step 3.8: 独立受击特效层 (事件直驱，无缝隔山打牛) */}
            <SpellImpactLayer />
            {/* ========================================================== */}


            {/* 2. 退出按钮 */}
            <div className="absolute top-4 left-4 z-[100]">
                 <button onClick={() => {
                     eventBus.emit(GameEvents.UI_BACK);
                     // [2026-08-11 肉鸽 HP 衔接] 已判定胜负 → 走正常结算（带回滚守卫）；未判定 → 中途退出
                     if (game.gameResult === 'victory' || game.gameResult === 'defeat') {
                         settleExit();
                     } else {
                         onExit();
                     }
                 }} className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 text-gray-400 hover:text-white transition-colors">
                    <Home size={20} />
                </button>
            </div>

            {/* [新增] 信息播报层 */}
            <GameAnnouncement data={announcement} />

            {/* 换牌 UI */}
            {mulligan.isActive && showMulliganUI && (
                <OpeningMulligan
                    hand={playerHand}
                    cardBackUrl={currentCardBackUrl}
                    skinOverrides={skinOverrides} // [新增] 喂给换牌界面

                    // [修改] 状态透传 (受控组件)
                    selectedIndices={mulligan.selectedIndices}
                    isConfirmed={mulligan.isConfirmed}
                    onToggleIndex={mulligan.toggleIndex}
                    onViewArt={handleViewCard} // <--- [绝杀补全] 把查看大图的函数传进去！

                    // [修改] 动画回调
                    onAnimationStep={(step) => {
                        if (step === 'ready_to_replace') {
                            // 1. 动画盖牌了，请求后端换数据
                            mulligan.handleDataReplace();
                        } else if (step === 'finished') {
                            // 2. 动画全播完了(包括新牌翻开、退出)，通知 Hook 关闭状态
                            mulligan.finishMulligan();
                        }
                    }}
                    // [2026-07-07 换牌锁定] 卡片展示完毕，解锁"确定"按钮
                    onCardsDisplayed={() => setMulliganCardsReady(true)}
                />
            )}

            {/* [2026-07-17 鸦眼小队] 校准面板 */}
            {game.calibratePending && (
                <CalibratePanel
                    cards={game.calibratePending.drawnCards}
                    onConfirm={(selectedId) => actions.confirmCalibrate(selectedId)}
                    onViewArt={handleViewCard}
                    isHidden={game.calibratePending.owner === 'enemy'}
                    cardBackUrl={currentCardBackUrl}
                />
            )}

            {/* 3. 弹窗层 */}
            {game.gameResult && (
                <GameOverScreen
                    result={game.gameResult}
                    stats={game.stats}
                    // [修改] 区分胜利和失败的退出逻辑；[2026-08-11] 走统一 settleExit 带剩余水晶
                    onExit={settleExit}
                    onPlayMovie={handleVictorySequence}
                    onPrepareMovie={handlePrepareVictorySequence} // [核心新增] 下发胜利预热！
                    missionSystem={missionSystem}
                />
            )}
            {game.levelUpCard && (
                <LevelUpOverlay
                    card={game.levelUpCard}
                    playerNexusHealth={game.playerNexus}
                    enemyNexusHealth={game.enemyNexus}
                    onClose={() => {
                        actions.closeLevelUp();
                        // [核心修复] 如果升级队列即将清空，且当前不是处于战斗或法术结算中，释放系统锁定！
                        // 这样就能完美解决非战斗状态下（如从手牌打出）触发的全局觉醒导致的死锁。
                        if (game.pendingLevelUps.length <= 1 && combatField.length === 0 && game.spellStack.length === 0) {
                            setGame(prev => ({ ...prev, phase: 'main' }));
                        }
                        // [教程] 通知教程控制器：升级动画已完整播完
                        eventBus.emit(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE);
                    }}
                    onPlayMovie={playLevelUpMovie}
                    onPrepareMovie={prepareLevelUpMovie} // [核心新增] 下发升级预热！
                    onStopMovie={stopMovie}
                    popLevelUp={actions.popLevelUp} // [新增] 传入出队回调函数！
                />
            )}

            {(viewCard || game.fullArtCard) && (
                <FullArtOverlay
                    card={viewCard || game.fullArtCard!}
                    onClose={() => setViewCard(null)}
                    navigation={viewCardList.length > 1 ? {
                        cardList: viewCardList,
                        currentIndex: viewCardIndex,
                        onNavigate: (newIndex) => {
                            setViewCardIndex(newIndex);
                            setViewCard(viewCardList[newIndex]);
                        },
                    } : undefined}
                />
            )}

            {/* [2026-07-20] 对局记录面板 — z-[9999] 最高层级 */}
            <RecordPanel
                records={game.gameRecords || []}
                isOpen={showRecordPanel}
                onClose={() => setShowRecordPanel(false)}
                onViewCard={(card) => handleViewCard(card)}
            />

            <GameAnnouncement data={finalAnnouncement} />


            {/* 4. 命运抉择层 */}
            {game.activeCard && game.spellCasting?.step === 'choose_mode' && (
                    <div
                        className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
                        onClick={() => {
                            if (game.turnOwner === 'enemy') return; // [2026-07-20] AI 的抉择，玩家不可取消
                            eventBus.emit(GameEvents.CANCEL_SPELL);
                            actions.cancelChoice(); // [核心大扫除] 回收站权力交还给底层引擎
                        }}
                    >
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600 mb-12 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] tracking-widest">FATE'S CHOICE</div>

                        <div className="flex gap-16 md:gap-24 items-center">
                            {/* [核心大扫除] 无脑遍历 choices 数组，彻底斩断硬编码判定 */}
                            {game.activeCard.choices?.map((choiceKey, index) => {
                                const choiceData = CARD_DB[choiceKey] as CardData;
                                if (!choiceData) return null;

                                // [2026-07-30 飞剑减费] 为朔望之期 + 剑痕时空按本牌局飞剑数折扣
                                const FLYING_SWORD_DISCOUNT_KEYS = ['acacia_chrono_echo_ultimate', 'acacia_sword_timeline'];
                                let displayChoiceData = choiceData;
                                let isCostDiscounted = false;
                                if (FLYING_SWORD_DISCOUNT_KEYS.includes(choiceKey)) {
                                    const fsTotal = game.turnOwner === 'enemy'
                                        ? (game.enemyFlyingSwordsTotal || 0)
                                        : (game.playerFlyingSwordsTotal || 0);
                                    if (fsTotal > 0) {
                                        const oldCost = choiceData.cost || 0;
                                        displayChoiceData = {
                                            ...choiceData,
                                            cost: Math.max(0, oldCost - fsTotal),
                                        };
                                        isCostDiscounted = true;
                                    }
                                }

                                // 呼叫法务和裁判：这个卡能不能放？
                                const { canPlay, lockedMessage } = evaluateChoiceCondition(
                                    displayChoiceData,
                                    game.turnOwner === 'enemy' ? game.enemyMana : game.playerMana,
                                    game.turnOwner === 'enemy' ? game.enemySpellMana : game.playerSpellMana,
                                    game.spellCasting?.isHeroLeveled,
                                    game.phase
                                );

                                // 保留原有的视效区分：数组第0个(小技能)偏蓝，第1个(大招)偏红
                                const textColor = index === 0 ? 'text-cyan-300' : 'text-red-500';
                                const ringColor = index === 0 ? 'group-hover:ring-cyan-400' : 'group-hover:ring-red-500';
                                const shadowColor = index === 0 ? 'shadow-[0_0_50px_rgba(34,211,238,0.4)]' : 'shadow-[0_0_50px_rgba(239,68,68,0.4)]';

                                return (
                                    <React.Fragment key={choiceKey}>
                                        {/* 绘制选项间的分割线 */}
                                        {index > 0 && <div className="w-px h-32 bg-white/20"></div>}

                                        <div className={`group relative transition-all duration-300 ${canPlay ? 'cursor-pointer hover:scale-110 hover:-translate-y-4' : ''}`}
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 if (game.turnOwner === 'enemy') return; // [2026-08-07 莉莉子修复] AI 的抉择，玩家不可点击（与背景取消逻辑一致）
                                                 if (canPlay) actions.resolveChoice(choiceKey); // 直接传递 Key
                                             }}>
                                            <div className={`absolute -top-16 left-1/2 -translate-x-1/2 text-2xl font-bold ${textColor} opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 whitespace-nowrap`}>
                                                {displayChoiceData.name}
                                            </div>
                                            <div className={`rounded-xl transition-all ${canPlay ? `ring-4 ring-transparent ${ringColor} ${shadowColor}` : ''}`}>
                                                <Card
                                                    data={{...displayChoiceData, id: `choice-${choiceKey}`, strikeCount: 0, keywords: []} as any}
                                                    location="preview"
                                                    skinId={skinOverrides[choiceKey] || 0} // [新增] 给抉择卡穿皮肤
                                                    isLocked={!canPlay}
                                                    lockedMessage={lockedMessage}
                                                    isCostReduced={isCostDiscounted}
                                                />
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        <div className="mt-16 text-white/40 text-sm font-mono tracking-widest animate-pulse">点击空白处取消 (CLICK BACKGROUND TO CANCEL)</div>
                    </div>
            )}

            {/* ================= [还原] 通用打出动画 (Big Card) ================= */}
            {/* ★ 选择模式接入点 ⑧ — 选择模式统一排除通用打出动画（已在统一渲染流中展示） */}
            {/* 已排除: choose_mode | select_discard | select_hand_target | select_bench */}
            {/* 未来: select_enemy_bench | select_enemy_hand */}
            {game.activeCard && showPlayAnimation && game.spellCasting?.step !== 'choose_mode' && game.spellCasting?.step !== 'select_discard' && game.spellCasting?.step !== 'select_hand_target' && game.spellCasting?.step !== 'select_bench' && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto animate-play-card">
                        <Card
                            data={game.activeCard}
                            location="preview"
                            skinId={skinOverrides[game.activeCard.key] || 0}
                            onViewArt={() => {}}
                        />
                    </div>
                </div>
            )}

            {/* ================= [史诗级重构] 统一法术物理层 (The Unified Spell Layer) ================= */}
            {/* 聚合 施法中、预提交、堆叠区 的所有法术，通过 layoutId 保持 DOM 唯一性，实现无缝平移缩放砸落！ */}
            <div className="fixed inset-0 z-[30] pointer-events-none flex items-center justify-center">
                {/* 1. 全屏半透明压暗 (仅施法时显现) */}
                <AnimatePresence>
                    {spellSystem.isCasting && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-radial-gradient(circle, transparent 60%, rgba(0,0,0,0.6) 100%) z-0"
                        />
                    )}
                </AnimatePresence>

                {/* 2. 施法文字提示 */}
                <AnimatePresence>
                    {spellSystem.isCasting && spellSystem.activeCard && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-[15%] top-1/2 -translate-y-1/2 z-[101]">
                            <h2 className="text-6xl font-black tracking-widest drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-700" style={{ textShadow: '0 2px 0 #000, 0 5px 10px rgba(0,0,0,0.5)', WebkitTextStroke: '1px rgba(255,215,0,0.3)' }}>
                                {game.spellCasting?.step === 'select_discard' ? '选择要弃置的手牌' : game.spellCasting?.step === 'select_hand_target' ? (game.spellCasting as any).label || spellSystem.instruction : game.spellCasting?.step === 'select_bench' ? '选择一个单位替换' : (spellSystem.instruction || "SELECT TARGET")}
                            </h2>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 3. 核心魔法：所有活动法术的统一渲染流 */}
                {(() => {
                    // 将多个独立状态的法术/单位统合为一个处理队列
                    const isDiscardSelectMode = game.spellCasting?.step === 'select_discard';
                    const isHandTargetMode = game.spellCasting?.step === 'select_hand_target';
                    const isBenchSelectMode = game.spellCasting?.step === 'select_bench';
                    const activeSpells: { card: CardData; mode: string; owner: string; index: number; hasNoTargets?: boolean }[] = [];
                    game.spellStack.forEach((s, idx) => activeSpells.push({ card: s.card, mode: 'stack', owner: s.owner, index: idx, hasNoTargets: s.targets.length === 0 }));
                    if (game.pendingSpell) activeSpells.push({ card: game.pendingSpell.card, mode: 'pending', owner: 'player', index: 0 });
                    if (spellSystem.isCasting && spellSystem.activeCard && !isDiscardSelectMode && !isHandTargetMode) activeSpells.push({ card: spellSystem.activeCard, mode: 'casting', owner: 'player', index: 0 });
                    if (isDiscardSelectMode && game.activeCard) activeSpells.push({ card: game.activeCard, mode: 'discard_select', owner: 'player', index: 0 });
                    if (isHandTargetMode && game.activeCard) activeSpells.push({ card: game.activeCard, mode: 'hand_target_select', owner: 'player', index: 0 });
                    if (isBenchSelectMode && game.activeCard) activeSpells.push({ card: game.activeCard, mode: 'bench_select', owner: 'player', index: 0 });

                    return activeSpells.map(({ card, mode, owner, index, hasNoTargets = false }) => {
                        const isCasting = mode === 'casting' || mode === 'discard_select' || mode === 'hand_target_select' || mode === 'bench_select';
                        const isPending = mode === 'pending';
                        const isDiscardSelect = mode === 'discard_select';
                        const isHandTargetSelect = mode === 'hand_target_select';
                        const isBenchSelect = mode === 'bench_select';
                        const isEnemy = owner === 'enemy';
                        // [2026-08-05 莉莉子] 反制高亮：可被当前施法无效化的堆叠法术（法术6/7）
                        const isStackTargetable = mode === 'stack' && spellSystem.isCasting && spellSystem.currentRequirement?.type === 'SPELL_ON_STACK' && spellSystem.checkIsTargetable(card, owner);
                        // 智能皮肤读取
                        const currentImageUrl = skinOverrides[card.key] ? getSkinImage(card.key, skinOverrides[card.key]) || card.imageUrl : card.imageUrl;

                        // 动态计算目标位置与缩放（交给 Framer Motion 自动补间飞行路线）
                        // [2026-07-07] 无目标阶段放大圆盘（AI 施法悬念期）
                        const scale = isCasting || (mode === 'stack' && hasNoTargets) ? 1 : 0.8;
                        const yOffset = isCasting ? 0 : 0; // 预提交靠下，入栈居中

                        // ★ 筹码式堆叠：入栈时确定 x 位置并锁定，结算后剩余卡牌不移动
                        // [2026-08-08 莉莉子] 施法瞄准期把「施法中/待确认」法术也纳入扇形展开，
                        // 防止 NEGATE 类选目标法术盖住栈上目标导致无法点选。
                        // 顺序 = LIFO 生效顺序：施法中/待确认（最新、最先生效）→ 栈上法术（新→旧）
                        const fanGroup = [
                            ...activeSpells.filter(s => s.mode === 'casting' || s.mode === 'pending'),
                            ...activeSpells.filter(s => s.mode === 'stack'),
                        ];
                        const fanTotal = fanGroup.length;
                        const isStackAiming = spellSystem.isCasting || !!game.pendingSpell; // 施法/待确认期间重排让位
                        const getStackXOffset = (cardId: string, mode: string): number => {
                            if (fanTotal <= 1) return 0;
                            // 非施法瞄准期：堆叠法术沿用锁定缓存（结算后不移动）
                            if (mode === 'stack' && !isStackAiming && spellStackXPositions.current.has(cardId)) {
                                return spellStackXPositions.current.get(cardId)!;
                            }
                            const MAX_RADIUS = 320;
                            const step = Math.min(150, MAX_RADIUS * 2 / (fanTotal - 1));
                            const fanIndex = fanGroup.findIndex(s => s.card.id === cardId);
                            const x = -step * (fanTotal - 1) / 2 + fanIndex * step;
                            // 施法瞄准期或首次入栈：刷新锁定（让老法术给施法中的卡让位）
                            if (mode === 'stack') spellStackXPositions.current.set(cardId, x);
                            return x;
                        };
                        const xOffset = mode === 'stack' || mode === 'casting' || mode === 'pending'
                            ? getStackXOffset(card.id, mode)
                            : 0;

                        return (
                            <motion.div
                                key={card.id}
                                initial={isCasting ? { scale: 0, opacity: 0 } : false}
                                animate={{ scale, x: xOffset, y: yOffset, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className={`absolute pointer-events-auto cursor-pointer group ${isCasting ? 'z-[105]' : 'z-[30]'}`}
                                // ★ 选择模式接入点 ⑥ — 中间卡牌点击取消路由到 cancelPendingSpell
                                //    已实现: discard_select | hand_target_select | bench_select
                                //    未来: enemy_bench_select | enemy_hand_select
                                onClick={() => {
                                    if (isDiscardSelect || isHandTargetSelect || isBenchSelect) {
                                        actions.cancelPendingSpell();
                                    } else if (spellSystem.isCasting && spellSystem.currentRequirement?.type === 'SPELL_ON_STACK' && mode === 'stack') {
                                        // [2026-08-05 莉莉子] 反制交互：点击堆叠法术作为无效化目标（法术6/7）
                                        // [LILITH-DEBUG] 反制点击诊断
                                        console.log(`[LILITH-DEBUG][NEGATE-CLICK] 点击栈上法术 ${card.key}(${card.name}) owner=${owner} isCasting=${spellSystem.isCasting} req=${spellSystem.currentRequirement?.type} mode=${mode} xOffset=${xOffset}`);
                                        spellSystem.handleTargetClick(card, owner, 'stack');
                                    } else if (isCasting) {
                                        eventBus.emit(GameEvents.UI_BACK);
                                        const cardToReturn = card.parentCard || card;
                                        setPlayerHand(prev => [...prev, cardToReturn]);
                                        if (card.parentCard) {
                                            const cost = card.cost;
                                            setGame(prev => {
                                                let newMana = prev.playerMana + cost;
                                                let newSpellMana = prev.playerSpellMana;
                                                if (newMana > prev.playerMaxMana) {
                                                    newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                                                    newMana = prev.playerMaxMana;
                                                }
                                                return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana };
                                            });
                                        }
                                        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                                        spellSystem.cancelCasting();
                                    } else if (isPending) {
                                        eventBus.emit(GameEvents.CANCEL_SPELL);
                                        actions.cancelPendingSpell();
                                    }
                                }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleViewCard(card);
                                }}
                            >
                                {/* ★ 选择模式接入点 ⑦ — 选择模式的卡牌渲染分支（卡牌 vs 法术圆盘） */}
                                {/*    已实现: discard_select | hand_target_select | bench_select */}
                                {/*    未来: enemy_bench_select | enemy_hand_select */}
                                {isDiscardSelect || isHandTargetSelect || isBenchSelect ? (
                                    /* [2026-07-09] 单位选手牌模式：保持手牌样式在中央 */
                                    <div ref={spellCenterRef} data-entity-id={card.id} className="relative w-[180px] pointer-events-auto">
                                        <Card
                                            data={card}
                                            location="preview"
                                            skinId={skinOverrides[card.key] || 0}
                                            onViewArt={() => {}}
                                        />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl">
                                            <span className="text-white font-black tracking-widest text-sm bg-black/70 px-4 py-2 rounded">点击取消</span>
                                        </div>
                                    </div>
                                ) : (
                                <div className="relative w-48 h-48 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                                    <img src={UI_IMAGES.spellContainer} alt="容器" className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-300 ${isEnemy ? 'drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]'} ${!isEnemy ? 'group-hover:drop-shadow-[0_0_40px_rgba(239,68,68,0.5)]' : ''}`} />

                                    {/* 物理锚点：使用 data-entity-id 供特效层绝对追踪 */}
                                    <div ref={isCasting ? spellCenterRef : undefined} data-entity-id={card.id} className={`relative w-[110px] h-[110px] rounded-full overflow-hidden z-10 bg-black ${isStackTargetable ? 'ring-4 ring-red-400/80 animate-pulse' : ''}`}>
                                        <img src={currentImageUrl} className="w-full h-full object-cover animate-pulse-slow opacity-90 mix-blend-screen" draggable={false} />
                                        {!isEnemy && (isCasting || isPending) && (
                                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <span className="text-red-300 font-black tracking-widest text-xs">点击以</span>
                                                <span className="text-white font-black tracking-widest text-sm">取消</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 缩小后才展示法术名字，避免抢戏 */}
                                    {!isCasting && (
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 text-white text-[20px] px-4 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg scale-50 origin-top">
                                            {card.name}
                                        </div>
                                    )}
                                </div>
                                )}
                            </motion.div>
                        );
                    });
                })()}
            </div>
            {/* ========================================================================= */}

            {/* [2026-07-20] 对局记录触发按钮 */}
            <button
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[9998] w-9 h-24 bg-slate-800/80 hover:bg-slate-700/90 border border-white/10 border-r-0 rounded-l-xl flex items-center justify-center transition-all shadow-lg hover:shadow-cyan-500/20 group"
                onClick={() => setShowRecordPanel(p => !p)}
                title="对局记录"
            >
                <span className="text-lg group-hover:scale-110 transition-transform">📜</span>
            </button>

            {/* 5. 游戏主界面 */}
            <div className={`w-full h-full relative ${game.screenShake ? 'animate-shake' : ''}`}>

                {/* [2026-08-11] 迷宫强化：战斗内状态栏 + 触发时水晶闪烁 */}
                <RogueModPanel enhancements={game.rogueEnhancements} />
                <RogueBuffFlash />

                {/* --- A. 左侧 UI 层 (绝对定位) --- */}
                {/* [核心修复] 修正信标暗号！必须与逻辑层的 nexus_enemy 完美对齐！ */}
                <div data-entity-id="nexus_enemy" className={`absolute top-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all`}>
                    <SmartNexus
                        health={game.enemyNexus}
                        maxHealth={game.enemyMaxMana} // 借用一下 MaxMana 或者写死 20，这里主要用于展示
                        isEnemy={true}
                        highlight={spellSystem.checkIsTargetable('nexus', 'enemy')}
                        onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'enemy')}
                    />
                </div>
                {/* 2. 敌方牌库 (左上偏右) */}
                {/* [核心修复] 提升外层 z-index 到 z-40 (悬停时 z-[60]) 彻底压制倒计时和水晶，并剥离 transform 转交组件内部 */}
                <div
                    className="absolute z-40 hover:z-[60] origin-center drop-shadow-2xl transition-all"
                    style={{ top: '10%', left: '14%' }}
                >
                    <Deck
                        isEnemy={true}
                        cardBackIndex={cardBackIndex}
                        deckCount={enemyDeckState.length}
                        handCount={enemyHand.length}
                        initialHeroes={enemyLiveHeroes} // [核心替换] 注入活体数据
                        regions={enemyInitialDeckInfo?.regions || []}
                        onViewArt={handleViewCard}
                        deckTransform="scale(1.35) rotate(169deg)" // [新增] 将缩放和旋转作为参数传给内部实体
                    />
                </div>

                {/* [核心修复] 修正信标暗号！必须与逻辑层的 nexus_player 完美对齐！ */}
                <div data-entity-id="nexus_player" className={`absolute bottom-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all`}>
                    <SmartNexus
                        health={game.playerNexus}
                        maxHealth={game.playerMaxMana}
                        isEnemy={false}
                        highlight={spellSystem.checkIsTargetable('nexus', 'player')}
                        onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'player')}
                    />
                </div>

                {/* [核心新增] 天启者阶跃反馈弹窗 (悬挂在牌库上方) */}
                <AnimatePresence>
                    {levelUpToast && (
                        <motion.div
                            className="absolute z-50 flex flex-col items-center pointer-events-none"
                            // [修复 BUG 1] 根据敌我阵营，动态决定挂载在敌方牌库下方，还是我方牌库上方
                            style={{
                                ...(levelUpToast.isEnemy ? { top: '28%', left: '14%' } : { bottom: '28%', left: '14%' }),
                                marginLeft: '10px'
                            }}
                            // [修复 BUG 1] 敌方从上往下弹 (y从负到正)，我方从下往上弹 (y从正到负)
                            initial={{ opacity: 0, y: levelUpToast.isEnemy ? -40 : 40, scale: 0.5 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: levelUpToast.isEnemy ? -20 : 20, scale: 0.8 }}
                            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        >
                            {/* [修复 BUG 2 & 3] 矩形展示，金色光晕脉冲，边框加粗发亮！ */}
                            <div className="relative w-[72px] h-[112px] rounded-lg border-2 border-yellow-400 shadow-[0_0_30px_rgba(255,215,0,0.6)] bg-slate-900 overflow-hidden bg-gradient-to-b from-yellow-500/20 to-transparent">
                                <img
                                    // 完美继承皮肤系统的渲染规则
                                    src={skinOverrides[levelUpToast.hero.key] ? getSkinImage(levelUpToast.hero.key, skinOverrides[levelUpToast.hero.key]) || levelUpToast.hero.imageUrl : levelUpToast.hero.imageUrl}
                                    className="w-full h-full object-cover opacity-90"
                                    alt="英雄头像"
                                />

                                {/* 阶跃特效容器：左上角箭头 */}
                                <div className="absolute -top-1 -left-1 w-8 h-8 rounded-full bg-slate-900 shadow-md border-2 border-yellow-400 overflow-hidden flex items-center justify-center">
                                    {/* 旧状态：延迟 0.3s 后淡出 */}
                                    <motion.img
                                        src={levelUpToast.oldIcon}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        animate={{ opacity: 0 }}
                                        transition={{ duration: 0.4, delay: 0.3 }}
                                    />
                                    {/* 新状态：延迟 0.3s 后，瞬间爆闪至 2.5倍 亮度，放大 1.5 倍，再完美落位！ */}
                                    <motion.img
                                        src={levelUpToast.newIcon}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        initial={{ opacity: 0, scale: 0.5, filter: 'brightness(1)' }}
                                        animate={{
                                            opacity: 1,
                                            scale: [0.8, 1.5, 1],
                                            filter: ['brightness(1)', 'brightness(2.5)', 'brightness(1)']
                                        }}
                                        transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 4. 我方牌库 (左下偏右) */}
                <div
                    className="absolute z-40 hover:z-[60] origin-center drop-shadow-2xl transition-all"
                    style={{ bottom: '10%', left: '14%' }}
                >
                    <Deck
                        isEnemy={false}
                        cardBackIndex={cardBackIndex}
                        deckCount={playerDeck.length}
                        handCount={playerHand.length}
                        initialHeroes={playerLiveHeroes} // [核心替换] 注入活体数据
                        regions={playerInitialDeckInfo?.regions || []}
                        onViewArt={handleViewCard}
                        playerNexusHealth={game.playerNexus}
                        enemyNexusHealth={game.enemyNexus}
                        deckTransform="scale(1.35) rotate(11deg)" // [新增]
                    />
                </div>

                {/* --- B. 中间战场层 (居中限制宽度) --- */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-[65%] flex flex-col z-10">
                    {/* 1. 敌方手牌 */}
                    <EnemyHand hand={enemyHand} cardBackUrl={currentCardBack} onAnimComplete={(id) => onHandAnimComplete(id, 'enemy')} />

                    {/* 3. 核心战场 - 整合备战席为绝对定位，彻底解决高度挤压问题 */}
                    <div className="flex-1 relative">

                        {/* 2. 敌方备战席 - 绝对定位在核心战场顶部，不占用文档流空间 */}
                        <div className="absolute top-0 left-0 w-full h-21 flex justify-center items-center gap-6 transition-all z-10">
                            {enemyBench.map(c => (
                                // [修复 Bug 1] 补上 contents 伪装盒与雷达事件绑定
                                <div key={c.id} className="contents" {...bindGazeEvents(c)}>
                                <Card
                                    data={c}
                                    location="enemy_bench"
                                    skinId={skinOverrides[c.key] || 0} // [新增]
                                    canBeChallenged={game.phase === 'attack_declare' && game.selectedChallengerId !== null}
                                    onClick={() => {

                                        if (spellSystem.isCasting) {
                                            spellSystem.handleTargetClick(c, 'enemy'); // 优先处理施法点击
                                        } else if (game.phase === 'attack_declare' && game.selectedChallengerId) {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            actions.challengeEnemy(game.selectedChallengerId, c.id);
                                        } else if (spellSystem.isCasting) {
                                            // [新增] 施法模式下，点击敌方单位
                                            spellSystem.handleTargetClick(c, 'enemy');
                                        } else {
                                            handleCardClick(c, 'enemy_bench', 'enemy');
                                        }
                                    }}
                                    onViewArt={handleViewCard}
                                    isSpeaking={c.id === speakingCardId}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'enemy')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                />
                                </div>
                            ))}
                        </div>

                        {/* 战场内容容器 - 永远垂直居中，不受备战席有无卡牌影响 */}
                        <div className="h-full flex flex-col justify-center">

                            <Battlefield
                                combatField={combatField}
                                phase={game.phase}
                                skinOverrides={skinOverrides} // [新增] 喂给战场组件！
                                turnOwner={game.turnOwner}
                                selectedBlockerId={game.selectedBlockerId}
                                onCombatClick={(i) => {
                                    // 1. 优先判定：是否处于"格挡宣言"阶段且"已选中备战席单位"
                                    // 如果选中了人，点击槽位 = 分配阻挡
                                    if (game.phase === 'block_declare' && game.selectedBlockerId) {
                                        eventBus.emit(GameEvents.UI_CLICK);
                                        actions.assignBlocker(i, game.selectedBlockerId);
                                    }
                                    // 2. 其次判定：如果没有选中人，但点击了已有的阻挡者 = 撤回
                                    else if (game.phase === 'block_declare' && game.turnOwner === 'player') {
                                        if (combatField[i].blocker) actions.recallBlocker(i);
                                    }
                                }}
                                onCardClick={(c, l, o) => {

                                     // [新增] 战斗中单位的施法目标选择
                                     if (spellSystem.isCasting) {
                                         spellSystem.handleTargetClick(c, o as 'player'|'enemy');
                                         return;
                                     }
                                     if (l === 'combat' && o === 'player') {
                                         if (game.phase === 'attack_declare' && c.keywords.includes('Challenger')) {
                                             if (game.selectedChallengerId === c.id) {
                                                 actions.selectChallenger(c.id);
                                             } else if (game.selectedChallengerId !== c.id) {
                                                 eventBus.emit(GameEvents.UI_CLICK);
                                                 actions.selectChallenger(c.id);
                                                 return;
                                             }
                                         }
                                         eventBus.emit(GameEvents.RECALL_UNIT);
                                         if (game.phase === 'attack_declare') actions.toggleAttacker(c, false);
                                         if (game.phase === 'block_declare') {
                                             // ★ 教程：如果期望拖拽操作，屏蔽点击撤回格挡
                                             if (tutorialInteractionMode.current === 'drag_target') {
                                                 setMessage('请使用拖拽来撤回格挡');
                                                 return;
                                             }
                                             const idx = combatField.findIndex(f => f.blocker?.id === c.id);
                                             if (idx !== -1) actions.recallBlocker(idx);
                                         }
                                     }
                                     else if (l === 'combat' && o === 'enemy') {
                                         const idx = combatField.findIndex(f => f.blocker?.id === c.id);
                                         // [核心修复] 严格守卫：只有在玩家自己宣告进攻的阶段，才能撤销自己用“挑战者”拉上来的敌军！
                                         // 绝对禁止在敌方分配格挡时，或战斗响应期间，跨权限踢回敌军。
                                         if (idx !== -1 && game.phase === 'attack_declare' && combatField[idx].owner === 'player') {
                                             eventBus.emit(GameEvents.RECALL_UNIT);
                                             actions.recallBlocker(idx);
                                         }
                                     }
                                     else {
                                         handleCardClick(c, l, o);
                                     }
                                }}
                                onViewArt={handleViewCard}
                                speakingCardId={speakingCardId}
                                selectedChallengerId={game.selectedChallengerId}
                                onChallengerClick={actions.selectChallenger}
                                cardBackUrl={currentCardBackUrl}
                                onCombatPointerDown={onCombatPointerDown} // [新增] 战场→备战席拖拽
                                // [补漏修复] 将 GameSession 计算好的雷达数据传递给 Battlefield 组件
                                dragPreviewSlots={dragPreviewSlots}
                                previewAttackerCount={previewAttackerCount}
                                // [新增] 战场悬停预览
                                cardGazeEvents={bindGazeEvents}
                            />
                        </div>

                        {/* 4. 我方备战席 - 绝对定位在核心战场底部，不占用文档流空间 */}
                        <div
                            className="absolute bottom-0 left-0 w-full h-11 flex justify-center items-center gap-6 z-10 transition-all"
                            style={{ touchAction: 'none' }}
                            onPointerDown={onBenchPointerDown}
                        >
                            {/* [新增] 判定：是否在主阶段且有攻击标识 */}
                            {(() => {
                                const canAttackPhase = game.phase === 'main' && game.attackToken.player !== null && game.turnOwner === 'player';
                                return playerBench.map(c => (
                                    <div key={c.id} className="contents" {...bindGazeEvents(c)}>
                                    <Card
                                        data={c}
                                        location="bench"
                                        skinId={skinOverrides[c.key] || 0} // [新增] 给我方备战席穿皮肤
                                        titanCount={[...playerBench, ...enemyBench].filter(tc => tc.keywords.includes('Titan')).length}
                                        // [2026-07-20] isSelected 含 spellCasting.targets 支持 select_bench 选中高亮
                                        isSelected={game.selectedBlockerId === c.id || game.spellCasting?.allyId === c.id || game.spellCasting?.targets?.some((t: any) => t.id === c.id)}
                                        // [修改] 主阶段持有攻击标识时，所有单位高亮发蓝光！
                                        highlightTarget={(game.phase === 'attack_declare' && game.turnOwner === 'player') || (game.phase === 'block_declare' && game.turnOwner === 'player' && hasBlockableEnemyAttacker) || canAttackPhase || game.spellCasting?.step === 'select_bench'}
                                        isBlocking={game.phase === 'block_declare'}
                                    onClick={() => {
                                        // [2026-07-20 替换打出] 替换选择模式：选中一个备战席单位
                                        if (game.spellCasting?.step === 'select_bench') {
                                            const sc = game.spellCasting;
                                            const currentIds = sc.targets.map((t: any) => t.id);
                                            const newTargets = currentIds.includes(c.id) ? [] : [{ type: 'ally', id: c.id }];
                                            actions.updateSpellCasting({ ...sc, targets: newTargets });
                                            eventBus.emit(GameEvents.SFX_SELECT_UNIT);
                                            setMessage(newTargets.length > 0 ? `已选择 ${c.name}，点击确认替换` : '选择一个单位替换');
                                            return;
                                        }
                                        if (spellSystem.isCasting) {
                                            spellSystem.handleTargetClick(c, 'player');
                                        } else {
                                            // [新增] 拦截逻辑：无法格挡
                                            // 仅在格挡阶段生效
                                            if (game.phase === 'block_declare' && c.keywords.includes('CantBlock')) {
                                                setMessage("该单位无法进行格挡！");
                                                // 播放错误音效 (可选)
                                                // eventBus.emit(GameEvents.ERROR_SFX);
                                                return;
                                            }

                                            handleCardClick(c, 'bench', 'player');
                                        }
                                    }}
                                    onViewArt={handleViewCard}
                                    isSpeaking={c.id === speakingCardId}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'player')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                    />
                                    </div>
                                ));
                            })()}

                            {/* [新增] 撤回预示：当我们往下拖拽撤回时，备战席亮起等量的全息蓝光底座！ */}
                            {isDraggingToBench && dragGroupRef.current.map((_, idx) => (
                                <div key={`preview-bench-${idx}`} className="w-[120px] h-[162px] border-2 border-cyan-400 bg-cyan-500/30 rounded-md shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse"></div>
                            ))}

                            {/* [新增] 手牌部署预示：悬停/拖拽可打出的单位牌时，备战席末尾出现高亮空位 */}
                            {isHoveringPlayableUnit && !isDraggingToBench && (
                                <div className="w-[120px] h-[162px] border-2 border-cyan-400 border-dashed bg-cyan-500/20 rounded-md shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse flex items-center justify-center transition-all duration-300">
                                    <span className="text-cyan-300 font-bold tracking-widest text-sm drop-shadow-md">部署位</span>
                                </div>
                            )}
                        </div>
                    </div>

                        {/* 替身 GhostCard（多卡队列，Portal 渲染到 document.body） */}
                        {ghostState && (
                            <DragGhostCard
                                cards={ghostState.cards}
                                x={ghostState.x}
                                y={ghostState.y}
                                scale={ghostState.scale ?? GHOST_CARD_SCALE}
                                location={ghostState.location}
                                w={ghostState.w}
                                h={ghostState.h}
                                skinOverrides={skinOverrides} // [核心修复] 把皮肤数据传给拖拽替身组件！
                            />
                        )}

                    {/* 5. 底部占位 (为抽出的全屏手牌预留空间) */}
                    <div className="h-32 w-full flex-shrink-0"></div>
                </div>

                {/* --- C. 右侧 UI 层 (水晶控制台版) --- */}
                <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">

                    {/* 1. 核心按钮层 (Layer 1: Bottom) - z-10 */}
                    <div className="absolute top-[46%] right-[7.5%] -translate-y-1/2 pointer-events-auto z-10 flex flex-col items-center gap-2">
                        {/* 倒计时 */}
                        <div className={`font-mono text-xl font-bold flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-white/10 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-300'}`}>
                            <Clock size={16} />
                            {String(mulligan.isActive ? mulligan.timeLeft : timeLeft).padStart(String(turnTimer).length, '0')}
                        </div>

                        {/* [核心修改] 根据配置决定渲染 分裂按钮 还是 标准按钮 */}
                        {btnConfig === null ? (
                            // --- 分裂按钮状态 (Split Button) ---
                            <div className="flex flex-col w-36 h-36 rounded-full shadow-lg overflow-hidden group relative">
                                {/* 上半部分：进攻 (Red) */}
                                <button
                                    data-action="attack"
                                    onClick={() => {
                                        eventBus.emit(GameEvents.ATTACK_DECLARE);
                                        actions.initiateAttack();
                                    }}
                                    className="flex-1 w-full bg-gradient-to-b from-orange-500 to-red-600 border-x-4 border-t-4 border-orange-300 flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all z-20"
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] hover:animate-shine"></div>
                                    <span className="text-lg font-black text-white drop-shadow-md translate-y-2">进攻</span>
                                </button>

                                {/* 下半部分：跳过 (Blue) */}
                                <button
                                    data-action="skip"
                                    onClick={() => {
                                        eventBus.emit(GameEvents.UI_CLICK);
                                        actions.passTurn();
                                    }}
                                    className={`flex-1 w-full border-x-4 border-b-4 flex items-center justify-center relative transition-all z-10 ${
                                        tutorialLockSkip
                                            ? 'bg-slate-700 border-slate-600 text-slate-500 cursor-not-allowed'
                                            : 'bg-blue-600 border-blue-400 hover:brightness-110 active:scale-95'
                                    }`}
                                    disabled={tutorialLockSkip}
                                >
                                    <span className={`text-lg font-black drop-shadow-md -translate-y-2 ${
                                        tutorialLockSkip ? 'text-slate-500' : 'text-blue-100'
                                    }`}>跳过</span>
                                </button>

                                {/* 中间分割线装饰 */}
                                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-black/50 z-30 pointer-events-none"></div>
                            </div>
                        ) : (
                            // --- 标准按钮状态 (Standard Button) ---
                            <button
                                data-entity-id="game-action-btn"
                                onClick={() => {
                                    // [修改] 直接调用 Hook 返回的 action，逻辑已在内部封装
                                    if (btnConfig?.action) btnConfig.action();
                                }}
                                disabled={btnConfig?.disabled || game.phase === 'animating' || tutorialLockAction}
                                className={btnConfig?.style}
                            >
                                {btnConfig?.showFlow && (
                                    <div className="absolute inset-[-10px] rounded-full pointer-events-none overflow-visible z-0">
                                        <svg className="w-full h-full overflow-visible">
                                            <circle cx="50%" cy="50%" r="46%" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 250" className="animate-beam-move drop-shadow-[0_0_10px_white] opacity-80" />
                                        </svg>
                                    </div>
                                )}
                                <span className="text-xl font-black text-white drop-shadow-md z-10 relative">{btnConfig?.text}</span>
                            </button>
                        )}
                    </div>

                    {/* 2. 容器与水晶层 (Layer 2: Top) - z-20 */}
                    <div className="absolute top-[48%] right-[5%] -translate-y-1/2 z-20 flex items-center justify-center">
                        <div className="relative">
                            {/* A. 背景容器图 */}
                            <img
                                src={UI_IMAGES.buttonContainer}
                                className="w-[275px] max-w-none h-auto object-contain opacity-100 drop-shadow-2xl"
                                alt="控制面板"
                                style={{ transform: 'translateX(30px) translateY(0px)' }}
                            />

                            {/* B. 水晶系统挂载点 (绝对定位于背景图之上) */}
                            <div className="absolute inset-0 z-30" style={{ transform: 'translateX(30px) translateY(0px)' }}>
                                {/* 我方水晶 (下半部分) */}
                                <ManaGemSystem
                                    // [关键修正] 使用 displayPlayerMana (动画数值)
                                    // 这样水晶数量就会跟随 useManaTicker 的逻辑 (减少 -> 0 -> 增加) 进行变化
                                    currentMana={displayPlayerMana}
                                    maxMana={game.playerMaxMana}
                                    spellMana={game.playerSpellMana}
                                    previewManaCost={previewManaCost}
                                    previewSpellManaCost={previewSpellManaCost}
                                    isPlayer={true}
                                    round={game.round}
                                />

                                {/* 敌方水晶 (上半部分) */}
                                <ManaGemSystem
                                    // [关键修正] 使用 displayEnemyMana (动画数值)
                                    currentMana={displayEnemyMana}
                                    maxMana={game.enemyMaxMana}
                                    spellMana={game.enemySpellMana}
                                    previewManaCost={0}
                                    previewSpellManaCost={0}
                                    isPlayer={false}
                                    round={game.round}
                                />
                            </div>
                        </div>
                    </div>



                    {/* 3. [新增] 独立倒计时层 (Layer 3: Timer) */}
                    {/* [微调指南] 纯数字，无背景 */}
                    <div className={`
                        absolute z-40 font-mono font-black text-3xl tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]
                        /* 位置微调：根据背景图上的"倒计时窗口"定位 */
                        top-[48.5%] right-[87%] translate-x-[0px] translate-y-[0px]
                        ${timeLeft <= 5 ? 'text-red-500 animate-pulse scale-125' : 'text-white-200'}
                        transition-all duration-300
                    `}>
                        {String(timeLeft).padStart(String(turnTimer).length, '0')}
                    </div>

                    {/* 4. [新增] 独立进攻令牌层 (Layer 4: Attack Token) */}
                    <AnimatePresence>
                        {game.attackToken.enemy && <AttackToken type={game.attackToken.enemy} isEnemy={true} />}
                        {game.attackToken.player && <AttackToken type={game.attackToken.player} isEnemy={false} />}
                    </AnimatePresence>


                    {/* 3. 数值文字层 (保留) - z-40 */}
                    <div className="absolute top-[36.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[-15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{displayEnemySpellMana}</span>
                    </div>
                    <div className="absolute top-[37.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{displayEnemyMana}</span>
                    </div>
                    <div className="absolute bottom-[41.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{displayPlayerMana}</span>
                    </div>
                    <div className="absolute bottom-[40.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{displayPlayerSpellMana}</span>
                    </div>

                </div>

                {/* --- D. 全屏手牌层 (彻底突破层叠结界) --- */}
                {/* 提权：脱离了中间战场的 z-10 牢笼，作为独立的根级覆盖层，获得与水晶盘同场竞技的资格 */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[65%] h-48 z-40 pointer-events-none flex justify-center items-end pb-4 overflow-visible">
                    <div className="flex -space-x-4 px-4 items-end w-full">
                        {!isMulliganPhase && (
                            <PlayerHand
                                hand={playerHand}
                                game={game}
                                cardBackUrl={currentCardBackUrl}
                                skinOverrides={skinOverrides} // [新增] 喂给手牌区！
                                onCardClick={(c) => handleCardClick(c, 'hand', 'player')}
                                onHover={setHoveredCard}
                                onViewArt={handleViewCard}
                                playerBench={playerBench}
                                combatField={combatField}
                                isCastingForHand={isCastingForHand} // [核心修复] 将索敌状态精准打通至手牌组件！
                                handTargetFilter={handTargetFilter} // [2026-08-08 莉莉子] HAND_CARD 目标过滤条件，供手牌高亮
                                onAnimComplete={(id) => onHandAnimComplete(id, 'player')} // [2026-07-22 莉莉子] 手牌动画完成回调
                            />
                        )}
                    </div>
                </div>

            </div>

            {/* [新增] 战场/备战席悬停预览 — Portal 越狱跟随鼠标 */}
            <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} skinId={skinOverrides[gazeTarget?.card.key || ''] || 0} playerNexusHealth={game.playerNexus} enemyNexusHealth={game.enemyNexus} /> {/* [新增] 给悬停大图穿皮肤 */}

            {/* [教程] 强制悬停卡牌预览 — 引导层 forceHoverSelectors 触发 */}
            {tutorialForcedPreview && (() => {
                const card = findCardByKey(tutorialForcedPreview.cardKey);
                if (!card) return null;
                return (
                    <FloatingCardPreview mode="fixed" card={card} position="fixed right-[5%] top-1/2 -translate-y-1/2" scale={1.25} playerNexusHealth={game.playerNexus} enemyNexusHealth={game.enemyNexus} />
                );
            })()}

            {/* 手牌动画覆盖层 — 监听事件驱动 EphemeralDissolve / CardShatter / MidAirShatter */}
            <DrawAnimOverlay cardBackUrl={currentCardBack} skinOverrides={skinOverrides} />
            <HandAnimOverlay />
        </div>
        </HeroCardMediaContext.Provider>
    );
}
