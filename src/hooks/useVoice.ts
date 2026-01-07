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
    // 计时器引用
    const debounceTimer = useRef<number | null>(null);

// [新增] 冷却记录 Map: key = "cardId_eventType", value = timestamp
    const cooldownMap = useRef<Map<string, number>>(new Map());
    // 播放语音的核心函数 (新版：防抖 + 择优播放)
    const playVoice = (card: CardData, type: VoiceEventType, cooldown: number = 3000) => {
        const heroVoiceConfig = VOICE_DB[card.key];
        if (!heroVoiceConfig) return;
        let src = '';
        if (type === 'attack_block') {
            // 随机选一个
            const list = heroVoiceConfig.attack_block || [];
            if (list.length > 0) src = list[Math.floor(Math.random() * list.length)];
        } else if (type === 'kill') {
            // 随机选一个
            const list = heroVoiceConfig.kill || [];
            if (list.length > 0) src = list[Math.floor(Math.random() * list.length)];
        } else if (type === 'enemy_spawn') {
            const list = heroVoiceConfig.enemy_spawn || [];
             if (list.length > 0) src = list[Math.floor(Math.random() * list.length)];
        } else {
            src = (heroVoiceConfig as any)[type];
        }

        if (!src) return;

        // [新增] 冷却检查：同一张卡牌的同类型语音，2秒内只触发一次
        const cooldownKey = `${card.id}_${VoiceEventType}`;
        const now = Date.now();
        const lastTime = cooldownMap.current.get(cooldownKey) || 0;
        if (now - lastTime < cooldown) {
            return; // 冷却中，跳过
        }
                // 3. 检查优先级 (Priority Check)
        // 规则：只有比当前正在播放的语音优先级更高，才能打断
        // 或者当前没有在播放
        const newPriority = PRIORITY_MAP[type];
        const currentPriority = audioRef.current && !audioRef.current.paused
            ? (audioRef.current as any)._priority || 0
            : 0;

        if (newPriority < currentPriority) {
            return; // 优先级不够，忽略
        }

        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = window.setTimeout(() => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }

            const audio = new Audio(src);
            audio.volume = 1.0; // 语音音量
            (audio as any)._priority = newPriority; // 挂载优先级属性 hack

            // UI 联动：显示气泡
            setSpeakingCardId(card.id);

            audio.onended = () => {
                setSpeakingCardId(null);
                audioRef.current = null;
            };

            audio.play().catch(e => console.warn("Voice play failed", e));
            audioRef.current = audio;

            // 更新冷却
            cooldownMap.current.set(cooldownKey, now);

        }, 50);
    };


    useEffect(() => {
        // --- 事件监听处理 ---

        // 1. 回合开始 (不再需要重置 allyDiedThisRound)
        const handleRoundStart = () => {};

        // 2. 单位阵亡
        const handleUnitDie = (unit: CardData) => {
            if (unit.isChampion) {
                // [修复] 传递 cooldown 参数
                playVoice(unit, 'die', 0); // 死亡语音无冷却
            }
        };

        // 3. 打出卡牌 (登场) - [修改] 统一为普通登场
        const handlePlayCard = (card: CardData) => {
            if (card.isChampion) {
                playVoice(card, 'play');
            }
        };

        // [新增] 英雄首次进攻/格挡
        const handleHeroFirstAction = (hero: CardData) => {
            // [修复] 传递 cooldown 参数
            playVoice(hero, 'attack_block', 5000);
        };


        // 5. 击杀敌人
        const handleKill = (hero: CardData) => {
             // 击杀语音优先级较高
             playVoice(hero, 'kill');
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
                // [修复] 传递 cooldown 参数
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

            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, []);

    return { speakingCardId };
};