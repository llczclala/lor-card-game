import type { CardData } from '../types';
import { HERO_IMAGES, TEST_IMAGES, SPELL_IMAGES, UNIT_IMAGES} from './imageData';

export const CARD_DB: Record<string, Omit<CardData, 'id' | 'strikeCount' | 'animState' | 'damageTaken' | 'buffs'>> = {
  // --- 英雄：里芙 (Lyfe) ---
  lyfe: {
    key: 'lyfe', name: '里芙', cost: 1, power: 3, health: 5, maxHealth: 5,isChampion: true, level: 1, region: 'Lyfe',
    description: '升级：打击 2 次后我将升级 升级后，每回合开始时备战', type: 'unit', keywords: ['Regeneration'],
    imageUrl: HERO_IMAGES.lyfe.base,
    level2ImageUrl: HERO_IMAGES.lyfe.level2,
    associatedSpellKey: 'lyfe_spell',

    // [新增] 配置法术效果 (Level 1 暂时没有特殊效果，留空)
    effects: []
  },
  // 里芙
  lyfe_spell: {
    key: 'lyfe_spell', name: '里芙的决意', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '抉择：奔袭(小技能) 或 先登(大招)', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_spell,
    associatedChampionKey: 'lyfe',
    isLevel2Choice: true
  },
  lyfe_rush: {
    key: 'lyfe_rush', name: '奔袭', cost: 0, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '极速：本回合给予里芙 +1/+1。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_rush,
    effects: ['effect_lyfe_rush']
  },
  lyfe_ultimate: {
    key: 'lyfe_ultimate', name: '先登', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '快速：获得进攻标识。', type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.lyfe_ultimate,
    effects: ['effect_lyfe_ultimate']
  },

  // --- 英雄：芬妮 (Fenny) ---
  fenny: {
    key: 'fenny', name: '芬妮', cost: 1, power: 3, health: 5, maxHealth: 5, isChampion: true, level: 1, region: 'Fenny',
    description: '升级：造成过伤害。 | 碾压', type: 'unit', keywords: ['Overwhelm'],
    imageUrl: HERO_IMAGES.fenny.base,
    level2ImageUrl: HERO_IMAGES.fenny.level2,
    associatedSpellKey: 'fenny_spell'
  },
  // 芬妮的技能卡
  fenny_spell: {
    key: 'fenny_spell', name: '芬妮的狂热', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '抉择：强袭(小技能) 或 斩将(大招)', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.fenny_spell,
    associatedChampionKey: 'fenny',
    isLevel2Choice: true
  },
  fenny_strike: {
    key: 'fenny_strike', name: '强袭', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '极速：本回合给予芬妮 +2/+0。', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.fenny_strike,
    effects: ['effect_fenny_strike']
  },
  fenny_ultimate: {
    key: 'fenny_ultimate', name: '斩将', cost: 3, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '快速：芬妮以碾压打击一个敌方单位。', type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.fenny_ultimate,
    effects: ['effect_fenny_ultimate']
  },

  // --- 新增单位：Logistics (后勤) ---

  // 1. 玛蒂娜 (Martina)
  Dream_Guardians_Squad_Martina: {
    key: 'Dream_Guardians_Squad_Martina',
    name: '“守梦人”\n玛蒂娜',
    region: 'Logistics',
    cost: 2,
    power: 2,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Tough'],
    description: '', // 白板无需描述
    imageUrl: UNIT_IMAGES.martina,
    effects: []
  },

  // 2. 赛奎特 (Saikui)
  Dream_Guardians_Squad_Saikui: {
    key: 'Dream_Guardians_Squad_Saikui',
    name: '“守梦人”\n赛奎特',
    region: 'Logistics',
    cost: 3,
    power: 2,
    health: 4,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Tough', 'Elusive'],
    description: '',
    imageUrl: UNIT_IMAGES.saikui,
    effects: []
  },

  // 3. 海法 (Haifa)
  Dream_Guardians_Squad_Haifa: {
    key: 'Dream_Guardians_Squad_Haifa',
    name: '“守梦人”\n海法',
    region: 'Logistics',
    cost: 4,
    power: 3,
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
    key: 'Ulster_Squad_Koni',
    name: '“阿尔斯特”\n科尼', // 使用 \n 分隔小队名和人名
    region: 'Logistics',
    cost: 1,
    power: 0,
    health: 3,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Regeneration'],
    description: '',
    imageUrl: UNIT_IMAGES.koni,
    effects: []
  },

  // 2. 梅芙 (Maeve)
  'Ulster_Squad_Maeve': {
    key: 'Ulster_Squad_Maeve',
    name: '“阿尔斯特”\n梅芙',
    region: 'Logistics',
    cost: 3,
    power: 2,
    health: 4,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Regeneration', 'Challenger'],
    description: '',
    imageUrl: UNIT_IMAGES.maeve,
    effects: []
  },

  // 3. 弗拉梅 (Flamme)
  'Ulster_Squad_Flamme': {
    key: 'Ulster_Squad_Flamme',
    name: '“阿尔斯特”\n弗拉梅',
    region: 'Logistics',
    cost: 4,
    power: 3,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Regeneration', 'Overwhelm'],
    description: '',
    imageUrl: UNIT_IMAGES.flamme,
    effects: []
  },

  // --- “阿尔戈”小队 (Argo Squad) ---

  // 1. 鸽子 (Pigeon)
  'Argo_Squad_Pigeon': {
    key: 'Argo_Squad_Pigeon',
    name: '“阿尔戈”\n鸽子',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Sniper'],
    description: '',
    imageUrl: UNIT_IMAGES.pigeon,
    effects: []
  },

  // 2. 乐手 (Musician)
  'Argo_Squad_Musician': {
    key: 'Argo_Squad_Musician',
    name: '“阿尔戈”\n乐手',
    region: 'Logistics',
    cost: 2,
    power: 1,
    health: 3,
    maxHealth: 3,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Sniper', 'QuickAttack'], // 狙击+先攻：非常安全的解场单位
    description: '',
    imageUrl: UNIT_IMAGES.musician,
    effects: []
  },

  // 3. 箭头 (Arrowhead)
  'Argo_Squad_Arrowhead': {
    key: 'Argo_Squad_Arrowhead',
    name: '“阿尔戈”\n箭头',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Sniper', 'Overwhelm'], // 狙击+碾压：如果狙击伤害能杀敌，碾压伤害会更高
    description: '',
    imageUrl: UNIT_IMAGES.arrowhead,
    effects: []
  },

  // --- “堤丰”小队 (Typhoon Squad) ---

  // 1. 焰心 (Flameheart)
  'Typhoon_Squad_Flameheart': {
    key: 'Typhoon_Squad_Flameheart',
    name: '“堤丰”小队\n焰心',
    region: 'Logistics',
    cost: 1,
    power: 0,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Thorns'], // 反伤
    description: '',
    imageUrl: UNIT_IMAGES.flameheart,
    effects: []
  },

  // 2. 多尼尔 (Dornier)
  'Typhoon_Squad_Dornier': {
    key: 'Typhoon_Squad_Dornier',
    name: '“堤丰”\n多尼尔',
    region: 'Logistics',
    cost: 3,
    power: 1,
    health: 5,
    maxHealth: 5,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Thorns', 'Regeneration'], // 再生 + 反伤 = 强力肉盾
    description: '',
    imageUrl: UNIT_IMAGES.dornier,
    effects: []
  },

  // 3. 613
  'Typhoon_Squad_613': {
    key: 'Typhoon_Squad_613',
    name: '“堤丰”\n613',
    region: 'Logistics',
    cost: 4,
    power: 2,
    health: 6,
    maxHealth: 6,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Thorns', 'Tough'], // 反伤 + 坚韧 = 极难处理
    description: '',
    imageUrl: UNIT_IMAGES.unit_613,
    effects: []
  },

  // --- “信使”小队 (Messenger Squad) ---

  // 1. 阿花 (Ah Hua)
  'Messenger_Squad_Ah_Hua': {
    key: 'Messenger_Squad_Ah_Hua',
    name: '“信使”\n阿花',
    region: 'Logistics',
    cost: 2,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Scout', 'Barrier'],
    description: '',
    imageUrl: UNIT_IMAGES.ah_hua,
    effects: []
  },

  // 2. 格娜 (Gena)
  'Messenger_Squad_Gena': {
    key: 'Messenger_Squad_Gena',
    name: '“信使”\n格娜',
    region: 'Logistics',
    cost: 3,
    power: 3,
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
    key: 'Messenger_Squad_WALL_E',
    name: '“信使”\n瓦力',
    region: 'Logistics',
    cost: 4,
    power: 4,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Scout'],
    description: '',
    imageUrl: UNIT_IMAGES.wall_e,
    effects: []
  },

  // --- “鬼怪”小队 (Ghost Squad) ---

  // 1. 安提娜 (Antina)
  'Ghost_Squad_Antina': {
    key: 'Ghost_Squad_Antina',
    name: '“鬼怪”\n安提娜',
    region: 'Logistics',
    cost: 1,
    power: 1,
    health: 1,
    maxHealth: 1,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome', 'Elusive'], // 只能被3攻以上或隐秘单位阻挡，非常难缠
    description: '',
    imageUrl: UNIT_IMAGES.antina,
    effects: []
  },

  // 2. 薇兹 (Vez)
  'Ghost_Squad_Vez': {
    key: 'Ghost_Squad_Vez',
    name: '“鬼怪”\n薇兹',
    region: 'Logistics',
    cost: 2,
    power: 3,
    health: 2,
    maxHealth: 2,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome'],
    description: '',
    imageUrl: UNIT_IMAGES.vez,
    effects: []
  },

  // 3. 瓦莲 (Valen)
  'Ghost_Squad_Valen': {
    key: 'Ghost_Squad_Valen',
    name: '“鬼怪”\n瓦莲',
    region: 'Logistics',
    cost: 4,
    power: 4,
    health: 4,
    maxHealth: 4,
    isChampion: false,
    level: 0,
    type: 'unit',
    keywords: ['Fearsome'], // 高攻+凶恶，低攻单位无法垫刀
    description: '',
    imageUrl: UNIT_IMAGES.valen,
    effects: []
  },

  // 1. 单挑 (Single Combat)
  single_combat: {
    key: 'single_combat', name: '单挑', cost: 2, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '一个我方单位和一个敌方单位相互打击。',
    type: 'spell-fast',
    keywords: [],
    // [修改] 使用注册的图片
    imageUrl: SPELL_IMAGES.single_combat,
    effects: ['effect_single_combat']
  },

  // 2. 祈愿 (Prayer)
  prayer: {
    key: 'prayer', name: '祈愿', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '极速：+1/+1', type: 'spell-burst', keywords: [],
    effects: ['effect_prayer'],
    imageUrl: SPELL_IMAGES.prayer
  },

  // 3. 专注 (Focus)
  focus: {
    key: 'focus', name: '专注', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Lyfe',
    description: '慢速：进行备战', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.focus,
    effects: ['effect_focus']
  },

  // 4. 暗箭 (Hidden Arrow)
  hidden_arrow: {
    key: 'hidden_arrow', name: '暗箭', cost: 1, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '极速：选择一个单位或水晶（无论敌我），造成1点伤害', type: 'spell-burst', keywords: [],
    imageUrl: SPELL_IMAGES.hidden_arrow,
    effects: ['effect_hidden_arrow']
  },

  // 5. 振奋 (Inspire)
  inspire: {
    key: 'inspire', name: '振奋', cost: 5, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '快速：我方全体单位获得+3/+3', type: 'spell-fast', keywords: [],
    imageUrl: SPELL_IMAGES.inspire,
    effects: ['effect_inspire']
  },

  // 6. 破坏 (Destruction)
  destruction: {
    key: 'destruction', name: '破坏', cost: 4, power: 0, health: 0, maxHealth: 0, isChampion: false, level: 0, region: 'Fenny',
    description: '慢速：对敌方水晶造成4点伤害', type: 'spell-slow', keywords: [],
    imageUrl: SPELL_IMAGES.destruction,
    effects: ['effect_destruction']
  },

  // --- 测试专用卡 ---
  // ===========================================================
  // 36 关键词 专项测试卡组 (Manual Test Set)
  // 所有测试单位统一为 1 费，并链接本地原画
  // ===========================================================

  // --- 1. Overwhelm (碾压) ---
  test_overwhelm: {
    key: 'test_overwhelm', name: '测试：碾压', cost: 1, power: 6, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '攻击时溢出伤害打击水晶。', type: 'unit', keywords: ['Overwhelm'],
    imageUrl: TEST_IMAGES.overwhelm
  },
  // --- 2. QuickAttack (先攻) ---
  test_quickattack: {
    key: 'test_quickattack', name: '测试：先攻', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时先造成伤害。', type: 'unit', keywords: ['QuickAttack'],
    imageUrl: TEST_IMAGES.quickattack
  },
  // --- 3. Regeneration (再生) ---
  test_regeneration: {
    key: 'test_regeneration', name: '测试：再生', cost: 1, power: 2, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '回合开始回复满血。', type: 'unit', keywords: ['Regeneration'],
    imageUrl: TEST_IMAGES.regeneration
  },
  // --- 4. Elusive (隐秘) ---
  test_elusive: {
    key: 'test_elusive', name: '测试：隐秘', cost: 1, power: 2, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '只能被隐秘阻挡。', type: 'unit', keywords: ['Elusive'],
    imageUrl: TEST_IMAGES.elusive
  },
  // --- 5. Challenger (挑战者) ---
  test_challenger: {
    key: 'test_challenger', name: '测试：挑战者', cost: 1, power: 2, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时可指定阻挡者。', type: 'unit', keywords: ['Challenger'],
    imageUrl: TEST_IMAGES.challenger
  },
  // --- 6. Barrier (屏障) ---
  test_barrier: {
    key: 'test_barrier', name: '测试：屏障', cost: 1, power: 3, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '抵挡一次伤害。', type: 'unit', keywords: ['Barrier'],
    imageUrl: TEST_IMAGES.barrier
  },
  // --- 7. CantBlock (无法格挡) ---
  test_cantblock: {
    key: 'test_cantblock', name: '测试：无法格挡', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '不能用来防守。', type: 'unit', keywords: ['CantBlock'],
    imageUrl: TEST_IMAGES.cantblock
  },
  // --- 8. Lifesteal (吸血) ---
  test_lifesteal: {
    key: 'test_lifesteal', name: '测试：吸血', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '伤害治疗水晶。', type: 'unit', keywords: ['Lifesteal'],
    imageUrl: TEST_IMAGES.lifesteal
  },
  // --- 9. Last Breath (亡语) ---
  test_last_breath: {
    key: 'test_last_breath', name: '测试：亡语', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '死亡时触发效果。', type: 'unit', keywords: ['Last Breath'],
    imageUrl: TEST_IMAGES.lastbreath
  },
  // --- 10. Fearsome (凶恶) ---
  test_fearsome: {
    key: 'test_fearsome', name: '测试：凶恶', cost: 1, power: 4, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '只能被3攻以上单位阻挡。', type: 'unit', keywords: ['Fearsome'],
    imageUrl: TEST_IMAGES.fearsome
  },
  // --- 11. Frostbite (冻结) ---
  test_frostbite: {
    key: 'test_frostbite', name: '测试：冻结', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '本回合将敌人攻击变为0。', type: 'unit', keywords: ['Frostbite'],
    imageUrl: TEST_IMAGES.frostbite
  },
  // --- 12. Scout (侦察) ---
  test_scout: {
    key: 'test_scout', name: '测试：侦察', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '首次进攻不消耗进攻币。', type: 'unit', keywords: ['Scout'],
    imageUrl: TEST_IMAGES.scout
  },
  // --- 13. Ephemeral (幻象) ---
  test_ephemeral: {
    key: 'test_ephemeral', name: '测试：幻象', cost: 1, power: 6, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '打击或回合结束时死亡。', type: 'unit', keywords: ['Ephemeral'],
    imageUrl: TEST_IMAGES.ephemeral
  },
  // --- 14. Stun (眩晕) ---
  test_stun: {
    key: 'test_stun', name: '测试：眩晕', cost: 1, power: 3, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '将敌人移出战斗。', type: 'unit', keywords: ['Stun'],
    imageUrl: TEST_IMAGES.stun
  },
  // --- 15. Tough (坚韧) ---
  test_tough: {
    key: 'test_tough', name: '测试：坚韧', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '受到的伤害-1。', type: 'unit', keywords: ['Tough'],
    imageUrl: TEST_IMAGES.tough
  },
  // --- 16. Double Attack (连击) ---
  test_double_attack: {
    key: 'test_double_attack', name: '测试：连击', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时打击两次。', type: 'unit', keywords: ['Double Attack'],
    imageUrl: TEST_IMAGES.doubleattack
  },
  // --- 17. Support (支援) ---
  test_support: {
    key: 'test_support', name: '测试：支援', cost: 1, power: 1, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时Buff右侧友军。', type: 'unit', keywords: ['Support'],
    imageUrl: TEST_IMAGES.support
  },
  // --- 18. Deadly (剧毒) ---
  test_deadly: {
    key: 'test_deadly', name: '测试：剧毒', cost: 1, power: 1, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '一击必杀。', type: 'unit', keywords: ['Deadly'],
    imageUrl: TEST_IMAGES.deadly
  },
  // --- 19. SpellShield (魔免) ---
  test_spellshield: {
    key: 'test_spellshield', name: '测试：魔免', cost: 1, power: 5, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '抵挡一次法术。', type: 'unit', keywords: ['SpellShield'],
    imageUrl: TEST_IMAGES.spellshield
  },
  // --- 20. Silence (沉默) ---
  test_silence: {
    key: 'test_silence', name: '测试：沉默', cost: 1, power: 3, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '移除敌人所有词条。', type: 'unit', keywords: ['Silence'],
    imageUrl: TEST_IMAGES.silence
  },
  // --- 21. Berserk (狂暴) ---
  test_berserk: {
    key: 'test_berserk', name: '测试：狂暴', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '击杀后+1/+1。', type: 'unit', keywords: ['Berserk'],
    imageUrl: TEST_IMAGES.berserk
  },
  // --- 22. Cleave (溅射) ---
  test_cleave: {
    key: 'test_cleave', name: '测试：溅射', cost: 1, power: 3, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '同时打击阻挡者相邻单位。', type: 'unit', keywords: ['Cleave'],
    imageUrl: TEST_IMAGES.cleave
  },
  // --- 23. Thorns (反伤) ---
  test_thorns: {
    key: 'test_thorns', name: '测试：反伤', cost: 1, power: 1, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '受击时对攻击者打1。', type: 'unit', keywords: ['Thorns'],
    imageUrl: TEST_IMAGES.thorns
  },
  // --- 24. Vanguard (先锋) ---
  test_vanguard: {
    key: 'test_vanguard', name: '测试：先锋', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '首张打出触发。', type: 'unit', keywords: ['Vanguard'],
    imageUrl: TEST_IMAGES.vanguard
  },
  // --- 25. Ambush (伏击) ---
  test_ambush: {
    key: 'test_ambush', name: '测试：伏击', cost: 1, power: 4, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '非首张打出触发。', type: 'unit', keywords: ['Ambush'],
    imageUrl: TEST_IMAGES.ambush
  },
  // --- 26. Plunder (劫掠) ---
  test_plunder: {
    key: 'test_plunder', name: '测试：劫掠', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '若造成过水晶伤害则触发。', type: 'unit', keywords: ['Plunder'],
    imageUrl: TEST_IMAGES.plunder
  },
  // --- 27. Exposed (暴露) ---
  test_exposed: {
    key: 'test_exposed', name: '测试：暴露', cost: 1, power: 5, health: 5, maxHealth: 5, isChampion: false, level: 0, region: 'TEST',
    description: '可被任意敌人挑战。', type: 'unit', keywords: ['Exposed'],
    imageUrl: TEST_IMAGES.exposed
  },
  // --- 28. Shroud (帷幕) ---
  test_shroud: {
    key: 'test_shroud', name: '测试：帷幕', cost: 1, power: 3, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '无法被法术指定。', type: 'unit', keywords: ['Shroud'],
    imageUrl: TEST_IMAGES.shroud
  },
  // --- 29. Immobile (哨兵) ---
  test_immobile: {
    key: 'test_immobile', name: '测试：哨兵', cost: 1, power: 0, health: 6, maxHealth: 6, isChampion: false, level: 0, region: 'TEST',
    description: '无法进攻或格挡。', type: 'unit', keywords: ['Immobile'],
    imageUrl: TEST_IMAGES.immobile
  },
  // --- 30. Reborn (复生) ---
  test_reborn: {
    key: 'test_reborn', name: '测试：复生', cost: 1, power: 4, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '死亡后以1血复活。', type: 'unit', keywords: ['Reborn'],
    imageUrl: TEST_IMAGES.reborn
  },
  // --- 31. Execute (处决) ---
  test_execute: {
    key: 'test_execute', name: '测试：处决', cost: 1, power: 5, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '消灭受伤单位。', type: 'unit', keywords: ['Execute'],
    imageUrl: TEST_IMAGES.execute
  },
  // --- 32. Sniper (狙击) ---
  test_sniper: {
    key: 'test_sniper', name: '测试：狙击', cost: 1, power: 1, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '进攻时对阻挡者打1。', type: 'unit', keywords: ['Sniper'],
    imageUrl: TEST_IMAGES.sniper
  },
  // --- 33. Volatile (瞬逝) ---
  test_volatile: {
    key: 'test_volatile', name: '测试：瞬逝', cost: 1, power: 4, health: 4, maxHealth: 4, isChampion: false, level: 0, region: 'TEST',
    description: '回合结束弃置。', type: 'unit', keywords: ['Volatile'],
    imageUrl: TEST_IMAGES.volatile
  },
  // --- 34. Echo (回响) ---
  test_echo: {
    key: 'test_echo', name: '测试：回响', cost: 1, power: 2, health: 1, maxHealth: 1, isChampion: false, level: 0, region: 'TEST',
    description: '生成自身的瞬逝复制。', type: 'unit', keywords: ['Echo'],
    imageUrl: TEST_IMAGES.echo
  },
  // --- 35. Impact (冲击) ---
  test_impact: {
    key: 'test_impact', name: '测试：冲击', cost: 1, power: 2, health: 2, maxHealth: 2, isChampion: false, level: 0, region: 'TEST',
    description: '打击时对水晶造成1点伤害。', type: 'unit', keywords: ['Impact'],
    imageUrl: TEST_IMAGES.impact
  },
  // --- 36. Channel (充能) ---
  test_channel: {
    key: 'test_channel', name: '测试：充能', cost: 1, power: 1, health: 3, maxHealth: 3, isChampion: false, level: 0, region: 'TEST',
    description: '回复法术法力。', type: 'unit', keywords: ['Channel'],
    imageUrl: TEST_IMAGES.channel
  }
};


export const createCard = (key: string): CardData => ({
    ...CARD_DB[key],
    id: Math.random().toString(36).substr(2, 9),
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 }
});