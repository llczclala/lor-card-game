// ==========================================
// 装备系统 · 统一装备库（挂载在单张卡牌上）
// [2026-08-12 莉莉子] 装备区别于迷宫强化（团队被动）——装备只强化单张卡牌。
//   - 视觉：六边形方块，挂载在手牌卡面样式外的右侧右下角，多个从下往上依次排列
//   - 效果：attachEquipment 挂载时把静态修饰（费用/关键词/攻血）写入卡牌数据，
//     渲染 / 费用判定 / 战斗数值全部走现有数据通路；打出时效果（onPlay）声明式执行
//   - 挂载入口（战斗奖励 / 商店 / 牌组）由后续系统调用 attachEquipment 接入，本文件只管定义 + 挂载工具
// ==========================================

import type { CardData, Keyword } from '../types';
import abc_spell from '../image/spells/abc.webp';
import equipment_resonance from '../image/equipment/equipment00.jpg'; // [2026-09-09] 碳原子板专属图（程提供）
import equipment_retrain from '../image/equipment/equipment01.jpg'; // [2026-09-09] 重修申请专属图（程提供）
// ── [2026-09-11 程拍板 · 第一批后勤干员图标] 20 位后勤干员的招牌物件（均取自各自原画上的元素）──
//    命名规则：eq_{干员英文}_{物件英文}；「一张图 = 一位干员 = 一件装备/武装」，
//    图标语义 → 干员身份/性格 → 决定它挂在哪个效果上（效果与数值保持原样不动）。
import eq_peaches_medkit from '../image/equipment/equipment02.jpg';      // 御守·桃子 —— 手里的医疗箱
import eq_cattail_bot from '../image/equipment/equipment03.jpg';         // 御守·香蒲 —— 肩上的小机器人
import eq_scorching_guitar from '../image/equipment/equipment04.jpg';    // 御守·灼 —— 背着的吉他盒
import eq_arrowhead_cannon from '../image/equipment/equipment05.jpg';    // 阿尔戈·箭头 —— 手臂上的手炮
import eq_musician_case from '../image/equipment/equipment06.jpg';       // 阿尔戈·乐手 —— 小提琴琴箱
import eq_pigeon_patch from '../image/equipment/equipment07.jpg';        // 阿尔戈·鸽子 —— 眼罩
import eq_mabel_hat from '../image/equipment/equipment08.jpg';           // 重叶·梅贝尔 —— 帽子
import eq_elice_shears from '../image/equipment/equipment09.jpg';        // 重叶·伊莉斯 —— 手里的园丁剪
import eq_golia_staff from '../image/equipment/equipment10.jpg';         // 重叶·歌莉娅 —— 手里的法杖
import eq_maeve_drink from '../image/equipment/equipment11.jpg';         // 阿尔斯特·梅芙 —— 手里的饮料
import eq_koni_device from '../image/equipment/equipment12.jpg';         // 阿尔斯特·科尼 —— 便携信号装置
import eq_flamme_case from '../image/equipment/equipment13.jpg';         // 阿尔斯特·弗拉梅 —— 随身拉着的箱子
import eq_613_headset from '../image/equipment/equipment14.jpg';         // 堤丰·613 —— 头戴式耳机
import eq_dornier_apple from '../image/equipment/equipment15.jpg';       // 堤丰·多尼尔 —— 戴着的帽子（含金苹果）
import eq_flameheart_exo from '../image/equipment/equipment16.jpg';      // 堤丰·焰心 —— 携带的装置（外骨骼）
import eq_an_uniform from '../image/equipment/equipment17.jpg';
   // 鸦眼·安 —— 衣服（制服）
import eq_hiki_book from '../image/equipment/equipment18.jpg';           // 鸦眼·海基 —— 手里拿的书
import eq_valerie_kit from '../image/equipment/equipment19.jpg';         // 布里吉·瓦莱莉 —— 随身工具箱（PNG 原格式）
import eq_feier_camera from '../image/equipment/equipment20.jpg';        // 布里吉·菲儿 —— 胸口挂着的相机（PNG 原格式）
import eq_chinchilla_glasses from '../image/equipment/equipment21.jpg';  // 布里吉·金吉拉 —— 戴着的眼镜（PNG 原格式）

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
    target: 'self' | 'random_ally'; // self=装备卡自己；random_ally=随机在场友军
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
    costMod?: number;         // [静态修饰] 费用修正（装备1：-1）
    keywords?: Keyword[];     // [静态修饰] 附加关键词（装备2：QuickAttack）
    powerMod?: number;        // [静态修饰] 攻击修正（装备4：+4）
    healthMod?: number;       // [静态修饰] 生命修正（装备4：+4）
    onPlay?: EquipmentOnPlay; // [打出时效果] 声明式执行（装备3）
    onRoundStart?: EquipmentRoundStart; // [2026-08-14 武装] 回合开始效果（武装C）
    onTrigger?: EquipmentTrigger; // [2026-08-20 成长型装备] 触发式成长（事件+目标+数值）
    runBonus?: { doubleRunExp?: boolean; retrainUpgrade?: boolean }; // [2026-08-29] 局外带入的整局性效果标记（碳原子板：通关经验翻倍）；[2026-09-07] 重修申请：通关后所在武装槽位品质上限 +1 级
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
        description: '我方施放一个法术后，随机一个友军获得 +1/+1。',
        rarity: 'epic', icon: eq_musician_case, // [2026-09-11] 阿尔戈·乐手的小提琴（心理诊疗，"一听那些音乐问题便迎刃而解" → 惠及友军）· 原名「灵气传导」
        onTrigger: { event: 'player_cast_spell', target: 'random_ally', power: 1, health: 1 },
    },
    {
        id: 'equip_grow_attack',
        name: '磨砺之锋',
        description: '此卡攻击后，获得 +1/+1。',
        rarity: 'rare', icon: abc_spell,
        onTrigger: { event: 'after_attack', target: 'self', power: 1, health: 1 },
    },
    {
        id: 'equip_grow_attacked',
        name: '伊莉斯的修枝剪',
        description: '此卡被攻击后，获得 +1/+1。',
        rarity: 'rare', icon: eq_elice_shears, // [2026-09-11] 重叶·伊莉斯的园丁剪（修剪促进生长 → 受创后反而更强）· 原名「愈战愈勇」；⚠️ 与迷宫强化「愈战愈勇」重名，本次改名顺带解开撞车
        onTrigger: { event: 'after_attacked', target: 'self', power: 1, health: 1 },
    },
    // ── 武装（[2026-08-14] 特殊装备：局外带入、局内不可获取，进入游戏前配置到武装槽）──
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
        description: '我方施放一个法术后，随机一个友军获得 +2/+2。',
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
        description: '此卡被攻击后，获得 +3/+3。',
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
/** 全部武装定义（isArmament 过滤；武装界面列表用） */
export const getArmamentDefs = (): EquipmentDef[] => EQUIPMENT_DEFS.filter(e => e.isArmament);

/**
 * [2026-08-29 莉莉子] 某张卡可佩戴的随机装备池（奖励/商店/宝箱/事件带装备卡共用）：
 *   单位卡 → 全部非武装装备；
 *   法术卡 → 仅纯减费装备（costMod<0 且无任何其他修饰），杜绝数值/关键词/特效等对法术无效的装备（程拍板）。
 */
export const getEquipPoolForCard = (card: { type: string }): EquipmentDef[] => {
    if (!card) return [];
    if (card.type.startsWith('spell')) {
        return EQUIPMENT_DEFS.filter(e =>
            !e.isArmament && (e.costMod ?? 0) < 0
            && !e.powerMod && !e.healthMod
            && !e.keywords?.length && !e.onPlay && !e.onTrigger && !e.onRoundStart
        );
    }
    return EQUIPMENT_DEFS.filter(e => !e.isArmament);
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
    return next;
};
