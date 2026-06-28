import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// [修正] 补充引入沙盒所需状态图标 Shield(防守撤回) 和 Sword(进攻交战)
import { X, BookOpen, Key, Layers, Search, ChevronLeft, ChevronRight, Play, Zap, Clock, Shield, Sword } from 'lucide-react';
import { CARD_DB } from '../data/cards';
import { KEYWORD_DB } from '../data/keywords';
import { TUTORIAL_DB } from '../data/tutorials';
import { KEYWORD_DETAILS, type SandboxMode } from '../data/keywordDetails'; // [核心新增] 引入机制沙盒档案与可用模式字典
import { Card } from './Card';
import { FullArtOverlay } from './Overlays';
import type { CardData } from '../types';

interface GalleryCodexProps {
    onClose: () => void;
    userSystem?: any; // [核心新增] 透传用户系统，用于读取已拥有资产，决定图鉴点亮还是灰白锁定
}

// [核心新增] 静态数据组装厂：把简化的静态库转化为能扔给 <Card /> 渲染的满血状态
const toFullCardData = (staticData: any): CardData => ({
    ...staticData,
    // [修正] 废除随机数，改用卡牌自身固定的 key 拼接，确保 React 节点树在过滤时绝对稳定，不重绘失忆
    id: 'gallery_codex_' + staticData.key,
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0
});

type TabType = 'tutorial' | 'keywords' | 'cards';

export const GalleryCodex: React.FC<GalleryCodexProps> = ({ onClose, userSystem }) => {
    const [activeTab, setActiveTab] = useState<TabType>('tutorial');

    // [新增] 教程专属状态机：记录当前展开的教程父目录
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    // [新增] 教程内容状态机：记录当前选中的具体教程子词条 ID
    const [activeTutorialId, setActiveTutorialId] = useState<string | null>(null);

    // [新增] 机制档案专属状态机：记录当前选中的机制词条
    const [activeKeywordTab, setActiveKeywordTab] = useState<string | null>(null);
    // [核心新增] 机制沙盒专属状态机：记录当前卡牌所处的演示状态
    const [sandboxMode, setSandboxMode] = useState<SandboxMode>('bench');

    // [核心新增] 物理侦听器：当玩家切换左侧不同的机制词条时，自动将右侧的沙盒靶子重置回安全的“备战”状态
    React.useEffect(() => {
        setSandboxMode('bench');
    }, [activeKeywordTab]);

    // [核心修复 1] 彻底复刻 ArtStudio 的 useMemo 数据锁定！
    // 专门为沙盒生成绝对独立的 ID (sandbox_xxx)，避免与图鉴第一页 (gallery_codex_xxx) 的全局记忆库发生撞车污染。
    const sandboxTestCard = useMemo(() => {
        if (activeTab !== 'keywords' || !activeKeywordTab) return null;
        const details = KEYWORD_DETAILS[activeKeywordTab];
        if (!details) return null;
        const baseCard = CARD_DB[details.testCardId];
        if (!baseCard) return null;

        return {
            ...baseCard,
            id: 'sandbox_' + baseCard.key,
            // [真·终极修复] 强制干涉底层类型！
            // 无论测试卡原本在数据库里是什么类型（甚至是法术），在这里必须强制伪装成 UNIT (随从)。
            // 只有被判定为物理实体，<Card /> 内部的渲染引擎才允许其在 combat/bench 状态下收缩为棋子！
            type: 'UNIT',
            strikeCount: 0,
            animState: 'idle' as const,
            damageTaken: 0
        };
    }, [activeTab, activeKeywordTab]);

    // === [核心新增] 图鉴专属状态机 ===
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCosts, setSelectedCosts] = useState<number[]>([]);
    const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedSpellSpeeds, setSelectedSpellSpeeds] = useState<string[]>([]);
    const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]); // [新增] 用于承接 36 种机制图标的过滤状态
    const [currentPage, setCurrentPage] = useState(0);
    const [viewCard, setViewCard] = useState<CardData | null>(null); // 控制全屏鉴赏

    // [新增] 用于控制左侧两个一级抽屉的独立开合状态
    const [isCostOpen, setIsCostOpen] = useState(false);
    const [isTypeOpen, setIsTypeOpen] = useState(false);

    // [核心新增] 复合过滤算力核心 (支持单类多选 OR，跨类复合 AND)
    const filteredCards = useMemo(() => {
        let result = Object.values(CARD_DB).map(toFullCardData);
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(lower) || (c.description?.toLowerCase().includes(lower)));
        }
        if (selectedCosts.length > 0) {
            result = result.filter(c => (selectedCosts.includes(9) && c.cost >= 9) || selectedCosts.includes(c.cost));
        }
        if (selectedRegions.length > 0) result = result.filter(c => selectedRegions.includes(c.region));

        if (selectedTypes.length > 0) {
            result = result.filter(c => {
                const isHero = c.isChampion === true;
                const isSpell = c.type?.toLowerCase().includes('spell');
                const isUnit = !isHero && !isSpell;

                return (selectedTypes.includes('HERO') && isHero) ||
                       (selectedTypes.includes('SPELL') && isSpell) ||
                       (selectedTypes.includes('UNIT') && isUnit);
            });
        }

        // 级联引信 1：法术速度仅当勾选了 SPELL 时生效
        if (selectedTypes.includes('SPELL') && selectedSpellSpeeds.length > 0) {
            result = result.filter(c => {
                const typeStr = c.type?.toLowerCase() || '';
                return typeStr.includes('spell') && selectedSpellSpeeds.some(speed => typeStr.includes(speed.toLowerCase()));
            });
        }

        // [核心新增] 级联引信 2：机制词条仅当勾选了 英雄/随从 (或者没做类型限制) 时生效
        if ((selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && selectedKeywords.length > 0) {
            result = result.filter(c => {
                if (!c.keywords || c.keywords.length === 0) return false;
                // 只要该卡牌含有玩家点亮的任意一个机制徽章，即可存活
                return selectedKeywords.some(kw => c.keywords!.includes(kw as any));
            });
        }

        return result;
    }, [searchTerm, selectedCosts, selectedRegions, selectedTypes, selectedSpellSpeeds, selectedKeywords]);

    // [核心新增] 双页排版物理引擎 (每页 9 张，一展 18 张)
    const CARDS_PER_SPREAD = 18;
    const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_SPREAD));
    const currentSpreadCards = filteredCards.slice(currentPage * CARDS_PER_SPREAD, (currentPage + 1) * CARDS_PER_SPREAD);
    const leftPageCards = currentSpreadCards.slice(0, 9);
    const rightPageCards = currentSpreadCards.slice(9, 18);

    const toggleFilter = (setter: React.Dispatch<React.SetStateAction<any[]>>, val: any) => {
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
        setCurrentPage(0); // 检索条件变动，强制打回第一页
    };

    // 核心物理弹簧参数：确保长柄拉开和光幕展开的速度、弹性完全一致
    const splitSpring = { type: "spring", stiffness: 120, damping: 15, delay: 0.2 };

    // === [核心新增] 2D伪3D书页翻展与量子波浪化现变体大脑 ===
    const bookPageVariants = {
        hidden: { scaleX: 0, opacity: 0, filter: 'brightness(0.3)' },
        visible: {
            scaleX: 1,
            opacity: 1,
            filter: 'brightness(1)',
            transition: {
                scaleX: { type: "spring", stiffness: 90, damping: 14 },
                staggerChildren: 0.04, // 18张卡牌形成波浪形依次浮现的灵魂参数
                delayChildren: 0.15    // 等待书页横向铺展一定程度后开启卡牌化现
            }
        }
    };

    // 左页卡牌变体：淡入并背离中缝向左顺滑弹射
    const leftCardVariants = {
        hidden: { x: 40, opacity: 0, scale: 0.85 },
        visible: { x: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100, damping: 12 } }
    };

    // 右页卡牌变体：淡入并背离中缝向右顺滑弹射
    const rightCardVariants = {
        hidden: { x: -40, opacity: 0, scale: 0.85 },
        visible: { x: 0, opacity: 1, scale: 1, transition: { type: "spring", stiffness: 100, damping: 12 } }
    };

    return (
        // 根容器：固定在最上层，铺满全屏
        <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden font-sans">

            {/* 轨道一：暗影低噪底衬 (Backdrop) */}
            <motion.div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={onClose} // 点击空白处也可关闭
            />

            {/* 图鉴主体容器 - [核心修复] 彻底废除 h-[80vh] 与 w-full，改用完全契合大厅缩放引擎的绝对像素尺寸，彻底解决比例畸变与二次缩小问题 */}
            <div className="relative w-[2200px] h-[900px] flex items-center justify-center pointer-events-none">

                {/* 轨道四：能量磁场充能 (全息光幕底板) */}
                <motion.div
                    className="absolute h-[95%] bg-cyan-950/40 border-y border-cyan-400/50 shadow-[0_0_50px_rgba(34,211,238,0.15)] flex overflow-hidden backdrop-blur-md pointer-events-auto"
                    style={{ width: '1600px', originX: 0.5 }}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleX: splitSpring, opacity: { delay: 0.2, duration: 0.1 } }}
                >
                    {/* 全息网格与扫描线 (将在下一阶段在 index.css 中注入灵魂) */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.1)_1px,transparent_1px)] bg-[size:20px_20px] opacity-30 pointer-events-none" />
                    <div className="absolute inset-0 animate-scanline bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent pointer-events-none" />
                    <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none bg-noise" />

                    {/* 轨道五：侧翼破雾就位 (左侧选项卡) */}
                    <motion.div
                        // [终极修复 1] 剥夺 flex-col 属性，补充 h-full 和 shrink-0，将侧边栏的物理尺寸像钢板一样焊死，拒绝任何弹性撑破！
                        className="relative w-64 h-full shrink-0 border-r border-cyan-500/30 pt-12 px-4 z-10"
                        initial={{ x: -40, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
                    >
                        <div className="text-cyan-300/50 text-[10px] font-black tracking-[0.3em] mb-6 pl-2">CODEX.SYS //</div>

                        {/* [真·终极修复] 彻底剥夺滚动容器的 flex 和 flex-col 属性，让其回归纯粹的块级元素 (Block)，并使用 space-y-2 替代 gap-2 控制间距。彻底消灭 flex-shrink 带来的“向内收缩腰斩”潜规则！ */}
                        <div className="absolute top-[90px] bottom-6 left-4 right-1 block overflow-y-auto space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-12 pr-2 z-20">

                            {/* ================= 选项卡一：基础教程与档案 ================= */}
                            <TabButton id="tutorial" active={activeTab} icon={<BookOpen size={18} />} label="基础教程" labelCn="基础教程" onClick={() => setActiveTab('tutorial')} />
                            <AnimatePresence>
                                {activeTab === 'tutorial' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 100, damping: 16 }} className="flex flex-col gap-1 overflow-hidden">
                                        <div className="py-2 border-l-2 border-cyan-500/30 ml-4 pl-3 flex flex-col gap-2 mb-2">
                                            {/* 父目录 1：战斗 */}
                                            <CategoryButton id="combat" active={activeCategory} label="战斗 // COMBAT" onClick={() => setActiveCategory(p => p === 'combat' ? null : 'combat')} />
                                            <AnimatePresence>
                                                {activeCategory === 'combat' && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex flex-col gap-1 pl-4 mt-1 mb-2">
                                                        {TUTORIAL_DB.combat.map(tut => (
                                                            <button key={tut.id} onClick={() => setActiveTutorialId(tut.id)} className={`text-left px-3 py-1.5 text-xs font-bold transition-all border-l-2 ${activeTutorialId === tut.id ? 'border-cyan-400 text-cyan-300 bg-cyan-900/40 shadow-[inset_10px_0_15px_-10px_rgba(34,211,238,0.3)]' : 'border-transparent text-cyan-500/60 hover:text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500/30'}`}>
                                                                {tut.title}
                                                            </button>
                                                        ))}
                                                        {TUTORIAL_DB.combat.length === 0 && <div className="py-1 pl-2 text-[10px] text-cyan-500/50 font-mono tracking-widest">AWAITING ARCHIVE...</div>}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* 父目录 2：玩法 */}
                                            <CategoryButton id="gameplay" active={activeCategory} label="玩法 // GAMEPLAY" onClick={() => setActiveCategory(p => p === 'gameplay' ? null : 'gameplay')} />
                                            <AnimatePresence>
                                                {activeCategory === 'gameplay' && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex flex-col gap-1 pl-4 mt-1 mb-2">
                                                        {TUTORIAL_DB.gameplay.map(tut => (
                                                            <button key={tut.id} onClick={() => setActiveTutorialId(tut.id)} className={`text-left px-3 py-1.5 text-xs font-bold transition-all border-l-2 ${activeTutorialId === tut.id ? 'border-cyan-400 text-cyan-300 bg-cyan-900/40 shadow-[inset_10px_0_15px_-10px_rgba(34,211,238,0.3)]' : 'border-transparent text-cyan-500/60 hover:text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500/30'}`}>
                                                                {tut.title}
                                                            </button>
                                                        ))}
                                                        {TUTORIAL_DB.gameplay.length === 0 && <div className="py-1 pl-2 text-[10px] text-cyan-500/50 font-mono tracking-widest">AWAITING ARCHIVE...</div>}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* 父目录 3：系统 */}
                                            <CategoryButton id="system" active={activeCategory} label="系统 // SYSTEM" onClick={() => setActiveCategory(p => p === 'system' ? null : 'system')} />
                                            <AnimatePresence>
                                                {activeCategory === 'system' && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden flex flex-col gap-1 pl-4 mt-1 mb-2">
                                                        {TUTORIAL_DB.system.map(tut => (
                                                            <button key={tut.id} onClick={() => setActiveTutorialId(tut.id)} className={`text-left px-3 py-1.5 text-xs font-bold transition-all border-l-2 ${activeTutorialId === tut.id ? 'border-cyan-400 text-cyan-300 bg-cyan-900/40 shadow-[inset_10px_0_15px_-10px_rgba(34,211,238,0.3)]' : 'border-transparent text-cyan-500/60 hover:text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500/30'}`}>
                                                                {tut.title}
                                                            </button>
                                                        ))}
                                                        {TUTORIAL_DB.system.length === 0 && <div className="py-1 pl-2 text-[10px] text-cyan-500/50 font-mono tracking-widest">AWAITING ARCHIVE...</div>}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ================= 选项卡二：机制档案 ================= */}
                            <TabButton id="keywords" active={activeTab} icon={<Key size={18} />} label="机制档案" labelCn="机制档案" onClick={() => setActiveTab('keywords')} />
                            <AnimatePresence>
                                {activeTab === 'keywords' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 100, damping: 16 }} className="flex flex-col gap-1 overflow-hidden pr-2 z-10 pt-2 border-l-2 border-cyan-500/30 ml-4 pl-3 mb-2">
                                        {/* 遍历 KEYWORD_DB 生成带有动态颜色匹配的精美图文列表 */}
                                        {Object.entries(KEYWORD_DB).map(([kw, config]) => {
                                            const isActive = activeKeywordTab === kw;
                                            return (
                                                <button
                                                    key={kw}
                                                    onClick={() => setActiveKeywordTab(kw)}
                                                    className={`relative w-full py-2 px-3 flex items-center gap-3 transition-all duration-300 group rounded-sm border
                                                        ${isActive ? 'bg-cyan-900/40 border-cyan-400 shadow-[inset_0_0_15px_rgba(34,211,238,0.2)]' : 'border-transparent hover:bg-cyan-800/20'}`}
                                                >
                                                    {/* 左侧：发光微缩图标容器 */}
                                                    <div className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded bg-black/60 border ${isActive ? `border-${config.color}-400/50 shadow-[0_0_10px_rgba(255,255,255,0.2)]` : 'border-transparent'}`}>
                                                        {config.icon ? (
                                                            <img src={config.icon} alt={config.label} className="w-5 h-5 object-contain drop-shadow-md group-hover:scale-110 transition-transform" />
                                                        ) : (
                                                            <span className={`text-[12px] font-bold text-${config.color}-400`}>{config.label.substring(0, 1)}</span>
                                                        )}
                                                    </div>

                                                    {/* 中间：带有动态色彩的文字排版 */}
                                                    <div className="flex flex-col items-start leading-none gap-1">
                                                        <span className={`text-xs font-black tracking-widest text-${config.color}-400 group-hover:brightness-125 transition-all`}>{config.label}</span>
                                                        <span className="text-[8px] text-cyan-500/50 font-bold uppercase">{kw}</span>
                                                    </div>

                                                    {/* 右侧：高科技激活指示灯 */}
                                                    {isActive && <div className={`absolute right-2 w-1 h-4 rounded-full bg-${config.color}-400 shadow-[0_0_8px_currentColor]`} />}
                                                </button>
                                            );
                                        })}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ================= 选项卡三：全图鉴 ================= */}
                            <TabButton id="cards" active={activeTab} icon={<Layers size={18} />} label="全图鉴" labelCn="全图鉴" onClick={() => setActiveTab('cards')} />
                            <AnimatePresence>
                                {activeTab === 'cards' && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 100, damping: 16 }} className="flex flex-col gap-6 overflow-hidden pr-2 z-10 pt-4 border-l-2 border-cyan-500/30 ml-4 pl-4 mb-4">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500/50" />
                                            <input type="text" placeholder="检索名称或规则..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(0); }} className="w-full bg-cyan-950/40 border border-cyan-800/50 rounded text-xs text-cyan-100 pl-7 py-2.5 focus:outline-none focus:border-cyan-400" />
                                        </div>

                                        {/* ================= 独立抽屉 1：费用 ================= */}
                                        <div className="flex flex-col gap-1">
                                            <CategoryButton id="cost" active={isCostOpen ? "cost" : null} label="费用" onClick={() => setIsCostOpen(!isCostOpen)} />
                                            <AnimatePresence>
                                                {isCostOpen && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-3 border-l-2 border-cyan-500/20 ml-3">
                                                        <div className="flex flex-wrap gap-1 py-2">
                                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => (
                                                                <button key={c} onClick={() => toggleFilter(setSelectedCosts, c)} className={`w-8 h-8 rounded text-sm font-black transition-colors ${selectedCosts.includes(c) ? 'bg-cyan-500 text-black shadow-[0_0_10px_cyan]' : 'bg-cyan-900/40 text-cyan-300 hover:bg-cyan-700/50'}`}>
                                                                    {c}{c === 10 ? '+' : ''}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        {/* ================= 独立抽屉 2：类型及级联子抽屉 ================= */}
                                        <div className="flex flex-col gap-1">
                                            <CategoryButton id="type" active={isTypeOpen ? "type" : null} label="类型" onClick={() => setIsTypeOpen(!isTypeOpen)} />
                                            <AnimatePresence>
                                                {isTypeOpen && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pl-3 border-l-2 border-cyan-500/20 ml-3">
                                                        {/* 一级分类：英雄 / 随从 / 法术 */}
                                                        <div className="flex flex-col gap-1.5 py-2">
                                                            {['HERO', 'UNIT', 'SPELL'].map(t => (
                                                                <button key={t} onClick={() => toggleFilter(setSelectedTypes, t)} className={`text-left px-3 py-2 rounded text-xs font-bold transition-all ${selectedTypes.includes(t) ? 'bg-cyan-500 text-black border border-cyan-400' : 'bg-cyan-900/40 text-cyan-400 border border-transparent hover:bg-cyan-800/50'}`}>
                                                                    {t === 'HERO' ? '天启者' : t === 'UNIT' ? '随从' : '法术'}
                                                                </button>
                                                            ))}
                                                        </div>

                                                        {/* --- 级联子抽屉 A：法术速度 (纯图标，仅选中法术时滑出) --- */}
                                                        <AnimatePresence>
                                                            {selectedTypes.includes('SPELL') && (
                                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-1 mb-2">
                                                                    <span className="text-[10px] text-purple-400 font-bold mb-2 block tracking-widest">法术速度</span>
                                                                    <div className="flex gap-2">
                                                                        {[
                                                                            { id: 'Burst', icon: <Zap size={16} className="text-yellow-400 fill-yellow-400" />, title: '极速 (Burst)' },
                                                                            { id: 'Fast', icon: <Zap size={16} className="text-white" />, title: '快速 (Fast)' },
                                                                            { id: 'Slow', icon: <Clock size={16} className="text-purple-300" />, title: '慢速 (Slow)' }
                                                                        ].map(s => (
                                                                            <button key={s.id} onClick={() => toggleFilter(setSelectedSpellSpeeds, s.id)} title={s.title} className={`flex-1 py-1.5 rounded flex justify-center items-center transition-colors border ${selectedSpellSpeeds.includes(s.id) ? 'bg-purple-500/20 border-purple-400 shadow-[inset_0_0_10px_purple]' : 'bg-purple-900/40 border-transparent hover:bg-purple-800/50'}`}>
                                                                                {s.icon}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* --- 级联子抽屉 B：机制徽章 (直接读取字典图标，选中随从/英雄时滑出) --- */}
                                                        <AnimatePresence>
                                                            {(selectedTypes.length === 0 || selectedTypes.includes('HERO') || selectedTypes.includes('UNIT')) && (
                                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2 border-t border-cyan-500/20 pt-3">
                                                                    <span className="text-[10px] text-green-400 font-bold mb-2 block tracking-widest">关键词筛选</span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {Object.entries(KEYWORD_DB).map(([kw, config]) => (
                                                                            <button
                                                                                key={kw}
                                                                                onClick={() => toggleFilter(setSelectedKeywords, kw)}
                                                                                title={`${config.label}\n${config.description}`}
                                                                                className={`w-7 h-7 rounded flex justify-center items-center transition-all border ${selectedKeywords.includes(kw) ? 'bg-green-500/20 border-green-400 shadow-[inset_0_0_10px_rgba(74,222,128,0.5)]' : 'bg-cyan-900/40 border-transparent hover:bg-cyan-800/50 opacity-60 hover:opacity-100'}`}
                                                                            >
                                                                                {config.icon ? (
                                                                                    <img src={config.icon} alt={config.label} className="w-5 h-5 object-contain drop-shadow-md" />
                                                                                ) : (
                                                                                    <span className={`text-[8px] font-bold text-${config.color}-400`}>{config.label.substring(0, 1)}</span>
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* 右侧主展示区 (动态分发) */}
                    <motion.div
                        className="relative flex-1 p-8 z-10 flex flex-col"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6, duration: 0.4 }}
                    >
                        {activeTab === 'cards' ? (
                            /* --- [核心三] 实体全息双页网格大图鉴 --- */
                            /* [核心修正] 绑定由页码、费用、类型、词条和检索词交叉组合的唯一动态 Key。当玩家执行翻页或变更检索条件时，整个双页系统会原地重新执行伪3D拉展和卡牌微粒化现，彻底告别静态呆板 */
                            <div key={`${currentPage}_${selectedCosts.join('-')}_${selectedTypes.join('-')}_${selectedSpellSpeeds.join('-')}_${selectedKeywords.join('-')}_${searchTerm}`} className="flex-1 flex flex-col h-full overflow-hidden">
                                <div className="flex-1 flex gap-12 pt-4">

                                    {/* 左半页 - [修正] 升级为 motion.div，锚点锁死在右侧中缝，启动 2D 伪 3D 展开与光影补间 */}
                                    <motion.div
                                        variants={bookPageVariants}
                                        initial="hidden"
                                        animate="visible"
                                        style={{ transformOrigin: 'right center' }}
                                        className="flex-1 bg-cyan-950/20 border border-cyan-800/40 rounded-2xl p-6 shadow-[inset_0_0_60px_rgba(34,211,238,0.02)]"
                                    >
                                        <div className="grid grid-cols-3 grid-rows-3 gap-y-4 gap-x-2 h-full place-items-center">
                                            {leftPageCards.map(c => (
                                                /* [修正] 升级为 motion.div 并注入向左弹射淡入变体，形成由内向外的微粒破雾感 */
                                                <motion.div
                                                    key={c.id}
                                                    variants={leftCardVariants}
                                                    className="scale-[1] origin-center hover:scale-[1.1] transition-transform duration-300 cursor-pointer hover:z-20 hover:drop-shadow-[0_0_20px_cyan]"
                                                    onClick={() => setViewCard(c)}
                                                >
                                                    <Card data={c} location="collection" isFaceUp={true} isLocked={userSystem && !userSystem.collection?.ownedCards?.[c.key]} />
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>

                                    {/* 全息中缝装订线 */}
                                    <div className="w-[2px] bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent self-stretch shadow-[0_0_15px_cyan]"></div>

                                    {/* 右半页 - [修正] 升级为 motion.div，锚点锁死在左侧中缝，启动 2D 伪 3D 展开与光影补间 */}
                                    <motion.div
                                        variants={bookPageVariants}
                                        initial="hidden"
                                        animate="visible"
                                        style={{ transformOrigin: 'left center' }}
                                        className="flex-1 bg-cyan-950/20 border border-cyan-800/40 rounded-2xl p-6 shadow-[inset_0_0_60px_rgba(34,211,238,0.02)]"
                                    >
                                        <div className="grid grid-cols-3 grid-rows-3 gap-y-4 gap-x-2 h-full place-items-center">
                                            {rightPageCards.map(c => (
                                                /* [修正] 升级为 motion.div 并注入向右弹射淡入变体，形成由内向外的微粒破雾感 */
                                                <motion.div
                                                    key={c.id}
                                                    variants={rightCardVariants}
                                                    className="scale-[1] origin-center hover:scale-[1.1] transition-transform duration-300 cursor-pointer hover:z-20 hover:drop-shadow-[0_0_20px_cyan]"
                                                    onClick={() => setViewCard(c)}
                                                >
                                                    <Card data={c} location="collection" isFaceUp={true} isLocked={userSystem && !userSystem.collection?.ownedCards?.[c.key]} />
                                                </motion.div>
                                            ))}
                                        </div>
                                    </motion.div>
                                </div>

                                {/* 底部翻页控制器 */}
                                <div className="mt-8 flex justify-center items-center gap-12 h-16">
                                    <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)} className="p-3 text-cyan-400 disabled:opacity-20 hover:bg-cyan-800/50 hover:text-white rounded-full transition-all hover:scale-125 disabled:hover:scale-100 border border-transparent hover:border-cyan-500/50"><ChevronLeft size={36} strokeWidth={3} /></button>
                                    <div className="flex flex-col items-center">
                                        <span className="font-mono text-cyan-200 font-black tracking-[0.5em] text-xl">PAGE_{currentPage + 1}</span>
                                        <span className="text-[10px] text-cyan-600 font-bold tracking-widest">OF {totalPages}</span>
                                    </div>
                                    <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)} className="p-3 text-cyan-400 disabled:opacity-20 hover:bg-cyan-800/50 hover:text-white rounded-full transition-all hover:scale-125 disabled:hover:scale-100 border border-transparent hover:border-cyan-500/50"><ChevronRight size={36} strokeWidth={3} /></button>
                                </div>
                            </div>
                        ) : activeTab === 'tutorial' ? (
                            /* --- [核心一] 档案机密阅读器 --- */
                            <div className="w-full h-full border border-cyan-500/20 bg-cyan-950/30 rounded-2xl flex flex-col relative overflow-hidden p-12 shadow-[inset_0_0_100px_rgba(34,211,238,0.03)]">
                                {/* 投影扫描线装饰 */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none z-0" />

                                {activeTutorialId ? (() => {
                                    // 从数据源中捞出当前选中的教程
                                    const tut = [...TUTORIAL_DB.combat, ...TUTORIAL_DB.gameplay, ...TUTORIAL_DB.system].find(t => t.id === activeTutorialId);
                                    if (!tut) return null;

                                    return (
                                        <motion.div key={tut.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 h-full flex flex-col custom-scrollbar overflow-y-auto pr-8">
                                            <h2 className="text-4xl font-black text-white tracking-widest mb-4 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                                                <TypewriterText text={tut.title} delayOffset={0} />
                                            </h2>
                                            <div className="h-px w-full bg-gradient-to-r from-cyan-400 to-transparent mb-10 opacity-50" />

                                            <div className="flex flex-col gap-10">
                                                {tut.sections.map((sec, secIdx) => (
                                                    <div key={secIdx} className="flex flex-col gap-4">
                                                        {sec.heading && (
                                                            <h3 className="text-cyan-300 font-bold tracking-[0.2em] text-sm border-l-4 border-cyan-400 pl-4 py-1 bg-gradient-to-r from-cyan-900/40 to-transparent">
                                                                <TypewriterText text={sec.heading} delayOffset={secIdx * 1.5 + 1} />
                                                            </h3>
                                                        )}
                                                        {sec.paragraphs.map((p, pIdx) => (
                                                            <p key={pIdx} className="text-cyan-50/90 leading-[1.8] text-sm tracking-wide text-justify">
                                                                <TypewriterText text={p} delayOffset={secIdx * 1.5 + 1 + pIdx * 0.5} />
                                                            </p>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    );
                                })() : (
                                    /* 待机徽章投影 */
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 opacity-60">
                                        <BookOpen size={64} className="text-cyan-500 mb-6 animate-pulse" />
                                        <span className="text-cyan-500/80 font-mono tracking-[0.4em] text-xl animate-pulse">READY TO DECODE ARCHIVE...</span>
                                    </div>
                                )}
                            </div>
                        ) : activeTab === 'keywords' ? (
                            /* --- [核心二] 机制沙盒演练场 --- */
                            <div className="w-full h-full border border-cyan-500/20 bg-cyan-950/30 rounded-2xl flex relative overflow-hidden shadow-[inset_0_0_100px_rgba(34,211,238,0.03)]">
                                {/* 投影扫描线装饰 */}
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none z-0" />

                                {activeKeywordTab && KEYWORD_DETAILS[activeKeywordTab] ? (() => {
                                    const details = KEYWORD_DETAILS[activeKeywordTab];
                                    // [核心修复] 直接使用上面 useMemo 锁定好的沙盒专属卡牌数据！不再内联生成！
                                    const fullTestCard = sandboxTestCard;
                                    const config = KEYWORD_DB[activeKeywordTab];

                                    // 提取该机制专属的主题色，用于高亮渲染
                                    const themeColor = config?.color || 'cyan';

                                    return (
                                        <motion.div key={details.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full h-full z-10 p-8">
                                            {/* ===== 左侧：情报解析台 (50% 宽度) ===== */}
                                            <div className="w-1/2 h-full flex flex-col pr-8 border-r border-cyan-500/20 custom-scrollbar overflow-y-auto relative">
                                                {/* 右上角：巨幅徽章点睛透视 */}
                                                <div className="absolute top-0 right-4 opacity-80 pointer-events-none">
                                                    {config?.icon ? (
                                                        <img src={config.icon} alt={details.nameCn} className="w-32 h-32 object-contain" />
                                                    ) : (
                                                        <span className={`text-9xl font-black text-${themeColor}-500`}>{details.nameCn.substring(0,1)}</span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col mb-6 relative z-10">
                                                    <h2 className="text-4xl font-black text-white tracking-widest drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                                                        <TypewriterText text={details.nameCn} delayOffset={0} />
                                                    </h2>
                                                    <span className={`text-sm font-bold text-${themeColor}-400 tracking-[0.3em] uppercase mt-1`}>
                                                        <TypewriterText text={details.nameEn} delayOffset={0.5} />
                                                    </span>
                                                </div>

                                                <div className="h-px w-full bg-gradient-to-r from-cyan-400 to-transparent mb-8 opacity-50" />

                                                <div className="flex flex-col gap-8 relative z-10">
                                                    {details.sections.map((sec, secIdx) => (
                                                        <div key={secIdx} className="flex flex-col gap-3">
                                                            {sec.heading && (
                                                                <h3 className={`text-${themeColor}-300 font-bold tracking-[0.2em] text-xs border-l-4 border-${themeColor}-400 pl-3 py-1 bg-gradient-to-r from-cyan-900/40 to-transparent`}>
                                                                    <TypewriterText text={sec.heading} delayOffset={secIdx * 1.5 + 1} />
                                                                </h3>
                                                            )}
                                                            {sec.paragraphs.map((p, pIdx) => (
                                                                <p key={pIdx} className="text-cyan-50/90 leading-[1.8] text-sm tracking-wide text-justify">
                                                                    <TypewriterText text={p} delayOffset={secIdx * 1.5 + 1 + pIdx * 0.5} />
                                                                </p>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* ===== 右侧：全息演练舱 (50% 宽度) ===== */}
                                            <div className="w-1/2 h-full flex flex-col items-center justify-center relative pl-8">
                                                {/* 全息地格装饰网 */}
                                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.1)_0%,transparent_70%)] pointer-events-none" />

                                                {fullTestCard ? (
                                                    <div className="flex-1 w-full flex items-center justify-center">
                                                        <div className={`transform origin-center shadow-2xl transition-all duration-300 z-10 ${
                                                            sandboxMode === 'combat' ? 'w-[240px] h-[162px] scale-[1.55]' : 'scale-[1.55]'
                                                        }`}>
                                                            <Card
                                                                key={`${fullTestCard.id}-${sandboxMode}`}
                                                                data={fullTestCard}
                                                                // [真正的罪魁祸首] 删掉那个愚蠢的判定！
                                                                // 直接把 'bench' 和 'combat' 原封不动传给 Card！
                                                                location={sandboxMode}
                                                                isPlayerSide={true}
                                                                isAttacking={sandboxMode === 'combat'}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 flex items-center justify-center text-cyan-500/50 font-mono text-sm z-10">
                                                        [ 404 ] TEST SUBJECT NOT FOUND
                                                    </div>
                                                )}

                                                {/* 动态控制台（根据 availableModes 渲染对应按钮） */}
                                                <div className="w-full mt-6 bg-black/40 border border-cyan-500/30 rounded-xl p-3 flex justify-center gap-6 z-10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                                                    {details.availableModes.includes('bench') && (
                                                        <button
                                                            onClick={() => setSandboxMode('bench')}
                                                            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black tracking-widest transition-all duration-300 border-2 ${sandboxMode === 'bench' ? 'bg-cyan-600/20 border-cyan-400 text-cyan-300 shadow-[inset_0_0_15px_rgba(34,211,238,0.3)] scale-105' : 'bg-cyan-950/50 border-transparent text-cyan-500/50 hover:bg-cyan-900/50 hover:text-cyan-300'}`}
                                                        >
                                                            <Shield size={18} /> 撤回 (BENCH)
                                                        </button>
                                                    )}
                                                    {details.availableModes.includes('combat') && (
                                                        <button
                                                            onClick={() => setSandboxMode('combat')}
                                                            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-black tracking-widest transition-all duration-300 border-2 ${sandboxMode === 'combat' ? 'bg-red-600/20 border-red-500 text-red-400 shadow-[inset_0_0_20px_rgba(239,68,68,0.3)] scale-105' : 'bg-red-950/30 border-transparent text-red-500/50 hover:bg-red-900/40 hover:text-red-400'}`}
                                                        >
                                                            <Sword size={18} /> 进攻 (COMBAT)
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })() : (
                                    /* 待机状态投影 */
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 opacity-60">
                                        <Key size={64} className="text-cyan-500 mb-6 animate-pulse" />
                                        <span className="text-cyan-500/80 font-mono tracking-[0.4em] text-xl animate-pulse">AWAITING KEYWORD SELECTION...</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="w-full h-full border border-cyan-500/20 bg-cyan-900/10 rounded-lg flex items-center justify-center">
                                <span className="text-cyan-500/50 font-mono tracking-widest animate-pulse">AWAITING DATA INPUT...</span>
                            </div>
                        )}
                    </motion.div>
                </motion.div>

                {/* 轨道二 & 三：双生白色长柄 (The Handles) */}
                {/* 左长柄 - [修正] 向左弹射扩展至 -1000px 处，完美咬合 2000px 宽度的屏幕边缘 */}
                <motion.div
                    className="absolute w-3 h-full bg-white rounded-full z-20 shadow-[0_0_20px_white,0_0_40px_cyan]"
                    initial={{ scaleY: 0, x: 0, filter: "brightness(1)" }}
                    animate={{ scaleY: 1, x: -800, filter: ["brightness(3)", "brightness(1)"] }}
                    exit={{ scaleY: 0, x: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleY: { duration: 0.2 }, x: splitSpring, filter: { duration: 0.5 } }}
                />
                {/* 右长柄 - [修正] 向右弹射扩展至 1000px 处，完美咬合 2000px 宽度的屏幕边缘 */}
                <motion.div
                    className="absolute w-3 h-full bg-white rounded-full z-20 shadow-[0_0_20px_white,0_0_40px_cyan]"
                    initial={{ scaleY: 0, x: 0, filter: "brightness(1)" }}
                    animate={{ scaleY: 1, x: 800, filter: ["brightness(3)", "brightness(1)"] }}
                    exit={{ scaleY: 0, x: 0, transition: { duration: 0.2 } }}
                    transition={{ scaleY: { duration: 0.2 }, x: splitSpring, filter: { duration: 0.5 } }}
                />

            </div>

            {/* 右上角关闭按钮 (延迟淡入) */}
            <motion.button
                onClick={onClose}
                className="absolute top-6 right-6 w-12 h-12 rounded-full border border-cyan-500/50 bg-black/50 text-cyan-400 flex items-center justify-center hover:bg-cyan-900/50 hover:text-white hover:scale-110 hover:shadow-[0_0_20px_rgba(34,211,238,0.5)] transition-all duration-200 z-[210]"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ delay: 0.6, type: "spring" }}
            >
                <X size={24} strokeWidth={2.5} />
            </motion.button>

            {/* [核心新增] 最高优先级的原画与背景故事无干扰鉴赏层！ */}
            <AnimatePresence>
                {viewCard && (
                    <div className="absolute inset-0 z-[300]">
                        <FullArtOverlay
                            card={viewCard}
                            onClose={() => setViewCard(null)}
                            // 如果对接了 userSystem，则允许在鉴赏页直接发生资产交互逻辑
                            ownedCount={userSystem ? (userSystem.collection?.ownedCards?.[viewCard.key] || 0) : 0}
                            playerSilver={userSystem ? (userSystem.collection?.resources?.silverCoin || 0) : 0}
                            onBuy={userSystem ? (count, cost) => userSystem.purchaseCard(viewCard.key, count, cost) : undefined}
                        />
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
};

// 辅助组件：左侧高科技主标签按钮 (已升级动态三角指示灯)
const TabButton = ({ id, active, icon, label, labelCn, onClick }: { id: string, active: string, icon: React.ReactNode, label: string, labelCn: string, onClick: () => void }) => {
    const isActive = active === id;
    return (
        <button
            onClick={onClick}
            className={`relative w-full py-3 px-4 flex items-center justify-between overflow-hidden transition-all duration-300 group rounded-r-md
                ${isActive ? 'bg-cyan-900/40 border-l-2 border-cyan-400 text-cyan-50 shadow-[inset_20px_0_20px_-20px_rgba(34,211,238,0.3)]' : 'border-l-2 border-transparent text-cyan-500/70 hover:bg-cyan-900/20 hover:text-cyan-300 hover:border-cyan-500/50'}`}
        >
            {/* 按钮Hover扫描光效 */}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />

            <div className="relative z-10 flex items-center gap-3">
                <div className={`${isActive ? 'text-cyan-300 drop-shadow-[0_0_8px_cyan]' : ''}`}>{icon}</div>
                <div className="flex flex-col items-start leading-tight">
                    <span className="font-black tracking-wider text-sm">{label}</span>
                    <span className="text-[10px] opacity-70 font-bold">{labelCn}</span>
                </div>
            </div>

            {/* [核心特效] 动态空心右三角 -> 实心下三角 */}
            <Play
                size={14}
                className={`relative z-10 transition-transform duration-300 ${isActive ? 'rotate-90 drop-shadow-[0_0_8px_white]' : 'rotate-0'}`}
                fill={isActive ? "#ffffff" : "transparent"}
                stroke={isActive ? "#ffffff" : "currentColor"}
                strokeWidth={2.5}
            />
        </button>
    );
};

// [新增] 辅助组件：教程专属父目录按钮 (子级手风琴)
const CategoryButton = ({ id, active, label, onClick }: { id: string, active: string | null, label: string, onClick: () => void }) => {
    const isActive = active === id;
    return (
        <button
            onClick={onClick}
            className={`relative w-full py-2 px-3 flex items-center justify-between transition-all duration-300 group rounded-sm
                ${isActive ? 'bg-cyan-800/30 text-white' : 'text-cyan-500/70 hover:bg-cyan-800/20 hover:text-cyan-300'}`}
        >
            <span className="text-xs font-bold tracking-widest">{label}</span>
            <Play
                size={12}
                className={`transition-transform duration-300 ${isActive ? 'rotate-90 drop-shadow-[0_0_5px_white]' : 'rotate-0'}`}
                fill={isActive ? "#ffffff" : "transparent"}
                stroke={isActive ? "#ffffff" : "currentColor"}
                strokeWidth={2}
            />
        </button>
    );
};

// [核心新增] 高科技逐字打字机解码特效引擎
// 利用 Framer Motion 的 staggerChildren 特性，将长文本拆分为单字微粒，带有闪烁和位移地依次化现
const TypewriterText = ({ text, delayOffset = 0 }: { text: string, delayOffset?: number }) => {
    const letters = Array.from(text);
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.015, // 每个字之间的出现间隔 (毫秒级别)
                delayChildren: delayOffset * 0.3 // 段落级别的错峰延迟
            }
        },
    };
    const childVariants = {
        hidden: { opacity: 0, y: 5, filter: 'blur(4px)' }, // 字粒出生时带有模糊和下沉
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' }, // 跃起并变得锐利
    };

    return (
        <motion.span variants={containerVariants} initial="hidden" animate="visible" className="inline-block">
            {letters.map((letter, index) => (
                <motion.span key={index} variants={childVariants} className="inline-block">
                    {letter === " " ? "\u00A0" : letter}
                </motion.span>
            ))}
        </motion.span>
    );
};