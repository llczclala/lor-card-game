import { GachaPoolEnum, type CardData } from '../types';
import { HERO_IMAGES, TEST_IMAGES, SPELL_IMAGES, UNIT_IMAGES, TITAN_IMAGES } from './imageData'; // [新增] 引入 TITAN_IMAGES

export const CARD_DB: Record<string, Omit<CardData, 'id' | 'strikeCount' | 'animState' | 'damageTaken' | 'buffs'>> = {
  // --- 英雄：里芙 (Lyfe) ---
  lyfe: {
    key: 'lyfe', gachaPool: GachaPoolEnum.Permanent, name: '里芙', cost: 2, power: 2, health: 6, maxHealth: 6,isChampion: true, level: 1, region: 'Lyfe',
    description: '参战：变化为“里芙的决意”。', type: 'unit', keywords: ['Regeneration'],
    imageUrl: HERO_IMAGES.lyfe.base,
    level2ImageUrl: HERO_IMAGES.lyfe.level2,
    associatedSpellKey: 'lyfe_spell',
    levelUpCondition: '完成 2 次打击', // [新增] 升级文案
    levelUpTarget: 2, // [新增] 升级目标值

    // [新增] 配置法术效果 (Level 1 暂时没有特殊效果，留空)
    effects: []
  },
  // 里芙
  lyfe_spell: {
    key: 'lyfe_spell', name: '里芙的决意', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '抉择：“无尽霜刃” 或 “吞噬神座”\n使用后，在牌库里生成一张“里芙”。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_spell,
    associatedChampionKey: 'lyfe',
    isLevel2Choice: true,
    choices: ['lyfe_rush', 'lyfe_ultimate'], // [新增] 装填抉择衍生卡 Key
    ai: { pattern: 'CHOICE', priority: 3, config: {} },
    isCollectible: false
  },
  lyfe_rush: {
    key: 'lyfe_rush', name: '无尽霜刃', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '极速：给予 “里芙” +1/+1。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_rush,
    effects: ['effect_lyfe_rush'],
    isCollectible: false,
    ai: { pattern: 'BUFF', priority: 4, config: { targetType: 'ALLY_UNIT', specificTargetKey: 'lyfe', power: 1, health: 1 } }
  },
  lyfe_ultimate: {
    key: 'lyfe_ultimate', name: '吞噬神座', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '进行备战。', type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_ultimate,
    effects: ['effect_lyfe_ultimate'],
    isCollectible: false,
    ai: { pattern: 'RALLY', priority: 1, config: { denyIfHasToken: true, minAttackers: 1 } }
  },
  lyfe_support: {
    key: 'lyfe_support', gachaPool: GachaPoolEnum.Permanent,
    name: '冻沙激流',
    cost: 3,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Lyfe',
    description: '极速 [支援技]：本回合给予一个攻击力小于3的单位[冻结]。',
    type: 'spell-burst',
    keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_support,
    effects: ['effect_lyfe_support'],
    associatedChampionKey: 'lyfe',
    ai: { pattern: 'FROST', priority: 2, config: { maxPower: 2 } },
  },
  // 1. 单挑 (Single Combat)
  single_combat: {
    key: 'single_combat', gachaPool: GachaPoolEnum.Permanent, name: '单挑', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '一个友方单位和一个敌方单位相互打击。',
    type: 'spell-fast',
    keywords: [],
    // [修改] 使用注册的图片
    imageUrl: SPELL_IMAGES.single_combat,
    effects: ['effect_single_combat'],
    ai: { pattern: 'DUEL', priority: 2, config: { policies: ['favorable', 'sacrifice', 'clear_path'] } }
  },

  // 2. 祈愿 (Prayer)
  prayer: {
    key: 'prayer', gachaPool: GachaPoolEnum.Permanent, name: '祈愿', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '慢速：赋予一个单位 +1/+1', type: 'spell-slow', keywords: [],
    effects: ['effect_prayer'],
    imageUrl: SPELL_IMAGES.prayer,
    ai: { pattern: 'BUFF', priority: 3, config: { targetType: 'ALLY_UNIT', power: 1, health: 1 } }
  },

  // 3. 专注 (Focus)
  focus: {
    key: 'focus', gachaPool: GachaPoolEnum.Permanent, name: '专注', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '慢速：进行备战', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.focus,
    effects: ['effect_focus'],
    ai: { pattern: 'RALLY', priority: 1, config: { denyIfHasToken: true, minAttackers: 1 } }
  },

   // --- 英雄：芬妮 (Fenny) ---
  fenny: {
      key: 'fenny', gachaPool: GachaPoolEnum.Permanent, name: '芬妮', cost: 2, power: 1, health: 5, maxHealth: 5, isChampion: true, level: 1, region: 'Fenny',
      description: '进攻：首次进攻时，永久赋予自己 +3/+0。\n参战：变化为“芬妮的狂热”。', type: 'unit', keywords: ['Overwhelm', 'Ability'],
      ability: { id: 'fenny_lv1_first_strike', label: '锋芒初显', description: '进攻：首次进攻时，永久赋予自己 +3/+0。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim', isLevelAbility: true },
      imageUrl: HERO_IMAGES.fenny.base,
      level2ImageUrl: HERO_IMAGES.fenny.level2,
      associatedSpellKey: 'fenny_spell',
      levelUpCondition: '敌我任意水晶生命值 <= 10', // [新增] 升级文案
      levelUpTarget: 1, // [新增] 状态型升级，目标视为 1
      effects: ['effect_fenny_attack_lv1'] // [新增] 绑上首次进攻判定
  },
    // 芬妮的技能卡
  fenny_spell: {
      key: 'fenny_spell', name: '芬妮的狂热', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
      description: '抉择：“星光之途” 或 “绝对主角”\n使用后，在牌库里生成一张“芬妮”。', type: 'spell-burst', keywords: [],
      imageUrl: SPELL_IMAGES.fenny_spell,
      associatedChampionKey: 'fenny',
      isLevel2Choice: true,
      choices: ['fenny_strike', 'fenny_ultimate'],
      ai: { pattern: 'CHOICE', priority: 3, config: {} },
      isCollectible: false
  },
  fenny_strike: {
      key: 'fenny_strike', name: '星光之途', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
      description: '选择一个“芬妮”赋予她 [屏障]，若其处于战场，则将其折返。', type: 'spell-fast', keywords: [],
      imageUrl: SPELL_IMAGES.fenny_strike,
      effects: ['effect_fenny_strike'],
      isCollectible: false,
      ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALLY_UNIT', specificTargetKey: 'fenny' } }
  },

  fenny_ultimate: {
      key: 'fenny_ultimate', name: '绝对主角', cost: 6, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
      description: '“芬妮”单向打击一个敌方单位。该次打击附带 [碾压]。', type: 'spell-slow', keywords: [],
      imageUrl: SPELL_IMAGES.fenny_ultimate,
      effects: ['effect_fenny_ultimate'],
      isCollectible: false,
      ai: { pattern: 'STRIKE', priority: 3, config: { strikerKey: 'fenny', requireOverwhelm: true } }
  },
  fenny_support: {
    key: 'fenny_support', gachaPool: GachaPoolEnum.Permanent,
    name: '激励之声',
    cost: 4,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Fenny',
    description: '快速 [支援技]：本回合给予友方一个单位 +1/+0，若此后本回合该单位击杀敌方单位，则备战。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.fenny_support,
    effects: ['effect_fenny_support'],
    associatedChampionKey: 'fenny',
    ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALLY_UNIT', power: 1, health: 0 } }
  },
  // 4. 暗箭 (Hidden Arrow)
  hidden_arrow: {
    key: 'hidden_arrow', gachaPool: GachaPoolEnum.Permanent, name: '暗箭', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '极速：对任意一个单位或水晶造成{value}点伤害', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.hidden_arrow,
    effects: ['effect_hidden_arrow'],
    ai: { pattern: 'DAMAGE', priority: 4, config: { targetType: 'any', canTargetSelf: true, lethalPriority: true, damageValue: 1 } }
  },

  // 5. 振奋 (Inspire)
  inspire: {
    key: 'inspire', gachaPool: GachaPoolEnum.Permanent, name: '振奋', cost: 5, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '慢速：本回合给予友方全体单位+2/+1', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.inspire,
    effects: ['effect_inspire'],
    ai: { pattern: 'BUFF', priority: 2, config: { minAllies: 2 } }
  },

  // 6. 破坏 (Destruction)
  destruction: {
    key: 'destruction', gachaPool: GachaPoolEnum.Permanent, name: '破坏', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '慢速：对敌方水晶造成{value}点伤害', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.destruction,
    effects: ['effect_destruction'],
    ai: { pattern: 'DAMAGE', priority: 3, config: { targetType: 'nexus' } }
  },
  // --- 英雄：卜卜 灵鉴(pupu_specular_soul) ---
  pupu_specular_soul: {
    key: 'pupu_specular_soul', gachaPool: GachaPoolEnum.Lotus, name: '卜卜 灵鉴', cost: 2, power: 5, health: 3, maxHealth: 3,isChampion: true, level: 1, region: 'Pupu', race: ['summoner'],
    description: '进攻时：召唤一个进攻状态的 “镜爻”。\n参战：变化为“卜卜的卜卦”。', type: 'unit', keywords: ['QuickAttack', 'Ability'],
    ability: { id: 'pupu_lv1_mirror_summon', label: '灵鉴之冲', description: '进攻时：召唤一个进攻状态的\"镜爻\"。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge', isLevelAbility: true },
    imageUrl: HERO_IMAGES.pupu_specular_soul.base,
    level2ImageUrl: HERO_IMAGES.pupu_specular_soul.level2,
    associatedSpellKey: 'pupu_specular_soul_spell',
    levelUpCondition: '场上目睹攻击敌方水晶 3 次',
    levelUpTarget: 3,
    effects: ['effect_test_pupu_attack']
  },
  // 卜卜
  pupu_specular_soul_spell: {
    key: 'pupu_specular_soul_spell', name: '卜卜的卜卦', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Pupu',
    description: '抉择：“镜涌万象” 或 “吉煞映照”\n使用后，在牌库里生成一张“卜卜 灵鉴”。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.pupu_specular_soul_spell,
    associatedChampionKey: 'pupu_specular_soul',
    isLevel2Choice: true,
    choices: ['pupu_specular_soul_rush', 'pupu_specular_soul_ultimate'], // [新增] 装填抉择衍生卡 Key
    ai: { pattern: 'CHOICE', priority: 3, config: {} },
    isCollectible: false
  },
  pupu_specular_soul_rush: {
    key: 'pupu_specular_soul_rush', name: '镜涌万象', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Pupu',
    description: '快速：选择一个敌方单位，对其及其左右两边的单位各造成{value}点伤害。若本回合“卜卜 灵鉴” 已经打击过，则改为对所选目标造成{bonusValue}点伤害。', type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.pupu_specular_soul_rush,
    effects: ['effect_pupu_specular_soul_rush'],
    isCollectible: false,
    ai: { pattern: 'DAMAGE', priority: 3, config: { targetType: 'unit', damageValue: 1 } }
  },
  pupu_specular_soul_ultimate: {
    key: 'pupu_specular_soul_ultimate', name: '吉煞映照', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Pupu',
    description: '本回合给予“卜卜 灵鉴” [连击]。', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.pupu_specular_soul_ultimate,
    effects: ['effect_pupu_specular_soul_ultimate'],
    isCollectible: false,
    ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALLY_UNIT', specificTargetKey: 'pupu_specular_soul' } }
  },
  pupu_specular_soul_support: {
    key: 'pupu_specular_soul_support', gachaPool: GachaPoolEnum.Permanent,
    name: '异镜来物',
    cost: 3,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Pupu',
    description: '快速 [支援技]：撤回一个交战中的友方单位，以“镜爻”代替其原本的战场位置。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.pupu_specular_soul_support,
    effects: ['effect_pupu_specular_soul_support'],
    ai: { pattern: 'RECALL_AND_REPLACE', priority: 2, config: {} },
    associatedChampionKey: 'pupu_specular_soul',
  },
  // 镜爻
  Mirror: {
    key: 'Mirror',
    name: '镜爻',
    region: 'Pupu',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    race: ['summon'],
    type: 'unit',
    keywords: ['Ephemeral'],
    description: '', // 白板无需描述
    imageUrl: UNIT_IMAGES.Mirror,
    effects: [],
    isCollectible: false
  },
  // 镜爻 卜卜
  Mirror_pupu: {
    key: 'Mirror_pupu',
    name: '镜爻 卜卜',
    region: 'Pupu',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    race: ['summon'],
    type: 'unit',
    keywords: ['Ephemeral'],
    description: '入场：复制“卜卜 灵鉴”的面板和关键词。',
    imageUrl: UNIT_IMAGES.Mirror_pupu,
    effects: [],
    isCollectible: false
  },
    // ==========================================
  // [新增] 猫汐尔 莲驱 (Mauxir - Lotus Drive)
  // ==========================================
  mauxir_lotus_drive: {
    key: 'mauxir_lotus_drive', gachaPool: GachaPoolEnum.Lotus, name: '猫汐尔 莲驱', cost: 4, power: 1, health: 4, maxHealth: 4,
    isChampion: true, level: 1, region: 'Mauxir', race: ['summoner'],
    description: '【库效】回合开始时，若友方备战席和手牌中没有“臆莲基座”，则召唤一个。回合结束：对友方随机一个“臆莲基座”造成1点伤害，之后赋予其+0 +1。\n参战：变化为“猫汐尔的演算”。',
    type: 'unit', keywords: ['Tough','Aura'],
    imageUrl: HERO_IMAGES.mauxir_lotus_drive.base,
    level2ImageUrl: HERO_IMAGES.mauxir_lotus_drive.level2,
    associatedSpellKey: 'mauxir_lotus_spell',
    levelUpCondition: '友方召唤者和召唤物累计造成 30 点伤害',
    levelUpTarget: 30,
    effects: ['effect_mauxir_lotus_drive_lv1'],
  },
  mauxir_lotus_spell: {
    key: 'mauxir_lotus_spell', name: '猫汐尔的演算', cost: 0, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Mauxir',
    description: '抉择：“千莲叠绽” 或 “顷刻莲潮”\n使用后，在牌库里生成一张“猫汐尔 莲驱”。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.mauxir_lotus_spell,
    associatedChampionKey: 'mauxir_lotus_drive',
    isLevel2Choice: true,
    choices: ['mauxir_lotus_rush', 'mauxir_lotus_ultimate'],
    ai: { pattern: 'CHOICE', priority: 3, config: {} },
    isCollectible: false,
  },
  mauxir_lotus_rush: {
    key: 'mauxir_lotus_rush', name: '千莲叠绽', cost: 2, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Mauxir',
    description: '若“猫汐尔 莲驱”未处于格挡状态，召唤一个“臆莲基座”；若处于格挡状态，则选择一个“臆莲基座”交换位置，代替其格挡并给予其+0/+2。',
    type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.mauxir_lotus_rush,
    effects: ['effect_mauxir_lotus_rush'],
    isCollectible: false,
    ai: { pattern: 'SUMMON', priority: 2, config: { minBoardSpace: 1, summonCount: 1, requireChampionKey: 'mauxir_lotus_drive' } },
  },
  mauxir_lotus_ultimate: {
    key: 'mauxir_lotus_ultimate', name: '顷刻莲潮', cost: 6, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Mauxir',
    description: '立刻使全场所有友方“臆莲基座”造成一次伤害翻倍的打击，打击结束后攻击力减半。',
    type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.mauxir_lotus_ultimate,
    effects: ['effect_mauxir_lotus_ultimate'],
    isCollectible: false,
  },
  mauxir_lotus_support: {
    key: 'mauxir_lotus_support', gachaPool: GachaPoolEnum.Permanent, name: '伴泽而生', cost: 2, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Mauxir',
    description: '极速 [支援技]：对目标造成{value}点伤害，若目标受伤后生命值等于1，则本回合给予其[冻结]。',
    type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.mauxir_lotus_support,
    effects: ['effect_mauxir_lotus_support'],
    associatedChampionKey: 'mauxir_lotus_drive',
    ai: { pattern: 'DAMAGE', priority: 2, config: { targetType: 'any', damageValue: 1 } },
  },
  mauxir_lotus_pedestal: {
    key: 'mauxir_lotus_pedestal', name: '臆莲基座', cost: 0, power: 0, maxPower: 10, health: 3, maxHealth: 3, maxPerSide: 3, buffRules: { power: { allowedTags: ['drone_power'] } },
    isChampion: false, level: 0, region: 'Mauxir',
    description: '受伤时：若“猫汐尔 莲驱”在场，在手牌生成一张“梦莲无人机”。回合结束：对随机敌方单位造成X次1点伤害。【攻击力最多为10】',
    type: 'unit', keywords: ['CantAttack'], race: ['summon'],
    imageUrl: SPELL_IMAGES.mauxir_lotus_pedestal,
    effects: ['effect_mauxir_lotus_pedestal'],
    isCollectible: false,
  },
  // --- 通用法术：梦莲无人机 ---
  'dream_lotus_drone': {
    key: 'dream_lotus_drone', name: '梦莲无人机', cost: 1, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Mauxir', type: 'spell-burst', keywords: [],
    description: '赋予一个召唤衍生物+2/+0。',
    imageUrl: SPELL_IMAGES.dream_lotus_drone,
    effects: ['effect_dream_lotus_drone'],
    isCollectible: false,
    ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALLY_UNIT', raceFilter: ['summon'], power: 2, health: 0 } },
  },

  // ==========================================
  // [2026-07-26 安卡希雅 时之重奏] Acacia — Chrono Echo
  // ==========================================

  acacia_chrono_echo: {
    key: 'acacia_chrono_echo', gachaPool: GachaPoolEnum.Permanent, name: '安卡希雅 时之重奏', cost: 2, power: 2, health: 4, maxHealth: 4,
    isChampion: true, level: 1, region: 'Acacia',
    description: '【库效】若我方手牌中没有，则在我方手牌中生成一张“安卡希雅的剑舞”。\n入场及获得进攻标识时：生成一张易逝的“灵轨月轮·扩散”。\n参战：变化为“安卡希雅的剑舞”。',
    type: 'unit', keywords: ['Channel', 'Aura', 'Ability'],
    imageUrl: HERO_IMAGES.acacia_chrono_echo.base,
    level2ImageUrl: HERO_IMAGES.acacia_chrono_echo.level2,
    associatedSpellKey: 'acacia_chrono_echo_spell',
    levelUpCondition: '我方打出“朔望之期”',
    levelUpTarget: 1,
    effects: ['effect_acacia_chrono_echo_lv1', 'effect_acacia_chrono_echo_token'],
  },
  acacia_chrono_echo_spell: {
    key: 'acacia_chrono_echo_spell', name: '安卡希雅的剑舞', cost: 0, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '抉择：“圆缺有律”或 “朔望之期”\n使用后，在牌库里生成一张“安卡希雅 时之重奏”。',
    type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_chrono_echo_spell,
    associatedChampionKey: 'acacia_chrono_echo',
    choices: ['acacia_chrono_echo_rush', 'acacia_chrono_echo_ultimate'],
    ai: { pattern: 'CHOICE', priority: 3, config: {} },
    isCollectible: false,
  },
  acacia_chrono_echo_rush: {
    key: 'acacia_chrono_echo_rush', name: '圆缺有律', cost: 1, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '切换“灵轨月轮·扩散”/“灵轨月轮·集束”。',
    type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_chrono_echo_rush,
    effects: ['effect_acacia_chrono_echo_rush'],
    isCollectible: false,
  },
  acacia_chrono_echo_ultimate: {
    key: 'acacia_chrono_echo_ultimate', name: '朔望之期', cost: 16, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '本牌局每召唤过“飞剑”1，此牌魔耗值减1。打出后升级“安卡希雅 时之重奏”，并回复全部费用。',
    type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_chrono_echo_ultimate,
    effects: ['effect_acacia_chrono_echo_ultimate'],
    isCollectible: false,
  },
  acacia_chrono_echo_support: {
    key: 'acacia_chrono_echo_support', name: '月震星陨', cost: 2, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '极速 [支援技]：对所有本回合进攻或格挡过的敌人造成1点伤害。',
    type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_chrono_echo_support,
    effects: ['effect_acacia_chrono_echo_support'],
    associatedChampionKey: 'acacia_chrono_echo',
  },

  // --- 安卡希雅 衍生法术 ---

  acacia_chrono_echo_heavy: {
    key: 'acacia_chrono_echo_heavy', name: '安卡希雅的重锋', cost: 0, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '抉择：“越时斩”或 “剑痕时空”\n使用后，在牌库里生成一张“安卡希雅 时之重奏”。',
    type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_chrono_echo_heavy,
    associatedChampionKey: 'acacia_chrono_echo',
    isLevel2Choice: true,
    choices: ['acacia_cross_temporal', 'acacia_sword_timeline'],
    ai: { pattern: 'CHOICE', priority: 3, config: {} },
    isCollectible: false,
  },
  acacia_cross_temporal: {
    key: 'acacia_cross_temporal', name: '越时斩', cost: 3, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '若本回合已“飞剑”，则对敌方战场上所有单位造成2点伤害。',
    type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_cross_temporal,
    effects: ['effect_acacia_cross_temporal'],
    isCollectible: false,
  },
  acacia_sword_timeline: {
    key: 'acacia_sword_timeline', name: '剑痕时空', cost: 9, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '“安卡希雅 时之重奏”退级，且本牌局每召唤过“大飞剑”1，便对敌方水晶造成1点伤害。本牌局每召唤过“飞剑”1，此牌魔耗值减1。使用后回复全部费用。',
    type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.acacia_sword_timeline,
    effects: ['effect_acacia_sword_timeline'],
    isCollectible: false,
  },
  acacia_sword_rain: {
    key: 'acacia_sword_rain', name: '灵轨月轮·扩散', cost: 2, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '慢速：飞剑4。',
    type: 'spell-slow', keywords: ['Volatile'],
    imageUrl: SPELL_IMAGES.acacia_sword_rain,
    effects: ['effect_acacia_sword_rain'],
    isCollectible: false,
  },
  acacia_moon_focus: {
    key: 'acacia_moon_focus', name: '灵轨月轮·集束', cost: 2, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '慢速：飞剑1，此次飞剑获得+3/+3。',
    type: 'spell-slow', keywords: ['Volatile'],
    imageUrl: SPELL_IMAGES.acacia_moon_focus,
    effects: ['effect_acacia_moon_focus'],
    isCollectible: false,
  },
  acacia_sword_rain_alt: {
    key: 'acacia_sword_rain_alt', name: '月镰剑势', cost: 1, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Acacia',
    description: '慢速：飞剑3。',
    type: 'spell-slow', keywords: ['Volatile'],
    imageUrl: SPELL_IMAGES.acacia_sword_rain_alt,
    effects: ['effect_acacia_sword_rain_alt'],
    isCollectible: false,
  },
  // --- 安卡希雅 衍生物 ---

  'Acacia_Flying_Sword': {
    key: 'Acacia_Flying_Sword', name: '飞剑', cost: 0, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, region: 'Acacia', race: ['summon'],
    type: 'unit', keywords: ['Ephemeral'],
    description: '',
    imageUrl: HERO_IMAGES.acacia_chrono_echo.base,
    effects: [],
    isCollectible: false,
  },
  'Acacia_Great_Sword': {
    key: 'Acacia_Great_Sword', name: '大飞剑', cost: 0, power: 2, health: 1, maxHealth: 1,
    isChampion: false, level: 0, region: 'Acacia', race: ['summon'],
    type: 'unit', keywords: ['Ephemeral', 'Overwhelm'],
    description: '',
    imageUrl: HERO_IMAGES.acacia_chrono_echo.level2,
    effects: [],
    isCollectible: false,
  },
  // --- 新增单位：Logistics (后勤) ---

  // --- “重叶”小队 (Chongye Squad) ---

  // 1. 梅贝尔 (Mabel)
  Chongye_Squad_Mabel: {
    key: 'Chongye_Squad_Mabel', gachaPool: GachaPoolEnum.Permanent,
    name: '“重叶”\n 梅贝尔 ',
    region: 'Pupu',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: [],
    ability: { id: 'mabel_tutor', label: ' 导游向导 ', description: ' 入场：将牌库中最底部的 “卜卜 灵鉴” 置于牌库顶部。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    description: ' 入场：将我们牌库中最底部的 “卜卜 灵鉴” 置于牌库顶部。',
    imageUrl: UNIT_IMAGES.mabel,
    effects: ['effect_mabel_tutor']
  },

  // 2. 伊莉斯(Elice)
  Chongye_Squad_Elice: {
    key: 'Chongye_Squad_Elice', gachaPool: GachaPoolEnum.Permanent,
    name: '“重叶”\n伊莉斯 ',
    region: 'Pupu',
    cost: 3,
    power: 2,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    race: ['summoner'],
    type: 'unit',
    keywords: [],
    ability: { id: 'elice_robot_engine', label: '无人机调度程序', description: '入场：召唤一个\"环境净化无人机\"。回合开始：若上回合友方打击过敌方水晶，则召唤一个\"环境净化无人机\"。', trigger: 'on_play', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.elice,
    description: '入场：召唤一个“环境净化无人机”。回合开始：若上回合友方打击过敌方水晶，则召唤一个“环境净化无人机”。',
    effects: ['effect_elice_robot_engine']
  },

  // 2+. 伊莉斯(Elice)环境净化无人机
  'Elice_scope_robot': {
    key: 'Elice_scope_robot',
    name: '伊莉斯\n环境净化无人机 ',
    region: 'Pupu',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    race: ['summon'],
    type: 'unit',
    keywords: ['Elusive','Ephemeral'],
    description: '',
    imageUrl: UNIT_IMAGES.elice,
    effects: [],
    isCollectible: false
  },

  // 3. 歌莉娅 (Golia)
  Chongye_Squad_Golia: {
    key: 'Chongye_Squad_Golia', gachaPool: GachaPoolEnum.Permanent,
    name: '“重叶”\n歌莉娅 ',
    region: 'Pupu',
    cost: 6,
    power: 4,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: [],
    ability: { id: 'golia_buff', label: '高能碳水补给', description: '入场：本回合给予友方所有单位 +2/+0 和 [碾压]。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    description: ' 入场：若友方场上有“卜卜 灵鉴”，本回合给予友方所有单位 +2/+0 和 [碾压]',
    imageUrl: UNIT_IMAGES.golia,
    effects: ['effect_golia_buff']
  },
  // ==========================================
    // [新增] 第 3 批法术包实装
    // ==========================================

  vitality_regen: {
    key: 'vitality_regen', gachaPool: GachaPoolEnum.Permanent,
    name: '活力再生',
    cost: 1,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Pupu',
    description: '快速：治疗一个受伤的友方单位2点生命值。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.vitality_regen,
    effects: ['effect_vitality_regen'],
    ai: { pattern: 'HEAL', priority: 2, config: { targetType: 'unit', healValue: 2, onlyWounded: true } }
  },

  full_purification: {
    key: 'full_purification', gachaPool: GachaPoolEnum.Permanent,
    name: '全力净化',
    cost: 4,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Pupu',
    description: '快速：赋予友方各处的“环境净化无人机”+1/+1。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.full_purification,
    effects: ['effect_full_purification'],
    ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALL_ALLIES', targetKeyFilter: ['Elice_scope_robot'], power: 1, health: 1, minAllies: 1 } }
  },
  // 3. 蟾鉴易纹
  toad_pattern: {
    key: 'toad_pattern', gachaPool: GachaPoolEnum.Permanent,
    name: '蟾鉴易纹',
    cost: 4,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Pupu',
    description: '快速：移除友方的幻象关键词，并将它转移给所选的敌方单位。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.toad_pattern,
    effects: ['effect_toad_pattern'],
    ai: { pattern: 'KEYWORD_TRANSFER', priority: 3, config: { keyword: 'Ephemeral' } }
  },

  // ==========================================
  // 猫汐尔 · 图征小队 (Mauxir — Illustration Squad)
  // ==========================================

  // --- 图征小队 库兰娅丝 ---
  'Illustration_Squad_Kuranas': {
    key: 'Illustration_Squad_Kuranas', gachaPool: GachaPoolEnum.Permanent, name: '"图征"\n库兰娅丝', cost: 1, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: ['Aura'], race: ['summoner'],
    description: '入场：召唤一个“清泉医疗鳄”。“清泉医疗鳄”提供的加成视为其造成的伤害，可以计入“猫汐尔 莲驱”的升级进度。',
    imageUrl: UNIT_IMAGES.kuranas,
    effects: ['effect_Illustration_Squad_Kuranas_summon'],
  },

  // --- 衍生物：清泉医疗鳄 ---
  'Kuranas_Crocodile': {
    key: 'Kuranas_Crocodile', name: '清泉医疗鳄', cost: 2, power: 0, health: 2, maxHealth: 2,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: [], race: ['summon'],
    description: '【回合结束时】：赋予友方所有召唤单位和“库兰娅丝” +0/+1，随后对自己造成1点伤害,每累计BUFF 5 次生成一张“梦莲无人机”（医疗鳄不受其他医疗鳄的加成）。',
    imageUrl: UNIT_IMAGES.kuranas,
    effects: ['effect_Kuranas_Crocodile_round_end'],
    isCollectible: false,
  },

  // --- 图征小队 斯瓦莉 ---
  'Illustration_Squad_Swali': {
    key: 'Illustration_Squad_Swali', gachaPool: GachaPoolEnum.Permanent, name: '"图征"\n斯瓦莉', cost: 3, power: 1, health: 3, maxHealth: 4,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: ['Aura'], race: ['summoner'],
    description: '入场：召唤一个“珍馐绵羊”。每目睹使用一个“梦莲无人机”，增加“猫汐尔 莲驱” 3 点升级进度。',
    imageUrl: UNIT_IMAGES.swali,
    effects: ['effect_Illustration_Squad_Swali_summon'],
  },

  // --- 衍生物：珍馐绵羊 ---
  'Swali_Sheep': {
    key: 'Swali_Sheep', name: '珍馐绵羊', cost: 1, power: 3, health: 1, maxHealth: 1,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: ['Last Breath', 'Challenger'], race: ['summon'],
    description: '[亡语]：在手牌中生成两张“梦莲无人机”。',
    imageUrl: UNIT_IMAGES.swali,
    effects: ['effect_Swali_Sheep_deathrattle'],
    isCollectible: false,
  },

  // --- 图征小队 索莉妮 ---
  'Illustration_Squad_Soline': {
    key: 'Illustration_Squad_Soline', gachaPool: GachaPoolEnum.Permanent, name: '"图征"\n索莉妮', cost: 5, power: 2, health: 4, maxHealth: 4,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: ['Aura'], race: ['summoner'],
    description: '入场：召唤一个“搜救阿努比斯”。“搜救阿努比斯”造成的伤害会额外翻倍后再计入“猫汐尔 莲驱”的升级进度。',
    imageUrl: UNIT_IMAGES.soline,
    effects: ['effect_Illustration_Squad_Soline_summon'],
  },

  // --- 衍生物：搜救阿努比斯 ---
  'Soline_Anubis': {
    key: 'Soline_Anubis', name: '搜救阿努比斯', cost: 2, power: 4, health: 2, maxHealth: 2,
    isChampion: false, level: 0, region: 'Mauxir', type: 'unit', keywords: ['QuickAttack', 'Challenger', 'Ability'], race: ['summon'],
    description: '打击时，在手牌中生成一张“梦莲无人机”',
    imageUrl: UNIT_IMAGES.soline,
    effects: ['effect_Soline_Anubis_strike'],
    ability: {
      id: 'soline_anubis_strike',
      label: '精准索敌',
      description: '打击时，在手牌中生成一张“梦莲无人机”。',
      trigger: 'on_attack_declare',
      maxCharges: -1,
      postTriggerState: 'recharge'
    },
    isCollectible: false,
  },
  // --- "圣树"小队 (Sacred Tree Squad) — 安卡希雅专属后勤 ---


  'Sacred_Tree_Squad_Lumi': {
    key: 'Sacred_Tree_Squad_Lumi', gachaPool: GachaPoolEnum.Permanent,
    name: '"圣树"\n露米',
    region: 'Acacia',
    cost: 1,
    power: 0,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Channel', 'Ability'],
    description: '打出时：“飞剑”2。',
    ability: { id: 'sacred_tree_lumi_gen', label: '时序加速', description: '打出时：飞剑2。', trigger: 'on_play', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.sacred_tree_lumi,
    effects: ['effect_sacred_tree_lumi'],
  },
  'Sacred_Tree_Squad_Margaret': {
    key: 'Sacred_Tree_Squad_Margaret', gachaPool: GachaPoolEnum.Permanent,
    name: '"圣树"\n玛格丽特',
    region: 'Acacia',
    cost: 3,
    power: 1,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Channel','Regeneration'],
    description: '进攻时：“飞剑”2并点亮充能。',
    ability: { id: 'sacred_tree_margaret_sword', label: '飞剑突袭', description: '进攻时：飞剑2并点亮充能。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.sacred_tree_margaret,
    effects: ['effect_sacred_tree_margaret'],
  },
  'Sacred_Tree_Squad_Alvina': {
    key: 'Sacred_Tree_Squad_Alvina', gachaPool: GachaPoolEnum.Permanent,
    name: '"圣树"\n阿尔维娜',
    region: 'Acacia',
    cost: 5,
    power: 3,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Ability','Overwhelm'],
    description: '入场时：本回合每“飞剑”1 则本回合随机给予我方全员每人1次+1/+0或+0/+1并备战。',
    ability: { id: 'sacred_tree_alvina_sword', label: '飞剑召来', description: '入场时：若本回合已飞剑，每飞剑1 则给予我方全员本回合随机+1/+0或+0/+1，并备战。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.sacred_tree_alvina,
    effects: ['effect_sacred_tree_alvina'],
  },

  // ==========================================
  // [2026-08-06 莉莉子] 安卡阵营占位法术（名字待定）
  // 法术9：快速 撤回我方单位 + 飞剑2（已从 TEST 区迁入安卡阵营）
  // 法术19：慢速 单体3伤，本回合飞剑≥4 则本回合费用-2
  // 法术20：快速 回响+飞剑2
  // ==========================================

  temp_spell_09: {
    key: 'temp_spell_09', name: '御剑归鞘', cost: 3, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Acacia',
    description: '快速：撤回一个我方单位（返回手牌），并且飞剑1。', type: 'spell-fast', keywords: [],
    effects: ['effect_temp_spell_09', 'effect_temp_spell_09_flying'],
    imageUrl: SPELL_IMAGES.temp_spell_09,
  },
  temp_spell_19: {
    key: 'temp_spell_19', name: '破军', cost: 5, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Acacia',
    description: '慢速：对一个敌方单位造成3点伤害。若本回合至少飞剑4，则本回合该法术费用-2。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_19_strike'],
    imageUrl: SPELL_IMAGES.temp_spell_19,
  },
  temp_spell_20: {
    key: 'temp_spell_20', name: '剑鸣回响', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Acacia',
    description: '快速：回响，飞剑2。', type: 'spell-slow', keywords: ['Echo'],
    effects: ['effect_temp_spell_20_flying'],
    imageUrl: SPELL_IMAGES.temp_spell_20,
  },

  // ==========================================
  // 五星后勤 — 专属搭档（待对应天启者实装）
  // ==========================================

  // --- “明夷”小队 (Mingyi Squad) ---

  // 1. 赭毫 (Zhe Hao)
  'Mingyi_Squad_Zhe_hao': {
    key: 'Mingyi_Squad_Zhe_hao', gachaPool: GachaPoolEnum.Permanent,
    name: '“明夷”\n赭毫',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['SpellShield'], // 魔免：优秀的 1 费赖场单位
    description: '',
    imageUrl: UNIT_IMAGES.zhe_hao,
    effects: [],
    isCollectible: false
  },

  // 2. 朱鹤 (Zhu He)
  'Mingyi_Squad_Zhu_He': {
    key: 'Mingyi_Squad_Zhu_He', gachaPool: GachaPoolEnum.Permanent,
    name: '“明夷”\n朱鹤',
    region: 'Logistics',
    cost: 3,
    power: 1,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['SpellShield'], // 高血量+魔免，非常难解的肉盾
    description: '',
    imageUrl: UNIT_IMAGES.zhu_he,
    effects: [],
    isCollectible: false
  },

  // 3. 金琅 (Jin Lang)
  'Mingyi_Squad_Jin_Lang': {
    key: 'Mingyi_Squad_Jin_Lang', gachaPool: GachaPoolEnum.Permanent,
    name: '“明夷”\n金琅',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['SpellShield'], // 极其稳固的防线
    description: '',
    imageUrl: UNIT_IMAGES.jin_lang,
    effects: [],
    isCollectible: false
  },


  // --- “星朗”小队 (Star Bright Squad) ---

  // 4. 朵薇尔 (Doveil)
  'Star_Bright_Squad_Doveil': {
    key: 'Star_Bright_Squad_Doveil', gachaPool: GachaPoolEnum.Permanent,
    name: '“星朗”\n朵薇尔',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Channel'], // 充能：每回合回复法术法力
    description: '',
    imageUrl: UNIT_IMAGES.doveil,
    effects: [],
    isCollectible: false
  },

  // 5. 爱莉薇娅 (Alivy)
  'Star_Bright_Squad_Alivy': {
    key: 'Star_Bright_Squad_Alivy', gachaPool: GachaPoolEnum.Permanent,
    name: '“星朗”\n爱莉薇娅',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Channel'],
    description: '',
    imageUrl: UNIT_IMAGES.alivy,
    effects: [],
    isCollectible: false
  },

  // 6. 妲柯丝 (Dakors)
  'Star_Bright_Squad_Dakors': {
    key: 'Star_Bright_Squad_Dakors', gachaPool: GachaPoolEnum.Permanent,
    name: '“星朗”\n妲柯丝',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Channel'],
    description: '',
    imageUrl: UNIT_IMAGES.dakors,
    effects: [],
    isCollectible: false
  },
  temp_spell_01: {
    key: 'temp_spell_01', name: '降临事件', cost: 9, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '慢速：击杀场上的所有单位。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_01'],
    imageUrl: SPELL_IMAGES.temp_spell_01,
  },
  temp_spell_02: {
    key: 'temp_spell_02', name: '瓦尔哈拉的呼唤', cost: 10, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '慢速：复活我方本牌局死亡的最强的6个单位，且全员带[幻象]。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_02'],
    imageUrl: SPELL_IMAGES.temp_spell_02,
  },
  temp_spell_05: {
    key: 'temp_spell_05', name: '单刀直入', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst', // [费用待定]
    description: '快速：对任意一个目标造成2点伤害。', type: 'spell-fast', keywords: [],
    effects: ['effect_temp_spell_05'],
    imageUrl: SPELL_IMAGES.temp_spell_05,
  },
  temp_spell_06: {
    key: 'temp_spell_06', name: '抵抗', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：无效化一个费用小于等于3的快速法术。', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_06'],
    imageUrl: SPELL_IMAGES.temp_spell_06,
  },
  temp_spell_07: {
    key: 'temp_spell_07', name: '抗拒', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '快速：无效化一个快速或者慢速法术。', type: 'spell-fast', keywords: [],
    effects: ['effect_temp_spell_07'],
    imageUrl: SPELL_IMAGES.temp_spell_07,
  },
  temp_spell_08: {
    key: 'temp_spell_08', name: '拒绝', cost: 7, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '快速：无效化当前法术堆叠中的所有敌方法术。', type: 'spell-fast', keywords: [],
    effects: ['effect_temp_spell_08'],
    imageUrl: SPELL_IMAGES.temp_spell_08,
  },
  temp_spell_10: {
    key: 'temp_spell_10', name: '战术回撤', cost: 3, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '快速：从战场上撤回一个友方单位，生成一张瞬逝的“战术闪击”。', type: 'spell-fast', keywords: [],
    effects: ['effect_temp_spell_10', 'effect_temp_spell_10_generate'],
    imageUrl: SPELL_IMAGES.temp_spell_10,
  },
  temp_spell_11: {
    key: 'temp_spell_11', name: '战术闪击', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：选择一个手牌中费用小于等于3的单位打出。', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_11'],
    imageUrl: SPELL_IMAGES.temp_spell_11,
    isCollectible: false
  },
  temp_spell_13: {
    key: 'temp_spell_13', name: '深思熟虑', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：抉择："正面突破" 或 "迂回防守"。', type: 'spell-burst', keywords: [],
    choices: ['temp_spell_14', 'temp_spell_15'],
    effects: ['effect_temp_spell_13'],
    imageUrl: SPELL_IMAGES.temp_spell_13,
  },
  temp_spell_14: {
    key: 'temp_spell_14', name: '正面突破', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：本回合给予一个单位+3/+0。（"深思熟虑"的衍生法术）', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_14'],
    imageUrl: SPELL_IMAGES.temp_spell_14,
    isCollectible: false
  },
  temp_spell_15: {
    key: 'temp_spell_15', name: '迂回防守', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：本回合给予一个单位+0/+3。（"深思熟虑"的衍生法术）', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_15'],
    imageUrl: SPELL_IMAGES.temp_spell_15,
    isCollectible: false
  },
  temp_spell_16: {
    key: 'temp_spell_16', name: '神格共鸣', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Analyst',
    description: '极速：必须选择三个天启者，之后赋予她们+2/+2。', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_16'],
    imageUrl: SPELL_IMAGES.temp_spell_16,
  },



  // ==========================================
  // 四星后勤
  // ==========================================

  // --- “阿尔戈”小队 (Argo Squad) ---

  // 1. 鸽子 (Pigeon) — 1费1/2，进攻时对敌方水晶造成1点伤害
  'Argo_Squad_Pigeon': {
    key: 'Argo_Squad_Pigeon', gachaPool: GachaPoolEnum.Permanent,
    name: '”阿尔戈”\n鸽子',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Ability'],
    description: '进攻时：对敌方水晶造成1点伤害。',
    ability: { id: 'argo_pigeon_attack', label: '蓄意渗透', description: '进攻时：对敌方水晶造成1点伤害。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge' },
    onAttackSpell: 'Argo_Deliberate_Infiltration',
    imageUrl: UNIT_IMAGES.pigeon,
    effects: []
  },

  // 2. 乐手 (Musician) — 4费3/5，回合开始时对敌方水晶造成1点伤害
  'Argo_Squad_Musician': {
    key: 'Argo_Squad_Musician', gachaPool: GachaPoolEnum.Permanent,
    name: '”阿尔戈”\n乐手',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Ability'],
    description: '回合开始时：对敌方水晶造成1点伤害。',
    ability: { id: 'argo_musician_round_start', label: '蓄意渗透', description: '回合开始时：对敌方水晶造成1点伤害。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.musician,
    effects: ['effect_argo_musician_round_start']
  },

  // 3. 箭头 (Arrowhead) — 6费0/16 碾压，发起进攻时赋予自己+3/+0
  'Argo_Squad_Arrowhead': {
    key: 'Argo_Squad_Arrowhead', gachaPool: GachaPoolEnum.Permanent,
    name: '”阿尔戈”\n箭头',
    region: 'Logistics',
    cost: 6,
    power: 0,
    health: 14,
    maxHealth: 14,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Overwhelm', 'Ability'],
    description: '发起进攻时：赋予自己+3/+0。',
    ability: { id: 'argo_arrowhead_attack', label: '箭头冲击', description: '发起进攻时：赋予自己+3/+0。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.arrowhead,
    effects: ['effect_argo_arrowhead_attack_declare']
  },


  // ⚡ 蓄意渗透 — 对敌方水晶造成1点伤害（阿尔戈小队专属法术）
  Argo_Deliberate_Infiltration: {
    key: 'Argo_Deliberate_Infiltration', gachaPool: GachaPoolEnum.Permanent,
    name: '蓄意渗透',
    region: 'Logistics',
    cost: 1,
    power: 0,
    health: 0,
    maxHealth: 0,
    isChampion: false,
    level: 0,
    type: 'spell-fast',
    keywords: [],
    description: '对敌方水晶造成1点伤害。',
    imageUrl: SPELL_IMAGES.deliberate_infiltration,
    effects: ['effect_deliberate_infiltration'],
    ai: { pattern: 'DAMAGE', priority: 3, config: { targetType: 'nexus', lethalPriority: true, damageValue: 1 } },
    isCollectible: true,
  },

  // --- “鬼怪”小队 (Ghost Squad) 4星 ---

  // 1. 安提娜 (Antina)
  'Ghost_Squad_Antina': {
    key: 'Ghost_Squad_Antina', gachaPool: GachaPoolEnum.Permanent,
    name: '”鬼怪”\n安提娜',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome', 'Elusive','Ability'],
    description: '首次打击敌方水晶后，随机赋予一个友方单位 +1/+0。',
    ability: { id: 'ghost_antina_inspire', label: '鼓舞', description: '首次打击敌方水晶后，随机赋予一个友方单位 +1/+0。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.antina,
    effects: ['effect_ghost_antina_inspire']
  },

  // 2. 薇兹 (Vez)
  'Ghost_Squad_Vez': {
    key: 'Ghost_Squad_Vez', gachaPool: GachaPoolEnum.Permanent,
    name: '”鬼怪”\n薇兹',
    region: 'Logistics',
    cost: 2,
    power: 2,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome','Ability'],
    description: '首次打击敌方水晶后，随机治疗一个受伤的友方单位3点；若没有友方受伤，则治疗我方水晶3点。',
    ability: { id: 'ghost_vez_heal', label: '治愈', description: '首次打击敌方水晶后，随机治疗一个受伤的友方单位3点；若没有友方受伤，则治疗我方水晶3点。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.vez,
    effects: ['effect_ghost_vez_heal']
  },

  // 3. 瓦莲 (Valen)
  'Ghost_Squad_Valen': {
    key: 'Ghost_Squad_Valen', gachaPool: GachaPoolEnum.Permanent,
    name: '”鬼怪”\n瓦莲',
    region: 'Logistics',
    cost: 5,
    power: 4,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome','Ability'],
    description: '首次打击敌方水晶后，赋予我方所有单位 +1/+1，并给予敌方所有单位 -1/-0。',
    ability: { id: 'ghost_valen_rally', label: '鼓舞军心', description: '首次打击敌方水晶后，赋予我方所有单位 +1/+1，并给予敌方所有单位 -1/-0。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.valen,
    effects: ['effect_ghost_valen_rally']
  },


  // --- 诗人小队 (Poet Squad) 4星 [2026-07-10 「记录」方向B] ---
  // 核心：复制/复现法术，不同条件触发

  Poet_Squad_Oisin: {
    key: 'Poet_Squad_Oisin', gachaPool: GachaPoolEnum.Permanent, name: '”诗人”\n奥伊辛', region: 'Logistics',
    cost: 3, power: 3, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Scout','Ability'],
    description: '入场时，在手牌中生成一张“真实快照”。',
    ability: { id: 'poet_oisin_generate', label: '真实快照', description: '入场时，在手牌中生成一张“真实快照”。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.oisin, effects: ['effect_poet_oisin_generate']
  },
  Poet_Squad_Caitlin: {
    key: 'Poet_Squad_Caitlin', gachaPool: GachaPoolEnum.Permanent, name: '”诗人"\n凯特琳', region: 'Logistics',
    cost: 5, power: 3, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Aura'],
    description: '在场时，我方所有极速和快速法术魔耗值减1。',
    imageUrl: UNIT_IMAGES.caitlin, effects: ['effect_poet_caitlin_aura']
  },
  Poet_Squad_Kelo: {
    key: 'Poet_Squad_Kelo', gachaPool: GachaPoolEnum.Permanent, name: '”诗人”\n科洛', region: 'Logistics',
    cost: 7, power: 3, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '回合开始时：复制上回合我方打出的前三张非[瞬逝]卡牌到手牌，并赋予[瞬逝]。',
    ability: { id: 'poet_kelo_recycle', label: '时光回溯', description: '回合开始时：复制上回合我方打出的前三张非[瞬逝]卡牌到手牌，并赋予[瞬逝]。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.kelo, effects: ['effect_poet_kelo_recycle']
  },

  // --- 诗人小队 法术：真实快照 ---
  true_snapshot: {
    key: 'true_snapshot', name: '真实快照', cost: 1,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Logistics',
    description: '快速：选择一张手牌，复制三张相同的卡牌并洗入牌库。',
    type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.true_snapshot,
    effects: ['effect_true_snapshot_clone'],
    isCollectible: false,
  },


  // --- 锻造者小队 (The Forger Squad) 4星 [2026-07-14 正式实装] ---
  // 核心：「手牌强化」—— 减费引擎 + 法术增伤 + 大哥突袭，三人各司其职

  // 1. 蕾西亚 (Leisia) — 情报扒手，打击减费引擎
  The_Forger_Squad_Leisia: {
    key: 'The_Forger_Squad_Leisia', gachaPool: GachaPoolEnum.Permanent, name: '”锻造者”\n蕾西亚', region: 'Logistics',
    cost: 2, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, type: 'unit', keywords: ['Elusive','Ability'],
    description: '打击后，减少我方费用最高的手牌1点费用。',
    ability: { id: 'forger_leisia_strike_reduce', label: '情报扒手', description: '打击后，减少我方费用最高的手牌1点费用。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.leisia, effects: ['effect_forger_leisia_strike_reduce'],
  },

  // 2. 缇坦妮娅 (Tatiana) — 军医，法术增伤光环
  The_Forger_Squad_Tatiana: {
    key: 'The_Forger_Squad_Tatiana', gachaPool: GachaPoolEnum.Permanent, name: '”锻造者”\n缇坦妮娅', region: 'Logistics',
    cost: 4, power: 2, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Aura'],
    description: '光环：我方所有法术伤害+1。',
    imageUrl: UNIT_IMAGES.tatiana, effects: ['effect_forger_tatiana_aura'],
  },

  // 3. 白猎 (White Hunt) — 神枪手，手牌召唤大哥
  // 注意：白猎的入场效果由 useGameState.ts playCard 拦截 + confirmWhiteHuntSummon 处理
  // effects 引用仅用于视觉层（startCasting/isCastingForHand 检测），不走 effectProcessor 执行
  The_Forger_Squad_White_Hunt: {
    key: 'The_Forger_Squad_White_Hunt', gachaPool: GachaPoolEnum.Permanent, name: '”锻造者”\n白猎', region: 'Logistics',
    cost: 8, power: 4, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Overwhelm','Ability'],
    description: '入场时，选择一个手牌中费用低于7的单位，赋予他+3/+0和碾压并将他从手牌中召唤。',
    ability: { id: 'forger_white_hunt_summon', label: '神枪手', description: '入场时，选择一个手牌中费用低于7的单位，赋予他+3/+0和碾压并将他从手牌中召唤。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.white_hunt, effects: ['effect_forger_white_hunt_summon'],
  },

  // ==========================================
  // [2026-07-14 梵音小队] SacredChants Squad
  // ==========================================

  SacredChants_Squad_Loka: {
    key: 'SacredChants_Squad_Loka', gachaPool: GachaPoolEnum.Permanent, name: '"梵音"\n洛迦', region: 'Logistics',
    cost: 3, power: 3, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ephemeral','Last Breath'],
    description: '亡语：召唤一个“幻莲音蛇”。',
    imageUrl: UNIT_IMAGES.loka, effects: ['effect_hymn_loka_death_summon'],
  },
  Loka_Phantom_Serpent: {
    key: 'Loka_Phantom_Serpent', name: '幻莲音蛇', region: 'Logistics',
    cost: 1, power: 0, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '回合开始时，本回合提升1点法力上限。',
    ability: { id: 'loka_serpent_bonus_mana', label: '音律共鸣', description: '回合开始时，本回合提升1点法力上限。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.loka, effects: ['effect_loka_serpent_bonus_mana'],
    isCollectible: false,
  },

  SacredChants_Squad_European_Angelica: {
    key: 'SacredChants_Squad_European_Angelica', gachaPool: GachaPoolEnum.Permanent, name: '"梵音"\n欧白芷', region: 'Logistics',
    cost: 5, power: 5, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ephemeral','Last Breath'],
    description: '亡语：在手牌中生成一张“迷离之音”。',
    imageUrl: UNIT_IMAGES.european_angelica, effects: ['effect_hymn_angelica_death_generate'],
  },
  Angelica_Hazy_Note: {
    key: 'Angelica_Hazy_Note', name: '迷离之音', region: 'Logistics',
    cost: 1, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, type: 'spell-burst', keywords: [],
    description: '治疗我方任意一个单位或水晶2点生命值，并永久提升1点法力上限。',
    imageUrl: SPELL_IMAGES.angelica_hazy_note,
    effects: ['effect_angelica_hazy_note_heal', 'effect_angelica_hazy_note_mana'],
    isCollectible: false,
  },

  SacredChants_Squad_Shalo: {
    key: 'SacredChants_Squad_Shalo', gachaPool: GachaPoolEnum.Permanent, name: '”梵音”\n莎罗', region: 'Logistics',
    cost: 8, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ephemeral','Last Breath','Ability'],
    description: '入场时，本牌局我方每有一个单位阵亡，则同时赋予一次自己和随机场上任意一个其他友方单位+1/+1。亡语：在手牌中生成一张“巨偶一瞥”。',
    ability: { id: 'hymn_shalo_onplay_buff', label: '战意传承', description: '入场时，本牌局我方每有一个单位阵亡，则同时赋予一次自己和随机场上任意一个其他友方单位+1/+1。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.shalo,
    effects: ['effect_hymn_shalo_onplay_buff', 'effect_hymn_shalo_death_generate'],
  },
  Shalo_Golem_Glimpse: {
    key: 'Shalo_Golem_Glimpse', name: '巨偶一瞥', region: 'Logistics',
    cost: 5, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, type: 'spell-slow', keywords: [],
    description: '对所有敌人造成3点伤害。[觉悟]：此牌费用降低为0，赋予我方场上所有单位【碾压】。',
    imageUrl: SPELL_IMAGES.shalo_golem_glimpse,
    effects: ['effect_shalo_golem_glimpse_strike'],
    isCollectible: false,
  },


  // --- 布里吉小队 (Bridget Squad) 4星 ---

  Bridget_Squad_Feier: {
    key: 'Bridget_Squad_Feier', gachaPool: GachaPoolEnum.Permanent, name: '”布里吉”\n菲儿', region: 'Logistics',
    cost: 1, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '入场：在手牌生成一张“强行通讯”。',
    ability: { id: 'bridget_feier_gencard', label: '紧急通讯', description: '入场：在手牌生成一张“强行通讯”。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.feier, effects: ['effect_bridget_feier_gencard']
  },
  // ==========================================
  // [布里吉小队] 法术 & 衍生物
  // ==========================================

  // 菲儿生成的强力通讯法术
  forced_communication: {
    key: 'forced_communication', name: '强行通讯', cost: 0,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Logistics',
    description: '慢速：燃尽。抽取（燃尽值/2）张卡牌。',
    type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.forced_communication,
    effects: ['effect_forced_communication_draw'],
    isCollectible: false
  },
  Bridget_Squad_Chinchilla: {
    key: 'Bridget_Squad_Chinchilla', gachaPool: GachaPoolEnum.Permanent, name: '”布里吉”\n金吉拉', region: 'Logistics',
    cost: 3, power: 3, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '入场：抽取 2 张卡牌。',
    ability: { id: 'bridget_chinchilla_draw2', label: '补给', description: '入场：抽取 2 张卡牌。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.chinchilla, effects: ['effect_bridget_chinchilla_draw2']
  },
  Bridget_Squad_Valerie: {
    key: 'Bridget_Squad_Valerie', gachaPool: GachaPoolEnum.Permanent, name: '”布里吉”\n瓦莱莉', region: 'Logistics',
    cost: 7, power: 2, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'], race: ['summoner'],
    description: '入场：可弃置任意数量手牌，召唤一只“夜巡猫头鹰”。',
    ability: { id: 'bridget_valerie_discard_summon', label: '夜巡', description: '入场：可弃置任意数量手牌，召唤一只”夜巡猫头鹰”。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.valerie, effects: ['effect_bridget_valerie_discard_summon']
  },
  // 瓦莱莉召唤的猫头鹰
  Night_Owl: {
    key: 'Night_Owl', name: '夜巡猫头鹰', cost: 0,
    power: 3, health: 3, maxHealth: 2,
    isChampion: false, level: 0, region: 'Logistics', race: ['summon'],
    description: '“瓦莱莉”弃置的每张手牌使此单位 +1/+1。亡语：抽取（弃置数量-1）张卡牌。',
    type: 'unit', keywords: ['Ephemeral', 'Last Breath','Ability'],
    ability: { id: 'night_owl_death_draw', label: '亡语抽牌', description: '亡语：抽取（弃置数量-1）张卡牌。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.valerie,
    effects: ['effect_night_owl_death_draw'],
    isCollectible: false
  },



  // --- 精灵小队 (Spirit Squad) 4星 [2026-07-10 资源循环体系] ---
  // 核心：产出精灵祈愿 → 治疗+buff 资源循环

  Spirit_Squad_Lusaka: {
    key: 'Spirit_Squad_Lusaka', gachaPool: GachaPoolEnum.Permanent, name: '”精灵”\n露莎卡', region: 'Logistics',
    cost: 2, power: 1, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Scout','Ability'],
    description: '入场时，在手牌中生成一张“精灵祈愿”。',
    ability: { id: 'spirit_lusaka_generate', label: '精灵祈愿', description: '入场时，在手牌中生成一张“精灵祈愿”。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.lusaka, effects: ['effect_spirit_lusaka_generate']
  },
  Spirit_Squad_Snenika: {
    key: 'Spirit_Squad_Snenika', gachaPool: GachaPoolEnum.Permanent, name: '”精灵”\n斯涅妮卡', region: 'Logistics',
    cost: 4, power: 2, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Scout','Tough','Ability'],
    description: '入场：本回合给予我方全员+0+1。首次回合结束时：治疗我方所有受伤的单位2点。',
    ability: { id: 'spirit_snenika_aura_heal', label: '守护', description: '入场：本回合给予我方全员+0+1。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.snenika, effects: ['effect_spirit_snenika_aura', 'effect_spirit_snenika_roundend_heal']
  },
  Spirit_Squad_Bonnie: {
    key: 'Spirit_Squad_Bonnie', gachaPool: GachaPoolEnum.Permanent, name: '”精灵”\n邦尼', region: 'Logistics',
    cost: 6, power: 5, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Scout','Overwhelm','Ability'],
    description: '打击时：在手牌中生成一张“精灵祈愿”。',
    ability: { id: 'spirit_bonnie_generate', label: '精灵祈愿', description: '打击时：在手牌中生成一张“精灵祈愿”。', trigger: 'on_attack_declare', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.bonnie, effects: ['effect_spirit_bonnie_generate']
  },

  // --- 精灵小队 法术：精灵祈愿 ---
  spirit_prayer: {
    key: 'spirit_prayer', name: '精灵祈愿', cost: 1,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, region: 'Logistics',
    description: '快速：治疗一个受伤单位1点生命值，之后赋予+1+0。',
    type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.spirit_prayer,
    effects: ['effect_spirit_prayer_heal_buff'],
    isCollectible: false,
  },

  // --- 绿灵小队 (Green Spirit Squad) 4星 ---
  // [2026-07-10 「生长」方向A → 设计变更：统一牌库buff，触发条件各不相同]

  Green_Spirit_Squad_Glanz: {
    key: 'Green_Spirit_Squad_Glanz', gachaPool: GachaPoolEnum.Permanent, name: '”绿灵”\n格伦茨', region: 'Logistics',
    cost: 1, power: 0, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Tough','Ability'],
    description: '入场时，赋予我方牌库最上方的两个单位+0/+1。',
    ability: { id: 'green_glanz_buff', label: '绿灵祝福', description: '入场时，赋予我方牌库最上方的两个单位+0/+1。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.glanz, effects: ['effect_green_glanz_buff']
  },
  Green_Spirit_Squad_Eva: {
    key: 'Green_Spirit_Squad_Eva', gachaPool: GachaPoolEnum.Permanent, name: '”绿灵”\n艾娃', region: 'Logistics',
    cost: 3, power: 2, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Tough', 'Aura'],
    description: '光环：我方每打出一张费用≥1的快速法术，赋予牌库最上方的单位+1/+1。',
    imageUrl: UNIT_IMAGES.eva, effects: ['effect_green_eva_aura']
  },
  Green_Spirit_Squad_Grace: {
    key: 'Green_Spirit_Squad_Grace', gachaPool: GachaPoolEnum.Permanent, name: '”绿灵”\n格蕾丝', region: 'Logistics',
    cost: 5, power: 3, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'], race: ['summoner'],
    description: '入场时，召唤一个“行李箱机器人”。',
    ability: { id: 'green_grace_summon', label: '行李托运', description: '入场时，召唤一个“行李箱机器人”。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.grace, effects: ['effect_green_grace_summon']
  },

  // --- 绿灵小队 衍生物：行李箱机器人 ---
  Green_Spirit_Squad_LuggageBot: {
    key: 'Green_Spirit_Squad_LuggageBot', name: '行李箱机器人', region: 'Logistics',
    cost: 5, power: 2, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'], race: ['summon'],
    description: '入场时，赋予我方牌库所有单位 +1/+1。',
    ability: { id: 'green_luggage_buff', label: '满载而归', description: '入场时，赋予我方牌库所有单位 +1/+1。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.grace, effects: ['effect_green_luggage_buff'],
    isCollectible: false,
  },


  // --- 达努小队 (Danu Squad) 4星 — 防守反击 ---

  Danu_Squad_Banshee: {
    key: 'Danu_Squad_Banshee', gachaPool: GachaPoolEnum.Permanent, name: '”达努”\n班西', region: 'Logistics',
    cost: 1, power: 0, health: 3, maxHealth: 3,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '受伤并存活后，自身+2/+0，并在手牌中生成一张“墓穴蜘蛛”。',
    ability: { id: 'danu_banshee_damage_buff', label: '复仇', description: '受伤并存活后，自身+2/+0，并在手牌中生成一张“墓穴蜘蛛”。', trigger: 'on_play', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.banshee, effects: ['effect_danu_banshee_damage_buff'],
  },
  // 班西生成的衍生物
  Tomb_Spider: {
    key: 'Tomb_Spider', name: '墓穴蜘蛛', region: 'Logistics',
    cost: 1, power: 1, health: 1, maxHealth: 1,
    isChampion: false, level: 0, type: 'unit', keywords: ['Challenger'],
    description: '',
    imageUrl: UNIT_IMAGES.banshee, // 与班西共用卡面
    effects: [], isCollectible: false,
  },
  Danu_Squad_Wendy: {
    key: 'Danu_Squad_Wendy', gachaPool: GachaPoolEnum.Permanent, name: '”达努”\n温蒂', region: 'Logistics',
    cost: 3, power: 1, health: 4, maxHealth: 4,
    isChampion: false, level: 0, type: 'unit', keywords: ['Aura','Ability'],
    description: '入场：对我方除自己以外所有单位造成1点伤害。在场时，每当我方单位受伤并存活，赋予其+1/+0和【坚韧】。',
    ability: { id: 'danu_wendy_onplay_ping', label: '铁荆棘', description: '入场：对我方除自己以外所有单位造成1点伤害。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.wendy,
    effects: ['effect_danu_wendy_onplay_ping', 'effect_danu_wendy_aura_buff'],
  },
  Danu_Squad_SilverArm: {
    key: 'Danu_Squad_SilverArm', gachaPool: GachaPoolEnum.Permanent, name: '”达努”\n银臂', region: 'Logistics',
    cost: 5, power: 5, health: 8, maxHealth: 8,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '首次进攻时，对所有战场上的单位造成2点伤害。首次进攻战斗结束后，存活的我方单位获得+1/+0和【挑战者】。',
    ability: { id: 'danu_silverarm_first_attack', label: '银臂乱打', description: '首次进攻时，对所有战场上的单位造成2点伤害。', trigger: 'on_attack_declare', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.silver_arm,
    effects: ['effect_danu_silverarm_post_combat_buff'],
    onAttackSpell: 'Silver_Arm_Smash',
  },

  // ⚡ 银臂乱打 — 对所有单位造成2点伤害
  Silver_Arm_Smash: {
    key: 'Silver_Arm_Smash', gachaPool: GachaPoolEnum.Permanent, name: '银臂乱打', region: 'Logistics',
    cost: 0, power: 0, health: 0, maxHealth: 0,
    isChampion: false, level: 0, type: 'spell-fast', keywords: [],
    description: '对战场上所有单位造成2点伤害。',
    imageUrl: SPELL_IMAGES.silver_arm_smash,
    effects: ['effect_silver_arm_smash'],
    ai: { pattern: 'DAMAGE', priority: 2, config: { targetType: 'any', damageValue: 2 } },
    isCollectible:  false,
  },

  // --- “鸦眼”小队 (Crows Eyest Squad) 4星 — 校准 ---

  Crows_Eyest_Squad_An: {
    key: 'Crows_Eyest_Squad_An', gachaPool: GachaPoolEnum.Permanent, name: '”鸦眼”\n安', region: 'Logistics',
    cost: 2, power: 2, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '入场时：校准。',
    ability: { id: 'crows_an_onplay_calibrate', label: '校准预知', description: '入场时：校准。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.crows_an, effects: ['effect_crows_an_onplay_calibrate'],
  },
  Crows_Eyest_Squad_Mulin: {
    key: 'Crows_Eyest_Squad_Mulin', gachaPool: GachaPoolEnum.Permanent, name: '”鸦眼”\n穆林', region: 'Logistics',
    cost: 3, power: 3, health: 4, maxHealth: 4,
    isChampion: false, level: 0, type: 'unit', keywords: ['Ability'],
    description: '入场：随机给予牌库中4个单位+2/+2。',
    ability: { id: 'crows_mulin_onplay_deckbuff', label: '暗中支援', description: '入场：随机给予牌库中4个单位+2/+2。', trigger: 'on_play', maxCharges: 1, postTriggerState: 'dim' },
    imageUrl: UNIT_IMAGES.crows_mulin,
    effects: ['effect_crows_mulin_onplay_deckbuff'],
  },
  Crows_Eyest_Squad_Hiki: {
    key: 'Crows_Eyest_Squad_Hiki', gachaPool: GachaPoolEnum.Permanent, name: '”鸦眼”\n海基', region: 'Logistics',
    cost: 5, power: 3, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Aura','Ability'],
    description: '入场和回合开始时：在手牌中生成一张“精密操作”，若手牌中已有该卡牌，则赋予它费用-1。在场时，校准中未被选中的单位卡牌获得+1/+1，法术卡牌费用-1。',
    ability: { id: 'crows_hiki_roundstart_generate', label: '精密规划', description: '入场和回合开始时：在手牌中生成一张“精密操作”。', trigger: 'round_start', maxCharges: -1, postTriggerState: 'recharge' },
    imageUrl: UNIT_IMAGES.crows_hiki,
    effects: ['effect_crows_hiki_onplay_generate', 'effect_crows_hiki_roundstart_generate', 'effect_crows_hiki_calibrate_aura'],
  },

  // ⚡ 精密操作 — 校准（鸦眼小队专属法术）
  Crows_Precise_Operation: {
    key: 'Crows_Precise_Operation',
    name: '精密操作',
    region: 'Logistics',
    cost: 3,
    power: 0,
    health: 0,
    maxHealth: 0,
    isChampion: false,
    level: 0,
    type: 'spell-fast',
    keywords: [],
    description: '校准',
    imageUrl: SPELL_IMAGES.crows_precise_operation,
    effects: ['effect_crows_precise_operation'],
    ai: { pattern: 'CALIBRATE', priority: 1, config: {} },
    isCollectible: false,
  },

  // ==========================================
  // 三星后勤
  // ==========================================

  // 1. 玛蒂娜 (Martina)
  Dream_Guardians_Squad_Martina: {
    key: 'Dream_Guardians_Squad_Martina', gachaPool: GachaPoolEnum.Permanent,
    name: '“守梦人”\n玛蒂娜',
    region: 'Logistics',
    cost: 1,
    power: 2,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: [],
    description: '',
    imageUrl: UNIT_IMAGES.martina,
    effects: []
  },

  // 2. 赛奎特 (Saikui)
  Dream_Guardians_Squad_Saikui: {
    key: 'Dream_Guardians_Squad_Saikui', gachaPool: GachaPoolEnum.Permanent,
    name: '“守梦人”\n赛奎特',
    region: 'Logistics',
    cost: 2,
    power: 2,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: [],
    description: '',
    imageUrl: UNIT_IMAGES.saikui,
    effects: []
  },

  // 3. 海法 (Haifa)
  Dream_Guardians_Squad_Haifa: {
    key: 'Dream_Guardians_Squad_Haifa', gachaPool: GachaPoolEnum.Permanent,
    name: '“守梦人”\n海法',
    region: 'Logistics',
    cost: 4,
    power: 4,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Tough'],
    description: '',
    imageUrl: UNIT_IMAGES.haifa,
    effects: []
  },


  // --- “阿尔斯特”小队 (Ulster Squad) ---

  // 1. 科尼 (Koni)
  'Ulster_Squad_Koni': {
    key: 'Ulster_Squad_Koni', gachaPool: GachaPoolEnum.Permanent,
    name: '“阿尔斯特”\n科尼',
    region: 'Logistics',
    cost: 1,
    power: 0,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: [],
    description: '',
    imageUrl: UNIT_IMAGES.koni,
    effects: []
  },

  // 2. 梅芙 (Maeve)
  'Ulster_Squad_Maeve': {
    key: 'Ulster_Squad_Maeve', gachaPool: GachaPoolEnum.Permanent,
    name: '“阿尔斯特”\n梅芙',
    region: 'Logistics',
    cost: 3,
    power: 3,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Regeneration'],
    description: '',
    imageUrl: UNIT_IMAGES.maeve,
    effects: []
  },

  // 3. 弗拉梅 (Flamme)
  'Ulster_Squad_Flamme': {
    key: 'Ulster_Squad_Flamme', gachaPool: GachaPoolEnum.Permanent,
    name: '“阿尔斯特”\n弗拉梅',
    region: 'Logistics',
    cost: 6,
    power: 4,
    health: 8,
    maxHealth: 8,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Regeneration', 'Overwhelm'],
    description: '',
    imageUrl: UNIT_IMAGES.flamme,
    effects: []
  },


  // --- “堤丰”小队 (Typhoon Squad) ---

  // 1. 焰心 (Flameheart)
  'Typhoon_Squad_Flameheart': {
    key: 'Typhoon_Squad_Flameheart', gachaPool: GachaPoolEnum.Permanent,
    name: '“堤丰”\n焰心',
    region: 'Logistics',
    cost: 2,
    power: 4,
    health: 3,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['CantBlock'],
    description: '',
    imageUrl: UNIT_IMAGES.flameheart,
    effects: []
  },

  // 2. 多尼尔 (Dornier)
  'Typhoon_Squad_Dornier': {
    key: 'Typhoon_Squad_Dornier', gachaPool: GachaPoolEnum.Permanent,
    name: '“堤丰”\n多尼尔',
    region: 'Logistics',
    cost: 4,
    power: 4,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['CantBlock', 'Challenger'],
    description: '',
    imageUrl: UNIT_IMAGES.dornier,
    effects: []
  },

  // 3. 613
  'Typhoon_Squad_613': {
    key: 'Typhoon_Squad_613', gachaPool: GachaPoolEnum.Permanent,
    name: '“堤丰”\n613',
    region: 'Logistics',
    cost: 7,
    power: 7,
    health: 9,
    maxHealth: 9,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['CantBlock', 'Overwhelm'],
    description: '',
    imageUrl: UNIT_IMAGES.unit_613,
    effects: []
  },


  // --- “信使”小队 (Messenger Squad) ---

  // 1. 阿花 (Ah Hua)
  'Messenger_Squad_Ah_Hua': {
    key: 'Messenger_Squad_Ah_Hua', gachaPool: GachaPoolEnum.Permanent,
    name: '“信使”\n阿花',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Scout'],
    description: '',
    imageUrl: UNIT_IMAGES.ah_hua,
    effects: []
  },

  // 2. 格娜 (Gena)
  'Messenger_Squad_Gena': {
    key: 'Messenger_Squad_Gena', gachaPool: GachaPoolEnum.Permanent,
    name: '“信使”\n格娜',
    region: 'Logistics',
    cost: 2,
    power: 2,
    health: 3,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Scout'],
    description: '',
    imageUrl: UNIT_IMAGES.gena,
    effects: []
  },

  // 3. 瓦力 (WALL-E)
  'Messenger_Squad_WALL_E': {
    key: 'Messenger_Squad_WALL_E', gachaPool: GachaPoolEnum.Permanent,
    name: '“信使”\n瓦力',
    region: 'Logistics',
    cost: 5,
    power: 5,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Scout', 'QuickAttack'],
    description: '',
    imageUrl: UNIT_IMAGES.wall_e,
    effects: []
  },


  // --- 御守小队 (Amulet Squad) 3星 ---

  Amulet_Squad_Scorching: {
    key: 'Amulet_Squad_Scorching', gachaPool: GachaPoolEnum.Permanent, name: '"御守"\n灼', region: 'Logistics',
    cost: 2, power: 1, health: 4, maxHealth: 4,
    isChampion: false, level: 0, type: 'unit', keywords: ['Thorns'], description: '',
    imageUrl: UNIT_IMAGES.scorching, effects: []
  },
  Amulet_Squad_Cattail: {
    key: 'Amulet_Squad_Cattail', gachaPool: GachaPoolEnum.Permanent, name: '"御守"\n香蒲', region: 'Logistics',
    cost: 4, power: 2, health: 6, maxHealth: 6,
    isChampion: false, level: 0, type: 'unit', keywords: ['Thorns'], description: '',
    imageUrl: UNIT_IMAGES.cattail, effects: []
  },
  Amulet_Squad_Peaches: {
    key: 'Amulet_Squad_Peaches', gachaPool: GachaPoolEnum.Permanent, name: '"御守"\n桃子', region: 'Logistics',
    cost: 6, power: 6, health: 6, maxHealth: 6,
    isChampion: false, level: 0, type: 'unit', keywords: ['Thorns', 'Regeneration'], description: '',
    imageUrl: UNIT_IMAGES.peaches, effects: []
  },


  // --- 梵灵小队 (FanLing Squad) 3星 ---

  FanLing_Squad_Lucia: {
    key: 'FanLing_Squad_Lucia', gachaPool: GachaPoolEnum.Permanent, name: '"梵灵"\n露茜娅', region: 'Logistics',
    cost: 1, power: 1, health: 2, maxHealth: 2,
    isChampion: false, level: 0, type: 'unit', keywords: ['Fearsome'], description: '',
    imageUrl: UNIT_IMAGES.lucia, effects: []
  },
  FanLing_Squad_Nafu: {
    key: 'FanLing_Squad_Nafu', gachaPool: GachaPoolEnum.Permanent, name: '"梵灵"\n纳芙', region: 'Logistics',
    cost: 3, power: 3, health: 4, maxHealth: 4,
    isChampion: false, level: 0, type: 'unit', keywords: ['Fearsome'], description: '',
    imageUrl: UNIT_IMAGES.nafu, effects: []
  },
  FanLing_Squad_Wasi: {
    key: 'FanLing_Squad_Wasi', gachaPool: GachaPoolEnum.Permanent, name: '"梵灵"\n瓦茜', region: 'Logistics',
    cost: 5, power: 5, health: 5, maxHealth: 5,
    isChampion: false, level: 0, type: 'unit', keywords: ['Fearsome', 'Challenger'], description: '',
    imageUrl: UNIT_IMAGES.wasi, effects: []
  },

  // ==========================================
  // [新增] 第 4 批通用法术
  // ==========================================

  // 1. 暗箱操作
  backroom_deal: {
    key: 'backroom_deal', gachaPool: GachaPoolEnum.Permanent,
    name: '暗箱操作',
    cost: 2,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Logistics',
    description: '极速：丢弃一张卡牌以抽两张卡牌。',
    type: 'spell-burst',
    keywords: [],
    imageUrl: SPELL_IMAGES.backroom_deal,
    effects: ['effect_backroom_deal_discard', 'effect_backroom_deal_draw'],
    ai: { pattern: 'DRAW', priority: 2, config: { drawCount: 2, discardCount: 1 } }
  },

  // 2. 生机补充
  vitality_supplement: {
    key: 'vitality_supplement', gachaPool: GachaPoolEnum.Permanent,
    name: '生机补充',
    cost: 2,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Logistics',
    description: '极速：治疗任意一个友方单位或水晶3点生命值。',
    type: 'spell-burst',
    keywords: [],
    imageUrl: SPELL_IMAGES.vitality_supplement,
    effects: ['effect_vitality_supplement'],
    ai: { pattern: 'HEAL', priority: 2, config: { targetType: 'any', healValue: 3 } }
  },

  // 3. 能量补充
  energy_supplement: {
    key: 'energy_supplement', gachaPool: GachaPoolEnum.Permanent,
    name: '能量补充',
    cost: 2,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Logistics',
    description: '极速：选取一个天启者，抽取一张该天启者的英雄法术。',
    type: 'spell-burst',
    keywords: [],
    imageUrl: SPELL_IMAGES.energy_supplement,
    effects: ['effect_energy_supplement'],
    ai: { pattern: 'DRAW', priority: 1, config: { tutorChampion: true } }
  },

  // 4. 巴德尔试剂
  bader_reagent: {
    key: 'bader_reagent', gachaPool: GachaPoolEnum.Permanent,
    name: '巴德尔试剂',
    cost: 3,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Logistics',
    description: '极速：治疗友方所有单位与水晶1点生命值，并赋予友方所有单位 +0/+1。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.bader_reagent,
    effects: ['effect_bader_reagent_heal', 'effect_bader_reagent_buff'],
    ai: { pattern: 'BUFF', priority: 2, config: { targetType: 'ALL_ALLIES', health: 1, minAllies: 1 } }
  },
  temp_spell_18: {
    key: 'temp_spell_18', name: '刻骨冰寒', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Logistics',
    description: '极速：冻结一个敌人。', type: 'spell-burst', keywords: [],
    effects: ['effect_temp_spell_18'],
    imageUrl: SPELL_IMAGES.temp_spell_18,
  },
  // ==========================================
  // 泰坦生态系 (Titan Units)
  // ==========================================
  titan_mutant: {
    key: 'titan_mutant', gachaPool: GachaPoolEnum.Permanent, name: '异化人', cost: 1, power: 0, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '基础的泰坦战斗单元。', type: 'unit', keywords: ['Titan'],
    imageUrl: TITAN_IMAGES.mutant,

  },
  titan_hybrid: {
    key: 'titan_hybrid', gachaPool: GachaPoolEnum.Permanent, name: '融合体', cost: 2, power: 0, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '被侵蚀的活体，受到攻击时会反伤敌人。', type: 'unit', keywords: ['Titan', 'Thorns'],
    imageUrl: TITAN_IMAGES.hybrid,
  },
  titan_type_b_mutant: {
    key: 'titan_type_b_mutant', gachaPool: GachaPoolEnum.Permanent, name: '乙型异化人', cost: 2, power: 3, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '泰坦N层脉冲时：对敌方随机单位造成 N 次 1 点伤害。', type: 'unit', keywords: ['Titan'],
    imageUrl: TITAN_IMAGES.type_b,
  },
  titan_hodu: {
    key: 'titan_hodu', gachaPool: GachaPoolEnum.Permanent, name: '祸斗', cost: 3, power: 2, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '高速突进的机械猎犬。', type: 'unit', keywords: ['Titan', 'QuickAttack'],
    imageUrl: TITAN_IMAGES.hodu,
  },
  titan_type_c_mutant: {
    key: 'titan_type_c_mutant', gachaPool: GachaPoolEnum.Permanent, name: '丙型异化人', cost: 3, power: 1, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '泰坦脉冲不再提供攻击力加成，泰坦N层脉冲时：获得生命值+N。', type: 'unit', keywords: ['Titan', 'Tough'],
    imageUrl: TITAN_IMAGES.type_c,
  },
  titan_gonglu: {
    key: 'titan_gonglu', gachaPool: GachaPoolEnum.Permanent, name: '贡露', cost: 4, power: 1, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'Titan', race: ['titan', 'summoner'],
    description: '泰坦脉冲不再提供攻击力加成，泰坦N层脉冲时：获得N层无人机充能，进攻时：一次至多消耗4点无人机的充能，召唤对应数量的“辅助无人机”参战。', type: 'unit', keywords: ['Titan', 'Elusive','Scout'],
    imageUrl: TITAN_IMAGES.gonglu,
  },
  titan_gonglu_drone: {
    key: 'titan_gonglu_drone', name: '贡露·辅助无人机', cost: 0, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'Titan', race: ['summon'],
    description: '无法获得除“贡露”以外的任何增益效果。', type: 'unit', keywords: ['Elusive', 'Ephemeral','Scout'],
    imageUrl: TITAN_IMAGES.gonglu_support, // [注] 暂时复用贡露原画，有专图可替换
    isCollectible: false // 衍生卡不可直接放入牌组
  },
  titan_type_d_mutant: {
    key: 'titan_type_d_mutant', gachaPool: GachaPoolEnum.Permanent, name: '丁型异化人', cost: 6, power: 3, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '入场是，额外发起进攻并立刻进行一次泰坦脉冲。亡语：对敌方所有单位与水晶造成 2 点伤害。', type: 'unit', keywords: ['Titan', 'Challenger', 'Last Breath'],
    imageUrl: TITAN_IMAGES.type_d,
    effects: ['effect_titan_type_d_lastbreath']
  },
  titan_gaimer: {
    key: 'titan_gaimer', gachaPool: GachaPoolEnum.Permanent, name: '盖弥尔', cost: 8, power: 2, health: 8, maxHealth: 8, isChampion: false, level: 0, region: 'Titan', race: ['titan'],
    description: '泰坦脉冲时攻击力加成减半(向下取整)，关键词永不黯淡。每次脉冲时对敌方所有单位与水晶造成 1 点伤害。', type: 'unit', keywords: ['Titan', 'Barrier'],
    imageUrl: TITAN_IMAGES.gaimer,
  },
  temp_spell_03: {
    key: 'temp_spell_03', name: '源火重燃', cost: 6, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Titan',
    description: '慢速：再次点亮我方所有泰坦单位的关键词。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_03'],
    imageUrl: SPELL_IMAGES.temp_spell_03,
    isCollectible: false
  },
  temp_spell_04: {
    key: 'temp_spell_04', name: '天声震落', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Titan',
    description: '慢速：立刻触发我方所有单位的泰坦脉冲。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_04'],
    imageUrl: SPELL_IMAGES.temp_spell_04,
    isCollectible: false
  },
  // 1. 鬼影森森
  ghostly_shadows: {
    key: 'ghostly_shadows', gachaPool: GachaPoolEnum.Permanent,
    name: '鬼影森森',
    cost: 4,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Titan',
    description: '慢速：召唤三个“异化人”至备战席。',
    type: 'spell-slow',
    keywords: [],
    imageUrl: SPELL_IMAGES.ghostly_shadows,
    effects: ['effect_ghostly_shadows'],
    ai: { pattern: 'SUMMON', priority: 2, config: { minBoardSpace: 3, summonCount: 3 } },
  },

  // 2. 毁灭仪式
  destruction_ritual: {
    key: 'destruction_ritual', gachaPool: GachaPoolEnum.Permanent,
    name: '毁灭仪式',
    cost: 3,
    power: 0, health: 0, maxHealth: 0,
    isChampion: false,
    level: 0,
    region: 'Titan',
    description: '快速：击杀一个泰坦友方单位，以对一个敌方单位造成3点伤害。',
    type: 'spell-fast',
    keywords: [],
    imageUrl: SPELL_IMAGES.destruction_ritual,
    effects: ['effect_destruction_ritual'],
    ai: { pattern: 'SACRIFICE', priority: 2, config: { damageValue: 3, requireKeyword: 'Titan', sacrificeMaxCost: 3 } },
  },
  temp_spell_12: {
    key: 'temp_spell_12', name: '泰坦降临', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Titan',
    description: '慢速：燃尽，根据消耗的费用召唤对应的随机数量随机费用的泰坦单位。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_12'],
    imageUrl: SPELL_IMAGES.temp_spell_12,
  },

  temp_spell_17: {
    key: 'temp_spell_17', name: '芬格尼尔之冬', cost: 9, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Titan',
    description: '慢速：本回合冻结所有敌人，并对所有敌人造成3点伤害。', type: 'spell-slow', keywords: [],
    effects: ['effect_temp_spell_17'],
    imageUrl: SPELL_IMAGES.temp_spell_17,
  },

  // --- 测试专用卡 ---
  // ===========================================================
  // 36 关键词 专项测试卡组 (Manual Test Set)
  // 所有测试单位统一为 1 费，并链接本地原画
  // ===========================================================

  // --- 1. Overwhelm (碾压) ---
  test_overwhelm: {
    key: 'test_overwhelm', name: '测试：碾压', cost: 1, power: 4, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '攻击时溢出伤害打击水晶。', type: 'unit', keywords: ['Overwhelm'],
    imageUrl: TEST_IMAGES.overwhelm,
    isCollectible: false
  },
  // --- 2. QuickAttack (先攻) ---
  test_quickattack: {
    key: 'test_quickattack', name: '测试：先攻', cost: 1, power: 3, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时先造成伤害。', type: 'unit', keywords: ['QuickAttack'],
    imageUrl: TEST_IMAGES.quickattack,
    isCollectible: false
  },
  // --- 3. Regeneration (再生) ---
  test_regeneration: {
    key: 'test_regeneration', name: '测试：再生', cost: 1, power: 2, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '回合开始回复满血。', type: 'unit', keywords: ['Regeneration'],
    imageUrl: TEST_IMAGES.regeneration,
    isCollectible: false
  },
  // --- 4. Elusive (隐秘) ---
  test_elusive: {
    key: 'test_elusive', name: '测试：隐秘', cost: 1, power: 2, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '只能被隐秘阻挡。', type: 'unit', keywords: ['Elusive'],
    imageUrl: TEST_IMAGES.elusive,
    isCollectible: false
  },
  // --- 5. Challenger (挑战者) ---
  test_challenger: {
    key: 'test_challenger', name: '测试：挑战者', cost: 1, power: 2, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时可指定阻挡者。', type: 'unit', keywords: ['Challenger'],
    imageUrl: TEST_IMAGES.challenger,
    isCollectible: false
  },
  // --- 6. Barrier (屏障) ---
  test_barrier: {
    key: 'test_barrier', name: '测试：屏障', cost: 1, power: 3, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '抵挡一次伤害。', type: 'unit', keywords: ['Barrier'],
    imageUrl: TEST_IMAGES.barrier,
    isCollectible: false
  },
  // --- 7. CantBlock (无法格挡) ---
  test_cantblock: {
    key: 'test_cantblock', name: '测试：无法格挡', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '不能用来防守。', type: 'unit', keywords: ['CantBlock'],
    imageUrl: TEST_IMAGES.cantblock,
    isCollectible: false
  },
  // --- 8. Lifesteal (吸血) ---
  test_lifesteal: {
    key: 'test_lifesteal', name: '测试：吸血', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '伤害治疗水晶。', type: 'unit', keywords: ['Lifesteal'],
    imageUrl: TEST_IMAGES.lifesteal,
    isCollectible: false
  },
  // --- 9. Last Breath (亡语) ---
  test_last_breath: {
    key: 'test_last_breath', name: '测试：亡语', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '死亡时触发效果。', type: 'unit', keywords: ['Last Breath'],
    imageUrl: TEST_IMAGES.lastbreath,
    isCollectible: false
  },
  // --- 10. Fearsome (凶恶) ---
  test_fearsome: {
    key: 'test_fearsome', name: '测试：凶恶', cost: 1, power: 4, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '只能被3攻以上单位阻挡。', type: 'unit', keywords: ['Fearsome'],
    imageUrl: TEST_IMAGES.fearsome,
    isCollectible: false
  },
  // --- 11. Frostbite (冻结) ---
  test_frostbite: {
    key: 'test_frostbite', name: '测试：冻结', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '入场本回合将自己攻击变为0。', type: 'unit', keywords: ['Frostbite'],
    effects: ['effect_test_frostbite'],
    imageUrl: TEST_IMAGES.frostbite,
    isCollectible: false
  },
  // --- 12. Scout (侦察) ---
  test_scout: {
    key: 'test_scout', name: '测试：侦察', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '首次进攻不消耗进攻币。', type: 'unit', keywords: ['Scout'],
    imageUrl: TEST_IMAGES.scout,
    isCollectible: false
  },
  // --- 13. Ephemeral (幻象) ---
  test_ephemeral: {
    key: 'test_ephemeral', name: '测试：幻象', cost: 1, power: 6, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '打击或回合结束时死亡。', type: 'unit', keywords: ['Ephemeral'],
    imageUrl: TEST_IMAGES.ephemeral,
    isCollectible: false
  },
  // --- 14. Stun (眩晕) ---
  test_stun: {
    key: 'test_stun', name: '测试：眩晕', cost: 1, power: 3, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '将敌人移出战斗。', type: 'unit', keywords: ['Stun'],
    imageUrl: TEST_IMAGES.stun,
    isCollectible: false
  },
  // --- 15. Tough (坚韧) ---
  test_tough: {
    key: 'test_tough', name: '测试：坚韧', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '受到的伤害-1。', type: 'unit', keywords: ['Tough'],
    imageUrl: TEST_IMAGES.tough,
    isCollectible: false
  },
  // --- 16. Double Attack (连击) ---
  test_double_attack: {
    key: 'test_double_attack', name: '测试：连击', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时打击两次。', type: 'unit', keywords: ['Double Attack'],
    imageUrl: TEST_IMAGES.doubleattack,
    isCollectible: false
  },
  // --- 17. Support (支援) ---
  test_support: {
    key: 'test_support', name: '测试：支援', cost: 1, power: 1, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时Buff右侧友方单位。', type: 'unit', keywords: ['Support'],
    imageUrl: TEST_IMAGES.support,
    isCollectible: false
  },
  // --- 18. Deadly (剧毒) ---
  test_deadly: {
    key: 'test_deadly', name: '测试：剧毒', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '一击必杀。', type: 'unit', keywords: ['Deadly'],
    imageUrl: TEST_IMAGES.deadly,
    isCollectible: false
  },
  // --- 19. SpellShield (魔免) ---
  test_spellshield: {
    key: 'test_spellshield', name: '测试：魔免', cost: 1, power: 5, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '抵挡一次法术。', type: 'unit', keywords: ['SpellShield'],
    imageUrl: TEST_IMAGES.spellshield,
    isCollectible: false
  },
  // --- 20. Silence (沉默) ---
  test_silence: {
    key: 'test_silence', name: '测试：沉默', cost: 1, power: 3, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '移除敌人所有词条。', type: 'unit', keywords: ['Silence'],
    imageUrl: TEST_IMAGES.silence,
    isCollectible: false
  },
  // --- 21. Berserk (狂暴) ---
  test_berserk: {
    key: 'test_berserk', name: '测试：狂暴', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '击杀后+1/+1。', type: 'unit', keywords: ['Berserk'],
    imageUrl: TEST_IMAGES.berserk,
    isCollectible: false
  },
  // --- 22. Cleave (溅射) ---
  test_cleave: {
    key: 'test_cleave', name: '测试：溅射', cost: 1, power: 3, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '同时打击阻挡者相邻单位。', type: 'unit', keywords: ['Cleave'],
    imageUrl: TEST_IMAGES.cleave,
    isCollectible: false
  },
  // --- 23. Thorns (反伤) ---
  test_thorns: {
    key: 'test_thorns', name: '测试：反伤', cost: 1, power: 1, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '受击时对攻击者打1。', type: 'unit', keywords: ['Thorns'],
    imageUrl: TEST_IMAGES.thorns,
    isCollectible: false
  },
  // --- 24. Vanguard (先锋) ---
  test_vanguard: {
    key: 'test_vanguard', name: '测试：先锋', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '首张打出触发。', type: 'unit', keywords: ['Vanguard'],
    imageUrl: TEST_IMAGES.vanguard,
    isCollectible: false
  },
  // --- 25. Ambush (伏击) ---
  test_ambush: {
    key: 'test_ambush', name: '测试：伏击', cost: 1, power: 4, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '非首张打出触发。', type: 'unit', keywords: ['Ambush'],
    imageUrl: TEST_IMAGES.ambush,
    isCollectible: false
  },
  // --- 26. Plunder (劫掠) ---
  test_plunder: {
    key: 'test_plunder', name: '测试：劫掠', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '若造成过水晶伤害则触发。', type: 'unit', keywords: ['Plunder'],
    imageUrl: TEST_IMAGES.plunder,
    isCollectible: false
  },
  // --- 27. Exposed (暴露) ---
  test_exposed: {
    key: 'test_exposed', name: '测试：暴露', cost: 1, power: 5, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '可被任意敌人挑战。', type: 'unit', keywords: ['Exposed'],
    imageUrl: TEST_IMAGES.exposed,
    isCollectible: false
  },
  // --- 28. Shroud (帷幕) ---
  test_shroud: {
    key: 'test_shroud', name: '测试：帷幕', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '无法被法术指定。', type: 'unit', keywords: ['Shroud'],
    imageUrl: TEST_IMAGES.shroud,
    isCollectible: false
  },
  // --- 29. Immobile (哨兵) ---
  test_immobile: {
    key: 'test_immobile', name: '测试：哨兵', cost: 1, power: 0, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '无法进攻或格挡。', type: 'unit', keywords: ['Immobile'],
    imageUrl: TEST_IMAGES.immobile,
    isCollectible: false
  },
  // --- 30. Reborn (复生) ---
  test_reborn: {
    key: 'test_reborn', name: '测试：复生', cost: 1, power: 4, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '死亡后以1血复活。', type: 'unit', keywords: ['Reborn'],
    imageUrl: TEST_IMAGES.reborn,
    isCollectible: false
  },
  // --- 31. Execute (处决) ---
  test_execute: {
    key: 'test_execute', name: '测试：处决', cost: 1, power: 5, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '消灭受伤单位。', type: 'unit', keywords: ['Execute'],
    imageUrl: TEST_IMAGES.execute,
    isCollectible: false
  },
  // --- 32. Sniper (狙击) ---
  test_sniper: {
    key: 'test_sniper', name: '测试：狙击', cost: 2, power: 1, health: 4, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时对阻挡者打1。', type: 'unit', keywords: ['Sniper'],
    imageUrl: TEST_IMAGES.sniper,
    isCollectible: false
  },
  // --- 33. Volatile (瞬逝) ---
  test_volatile: {
    key: 'test_volatile', name: '测试：瞬逝', cost: 2, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '回合结束弃置。', type: 'unit', keywords: ['Volatile'],
    imageUrl: TEST_IMAGES.volatile,
    isCollectible: false
  },
  // --- 34. Echo (回响) ---
  test_echo: {
    key: 'test_echo', name: '测试：回响', cost: 1, power: 2, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '生成自身的瞬逝复制。', type: 'unit', keywords: ['Echo'],
    imageUrl: TEST_IMAGES.echo,
    isCollectible: false
  },
  // --- 35. Impact (冲击) ---
  test_impact: {
    key: 'test_impact', name: '测试：冲击', cost: 2, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '打击时对水晶造成1点伤害。', type: 'unit', keywords: ['Impact'],
    imageUrl: TEST_IMAGES.impact,
    isCollectible: false
  },
  // --- 36. Channel (充能) ---
  test_channel: {
    key: 'test_channel', name: '测试：充能', cost: 1, power: 1, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '回复法术法力。', type: 'unit', keywords: ['Channel'],
    imageUrl: TEST_IMAGES.channel,
    isCollectible: false
  },
  // --- 泰坦 (Titan) ---
  test_titan: {
    key: 'test_titan', name: '测试：泰坦', cost: 1, power: 2, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '回合结束脉冲+攻，然后黯淡。', type: 'unit', keywords: ['Titan'],
    imageUrl: TEST_IMAGES.titan,
    isCollectible: false
  },
};


export const createCard = (key: string): CardData => ({
    ...CARD_DB[key],
    id: Math.random().toString(36).substr(2, 9),
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 }
});