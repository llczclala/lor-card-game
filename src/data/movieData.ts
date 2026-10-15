// [核心重构] 导入标题页多分辨率 WebM
import type { BgmKey } from './audio'; // [2026-08-16] BGM key 类型（getHallBgm 返回类型对齐 playBgm 参数）
// [2026-10-05 莉莉子 BUG修复 · 20261005-11] 运行期"影片健康度"降档（弱机自动降画质）
import { applyMovieResolutionBias } from '../utils/movieHealth';
import title_bg_1k from '../movie/title/烬中焰火/1k.webm';
import title_bg_2k from '../movie/title/烬中焰火/2k.webm';
import title_bg_4k from '../movie/title/烬中焰火/4k.webm';
// [核心重构] 导入大厅视频 —— 13角色 × 4场景
// 阿卡夏
import acacia_01 from '../movie/hall/acacia_01.webm';
import acacia_02 from '../movie/hall/acacia_02.webm';
import acacia_03 from '../movie/hall/acacia_03.webm';
import acacia_04 from '../movie/hall/acacia_04.webm';
// 辰星
import chengxing_01 from '../movie/hall/chengxing_01.webm';
import chengxing_02 from '../movie/hall/chengxing_02.webm';
import chengxing_03 from '../movie/hall/chengxing_03.webm';
import chengxing_04 from '../movie/hall/chengxing_04.webm';
// 芬妮
import fenny_01 from '../movie/hall/fenny_01.webm';
import fenny_02 from '../movie/hall/fenny_02.webm';
import fenny_03 from '../movie/hall/fenny_03.webm';
import fenny_04 from '../movie/hall/fenny_04.webm';
// 芬妮·泳装
import fenny_swimsuit_01 from '../movie/hall/fenny_swimsuit_01.webm';
import fenny_swimsuit_02 from '../movie/hall/fenny_swimsuit_02.webm';
import fenny_swimsuit_03 from '../movie/hall/fenny_swimsuit_03.webm';
import fenny_swimsuit_04 from '../movie/hall/fenny_swimsuit_04.webm';
// 卡提亚
import katya_01 from '../movie/hall/katya_01.webm';
import katya_02 from '../movie/hall/katya_02.webm';
import katya_03 from '../movie/hall/katya_03.webm';
import katya_04 from '../movie/hall/katya_04.webm';
// 卡提亚·婚纱
import katya_wedding_01 from '../movie/hall/katya_wedding_01.webm';
import katya_wedding_02 from '../movie/hall/katya_wedding_02.webm';
import katya_wedding_03 from '../movie/hall/katya_wedding_03.webm';
import katya_wedding_04 from '../movie/hall/katya_wedding_04.webm';
// 里芙
import lyfe_01 from '../movie/hall/lyfe_01.webm';
import lyfe_02 from '../movie/hall/lyfe_02.webm';
import lyfe_03 from '../movie/hall/lyfe_03.webm';
import lyfe_04 from '../movie/hall/lyfe_04.webm';
// 茉莉安
import marian_01 from '../movie/hall/marian_01.webm';
import marian_02 from '../movie/hall/marian_02.webm';
import marian_03 from '../movie/hall/marian_03.webm';
import marian_04 from '../movie/hall/marian_04.webm';
// 茉莉安·婚纱
import marian_wedding_01 from '../movie/hall/marian_wedding_01.webm';
import marian_wedding_02 from '../movie/hall/marian_wedding_02.webm';
import marian_wedding_03 from '../movie/hall/marian_wedding_03.webm';
import marian_wedding_04 from '../movie/hall/marian_wedding_04.webm';
// 妮塔
import nita_01 from '../movie/hall/nita_01.webm';
import nita_02 from '../movie/hall/nita_02.webm';
import nita_03 from '../movie/hall/nita_03.webm';
import nita_04 from '../movie/hall/nita_04.webm';
// 瑟瑞斯
import siris_01 from '../movie/hall/siris_01.webm';
import siris_02 from '../movie/hall/siris_02.webm';
import siris_03 from '../movie/hall/siris_03.webm';
import siris_04 from '../movie/hall/siris_04.webm';
// 苔丝
import tess_01 from '../movie/hall/tess_01.webm';
import tess_02 from '../movie/hall/tess_02.webm';
import tess_03 from '../movie/hall/tess_03.webm';
import tess_04 from '../movie/hall/tess_04.webm';
// 肴
import yao_01 from '../movie/hall/yao_01.webm';
import yao_02 from '../movie/hall/yao_02.webm';
import yao_03 from '../movie/hall/yao_03.webm';
import yao_04 from '../movie/hall/yao_04.webm';

// [2026-10-15 莉莉子 · 安卓] 大厅影片首帧静图 —— 52 张（`src/image/hall/*.jpg`，与影片同名换扩展名）
//   病根：安卓 WebView 在 `<video>` **没有可绘制帧**时，会由媒体层自己画占位（纯灰底 + 黑色播放图标）；
//         PC 桌面 Chromium 无此行为。缩略图用的 `preload="metadata"` **永远解不出第一帧**
//         ⇒ 安卓上缩略图**永久**是灰底 + 播放图标。
//   药方：缩略图改用静图、全屏背景预览补 `poster`。
//   ⚠️ 必须走 Vite ES import（与影片一致）：Electron 下页面是 `file://`，写 `/xxx.jpg` 绝对路径会失效。
//   ⚠️ 与同目录原有 `.webp` 美术资源**同名并存**，两套互不影响。
// 阿卡夏
import poster_acacia_01 from '../image/hall/acacia_01.jpg';
import poster_acacia_02 from '../image/hall/acacia_02.jpg';
import poster_acacia_03 from '../image/hall/acacia_03.jpg';
import poster_acacia_04 from '../image/hall/acacia_04.jpg';
// 辰星
import poster_chengxing_01 from '../image/hall/chengxing_01.jpg';
import poster_chengxing_02 from '../image/hall/chengxing_02.jpg';
import poster_chengxing_03 from '../image/hall/chengxing_03.jpg';
import poster_chengxing_04 from '../image/hall/chengxing_04.jpg';
// 芬妮
import poster_fenny_01 from '../image/hall/fenny_01.jpg';
import poster_fenny_02 from '../image/hall/fenny_02.jpg';
import poster_fenny_03 from '../image/hall/fenny_03.jpg';
import poster_fenny_04 from '../image/hall/fenny_04.jpg';
// 芬妮·泳装
import poster_fenny_swimsuit_01 from '../image/hall/fenny_swimsuit_01.jpg';
import poster_fenny_swimsuit_02 from '../image/hall/fenny_swimsuit_02.jpg';
import poster_fenny_swimsuit_03 from '../image/hall/fenny_swimsuit_03.jpg';
import poster_fenny_swimsuit_04 from '../image/hall/fenny_swimsuit_04.jpg';
// 卡提亚
import poster_katya_01 from '../image/hall/katya_01.jpg';
import poster_katya_02 from '../image/hall/katya_02.jpg';
import poster_katya_03 from '../image/hall/katya_03.jpg';
import poster_katya_04 from '../image/hall/katya_04.jpg';
// 卡提亚·婚纱
import poster_katya_wedding_01 from '../image/hall/katya_wedding_01.jpg';
import poster_katya_wedding_02 from '../image/hall/katya_wedding_02.jpg';
import poster_katya_wedding_03 from '../image/hall/katya_wedding_03.jpg';
import poster_katya_wedding_04 from '../image/hall/katya_wedding_04.jpg';
// 里芙
import poster_lyfe_01 from '../image/hall/lyfe_01.jpg';
import poster_lyfe_02 from '../image/hall/lyfe_02.jpg';
import poster_lyfe_03 from '../image/hall/lyfe_03.jpg';
import poster_lyfe_04 from '../image/hall/lyfe_04.jpg';
// 茉莉安
import poster_marian_01 from '../image/hall/marian_01.jpg';
import poster_marian_02 from '../image/hall/marian_02.jpg';
import poster_marian_03 from '../image/hall/marian_03.jpg';
import poster_marian_04 from '../image/hall/marian_04.jpg';
// 茉莉安·婚纱
import poster_marian_wedding_01 from '../image/hall/marian_wedding_01.jpg';
import poster_marian_wedding_02 from '../image/hall/marian_wedding_02.jpg';
import poster_marian_wedding_03 from '../image/hall/marian_wedding_03.jpg';
import poster_marian_wedding_04 from '../image/hall/marian_wedding_04.jpg';
// 妮塔
import poster_nita_01 from '../image/hall/nita_01.jpg';
import poster_nita_02 from '../image/hall/nita_02.jpg';
import poster_nita_03 from '../image/hall/nita_03.jpg';
import poster_nita_04 from '../image/hall/nita_04.jpg';
// 瑟瑞斯
import poster_siris_01 from '../image/hall/siris_01.jpg';
import poster_siris_02 from '../image/hall/siris_02.jpg';
import poster_siris_03 from '../image/hall/siris_03.jpg';
import poster_siris_04 from '../image/hall/siris_04.jpg';
// 苔丝
import poster_tess_01 from '../image/hall/tess_01.jpg';
import poster_tess_02 from '../image/hall/tess_02.jpg';
import poster_tess_03 from '../image/hall/tess_03.jpg';
import poster_tess_04 from '../image/hall/tess_04.jpg';
// 肴
import poster_yao_01 from '../image/hall/yao_01.jpg';
import poster_yao_02 from '../image/hall/yao_02.jpg';
import poster_yao_03 from '../image/hall/yao_03.jpg';
import poster_yao_04 from '../image/hall/yao_04.jpg';

// [核心重构] 导入英雄多分辨率 WebM
// 里芙
import lyfe_levelup_1k from '../movie/level up/里芙_level up/1k.webm';
import lyfe_levelup_2k from '../movie/level up/里芙_level up/2k.webm';
import lyfe_levelup_4k from '../movie/level up/里芙_level up/4k.webm';
import lyfe_win_1k from '../movie/win/里芙_win/1k.webm';
import lyfe_win_2k from '../movie/win/里芙_win/2k.webm';
import lyfe_win_4k from '../movie/win/里芙_win/4k.webm';
// 芬妮
import fenny_levelup_1k from '../movie/level up/芬妮_level up/1k.webm';
import fenny_levelup_2k from '../movie/level up/芬妮_level up/2k.webm';
import fenny_levelup_4k from '../movie/level up/芬妮_level up/4k.webm';
import fenny_win_1k from '../movie/win/芬妮_win/1k.webm';
import fenny_win_2k from '../movie/win/芬妮_win/2k.webm';
import fenny_win_4k from '../movie/win/芬妮_win/4k.webm';
// 卜卜灵鉴
import pupu_levelup_1k from '../movie/level up/卜卜灵鉴_level up/1k.webm';
import pupu_levelup_2k from '../movie/level up/卜卜灵鉴_level up/2k.webm';
import pupu_levelup_4k from '../movie/level up/卜卜灵鉴_level up/4k.webm';
import pupu_win_1k from '../movie/win/卜卜灵鉴_win/1k.webm';
import pupu_win_2k from '../movie/win/卜卜灵鉴_win/2k.webm';
import pupu_win_4k from '../movie/win/卜卜灵鉴_win/4k.webm';
// 猫汐尔莲驱
import mauxir_levelup_1k from '../movie/level up/猫汐尔莲驱_level up/1k.webm';
import mauxir_levelup_2k from '../movie/level up/猫汐尔莲驱_level up/2k.webm';
import mauxir_levelup_4k from '../movie/level up/猫汐尔莲驱_level up/猫汐尔_level_up_4k.webm';
import mauxir_win_1k from '../movie/win/猫汐尔莲驱_win/1k.webm';
import mauxir_win_2k from '../movie/win/猫汐尔莲驱_win/2k.webm';
import mauxir_win_4k from '../movie/win/猫汐尔莲驱_win/4k.webm';
// 安卡希雅时之重奏
import acacia_levelup_1k from '../movie/level up/安卡希雅时之重奏_level up/1k.webm';
import acacia_levelup_2k from '../movie/level up/安卡希雅时之重奏_level up/2k.webm';
import acacia_levelup_4k from '../movie/level up/安卡希雅时之重奏_level up/4k.webm';
import acacia_win_1k from '../movie/win/安卡希雅时之重奏_win/1k.webm';
import acacia_win_2k from '../movie/win/安卡希雅时之重奏_win/2k.webm';
import acacia_win_4k from '../movie/win/安卡希雅时之重奏_win/4k.webm';
// 茉莉安霄鹰
import marian_levelup_1k from '../movie/level up/茉莉安霄鹰_level up/1k.webm';
import marian_levelup_2k from '../movie/level up/茉莉安霄鹰_level up/2k.webm';
import marian_levelup_4k from '../movie/level up/茉莉安霄鹰_level up/4k.webm';
import marian_win_1k from '../movie/win/茉莉安霄鹰_win/1k.webm';
import marian_win_2k from '../movie/win/茉莉安霄鹰_win/2k.webm';
import marian_win_4k from '../movie/win/茉莉安霄鹰_win/4k.webm';

// [2026-10-19 莉莉子 · 安卓] 一次性影片（升级 / 胜利 / 标题）**首帧静图** —— 39 张
//   （`src/image/level_up|win|title/…`，与影片一一对应）
//   病根同大厅：安卓 WebView 在 `<video>` **没有可绘制帧**时，由媒体层自己画占位
//   （纯灰底 + 黑色播放图标）；PC 桌面 Chromium 无此行为 ⇒ 全屏播放器需 `poster` 兜底。
//   ⚠️ 必须走 Vite ES import（与影片一致）：Electron 下页面是 `file://`，写绝对路径会失效。
//   ⚠️ 目录名与影片**不同**：影片在 `src/movie/level up/`（**含空格**），静图在 `src/image/level_up/`（**下划线**）。
//   ⚠️ `win` 全部 18 张 + `level up/茉莉安霄鹰` 3 张的来源影片**开头是黑场**，
//      其静图取自第 **0.3 秒**（不是第 0 帧）—— **故意的、已确认可用**，勿"修"。
//   ⚠️ 猫汐尔莲驱的 4k 静图**文件名特殊**（`猫汐尔_level_up_4k.jpg`，与影片同名规则一致）。
// 里芙
import poster_lyfe_levelup_1k from '../image/level_up/里芙_level up/1k.jpg';
import poster_lyfe_levelup_2k from '../image/level_up/里芙_level up/2k.jpg';
import poster_lyfe_levelup_4k from '../image/level_up/里芙_level up/4k.jpg';
import poster_lyfe_win_1k from '../image/win/里芙_win/1k.jpg';
import poster_lyfe_win_2k from '../image/win/里芙_win/2k.jpg';
import poster_lyfe_win_4k from '../image/win/里芙_win/4k.jpg';
// 芬妮
import poster_fenny_levelup_1k from '../image/level_up/芬妮_level up/1k.jpg';
import poster_fenny_levelup_2k from '../image/level_up/芬妮_level up/2k.jpg';
import poster_fenny_levelup_4k from '../image/level_up/芬妮_level up/4k.jpg';
import poster_fenny_win_1k from '../image/win/芬妮_win/1k.jpg';
import poster_fenny_win_2k from '../image/win/芬妮_win/2k.jpg';
import poster_fenny_win_4k from '../image/win/芬妮_win/4k.jpg';
// 卜卜灵鉴
import poster_pupu_levelup_1k from '../image/level_up/卜卜灵鉴_level up/1k.jpg';
import poster_pupu_levelup_2k from '../image/level_up/卜卜灵鉴_level up/2k.jpg';
import poster_pupu_levelup_4k from '../image/level_up/卜卜灵鉴_level up/4k.jpg';
import poster_pupu_win_1k from '../image/win/卜卜灵鉴_win/1k.jpg';
import poster_pupu_win_2k from '../image/win/卜卜灵鉴_win/2k.jpg';
import poster_pupu_win_4k from '../image/win/卜卜灵鉴_win/4k.jpg';
// 猫汐尔莲驱（4k 文件名特殊）
import poster_mauxir_levelup_1k from '../image/level_up/猫汐尔莲驱_level up/1k.jpg';
import poster_mauxir_levelup_2k from '../image/level_up/猫汐尔莲驱_level up/2k.jpg';
import poster_mauxir_levelup_4k from '../image/level_up/猫汐尔莲驱_level up/猫汐尔_level_up_4k.jpg';
import poster_mauxir_win_1k from '../image/win/猫汐尔莲驱_win/1k.jpg';
import poster_mauxir_win_2k from '../image/win/猫汐尔莲驱_win/2k.jpg';
import poster_mauxir_win_4k from '../image/win/猫汐尔莲驱_win/4k.jpg';
// 安卡希雅时之重奏
import poster_acacia_levelup_1k from '../image/level_up/安卡希雅时之重奏_level up/1k.jpg';
import poster_acacia_levelup_2k from '../image/level_up/安卡希雅时之重奏_level up/2k.jpg';
import poster_acacia_levelup_4k from '../image/level_up/安卡希雅时之重奏_level up/4k.jpg';
import poster_acacia_win_1k from '../image/win/安卡希雅时之重奏_win/1k.jpg';
import poster_acacia_win_2k from '../image/win/安卡希雅时之重奏_win/2k.jpg';
import poster_acacia_win_4k from '../image/win/安卡希雅时之重奏_win/4k.jpg';
// 茉莉安霄鹰（来源影片开头黑场 ⇒ 静图取自 0.3s）
import poster_marian_levelup_1k from '../image/level_up/茉莉安霄鹰_level up/1k.jpg';
import poster_marian_levelup_2k from '../image/level_up/茉莉安霄鹰_level up/2k.jpg';
import poster_marian_levelup_4k from '../image/level_up/茉莉安霄鹰_level up/4k.jpg';
import poster_marian_win_1k from '../image/win/茉莉安霄鹰_win/1k.jpg';
import poster_marian_win_2k from '../image/win/茉莉安霄鹰_win/2k.jpg';
import poster_marian_win_4k from '../image/win/茉莉安霄鹰_win/4k.jpg';
// 标题（烬中焰火）
import poster_title_1k from '../image/title/烬中焰火/1k.jpg';
import poster_title_2k from '../image/title/烬中焰火/2k.jpg';
import poster_title_4k from '../image/title/烬中焰火/4k.jpg';

// 定义视频类型
export type MovieType = 'title' | 'levelup' | 'win';

// [新增] 分辨率与多分辨率源类型
export type VideoResolution = '1k' | '2k' | '4k';
export type MovieSource = Record<VideoResolution, string>;

// ==========================================
// [核心重构] 大厅视频 —— 角色分组定义
// ==========================================

/** 大厅角色 Key（13 个角色 / 皮肤） */
export type HallCharacterKey =
  | 'lyfe' | 'fenny'
  | 'marian' | 'katya'
  | 'yao' | 'chengxing'
  | 'nita'
  | 'katya_wedding' | 'tess'
  | 'fenny_swimsuit' | 'siris'
  | 'acacia' | 'marian_wedding';

/** 大厅角色入口：一个角色对应 4 个场景 */
export interface HallCharacterEntry {
  characterKey: HallCharacterKey;
  characterName: string;
  scenes: [string, string, string, string];
  /** [2026-10-15 莉莉子 · 安卓] 四个场景各自的**首帧静图**，与 `scenes` 一一对应（缩略图 / poster 兜底用） */
  posters: [string, string, string, string];
}

/** 角色 BGM 映射（按程指定的规则） */
const HALL_BGM_BY_CHARACTER: Record<HallCharacterKey, BgmKey> = {
  lyfe:             'hall_1',
  fenny:            'hall_1',
  marian:           'hall_2',
  katya:            'hall_2',
  yao:              'hall_3',
  chengxing:        'hall_3',
  nita:             'hall_4',
  katya_wedding:    'hall_5',
  tess:             'hall_5',
  fenny_swimsuit:   'hall_6',
  siris:            'hall_6',
  acacia:           'hall_7',
  marian_wedding:   'hall_7',
};

// ==========================================
// [核心重构] 组织 52 个视频为分组结构
// ==========================================
const HALL_ENTRIES: HallCharacterEntry[] = [
  { characterKey: 'lyfe',           characterName: '里芙',         scenes: [lyfe_01, lyfe_02, lyfe_03, lyfe_04],                                     posters: [poster_lyfe_01, poster_lyfe_02, poster_lyfe_03, poster_lyfe_04] },
  { characterKey: 'fenny',          characterName: '芬妮',         scenes: [fenny_01, fenny_02, fenny_03, fenny_04],                                 posters: [poster_fenny_01, poster_fenny_02, poster_fenny_03, poster_fenny_04] },
  { characterKey: 'marian',         characterName: '茉莉安',       scenes: [marian_01, marian_02, marian_03, marian_04],                             posters: [poster_marian_01, poster_marian_02, poster_marian_03, poster_marian_04] },
  { characterKey: 'katya',          characterName: '卡提亚',       scenes: [katya_01, katya_02, katya_03, katya_04],                                 posters: [poster_katya_01, poster_katya_02, poster_katya_03, poster_katya_04] },
  { characterKey: 'yao',            characterName: '肴',           scenes: [yao_01, yao_02, yao_03, yao_04],                                         posters: [poster_yao_01, poster_yao_02, poster_yao_03, poster_yao_04] },
  { characterKey: 'chengxing',      characterName: '辰星',         scenes: [chengxing_01, chengxing_02, chengxing_03, chengxing_04],                 posters: [poster_chengxing_01, poster_chengxing_02, poster_chengxing_03, poster_chengxing_04] },
  { characterKey: 'nita',           characterName: '妮塔',         scenes: [nita_01, nita_02, nita_03, nita_04],                                     posters: [poster_nita_01, poster_nita_02, poster_nita_03, poster_nita_04] },
  { characterKey: 'katya_wedding',  characterName: '卡提亚·婚纱',   scenes: [katya_wedding_01, katya_wedding_02, katya_wedding_03, katya_wedding_04], posters: [poster_katya_wedding_01, poster_katya_wedding_02, poster_katya_wedding_03, poster_katya_wedding_04] },
  { characterKey: 'tess',           characterName: '苔丝',         scenes: [tess_01, tess_02, tess_03, tess_04],                                     posters: [poster_tess_01, poster_tess_02, poster_tess_03, poster_tess_04] },
  { characterKey: 'fenny_swimsuit', characterName: '芬妮·泳装',    scenes: [fenny_swimsuit_01, fenny_swimsuit_02, fenny_swimsuit_03, fenny_swimsuit_04], posters: [poster_fenny_swimsuit_01, poster_fenny_swimsuit_02, poster_fenny_swimsuit_03, poster_fenny_swimsuit_04] },
  { characterKey: 'siris',          characterName: '瑟瑞斯',       scenes: [siris_01, siris_02, siris_03, siris_04],                                 posters: [poster_siris_01, poster_siris_02, poster_siris_03, poster_siris_04] },
  { characterKey: 'acacia',         characterName: '阿卡夏',       scenes: [acacia_01, acacia_02, acacia_03, acacia_04],                             posters: [poster_acacia_01, poster_acacia_02, poster_acacia_03, poster_acacia_04] },
  { characterKey: 'marian_wedding', characterName: '茉莉安·婚纱',   scenes: [marian_wedding_01, marian_wedding_02, marian_wedding_03, marian_wedding_04], posters: [poster_marian_wedding_01, poster_marian_wedding_02, poster_marian_wedding_03, poster_marian_wedding_04] },
];

/** 平坦列表 URL → 所属角色的查找表 */
const URL_TO_CHARACTER: Map<string, { entry: HallCharacterEntry; sceneIndex: number }> = (() => {
  const map = new Map<string, { entry: HallCharacterEntry; sceneIndex: number }>();
  for (const entry of HALL_ENTRIES) {
    entry.scenes.forEach((url, i) => map.set(url, { entry, sceneIndex: i }));
  }
  return map;
})();

export const MOVIE_DB = {
    // 标题视频升级为多分辨率聚合对象
    title: [
        { '1k': title_bg_1k, '2k': title_bg_2k, '4k': title_bg_4k }
    ] as MovieSource[],

    // [核心重构] 大厅视频 —— 由平坦数组升级为角色分组结构
    hall: HALL_ENTRIES as HallCharacterEntry[],

    // 升级动画映射 (升级为多分辨率聚合对象)
    levelup: {
        lyfe: { '1k': lyfe_levelup_1k, '2k': lyfe_levelup_2k, '4k': lyfe_levelup_4k },
        fenny: { '1k': fenny_levelup_1k, '2k': fenny_levelup_2k, '4k': fenny_levelup_4k },
        pupu_specular_soul: { '1k': pupu_levelup_1k, '2k': pupu_levelup_2k, '4k': pupu_levelup_4k },
        mauxir_lotus_drive: { '1k': mauxir_levelup_1k, '2k': mauxir_levelup_2k, '4k': mauxir_levelup_4k },
        acacia_chrono_echo: { '1k': acacia_levelup_1k, '2k': acacia_levelup_2k, '4k': acacia_levelup_4k },
        marian: { '1k': marian_levelup_1k, '2k': marian_levelup_2k, '4k': marian_levelup_4k }
    } as Record<string, MovieSource>,

    // 胜利动画映射 (升级为多分辨率聚合对象)
    win: {
        lyfe: [{ '1k': lyfe_win_1k, '2k': lyfe_win_2k, '4k': lyfe_win_4k }],
        fenny: [{ '1k': fenny_win_1k, '2k': fenny_win_2k, '4k': fenny_win_4k }],
        pupu_specular_soul: [{ '1k': pupu_win_1k, '2k': pupu_win_2k, '4k': pupu_win_4k }],
        mauxir_lotus_drive: [{ '1k': mauxir_win_1k, '2k': mauxir_win_2k, '4k': mauxir_win_4k }],
        acacia_chrono_echo: [{ '1k': acacia_win_1k, '2k': acacia_win_2k, '4k': acacia_win_4k }],
        marian: [{ '1k': marian_win_1k, '2k': marian_win_2k, '4k': marian_win_4k }]
    } as Record<string, MovieSource[]>
};

/**
 * 辅助函数：获取随机标题视频 (支持分辨率选择)
 */
export const getRandomTitleMovie = (res: VideoResolution = '1k'): string => {
    const list = MOVIE_DB.title;
    const movie = list[Math.floor(Math.random() * list.length)];
    const biasRes = applyMovieResolutionBias(res); // [2026-10-05] 运行期降档（弱机自动用更低画质）
    // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 先按"运行期健康度"降档，再逐级兜底
    return movie[biasRes] || movie[res] || movie['1k']; // 兜底返回 1k
};

/**
 * 辅助函数：根据英雄获取升级视频 (支持分辨率选择)
 */
export const getLevelUpMovie = (heroKey: string, res: VideoResolution = '1k'): string | null => {
    const movie = MOVIE_DB.levelup[heroKey];
    const biasRes = applyMovieResolutionBias(res);
    return movie ? (movie[biasRes] || movie[res] || movie['1k']) : null;
};

/**
 * 辅助函数：根据在场英雄列表获取随机胜利视频 (支持分辨率选择)
 */
export const getVictoryMovie = (heroKeys: string[], res: VideoResolution = '1k'): string | null => {
    for (const key of heroKeys) {
        if (MOVIE_DB.win[key] && MOVIE_DB.win[key].length > 0) {
            const movies = MOVIE_DB.win[key];
            const movie = movies[Math.floor(Math.random() * movies.length)];
            const biasRes = applyMovieResolutionBias(res);
            return movie[biasRes] || movie[res] || movie['1k'];
        }
    }
    return null;
};

// ==========================================
// [2026-10-19 莉莉子 · 安卓] 一次性影片（升级 / 胜利 / 标题）→ **首帧静图** 查找表
// ==========================================
//   与大厅那套（`HALL_ENTRIES.posters` + `getHallMoviePoster`）**同源同风格**：
//   · 静图与影片**同位**挂在同一份结构里（不做顺序耦合的平行数组）
//   · 对外只暴露一个 **URL → 静图 URL** 的反查函数
//   ⚠️ 必须按 **URL** 反查而不是按 heroKey：`useMovie` 会把影片先喂给 `videoPreloader`
//      换成 `blob:` URL 再交给 `App.tsx`，调用处**只剩得下这个 URL**。
//   ⚠️ 因此反查要在 `useMovie` 里、**换 blob 之前**用原始 import URL 做（见 `useMovie.ts`）。

/** 标题影片静图（与 `MOVIE_DB.title` 同序同形状） */
const TITLE_POSTERS: MovieSource[] = [
    { '1k': poster_title_1k, '2k': poster_title_2k, '4k': poster_title_4k },
];

/** 升级影片静图（与 `MOVIE_DB.levelup` **同键同形状**） */
const LEVELUP_POSTERS: Record<string, MovieSource> = {
    lyfe: { '1k': poster_lyfe_levelup_1k, '2k': poster_lyfe_levelup_2k, '4k': poster_lyfe_levelup_4k },
    fenny: { '1k': poster_fenny_levelup_1k, '2k': poster_fenny_levelup_2k, '4k': poster_fenny_levelup_4k },
    pupu_specular_soul: { '1k': poster_pupu_levelup_1k, '2k': poster_pupu_levelup_2k, '4k': poster_pupu_levelup_4k },
    mauxir_lotus_drive: { '1k': poster_mauxir_levelup_1k, '2k': poster_mauxir_levelup_2k, '4k': poster_mauxir_levelup_4k },
    acacia_chrono_echo: { '1k': poster_acacia_levelup_1k, '2k': poster_acacia_levelup_2k, '4k': poster_acacia_levelup_4k },
    marian: { '1k': poster_marian_levelup_1k, '2k': poster_marian_levelup_2k, '4k': poster_marian_levelup_4k },
};

/** 胜利影片静图（与 `MOVIE_DB.win` **同键同形状**，值同为数组） */
const WIN_POSTERS: Record<string, MovieSource[]> = {
    lyfe: [{ '1k': poster_lyfe_win_1k, '2k': poster_lyfe_win_2k, '4k': poster_lyfe_win_4k }],
    fenny: [{ '1k': poster_fenny_win_1k, '2k': poster_fenny_win_2k, '4k': poster_fenny_win_4k }],
    pupu_specular_soul: [{ '1k': poster_pupu_win_1k, '2k': poster_pupu_win_2k, '4k': poster_pupu_win_4k }],
    mauxir_lotus_drive: [{ '1k': poster_mauxir_win_1k, '2k': poster_mauxir_win_2k, '4k': poster_mauxir_win_4k }],
    acacia_chrono_echo: [{ '1k': poster_acacia_win_1k, '2k': poster_acacia_win_2k, '4k': poster_acacia_win_4k }],
    marian: [{ '1k': poster_marian_win_1k, '2k': poster_marian_win_2k, '4k': poster_marian_win_4k }],
};

const ALL_RESOLUTIONS: VideoResolution[] = ['1k', '2k', '4k'];

/**
 * 影片 URL → 首帧静图 URL（39 条）。由上面三份"同位"记录**逐分辨率**展开，
 * 结构与 `MOVIE_DB` 一一对应 ⇒ 后续加片只要两边同步加即可。
 */
const MOVIE_URL_TO_POSTER: Map<string, string> = (() => {
    const map = new Map<string, string>();
    const link = (src: string | undefined, poster: string | undefined) => {
        if (src && poster) map.set(src, poster);
    };
    MOVIE_DB.title.forEach((movie, i) => {
        const poster = TITLE_POSTERS[i];
        if (!poster) return;
        ALL_RESOLUTIONS.forEach(r => link(movie[r], poster[r]));
    });
    for (const [key, movie] of Object.entries(MOVIE_DB.levelup)) {
        const poster = LEVELUP_POSTERS[key];
        if (!poster) continue;
        ALL_RESOLUTIONS.forEach(r => link(movie[r], poster[r]));
    }
    for (const [key, movies] of Object.entries(MOVIE_DB.win)) {
        const posters = WIN_POSTERS[key];
        if (!posters) continue;
        movies.forEach((movie, i) => {
            const poster = posters[i];
            if (!poster) return;
            ALL_RESOLUTIONS.forEach(r => link(movie[r], poster[r]));
        });
    }
    return map;
})();

/**
 * [2026-10-19 莉莉子 · 安卓] 由**一次性影片 URL** 取对应的首帧静图 URL。
 *
 * 用途：给全屏 `<VideoPlayer>` 的 `poster` 属性兜底 —— 安卓 WebView 在影片**没有可绘制帧**时
 * 会由媒体层自己画占位（纯灰底 + 黑色播放图标），PC 桌面 Chromium 无此行为。
 *
 * ⚠️ 必须传**原始 import URL**（`getLevelUpMovie` / `getVictoryMovie` / `getRandomTitleMovie` 的返回值）；
 *    经 `videoPreloader` 换成 `blob:` 之后就查不到了 —— 反查要在 `useMovie` 里换 blob **之前**做。
 * 找不到时返回 `undefined`，由调用方兜底（`<video poster={undefined}>` = 不写该属性）。
 */
export const getMoviePoster = (url: string): string | undefined => {
    return MOVIE_URL_TO_POSTER.get(url);
};

// ==========================================
// [核心重构] 大厅视频辅助函数
// ==========================================

/**
 * 获取平坦的大厅视频 URL 列表（52个，用于侧栏/网格展示 & 旧版兼容）
 */
export const getHallMovies = (): string[] => {
    return HALL_ENTRIES.flatMap(e => e.scenes);
};

/** 获取角色分组入口列表 */
export const getHallCharacterEntries = (): HallCharacterEntry[] => {
    return HALL_ENTRIES;
};

/**
 * 通过 URL 查找所属的角色入口
 */
export const findCharacterByVideoUrl = (url: string): HallCharacterEntry | null => {
    return URL_TO_CHARACTER.get(url)?.entry ?? null;
};

/**
 * 通过 URL 查找当前是第几个场景（0~3）
 */
export const findSceneIndexByVideoUrl = (url: string): number => {
    return URL_TO_CHARACTER.get(url)?.sceneIndex ?? 0;
};

// ==========================================
// [2026-10-15 莉莉子 · 安卓] 大厅影片 → 首帧静图 查找表
// ==========================================

/** 大厅影片 URL → 该场景的**首帧静图** URL（52 条，全部有图） */
const URL_TO_POSTER: Map<string, string> = (() => {
    const map = new Map<string, string>();
    for (const entry of HALL_ENTRIES) {
        entry.scenes.forEach((url, i) => map.set(url, entry.posters[i]));
    }
    return map;
})();

/**
 * [2026-10-15 莉莉子 · 安卓] 由**大厅影片 URL** 取对应的首帧静图 URL。
 *
 * 用途（两条都是"视频无可绘制帧"的兜底）：
 *   ① 背景选择面板的缩略图 —— 直接用 `<img src={...}>`（`preload="metadata"` 永远解不出帧）
 *   ② 全屏背景预览 `<LoopVideo poster={...}>` —— 视频就绪前先显示静图，而不是安卓的灰块
 *
 * 找不到（非大厅影片 / 传入的已是图片）时返回 `undefined`，由调用方自行兜底。
 */
export const getHallMoviePoster = (url: string): string | undefined => {
    return URL_TO_POSTER.get(url);
};

/**
 * 获取指定角色的 4 个场景 URL
 */
export const getCharacterScenes = (key: HallCharacterKey): string[] => {
    const entry = HALL_ENTRIES.find(e => e.characterKey === key);
    return entry ? [...entry.scenes] : [];
};

/**
 * 获取当前视频的「下一个场景」URL（循环 0→1→2→3→0）
 * 若找不到角色返回原 URL
 */
export const getNextSceneUrl = (currentUrl: string): string => {
    const found = URL_TO_CHARACTER.get(currentUrl);
    if (!found) return currentUrl;
    const nextIndex = (found.sceneIndex + 1) % 4;
    return found.entry.scenes[nextIndex];
};

/**
 * 判断一个 URL 是否是大厅角色视频（用于按钮显隐判断）
 */
export const isHallCharacterVideo = (url: string): boolean => {
    return URL_TO_CHARACTER.has(url);
};

// ==========================================
// [核心重构] 大厅音画联动映射
// ==========================================

/**
 * 根据角色 Key 获取对应的 BGM key
 */
export const getHallBgmByCharacterKey = (characterKey: HallCharacterKey): BgmKey => {
    return HALL_BGM_BY_CHARACTER[characterKey] || 'default';
};

/**
 * 根据视频 URL 获取 BGM key（通过角色查找）
 */
export const getHallBgmByVideoUrl = (url: string): BgmKey => {
    const entry = findCharacterByVideoUrl(url);
    if (entry) return getHallBgmByCharacterKey(entry.characterKey);
    return 'default';
};

/**
 * [向后兼容] 根据平坦列表索引获取 BGM key
 * 索引顺序与 getHallMovies() 平坦列表一致
 */
export const getHallBgmByIndex = (index: number): BgmKey => {
    const flat = getHallMovies();
    const url = flat[index % flat.length];
    return getHallBgmByVideoUrl(url);
};
