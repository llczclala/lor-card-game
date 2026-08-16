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

export const SandboxSession: React.FC<SandboxSessionProps> = ({ onClose }) => {
    // === 1. 初始化底层状态机 ===
    const {
        game, setGame,
        playerHand, setPlayerHand, enemyHand, setEnemyHand,
        playerBench, setPlayerBench, enemyBench, setEnemyBench,
        combatField, setCombatField,
        actions, message, setMessage
    } = useGameState([], [], true);

    const spellSystem = useSpellSystem({
        onComplete: (card, targets) => { actions.finalizeSpell(card, 'player', targets); }
    });

    // === UI 抽屉状态 ===
    const [isArmoryOpen, setIsArmoryOpen] = useState(true);
    const [isDnaOpen, setIsDnaOpen] = useState(false);
    const [isConsoleOpen, setIsConsoleOpen] = useState(false); // [修复] 默认隐藏，像抽屉一样沉在下面

    // === 沙盒专属特权状态 ===
    const [spawnTarget, setSpawnTarget] = useState<'player' | 'enemy'>('player');
    const [sandboxIdentity, setSandboxIdentity] = useState<'player' | 'enemy'>('player');
    const [selectedDnaCardId, setSelectedDnaCardId] = useState<string | null>(null);

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

        if (spawnTarget === 'player') {
            setPlayerHand(prev => [...prev, newCard]);
            setMessage(`已将 [${base.name}] 加入我方手牌`);
        } else {
            setEnemyHand(prev => [...prev, newCard]);
            setMessage(`已将 [${base.name}] 加入敌方手牌`);
        }
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
                    <div className="flex bg-slate-800 rounded-md p-1 mb-4">
                        <button onClick={()=>setSpawnTarget('player')} className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-all ${spawnTarget==='player' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}>发送至我方</button>
                        <button onClick={()=>setSpawnTarget('enemy')} className={`flex-1 py-1.5 text-xs font-bold rounded-sm transition-all ${spawnTarget==='enemy' ? 'bg-red-600 text-white shadow-md' : 'text-gray-400'}`}>发送至敌方</button>
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
                animate={{ y: isConsoleOpen ? 0 : 200 }}
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
                <div className="bg-slate-900/95 backdrop-blur-md border border-white/20 rounded-t-xl rounded-b-none p-5 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] flex flex-col gap-4 w-[600px] h-[200px]">
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

                    <div className="flex gap-2 mt-auto">
                        <button onClick={() => actions.startRound()} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><FastForward size={14}/> 新回合</button>
                        <button onClick={() => {
                            if (sandboxIdentity === 'player') setGame(p=>({...p, playerMana: 10, playerMaxMana: 10, playerSpellMana: 3, playerNexus: 20}));
                            else setGame(p=>({...p, enemyMana: 10, enemyMaxMana: 10, enemySpellMana: 3, enemyNexus: 20}));
                            setMessage(`已补满${sandboxIdentity === 'player' ? '玩家' : '敌方'}资源`);
                        }} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Zap size={14}/> 满资源</button>

                        <button onClick={()=>setGame(p=>({...p, attackToken: {player: 'normal', enemy: null}}))} className="flex-1 py-2 bg-blue-900/50 hover:bg-blue-800 text-blue-300 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Swords size={14}/> 玩家获剑</button>
                        <button onClick={()=>setGame(p=>({...p, attackToken: {player: null, enemy: 'normal'}}))} className="flex-1 py-2 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs font-bold rounded flex items-center justify-center gap-1 transition-colors"><Swords size={14}/> 敌方获剑</button>
                        <button onClick={()=>{setPlayerBench([]); setEnemyBench([]); setCombatField([]);}} className="flex-1 py-2 bg-slate-800 hover:bg-red-900 text-xs font-bold rounded flex items-center justify-center gap-1 text-gray-400 transition-colors"><Skull size={14}/> 清场</button>
                    </div>
                </div>
            </motion.div>

        </div>
    );
};