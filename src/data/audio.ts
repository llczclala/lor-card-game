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
// 导出音频资源映射表
export const AUDIO_ASSETS = {
    bgm: {
        title: titleBgm,
        default: defaultBgm,
        battle: [battle1, battle2, battle3], // 战斗 BGM 数组
        victory: victoryBgm,
        defeat: defeatBgm,
        // [新增] 注册新 BGM
        gacha: gachaBgm,
        deck_builder: deckBuilderBgm
    }
};