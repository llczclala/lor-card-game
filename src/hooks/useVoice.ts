import { useEffect, useState, useRef } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';
// 确保使用了 type 导入
import { VOICE_DB, type VoiceEventType } from '../data/voiceData';
import type { CardData } from '../types';

// [关键修复] 补全缺失的优先级定义
const PRIORITY_MAP: Record<VoiceEventType, number> = {
    die: 4,         // 最高
    victory: 3,     // 高
    attack_block: 1,// 低
    play: 1,
    enemy_spawn: 1,
    kill: 2,
    spell_small: 1,
    spell_ultimate: 1
};

export const useVoice = () => {
    const [speakingCardId, setSpeakingCardId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // [修改] 移除 currentPriority (旧逻辑)，改为 buffer 逻辑
    // 记录当前正在“排队”等待播放的最高优先级语音
    const pendingVoice = useRef<{ card: CardData, src: string, priority: number } | null>(null);
    // 计时器引用
    const debounceTimer = useRef<any>(null);

// [新增] 冷却记录 Map: key = "cardId_eventType", value = timestamp
    const cooldownMap = useRef<Map<string, number>>(new Map());
    // 播放语音的核心函数 (新版：防抖 + 择优播放)
    const playVoice = (card: CardData | undefined, eventType: VoiceEventType) => {
        if (!card || !card.isChampion) return;

        // [新增] 冷却检查：同一张卡牌的同类型语音，2秒内只触发一次
        const cooldownKey = `${card.id}_${eventType}`;
        const now = Date.now();
        const lastTime = cooldownMap.current.get(cooldownKey) || 0;
        if (now - lastTime < 2000) return;

        const heroConfig = VOICE_DB[card.key];
        if (!heroConfig) return;

        const clips = heroConfig[eventType];
        if (!clips || clips.length === 0) return;

        const priority = PRIORITY_MAP[eventType] || 0;
        const src = clips[Math.floor(Math.random() * clips.length)];

        // 1. 如果当前正在播放更高优先级的语音，直接忽略新请求 (保持“低不打断高”)
        if (audioRef.current && !audioRef.current.paused && (audioRef.current as any)._priority > priority) {
            return;
        }

        // 2. 更新缓冲区：如果新语音优先级 >= 缓冲区里的，则替换缓冲区
        if (!pendingVoice.current || priority >= pendingVoice.current.priority) {
            pendingVoice.current = { card, src, priority };
        }

        // 3. 重置计时器 (防抖：100ms 内如果有新事件，会重新计时)
        // 100ms 足够覆盖“同时发生”的逻辑事件 (如击杀+胜利)，但对玩家来说几乎是瞬时的
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(() => {
            if (!pendingVoice.current) return;

            const { card: targetCard, src: targetSrc, priority: targetPriority } = pendingVoice.current;

            // 真正开始播放
            if (audioRef.current) {
                audioRef.current.pause();
                setSpeakingCardId(null);
            }

            const audio = new Audio(targetSrc);
            audio.volume = 0.8;
            // 标记这个 Audio 的优先级，供步骤 1 判断
            (audio as any)._priority = targetPriority;
            audioRef.current = audio;

            setSpeakingCardId(targetCard.id);

            const cleanup = () => setSpeakingCardId(null);
            audio.onended = cleanup;
            audio.onerror = cleanup;

            audio.play().catch(e => console.warn("Voice play failed", e));

            // 清理缓冲区
            pendingVoice.current = null;
            debounceTimer.current = null;
        }, 100);
    };

    useEffect(() => {
        // --- 事件监听处理 ---

        // 1. 回合开始 (不再需要重置 allyDiedThisRound)
        const handleRoundStart = () => {};

        // 2. 单位阵亡
        const handleUnitDie = (unit: CardData) => {
            // [修正] 移除了不存在的 allyDiedThisRound 设置
            if (unit.isChampion) {
                playVoice(unit, 'die');
            }
        };

        // 3. 打出卡牌 (登场) - [修改] 统一为普通登场
        const handlePlayCard = (card: CardData) => {
            if (!card.type.includes('unit')) return;
            playVoice(card, 'play', 300);
        };

        // [新增] 英雄首次进攻/格挡
        const handleHeroFirstAction = (hero: CardData) => {
            playVoice(hero, 'attack_block', 200);
        };


        // 5. 击杀敌人
        const handleKill = (hero: CardData) => {
            playVoice(hero, 'kill', 200);
        };


        // 7. 技能抉择
        const handleSpellChoice = (payload: { hero: CardData, choice: 'small' | 'ultimate' }) => {
            if (payload.choice === 'ultimate') {
                playVoice(payload.hero, 'spell_ultimate');
            } else {
                playVoice(payload.hero, 'spell_small');
            }
        };

        // 8. 胜利
        const handleVictory = (survivingHeroes: CardData[]) => {
            if (survivingHeroes.length > 0) {
                // 让第一个活着的英雄说话
                playVoice(survivingHeroes[0], 'victory', 1000);
            }
        };

        // --- 注册 ---
        eventBus.on(GameEvents.ROUND_START, handleRoundStart);
        eventBus.on(GameEvents.HERO_FIRST_ACTION, handleHeroFirstAction);
        eventBus.on(GameEvents.UNIT_DIE, handleUnitDie);
        eventBus.on(GameEvents.PLAY_CARD_VOICE, handlePlayCard); // 注意：我们需要区分 UI点击音效 和 语音触发
        eventBus.on(GameEvents.UNIT_KILL, handleKill);
        eventBus.on(GameEvents.SPELL_CHOICE, handleSpellChoice);
        eventBus.on(GameEvents.GAME_VICTORY, handleVictory);

        return () => {
            eventBus.off(GameEvents.ROUND_START, handleRoundStart);
            eventBus.on(GameEvents.HERO_FIRST_ACTION, handleHeroFirstAction);
            eventBus.off(GameEvents.UNIT_DIE, handleUnitDie);
            eventBus.off(GameEvents.PLAY_CARD_VOICE, handlePlayCard);
            eventBus.off(GameEvents.UNIT_KILL, handleKill);
            eventBus.off(GameEvents.SPELL_CHOICE, handleSpellChoice);
            eventBus.off(GameEvents.GAME_VICTORY, handleVictory);
        };
    }, []);

    return { speakingCardId };
};