// 引入 BGM 文件
import titleBgm from '../music/bgm/Title_bgm.mp3';
import defaultBgm from '../music/bgm/defult_bgm.mp3'; // 注意文件名拼写 defult
import battle1 from '../music/bgm/battle_bgm_1.mp3';
import battle2 from '../music/bgm/battle_bgm_2.mp3';
import battle3 from '../music/bgm/battle_bgm_3.mp3';
import victoryBgm from '../music/bgm/win_bgm.mp3';
import defeatBgm from '../music/bgm/defeat_bgm.mp3';

// 导出音频资源映射表
export const AUDIO_ASSETS = {
    bgm: {
        title: titleBgm,
        default: defaultBgm,
        battle: [battle1, battle2, battle3], // 战斗 BGM 数组
        victory: victoryBgm,
        defeat: defeatBgm
    }
};