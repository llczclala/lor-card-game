// --- 里芙 (Lyfe) 语音资源 ---
import lyfe_die from '../music/voice/天启者/里芙/被击败.mp3';
import lyfe_ult_select from '../music/voice/天启者/里芙/大招.mp3';
import lyfe_skill_select_1 from '../music/voice/天启者/里芙/小技能1.mp3';
import lyfe_skill_select_2 from '../music/voice/天启者/里芙/小技能2.mp3';
import lyfe_play_1 from '../music/voice/天启者/里芙/登场1.mp3';
import lyfe_play_2 from '../music/voice/天启者/里芙/登场2.mp3';
import lyfe_play_revenge_1 from '../music/voice/天启者/里芙/进攻或格挡1.mp3';
import lyfe_play_revenge_2 from '../music/voice/天启者/里芙/进攻或格挡2.mp3';
import lyfe_enemy_spawn_1 from '../music/voice/天启者/里芙/敌人出现1.mp3';
import lyfe_enemy_spawn_2 from '../music/voice/天启者/里芙/敌人出现2.mp3';
import lyfe_kill_1 from '../music/voice/天启者/里芙/敌人击败1.mp3';
import lyfe_kill_2 from '../music/voice/天启者/里芙/敌人击败2.mp3';
import lyfe_kill_3 from '../music/voice/天启者/里芙/敌人击败3.mp3';
import lyfe_victory_1 from '../music/voice/天启者/里芙/胜利1.mp3';
import lyfe_victory_2 from '../music/voice/天启者/里芙/胜利2.mp3';

// --- [修正] 芬妮 (Fenny) 语音资源 ---
// 路径替换为 "天启者/芬妮"
import fenny_die from '../music/voice/天启者/芬妮/被击败.mp3';
import fenny_ult_select from '../music/voice/天启者/芬妮/大招.mp3';
import fenny_skill_select_1 from '../music/voice/天启者/芬妮/小技能1.mp3';
import fenny_skill_select_2 from '../music/voice/天启者/芬妮/小技能2.mp3';
import fenny_play_1 from '../music/voice/天启者/芬妮/登场1.mp3';
import fenny_play_2 from '../music/voice/天启者/芬妮/登场2.mp3';
import fenny_play_revenge_1 from '../music/voice/天启者/芬妮/进攻或格挡1.mp3';
import fenny_play_revenge_2 from '../music/voice/天启者/芬妮/进攻或格挡2.mp3';
import fenny_enemy_spawn_1 from '../music/voice/天启者/芬妮/敌人出现1.mp3';
import fenny_enemy_spawn_2 from '../music/voice/天启者/芬妮/敌人出现2.mp3';
import fenny_kill_1 from '../music/voice/天启者/芬妮/敌人击败1.mp3';
import fenny_kill_2 from '../music/voice/天启者/芬妮/敌人击败2.mp3';
import fenny_kill_3 from '../music/voice/天启者/芬妮/敌人击败3.mp3';
import fenny_victory_1 from '../music/voice/天启者/芬妮/胜利1.mp3';
import fenny_victory_2 from '../music/voice/天启者/芬妮/胜利2.mp3';

// 导出语音事件类型 (关键修复：确保 export 关键字存在)
export type VoiceEventType =
    | 'die'
    | 'play'
    | 'attack_block'
    | 'enemy_spawn'
    | 'kill'
    | 'victory'
    | 'spell_small'
    | 'spell_ultimate';

// 语音配置接口
export interface VoiceConfig {
    [key: string]: string[]; // 事件名 -> 音频路径数组
}

export interface VoiceRegistry {
    [heroKey: string]: VoiceConfig;
}

// 核心数据库
export const VOICE_DB: VoiceRegistry = {
    // 里芙配置
    'lyfe': {
        play: [lyfe_play_1, lyfe_play_2],
        attack_block: [lyfe_play_revenge_1, lyfe_play_revenge_2],
        die: [lyfe_die],
        enemy_spawn: [lyfe_enemy_spawn_1, lyfe_enemy_spawn_2],
        kill: [lyfe_kill_1, lyfe_kill_2, lyfe_kill_3],
        victory: [lyfe_victory_1, lyfe_victory_2],
        spell_small: [lyfe_skill_select_1, lyfe_skill_select_2],
        spell_ultimate: [lyfe_ult_select]
    },

    // [修正] 芬妮配置 (新增)
    // 确保 key 'fenny' 与 cards.ts 中的 card.key 一致
    'fenny': {
        play: [fenny_play_1, fenny_play_2],
        attack_block: [fenny_play_revenge_1, fenny_play_revenge_2],
        die: [fenny_die],
        enemy_spawn: [fenny_enemy_spawn_1, fenny_enemy_spawn_2],
        kill: [fenny_kill_1, fenny_kill_2, fenny_kill_3],
        victory: [fenny_victory_1, fenny_victory_2],
        spell_small: [fenny_skill_select_1, fenny_skill_select_2],
        spell_ultimate: [fenny_ult_select]
    }
};