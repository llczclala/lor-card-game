// ==========================================
// [2026-10-05 莉莉子 BUG修复 · 20261005-11] 影片健康度 + 自动降档
// ── 目标（程的口径）：「不是针对某台机器做适配，而是让玩家们都能正常游玩」
//    玩家的显卡千奇百怪 ⇒ 除了把资产做成"绝大多数机器都能硬解"（VP9/30fps/降分辨率），
//    还要有一层**运行期自适应**：真遇到扛不住的机器，就**自动降一档画质**，而不是卡在那儿。
// ── 判据来源：播放器检测到"可见、未暂停、未播完，但播放进度连续 N 秒不前进"（卡死）
//    ⇒ 记一次 stall；同一场会话里累计越多、降得越多（最多降 2 档）。
// ── 注意：本模块只做"偏移量"，真正的档位映射仍走 `movieData` 的 `movie[res] || movie['1k']` 兜底。
// ==========================================
import type { VideoResolution } from '../data/movieData';

const ORDER: VideoResolution[] = ['1k', '2k', '4k'];

let stallCount = 0;
const stallLog: string[] = [];

/** 记录一次影片卡死（由播放器调用）。 */
export const reportMovieStall = (where: string): number => {
    stallCount += 1;
    stallLog.push(`${new Date().toLocaleTimeString()} ${where}`);
    console.warn(`[movieHealth] 影片卡死第 ${stallCount} 次（${where}）→ 当前降档偏移 = ${getMovieResolutionBias()}`);
    return stallCount;
};

/** 降档偏移：0 不降 / 1 降一档 / 2 降两档（累计卡死 1 次 → 降 1；≥2 次 → 降 2） */
export const getMovieResolutionBias = (): number => (stallCount >= 2 ? 2 : stallCount >= 1 ? 1 : 0);

/** 把玩家选择的画质按当前健康度降档（最低到 1k，绝不越界） */
export const applyMovieResolutionBias = (res: VideoResolution | undefined): VideoResolution => {
    const cur = res ?? '1k';
    const idx = ORDER.indexOf(cur);
    if (idx < 0) return '1k';
    return ORDER[Math.max(0, idx - getMovieResolutionBias())];
};

/** 排查用：本场会话的卡死记录 */
export const getMovieStallReport = (): { count: number; log: string[]; bias: number } =>
    ({ count: stallCount, log: [...stallLog], bias: getMovieResolutionBias() });

/** 新一局/新一轮时清空（目前只在需要时手动调用） */
export const resetMovieHealth = (): void => {
    stallCount = 0;
    stallLog.length = 0;
};
