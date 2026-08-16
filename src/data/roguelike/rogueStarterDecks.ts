// ==========================================
// 悖论迷宫 · 天启者与初始牌组
// 简化方案：按阵营筛选可收集卡 + 天启者本体，构建 ~10 张初始牌组
// 后续可替换为手写的更平衡初始牌组
// ==========================================
import { CARD_DB } from '../cards';

export interface RogueHeroInfo {
    key: string;
    name: string;
    region: string;
}

export const ROGUE_HEROES: RogueHeroInfo[] = [
    { key: 'lyfe', name: '里芙', region: 'Lyfe' },
    { key: 'fenny', name: '芬妮', region: 'Fenny' },
    { key: 'pupu_specular_soul', name: '卜卜·灵鉴', region: 'Pupu' },
    { key: 'mauxir_lotus_drive', name: '猫汐尔·莲驱', region: 'Mauxir' },
    { key: 'acacia_chrono_echo', name: '安卡希雅·时之重奏', region: 'Acacia' },
];

// 简化：取同阵营前 9 张可收集非英雄卡 + 天启者本体 → 10 张初始牌组
export const buildStarterDeck = (heroKey: string): string[] => {
    const hero = ROGUE_HEROES.find(h => h.key === heroKey);
    if (!hero) return ['lyfe'];
    const pool = Object.values(CARD_DB).filter(c =>
        c.region === hero.region &&
        c.isCollectible !== false &&
        !c.isChampion
    );
    const picked = pool.slice(0, 9).map(c => c.key);
    return [heroKey, ...picked];
};

// [2026-08-13] 读取个性化配置的肉鸽初始牌组（开发者编辑的 rogue_starter_{heroKey} 牌组优先），否则默认 buildStarterDeck
export const getConfiguredStarterDeck = (
    decks: { id: string; cards: Record<string, number> }[],
    heroKey: string,
): string[] => {
    const custom = decks?.find(d => d.id === `rogue_starter_${heroKey}`);
    if (custom && Object.keys(custom.cards).length > 0) {
        return Object.entries(custom.cards).flatMap(([k, c]) => Array(c).fill(k));
    }
    return buildStarterDeck(heroKey);
};
