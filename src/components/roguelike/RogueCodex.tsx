// ==========================================
// 悖论迷宫 · 逻辑研习（肉鸽图鉴）
// [2026-08-26 莉莉子] 遗物收集式改版：顶部筛选（搜索+品质多选）+ 左侧 tab 侧边栏 + 方形信息块网格
// 数据源：强化 → PLAYER_ENHANCEMENTS（15 个玩家强化，含 battleEffect 触发时机/效果类）；装备 → EQUIPMENT_DEFS（30 件含武装）
// 复用：RarityIcon / RARITY_META（品质图标 + 颜色文案）
// ==========================================
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, RotateCcw, Sparkles, Swords, Inbox, X, Lock } from 'lucide-react';
import { PLAYER_ENHANCEMENTS, type MazeBuff, type BattleTrigger, type BattleEffectClass } from '../../data/roguelike/buffs';
import type { EnhancementRarity } from '../../data/roguelike/enhancements';
import { EQUIPMENT_DEFS, type EquipmentDef } from '../../data/equipment';
import { RARITY_META } from './RarityIcon';
import { eventBus, GameEvents } from '../../utils/eventBus';

// [2026-08-27] 六档品质：白/绿/蓝/紫/金/红
const QUALITY_ORDER: EnhancementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
/** [2026-08-26 莉莉子] 品质排序权重（图鉴按品质排序，不按定义顺序） */
const QUALITY_RANK: Record<EnhancementRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** [2026-08-26 莉莉子] 战斗触发时机 → 中文标签 */
export const TRIGGER_LABELS: Record<BattleTrigger, string> = {
    game_start: '开局',
    round_start: '回合开始',
    on_summon: '召唤时',
    on_first_summon: '首次召唤',
    after_attack: '打击后',
    after_attacked: '被打击后',
    on_cast_spell: '施法后',
    on_play_unit: '打出单位后',
    on_first_play_unit: '每回合首个单位',
    on_nexus_strike: '敌方水晶受击',
    // [2026-08-27 莉莉子] 高级强化触发时机
    round_end: '回合结束',
    unit_die: '单位阵亡',
};

/** [2026-08-26 莉莉子] 战斗效果类 → 中文标签 */
export const EFFECT_LABELS: Record<BattleEffectClass, string> = {
    GENERATE: '生成',
    SUMMON: '召唤',
    BUFF: '增益',
    RALLY: '备战',
    CLONE_AND_SUMMON: '克隆召唤',
    BUFF_SELF: '自身增益',
    RANDOM_ALLY_BUFF: '随机友军增益',
    DECK_TOP_BUFF: '牌库顶增益',
    STAT_BALANCE: '攻血互等',
    // [2026-08-27 莉莉子] 高级强化效果类
    FREEZE_STRONGEST: '冻结最强',
    DUEL_STRONGEST: '双方最强互打',
    SET_STRONGEST_STATS: '设1/1最强',
    HAND_DISCOUNT: '手牌减费',
    DEATH_GIFT: '亡语赋予',
    // [2026-08-27 莉莉子] 品质扩充批效果类
    BARRIER_NEXUS: '水晶屏障',
    NEXUS_TOUGH: '水晶坚韧', // [2026-08-30 莉莉子] 固若金汤重设计：受击伤害永久 -1
    NEXUS_HEAL: '水晶回复',
    HAND_COST_DOWN: '手牌降费',
    DEATH_DISCOUNT: '亡语降费',
    ALL_BUFF: '全体增益',
    RESURRECT: '复活',
    SPELL_DOUBLE: '法术翻倍',
    KEYWORD_POWER: '关键词成长',
    NEXUS_HP_BOOST: '水晶生命', // [2026-08-28] 敌方水晶生命强化
    CHAMPION_TO_HAND: '抽天启者', // [2026-09-01] 天启共鸣：开局从牌库抽天启者到手牌
};

/** [2026-08-26 莉莉子] 装备静态修饰/效果 → 标签列表（方块底部展示） */
function getEquipBadges(e: EquipmentDef): string[] {
    const tags: string[] = [];
    if (e.costMod) tags.push(`费用${e.costMod > 0 ? '+' : ''}${e.costMod}`);
    if (e.powerMod || e.healthMod) tags.push(`+${e.powerMod ?? 0}/${e.healthMod ?? 0}`);
    if (e.keywords?.length) tags.push(e.keywords.join('·'));
    if (e.onPlay) tags.push('打出');
    if (e.onRoundStart) tags.push('回合开始');
    if (e.onTrigger) tags.push('成长');
    return tags;
}

type CodexTab = 'enhancement' | 'equipment';

interface RogueCodexProps {
    isOpen: boolean;
    onClose: () => void;
    userSystem?: any; // [2026-08-26 逻辑研习] 账号系统：读解锁记录；开发者账号（dev_full_admin）全解锁
}

export const RogueCodex: React.FC<RogueCodexProps> = ({ isOpen, onClose, userSystem }) => {
    const [tab, setTab] = useState<CodexTab>('enhancement');
    const [search, setSearch] = useState('');
    const [qualities, setQualities] = useState<Set<EnhancementRarity>>(new Set());

    // ESC 关闭（App 全局 ESC 分发优先处理本层，这里兜底）
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // 打开时重置筛选（下次进入干净状态）
    useEffect(() => {
        if (isOpen) { setSearch(''); setQualities(new Set()); }
    }, [isOpen]);

    const toggleQuality = (q: EnhancementRarity) => {
        setQualities(prev => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q); else next.add(q);
            return next;
        });
    };
    const resetFilter = () => { setSearch(''); setQualities(new Set()); };
    const hasFilter = search.trim() !== '' || qualities.size > 0;

    /** 通用过滤：品质多选（OR）+ 文字搜索（名称/描述） */
    const applyFilter = useMemo(() => (items: { name: string; description: string; rarity: EnhancementRarity }[]) => {
        const kw = search.trim().toLowerCase();
        return items.filter(it => {
            if (qualities.size > 0 && !qualities.has(it.rarity)) return false;
            if (kw) {
                const hay = `${it.name} ${it.description}`.toLowerCase();
                if (!hay.includes(kw)) return false;
            }
            return true;
        });
    }, [search, qualities]);

    // [2026-08-26 莉莉子] 解锁判定：开发者账号全解锁；普通账号按 settings 记录（获得过才解锁）
    const isDev = userSystem?.userId === 'dev_full_admin';
    const unlockedEnhSet = useMemo(() => new Set<string>(userSystem?.settings?.unlockedRogueEnhancements ?? []), [userSystem]);
    const unlockedEquipSet = useMemo(() => new Set<string>(userSystem?.settings?.unlockedRogueEquipments ?? []), [userSystem]);
    const isEnhUnlocked = (id: string) => isDev || unlockedEnhSet.has(id);
    const isEquipUnlocked = (id: string) => isDev || unlockedEquipSet.has(id);

    // [2026-08-26 莉莉子] 过滤后按品质排序（common→rare→epic→legendary，同品质保持原顺序）
    const enhList = useMemo(() =>
        applyFilter(PLAYER_ENHANCEMENTS).sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]),
        [applyFilter]);
    const equipList = useMemo(() =>
        applyFilter(EQUIPMENT_DEFS).sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]),
        [applyFilter]);

    /** 六边形图标容器（品质色描边发光） */
    const hexIcon = (icon: string, alt: string, color: string) => (
        <div
            className="w-16 h-16 mx-auto flex items-center justify-center"
            style={{
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                background: `${color}18`,
                border: `1px solid ${color}66`,
                boxShadow: `0 0 18px ${color}22`,
            }}
        >
            <img src={icon} alt={alt} className="w-full h-full object-cover" draggable={false} />
        </div>
    );

    /** 品质标签 */
    const rarityBadge = (rarity: EnhancementRarity) => {
        const meta = RARITY_META[rarity];
        return (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>
                {meta.label}
            </span>
        );
    };

    /** 强化信息块 */
    const renderEnhBlock = (e: MazeBuff) => {
        const meta = RARITY_META[e.rarity];
        const trigger = e.battleEffect?.trigger;
        const effectClass = e.battleEffect?.effectClass;
        return (
            <div
                key={e.id}
                className="rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:scale-[1.03] hover:-translate-y-0.5 cursor-pointer"
                style={{ background: meta.cardBg, borderColor: `${meta.color}55`, boxShadow: `0 0 20px ${meta.color}1f` }}
            >
                {hexIcon(e.icon, e.name, meta.color)}
                <div className="text-center text-sm font-bold tracking-wide truncate"
                    style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>{e.name}</div>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {rarityBadge(e.rarity)}
                    {trigger && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/10">
                            {TRIGGER_LABELS[trigger]}
                        </span>
                    )}
                </div>
                <p className="text-gray-400 text-xs leading-snug line-clamp-3 min-h-[3rem]">{e.description}</p>
                {effectClass && (
                    <div className="mt-auto text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-purple-200 border border-purple-400/30 bg-purple-500/10">
                            {EFFECT_LABELS[effectClass]}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    /** 装备信息块 */
    const renderEquipBlock = (e: EquipmentDef) => {
        const meta = RARITY_META[e.rarity];
        const badges = getEquipBadges(e);
        return (
            <div
                key={e.id}
                className="rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:scale-[1.03] hover:-translate-y-0.5 cursor-pointer"
                style={{ background: meta.cardBg, borderColor: `${meta.color}55`, boxShadow: `0 0 20px ${meta.color}1f` }}
            >
                {hexIcon(e.icon, e.name, meta.color)}
                <div className="text-center text-sm font-bold tracking-wide truncate"
                    style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>{e.name}</div>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {rarityBadge(e.rarity)}
                    {e.isArmament && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-200 border border-amber-300/30 bg-amber-400/10">武装</span>
                    )}
                </div>
                <p className="text-gray-400 text-xs leading-snug line-clamp-3 min-h-[3rem]">{e.description}</p>
                {badges.length > 0 && (
                    <div className="mt-auto flex flex-wrap justify-center gap-1.5">
                        {badges.map(b => (
                            <span key={b} className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-mono text-cyan-200 border border-cyan-400/30 bg-cyan-500/10">{b}</span>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    /** [2026-08-26 莉莉子] 未解锁占位块：灰块 + 问号 + 锁定（刺激收集，类似遗物收藏） */
    const renderLockedBlock = () => (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 flex flex-col gap-3 items-center justify-center min-h-[190px]">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/10">
                <Lock size={22} className="text-gray-600" />
            </div>
            <div className="text-sm font-bold text-gray-600 tracking-widest">？？？</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono text-gray-500 border border-white/10 bg-white/[0.04]">未解锁</span>
        </div>
    );

    const currentList = tab === 'enhancement' ? enhList : equipList;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[1000] bg-gradient-to-br from-slate-950 via-indigo-950/80 to-slate-900 text-white font-sans select-none overflow-hidden"
        >
            {/* 顶部栏：返回 + 标题 + 筛选（搜索 + 品质多选 + 重置） */}
            <div className="relative z-20 flex items-center gap-4 px-6 pt-5 pb-4 border-b border-white/10 bg-black/30 backdrop-blur-sm">
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/40 transition-all group"
                    title="返回"
                >
                    <ArrowLeft size={20} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
                <div className="flex flex-col">
                    <span className="text-lg font-black tracking-widest drop-shadow-[0_0_12px_rgba(139,92,246,0.5)]">逻辑研习</span>
                    <span className="text-[11px] text-gray-400 font-mono tracking-wider">悖论图鉴 · CODEX</span>
                </div>

                {/* 筛选区 */}
                <div className="ml-auto flex items-center gap-2">
                    {/* 文字搜索 */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="搜索名称 / 描述…"
                            className="w-44 pl-8 pr-7 py-1.5 rounded-full bg-white/[0.06] border border-white/15 focus:border-purple-400/60 focus:bg-white/[0.09] outline-none text-sm placeholder-gray-500 transition-all"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* 品质多选 */}
                    <div className="flex items-center gap-1.5">
                        {QUALITY_ORDER.map(q => {
                            const meta = RARITY_META[q];
                            const active = qualities.has(q);
                            const Icon = meta.Icon;
                            return (
                                <button
                                    key={q}
                                    onClick={() => toggleQuality(q)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all text-xs"
                                    style={{
                                        borderColor: active ? `${meta.color}aa` : 'rgba(255,255,255,0.12)',
                                        background: active ? `${meta.color}22` : 'rgba(255,255,255,0.04)',
                                        color: active ? meta.color : '#9ca3af',
                                    }}
                                    title={meta.label}
                                >
                                    <Icon size={13} fill={active ? meta.color : 'none'} strokeWidth={1.8} style={{ color: meta.color }} />
                                    {meta.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* 重置筛选 */}
                    {hasFilter && (
                        <button
                            onClick={resetFilter}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs hover:bg-amber-500/25 transition-all"
                        >
                            <RotateCcw size={13} />
                            重置
                        </button>
                    )}
                </div>
            </div>

            {/* 主体：左侧 tab 侧边栏 + 方块网格 */}
            <div className="relative h-[calc(100%-80px)] flex">
                {/* 左侧侧边栏：装备 / 强化 tab */}
                <div className="w-44 shrink-0 border-r border-white/10 bg-black/20 flex flex-col gap-1.5 p-3">
                    <button
                        onClick={() => setTab('equipment')}
                        className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-all text-sm
                            ${tab === 'equipment'
                                ? 'bg-purple-500/20 border-purple-400/50 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)]'
                                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    >
                        <Swords size={16} className="shrink-0" />
                        <span className="font-medium">装备图鉴</span>
                        <span className="ml-auto text-[10px] font-mono opacity-60">{EQUIPMENT_DEFS.length}</span>
                    </button>
                    <button
                        onClick={() => setTab('enhancement')}
                        className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-all text-sm
                            ${tab === 'enhancement'
                                ? 'bg-purple-500/20 border-purple-400/50 text-white shadow-[0_0_16px_rgba(168,85,247,0.3)]'
                                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                    >
                        <Sparkles size={16} className="shrink-0" />
                        <span className="font-medium">强化图鉴</span>
                        <span className="ml-auto text-[10px] font-mono opacity-60">{PLAYER_ENHANCEMENTS.length}</span>
                    </button>
                </div>

                {/* 方块网格（[2026-08-26] 隐藏滚动条保留滚轮；未解锁显示锁定块） */}
                <div className="flex-1 overflow-y-auto px-6 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {currentList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-500">
                            <Inbox size={44} />
                            <span className="text-sm font-mono">无匹配条目</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
                            {currentList.map(it => {
                                if (tab === 'enhancement') {
                                    const e = it as MazeBuff;
                                    return isEnhUnlocked(e.id) ? renderEnhBlock(e) : renderLockedBlock();
                                }
                                const e = it as EquipmentDef;
                                return isEquipUnlocked(e.id) ? renderEquipBlock(e) : renderLockedBlock();
                            })}
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
