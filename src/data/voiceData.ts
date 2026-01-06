// 导入里芙的语音文件
// 击败
import lyfe_die from '../music/voice/天启者/里芙/被击败.mp3';
// 技能抉择
import lyfe_ult_select from '../music/voice/天启者/里芙/大招.mp3';
import lyfe_skill_select_1 from '../music/voice/天启者/里芙/小技能1.mp3';
import lyfe_skill_select_2 from '../music/voice/天启者/里芙/小技能2.mp3';
// 登场 (普通)
import lyfe_play_1 from '../music/voice/天启者/里芙/登场1.mp3';
import lyfe_play_2 from '../music/voice/天启者/里芙/登场2.mp3';
// 登场 (复仇/友军阵亡后)
import lyfe_play_revenge_1 from '../music/voice/天启者/里芙/进攻或格挡1.mp3';
import lyfe_play_revenge_2 from '../music/voice/天启者/里芙/进攻或格挡2.mp3';
// 互动
import lyfe_enemy_spawn_1 from '../music/voice/天启者/里芙/敌人出现1.mp3';
import lyfe_enemy_spawn_2 from '../music/voice/天启者/里芙/敌人出现2.mp3';
// 击杀
import lyfe_kill_1 from '../music/voice/天启者/里芙/敌人击败1.mp3';
import lyfe_kill_2 from '../music/voice/天启者/里芙/敌人击败2.mp3';
import lyfe_kill_3 from '../music/voice/天启者/里芙/敌人击败3.mp3';
// 状态
import lyfe_victory_1 from '../music/voice/天启者/里芙/胜利1.mp3';
import lyfe_victory_2 from '../music/voice/天启者/里芙/胜利2.mp3';

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
    // 键名必须与 cards.ts 中的 key (lyfe) 一致
    lyfe: {
        die: [lyfe_die],
        play: [lyfe_play_1, lyfe_play_2],
        attack_block: [lyfe_play_revenge_1, lyfe_play_revenge_2],
        enemy_spawn: [lyfe_enemy_spawn_1, lyfe_enemy_spawn_2],
        kill: [lyfe_kill_1, lyfe_kill_2, lyfe_kill_3],
        victory: [lyfe_victory_1, lyfe_victory_2],
        spell_small: [lyfe_skill_select_1, lyfe_skill_select_2],
        spell_ultimate: [lyfe_ult_select],
    },
    // 未来添加 fenny: { ... }
};