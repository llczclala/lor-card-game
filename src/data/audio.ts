// 引入 BGM 文件
import titleBgm from '../music/bgm/title_bgm.mp3';
import defaultBgm from '../music/bgm/defult_bgm.mp3'; // 注意文件名拼写 defult
import battle1 from '../music/bgm/battle_bgm_1.mp3';
import battle2 from '../music/bgm/battle_bgm_2.mp3';
import battle3 from '../music/bgm/battle_bgm_3.mp3';
import victoryBgm from '../music/bgm/win_bgm.mp3';
import defeatBgm from '../music/bgm/defeat_bgm.mp3';
import gachaBgm from '../music/bgm/gacha_bgm.mp3';
import deckBuilderBgm from '../music/bgm/DeckBuilder_bgm.mp3';

// [新增] 导入大厅专属背景音乐
import hall_bgm_1 from '../music/bgm/hall_bgm/永恒之约.mp3';
import hall_bgm_2 from '../music/bgm/hall_bgm/轻触慢挑.mp3';
import hall_bgm_3 from '../music/bgm/hall_bgm/并蒂良缘.mp3';
import hall_bgm_4 from '../music/bgm/hall_bgm/秘林徜徉.mp3';
import hall_bgm_5 from '../music/bgm/hall_bgm/爱语恋歌.mp3';
import hall_bgm_6 from '../music/bgm/hall_bgm/水色情愫.mp3';
import hall_bgm_7 from '../music/bgm/hall_bgm/与你交织的命运线.mp3';

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