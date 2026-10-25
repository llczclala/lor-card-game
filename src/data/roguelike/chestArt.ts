// ==========================================
// 匣子插画 · 唯一真源（chestArt）
// [2026-10-20 莉莉子 🎨 视觉层优化] 14 张匣子插画接入 UI：
//   · 12 张 = kind（armament 武装匣 / shard 神经匣）× rarity（六档品质）
//   · 2 张  = 武装匣兑换券（voucher）、万能神格碎片（universal shard）
//
// ⚠️ 设计约束（程拍板）：插画**本身已画好六边形外框** ⇒ UI 侧一律
//   `<img className="w-full h-full object-contain" />` 整图显示，
//   **不要再套 clipPath: HEXAGON**（再裁一次会把设计师画的框角切掉）。
//
// 写法对齐 dialogueBg.ts：import → Record → getter，最小范例。
// ==========================================
import type { ChestKind } from './divinityShards';
import type { EnhancementRarity } from './buffs';

// ── 武装匣（armament）──
import chestArmamentCommon from '../../image/equipment/box/chest_armament_common.webp';
import chestArmamentUncommon from '../../image/equipment/box/chest_armament_uncommon.webp';
import chestArmamentRare from '../../image/equipment/box/chest_armament_rare.webp';
import chestArmamentEpic from '../../image/equipment/box/chest_armament_epic.webp';
import chestArmamentLegendary from '../../image/equipment/box/chest_armament_legendary.webp';
import chestArmamentMythic from '../../image/equipment/box/chest_armament_mythic.webp';
// ── 神经匣 / 神格碎片匣（shard）──
import chestShardCommon from '../../image/equipment/box/chest_shard_common.webp';
import chestShardUncommon from '../../image/equipment/box/chest_shard_uncommon.webp';
import chestShardRare from '../../image/equipment/box/chest_shard_rare.webp';
import chestShardEpic from '../../image/equipment/box/chest_shard_epic.webp';
import chestShardLegendary from '../../image/equipment/box/chest_shard_legendary.webp';
import chestShardMythic from '../../image/equipment/box/chest_shard_mythic.webp';
// ── 券 / 万能碎片 ──
import voucherArmament from '../../image/equipment/box/voucher_armament.webp';
import shardUniversal from '../../image/equipment/box/shard_universal.webp';

/** 匣子插画：kind × rarity → 图片 URL */
export const CHEST_ART: Record<ChestKind, Record<EnhancementRarity, string>> = {
    armament: {
        common: chestArmamentCommon,
        uncommon: chestArmamentUncommon,
        rare: chestArmamentRare,
        epic: chestArmamentEpic,
        legendary: chestArmamentLegendary,
        mythic: chestArmamentMythic,
    },
    shard: {
        common: chestShardCommon,
        uncommon: chestShardUncommon,
        rare: chestShardRare,
        epic: chestShardEpic,
        legendary: chestShardLegendary,
        mythic: chestShardMythic,
    },
};

/** 匣子中文名（alt / tooltip 用） */
export const CHEST_ART_NAME: Record<ChestKind, Record<EnhancementRarity, string>> = {
    armament: {
        common: '基础后勤补给箱',
        uncommon: '制式战术收纳箱',
        rare: '零区样本收容箱',
        epic: '高风险尘白样本封存舱',
        legendary: '泰坦碎片级收容单元',
        mythic: '尘白奇点容器',
    },
    shard: {
        common: '一次性生物转运载片',
        uncommon: '密封培养载皿',
        rare: '微型神经传感载台',
        epic: '多通道神经信号锚定台',
        legendary: '共感力场锚节点',
        mythic: '瓦尔哈拉共感奇点锚点',
    },
};

/** 武装匣兑换券（匣券） */
export const VOUCHER_ART: string = voucherArmament;

/** 万能神格碎片 */
export const UNIVERSAL_SHARD_ART: string = shardUniversal;

/** 取匣子插画 URL（kind × rarity 恒定命中，永不 undefined） */
export const getChestArt = (kind: ChestKind, rarity: EnhancementRarity): string =>
    CHEST_ART[kind]?.[rarity] ?? CHEST_ART.armament.common;

/** 取匣子中文名（alt / tooltip 用） */
export const getChestArtName = (kind: ChestKind, rarity: EnhancementRarity): string =>
    CHEST_ART_NAME[kind]?.[rarity] ?? CHEST_ART_NAME.armament.common;
