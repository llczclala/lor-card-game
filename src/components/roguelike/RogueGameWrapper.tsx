// ==========================================
// 悖论迷宫 · 战斗包装
// 复用 GameSession + 顶部肉鸽 HUD 覆盖层
// 胜利/失败回调由 App 层注入（更新整局状态 / 结算）
// ==========================================
import React, { useState } from 'react';
import { GameSession } from '../GameSession';
import { Home } from 'lucide-react';
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useArmamentConfig } from '../../hooks/useArmamentConfig'; // [2026-08-14 武装] 局外武装带入
import { getEquipmentById } from '../../data/equipment'; // [2026-09-25 莉莉子 武装线] 武装任务查询
import { isQuestDone, questKey } from '../../logic/questTracker'; // [2026-09-25 莉莉子 武装线] 整局任务达成判定

type GameSessionProps = React.ComponentProps<typeof GameSession>;

interface RogueGameWrapperProps extends Omit<GameSessionProps, 'enemyDeck' | 'enemyHeroConfig'> {
    encounter: any; // 肉鸽敌人遭遇（buildRoguelikeEncounter 产出）
    run: RoguelikeRunState;
    onVictory: (playerNexus?: number) => void; // [2026-08-11] 带剩余水晶（真衔接写回）
    onDefeat: (playerNexus?: number) => void; // [2026-08-11] 带剩余水晶（败北不写回）
}

export const RogueGameWrapper: React.FC<RogueGameWrapperProps> = ({ encounter, run, onVictory, onDefeat, onExit, ...rest }) => {
    // [2026-08-11] 返回按钮 → 弹确认框，确认后放弃本场回地图（HP 由 App 层回滚）
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const { getArmament } = useArmamentConfig(); // [2026-08-14 武装] 局外武装配置

    // [2026-08-14 武装] 战斗构建合并：局内装备（equippedCards）+ 局外武装（useArmamentConfig）一起挂到对应卡
    // 武装静态修饰（+1/+1 / 费用-2）由 attachEquipment 生效；秘法回响（回合开始恢复法力）由 armamentManaRestore 生效
    // [2026-09-25 莉莉子 不叠加] 合并后整体去重（老存档可能残留同英雄重复武装）：同一件装备/武装只带一份
    const armForHero = Array.from(new Set(getArmament(run.heroKey, run.heroLevel ?? 1).filter((v): v is string => !!v))); // [2026-08-28 莉莉子 修复] 只带已解锁槽位武装（等级降低残留不带入）
    const rogueEquipments = {
        ...(run.equippedCards ?? {}),
        [run.heroKey]: Array.from(new Set([
            ...(run.equippedCards?.[run.heroKey] ?? []),
            ...armForHero,
        ])),
    };
    // ── [2026-09-25 莉莉子 三线任务化框架 · 武装线] 武装的战斗内效果 → 注入本场 ──
    //   借道迷宫强化管线（分发 / 解锁门 / 面板展示全部复用），不为武装另开一套执行器
    //   · 无 quest 的（Novel 型：噬牌之匣 / 王权之证）= 常驻生效
    //   · 有 quest 的（Quest 型：余响之匣）= 完成整局任务后才注入
    const armamentEffects = (run.armaments ?? []).flatMap(id => {
        const def = getEquipmentById(id);
        if (!def?.grantBattleEffectIds?.length) return [];
        if (!def.quest) return def.grantBattleEffectIds;
        return isQuestDone(run.questProgress, questKey.arm(id), def.quest.threshold) ? def.grantBattleEffectIds : [];
    });
    // [2026-08-15] 武装断连排查日志：武装配置是否读到 / 英雄卡是否在牌组 / 合并后的装备列表
    console.log(`[RogueGameWrapper] heroKey=${run.heroKey} | 武装配置=${JSON.stringify(armForHero)} | deck含英雄卡=${run.deck.includes(run.heroKey)} | 合并装备=${JSON.stringify(rogueEquipments[run.heroKey])}`);

    // ── [2026-09-28 莉莉子 神格神经] 已解锁节点已并入 `run.enhancements`（见 useRoguelikeRun.startRun）──
    //   ⚠️ 不要在这里再注入一遍：那会让战斗内「敌我强化」面板**出现重复行**。
    //   单一来源 = run.enhancements（地图抽屉 / 结算窗 / 战斗分发 / ⑤ 的规则查询全部吃这一份）。

    return (
        <div className="relative w-full h-full">
            <GameSession
                {...rest}
                onExit={() => setShowExitConfirm(true)} // [2026-08-11] 拦截返回按钮，先弹确认框
                enemyDeck={encounter.deck}
                enemyHeroConfig={encounter.heroConfig}
                // [2026-08-07] 移除 passiveEffects（GameSession 无此 prop，被动效果未接入）
                aiDifficulty="hard" // [2026-08-06] 肉鸽固定最高 AI 难度
                aiPersonality={encounter.aiPersonality ?? 'balanced'} // [2026-08-06] 透传流派性格
                enemyCardBackIndex={encounter.enemyCardBackIndex ?? 0} // [2026-08-17 莉莉子] 敌方卡背
                initialPlayerNexus={run.hp} // [2026-08-11] 真衔接：战斗水晶初值 = 全局 HP
                playerNexusMax={run.maxHp} // [2026-08-11] 真衔接：战斗水晶回血上限 = 全局 maxHp
                initialEnemyNexus={encounter.enemyNexusHp} // [2026-08-28] 敌方水晶初始血量（难度基础值 + 生命强化折算，中后段+B10 / Boss+20）
                rogueEnhancements={[...run.enhancements, ...armamentEffects]} // [2026-08-11] 玩家迷宫强化 id（[2026-09-28] 已含神格神经节点）· [2026-09-25 莉莉子 武装线] + 已完成整局任务的武装战斗内效果
                enemyEnhancements={encounter.enemyBuffs ?? []} // [2026-08-27] 敌方迷宫强化 id（流派配置，战斗内 battleEffect 生效）
                enemyEquipments={encounter.enemyEquipments} // [2026-08-30 程拍板] 敌方单位卡随机装备（难度分级）
                rogueEquipments={rogueEquipments} // [2026-08-12 商店经济] 局内装备 + [2026-08-14 武装] 局外武装合并挂载
                onVictory={onVictory}
                onDefeat={onDefeat}
                isRogueMode // [2026-08-29 莉莉子] 肉鸽战斗胜利结算按钮显示「返回地图」
                matchMode="rogue" // [2026-09-04 账号等级/战绩] 肉鸽逐节点战斗不计（整局由 App settleRun 结算一次）
            />

            {/* [2026-08-11] 移除战斗内顶部 HUD 覆盖层（程拍板：肉鸽 HUD 数据栏位在实战对局无帮助） */}

            {/* [2026-08-11] 放弃本场确认弹窗（原"返回大厅"整局作废，改"放弃本场回地图"） */}
            {showExitConfirm && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={e => e.stopPropagation()}>
                    <div className="bg-slate-900 border border-white/20 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center animate-pop-in">
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Home size={24} className="text-blue-400" />
                            <h3 className="text-2xl font-black text-white tracking-widest">放弃本场</h3>
                        </div>
                        <div className="text-gray-300 mb-8 text-lg leading-relaxed">
                            确认放弃本场战斗？<br />
                            <span className="text-amber-400 font-bold">HP 将回滚到战斗前，本局保留。</span>
                        </div>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_BACK); setShowExitConfirm(false); }}
                                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold border border-white/10 transition-colors"
                            >取消</button>
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setShowExitConfirm(false); onExit?.(); }}
                                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-[0_0_20px_rgba(59,130,246,0.4)] transition-all hover:scale-105"
                            >确认</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
