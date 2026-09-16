import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion'; // [修复] 移除未使用的 AnimatePresence
import {
    X, Search, User, Zap, Box,
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
    Swords, PlusCircle, FastForward, Skull, Target
} from 'lucide-react'; // [修复] 移除 Filter, ShieldAlert, Heart, Play
import { useGameState } from '../../hooks/useGameState';
import { useSpellSystem } from '../../hooks/useSpellSystem';
import { CARD_DB } from '../../data/cards';
// [2026-09-13 P3 特殊系统挂载]
import { PLAYER_ENHANCEMENTS, ENEMY_ELIGIBLE_BUFFS } from '../../data/roguelike/buffs';
import { EQUIPMENT_DEFS, attachEquipment } from '../../data/equipment';
import { Card } from '../Card';
import { Battlefield } from '../Battlefield';
import { VFXLayer } from '../VFXLayer';
import { SmartNexus } from '../GameUI';
import { ManaGemSystem } from '../ManaGemSystem';
import { UI_IMAGES, PERSONALIZATION_ASSETS } from '../../data/imageData';
import type { CardData, Keyword } from '../../types';

interface SandboxSessionProps {
    onClose: () => void;
}

type CategoryFilter = 'ALL' | 'HERO' | 'SPELL' | 'UNIT';

const ALL_KEYWORDS: Keyword[] = [
    'Overwhelm', 'QuickAttack', 'Regeneration', 'Elusive', 'Challenger', 'CantBlock',
    'Barrier', 'Lifesteal', 'Last Breath', 'Fearsome', 'Frostbite', 'Tough',
    'Scout', 'Ephemeral', 'Stun', 'Double Attack', 'Support', 'Deadly',
    'SpellShield', 'Silence', 'Berserk', 'Cleave', 'Thorns', 'Vanguard',
    'Ambush', 'Plunder', 'Exposed', 'Shroud', 'Immobile', 'Reborn',
    'Execute', 'Sniper', 'Volatile', 'Echo', 'Impact', 'Channel'
];

// [2026-09-13 P0 区域补齐] 投放落点 —— 对局里实体能去的所有区域
const SPAWN_LOCATIONS = [
    ['hand', '手牌'],
    ['bench', '备战席'],
    ['combat', '交战区'],
    ['block', '格挡位'],
    ['deck', '牌库'],
    ['grave', '墓地'],
    ['stack', '法术堆叠'],
] as const;

const LOCATION_LABELS: Record<string, string> = Object.fromEntries(SPAWN_LOCATIONS);

// ══════════════════════════════════════════════════════════════════════
// [2026-09-13 P1 实体字段补齐] 通用字段编辑器
//
// 设计初衷：手写每个字段的 UI 永远追不上项目迭代速度（CardData 还在不断加字段）。
// 这里遍历实体的【全部】key 自动生成控件 —— 任何新字段天生就被支持，
// 不需要回来改沙盒代码。这是"完备性"的兜底保障。
// ══════════════════════════════════════════════════════════════════════

/** 不该在沙盒里随手改的字段：改了会破坏渲染或造成不可控的递归结构 */
const HIDDEN_CARD_KEYS = new Set(['id', 'imageUrl', 'level2ImageUrl', 'parentCard']);

/** 动画状态枚举（对齐 CardData.animState 联合类型） */
const ANIM_STATES = [
    'idle', 'attacking', 'delayed_attacking', 'hit', 'dying', 'ephemeral_dying',
    'transform', 'regenerating', 'buff', 'summoning', 'channel_pulse', 'thawing', 'swing_miss'
] as const;

/** 单字段控件 —— 按值类型自动渲染（布尔→开关 / 数组→逗号分隔 / 数字→输入框 / 对象→只读展示） */
const FieldRow: React.FC<{ fieldKey: string; value: any; onChange: (v: any) => void }> = ({ fieldKey, value, onChange }) => {
    const isArr = Array.isArray(value);
    const type = typeof value;
    return (
        <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-[10px] text-gray-500 font-mono truncate" title={fieldKey}>{fieldKey}</span>
            {type === 'boolean' ? (
                <button onClick={() => onChange(!value)}
                    className={`px-2 py-0.5 text-[10px] rounded font-black transition-all ${value ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-gray-400'}`}>
                    {String(value)}
                </button>
            ) : isArr ? (
                // 简单数组（字符串/数字）可编辑；对象数组只读展示，避免误改破坏结构
                ((value as any[]).length > 0 && typeof (value as any[])[0] === 'object') ? (
                    <span className="flex-1 text-[10px] text-gray-600 font-mono truncate" title={JSON.stringify(value)}>
                        [Array ×{(value as any[]).length}]
                    </span>
                ) : (
                    <input value={(value as any[]).join(', ')}
                        onChange={(e) => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="flex-1 bg-slate-800 rounded px-2 py-0.5 text-[10px] font-mono focus:outline-none" />
                )
            ) : type === 'number' ? (
                <input type="number" value={value ?? 0}
                    onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-slate-800 rounded px-2 py-0.5 text-[10px] font-mono focus:outline-none" />
            ) : (value !== null && type === 'object') ? (
                <span className="flex-1 text-[10px] text-gray-600 font-mono truncate" title={JSON.stringify(value)}>
                    {JSON.stringify(value)}
                </span>
            ) : (
                <input value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 bg-slate-800 rounded px-2 py-0.5 text-[10px] font-mono focus:outline-none" />
            )}
        </div>
    );
};

export const SandboxSession: React.FC<SandboxSessionProps> = ({ onClose }) => {
    // === 1. 初始化底层状态机 ===
    const {
        game, setGame,
        playerHand, setPlayerHand, enemyHand, setEnemyHand,
        playerBench, setPlayerBench, enemyBench, setEnemyBench,
        combatField, setCombatField,
        // [2026-09-13 P0 区域补齐] 牌库（造"牌库里有 X"的场景 / P4 快照需要读值）
        playerDeck, setPlayerDeck, enemyDeckState, setEnemyDeckState,
        actions, message, setMessage
    } = useGameState([], [], true);

    const spellSystem = useSpellSystem({
        onComplete: (card, targets) => { actions.finalizeSpell(card, 'player', targets); }
    } as Parameters<typeof useSpellSystem>[0]); // [2026-08-27] UI 层简版调用，断言消除接口过严误报

    // === UI 抽屉状态 ===
    const [isArmoryOpen, setIsArmoryOpen] = useState(true);
    const [isDnaOpen, setIsDnaOpen] = useState(false);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false); // [修复] 默认隐藏，像抽屉一样沉在下面

    // === 沙盒专属特权状态 ===
    const [spawnTarget, setSpawnTarget] = useState<'player' | 'enemy'>('player');
    // [2026-09-13 L1-A] 万能投放：卡牌落点（手牌 / 备战席 / 交战区）
    const [spawnLocation, setSpawnLocation] = useState<'hand' | 'bench' | 'combat' | 'block' | 'deck' | 'grave' | 'stack'>('hand');
    const [sandboxIdentity, setSandboxIdentity] = useState<'player' | 'enemy'>('player');
    const [selectedDnaCardId, setSelectedDnaCardId] = useState<string | null>(null);
    // [2026-09-13 P1] 通用字段编辑器的折叠开关
    const [showAllFields, setShowAllFields] = useState(false);
    // [2026-09-13 P2] 全局字段编辑器（GameState）的折叠开关
    const [showAllGameFields, setShowAllGameFields] = useState(false);
    // [2026-09-13 P3] 迷宫强化挂载面板 / 装备挂载面板
    const [showEnhancements, setShowEnhancements] = useState(false);
    const [showEquips, setShowEquips] = useState(false);
    const [equipSearch, setEquipSearch] = useState('');
    // [2026-09-13 P4] 场景快照面板
    const [showSnapshot, setShowSnapshot] = useState(false);
    const [snapshotText, setSnapshotText] = useState('');

    // === 兵工厂过滤状态 ===
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState<CategoryFilter>('ALL');
    // [修复] 移除未使用的 setter，解决 TS6133 报错。如果您连变量都没用到，可以直接把这两行全删了
    const [costFilter] = useState<string>('ALL');
    const [regionFilter] = useState<string>('ALL');

    // --- 兵工厂逻辑 ---
    const filteredCards = useMemo(() => {
        return Object.values(CARD_DB).filter(c => {
            if (searchTerm && !c.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            if (category === 'HERO' && !c.isChampion) return false;
            if (category === 'SPELL' && !c.type.includes('spell')) return false;
            if (category === 'UNIT' && (c.isChampion || c.type.includes('spell'))) return false;
            if (regionFilter !== 'ALL' && c.region !== regionFilter) return false;
            if (costFilter !== 'ALL') {
                if (costFilter === '10+' && c.cost < 10) return false;
                if (costFilter !== '10+' && c.cost.toString() !== costFilter) return false;
            }
            return true;
        });
    }, [searchTerm, category, costFilter, regionFilter]);

    const handleSpawnCard = (key: string) => {
        const base = CARD_DB[key];
        const newCard: CardData = {
            ...base,
            id: `sandbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            strikeCount: 0,
            animState: 'idle',
            damageTaken: 0,
            buffs: { power: 0, health: 0 }
        } as CardData;

        // ══════════════════════════════════════════════════════════════════
        // [2026-09-13 P0 区域补齐] 万能投放：对局里实体能去的【所有】区域
        //
        // 旧版只能发到手牌 —— 想造"敌我双方场上各一个同名天启者"，得替双方各打出、
        // 还要凑法力与阶段，实测成本极高（粉丝 BUG 难复现的根源之一）。
        //
        // ⚠️ 投放到【交战区】时注意：若打开了「守卫照跑」（L2-A），main 阶段的交战区
        //    不变量守卫会把单位归位回备战席 —— 这是真机的正确行为，不是 bug。
        // ══════════════════════════════════════════════════════════════════
        const sideLabel = spawnTarget === 'player' ? '我方' : '敌方';
        const locLabel = LOCATION_LABELS[spawnLocation] || spawnLocation;

        switch (spawnLocation) {
            case 'hand':
                (spawnTarget === 'player' ? setPlayerHand : setEnemyHand)(prev => [...prev, newCard]);
                break;

            case 'bench':
                (spawnTarget === 'player' ? setPlayerBench : setEnemyBench)(prev => [...prev, newCard]);
                break;

            case 'combat':
                // owner 标记槽位归属，attacker 即刚投放的单位（无格挡者）
                setCombatField(prev => [...prev, { owner: spawnTarget, attacker: newCard, blocker: null } as any]);
                break;

            case 'block': {
                // 格挡位：与一个"缺 blocker 的敌对方进攻单位"配对
                // （我方格挡者挡的是敌方进攻者，反之亦然）
                const hasTarget = combatField.some(f => {
                    const attackerSide = f.owner === 'player' ? 'player' : 'enemy';
                    return attackerSide !== spawnTarget && !f.blocker;
                });
                if (!hasTarget) {
                    setMessage(`⚠️ 交战区没有待格挡的敌对方进攻单位 —— 请先投放到「交战区」`);
                    return;
                }
                setCombatField(prev => {
                    const idx = prev.findIndex(f => {
                        const attackerSide = f.owner === 'player' ? 'player' : 'enemy';
                        return attackerSide !== spawnTarget && !f.blocker;
                    });
                    if (idx < 0) return prev;
                    const next = [...prev];
                    next[idx] = { ...next[idx], blocker: newCard };
                    return next;
                });
                setMessage(`已将 [${base.name}] 放上${sideLabel}格挡位`);
                return;
            }

            case 'deck':
                (spawnTarget === 'player' ? setPlayerDeck : setEnemyDeckState)(prev => [...prev, newCard]);
                break;

            case 'grave':
                setGame(prev => ({
                    ...prev,
                    [spawnTarget === 'player' ? 'playerGraveyard' : 'enemyGraveyard']: [
                        ...(((spawnTarget === 'player' ? prev.playerGraveyard : prev.enemyGraveyard) || [])),
                        newCard
                    ]
                }));
                break;

            case 'stack':
                // 法术堆叠：造"堆叠里有法术待结算"的场景（对非法术卡也开放，便于构造异常态）
                setGame(prev => ({
                    ...prev,
                    spellStack: [...prev.spellStack, { card: newCard, owner: spawnTarget, targets: [] } as any]
                }));
                break;
        }
        setMessage(`已将 [${base.name}] 放入${sideLabel}${locLabel}`);
    };

    // --- 基因改造台逻辑 ---
    const activeDnaCard = useMemo(() => {
        if (!selectedDnaCardId) return null;
        const allCards = [
            ...playerHand, ...enemyHand, ...playerBench, ...enemyBench,
            ...combatField.map(f => f.attacker),
            ...combatField.map(f => f.blocker).filter(Boolean) as CardData[]
        ];
        return allCards.find(c => c.id === selectedDnaCardId) || null;
    }, [selectedDnaCardId, playerHand, enemyHand, playerBench, enemyBench, combatField]);

    const handleDnaSelect = (e: React.MouseEvent, card: CardData) => {
        e.preventDefault();
        setSelectedDnaCardId(card.id);
        setIsDnaOpen(true);
        setMessage(`正在改造: ${card.name}`);
    };

    const updateDnaCard = (changes: Partial<CardData>) => {
        if (!selectedDnaCardId) return;
        const apply = (list: CardData[]) => list.map(c => c.id === selectedDnaCardId ? { ...c, ...changes } : c);
        setPlayerHand(apply);
        setEnemyHand(apply);
        setPlayerBench(apply);
        setEnemyBench(apply);
        setCombatField(prev => prev.map(f => ({
            ...f,
            attacker: f.attacker.id === selectedDnaCardId ? { ...f.attacker, ...changes } : f.attacker,
            blocker: f.blocker?.id === selectedDnaCardId ? { ...f.blocker, ...changes } : f.blocker
        })));
    };

    // ══════════════════════════════════════════════════════════════════
    // [2026-09-13 L1-B / L1-C] 升级进度：语义化编辑 + 一键达标
    //
    // 追踪"升级进度"的字段有两个，且都不直观：
    //   · strikeCount    —— 里芙（打击 2 次）
    //   · customProgress —— 卜卜(≥3) / 猫汐尔(≥30)
    //
    // ⚠️ customProgress 是【被多个系统共用的位域】：bit2 同时被
    //    "费用已降低标记"（equipment.ts）和"芬妮触发记录"（effectProcessor.ts）占用。
    //    直接赋值会污染其他位，故写值时统一保住 bit2。
    //
    // ⚠️ 等价性说明（重要）：这里直接设值属于「快照模式」。对【升级类 BUG】它与真机
    //    **等价** —— 因为 checkCardLevelUp 只看字段值，而升级流程本身走的是真实引擎
    //    （扫描 → 入队 → 播影片 → 改卡数据）。但若某个 BUG 依赖"达到该值的**路径副作用**"
    //    （如沿途设置的标记位），快照模式可能测不出来；此时请打开底部「守卫照跑」，
    //    并改用真实的出牌 / 进攻 / 格挡流程。
    // ══════════════════════════════════════════════════════════════════
    const levelUpMeta = useMemo(() => {
        const key = activeDnaCard?.key;
        if (!key) return null;
        if (key === 'lyfe') return { field: 'strikeCount' as const, label: '打击次数', target: 2, hint: '里芙：打击 2 次即可升级' };
        if (key === 'pupu_specular_soul') return { field: 'customProgress' as const, label: '目睹攻击水晶', target: 3, hint: '卜卜：场上目睹攻击敌方水晶 3 次' };
        if (key === 'mauxir_lotus_drive') return { field: 'customProgress' as const, label: '召唤伤害累计', target: 30, hint: '猫汐尔：友方召唤者与召唤物累计造成 30 点伤害' };
        if (key === 'fenny') return { field: 'nexus' as const, label: '水晶血量 ≤ 10', target: null, hint: '芬妮：任意一方水晶 ≤ 10 —— 请用底部「全局参数」直接调低水晶' };
        if (key === 'acacia_chrono_echo') return { field: 'flag' as const, label: '朔望之期已打出', target: null, hint: '安卡：需在对局中真实打出「朔望之期」才能标记升级' };
        return null;
    }, [activeDnaCard?.key]);

    /** 读当前升级进度（非进度型返回 0） */
    const currentProgress = useMemo(() => {
        if (!activeDnaCard || !levelUpMeta) return 0;
        if (levelUpMeta.field === 'strikeCount') return activeDnaCard.strikeCount || 0;
        if (levelUpMeta.field === 'customProgress') return activeDnaCard.customProgress || 0;
        return 0;
    }, [activeDnaCard, levelUpMeta]);

    /** 写升级进度 —— customProgress 保 bit2，避免污染其他语义位 */
    const writeProgress = (val: number) => {
        if (!activeDnaCard || !levelUpMeta) return;
        const v = Math.max(0, Math.floor(val) || 0);
        if (levelUpMeta.field === 'strikeCount') {
            updateDnaCard({ strikeCount: v });
        } else if (levelUpMeta.field === 'customProgress') {
            const preserved = (activeDnaCard.customProgress || 0) & 2;
            updateDnaCard({ customProgress: preserved | v });
        }
    };

    // ══════════════════════════════════════════════════════════════════
    // [2026-09-13 P3 特殊系统挂载] 装备 / 迷宫强化
    // ══════════════════════════════════════════════════════════════════

    /**
     * 装备挂载/卸载。
     * ⚠️ 挂载必须走 attachEquipment —— 它会连带处理减费标记（customProgress bit2）、
     *    关键词合并、数值增益与"减血保护"，直接改 equipment 数组会漏掉这些副作用，
     *    导致沙盒状态与真机不等价。
     */
    const toggleEquip = (equipId: string) => {
        if (!activeDnaCard) return;
        const has = activeDnaCard.equipment?.includes(equipId);
        if (has) {
            // 卸载只摘除 id；此前挂载产生的费用/关键词/增益改动不会自动还原
            // （需要干净卡面请点「重置卡面」）
            updateDnaCard({ equipment: (activeDnaCard.equipment || []).filter(id => id !== equipId) });
            setMessage(`已卸载装备 [${equipId}]（属性改动请用「重置卡面」还原）`);
        } else {
            const withEquip = attachEquipment(activeDnaCard, equipId);
            updateDnaCard({
                equipment: withEquip.equipment,
                cost: withEquip.cost,
                keywords: withEquip.keywords,
                buffs: withEquip.buffs,
                customProgress: withEquip.customProgress,
            });
            setMessage(`已挂载装备 [${equipId}]`);
        }
    };

    /** 把卡面重置回原始数据（保留实例 id）—— 一键撤销一切误改 */
    const resetCardToBase = () => {
        if (!activeDnaCard) return;
        const base = CARD_DB[activeDnaCard.key];
        if (!base) { setMessage('⚠️ 卡库中找不到该 key，无法重置'); return; }
        updateDnaCard({ ...(base as any), id: activeDnaCard.id });
        setMessage(`已把 [${base.name}] 重置为原始卡面`);
    };

    /** 迷宫强化挂载/卸载 —— 造"带强化打一场"的场景 */
    const toggleEnhancement = (side: 'player' | 'enemy', buffId: string) => {
        const field = side === 'player' ? 'rogueEnhancements' : 'enemyEnhancements';
        setGame(prev => {
            const cur = ((prev as any)[field] as string[] | undefined) || [];
            const next = cur.includes(buffId) ? cur.filter(id => id !== buffId) : [...cur, buffId];
            return { ...prev, [field]: next } as any;
        });
    };

    // ══════════════════════════════════════════════════════════════════
    // [2026-09-13 P4 场景快照] 一键保存 / 还原整个沙盒场景
    //
    // 用途：复现出一个 BUG 场景后**存下来** —— 改完代码再载回去验证修没修好；
    //       也可以把 JSON 发给别人帮忙分析。这是「复现 → 修复 → 回归」的闭环。
    // 涵盖：GameState + 双方手牌 / 备战席 / 交战区 / 牌库。
    // ══════════════════════════════════════════════════════════════════
    const captureSnapshot = () => {
        const snap = {
            _v: 1,
            game,
            playerHand, enemyHand,
            playerBench, enemyBench,
            combatField,
            playerDeck, enemyDeck: enemyDeckState,
        };
        setSnapshotText(JSON.stringify(snap));
        setMessage('📸 快照已生成 —— 复制下方文本即可保存 / 分享');
    };

    const restoreSnapshot = () => {
        if (!snapshotText.trim()) { setMessage('⚠️ 快照文本为空'); return; }
        try {
            const snap = JSON.parse(snapshotText);
            if (snap.game) setGame(snap.game);
            if (snap.playerHand) setPlayerHand(snap.playerHand);
            if (snap.enemyHand) setEnemyHand(snap.enemyHand);
            if (snap.playerBench) setPlayerBench(snap.playerBench);
            if (snap.enemyBench) setEnemyBench(snap.enemyBench);
            if (snap.combatField) setCombatField(snap.combatField);
            if (snap.playerDeck) setPlayerDeck(snap.playerDeck);
            if (snap.enemyDeck) setEnemyDeckState(snap.enemyDeck);
            setMessage('✅ 快照已还原');
        } catch (e) {
            setMessage('❌ 快照解析失败 —— 请检查 JSON 是否完整');
        }
    };

    const handleSandboxCardClick = (card: CardData, location: string, owner: string) => {
        if (spellSystem.isCasting) {
            spellSystem.handleTargetClick(card, owner as 'player' | 'enemy');
            return;
        }

        if (sandboxIdentity === 'enemy' && location === 'hand' && owner === 'enemy') {
            if (card.type.includes('unit')) actions.playCard(card, 'enemy');
            else actions.finalizeSpell(card, 'enemy', []);
            return;
        }

        if (sandboxIdentity === 'player' && location === 'hand' && owner === 'player') {
            if (card.type.includes('spell') && card.effects && card.effects.length > 0) {
                spellSystem.startCasting(card);
                actions.startSpellCasting(card);
            } else {
                actions.playCard(card, 'player');
            }
            return;
        }

        if (game.phase === 'attack_declare') {
            if (location === 'enemy_bench' || location === 'bench') {
                if ((sandboxIdentity === 'player' && owner === 'player') ||
                    (sandboxIdentity === 'enemy' && owner === 'enemy')) {
                    actions.toggleAttacker(card, true);
                }
            } else if (location === 'combat') {
                actions.toggleAttacker(card, false);
            }
        }
        else if (game.phase === 'block_declare') {
            const defender = game.turnOwner === 'player' ? 'enemy' : 'player';
            if (sandboxIdentity === defender && location.includes('bench') && owner === defender) {
                actions.selectBlocker(card.id);
            }
        }
    };

    // --- 动态还原真实操作大按钮 ---
    const renderActionButton = () => {
        let text = "PASS";
        let colorClass = "bg-slate-700 text-gray-400 border-gray-600 hover:bg-slate-600";
        let action = actions.passTurn;

        if (game.phase === 'main') {
            if (sandboxIdentity === 'player' && game.attackToken.player) {
                text = "ATTACK"; colorClass = "bg-orange-600 text-white border-orange-400 hover:bg-orange-500 shadow-[0_0_20px_rgba(234,88,12,0.6)]"; action = actions.initiateAttack;
            } else if (sandboxIdentity === 'enemy' && game.attackToken.enemy) {
                 text = "ATTACK"; colorClass = "bg-red-600 text-white border-red-400 hover:bg-red-500 shadow-[0_0_20px_rgba(220,38,38,0.6)]"; action = actions.initiateAttack;
            }
        } else if (game.phase === 'attack_declare') {
            text = "COMMIT"; colorClass = "bg-green-600 text-white border-green-400 hover:bg-green-500 shadow-[0_0_20px_rgba(22,163,74,0.6)]"; action = actions.commitAttack;
        } else if (game.phase === 'block_declare') {
            text = "BLOCK"; colorClass = "bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.6)]"; action = actions.resolveCombatAnimation;
        } else if (game.spellStack.length > 0 && game.phase !== 'animating') {
            text = "RESOLVE"; colorClass = "bg-cyan-600 text-white border-cyan-400 hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.6)]"; action = actions.resolveStack;
        }

        return (
            <button
                onClick={action}
                // [修复] 尺寸改回实战中的 36x36 (144px)，重现压迫感
                className={`w-36 h-36 rounded-full border-[3px] font-black text-xl tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center justify-center ${colorClass}`}
            >
                {text}
            </button>
        );
    };

    return (
        // [核心修复] 将容器改为 fixed inset-0 z-[1000]，彻底覆盖在 GM STUDIO 侧边栏之上
        // 这样沙盒就拥有了完整的 100vw 屏幕宽度，下方的控制台和中间的牌桌将绝对居中！左侧抽屉也不会被挤压！
        <div className="fixed inset-0 z-[1000] bg-[#0a0a0a] text-white overflow-hidden font-sans select-none">

            {/* ================= PANEL 2: 中央全真实态舞台 (Arena) ================= */}
            {/* [修复] 中间面板设为 absolute inset-0，确保它永远铺满全屏，绝不会被抽屉挤压 */}
            <div className="absolute inset-0 flex flex-col z-10">
                <VFXLayer isCasting={spellSystem.isCasting} selectedTargets={spellSystem.selectedTargets} />

                {/* [修复] 还原清透的真实背景亮度 */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <img src={PERSONALIZATION_ASSETS.desks[0]} className="w-full h-full object-cover" alt="棋盘" />
                    <div className="absolute inset-0 bg-black/20"></div>
                </div>

                {/* 还原敌我 Nexus 水晶 */}
                <div className="absolute top-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full">
                    <SmartNexus health={game.enemyNexus} maxHealth={20} isEnemy={true} />
                </div>
                <div className="absolute bottom-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full">
                    <SmartNexus health={game.playerNexus} maxHealth={20} isEnemy={false} />
                </div>

                {/* --- B. 中间战场层 (限制宽度 w-[65%]，完美居中) --- */}
                {/* [修复] 移除了所有多余的 bg-black/20 等黑膜与模糊效果，保持和实战完全一致的透明度 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-[65%] flex flex-col z-10 pointer-events-none">

                    <div className="h-32 flex justify-center items-start pt-2 gap-[-20px] pointer-events-auto relative -mt-12">
                        <div className="absolute top-2 left-4 text-red-500/50 font-black tracking-widest text-sm">ENEMY HAND</div>
                        {enemyHand.map(c => (
                            <div key={c.id} onContextMenu={(e) => handleDnaSelect(e, c)} className="hover:-translate-y-4 transition-transform z-10 mt-14">
                                <Card data={c} location="hand" isFaceUp={true} onClick={() => handleSandboxCardClick(c, 'hand', 'enemy')} />
                            </div>
                        ))}
                    </div>

                    <div className="h-40 flex justify-center items-center gap-4 relative z-0 pointer-events-auto">
                        {enemyBench.map(c => (
                            <div key={c.id} onContextMenu={(e) => handleDnaSelect(e, c)}>
                                <Card
                                    data={c} location="enemy_bench"
                                    canBeChallenged={game.phase === 'attack_declare' && game.selectedChallengerId !== null}
                                    onClick={() => {
                                        if (game.phase === 'attack_declare' && game.selectedChallengerId) {
                                            actions.challengeEnemy(game.selectedChallengerId, c.id);
                                        } else handleSandboxCardClick(c, 'enemy_bench', 'enemy');
                                    }}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'enemy')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 relative flex flex-col justify-center pointer-events-auto">
                        {game.spellStack.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                <div className="flex gap-4 pointer-events-auto scale-125">
                                    {game.spellStack.map((item) => (
                                        <div key={item.card.id} onContextMenu={(e) => handleDnaSelect(e, item.card)}>
                                            <Card data={item.card} location="spell_stack" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <Battlefield
                            combatField={combatField} phase={game.phase} turnOwner={game.turnOwner} selectedBlockerId={game.selectedBlockerId}
                            onCombatClick={(i) => {
                                if (game.phase === 'block_declare' && game.selectedBlockerId) actions.assignBlocker(i, game.selectedBlockerId);
                                else if (game.phase === 'block_declare' && combatField[i].blocker) actions.recallBlocker(i);
                            }}
                            onCardClick={(c, l, o) => handleSandboxCardClick(c, l, o)}
                            onViewArt={() => {}} speakingCardId={null} selectedChallengerId={game.selectedChallengerId} onChallengerClick={actions.selectChallenger}
                        />
                    </div>

                    <div className="h-40 flex justify-center items-center gap-4 z-10 relative pointer-events-auto">
                        {playerBench.map(c => (
                            <div key={c.id} onContextMenu={(e) => handleDnaSelect(e, c)}>
                                <Card
                                    data={c} location="bench" isSelected={game.selectedBlockerId === c.id}
                                    highlightTarget={game.phase === 'attack_declare' || game.phase === 'block_declare'}
                                    isBlocking={game.phase === 'block_declare'}
                                    onClick={() => handleSandboxCardClick(c, 'bench', 'player')}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'player')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="h-36 flex justify-center items-end pb-4 gap-[-20px] pointer-events-auto relative">
                        <div className="absolute bottom-2 left-4 text-blue-500/50 font-black tracking-widest text-sm">PLAYER HAND</div>
                        {playerHand.map(c => (
                            <div key={c.id} onContextMenu={(e) => handleDnaSelect(e, c)} className="hover:-translate-y-8 transition-transform z-10">
                                <Card data={c} location="hand" isFaceUp={true} onClick={() => handleSandboxCardClick(c, 'hand', 'player')} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* --- [修复] 右侧 UI 层 (1:1 完美复刻 GameSession) --- */}
                <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
                    {/* 1. 核心按钮层 */}
                    <div className="absolute top-[47.5%] right-[7.5%] -translate-y-1/2 pointer-events-auto z-10 flex flex-col items-center gap-2">
                        {renderActionButton()}
                        <div className="text-center text-xs text-gray-400 bg-black/60 px-2 py-1 rounded max-w-[150px] whitespace-nowrap mt-2">
                            {message}
                        </div>
                    </div>

                    {/* 2. 水晶盘底座 */}
                    <div className="absolute top-[48%] right-[5%] -translate-y-1/2 z-20 flex items-center justify-center">
                        <div className="relative">
                            <img src={UI_IMAGES.buttonContainer} className="w-[275px] max-w-none h-auto object-contain opacity-100 drop-shadow-2xl" alt="控制面板" style={{ transform: 'translateX(30px) translateY(0px)' }} />
                            <div className="absolute inset-0 z-30" style={{ transform: 'translateX(30px) translateY(0px)' }}>
                                <ManaGemSystem currentMana={game.playerMana} maxMana={game.playerMaxMana} spellMana={game.playerSpellMana} previewManaCost={0} previewSpellManaCost={0} isPlayer={true} round={game.round} />
                                <ManaGemSystem currentMana={game.enemyMana} maxMana={game.enemyMaxMana} spellMana={game.enemySpellMana} previewManaCost={0} previewSpellManaCost={0} isPlayer={false} round={game.round} />
                            </div>
                        </div>
                    </div>

                    {/* 3. [修复] 补回丢失的进攻令牌 (Attack Token) 图层！ */}
                    {game.attackToken.enemy && (
                        <div className="absolute z-40 animate-pulse drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] top-[22.5%] right-[13%]">
                            <img src={game.attackToken.enemy === 'rally' ? UI_IMAGES.swordGain : UI_IMAGES.sword} alt="敌方攻击指示物" className="w-[80px] h-auto object-contain transform rotate-180" />
                        </div>
                    )}
                    {game.attackToken.player && (
                        <div className="absolute z-40 animate-pulse drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] bottom-[27.5%] right-[13%]">
                            <img src={game.attackToken.player === 'rally' ? UI_IMAGES.swordGain : UI_IMAGES.sword} alt="玩家攻击指示物" className="w-[80px] h-auto object-contain" />
                        </div>
                    )}

                    {/* 4. 精准法力数值 */}
                    <div className="absolute top-[36.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[-15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{game.enemySpellMana}</span>
                    </div>
                    <div className="absolute top-[37.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{game.enemyMana}</span>
                    </div>
                    <div className="absolute bottom-[41.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{game.playerMana}</span>
                    </div>
                    <div className="absolute bottom-[40.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{game.playerSpellMana}</span>
                    </div>
                </div>

                {/* 退出按钮 */}
                <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 bg-black/60 rounded-md border border-white/20 hover:bg-red-600 transition-colors">
                    <X size={20}/>
                </button>
            </div>

            {/* ================= PANEL 1: 左侧造物兵工厂 (Armory) ================= */}
            {/* [修复] 使用绝对定位并通过 X 轴平移来实现抽屉，彻底解决按钮不随动的问题 */}
            <motion.div
                initial={false}
                animate={{ x: isArmoryOpen ? 0 : -400 }}
                className="absolute left-0 top-0 h-full w-[400px] bg-slate-950 border-r border-white/10 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-40 flex flex-col"
            >
                <div className="p-4 border-b border-white/10 bg-black/40">
                    <h2 className="text-xl font-black tracking-widest text-blue-400 mb-4 flex items-center gap-2">
                        <PlusCircle size={20}/> THE ARMORY
                    </h2>
                    <div className="flex bg-slate-800 rounded-md p-1 mb-2">
                        <button onClick={()=>setSpawnTarget('player')} className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-all ${spawnTarget==='player' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}>发送至我方</button>
                        <button onClick={()=>setSpawnTarget('enemy')} className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-all ${spawnTarget==='enemy' ? 'bg-red-600 text-white shadow-md' : 'text-gray-400'}`}>发送至敌方</button>
                    </div>
                    {/* [2026-09-13 P0 区域补齐] 落点选择：对局里实体能去的所有区域 */}
                    <div className="flex flex-wrap bg-slate-800 rounded-md p-1 mb-4 gap-1 items-center">
                        <span className="text-[10px] text-gray-500 font-black px-1 shrink-0">落点</span>
                        {SPAWN_LOCATIONS.map(([loc, label]) => (
                            <button key={loc} onClick={()=>setSpawnLocation(loc)}
                                className={`px-2 py-1 text-[11px] font-bold rounded-sm transition-all ${spawnLocation===loc ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-300'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input type="text" placeholder="搜索..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} className="w-full bg-slate-800 rounded py-1.5 pl-8 pr-2 text-xs focus:outline-none" />
                        </div>
                        <div className="flex gap-1 bg-slate-800 p-1 rounded">
                            <button onClick={()=>setCategory('HERO')} className={`p-1 rounded-sm ${category==='HERO'?'bg-yellow-600 text-white':'text-gray-500'}`}><User size={14}/></button>
                            <button onClick={()=>setCategory('SPELL')} className={`p-1 rounded-sm ${category==='SPELL'?'bg-blue-600 text-white':'text-gray-500'}`}><Zap size={14}/></button>
                            <button onClick={()=>setCategory('UNIT')} className={`p-1 rounded-sm ${category==='UNIT'?'bg-orange-600 text-white':'text-gray-500'}`}><Box size={14}/></button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-4 gap-3 auto-rows-[minmax(120px,auto)] custom-scrollbar">
                    {filteredCards.map(c => (
                        <div
                            key={c.key} onClick={() => handleSpawnCard(c.key)}
                            className="relative group cursor-pointer hover:scale-105 transition-transform aspect-[3/4] rounded-md overflow-hidden border-2 border-slate-700 hover:border-blue-500 shadow-md bg-slate-800"
                        >
                            <img src={c.imageUrl} className="w-full h-full object-cover" alt={c.name} draggable={false} />
                            <div className="absolute bottom-0 left-0 w-full bg-black/80 px-1 py-0.5 text-[8px] font-mono truncate text-white/80">{c.name.replace('\n', ' ')}</div>
                            <div className="absolute inset-0 bg-blue-500/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]"><PlusCircle size={28} className="text-white drop-shadow-md" /></div>
                        </div>
                    ))}
                </div>
                {/* 完美随动的开关按钮 */}
                <button
                    onClick={() => setIsArmoryOpen(!isArmoryOpen)}
                    className="absolute -right-6 top-[30%] -translate-y-1/2 w-6 h-20 bg-slate-800 rounded-r-md border-y border-r border-white/20 flex items-center justify-center hover:bg-blue-600 transition-colors shadow-[5px_0_10px_rgba(0,0,0,0.3)]"
                >
                    {isArmoryOpen ? <ChevronLeft size={16}/> : <ChevronRight size={16}/>}
                </button>
            </motion.div>

            {/* ================= PANEL 3: 右侧基因改造台 (DNA Editor) ================= */}
            {/* [修复] 使用绝对定位并通过 X 轴平移来实现抽屉，右侧面板完美脱离文档流 */}
            <motion.div
                initial={false}
                animate={{ x: isDnaOpen ? 0 : 360 }}
                className="absolute right-0 top-0 h-full w-[360px] bg-slate-900 border-l border-white/10 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-40 flex flex-col"
            >
                <div className="p-4 border-b border-white/10 bg-black/40 flex justify-between items-center">
                    <h2 className="text-xl font-black tracking-widest text-green-400 flex items-center gap-2">
                        <Target size={20}/> DNA EDITOR
                    </h2>
                    <button onClick={()=>setIsDnaOpen(false)} className="text-gray-400 hover:text-white"><X size={20}/></button>
                </div>

                {!activeDnaCard ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-sm px-8 text-center leading-loose">
                        RIGHT CLICK ANY CARD ON THE BOARD TO EDIT ITS DNA
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
                        <div className="flex justify-center scale-90 origin-top">
                            <Card data={activeDnaCard} location="bench" isFaceUp={true} />
                        </div>
                        <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-white/5">
                            <h3 className="text-xs font-black tracking-widest text-gray-500 mb-2">BASE STATS (面板覆写)</h3>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-yellow-500 font-bold mb-1">POWER</label>
                                    <input type="number" value={activeDnaCard.power} onChange={(e) => updateDnaCard({ power: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 rounded px-3 py-2 text-lg font-black focus:outline-none focus:ring-1 focus:ring-yellow-500" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-red-500 font-bold mb-1">HEALTH</label>
                                    <input type="number" value={activeDnaCard.health} onChange={(e) => updateDnaCard({ health: parseInt(e.target.value) || 1, maxHealth: Math.max(activeDnaCard.maxHealth, parseInt(e.target.value) || 1) })} className="w-full bg-slate-800 rounded px-3 py-2 text-lg font-black focus:outline-none focus:ring-1 focus:ring-red-500" />
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-gray-400 font-bold mb-1">DAMAGE TAKEN</label>
                                    <input type="number" value={activeDnaCard.damageTaken || 0} onChange={(e) => updateDnaCard({ damageTaken: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-blue-400 font-bold mb-1">COST</label>
                                    <input type="number" value={activeDnaCard.cost} onChange={(e) => updateDnaCard({ cost: parseInt(e.target.value) || 0 })} className="w-full bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" />
                                </div>
                            </div>
                        </div>

                        {/* [2026-09-13 L1-B] 运行时状态：这些字段不在卡面上，却决定引擎行为 */}
                        <div className="space-y-4 bg-black/20 p-4 rounded-xl border border-white/5">
                            <h3 className="text-xs font-black tracking-widest text-gray-500 mb-2">RUNTIME STATE (运行时状态)</h3>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-purple-400 font-bold mb-1">LEVEL</label>
                                    <div className="flex bg-slate-800 rounded p-1 gap-1">
                                        {[1, 2].map(lv => (
                                            <button key={lv} onClick={() => updateDnaCard({ level: lv })}
                                                className={`flex-1 py-1 text-xs font-black rounded-sm transition-all ${(activeDnaCard.level || 1) === lv ? 'bg-purple-600 text-white' : 'text-gray-500'}`}>
                                                Lv{lv}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-orange-400 font-bold mb-1">STRIKE COUNT</label>
                                    <input type="number" value={activeDnaCard.strikeCount || 0}
                                        onChange={(e) => updateDnaCard({ strikeCount: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-orange-500" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] text-cyan-400 font-bold mb-1">ABILITY CHARGES (能力充能)</label>
                                <input type="number" value={activeDnaCard.abilityCharges ?? 0}
                                    onChange={(e) => updateDnaCard({ abilityCharges: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-cyan-500" />
                            </div>
                            <div>
                                <label className="block text-[10px] text-green-400 font-bold mb-1">PERMANENT BUFFS (永久增益 +P / +H)</label>
                                <div className="flex gap-2">
                                    <input type="number" value={activeDnaCard.buffs?.power || 0}
                                        onChange={(e) => updateDnaCard({ buffs: { power: parseInt(e.target.value) || 0, health: activeDnaCard.buffs?.health || 0 } })}
                                        className="flex-1 bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" placeholder="+P" />
                                    <input type="number" value={activeDnaCard.buffs?.health || 0}
                                        onChange={(e) => updateDnaCard({ buffs: { power: activeDnaCard.buffs?.power || 0, health: parseInt(e.target.value) || 0 } })}
                                        className="flex-1 bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" placeholder="+H" />
                                </div>
                            </div>

                            {/* [2026-09-13 P1] 回合增益 / 动画状态 / 死亡标记 */}
                            <div>
                                <label className="block text-[10px] text-pink-400 font-bold mb-1">ROUND BUFFS (回合增益 +P / +H)</label>
                                <div className="flex gap-2">
                                    <input type="number" value={activeDnaCard.roundBuffs?.power || 0}
                                        onChange={(e) => updateDnaCard({ roundBuffs: { power: parseInt(e.target.value) || 0, health: activeDnaCard.roundBuffs?.health || 0 } })}
                                        className="flex-1 bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" placeholder="+P" />
                                    <input type="number" value={activeDnaCard.roundBuffs?.health || 0}
                                        onChange={(e) => updateDnaCard({ roundBuffs: { power: activeDnaCard.roundBuffs?.power || 0, health: parseInt(e.target.value) || 0 } })}
                                        className="flex-1 bg-slate-800 rounded px-3 py-1 text-sm font-bold focus:outline-none" placeholder="+H" />
                                </div>
                            </div>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-red-400 font-bold mb-1">ANIM STATE (动画/生死状态)</label>
                                    <select value={activeDnaCard.animState || 'idle'}
                                        onChange={(e) => updateDnaCard({ animState: e.target.value as any })}
                                        className="w-full bg-slate-800 rounded px-2 py-1 text-xs font-bold focus:outline-none">
                                        {ANIM_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="shrink-0">
                                    <label className="block text-[10px] text-red-400 font-bold mb-1">IS DEAD</label>
                                    <button onClick={() => updateDnaCard({ isDead: !activeDnaCard.isDead })}
                                        className={`px-3 py-1 text-xs font-black rounded transition-all ${activeDnaCard.isDead ? 'bg-red-600 text-white' : 'bg-slate-700 text-gray-400'}`}>
                                        {String(!!activeDnaCard.isDead)}
                                    </button>
                                </div>
                            </div>

                            {/* [2026-09-13 P3] 装备挂载 —— 走 attachEquipment，减费标记等副作用齐全 */}
                            <div className="pt-2 border-t border-white/5">
                                <button onClick={() => setShowEquips(!showEquips)}
                                    className="w-full text-left text-[10px] font-black tracking-widest text-teal-500 hover:text-teal-300 transition-colors">
                                    {showEquips ? '▼' : '▶'} EQUIPMENT · 装备挂载
                                    {!!activeDnaCard.equipment?.length && (
                                        <span className="text-teal-400 font-normal ml-2">（已挂 {activeDnaCard.equipment.length} 件）</span>
                                    )}
                                </button>
                                {showEquips && (
                                    <div className="mt-2 space-y-2">
                                        <input value={equipSearch} onChange={(e) => setEquipSearch(e.target.value)}
                                            placeholder="搜索装备名 / id…"
                                            className="w-full bg-slate-800 rounded px-2 py-1 text-[11px] focus:outline-none" />
                                        <div className="max-h-[180px] overflow-y-auto custom-scrollbar space-y-1 pr-1">
                                            {EQUIPMENT_DEFS
                                                .filter(e => !equipSearch.trim() ||
                                                    e.name.toLowerCase().includes(equipSearch.toLowerCase()) ||
                                                    e.id.toLowerCase().includes(equipSearch.toLowerCase()))
                                                .map(e => {
                                                    const active = activeDnaCard.equipment?.includes(e.id);
                                                    return (
                                                        <button key={e.id} onClick={() => toggleEquip(e.id)}
                                                            className={`w-full text-left px-2 py-1 rounded text-[10px] transition-all border ${active
                                                                ? 'bg-teal-900/40 border-teal-500 text-teal-300'
                                                                : 'bg-slate-800/50 border-transparent text-gray-400 hover:bg-slate-700 hover:text-gray-200'}`}>
                                                            <span className="font-bold">{e.name}</span>
                                                            <span className="text-gray-600 ml-1 font-mono">{e.id}</span>
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* [2026-09-13 P3] 重置卡面 —— 一键撤销一切误改（保留实例 id） */}
                            <div className="pt-2 border-t border-white/5">
                                <button onClick={resetCardToBase}
                                    className="w-full py-1.5 bg-slate-800 hover:bg-red-900 text-gray-400 hover:text-white text-[10px] font-black rounded transition-colors">
                                    ↺ 重置卡面到原始数据
                                </button>
                            </div>

                            {/* [2026-09-13 P1] 通用字段编辑器 —— 兜底 CardData 的全部字段 */}
                            <div className="pt-2 border-t border-white/5">
                                <button onClick={() => setShowAllFields(!showAllFields)}
                                    className="w-full text-left text-[10px] font-black tracking-widest text-gray-500 hover:text-gray-300 transition-colors">
                                    {showAllFields ? '▼' : '▶'} ALL FIELDS · 通用字段编辑器
                                    <span className="text-gray-600 font-normal ml-2">
                                        (共 {Object.keys(activeDnaCard).filter(k => !HIDDEN_CARD_KEYS.has(k)).length} 项)
                                    </span>
                                </button>
                                {showAllFields && (
                                    <div className="mt-3 space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                                        {Object.keys(activeDnaCard).sort().filter(k => !HIDDEN_CARD_KEYS.has(k)).map(k => (
                                            <FieldRow key={k} fieldKey={k} value={(activeDnaCard as any)[k]}
                                                onChange={(v) => updateDnaCard({ [k]: v } as any)} />
                                        ))}
                                        <p className="text-[9px] text-gray-600 pt-2 leading-relaxed">
                                            数组用英文逗号分隔；对象只读展示（buffs / roundBuffs 请用上方专用控件）。
                                            任何新加的字段都会自动出现在这里，无需改沙盒代码。
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* [2026-09-13 L1-C] 升级进度（语义化 + 一键达标） */}
                        {levelUpMeta && (
                            <div className="space-y-3 bg-yellow-950/20 p-4 rounded-xl border border-yellow-500/20">
                                <h3 className="text-xs font-black tracking-widest text-yellow-500 mb-1">LEVEL-UP PROGRESS (升级进度)</h3>
                                <p className="text-[10px] text-gray-500 leading-relaxed">{levelUpMeta.hint}</p>
                                {levelUpMeta.target !== null ? (
                                    <>
                                        <div className="flex items-end gap-3">
                                            <div className="flex-1">
                                                <label className="block text-[10px] text-gray-400 font-bold mb-1">{levelUpMeta.label}</label>
                                                <input type="number" value={currentProgress}
                                                    onChange={(e) => writeProgress(parseInt(e.target.value) || 0)}
                                                    className="w-full bg-slate-800 rounded px-3 py-1.5 text-sm font-black focus:outline-none focus:ring-1 focus:ring-yellow-500" />
                                            </div>
                                            <span className="text-xs text-gray-500 pb-2">/ {levelUpMeta.target}</span>
                                        </div>
                                        <button onClick={() => writeProgress(levelUpMeta.target as number)}
                                            className={`w-full py-2 rounded-md text-xs font-black tracking-wider transition-all ${currentProgress >= (levelUpMeta.target as number)
                                                ? 'bg-yellow-600 text-white'
                                                : 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/40 hover:bg-yellow-600/40'}`}>
                                            ⚡ 一键达标（设为 {levelUpMeta.target}）
                                        </button>
                                        {currentProgress >= (levelUpMeta.target as number) && (
                                            <p className="text-[10px] text-yellow-400 font-bold text-center leading-relaxed">
                                                ✓ 已达标 —— 引擎的升级扫描会接走它<br />
                                                <span className="text-gray-500">（提示：升级扫描只检查【备战席】，请把天启者放在备战席上）</span>
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-[10px] text-gray-300 font-bold leading-relaxed">⚠ 此英雄的升级条件无法在此模拟</p>
                                )}
                            </div>
                        )}

                        <div>
                            <h3 className="text-xs font-black tracking-widest text-gray-500 mb-3">KEYWORDS (词条热插拔)</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {ALL_KEYWORDS.map(kw => {
                                    const hasKeyword = activeDnaCard.keywords.includes(kw);
                                    return (
                                        <button
                                            key={kw}
                                            onClick={() => {
                                                const newKws = hasKeyword
                                                    ? activeDnaCard.keywords.filter(k => k !== kw)
                                                    : [...activeDnaCard.keywords, kw];
                                                updateDnaCard({ keywords: newKws });
                                            }}
                                            className={`px-3 py-2 rounded-md text-xs font-bold text-left transition-all border ${hasKeyword ? 'bg-green-900/40 border-green-500 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-slate-800/50 border-transparent text-gray-500 hover:bg-slate-700 hover:text-gray-300'}`}
                                        >
                                            {kw}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 完美随动的开关按钮 */}
                <button
                    onClick={() => setIsDnaOpen(!isDnaOpen)}
                    className="absolute -left-6 top-[30%] -translate-y-1/2 w-6 h-20 bg-slate-800 rounded-l-md border-y border-l border-white/20 flex items-center justify-center hover:bg-green-600 transition-colors shadow-[-5px_0_10px_rgba(0,0,0,0.3)]"
                >
                    {isDnaOpen ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
                </button>
            </motion.div>

            {/* ================= 底部：上帝控制台抽屉 (Console Drawer) ================= */}
            {/* [修复] 支持向下收起的控制台抽屉，让出底部视野 */}
            <motion.div
                initial={false}
                animate={{ y: isConsoleOpen ? 0 : 380 }}
                className="absolute bottom-0 left-0 w-full z-50 flex flex-col items-center pointer-events-none"
            >
                {/* 下沉/弹起 拉环开关 */}
                <button
                    onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                    className="pointer-events-auto bg-slate-900/95 border-t border-x border-white/20 px-6 py-1.5 rounded-t-xl text-gray-400 hover:text-white flex items-center gap-2 text-[10px] font-black tracking-[0.2em] backdrop-blur-md transition-colors shadow-[0_-5px_15px_rgba(0,0,0,0.3)]"
                >
                    {isConsoleOpen ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}
                    DIRECTOR'S CONSOLE
                </button>

                {/* 控制台主体面板 (固定高度 200px) */}
                <div className="bg-slate-900/95 backdrop-blur-md border border-white/20 rounded-t-xl rounded-b-none p-5 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] flex flex-col gap-3 w-[880px] h-[380px]">
                    <div className="flex justify-between items-center px-2">
                        <span className="text-xs font-mono text-gray-400 tracking-widest">PHASE: <span className="text-white font-bold">{game.phase.toUpperCase()}</span></span>
                        <span className="text-xs font-mono text-yellow-400">{message}</span>
                    </div>

                    <div className="flex gap-2">
                        <div className="flex bg-black rounded-lg p-1 border border-white/10">
                            <button onClick={()=>setSandboxIdentity('player')} className={`px-4 py-2 text-sm font-black rounded transition-all ${sandboxIdentity==='player'?'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]':'text-gray-500'}`}>扮演玩家</button>
                            <button onClick={()=>setSandboxIdentity('enemy')} className={`px-4 py-2 text-sm font-black rounded transition-all ${sandboxIdentity==='enemy'?'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]':'text-gray-500'}`}>扮演敌方</button>
                        </div>
                        {/* 强制操作面板：避免大按钮不够用时的兜底操作 */}
                        <div className="flex-1 flex gap-2">
                            {game.phase === 'attack_declare' && (
                                <button onClick={() => setGame(p=>({...p, phase: 'main'}))} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-black flex items-center justify-center gap-2"><X size={16}/> 取消进攻</button>
                            )}
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        [2026-09-13 L1-D] 全局参数：水晶 / 法力 / 回合 / 阶段
                        —— 让"水晶 ≤ 10 触发升级"（芬妮）这类条件可以直接构造，
                        不必先真刀真枪把水晶打到 10。
                        ══════════════════════════════════════════════════════════ */}
                    <div className="flex flex-wrap gap-2 items-center bg-black/30 rounded-lg px-3 py-2 text-[10px]">
                        <span className="text-gray-500 font-black tracking-wider">水晶</span>
                        <input type="number" value={game.playerNexus} title="我方水晶"
                            onChange={(e)=>setGame(p=>({...p, playerNexus: Math.max(0, parseInt(e.target.value)||0)}))}
                            className="w-14 bg-slate-800 rounded px-2 py-0.5 font-bold text-blue-300 focus:outline-none" />
                        <input type="number" value={game.enemyNexus} title="敌方水晶"
                            onChange={(e)=>setGame(p=>({...p, enemyNexus: Math.max(0, parseInt(e.target.value)||0)}))}
                            className="w-14 bg-slate-800 rounded px-2 py-0.5 font-bold text-red-300 focus:outline-none" />
                        <span className="text-gray-500 font-black tracking-wider ml-1">法力</span>
                        <input type="number" value={game.playerMana} title="我方法力（同时抬上限）"
                            onChange={(e)=>{const v=Math.max(0, parseInt(e.target.value)||0); setGame(p=>({...p, playerMana: v, playerMaxMana: v}));}}
                            className="w-14 bg-slate-800 rounded px-2 py-0.5 font-bold text-blue-300 focus:outline-none" />
                        <input type="number" value={game.enemyMana} title="敌方法力（同时抬上限）"
                            onChange={(e)=>{const v=Math.max(0, parseInt(e.target.value)||0); setGame(p=>({...p, enemyMana: v, enemyMaxMana: v}));}}
                            className="w-14 bg-slate-800 rounded px-2 py-0.5 font-bold text-red-300 focus:outline-none" />
                        <span className="text-gray-500 font-black tracking-wider ml-1">回合</span>
                        <input type="number" value={game.round}
                            onChange={(e)=>setGame(p=>({...p, round: Math.max(1, parseInt(e.target.value)||1)}))}
                            className="w-14 bg-slate-800 rounded px-2 py-0.5 font-bold focus:outline-none" />
                        <span className="text-gray-500 font-black tracking-wider ml-1">阶段</span>
                        <select value={game.phase}
                            onChange={(e)=>setGame(p=>({...p, phase: e.target.value as any}))}
                            className="bg-slate-800 rounded px-2 py-0.5 font-bold focus:outline-none">
                            <option value="main">main</option>
                            <option value="attack_declare">attack_declare</option>
                            <option value="block_declare">block_declare</option>
                            <option value="react_to_block">react_to_block</option>
                        </select>

                        {/* [2026-09-13 L2-A] 守卫显式开关
                            默认「关闭」= 自由造场；打开后真机守卫（如交战区不变量守卫）照跑，
                            行为与真机一致 —— 用于排查"守卫本身引发"的 BUG。 */}
                        <button onClick={() => actions.setSandboxGuard(!actions.sandboxGuardEnabled)}
                            title="打开后，沙盒里的真机守卫照常执行，行为与真机一致（排查守卫类 BUG 必开）"
                            className={`ml-auto px-3 py-1 rounded font-black transition-all ${actions.sandboxGuardEnabled
                                ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                                : 'bg-slate-800 text-gray-500 hover:text-gray-300'}`}>
                            🛡 守卫：{actions.sandboxGuardEnabled ? '照跑（贴近真机）' : '关闭（自由造场）'}
                        </button>
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        [2026-09-13 P3] 迷宫强化挂载 —— 造"带强化打一场"的场景
                        数据源：buffs.ts 的 PLAYER_ENHANCEMENTS / ENEMY_ELIGIBLE_BUFFS
                        ══════════════════════════════════════════════════════════ */}
                    <div className="border-t border-white/5 pt-2">
                        <button onClick={() => setShowEnhancements(!showEnhancements)}
                            className="w-full text-left text-[10px] font-black tracking-widest text-gray-500 hover:text-gray-300 transition-colors">
                            {showEnhancements ? '▼' : '▶'} MAZE BUFFS · 迷宫强化挂载
                            <span className="text-gray-600 font-normal ml-2">
                                （我方 {game.rogueEnhancements?.length || 0} / 敌方 {game.enemyEnhancements?.length || 0}）
                            </span>
                        </button>
                        {showEnhancements && (
                            <div className="mt-2 grid grid-cols-2 gap-4">
                                {(['player', 'enemy'] as const).map(side => {
                                    const label = side === 'player' ? '我方强化' : '敌方强化';
                                    const list = side === 'player' ? PLAYER_ENHANCEMENTS : ENEMY_ELIGIBLE_BUFFS;
                                    const cur = side === 'player' ? game.rogueEnhancements : game.enemyEnhancements;
                                    return (
                                        <div key={side}>
                                            <div className="text-[10px] font-black text-gray-500 mb-1">{label}</div>
                                            <div className="max-h-[110px] overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
                                                {list.map(b => {
                                                    const active = cur?.includes(b.id);
                                                    return (
                                                        <button key={b.id} onClick={() => toggleEnhancement(side, b.id)}
                                                            title={b.description}
                                                            className={`w-full text-left px-2 py-0.5 rounded text-[10px] transition-all border ${active
                                                                ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                                                                : 'bg-slate-800/50 border-transparent text-gray-500 hover:bg-slate-700 hover:text-gray-300'}`}>
                                                            {b.name}
                                                        </button>
                                                    );
                                                })}
                                                {list.length === 0 && <p className="text-[10px] text-gray-600">（空）</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        [2026-09-13 P2 全局参数补齐] GameState 全字段编辑器
                        —— 复用通用 FieldRow：简单字段直接可改（turnOwner / consecutivePasses /
                        飞剑计数 / 水晶屏障 …），复杂字段（实体数组、法术堆叠）只读展示。
                        任何未来新增的 GameState 字段都会自动出现，无需改沙盒代码。
                        ══════════════════════════════════════════════════════════ */}
                    <div className="border-t border-white/5 pt-2">
                        <button onClick={() => setShowAllGameFields(!showAllGameFields)}
                            className="w-full text-left text-[10px] font-black tracking-widest text-gray-500 hover:text-gray-300 transition-colors">
                            {showAllGameFields ? '▼' : '▶'} GAME STATE · 全局字段编辑器
                            <span className="text-gray-600 font-normal ml-2">（完整 GameState，任何字段都在这里）</span>
                        </button>
                        {showAllGameFields && (
                            <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                                {Object.keys(game).sort().map(k => (
                                    <FieldRow key={k} fieldKey={k} value={(game as any)[k]}
                                        onChange={(v) => setGame(prev => ({ ...prev, [k]: v } as any))} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        [2026-09-13 P4] 场景快照 —— 复现出的 BUG 场景可保存 / 还原
                        ══════════════════════════════════════════════════════════ */}
                    <div className="border-t border-white/5 pt-2">
                        <button onClick={() => setShowSnapshot(!showSnapshot)}
                            className="w-full text-left text-[10px] font-black tracking-widest text-gray-500 hover:text-gray-300 transition-colors">
                            {showSnapshot ? '▼' : '▶'} SNAPSHOT · 场景快照
                            <span className="text-gray-600 font-normal ml-2">（保存 / 还原整个沙盒场景）</span>
                        </button>
                        {showSnapshot && (
                            <div className="mt-2 space-y-2">
                                <div className="flex gap-2">
                                    <button onClick={captureSnapshot}
                                        className="flex-1 py-1.5 bg-amber-700/60 hover:bg-amber-600 text-white text-[10px] font-black rounded transition-colors">
                                        📸 生成快照
                                    </button>
                                    <button onClick={restoreSnapshot}
                                        className="flex-1 py-1.5 bg-emerald-700/60 hover:bg-emerald-600 text-white text-[10px] font-black rounded transition-colors">
                                        ↺ 载入快照
                                    </button>
                                </div>
                                <textarea value={snapshotText} onChange={(e) => setSnapshotText(e.target.value)}
                                    placeholder="把快照 JSON 粘贴到这里，点「载入快照」还原场景……"
                                    spellCheck={false}
                                    className="w-full h-[80px] bg-black/40 rounded px-2 py-1 text-[9px] font-mono text-gray-400 focus:outline-none resize-none custom-scrollbar" />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 mt-auto">
                        <button onClick={() => actions.startRound()} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><FastForward size={14}/> 新回合</button>
                        <button onClick={() => {
                            if (sandboxIdentity === 'player') setGame(p=>({...p, playerMana: 10, playerMaxMana: 10, playerSpellMana: 3, playerNexus: 20}));
                            else setGame(p=>({...p, enemyMana: 10, enemyMaxMana: 10, enemySpellMana: 3, enemyNexus: 20}));
                            setMessage(`已补满${sandboxIdentity === 'player' ? '玩家' : '敌方'}资源`);
                        }} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Zap size={14}/> 满资源</button>

                        {/* [2026-09-13 P2] 剑态三态循环：空 → normal → rally → 空（rally = 「获得进攻标识」的不同表现） */}
                        <button onClick={()=>setGame(p=>{
                            const cur = p.attackToken.player;
                            return { ...p, attackToken: { ...p.attackToken, player: cur === null ? 'normal' : cur === 'normal' ? 'rally' : null } };
                        })} className="flex-1 py-2 bg-blue-900/50 hover:bg-blue-800 text-blue-300 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Swords size={14}/> 玩家剑：{game.attackToken.player || '空'}</button>
                        <button onClick={()=>setGame(p=>{
                            const cur = p.attackToken.enemy;
                            return { ...p, attackToken: { ...p.attackToken, enemy: cur === null ? 'normal' : cur === 'normal' ? 'rally' : null } };
                        })} className="flex-1 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Swords size={14}/> 敌方剑：{game.attackToken.enemy || '空'}</button>
                        <button onClick={()=>{setPlayerBench([]); setEnemyBench([]); setCombatField([]);}} className="flex-1 py-2 bg-slate-800 hover:bg-red-900 text-xs font-bold rounded flex items-center justify-center gap-1 text-gray-400 transition-colors"><Skull size={14}/> 清场</button>
                    </div>
                </div>
            </motion.div>

        </div>
    );
};