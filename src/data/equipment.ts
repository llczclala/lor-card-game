// ==========================================
// 装备系统 · 统一装备库（挂载在单张卡牌上）
// [2026-08-12 莉莉子] 装备区别于迷宫强化（团队被动）——装备只强化单张卡牌。
//   - 视觉：六边形方块，挂载在手牌卡面样式外的右侧右下角，多个从下往上依次排列
//   - 效果：attachEquipment 挂载时把静态修饰（费用/关键词/攻血）写入卡牌数据，
//     渲染 / 费用判定 / 战斗数值全部走现有数据通路；打出时效果（onPlay）声明式执行
//   - 挂载入口（战斗奖励 / 商店 / 牌组）由后续系统调用 attachEquipment 接入，本文件只管定义 + 挂载工具
// ==========================================

import type { CardData, Keyword } from '../types';
import type { EquipmentQuestReward, QuestSpec } from './questTypes'; // [2026-09-25 莉莉子] 三线任务化框架：任务声明与兑现
import abc_spell from '../image/spells/abc.webp';
import equipment_resonance from '../image/equipment/equipment00.webp'; // [2026-09-09] 碳原子板专属图（程提供）
import equipment_retrain from '../image/equipment/equipment01.webp'; // [2026-09-09] 重修申请专属图（程提供）
// ── [2026-09-11 程拍板 · 第一批后勤干员图标] 20 位后勤干员的招牌物件（均取自各自原画上的元素）──
//    命名规则：eq_{干员英文}_{物件英文}；「一张图 = 一位干员 = 一件装备/武装」，
//    图标语义 → 干员身份/性格 → 决定它挂在哪个效果上（效果与数值保持原样不动）。
import eq_peaches_medkit from '../image/equipment/equipment02.webp';      // 御守·桃子 —— 手里的医疗箱
import eq_cattail_bot from '../image/equipment/equipment03.webp';         // 御守·香蒲 —— 肩上的小机器人
import eq_scorching_guitar from '../image/equipment/equipment04.webp';    // 御守·灼 —— 背着的吉他盒
import eq_arrowhead_cannon from '../image/equipment/equipment05.webp';    // 阿尔戈·箭头 —— 手臂上的手炮
import eq_musician_case from '../image/equipment/equipment06.webp';       // 阿尔戈·乐手 —— 小提琴琴箱
import eq_pigeon_patch from '../image/equipment/equipment07.webp';        // 阿尔戈·鸽子 —— 眼罩
import eq_mabel_hat from '../image/equipment/equipment08.webp';           // 重叶·梅贝尔 —— 帽子
import eq_elice_shears from '../image/equipment/equipment09.webp';        // 重叶·伊莉斯 —— 手里的园丁剪
import eq_golia_staff from '../image/equipment/equipment10.webp';         // 重叶·歌莉娅 —— 手里的法杖
import eq_maeve_drink from '../image/equipment/equipment11.webp';         // 阿尔斯特·梅芙 —— 手里的饮料
import eq_koni_device from '../image/equipment/equipment12.webp';         // 阿尔斯特·科尼 —— 便携信号装置
import eq_flamme_case from '../image/equipment/equipment13.webp';         // 阿尔斯特·弗拉梅 —— 随身拉着的箱子
import eq_613_headset from '../image/equipment/equipment14.webp';         // 堤丰·613 —— 头戴式耳机
import eq_dornier_apple from '../image/equipment/equipment15.webp';       // 堤丰·多尼尔 —— 戴着的帽子（含金苹果）
import eq_flameheart_exo from '../image/equipment/equipment16.webp';      // 堤丰·焰心 —— 携带的装置（外骨骼）
import eq_an_uniform from '../image/equipment/equipment17.webp';
   // 鸦眼·安 —— 衣服（制服）
import eq_hiki_book from '../image/equipment/equipment18.webp';           // 鸦眼·海基 —— 手里拿的书
import eq_valerie_kit from '../image/equipment/equipment19.webp';         // 布里吉·瓦莱莉 —— 随身工具箱（PNG 原格式）
import eq_feier_camera from '../image/equipment/equipment20.webp';        // 布里吉·菲儿 —— 胸口挂着的相机（PNG 原格式）
import eq_chinchilla_glasses from '../image/equipment/equipment21.webp';  // 布里吉·金吉拉 —— 戴着的眼镜（PNG 原格式）

// [2026-08-27 莉莉子] 六档品质：白 common / 绿 uncommon / 蓝 rare / 紫 epic / 金 legendary / 红 mythic
export type EquipmentRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** 装备打出时效果声明（判别联合，按 class 收窄） */
export type EquipmentOnPlay =
    | { class: 'STRIKE_ENEMY_BENCH'; value: number } // 对敌方备战席所有单位造成的伤害
    | { class: 'POISON_ENEMY_ALL' };                 // [2026-09-12 莉莉子 剧毒] 赋予敌方全体【剧毒】

/** 装备回合开始效果声明（武装用，当前仅一类：回合开始恢复全部法术法力） */
export interface EquipmentRoundStart {
    class: 'RESTORE_SPELL_MANA'; // 回合开始恢复己方全部法术法力
}

/** [2026-08-20 成长型装备] 触发式成长声明：事件发生时，给目标永久 +power/+health（须在场） */
export interface EquipmentTrigger {
    event: 'player_cast_spell' | 'after_attack' | 'after_attacked';
    target: 'self' | 'random_ally'; // self=装备卡自己；random_ally=随机在场我方单位
    power: number;
    health: number;
}

export interface EquipmentDef {
    id: string;
    name: string;
    description: string;
    rarity: EquipmentRarity;
    icon: string;             // 六边形中间卡面（当前 abc.png 占位）
    isArmament?: boolean;     // [2026-08-14 武装] 武装=特殊装备：局外带入、局内不可获取，进入游戏前配置
    consumable?: boolean;     // [2026-09-07 消耗品武装] 效果发挥后从库存消失（碳原子板/重修申请）；卡包随机池、武装入口需排除此类。
                              //   [2026-09-15] 碳原子板语义收紧：仅通关才"发挥"（翻倍+消耗），败北/中途放弃原样保留
    spellOnly?: boolean;      // [2026-09-28 法术专属装备] **仅法术卡可挂**（单位卡不可）。
                              //   理由：法术与单位价值轴不同 —— 单位装备强化"它站在那里"，法术装备只能强化"这一次结算"
                              //   （费用 / 结算数值 / 回响 / 手牌约束 / 法术法力 / 速度与目标）。见 技术手册/设计-法术专属装备.md
    costMod?: number;         // [静态修饰] 费用修正（装备1：-1）
    keywords?: Keyword[];     // [静态修饰] 附加关键词（装备2：QuickAttack）
    powerMod?: number;        // [静态修饰] 攻击修正（装备4：+4）
    healthMod?: number;       // [静态修饰] 生命修正（装备4：+4）
    onPlay?: EquipmentOnPlay; // [打出时效果] 声明式执行（装备3）
    onRoundStart?: EquipmentRoundStart; // [2026-08-14 武装] 回合开始效果（武装C）
    onTrigger?: EquipmentTrigger; // [2026-08-20 成长型装备] 触发式成长（事件+目标+数值）
    runBonus?: { doubleRunExp?: boolean; retrainUpgrade?: boolean }; // [2026-08-29] 局外带入的整局性效果标记（碳原子板：通关经验翻倍）；[2026-09-07] 重修申请：通关后所在武装槽位品质上限 +1 级
    // ── [2026-09-25 莉莉子 三线任务化框架 v3] 任务型装备 / 武装 ──
    //   与 onTrigger 的区别：onTrigger 是「每次事件都 +N」（无终点）；quest 是「跨过阈值兑一次质变」（有终点、有记忆点）
    quest?: QuestSpec;                   // 任务声明（记在装备自己身上）
    questReward?: EquipmentQuestReward | EquipmentQuestReward[]; // 兑现（跨过阈值时一次性改写卡牌；支持多条叠加，如「+0/+4 与【坚韧】」）
    // [2026-09-25 莉莉子 三线任务化框架 · 武装线] 任务完成后的【战斗内效果】载体：
    //   指向 MAZE_BUFFS 里一条 playerEligible:false 的条目 → 由 RogueGameWrapper 注入本场 rogueEnhancements，
    //   借用迷宫强化的分发管线（trigger + handler + 面板展示）在战斗内生效，不为武装另开执行器。
    grantBattleEffectIds?: string[];
    // ── [2026-09-25 莉莉子 三线任务化框架] 「新机制」与「常驻代价」两条声明 ──
    /** 新机制：持有者阵亡时触发（遗嘱 = 把身上装备转给随机我方单位） */
    onOwnerDie?: { class: 'TRANSFER_EQUIPMENT' };
    /** 常驻代价（Pact）：无法被治疗 —— attachEquipment 写入卡牌，治疗结算处直接跳过 */
    pactNoHeal?: boolean;
    /** 常驻代价（Pact）：每场战斗开局我方水晶 −N（王权之证）—— 在战斗水晶初值处直接扣，不走效果类 */
    pactNexusCost?: number;
    /** [2026-09-25 莉莉子 武装线] 每场战斗结束时若天启者存活 → +N 金币（凯旋之匣）；run 层结算，不走战斗内管线 */
    runBattleEndGold?: number;
    /** [2026-09-25 莉莉子 武装线] 每场战斗首次阵亡时以 1 点生命存活（不屈之证）；要求在死亡清算处拦截 */
    reviveOncePerBattle?: boolean;
}

export const EQUIPMENT_DEFS: EquipmentDef[] = [
    {
        id: 'equip_cost_down',
        name: '海基的推演手记',
        description: '使卡牌费用 -1。',
        rarity: 'epic', icon: eq_hiki_book, // [2026-09-11] 鸦眼·海基的旧书（勘察推演 → 把复杂的事算得更省）· 原名「微缩回路」
        costMod: -1,
    },
    {
        id: 'equip_quick_attack',
        name: '613的调度频道',
        description: '使卡牌获得【先攻】。',
        rarity: 'rare', icon: eq_613_headset, // [2026-09-11] 堤丰·613的头戴耳机（无人机调度/物资配送 → 快速响应）· 原名「迅击模组」
        keywords: ['QuickAttack'],
    },
    {
        id: 'equip_bench_bomb',
        name: '备战爆破',
        description: '打出时，对敌方备战席上的所有单位造成 2 点伤害。',
        rarity: 'epic', icon: abc_spell,
        onPlay: { class: 'STRIKE_ENEMY_BENCH', value: 2 },
    },
    {
        id: 'equip_big_stats',
        name: '钢铁核心',
        description: '使卡牌获得 +6/+5。',
        rarity: 'legendary', icon: abc_spell, // [2026-08-27] 降回金锚点 11 点：均衡（原 +8/+8 超模 16 点）
        powerMod: 6, healthMod: 5,
    },
    // ── [2026-08-19 莉莉子] 第二批装备：关键词类（直接挂载现有关键词，零引擎改动）──
    {
        id: 'equip_thorns',
        name: '荆棘甲壳',
        description: '使卡牌获得【反伤】。',
        rarity: 'uncommon', icon: abc_spell, // [2026-08-27] 原 common→uncommon（六档平移）
        keywords: ['Thorns'],
    },
    {
        id: 'equip_channel',
        name: '科尼的充能装置',
        description: '使卡牌获得【充能】。',
        rarity: 'uncommon', icon: eq_koni_device, // [2026-09-11] 阿尔斯特·科尼的便携装置（装置即储能设备 → 充能）· 原名「能量回路」
        keywords: ['Channel'],
    },
    {
        id: 'equip_challenger',
        name: '菲儿的取景框',
        description: '使卡牌获得【挑战者】。',
        rarity: 'rare', icon: eq_feier_camera, // [2026-09-11] 布里吉·菲儿的相机（取景框锁定目标 → 强拉对手应战）· 原名「挑战装置」
        keywords: ['Challenger'],
    },
    {
        id: 'equip_tough',
        name: '坚韧镀层',
        description: '使卡牌获得【坚韧】。',
        rarity: 'rare', icon: abc_spell,
        keywords: ['Tough'],
    },
    {
        id: 'equip_fearsome',
        name: '金吉拉的礼仪镜',
        description: '使卡牌获得【凶恶】。',
        rarity: 'rare', icon: eq_chinchilla_glasses, // [2026-09-11] 布里吉·金吉拉的眼镜（说教令人无法反驳 → 对手退避）· 原名「威吓压制」
        keywords: ['Fearsome'],
    },
    {
        id: 'equip_lifesteal',
        name: '吸血之刃',
        description: '使卡牌获得【吸血】。',
        rarity: 'epic', icon: abc_spell,
        keywords: ['Lifesteal'],
    },
    {
        id: 'equip_deadly',
        name: '瓦莱莉的送行礼箱',
        description: '打出时，赋予敌方所有单位【剧毒】。',
        rarity: 'epic', icon: eq_valerie_kit, // [2026-09-11] 布里吉·瓦莱莉的葬仪工具箱（为逝者送行 → 剧毒）· 原名「死亡标记」
        // [2026-09-12 莉莉子] 剧毒语义反转：从"给自己挂增益"改为"给敌方全体上负面 debuff"——
        //   送葬工具箱给全场敌人送葬，名字与效果终于咬合。静态 keywords 字段已移除（debuff 不该常驻在装备者身上）
        onPlay: { class: 'POISON_ENEMY_ALL' },
    },
    {
        id: 'equip_elusive',
        name: '鸽子的巡护',
        description: '使卡牌获得【隐秘】。',
        rarity: 'epic', icon: eq_pigeon_patch, // [2026-09-11] 阿尔戈·鸽子的眼罩（巡护 → 让人看不透她）· 原名「灵巧迷彩」
        keywords: ['Elusive'],
    },
    // ── [2026-08-20 莉莉子] 第三批：交易型（费用↔身材交换）+ 属性分档（纯数值）──
    // 交易型：用费用/攻击力换身材，代价直观；攻击有下限 0 保护（getPower clamp），减攻安全
    {
        id: 'equip_trade_bulk',
        name: '重装协定',
        description: '使卡牌费用 +1，获得 +4/+4。',
        rarity: 'epic', icon: abc_spell,
        costMod: 1, powerMod: 4, healthMod: 4,
    },
    {
        id: 'equip_trade_light',
        name: '轻量化改造',
        description: '使卡牌费用 -1，攻击力 -2。',
        rarity: 'epic', icon: abc_spell, // [2026-08-26] 降低费用品质提升两档 common→epic
        costMod: -1, powerMod: -2,
    },
    // 纯属性分档（[2026-08-27] 六档锚点：白1/绿2/蓝4/紫7/金11/红16，偏科主+副）：
    //   白 +1/+0·+0/+1 → 绿 +1/+1·+2/+0 → 蓝 +2/+2·+3/+1 → 紫 +4/+3·+6/+1 → 金 +6/+5·+10/+1 → 红 +8/+8·+12/+4
    {
        id: 'equip_stat_11',
        name: '均衡增补',
        description: '使卡牌获得 +1/+1。',
        rarity: 'uncommon', icon: abc_spell, // [2026-08-27] 原 common→uncommon（六档平移）
        powerMod: 1, healthMod: 1,
    },
    {
        id: 'equip_stat_20',
        name: '利刃模组',
        description: '使卡牌获得 +2/+0。',
        rarity: 'uncommon', icon: abc_spell, // [2026-08-27] 原 common→uncommon（六档平移）
        powerMod: 2,
    },
    {
        id: 'equip_stat_02',
        name: '护体装甲',
        description: '使卡牌获得 +0/+2。',
        rarity: 'uncommon', icon: abc_spell, // [2026-08-27] 原 common→uncommon（六档平移）
        healthMod: 2,
    },
    {
        id: 'equip_stat_21',
        name: '强攻模板',
        description: '使卡牌获得 +2/+2。',
        rarity: 'rare', icon: abc_spell, // [2026-08-27] 蓝锚点 4 点：均衡
        powerMod: 2, healthMod: 2,
    },
    {
        id: 'equip_stat_30',
        name: '狂怒回路',
        description: '使卡牌获得 +3/+1。',
        rarity: 'rare', icon: abc_spell, // [2026-08-27] 蓝锚点 4 点：攻型
        powerMod: 3, healthMod: 1,
    },
    {
        id: 'equip_stat_03',
        name: '安的演习制服',
        description: '使卡牌获得 +1/+3。',
        rarity: 'rare', icon: eq_an_uniform, // [2026-09-11] 鸦眼·安的制服（前象棋冠军、专长阵型演习 → 布局与防守）· 原名「坚岩镀层」
        powerMod: 1, healthMod: 3,
    },
    {
        id: 'equip_stat_32',
        name: '攻城重甲',
        description: '使卡牌获得 +4/+3。',
        rarity: 'epic', icon: abc_spell, // [2026-08-27] 紫锚点 7 点：均衡
        powerMod: 4, healthMod: 3,
    },
    {
        id: 'equip_stat_40',
        name: '箭头的臂炮',
        description: '使卡牌获得 +6/+1。',
        rarity: 'epic', icon: eq_arrowhead_cannon, // [2026-09-11] 阿尔戈·箭头的手臂手炮（近身格斗的特化武装）· 原名「歼灭核心」
        powerMod: 6, healthMod: 1,
    },
    {
        id: 'equip_stat_04',
        name: '玄龟护甲',
        description: '使卡牌获得 +1/+6。',
        rarity: 'epic', icon: abc_spell, // [2026-08-27] 紫锚点 7 点：血型
        powerMod: 1, healthMod: 6,
    },
    {
        id: 'equip_stat_50',
        name: '焰心的兽化外骨',
        description: '使卡牌获得 +10/+1。',
        rarity: 'legendary', icon: eq_flameheart_exo, // [2026-09-11] 堤丰·焰心的外骨骼（公司为她装外骨、她得克制攻击欲 → 爆发式高攻）· 原名「孤注一掷」
        powerMod: 10, healthMod: 1,
    },
    // ── [2026-08-27 莉莉子] 数值型装备六档扩充（白/金血/红；锚点 白1/绿2/蓝4/紫7/金11/红16，偏科主+副）──
    {
        id: 'equip_stat_10',
        name: '修整刃口',
        description: '使卡牌获得 +1/+0。',
        rarity: 'common', icon: abc_spell, // 白锚点 1 点：攻型
        powerMod: 1,
    },
    {
        id: 'equip_stat_01',
        name: '基础护甲',
        description: '使卡牌获得 +0/+1。',
        rarity: 'common', icon: abc_spell, // 白锚点 1 点：血型
        healthMod: 1,
    },
    {
        id: 'equip_stat_29',
        name: '堡垒重铠',
        description: '使卡牌获得 +2/+9。',
        rarity: 'legendary', icon: abc_spell, // 金锚点 11 点：血型
        powerMod: 2, healthMod: 9,
    },
    {
        id: 'equip_stat_88',
        name: '泰坦之核',
        description: '使卡牌获得 +8/+8。',
        rarity: 'mythic', icon: abc_spell, // 红锚点 16 点：均衡
        powerMod: 8, healthMod: 8,
    },
    {
        id: 'equip_stat_124',
        name: '灼的失真安可',
        description: '使卡牌获得 +12/+4。',
        rarity: 'mythic', icon: eq_scorching_guitar, // [2026-09-11] 御守·灼的吉他盒（失真＝摇滚音色，安可＝燃尽后返场）· 原名「灭世灾刃」
        powerMod: 12, healthMod: 4,
    },
    {
        id: 'equip_stat_412',
        name: '不朽神躯',
        description: '使卡牌获得 +4/+12。',
        rarity: 'mythic', icon: abc_spell, // 红锚点 16 点：血型
        powerMod: 4, healthMod: 12,
    },
    // ── [2026-08-27 莉莉子] 白色代价装备（common 白品：缺陷数值 / 关键词白板 / 高阶效果带 DEBUFF）──
    // 设计思路（程）：白装不是纯垃圾而是「代价装备」——牺牲数值/引入负面，换取关键词或更高效果。
    //   减血 DEBUFF 有保护：生命最低降到 1（attachEquipment 里 clamp），1 血单位忽略减血。
    {
        id: 'equip_flaw_blade',
        name: '双刃之锋',
        description: '使卡牌获得 +2/-1。',
        rarity: 'common', icon: abc_spell, // 缺陷数值：攻特化但脆弱（血最低 1 保护）
        powerMod: 2, healthMod: -1,
    },
    {
        id: 'equip_flaw_bulwark',
        name: '迟钝重盾',
        description: '使卡牌获得 -1/+2。',
        rarity: 'common', icon: abc_spell, // 缺陷数值：坦克但减攻
        powerMod: -1, healthMod: 2,
    },
    {
        id: 'equip_keyw_charge',
        name: '能链改造',
        description: '使卡牌获得 -1/+0 与【充能】。',
        rarity: 'common', icon: abc_spell, // 关键词白板：减攻换充能
        powerMod: -1, keywords: ['Channel'],
    },
    {
        id: 'equip_keyw_thorncoat',
        name: '荆棘衬甲',
        description: '使卡牌获得 +0/-1 与【反伤】。',
        rarity: 'common', icon: abc_spell, // 关键词白板：减血换荆棘（血最低 1 保护）
        healthMod: -1, keywords: ['Thorns'],
    },
    {
        id: 'equip_keyw_taunt',
        name: '挑衅面具',
        description: '使卡牌获得 -1/+0 与【挑战者】。',
        rarity: 'common', icon: abc_spell, // 关键词白板：减攻换挑战者
        powerMod: -1, keywords: ['Challenger'],
    },
    {
        id: 'equip_contract_blood',
        name: '猩红契约',
        description: '使卡牌获得【吸血】，攻击力 -1。',
        rarity: 'common', icon: abc_spell, // 高阶效果带 DEBUFF：吸血（epic 级）换减攻
        powerMod: -1, keywords: ['Lifesteal'],
    },
    {
        id: 'equip_contract_power',
        name: '巨力束缚',
        description: '使卡牌获得 +2/+2，费用 +1。',
        rarity: 'common', icon: abc_spell, // 高阶效果带 DEBUFF：蓝级 +2/+2 换费用惩罚
        costMod: 1, powerMod: 2, healthMod: 2,
    },
    // ── [2026-08-20 莉莉子] 第四批：成长型装备（条件触发永久 +1/+1，装备卡须在场存活）──
    // 复用迷宫强化触发管线：player_cast_spell（我方施法）/ after_attack（打击后）/ after_attacked（被打击后）
    {
        id: 'equip_grow_spell_self',
        name: '歌莉娅的课题权杖',
        description: '我方施放一个法术后，此卡获得 +1/+1。',
        rarity: 'epic', icon: eq_golia_staff, // [2026-09-11] 重叶·歌莉娅的法杖（生命科学研究者，法杖随施法成长）· 原名「法术温养」
        onTrigger: { event: 'player_cast_spell', target: 'self', power: 1, health: 1 },
    },
    {
        id: 'equip_grow_spell_ally',
        name: '乐手的疗愈独奏',
        description: '我方施放一个法术后，随机一个我方单位获得 +1/+1。',
        rarity: 'epic', icon: eq_musician_case, // [2026-09-11] 阿尔戈·乐手的小提琴（心理诊疗，"一听那些音乐问题便迎刃而解" → 惠及我方单位）· 原名「灵气传导」
        onTrigger: { event: 'player_cast_spell', target: 'random_ally', power: 1, health: 1 },
    },
    {
        id: 'equip_grow_attack',
        name: '磨砺之锋',
        description: '此卡打击后，获得 +1/+1。',
        rarity: 'rare', icon: abc_spell,
        onTrigger: { event: 'after_attack', target: 'self', power: 1, health: 1 },
    },
    {
        id: 'equip_grow_attacked',
        name: '伊莉斯的修枝剪',
        description: '此卡被打击后，获得 +1/+1。',
        rarity: 'rare', icon: eq_elice_shears, // [2026-09-11] 重叶·伊莉斯的园丁剪（修剪促进生长 → 受创后反而更强）· 原名「愈战愈勇」；⚠️ 与迷宫强化「愈战愈勇」重名，本次改名顺带解开撞车
        onTrigger: { event: 'after_attacked', target: 'self', power: 1, health: 1 },
    },
    // ── [2026-09-25 莉莉子 任务化装备批 v3 · 试点] 《设计-肉鸽三线任务化框架》7.2 ──
    //   任务型 = 跨过阈值兑一次质变（对照上方成长型：每次事件都 +1/+1、没有终点）
    {
        id: 'equip_calibration',
        name: '校准刻度',
        description: '本场战斗中，此卡攻击 2 次后，永久获得 +2/+1。',
        rarity: 'common', icon: abc_spell,
        quest: { event: 'unit_attack', threshold: 2, scope: 'battle' },
        questReward: { class: 'STATS', power: 2, health: 1 },
    },
    {
        id: 'equip_oath_shield',
        name: '誓约之盾',
        description: '本场战斗中，此卡格挡 2 次进攻后，永久获得 +0/+4 与【坚韧】。',
        rarity: 'uncommon', icon: abc_spell,
        quest: { event: 'card_block', threshold: 2, scope: 'battle' },
        questReward: [{ class: 'STATS', health: 4 }, { class: 'KEYWORDS', keywords: ['Tough'] }],
    },
    {
        id: 'equip_gate_key',
        name: '闸门之钥',
        description: '本场战斗中，此卡击杀 2 个单位后，攻击力翻倍。',
        rarity: 'rare', icon: abc_spell,
        quest: { event: 'unit_kill', threshold: 2, scope: 'battle' },
        questReward: { class: 'DOUBLE_POWER' },
    },
    {
        id: 'equip_crown_weight',
        name: '王冠之重',
        description: '本场战斗中，此卡击杀 4 个单位后，永久获得 +5/+5 与【吸血】。',
        rarity: 'legendary', icon: abc_spell,
        quest: { event: 'unit_kill', threshold: 4, scope: 'battle' },
        questReward: [{ class: 'STATS', power: 5, health: 5 }, { class: 'KEYWORDS', keywords: ['Lifesteal'] }],
    },
    {
        id: 'equip_desperate_blade',
        name: '背水之刃',
        description: '我方水晶跌至三成以下的瞬间，此卡永久获得 +2/+2。',
        rarity: 'common', icon: abc_spell,
        // 苛刻型：不计数，条件满足的那一次水晶受击即达成（threshold 1）
        quest: { event: 'nexus_damaged', threshold: 1, scope: 'battle', when: { nexusPctLte: 30 } },
        questReward: { class: 'STATS', power: 2, health: 2 },
    },
    {
        id: 'equip_resonance_circuit',
        name: '共鸣回路',
        description: '本场战斗中，我方施放 3 个法术后，此卡永久获得 +2/+2 与【充能】。',
        rarity: 'uncommon', icon: abc_spell,
        quest: { event: 'cast_spell', threshold: 3, scope: 'battle' },
        questReward: [{ class: 'STATS', power: 2, health: 2 }, { class: 'KEYWORDS', keywords: ['Channel'] }],
    },
    {
        id: 'equip_blood_ledger',
        name: '血债账簿',
        description: '本场战斗中，我方水晶累计受到 8 点伤害后，此卡费用降为 0。',
        rarity: 'epic', icon: abc_spell,
        // 按【伤害量】累计（不是次数）：故调用方给 nexus_damaged 传 amount
        quest: { event: 'nexus_damaged', threshold: 8, scope: 'battle' },
        questReward: { class: 'COST_SET', value: 0 },
    },
    {
        id: 'equip_hunt_list',
        name: '猎杀名单',
        description: '本场战斗中，我方累计打出 6 个单位后，此卡永久获得 +4/+4 与【挑战者】。',
        rarity: 'epic', icon: abc_spell,
        quest: { event: 'play_unit', threshold: 6, scope: 'battle' },
        questReward: [{ class: 'STATS', power: 4, health: 4 }, { class: 'KEYWORDS', keywords: ['Challenger'] }],
    },
    {
        id: 'equip_will',
        name: '遗嘱',
        description: '此卡阵亡时，将其身上的其他装备全部转移给随机一个存活的我方单位。',
        rarity: 'rare', icon: abc_spell,
        // 新机制：没有任务也没有数值，纯粹"死得有价值"（装备传承）
        onOwnerDie: { class: 'TRANSFER_EQUIPMENT' },
    },
    {
        id: 'equip_final_contract',
        name: '终焉契约',
        description: '使卡牌获得 +6/+6 与【先攻】【碾压】；代价：此卡无法被治疗。',
        rarity: 'mythic', icon: abc_spell,
        powerMod: 6, healthMod: 6, keywords: ['QuickAttack', 'Overwhelm'],
        pactNoHeal: true, // Pact 常驻代价：放弃续航换爆发
    },
    // ── [2026-09-28 莉莉子 法术专属装备 · 第一波] 仅法术卡可挂（spellOnly）。
    //   立项原因：法术池原先只剩「海基的推演手记」1 件 → ①法术"随机装备"名不副实 ②Act1 品质权重里 epic=0
    //     ⇒ Act1 法术永远带不上装备。本波 4 件把 白/蓝/紫/金 四档补齐，Act1 缺口自然消失。
    //   ⚠️ 史诗/传说档位偏低是刻意的：**覆盖面比通用装备窄 ⇒ 同效果低一档**（见设计文档 §六 数值锚点）。
    //   ⚠️ 本条目的 costMod / keywords 都是**静态修饰**，attachEquipment 写入即生效（Echo 由 useSpellSystem 结算后处理）。
    //   🔸 第二波（伤害 +N / 目标 +1 / 回想释放 等）需要新挂点，未实装 —— 见设计文档 §5.2。
    {
        id: 'equip_spell_pact_scratch',
        name: '速记草稿',
        description: '使该卡费用 -1；代价：获得【瞬逝】（回合结束未打出即弃置）。',
        rarity: 'common', icon: abc_spell, // TODO 专属图（暂用 abc 占位）
        spellOnly: true,
        costMod: -1, keywords: ['Volatile'], // Pact 代价型：前期最缺费，代价真实（不打就烂手里）
    },
    {
        id: 'equip_spell_echo_copy',
        name: '誊抄副本',
        description: '使该卡获得【回响】（打出后在手牌生成一张该卡的瞬逝复制品）。',
        rarity: 'rare', icon: abc_spell,
        spellOnly: true,
        keywords: ['Echo'], // 一张变两张 —— 法术流的连锁引擎（对已带回响的法术由适用性过滤自动排除）
    },
    {
        id: 'equip_spell_rush_transcript',
        name: '加急誊本',
        description: '使该卡费用 -2。',
        rarity: 'epic', icon: abc_spell,
        spellOnly: true,
        costMod: -2, // 高费法术的解锁键（只作用于一张法术，故较通用减费低一档：通用 -1 费 = 紫）
    },
    {
        id: 'equip_spell_chain_fuse',
        name: '连锁引信',
        description: '使该卡费用 -1，并获得【回响】。',
        rarity: 'legendary', icon: abc_spell,
        spellOnly: true,
        costMod: -1, keywords: ['Echo'], // 费用 + 次数双收益，单卡级最强档
    },
    // ── 武装（[2026-08-14] 特殊装备：局外带入、局内不可获取，进入游戏前配置到武装槽）──
    // ── [2026-09-25 莉莉子 任务化武装批 v3 · 试点] 《设计-肉鸽三线任务化框架》7.1 ──
    //   武装的任务是【整局作用域】（跨战斗累积）；完成后由 grantBattleEffectId 指向的战斗内效果持续生效
    {
        id: 'arm_echo_box',
        name: '余响之匣',
        description: '本局累计用天启者打击 2 次后：此后每场战斗开局，额外抽 2 张牌。',
        rarity: 'common', icon: abc_spell,
        isArmament: true,
        quest: { event: 'hero_attack', threshold: 2, scope: 'run' },
        grantBattleEffectIds: ['armfx_echo_box'],
    },
    {
        id: 'arm_heavy_bracer',
        name: '负重护腕',
        description: '天启者费用 +1，但获得 +2/+3。',
        rarity: 'common', icon: abc_spell,
        isArmament: true,
        costMod: 1, powerMod: 2, healthMod: 3, // Pact 代价型：以费换身材（最直白的一种，玩家一眼能算账）
    },
    {
        id: 'arm_hunter_horn',
        name: '猎手的号角',
        description: '天启者费用 +1，但获得【挑战者】与 +2/+2。',
        rarity: 'uncommon', icon: abc_spell,
        isArmament: true,
        costMod: 1, powerMod: 2, healthMod: 2, keywords: ['Challenger'],
    },
    {
        id: 'arm_devour_box',
        name: '噬牌之匣',
        description: '每回合开始时，弃掉你手牌中费用最低的一张，天启者永久 +1/+1。',
        rarity: 'rare', icon: abc_spell,
        isArmament: true,
        // Novel 新机制：没有任务也没有静态数值 —— 把"废牌"变成英雄成长，手牌管理成为资源
        grantBattleEffectIds: ['armfx_devour_box'],
    },
    {
        id: 'arm_royal_warrant',
        name: '王权之证',
        description: '天启者获得 +2/+2，且必定出现在你的起手牌中；代价：每场战斗开始时我方水晶 -3。',
        rarity: 'mythic', icon: abc_spell,
        isArmament: true,
        powerMod: 2, healthMod: 2,
        grantBattleEffectIds: ['armfx_royal_warrant'],
        pactNexusCost: 3, // Pact 代价：用生命换稳定性（解决「抽不到英雄」这个核心痛点）
    },
    {
        id: 'arm_break_dawn',
        name: '破晓号令',
        description: '本局累计用天启者打击敌方水晶 2 次后：此后每场战斗，敌方手牌中随机 3 张单位卡费用 +2（每场一次）。',
        rarity: 'uncommon', icon: abc_spell,
        isArmament: true,
        quest: { event: 'hero_hit_nexus', threshold: 2, scope: 'run' },
        grantBattleEffectIds: ['armfx_break_dawn'],
    },
    {
        // ⚠️ [2026-09-25 莉莉子 修复] id 原为 arm_resonance_crystal —— 与既有武装「碳原子板」**撞号**，
        //   导致 getEquipmentById / 武装库存按 id 索引时全部解析到碳原子板（悬停大图与数量都错）。
        //   改名 arm_attune_crystal（名字仍是「共鸣水晶」）；新增条目务必跑一次全库 id 唯一性检查。
        id: 'arm_attune_crystal',
        name: '共鸣水晶',
        description: '本局累计用天启者打击 3 次后：随机赋予天启者一个关键词，此后其关键词同时赋予在场我方单位。',
        rarity: 'rare', icon: abc_spell,
        isArmament: true,
        quest: { event: 'hero_attack', threshold: 3, scope: 'run' },
        grantBattleEffectIds: ['armfx_attune_crystal'],
    },
    {
        id: 'arm_whisper_dead',
        name: '亡者低语',
        description: '本局累计阵亡 5 个单位后：此后每次召唤，新单位获得最后阵亡单位的攻血。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        quest: { event: 'unit_die', threshold: 5, scope: 'run' },
        grantBattleEffectIds: ['armfx_whisper_dead'],
    },
    {
        id: 'arm_triumph_box',
        name: '凯旋之匣',
        description: '每场战斗结束时，若天启者仍然存活，获得 30 金币。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        // Novel：打通"战斗表现"与"局内经济"（保护英雄 = 更多资源）；结算在 run 层，不走战斗内管线
        runBattleEndGold: 30,
    },
    {
        id: 'arm_unyielding',
        name: '不屈之证',
        description: '每场战斗中，当天启者已升级时，其首次阵亡会以 1 点生命值存活（每场一次）。',
        rarity: 'legendary', icon: abc_spell,
        isArmament: true,
        // Condition 型：门槛是"天启者已升级"，在死亡清算处判定并拦截（每场一次，账本用 questProgress 的 used: 键）
        reviveOncePerBattle: true,
    },
    {
        id: 'arm_power_health',
        name: '香蒲的白兔应援',
        description: '使卡牌获得 +1/+1。',
        rarity: 'uncommon', icon: eq_cattail_bot, // [2026-09-11] 御守·香蒲的应援机器人（「结缘白兔」→ 给人力量）· 原名「盈实徽记」
        isArmament: true,
        powerMod: 1, healthMod: 1,
    },
    {
        id: 'arm_cost_down',
        name: '虚空降格',
        description: '使卡牌费用 -2。',
        rarity: 'legendary', icon: abc_spell, // [2026-08-26] 降低费用品质提升两档 epic→legendary（封顶）
        isArmament: true,
        costMod: -2,
    },
    {
        id: 'arm_spell_mana',
        name: '秘法回响',
        description: '回合开始时，恢复己方全部法术法力。',
        rarity: 'rare', icon: abc_spell,
        isArmament: true,
        onRoundStart: { class: 'RESTORE_SPELL_MANA' },
    },
    // ── [2026-08-29 程拍板] 新武装批量设计 v2：12 个（关键词主题 / 成长主题 / 稀有登场，纯数值仅泰坦之核）──
    {
        id: 'arm_regen_seed',
        name: '弗拉梅的求生行囊',
        description: '使卡牌获得【再生】+1/+1。',
        rarity: 'rare', icon: eq_flamme_case, // [2026-09-11] 阿尔斯特·弗拉梅的行李箱（绿蛇徽记＝医疗；成年病未愈、为求生四处求医 → 再生）· 原名「不灭之种」
        isArmament: true,
        keywords: ['Regeneration'], powerMod: 1, healthMod: 1,
    },
    {
        id: 'arm_barrier_shield',
        name: '桃子的前线医箱',
        description: '使卡牌获得【屏障】+0/+2。',
        rarity: 'rare', icon: eq_peaches_medkit, // [2026-09-11] 御守·桃子的医疗箱（她专挖前线小队情报 → 常在最危险处；医箱＝保护）· 原名「圣盾壁垒」
        isArmament: true,
        keywords: ['Barrier'], healthMod: 2,
    },
    {
        id: 'arm_quick_feather',
        name: '迅捷之羽',
        description: '使卡牌获得【先攻】，费用 -1。',
        rarity: 'rare', icon: abc_spell,
        isArmament: true,
        keywords: ['QuickAttack'], costMod: -1,
    },
    {
        id: 'arm_overwhelm_hammer',
        name: '破阵之锤',
        description: '使卡牌获得【碾压】+1/+1。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        keywords: ['Overwhelm'], powerMod: 1, healthMod: 1,
    },
    {
        id: 'arm_thorn_throne',
        name: '荆棘王座',
        description: '使卡牌获得【反伤】【坚韧】+0/+1。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        keywords: ['Thorns', 'Tough'], healthMod: 1,
    },
    {
        id: 'arm_elusive_cloak',
        name: '梅贝尔的树下幻境',
        description: '使卡牌获得【隐秘】【先攻】。',
        rarity: 'epic', icon: eq_mabel_hat, // [2026-09-11] 重叶·梅贝尔的帽子（小说《树下幻境》＝躲进故事里 → 灵巧）· 原名「夜幕斗篷」
        isArmament: true,
        keywords: ['Elusive', 'QuickAttack'],
    },
    {
        id: 'arm_grow_attack',
        name: '战意沸腾',
        description: '此卡打击后，获得 +2/+1。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        onTrigger: { event: 'after_attack', target: 'self', power: 2, health: 1 },
    },
    {
        id: 'arm_play_burn',
        name: '献祭烈焰',
        description: '打出时，对敌方备战席所有单位造成 3 点伤害。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        onPlay: { class: 'STRIKE_ENEMY_BENCH', value: 3 },
    },
    {
        id: 'arm_grow_spell_ally',
        name: '梅芙的赞美特调',
        description: '我方施放一个法术后，随机一个我方单位获得 +2/+2。',
        rarity: 'legendary', icon: eq_maeve_drink, // [2026-09-11] 阿尔斯特·梅芙的饮料（"受赞美的植物会长得更茁壮" → 一杯饮品把赞美递出去）· 原名「法术共鸣」；⚠️ 与迷宫强化「法术共鸣」重名，本次改名顺带解开撞车
        isArmament: true,
        onTrigger: { event: 'player_cast_spell', target: 'random_ally', power: 2, health: 2 },
    },
    {
        id: 'arm_dimension_jump',
        name: '次元折跃',
        description: '使卡牌获得【先攻】，费用 -2。',
        rarity: 'legendary', icon: abc_spell,
        isArmament: true,
        keywords: ['QuickAttack'], costMod: -2,
    },
    {
        id: 'arm_grow_attacked',
        name: '多尼尔的金苹果',
        description: '此卡被打击后，获得 +3/+3。',
        rarity: 'mythic', icon: eq_dornier_apple, // [2026-09-11] 堤丰·多尼尔的帽子与金苹果（她梦见本该守护的金苹果飞走 → 受创后仍守住并成长）· 原名「律动之核」
        isArmament: true,
        onTrigger: { event: 'after_attacked', target: 'self', power: 3, health: 3 },
    },
    {
        id: 'arm_titan_core',
        name: '泰坦之核',
        description: '使卡牌获得 +8/+8。',
        rarity: 'mythic', icon: abc_spell,
        isArmament: true,
        powerMod: 8, healthMod: 8,
    },
    // ── [2026-08-29 评估嘉勉 · 2026-09-07 程拍板 消耗品化] 碳原子板：经验翻倍券（普通品质消耗品，每日任务供给）──
    {
        id: 'arm_resonance_crystal',
        name: '碳原子板',
        description: '携带并通关推演时，获得经验翻倍并消耗此武装；败北或中途放弃不消耗、不翻倍，可留到下一局（消耗品，每日推演任务可再领）。',
        rarity: 'common', icon: equipment_resonance, // [2026-09-07] 原 epic → common（程拍板降为普通消耗品）；[2026-09-09] 专属图 equipment00
        isArmament: true,
        consumable: true,
        runBonus: { doubleRunExp: true },
    },
    // ── [2026-09-07 程拍板] 重修申请：高品质解锁通道（消耗品；等级奖励只到稀有，紫/金/神话靠它逐档开，每日推演任务供给）──
    {
        id: 'arm_retrain',
        name: '重修申请',
        description: '不提供任何效果。携带通关推演后，按难度将该武装所在槽位的可装备品质上限提升至：普通→史诗、机密→传说、绝密→神话（槽已达更高则本局不消耗）。升档后此武装消失 1 份（消耗品，可多份囤积；多槽各装一份可一局分别升）。',
        rarity: 'rare', icon: equipment_retrain, // [2026-09-09] 专属图 equipment01
        isArmament: true,
        consumable: true,
        runBonus: { retrainUpgrade: true },
    },
];

// ── 派生视图 ──
export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(EQUIPMENT_DEFS.map(e => [e.id, e]));
export const getEquipmentById = (id: string): EquipmentDef | undefined => EQUIPMENT_BY_ID[id];

/** id 列表 → 装备定义列表（过滤无效 id） */
export const getEquipmentDefs = (equipment?: string[]): EquipmentDef[] =>
    (equipment ?? [])
        .map(id => EQUIPMENT_BY_ID[id])
        .filter((e): e is EquipmentDef => !!e);

// ── 武装（[2026-08-14] 特殊装备）──
// [2026-09-25 莉莉子 防回归守卫] id 唯一性自检 —— 撞号会让 getEquipmentById / 武装库存**全部解析到错的那条**
//   （当日真实事故：新武装「共鸣水晶」id 与既有「碳原子板」撞号 → 悬停大图与库存数量全错，且不报任何错）
if (import.meta.env?.DEV) {
    const seen = new Set<string>();
    for (const e of EQUIPMENT_DEFS) {
        if (seen.has(e.id)) console.error(`[equipment] 装备/武装 id 撞号：${e.id} —— 会被抢先匹配、库存也会串号`);
        seen.add(e.id);
    }
}

/** 全部武装定义（isArmament 过滤；武装界面列表用） */
export const getArmamentDefs = (): EquipmentDef[] => EQUIPMENT_DEFS.filter(e => e.isArmament);

/**
 * [2026-09-28 莉莉子 商店漏武装修复 · 09-28 法术专属扩展] 「局内可获得装备」池：**非武装**装备，按作用对象分池。
 *   武装（`isArmament`，含碳原子板 / 重修申请等消耗品）的设计口径是**局外带入、局内不可获取**（见 EquipmentDef.isArmament 注释），
 *   但商店「买装备」页签原先直接遍历 `EQUIPMENT_DEFS` 全库 → 武装被当普通装备出售（碳原子板等消耗品反复上架，买了也不生效：runBonus 只认开局快照）。
 *   ⚠️ 今后任何「局内发放/出售装备」的入口，一律走 `getEquipmentOnlyDefs(scope)` 或 `getEquipPoolForCard()`，**不要直接遍历 EQUIPMENT_DEFS**。
 * @param scope 'unit' = 单位/天启者可挂（排除 spellOnly）；'spell' = 法术卡可挂（仅 spellOnly）。
 *   ⚠️ 刻意**不给默认值**：调用点必须显式想清"这是给谁买的"—— 09-28 商店漏武装就是"没想清作用对象"造成的。
 */
export const getEquipmentOnlyDefs = (scope: 'unit' | 'spell'): EquipmentDef[] =>
    EQUIPMENT_DEFS.filter(e => !e.isArmament && (scope === 'spell' ? e.spellOnly === true : !e.spellOnly));

/**
 * [2026-09-28 莉莉子 装备适用性铁律（程拍板）] 一件装备是否**对这张卡有实际提升**。
 *   原则：能给这张卡挂，就必须对它有提升 —— 否则是"占格子的空装备"（玩家白花钱 / 白占名额）。
 *   详见 技术手册/设计-法术专属装备.md §四。
 *
 * **A 类型轴**：`spellOnly` ↔ 法术卡；其余非武装装备 ↔ 单位卡（武装走局外 3 槽，不经本判定）
 * **B 效果轴**：
 *   · `costMod < 0` → 卡的基础费用必须 > 0（0 费卡减费无效）
 *   · 关键词 → 该卡**尚无**此关键词（attachEquipment 对关键词做 Set 去重 ⇒ 重复 = 纯浪费）
 *   · Q8 口径（程定）：**允许部分重叠** —— 只要还有任意一项新增（关键词 / 数值 / 机制）就保留；
 *     只有"**只提供关键词、且增量关键词全空**"才淘汰
 * **C 跨装备去重**（Q6 程定）：`equippedIds` 传入该卡已挂装备 —— 它们提供的关键词同样计入"卡已有"
 *
 * ⚠️ 第二波装备（伤害 +N / 目标 +1 / 回想释放…）实装时，须在此追加"按 `effectRegistry.class` 判伤害类法术""有目标才可 +1"等判定。
 */
export const isEquipmentApplicable = (
    def: EquipmentDef,
    card: { type: string; cost?: number; keywords?: Keyword[] },
    equippedIds?: string[],
): boolean => {
    if (!def || !card?.type) return false;

    // A 类型轴
    const isSpell = card.type.startsWith('spell');
    if (isSpell !== (def.spellOnly === true)) return false;

    // 已有集合 = 卡面关键词 ∪ 该卡已挂装备提供的关键词（C 轴）
    const owned = new Set<Keyword>(card.keywords ?? []);
    for (const id of equippedIds ?? []) {
        for (const kw of EQUIPMENT_BY_ID[id]?.keywords ?? []) owned.add(kw);
    }
    const gainKeywords = (def.keywords ?? []).filter(k => !owned.has(k));

    // B 效果轴：减费对 0 费卡无效；且费用必须够减（-2 费装备不给 1 费法术 —— 见设计文档 §4.2「费用 ≥ 减费量」）
    if ((def.costMod ?? 0) < 0 && (card.cost ?? 0) < Math.abs(def.costMod ?? 0)) return false;

    // 该装备是否还有"关键词以外"的收益（数值 / 机制 / 代价都算 —— 有它就不做去重淘汰）
    const hasNonKeywordValue = (def.costMod ?? 0) !== 0
        || !!def.powerMod || !!def.healthMod
        || !!def.onPlay || !!def.onTrigger || !!def.onRoundStart
        || !!def.quest || !!def.questReward
        || !!def.grantBattleEffectIds?.length
        || !!def.runBonus || !!def.pactNoHeal || def.pactNexusCost !== undefined
        || def.runBattleEndGold !== undefined || !!def.reviveOncePerBattle || !!def.onOwnerDie;

    // C 轴去重：只有关键词收益，且一个新增关键词都没有 → 淘汰
    if (!hasNonKeywordValue && (def.keywords?.length ?? 0) > 0 && gainKeywords.length === 0) return false;

    return true;
};

/**
 * [2026-09-25 莉莉子 武装线] 这批装备/武装带来的「开局水晶代价」合计（Pact 常驻代价的一部分）。
 * 在 **战斗水晶初值处直接扣** —— 不走效果类：game_start 站点不提交 game 级变更（只提交 bench/hand/deck/field），
 * 用效果类写的扣血会被静默丢弃。
 */
export const getArmamentNexusCost = (equips?: Record<string, string[]>): number => {
    let sum = 0;
    for (const list of Object.values(equips ?? {})) {
        for (const id of list ?? []) sum += EQUIPMENT_BY_ID[id]?.pactNexusCost ?? 0;
    }
    return sum;
};

/**
 * [2026-08-29 莉莉子 立 · 2026-09-28 重构] 某张卡可佩戴的随机装备池（奖励 / 商店 / 宝箱 / 事件带装备卡共用）：
 *   · 单位卡 → 非武装、**非** spellOnly 的装备；
 *   · 法术卡 → 非武装、**spellOnly** 的装备
 *     （Q1 决议：通用减费不再挂法术 —— 法术用自己的减费装备；原"仅纯减费"白名单随之作废）。
 *   两支都再经 `isEquipmentApplicable()` 过滤：**能给这张卡挂，就必须对它有提升**（适用性铁律）。
 * [2026-09-25 莉莉子 装备不叠加] 第 2 参 excludeIds = **该卡已挂的装备**：
 *   · 排除它们（attachEquipment 对同一 id 硬去重 ⇒ 再发已有那件 = 纯加价 / 白给）
 *   · 同时喂给适用性判定，做 Q6 跨装备去重（它们提供的关键词也算"卡已有"）
 */
export const getEquipPoolForCard = (card: { type: string; cost?: number; keywords?: Keyword[] }, excludeIds?: string[]): EquipmentDef[] => {
    if (!card) return [];
    const exclude = excludeIds?.length ? new Set(excludeIds) : null;
    const isSpell = card.type.startsWith('spell');
    return EQUIPMENT_DEFS.filter(e =>
        !e.isArmament
        && !exclude?.has(e.id)
        && (isSpell ? e.spellOnly === true : !e.spellOnly)
        && isEquipmentApplicable(e, card, excludeIds)
    );
};

/**
 * 挂载一件装备到卡牌：把静态修饰效果（费用 / 关键词 / 攻血）写入卡牌数据 + 追加 equipment 标记。
 * 返回新卡牌对象（不改原引用）。渲染 / 费用判定 / 战斗数值随后全部自动生效。
 * 后续系统（奖励 / 商店 / 牌组）调用本工具接入。
 */
export const attachEquipment = (card: CardData, equipId: string): CardData => {
    const def = EQUIPMENT_BY_ID[equipId];
    if (!def) return card;
    if (card.equipment?.includes(equipId)) return card; // 防重复挂载

    const next: CardData = { ...card };
    next.equipment = [...(next.equipment || []), equipId];

    if (def.costMod) {
        next.cost = Math.max(0, (next.cost || 0) + def.costMod);
        // [2026-08-15 莉莉子] 减费标记：费用被降低时设 customProgress bit2 → 手牌费用显示绿色（isCostReduced）
        if (def.costMod < 0) next.customProgress = (next.customProgress || 0) | 2;
    }
    if (def.keywords?.length) {
        next.keywords = Array.from(new Set([...(next.keywords || []), ...def.keywords]));
    }
    if (def.powerMod || def.healthMod) {
        const buffs = { ...(next.buffs || { power: 0, health: 0 }) };
        if (def.powerMod) buffs.power = (buffs.power || 0) + def.powerMod;
        if (def.healthMod) {
            // [2026-08-27 程] 减血保护：生命最低 1——若卡牌当前生命已被压到 1，减血 DEBUFF 被忽略
            const curHealth = (next.health || 0) + (buffs.health || 0);
            buffs.health = (buffs.health || 0) + Math.max(def.healthMod, 1 - curHealth);
        }
        next.buffs = buffs;
    }
    // [2026-09-25 莉莉子 三线任务化框架 · Pact 常驻代价] 无法被治疗：写入卡牌标记，治疗结算处直接跳过
    if (def.pactNoHeal) next.cantBeHealed = true;
    return next;
};
