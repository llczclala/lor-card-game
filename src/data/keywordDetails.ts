// 定义沙盒支持的演示模式
export type SandboxMode = 'hand' | 'bench' | 'combat' | 'spell_stack' | 'resolving';

export interface KeywordDetail {
    id: string; // 对应 KEYWORD_DB 中的主键
    nameEn: string;
    nameCn: string;
    testCardId: string; // 关联到 cards.ts 中的测试打靶卡牌
    availableModes: SandboxMode[]; // 该机制支持的沙盒演示状态
    sections: {
        heading?: string;
        paragraphs: string[];
    }[];
}

// 机制档案核心字典
export const KEYWORD_DETAILS: Record<string, KeywordDetail> = {
    'Overwhelm': {
        id: 'Overwhelm', nameEn: 'OVERWHELM', nameCn: '碾压', testCardId: 'test_overwhelm', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '当搭载此协议的单位作为进攻方发起正面冲锋并遭遇拦截时，系统将重新校准毁伤模型。',
                    '若其物理毁伤算力（攻击力）超越了防守方单位的装甲与生命极限，所有溢出的毁伤能量将穿透防线，直接对敌方的指挥枢纽造成等量破坏。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这是「强攻流派」执行面板压制的核心终结手段。',
                    '建议将其装配于具备极高基础面板的重型火力干员，或配合能够瞬间提升毁伤阈值的战术指令，迫使敌方在“损失精锐单位”或“指挥枢纽受损”间陷入痛苦抉择。'
                ]
            }
        ]
    },
    'QuickAttack': {
        id: 'QuickAttack', nameEn: 'QUICK ATTACK', nameCn: '先攻', testCardId: 'test_quickattack', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '掌控着极微秒级的交战主动权。作为进攻方时，该单位将打破常规的同步毁伤结算协议，优先对阻挡者实施打击。',
                    '若此轮先发制人的打击成功将防守目标解构（生命值归零），则自身将完全免受常规的反击毁伤。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '极其适合低装甲、高杀伤的刺客型干员。在阵地战中能以无损的姿态高效瓦解敌方的笨重防线。',
                    '需要注意的是，当该单位处于防守态势或面临敌方直接施加的法术指令时，此机制将无法为其提供任何保护。'
                ]
            }
        ]
    },
    'Regeneration': {
        id: 'Regeneration', nameEn: 'REGENERATION', nameCn: '再生', testCardId: 'test_regeneration', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '核心内嵌了极高规格的纳米自愈模组与冗余备份电路。',
                    '在每个新的战术周期（回合）伊始，只要该单位未被彻底解构（生命值大于零），其受损的生命值读条将被系统自动修复至满载状态。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '生存与消耗战的绝对基石。配合高生命值上限或「坚韧」机制，能将该单位化作一座无法逾越的移动堡垒。',
                    '在「中速流派」中，引航者可以利用其不断进行低代价的防线阻挡与换血，以此榨干敌方的攻击频率。'
                ]
            }
        ]
    },
    'Elusive': {
        id: 'Elusive', nameEn: 'ELUSIVE', nameCn: '隐秘', testCardId: 'test_elusive', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '启动了最高级别的光学迷彩与反雷达侦测协议。',
                    '拥有此机制的战术单位，其行踪将被完全屏蔽，仅能被同样搭载了「隐秘」协议的敌方特种单位所侦测并阻挡。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '「闪避快攻」战术体系的绝对核心。其战术目的在于完全绕开敌方布置的重型地面防线，如幽灵般直接对敌方的指挥枢纽实施精准打击。',
                    '作为代价，此类单位的装甲通常极为薄弱，需时刻警惕敌方的大范围清场指令。'
                ]
            }
        ]
    },
    'Challenger': {
        id: 'Challenger', nameEn: 'CHALLENGER', nameCn: '挑战者', testCardId: 'test_challenger', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '掌握强制接战与引力牵引的战术特权。',
                    '当该单位发起正面冲锋时，引航者有权从敌方备战席中强行选定一个特定目标，将其拖拽至交战区作为该单位的阻挡者，无视敌方的战术意图。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '用于撕裂敌方阵型的终极手术刀。',
                    '无论是提前拔除敌方躲在后排的脆弱核心，还是强行移开敌方的重装防线以为我方主将开路，都能极大提升进攻时的战略自由度与解场效率。'
                ]
            }
        ]
    },
    'Barrier': {
        id: 'Barrier', nameEn: 'BARRIER', nameCn: '屏障', testCardId: 'test_barrier', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '覆盖于单位表层的单次偏导力场。',
                    '能够完全吸收并抵消该单位下一次即将承受的任何来源的伤害。成功偏导一次攻击后，力场将因过载而即刻消散。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '保护核心高价值资产、或在阵地战中实现无损换血的极佳屏障。',
                    '需要注意的是，敌方极易使用微弱的单点伤害法术（如造成 1 点伤害的指令）来廉价骗取力场的过载，部署时需精准把握时机。'
                ]
            }
        ]
    },
    'CantBlock': {
        id: 'CantBlock', nameEn: 'CANT BLOCK', nameCn: '无法格挡', testCardId: 'test_cantblock', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '撤销了底层代码中的所有防御与回撤模块。',
                    '搭载此标签的单位完全放弃了阵地防守能力，在敌方发起冲锋时，引航者无法将其分配至交战区进行阻挡。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这通常是系统为了平衡该单位极其超模的攻击力或极低部署费用，而施加的严苛代价。',
                    '属于极端进攻主义的象征，引航者必须将其视作消耗品或纯粹的进攻矛头，切忌在防守端对其抱有任何幻想。'
                ]
            }
        ]
    },
    'Lifesteal': {
        id: 'Lifesteal', nameEn: 'LIFESTEAL', nameCn: '吸血', testCardId: 'test_lifesteal', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '装配了非法的能量虹吸协议。',
                    '该单位在交战中对敌方目标或枢纽造成的任何物理毁伤，都将按照一比一的转化率，转化为纯净能源并修复我方指挥枢纽的生命值。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '控制流派与拖延战术抗压反转的核心枢纽。',
                    '在面对敌方不计代价的「快攻体系」时，一次成功的高额吸血打击，往往能瞬间摧毁敌方的算计，将岌岌可危的战局重新拉回均势。'
                ]
            }
        ]
    },
    'Last Breath': {
        id: 'Last Breath', nameEn: 'LAST BREATH', nameCn: '亡语', testCardId: 'test_last_breath', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '写入底层逻辑的遗落协议。',
                    '当该战术实体承受致命毁伤，导致其结构彻底崩塌并被移出交战区时，系统将自动且强制地执行一段预设的终端指令（如造成爆炸伤害、请求增援等）。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '高明的引航者会故意将带有此协议的单位送入敌方的绞肉机，以换取极具破坏性的后续收益。',
                    '它让单位的“解构”不再是单纯的损失，而是变成了触发终极战术陷阱的引信。'
                ]
            }
        ]
    },
    'Fearsome': {
        id: 'Fearsome', nameEn: 'FEARSOME', nameCn: '威吓', testCardId: 'test_fearsome', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '散发出高危级别的战术震慑磁场。',
                    '低阶防线在面对该单位时将陷入瘫痪。仅有物理毁伤算力（攻击力）大于或等于 3 点的敌方精锐单位，才有资格被部署并阻挡该单位的冲锋。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '「快攻流派」无视敌方杂兵防线、强行压低敌方枢纽血线的极佳手段。',
                    '它能有效过滤掉敌方试图用低费、低攻单位进行“垫刀换血”的企图，迫使敌方不得不交出高价值的主力单位来进行防守。'
                ]
            }
        ]
    },
    'Frostbite': {
        id: 'Frostbite', nameEn: 'FROSTBITE', nameCn: '冻结', testCardId: 'test_frostbite', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '通过绝对零度的急速冷冻系统，对目标进行物理封锁。',
                    '遭受冻结的单位，其武器模组将陷入完全停摆，在当前的整个战术周期内，其物理毁伤算力（攻击力）将被系统强制锁定为 0。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '控制流派化解敌方致命冲锋的完美手段。',
                    '在交战结算的最后一刻施加冻结，不仅能让我方防守单位毫发无损地解构敌方主力，更能彻底粉碎敌方依靠「先攻」或「碾压」机制建立的战术优势。'
                ]
            }
        ]
    },
    'Scout': {
        id: 'Scout', nameEn: 'SCOUT', nameCn: '侦察', testCardId: 'test_scout', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '配备了轻量化的机动引擎与预警雷达。',
                    '在当前战术周期内，若引航者仅指派带有「侦察」标签的单位率先发起冲锋，该次攻击将不会消耗（或立即返还）本回合的通用「进攻托盘」。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '为「中速协同流派」提供了极为恐怖的多频次打击能力。',
                    '引航者可以先利用侦察单位进行一轮火力试探，逼迫敌方交出核心防线或法术指令；随后，再带领全军发起第二波更具毁灭性的总攻。'
                ]
            }
        ]
    },
    'Ephemeral': {
        id: 'Ephemeral', nameEn: 'EPHEMERAL', nameCn: '幻象', testCardId: 'test_ephemeral', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '由极度不稳定的能量态数据流临时构筑的战术实体。',
                    '该实体在完成一次任何形式的毁伤打击后，或在当前战术周期（回合）宣告结束时，其数据结构便会彻底溃散并从战场上消失。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '幻象单位通常以极低的费用或衍生卡的形式出现，是提供即时性爆发火力的廉价资源。',
                    '由于其注定消亡的特性，引航者应毫无保留地将其投入到最惨烈的交火区，以榨干其最后一丝战略价值。'
                ]
            }
        ]
    },
    'Stun': {
        id: 'Stun', nameEn: 'STUN', nameCn: '眩晕', testCardId: 'test_stun', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '对目标的神经链接或中枢操作系统造成严重的过载熔断。',
                    '陷入眩晕状态的单位将被强行移出交战区，且在当前战术周期内，被剥夺一切参与进攻冲锋或防守阻挡的机动权力。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '撕裂敌方铜墙铁壁的最强硬控手段。',
                    '无论敌方部署了何等夸张的防守巨兽，一发精准的眩晕指令就能让其瞬间变成毫无威胁的旁观者，从而为我方的突击部队打开直捣黄龙的缺口。'
                ]
            }
        ]
    },
    'Tough': {
        id: 'Tough', nameEn: 'TOUGH', nameCn: '坚韧', testCardId: 'test_tough', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '机体外层覆盖了高密度的被动式复合反应装甲。',
                    '无论面对何种层级、何种来源的物理打击或法术毁伤，该单位最终所承受的实质性伤害，都将被装甲恒定削减 1 点。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '多频次微弱打击以及大范围低伤害清场指令（如全场打 1 的法术）的绝对克星。',
                    '拥有此机制的单位在面对杂兵群的围攻时，将展现出令人绝望的生存能力，是稳固阵地战防线的重装支柱。'
                ]
            }
        ]
    },
    'Double Attack': {
        id: 'Double Attack', nameEn: 'DOUBLE ATTACK', nameCn: '连击', testCardId: 'test_double_attack', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '解锁了双重火控频段，展现极致的摧毁能力。',
                    '作为进攻方时，该单位将连续执行两次毁伤结算：第一次处于「先攻」特权时机进行无损打击；若目标存活或被击毁，将在常规同步阶段再次执行第二轮毁灭性打击。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '一旦配合「碾压」机制或攻击力增益指令，连击单位将化身为战场上最不可理喻的杀戮机器。',
                    '其极高的战术上限，要求引航者倾尽全军之力为其提供保护与增益，创造一击定音的绝杀环境。'
                ]
            }
        ]
    },
    'Support': {
        id: 'Support', nameEn: 'SUPPORT', nameCn: '支援', testCardId: 'test_support', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '搭载了区域性的阵型链路增益模块。',
                    '当该单位加入交战区并发起冲锋时，系统会自动捕捉位于其右侧相邻位置的友军实体，并为其注入临时面板提升或附魔等战术增益。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '是对引航者“排兵布阵与空间感”最苛刻的考验。',
                    '合理安排进攻队列的先后顺序，利用支援单位强化脆弱的核心输出，或保护濒危的关键单位，是掌握高级战术调度的必修课。'
                ]
            }
        ]
    },
    'Deadly': {
        id: 'Deadly', nameEn: 'DEADLY', nameCn: '致命', testCardId: 'test_deadly', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '武器模组涂装了高浓度的侵蚀代码与反物质毒素。',
                    '任何被该单位的物理攻击擦伤的敌方目标（哪怕仅造成了 1 点微弱伤害），其底层的生命阈值将直接被无视，并被系统执行无条件的彻底解构。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这是突破“重装高血量单位”的绝对利刃。',
                    '拥有致命标签的单位，即便自身基础面板极低，也能在防守端迫使敌方的高阶天启者不敢轻举妄动，形成极具威慑力的兑子威胁。'
                ]
            }
        ]
    },
    'SpellShield': {
        id: 'SpellShield', nameEn: 'SPELL SHIELD', nameCn: '法术护盾', testCardId: 'test_spellshield', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '专为抵御代码级篡改而设计的针对性抗性力场。',
                    '能够自动识别并抵挡下一次敌方试图对该单位施加的法术指令或专属技能锁定。力场在成功吞噬一次异常代码后将即刻失效。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '保护己方战术核心免遭暗算（如被一击必杀或遭受硬控）的终极防御手段。',
                    '引航者需时刻利用此护盾的存续期，强行展开高风险战术，迫使敌方浪费至少两张指令牌才能对该单位造成实质性威胁。'
                ]
            }
        ]
    },
    'Silence': {
        id: 'Silence', nameEn: 'SILENCE', nameCn: '沉默', testCardId: 'test_silence', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '执行了最高优先级的系统全面封锁协议。',
                    '遭受沉默的目标将被强制格式化，不仅其牌面上的所有专属能力与特殊机制将被彻底剥夺，一切附加的增益与光环效果也将被瞬间清零，退化为毫无特长的基础白板。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '实施降维打击、反制敌方花哨组合技的最强对策卡。',
                    '无论是敌方苦心经营的无限复活流，还是叠加了无数增益的终极造物，在沉默协议面前都将原形毕露，化为乌有。'
                ]
            }
        ]
    },
    'Berserk': {
        id: 'Berserk', nameEn: 'BERSERK', nameCn: '狂暴', testCardId: 'test_berserk', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '开启了摒弃安全阈值的杀戮汲取模组。',
                    '当该单位在交战中成功击毁任意敌方实体且自身存活时，机体将吸收敌方残骸的算力，永久获得 1 点物理毁伤与 1 点生命值上限的深度强化。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '滚雪球式场面压制的典范。',
                    '一旦该单位在前期建立起击杀优势，其不断膨胀的面板将逐渐让敌方陷入绝望。配合「挑战者」机制强行猎杀弱小目标，是加速狂暴进化的最佳手段。'
                ]
            }
        ]
    },
    'Cleave': {
        id: 'Cleave', nameEn: 'CLEAVE', nameCn: '顺劈', testCardId: 'test_cleave', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '加载了广域毁伤波纹或散射火控系统。',
                    '在交战区发起攻击时，不仅会对正面的阻挡者造成常规毁伤，那股狂暴的动能还会向两侧波及，对阻挡者左侧和右侧相邻的敌方单位造成溅射伤害。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '对敌方密集防御阵型的严厉惩罚。',
                    '拥有顺劈机制的单位，能够让敌方的“炮灰联防”战术付出惨痛的连带代价，逼迫敌方在排兵布阵时必须谨慎处理核心单位的站位。'
                ]
            }
        ]
    },
    'Thorns': {
        id: 'Thorns', nameEn: 'THORNS', nameCn: '荆棘', testCardId: 'test_thorns', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '机体外壳密布着极具攻击性的反制震荡装甲。',
                    '在任何交火状态下，只要该单位受到来自敌方的实质性物理打击伤害，装甲便会瞬间起效，强制对攻击来源回敬固定数值的反弹毁伤。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '让敌方快攻集群投鼠忌器的防守利器。',
                    '面对生命值脆弱的敌方突击集群，荆棘单位仅仅是站在防线前方，就能让敌方在发起冲锋时体验到“伤敌一千，自损八百”的苦楚。'
                ]
            }
        ]
    },
    'Vanguard': {
        id: 'Vanguard', nameEn: 'VANGUARD', nameCn: '先锋', testCardId: 'test_vanguard', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '拥有最敏锐战场嗅觉的独立突击特权。',
                    '在当前的战术周期内，如果引航者打出的第一张牌便是附带此标签的指令或实体，系统将触发额外的隐藏序列，为其注入强效的初始入场红利。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '考验引航者出牌序列规划能力的核心机制。',
                    '先锋单位往往能在开局瞬间建立巨大的场面优势，但若因局势所迫不得不先施放其他战术指令，则会错失这宝贵的首发红利，需权衡利弊。'
                ]
            }
        ]
    },
    'Ambush': {
        id: 'Ambush', nameEn: 'AMBUSH', nameCn: '伏击', testCardId: 'test_ambush', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '专为连携作战与侧翼突袭编写的暗藏代码。',
                    '与先锋机制截然相反，在当前的战术周期内，只要引航者已经部署过至少一张其他卡牌，此时再打出伏击实体，将瞬间激发其暗藏的突袭潜能与高额增益。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '配合低耗指令打出战术组合拳的绝佳手段。',
                    '引航者可以利用低费用的极速法术作为诱饵或垫脚石，随后在同一回合内甩出伏击兵力，打乱敌方对算力消耗的固有预判。'
                ]
            }
        ]
    },
    'Plunder': {
        id: 'Plunder', nameEn: 'PLUNDER', nameCn: '劫掠', testCardId: 'test_plunder', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '旨在鼓励极进进攻与乘胜追击的资源回收协议。',
                    '只要在本战术周期内，我方已成功对敌方指挥枢纽（水晶）造成过任何形式的毁伤，此时再将带有劫掠标签的单位部署入场，即可掠夺额外的战备资源或强力加成。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '「快攻抢血流派」最钟爱的补强手段。',
                    '它鼓励引航者不顾一切地向敌方枢纽倾泻火力，即便付出一定代价，只要造成了哪怕 1 点枢纽损伤，后续登场的劫掠单位就能瞬间将场面劣势逆转。'
                ]
            }
        ]
    },
    'Exposed': {
        id: 'Exposed', nameEn: 'EXPOSED', nameCn: '暴露', testCardId: 'test_exposed', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '由于系统后门未封闭而导致的战术信标严重外泄。',
                    '作为极为致命的负面特性，敌方任何发起冲锋的单位，都能像拥有「挑战者」特权一样，强行将暴露的单位拖拽至交战区进行单挑。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这往往是为了换取该单位惊世骇俗的超模面板，而必须承受的巨大风险代价。',
                    '引航者必须通过严密的法术保护网或精妙的部署时机，确保该单位不会被敌方的刺客型干员轻易“点名”解构。'
                ]
            }
        ]
    },
    'Shroud': {
        id: 'Shroud', nameEn: 'SHROUD', nameCn: '帷幕', testCardId: 'test_shroud', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '加载了永不休眠的深层数据迷彩与反入侵屏障。',
                    '该实体将彻底免疫敌方所有的法术指令锁定，以及敌方随从的专属技能指定。在敌方的雷达视野中，它形同一个无法被单独选中的代码黑洞。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '终极的单体绝对魔免，防线中的中流砥柱。',
                    '要摧毁拥有帷幕的单位，敌方只能通过原始的物理交战碰撞，或动用极其昂贵的全场无差别毁伤指令。这为我方核心体系的展开提供了最安全的庇护所。'
                ]
            }
        ]
    },
    'Immobile': {
        id: 'Immobile', nameEn: 'IMMOBILE', nameCn: '固定', testCardId: 'test_immobile', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '采取了重型锚定结构，完全放弃了机动系统的特殊造物。',
                    '该实体能够正常占据我方备战席的空间，但其底层逻辑被彻底锁死，永远无法加入交战区发起冲锋，也无法被指派参与任何防守阻挡。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这类单位通常是战场上提供强效光环、资源产出或特殊机制引擎的“战术建筑”。',
                    '虽然它不能直接参与火力交锋，但只要确保其在后方的安全，源源不断的被动收益将成为压垮对手的最后稻草。'
                ]
            }
        ]
    },
    'Reborn': {
        id: 'Reborn', nameEn: 'REBORN', nameCn: '复生', testCardId: 'test_reborn', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '内嵌了珍贵的深渊备份与后备苏醒程序。',
                    '当该实体首次承受致命毁伤并崩溃时，它并不会被移出战场，而是消耗掉此复生标签，以 1 点生命值的极境状态瞬间重返现实维度的备战席。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '赋予了单位令人绝望的阵地黏性与二次战术利用价值。',
                    '它不仅能逼迫敌方交出双倍的解场资源，更能配合拥有“入场指令”或“攻击特效”的单位，打出两极反转的战略威慑力。'
                ]
            }
        ]
    },
    'Execute': {
        id: 'Execute', nameEn: 'EXECUTE', nameCn: '处决', testCardId: 'test_execute', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '残响收割协议，针对濒危目标的终极抹杀。',
                    '在物理交锋中，若防御目标的当前生命值低于此单位的物理毁伤算力（或目标已处于受损状态），处决指令将越过一切护盾与装甲，直接将其逻辑抹除。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '破除绝对防御与高阶坚韧装甲的达摩克利斯之剑。',
                    '对于那些依靠护盾苟延残喘，或企图通过换血死扛的敌方巨兽而言，处决机制是悬在它们头顶、宣告其彻底终结的死神印记。'
                ]
            }
        ]
    },
    'Sniper': {
        id: 'Sniper', nameEn: 'SNIPER', nameCn: '狙击', testCardId: 'test_sniper', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '配备了高精度的超视距打击武器。',
                    '当该单位作为进攻方发起冲锋时，无需等待近身物理交锋，便能在极远距离率先对锁定的阻挡者倾泻 1 点先制物理毁伤。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '安全拔除低血量防线、破坏敌方屏障力场的绝佳狙杀手段。',
                    '配合高攻击力面板，狙击单位能在自身未受任何擦伤前，便将敌方的脆弱阻挡者轰成碎渣，维持无可匹敌的场面压制。'
                ]
            }
        ]
    },
    'Volatile': {
        id: 'Volatile', nameEn: 'VOLATILE', nameCn: '易碎', testCardId: 'test_volatile', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '由极度不稳定的数据流构筑的临时战术资源。',
                    '此类卡牌存在严格的存活时限。当当前的战术周期宣告结束时，若引航者仍未能将其部署或施放，该卡牌便会在手牌区自行瓦解并被强行弃置。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '这通常出现在由其他高阶实体生成的强力“衍生卡牌”上，旨在强迫引航者当机立断。',
                    '它极大地增加了战术决策的紧迫感，促使引航者必须在极短的窗口期内榨干这股临时力量。'
                ]
            }
        ]
    },
    'Echo': {
        id: 'Echo', nameEn: 'ECHO', nameCn: '回响', testCardId: 'test_echo', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '触发了非法的数据多重复制协议。',
                    '当引航者成功打出并结算该卡牌时，系统将在您的手牌区立刻生成一张具有相同功能的投影复制品。该复制品通常会被强制附加上「易碎」的存续限制。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '实现双倍火力倾泻、瞬间铺满阵地的法力宣泄枢纽。',
                    '只要引航者储备了充足的能源，一张回响卡牌即可发挥远超其物理载体的战术价值，是终结比赛或进行终极法术连锁的核心引擎。'
                ]
            }
        ]
    },
    'Impact': {
        id: 'Impact', nameEn: 'IMPACT', nameCn: '冲击', testCardId: 'test_impact', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '伴随巨量动能穿透的震荡毁伤模块。',
                    '无论防守方布置了何等密集的阻挡阵型，只要该单位完成了完整的物理攻击指令，其产生的动能余波必将对敌方枢纽造成 1 点不可规避的穿透伤害。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '无视敌方乌龟阵、强行削减枢纽血线的稳定手段。',
                    '在双方兵力陷入泥潭般的胶着状态时，哪怕每一次冲锋都被悉数挡下，冲击机制带来的点滴磨损，也终将积累为压垮敌方枢纽的致命洪流。'
                ]
            }
        ]
    },
    'Channel': {
        id: 'Channel', nameEn: 'CHANNEL', nameCn: '充能', testCardId: 'test_channel', availableModes: ['bench', 'combat'],
        sections: [
            {
                heading: '机制解密 // EFFECT',
                paragraphs: [
                    '内置了微型能源虹吸塔与储能节点。',
                    '当该战术实体被成功部署入场的瞬间，其释放的余脉能量将立刻被系统回收，为引航者专属的法力储能池注入 1 点额外的可用算力。'
                ]
            },
            {
                heading: '战术指引 // TACTICS',
                paragraphs: [
                    '润滑战术曲线、连接不同法力节点的核心过渡卡牌。',
                    '充能单位不仅能为前线提供必要的物理阻挡，更能确保引航者在下一轮法术交锋中握有充裕的能源优势，打出令人意想不到的绝地反击。'
                ]
            }
        ]
    }
};