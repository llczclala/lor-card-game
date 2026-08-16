// ==========================================
// 悖论迷宫 · 天启者流派档案（总览界面用）
// [2026-08-13 莉莉子] 每个天启者：流派名 / 玩法说明 / 难度(0-5 三角) / 难点说明
// ==========================================

export interface HeroArchetypeInfo {
    heroKey: string;
    factionName: string;      // 流派名称
    factionDesc: string;      // 流派说明（玩法风格，白字）
    difficulty: number;       // 难度 0-5（对应三角形数量）
    difficultyDesc: string;   // 难点说明（白色说明文字）
}

export const HERO_ARCHETYPES: HeroArchetypeInfo[] = [
    {
        heroKey: 'lyfe',
        factionName: '坚守反攻',
        factionDesc: '中速流派。用坚实体格稳住战线，把对局拖入中期，在对手攻势见缓时发动反攻，一波带走。',
        difficulty: 2,
        difficultyDesc: '守住阵线并不难，难在判断何时放弃防守、主动出击——节奏的取舍就是反攻流派的命门。',
    },
    {
        heroKey: 'fenny',
        factionName: '偶像爆发',
        factionDesc: '快攻爆发流。费用流畅、铺场迅速，用高攻单位快速压低对方生命，把胜利写在聚光灯下。',
        difficulty: 1,
        difficultyDesc: '铺场很快，但节奏一旦被打断，缺少恢复手段会让优势在转眼间蒸发。',
    },
    {
        heroKey: 'pupu_specular_soul',
        factionName: '镜阵控场',
        factionDesc: '中速控场流。用镜爻无人机编织镜阵，在虚实之间限制对手的进攻节奏，慢慢磨出胜势。',
        difficulty: 3,
        difficultyDesc: '镜阵的布置时机与无人机调度是核心，错一步，整套控场计划就可能落空。',
    },
    {
        heroKey: 'mauxir_lotus_drive',
        factionName: '莲驱曲线',
        factionDesc: '后期成长流。前期平缓积累，靠莲驱体系一路发育，中后期单位成型后攻势无人能挡。',
        difficulty: 4,
        difficultyDesc: '前期弱势期如何安全度过是最大考验，资源与生命的取舍直接决定后期上限。',
    },
    {
        heroKey: 'acacia_chrono_echo',
        factionName: '飞剑纵横',
        factionDesc: '高操作流。飞剑攻守一体、可攻可挡，时之重奏双形态环环相扣，节奏尽在剑舞之间。',
        difficulty: 5,
        difficultyDesc: '飞剑的生成、格挡与减费环环相扣，双形态切换的时机稍有偏差就会全面崩盘。',
    },
];

export const getHeroArchetype = (heroKey: string): HeroArchetypeInfo | undefined =>
    HERO_ARCHETYPES.find(a => a.heroKey === heroKey);

// 难度档：文字 + 颜色（白→绿→蓝→紫→金→红，随三角形数量提升）
export const DIFFICULTY_LABELS = ['轻松', '简单', '中等', '较难', '困难', '地狱'];
export const DIFFICULTY_COLORS = ['#ffffff', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#f87171'];
