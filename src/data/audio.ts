// 引入 BGM 文件
import titleBgm from '../music/bgm/title_bgm.ogg';
import defaultBgm from '../music/bgm/defult_bgm.ogg'; // 注意文件名拼写 defult
import battle1 from '../music/bgm/battle_bgm_1.ogg';
import battle2 from '../music/bgm/battle_bgm_2.ogg';
import battle3 from '../music/bgm/battle_bgm_3.ogg';
import victoryBgm from '../music/bgm/win_bgm.ogg';
import defeatBgm from '../music/bgm/defeat_bgm.ogg';
import gachaBgm from '../music/bgm/gacha_bgm.ogg';
import deckBuilderBgm from '../music/bgm/DeckBuilder_bgm.ogg';

// [新增] 导入大厅专属背景音乐
import hall_bgm_1 from '../music/bgm/hall_bgm/永恒之约.ogg';
import hall_bgm_2 from '../music/bgm/hall_bgm/轻触慢挑.ogg';
import hall_bgm_3 from '../music/bgm/hall_bgm/并蒂良缘.ogg';
import hall_bgm_4 from '../music/bgm/hall_bgm/秘林徜徉.ogg';
import hall_bgm_5 from '../music/bgm/hall_bgm/爱语恋歌.ogg';
import hall_bgm_6 from '../music/bgm/hall_bgm/水色情愫.ogg';
import hall_bgm_7 from '../music/bgm/hall_bgm/与你交织的命运线.ogg';

// 导出音频资源映射表
export const AUDIO_ASSETS = {
    bgm: {
        title: titleBgm,
        default: defaultBgm,
        battle: [battle1, battle2, battle3], // 战斗 BGM 数组
        victory: victoryBgm,
        defeat: defeatBgm,
        gacha: gachaBgm,
        deck_builder: deckBuilderBgm,
        // [新增] 注册音画联动的动态 BGM 轨道
        hall_1: hall_bgm_1,
        hall_2: hall_bgm_2,
        hall_3: hall_bgm_3,
        hall_4: hall_bgm_4,
        hall_5: hall_bgm_5,
        hall_6: hall_bgm_6,
        hall_7: hall_bgm_7,
    }
};

// [2026-08-16] BGM key 联合（playBgm 参数 & getHallBgm 返回类型，与 AUDIO_ASSETS.bgm 对齐）
export type BgmKey = 'title' | 'default' | 'battle' | 'victory' | 'defeat' | 'gacha' | 'deck_builder' | 'hall_1' | 'hall_2' | 'hall_3' | 'hall_4' | 'hall_5' | 'hall_6' | 'hall_7';