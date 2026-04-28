import { useEffect, useState, useRef} from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { VOICE_DB } from '../data/voiceData';
import type { VoiceEventType } from '../data/voiceData';
import type { CardData } from '../types';

interface VoiceTask {
    card: CardData;
    type: VoiceEventType;
    priority: number;
}

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

export const useVoice = ({ playerBench }: { playerBench: CardData[] }) => {
    const [speakingCardId, setSpeakingCardId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const cooldownMap = useRef<Map<string, number>>(new Map());
    const queue = useRef<VoiceTask[]>([]);
    const isPlayingRef = useRef(false);

    // [新增] 语音音量 Ref (默认 0.8)
    const volumeRef = useRef(0.8);

    useEffect(() => {
        const handleVolumeUpdate = (vol: number) => {
            const newVol = Math.max(0, Math.min(1, vol));
            volumeRef.current = newVol;
            // 如果当前正好有语音在播放，直接调整它的音量
            if (audioRef.current) {
                audioRef.current.volume = newVol;
            }
        };

        // 监听自定义事件 'SET_VOICE_VOLUME'
        eventBus.on(GameEvents.SET_VOICE_VOLUME, handleVolumeUpdate);
        return () => {
            eventBus.off(GameEvents.SET_VOICE_VOLUME, handleVolumeUpdate);
        };
    }, []);


    // [新增] 队列处理器
    const processQueue = () => {
        if (isPlayingRef.current || queue.current.length === 0) return;

        // 取出优先级最高的任务 (或者简单的先进先出，这里用先进先出 + 插入排序维护优先级)
        // 简单起见，我们用先进先出 (FIFO)，但在入队时如果优先级极高(die)，可以插队
        const task = queue.current.shift();
        if (!task) return;

        isPlayingRef.current = true;
        playAudioFile(task);
    };

    // [新增] 核心播放执行器
    const playAudioFile = (task: VoiceTask) => {
        const heroVoiceConfig = VOICE_DB[task.card.key];
        if (!heroVoiceConfig || !heroVoiceConfig[task.type]) {
            isPlayingRef.current = false;
            processQueue(); // 跳过，处理下一个
            return;
        }

        const voices = heroVoiceConfig[task.type];
        const src = voices[Math.floor(Math.random() * voices.length)];

        setSpeakingCardId(task.card.id);

        const audio = new Audio(src);
        audioRef.current = audio;
        audio.volume = volumeRef.current;

        // 播放结束回调
        audio.onended = () => {
            setSpeakingCardId(null);
            isPlayingRef.current = false;
            // 稍微停顿一下再放下一句，更自然
            setTimeout(processQueue, 300);
        };

        audio.onerror = () => {
            console.warn("Voice load failed:", src);
            setSpeakingCardId(null);
            isPlayingRef.current = false;
            processQueue();
        };

        audio.play().catch(() => {
            isPlayingRef.current = false;
        });
    };

    const playVoice = (card: CardData, type: VoiceEventType, cooldown: number = 3000) => {
        const priority = PRIORITY_MAP[type] || 1;
        const now = Date.now();
        const cdKey = `${card.key}_${type}`;
        const lastTime = cooldownMap.current.get(cdKey) || 0;

        // 冷却检查 (死亡语音无视冷却)
        if (type !== 'die' && now - lastTime < cooldown) return;

        // 死亡语音插队逻辑：清空低优先级队列，置于队首
        if (type === 'die') {
            queue.current = queue.current.filter(t => t.priority >= 4); // 清除普通语音
            if (audioRef.current && isPlayingRef.current) {
                audioRef.current.pause(); // 打断当前
                isPlayingRef.current = false;
            }
            queue.current.unshift({ card, type, priority });
        } else {
            // 普通语音：追加到队尾
            queue.current.push({ card, type, priority });
        }

        cooldownMap.current.set(cdKey, now);
        processQueue(); // 尝试启动
    };


    useEffect(() => {
        const handlePlayCard = (card: CardData) => playVoice(card, 'play');
        const handleUnitDie = (card: CardData) => playVoice(card, 'die');
        const handleHeroFirstAction = (card: CardData) => playVoice(card, 'attack_block');
        const handleKill = (card: CardData) => playVoice(card, 'kill');
        const handleSpellChoice = (payload: { hero: CardData, choice: 'small' | 'ultimate' }) => {
            if (payload.choice === 'ultimate') {
                playVoice(payload.hero, 'spell_ultimate');
            } else {
                playVoice(payload.hero, 'spell_small');
            }
        };

        // [修改] 互动语音：随机选取一名我方英雄回应
        const handleEnemySpawn = () => {
            // 从 playerBench 中筛选出英雄
            const myHeroes = playerBench.filter(c => c.isChampion);
            if (myHeroes.length === 0) return;

            // 随机选一个
            const randomHero = myHeroes[Math.floor(Math.random() * myHeroes.length)];
            playVoice(randomHero, 'enemy_spawn');
        };

        // [修改] 胜利语音：不再自动播放，改为接收 MVP 指定播放
        const handleVictory = (payload: any) => {
            // payload 可能是数组(旧逻辑) 或 单个英雄对象(新逻辑)
            // 这里我们兼容新逻辑：GameSession 会发来 { hero: mvp }
            const hero = Array.isArray(payload) ? payload[0] : payload?.hero;
            if (hero) {
                // 清空队列，确保胜利感言不被前面的废话阻塞
                queue.current = [];
                if (audioRef.current) audioRef.current.pause();
                isPlayingRef.current = false;

                playVoice(hero, 'victory', 0);
            }
        };

        // --- 注册 ---
        eventBus.on(GameEvents.PLAY_CARD_VOICE, handlePlayCard);
        eventBus.on(GameEvents.ENEMY_SPAWN, handleEnemySpawn); // 绑定互动
        eventBus.on(GameEvents.GAME_VICTORY, handleVictory);
        eventBus.on(GameEvents.HERO_FIRST_ACTION, handleHeroFirstAction);
        eventBus.on(GameEvents.UNIT_DIE, handleUnitDie);
        eventBus.on(GameEvents.UNIT_KILL, handleKill);
        eventBus.on(GameEvents.SPELL_CHOICE, handleSpellChoice);

        return () => {
            eventBus.off(GameEvents.PLAY_CARD_VOICE, handlePlayCard);
            eventBus.off(GameEvents.ENEMY_SPAWN, handleEnemySpawn);
            eventBus.off(GameEvents.GAME_VICTORY, handleVictory);
            eventBus.off(GameEvents.HERO_FIRST_ACTION, handleHeroFirstAction);
            eventBus.off(GameEvents.UNIT_DIE, handleUnitDie);
            eventBus.off(GameEvents.UNIT_KILL, handleKill);
            eventBus.off(GameEvents.SPELL_CHOICE, handleSpellChoice);
        };
    }, [playerBench]);

    return {
        speakingCardId,
        setVoiceVolume: (vol: number) => eventBus.emit(GameEvents.SET_VOICE_VOLUME, vol)
    };
};