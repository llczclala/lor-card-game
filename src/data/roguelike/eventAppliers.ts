// ==========================================
// 悖论迷宫 · 事件效果注册表（唯一真源）
// [2026-10-05 莉莉子 · 方案 P3/P4 结构重构]
// ── 病根：效果执行原先写在 `App.tsx` 的 60 行长 if 链里，而"选项上的提示"另写在
//    `NodeEventModal.effectHints` —— **同一套语义两处各写一遍** ⇒ 必然漏
//    （赌局只显示概率、挑战不显示胜利奖励，就是这么漏出来的）。
// ── 本模块把两件事收成一份：`preview*`（选项上给玩家看的"预演"）+ `apply*`（真正执行并产出"结果文案"）。
//    两者共用同一张 `EVENT_EFFECT_META` 元信息（图标 + 名称），因此**不可能再不一致**。
// ── `apply*` 会**返回它实际做了什么**（抽到哪张卡/哪个强化/哪件装备）⇒ 事件弹窗的「结果」步骤直接渲染它
//    （玩家不用再靠猜血条金币判断拿到了什么）。
// ==========================================
import { CARD_DB } from '../cards';
import { pickRandomEnhancements } from './enhancements';
// [2026-10-08 莉莉子 · 瓦尔基里大赛] 「指定强化」奖励要查名字（addEnhancementFrom）
import { getBuffById } from './buffs';
import { generateCardOffers } from './shop';
import { getEquipPoolForCard } from '../equipment';
// [2026-10-08 莉莉子 · 难度分层] 事件奖励：数值收益走倍率、品质类走难度权重表（唯一真源）
import { equipWeightsFor, gainMultFor, weightedPick } from './difficultyTiers';
import type { RogueDifficulty } from './difficulties';
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import type { RogueEventEffect, RogueInvestment } from './events';

/** 一条"给玩家看的结果"（结果步骤按 kind 分两栏渲染） */
export interface EventApplyResult {
    kind: 'gain' | 'cost' | 'info';
    icon: string;
    text: string;
}

/**
 * 注册表需要的能力 —— 由 App 注入（`rogue.*` + 几个 App 内的工具函数）。
 * 设计上**不直接 import hook**：保持数据层纯净、也便于单测与复用。
 */
export interface EventApi {
    run: RoguelikeRunState;
    /** [2026-10-08 难度分层] 本局难度 —— 数值收益吃倍率、品质类奖励吃难度权重表 */
    difficulty: RogueDifficulty;
    addGold(n: number): void;
    heal(n: number): void;
    setHp(n: number): void;
    adjustMaxHp(n: number): void;
    addRevive(n: number): void;
    addRefresh(n: number): void;
    addCard(cardKey: string): void;
    /** ⚠️ `equipId` 必填：所有调用点都已确认拿到具体装备（见 addEquippedCard 分支的 if 判定） */
    addEquippedCard(cardKey: string, equipId: string): void;
    removeCard(cardKey: string): void;
    removeRandomEquipment(): void;
    applyEnhancement(id: string): void;
    addInvestment(inv: RogueInvestment): void;
    addFightDebuff(d: NonNullable<RogueEventEffect['fightDebuff']>): void;
    recordCodexUnlock(type: 'enhancement' | 'equipment', id: string): void;
    randomCollectibleCard(): string;
    randomJunkCard(): string;
    pickNewEquipForHero(): string | undefined;
}

/** 效果的图标（提示与结果共用，避免两处各写一份） */
const ICONS: Record<string, string> = {
    gold: '💰', hp: '❤️', hpPct: '❤️', maxHp: '🫀', revive: '🕯️', refresh: '🔄',
    addRandomCard: '🃏', addEquippedCard: '🎴', polluteDeck: '☠️', removeCards: '🗑️', upgradeCard: '🔧',
    addEnhancement: '🧬', addEquipment: '🛡️', removeEquipment: '📤',
    gamble: '🎲', forced: '🌀', invest: '🌱', fight: '⚔️', fightDebuff: '⚠️',
};

const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** 单条效果 → 玩家可读文案（**预演**用；不含"实际抽到了什么"） */
export const previewEffect = (ef: RogueEventEffect, difficulty?: RogueDifficulty): string => {
    // [2026-10-08 难度分层] 预演文案必须吃**同一倍率** —— 否则"选项写 +60、实际给 +96"，
    //   正是 2026-10-05 那次「提示与执行同源」重构要防的事
    const m = gainMultFor(difficulty);
    const g = (v: number) => (v > 0 ? Math.round(v * m) : v);
    if (ef.gold) return `数据金 ${signed(g(ef.gold))}`;
    if (ef.hp) return `生命 ${signed(g(ef.hp))}`;
    if (ef.hpPct) return `生命 ${pct(g(ef.hpPct))}`;
    if (ef.maxHp) return `生命上限 ${signed(g(ef.maxHp))}`;
    if (ef.revive) return `复活 ×${ef.revive}`;
    if (ef.refresh) return `刷新 ×${ef.refresh}`;
    if (ef.addEquippedCard) return '带装备的卡';
    if (ef.addRandomCard) return '随机卡牌';
    if (ef.polluteDeck) return '牌组污染（+1 张非收集卡）';
    if (ef.upgradeCard) return '给一张卡追加装备';
    if (ef.addEnhancement) return '迷宫强化';
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] 指定强化（从给定 id 里随机 1）—— 把名字直接写出来，玩家才知道要拿什么
    if (ef.addEnhancementFrom?.length) {
        const names = ef.addEnhancementFrom.map(id => getBuffById(id)?.name ?? id);
        return names.length === 1 ? `迷宫强化「${names[0]}」` : `迷宫强化（${names.join(' / ')}，随机 1）`;
    }
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] 固定赠送天启者卡 + N 件装备
    if (ef.grantHeroCard) {
        const nm = CARD_DB[ef.grantHeroCard.heroKey]?.name?.replace(/\n/g, '') ?? ef.grantHeroCard.heroKey;
        return `天启者「${nm}」+ ${ef.grantHeroCard.equipCount} 件装备`;
    }
    if (ef.addEquipment) return '装备';
    if (ef.removeEquipment) return '交出装备';
    if (ef.removeCards) return `删卡 ×${ef.removeCards}`;
    if (ef.invest) {
        if (ef.invest.kind === 'battleWinGold') return `投资：战斗胜利时 +${ef.invest.value ?? 0} 数据金`;
        if (ef.invest.kind === 'restHeal') return ef.invest.value ? `投资：休息回血 ×${ef.invest.value}` : '投资：下次休息回血翻倍';
        return '投资：下次强化品质 +1';
    }
    if (ef.fightDebuff) return `未来 ${ef.fightDebuff.fights} 场：敌人水晶 +${ef.fightDebuff.enemyHpBonus}`;
    return '';
};

/** 一个选项的全部效果 → 提示字符串（多效果用 · 连接） */
export const previewEffects = (effects: RogueEventEffect[], difficulty?: RogueDifficulty): string => {
    const parts: string[] = [];
    for (const ef of effects) {
        // 赌局/强制/战斗：把"里面是什么"展开（这三类是过去最容易漏的地方）
        if (ef.gamble) {
            const p = Math.round(ef.gamble.prob * 100);
            parts.push(`胜(${p}%)：${previewEffects(ef.gamble.win, difficulty)} · 负(${100 - p}%)：${previewEffects(ef.gamble.lose, difficulty)}`);
            continue;
        }
        if (ef.forced) { parts.push(`命运转盘：${ef.forced.length} 种结果随机 1 种`); continue; }
        if (ef.fight) { parts.push(`迎战 → 胜利后${ef.fight.reward === 'choose2' ? '二选一奖励' : '迷宫强化'}`); continue; }
        const one = previewEffect(ef, difficulty);
        if (one) parts.push(one);
    }
    return parts.join(' · ') || '……';
};

/**
 * 执行一个效果（含 gamble/forced 的递归），**返回它实际做了什么**。
 * ⚠️ 行为与重构前的 `App.applyEventEffects` 逐条一致（仅多了结果收集）。
 */
export const applyEffect = (ef: RogueEventEffect, api: EventApi): EventApplyResult[] => {
    const out: EventApplyResult[] = [];
    const gain = (icon: string, text: string) => out.push({ kind: 'gain', icon, text });
    const cost = (icon: string, text: string) => out.push({ kind: 'cost', icon, text });

    // [2026-10-08 莉莉子 · 难度分层] **只放大"玩家获得"的部分**（正值 ×倍率）；代价（负值）原样不动。
    //   理由：绝密敌人已经更强，收益放大 + 代价不变才是净鼓励；代价也放大会变成双重惩罚。
    //   ⚠️ 复活 / 刷新 **刻意不缩放**：它们是"次数"型小整数，×1.3/×1.6 取整后会出现
    //      "机密不变、绝密 +2"的跳变，玩家无法从选项文案推断，反而更难解释。
    const gainMult = gainMultFor(api.difficulty);
    const scaled = (v: number) => (v > 0 ? Math.round(v * gainMult) : v);
    if (ef.gold) { const v = scaled(ef.gold); api.addGold(v); (v > 0 ? gain : cost)(ICONS.gold, `数据金 ${signed(v)}`); }
    if (ef.hp) {
        const v = scaled(ef.hp);
        if (v > 0) { api.heal(v); gain(ICONS.hp, `生命 +${v}`); }
        else { api.setHp(api.run.hp + v); cost(ICONS.hp, `生命 ${v}`); }
    }
    if (ef.hpPct) {
        const p = scaled(ef.hpPct); // 放大的是**百分比本身**，保证与预览文案一致
        const amt = Math.floor(api.run.maxHp * p / 100);
        if (amt > 0) { api.heal(amt); gain(ICONS.hp, `生命 +${amt}（${pct(p)}）`); }
        else { api.setHp(api.run.hp + amt); cost(ICONS.hp, `生命 ${amt}（${pct(p)}）`); }
    }
    if (ef.maxHp) { const v = scaled(ef.maxHp); api.adjustMaxHp(v); (v > 0 ? gain : cost)(ICONS.maxHp, `生命上限 ${signed(v)}`); }
    if (ef.revive) { api.addRevive(ef.revive); (ef.revive > 0 ? gain : cost)(ICONS.revive, `复活 ×${ef.revive}`); }
    if (ef.refresh) { api.addRefresh(ef.refresh); (ef.refresh > 0 ? gain : cost)(ICONS.refresh, `刷新 ×${ef.refresh}`); }

    if (ef.addRandomCard) {
        const k = api.randomCollectibleCard();
        if (k) { api.addCard(k); gain(ICONS.addRandomCard, `卡牌「${CARD_DB[k]?.name?.replace(/\n/g, '') ?? k}」`); }
    }
    if (ef.addEquippedCard) {
        // [不叠加] 装备候选排除该卡已有装备
        const offer = generateCardOffers(1, api.run.equippedCards, { difficulty: api.difficulty })[0]; // [2026-10-08 难度分层]
        if (offer) {
            api.addCard(offer.cardKey);
            const nm = CARD_DB[offer.cardKey]?.name?.replace(/\n/g, '') ?? offer.cardKey;
            if (offer.equipId) {
                api.addEquippedCard(offer.cardKey, offer.equipId);
                api.recordCodexUnlock('equipment', offer.equipId);
                gain(ICONS.addEquippedCard, `带装备的卡「${nm}」`);
            } else {
                gain(ICONS.addRandomCard, `卡牌「${nm}」`);
            }
        }
    }
    if (ef.polluteDeck) {
        const k = api.randomJunkCard();
        if (k) { api.addCard(k); cost(ICONS.polluteDeck, `牌组污染：+1 张「${CARD_DB[k]?.name?.replace(/\n/g, '') ?? k}」`); }
    }
    if (ef.upgradeCard) {
        const nonHero = api.run.deck.filter(k => !CARD_DB[k]?.isChampion);
        const eqMap = api.run.equippedCards ?? {};
        const upgradable = nonHero.filter(k => getEquipPoolForCard(CARD_DB[k], eqMap[k]).length > 0);
        if (upgradable.length) {
            const cardKey = upgradable[Math.floor(Math.random() * upgradable.length)];
            const equipPool = getEquipPoolForCard(CARD_DB[cardKey], eqMap[cardKey]);
            // [2026-10-08 难度分层] 追加装备改按难度品质权重（原来均匀抽；池非空时 weightedPick 必有返回）
            const equipTable = equipWeightsFor(api.difficulty);
            const equip = weightedPick(equipPool, e => equipTable[e.rarity] ?? 0)!;
            api.addEquippedCard(cardKey, equip.id);
            api.recordCodexUnlock('equipment', equip.id);
            gain(ICONS.upgradeCard, `「${CARD_DB[cardKey]?.name?.replace(/\n/g, '') ?? cardKey}」追加装备`);
        } else {
            out.push({ kind: 'info', icon: ICONS.upgradeCard, text: '没有可追加装备的卡（已全满）' });
        }
    }
    if (ef.removeCards) {
        const removed: string[] = [];
        for (let i = 0; i < ef.removeCards; i++) {
            const deck = api.run.deck;
            if (!deck.length) break;
            const k = deck[Math.floor(Math.random() * deck.length)];
            removed.push(CARD_DB[k]?.name?.replace(/\n/g, '') ?? k);
            api.removeCard(k);
        }
        if (removed.length) cost(ICONS.removeCards, `移除卡牌 ${removed.length} 张（${removed.join(' / ')}）`);
    }
    if (ef.addEnhancement) {
        // [不叠加] 排除本局已拥有
        // [2026-10-08 难度分层] 原第二参写死 `undefined`（假参与）⇒ 现传本局难度
        const enh = pickRandomEnhancements(1, api.difficulty, api.run.rarityBonus, api.run.passUnlockedEnhancements, api.run.enhancements)[0];
        if (enh) { api.applyEnhancement(enh.id); api.recordCodexUnlock('enhancement', enh.id); gain(ICONS.addEnhancement, `迷宫强化「${enh.name}」`); }
    }
    if (ef.addEquipment) {
        const equipId = api.pickNewEquipForHero();
        if (equipId) { api.addEquippedCard(api.run.heroKey, equipId); api.recordCodexUnlock('equipment', equipId); gain(ICONS.addEquipment, '装备 ×1（已挂在天启者身上）'); }
    }
    // ── [2026-10-08 莉莉子 · 瓦尔基里大赛] 两种「确定性」奖励 ──
    //   与 `addEnhancement`（随机池）的区别：这里是**从给定 id 里选**，用于"三档给不同强化"
    if (ef.addEnhancementFrom?.length) {
        const id = ef.addEnhancementFrom[Math.floor(Math.random() * ef.addEnhancementFrom.length)];
        const def = getBuffById(id);
        api.applyEnhancement(id);
        api.recordCodexUnlock('enhancement', id);
        gain(ICONS.addEnhancement, `迷宫强化「${def?.name ?? id}」`);
    }
    //   固定赠送天启者卡（含装备）——
    //   ⚠️ 装备取池走手册的**池铁律** `getEquipPoolForCard(card)`，品质走难度加权，
    //      与上方 `upgradeCard` 分支完全同款（别直接遍历 EQUIPMENT_DEFS：含局外武装）
    if (ef.grantHeroCard) {
        const { heroKey, equipCount } = ef.grantHeroCard;
        const heroName = CARD_DB[heroKey]?.name?.replace(/\n/g, '') ?? heroKey;
        api.addCard(heroKey);
        const eqMap = api.run.equippedCards ?? {};
        const picked: string[] = [];
        for (let i = 0; i < equipCount; i++) {
            const pool = getEquipPoolForCard(CARD_DB[heroKey], [...(eqMap[heroKey] ?? []), ...picked]);
            if (!pool.length) break;
            const table = equipWeightsFor(api.difficulty);
            const eq = weightedPick(pool, e => table[e.rarity] ?? 0);
            if (!eq) break;
            picked.push(eq.id);
            api.addEquippedCard(heroKey, eq.id);
            api.recordCodexUnlock('equipment', eq.id);
        }
        gain(ICONS.addRandomCard, `天启者「${heroName}」${picked.length ? `（带 ${picked.length} 件装备）` : ''}`);
    }
    if (ef.removeEquipment) { api.removeRandomEquipment(); cost(ICONS.removeEquipment, '交出一件随机装备'); }

    if (ef.gamble) {
        const won = Math.random() < ef.gamble.prob;
        out.push({ kind: 'info', icon: ICONS.gamble, text: won ? `赌局：胜（${Math.round(ef.gamble.prob * 100)}%）` : `赌局：负（${100 - Math.round(ef.gamble.prob * 100)}%）` });
        for (const sub of (won ? ef.gamble.win : ef.gamble.lose)) out.push(...applyEffect(sub, api));
    }
    if (ef.forced && ef.forced.length) {
        out.push({ kind: 'info', icon: ICONS.forced, text: '命运转盘：结果已定' });
        for (const sub of ef.forced[Math.floor(Math.random() * ef.forced.length)]) out.push(...applyEffect(sub, api));
    }
    if (ef.invest) { api.addInvestment(ef.invest); out.push({ kind: 'info', icon: ICONS.invest, text: previewEffect(ef) || '投资已记录' }); }
    if (ef.fightDebuff) { api.addFightDebuff(ef.fightDebuff); cost(ICONS.fightDebuff, `未来 ${ef.fightDebuff.fights} 场：敌人水晶 +${ef.fightDebuff.enemyHpBonus}`); }

    return out;
};
