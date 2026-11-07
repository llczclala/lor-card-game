import { useEffect, useRef } from 'react';
import type { CardData, GameState } from '../types';
import { canAffordCard } from '../utils/gameRules';
import { evaluate } from '../logic/aiSpellStrategies';
import { getPower, getHealth } from '../logic/keywords'; // [2026-08-29 莉莉子] 真实面板数值（含 buffs/roundBuffs/伤害）——AI 攻血判定必须用它，否则 buff 后的单位被当成白板
import { canBlockAttacker } from '../logic/blockRules'; // [2026-10-26 莉莉子] 格挡合法性唯一门卫（无法格挡/隐秘/凶恶）——玩家侧与 AI 侧共用
import { resolveAIConfig } from '../data/aiDifficulty';
import type { AIDifficultyLevel, AIDifficultyConfig } from '../data/aiDifficulty';
import type { EnemyArchetype } from '../data/enemies/archetypes';

type AIProps = {
    game: GameState;
    enemyHand: CardData[];
    enemyBench: CardData[];
    playerBench: CardData[]; // [新增] 玩家备战席
    combatField: any[];
    actions: any;
    setMessage: (msg: string) => void;
    disabled?: boolean; // ★ 教程模式禁用AI自动行动
    paused?: boolean; // [2026-08-30 莉莉子] 局内暂停冻结 AI（暂停时 effect 直接 return 不建 timer）
    difficulty?: AIDifficultyLevel; // [2026-08-06] AI 难度档位（默认 normal）
    personality?: EnemyArchetype['aiPersonality']; // [2026-08-06] AI 流派性格（默认 balanced）
};

// ============================================================
// [2026-10-04 莉莉子 · AI 停机保护性修复] 模块级工具
//   放在组件外 = 天然不受闭包陈旧影响（心跳 effect 的 deps=[] 也安全）。
//
// 背景：一次系统性排查证实「AI 永久停机」是**一整类**缺陷，共同形状是
//   「AI 做完（或该做）一个动作，但没有任何被监听的值发生变化 ⇒ 再也没人叫醒它」。
// 已证实的洞分四类：
//   ① 闸门与依赖不一致 —— pendingLevelUps / levelUpCard 冻结 AI，却不在依赖表里
//      （原闸门 useAI.ts:52 vs 原依赖表 587-596）
//   ② 决策做了，但推进动作**静默 no-op** —— passTurn 在 calibratePending / 额外攻击+格挡 /
//      非白名单阶段（useGameState.ts:4721 / 4734 / 4785）什么都不写
//   ③ 决策靠"一个依赖都没动"的 setState 推进（格挡阶段：combatField 只换内容不换长度），
//      并把唯一推进力压在一个**生命周期外**的裸 setTimeout 上
//   ④ 冻结状态的唯一出口压在 UI 定时器上，而那个定时器会被"父组件重渲染"反复清零
//      （AI 校准面板：onConfirm 是内联函数却在依赖表里）
// 本文件负责「让 AI 永远能自己醒过来」，并在复发时**自带现场取证**。
// ============================================================

/** 被阻塞多久开始周期性打现场快照（ms） */
const AI_STALL_WARN_MS = 20000;
/** 同一阻塞连续超过该时长后，走"引擎已有的安全出口"（ms） */
const AI_STALL_ESCAPE_MS = 45000;
/** 连续崩溃时的重试退避上限（ms） */
const AI_CRASH_BACKOFF_MAX_MS = 15000;

/**
 * **唯一阻塞判据**：排定决策时与开火前都用它，消除"排定时快照 vs 开火时真值"的不对称。
 *
 * ⚠️ 刻意**不**把 `select_*` / `pendingSpell` 算作阻塞（对独立审查 P4 的**有意偏离**）：
 *    那几项是**玩家侧**的半程施法状态；若把它算成阻塞，玩家半程施法跨过优先权翻转时，
 *    AI 会永久冻结（而 passTurn 又不清 spellCasting）⇒ 等于**制造**一个新的死锁。
 *    故只把它作为看门狗日志信号，不作为闸门。
 */
const readBlockReason = (game: GameState): string | null => {
    if (game.gameResult) return 'game_over';
    if (game.turnOwner !== 'enemy') return 'not_ai_turn';
    if (game.phase === 'animating') return 'phase_animating';
    if (game.levelUpCard) return 'levelup_overlay';
    if ((game.pendingLevelUps?.length ?? 0) > 0) return 'levelup_queue';
    if (game.calibratePending) return 'calibrate';
    if (game.spellCasting?.step === 'choose_mode') return 'choose_mode';
    return null;
};

/** 现场快照：只取标量与短字符串，**不序列化任何活对象** */
// [2026-10-04 独立审查 #9 修复] 本函数是在 catch / 看门狗里当**实参**求值的 ⇒ 它自己绝不能抛，
//   否则异常会从 catch 里逃出去、后面的兜底动作根本轮不到。故对结构全部做防御式读取。
const snapshotAIState = (
    game: GameState,
    live: { enemyHand?: CardData[]; enemyBench?: CardData[]; combatField?: any[] },
) => ({
    round: game.round,
    phase: game.phase,
    turnOwner: game.turnOwner,
    levelUpCard: game.levelUpCard?.key ?? null,
    pendingLevelUps: (game.pendingLevelUps ?? []).map(c => c?.key),
    spellCasting: game.spellCasting
        ? `${game.spellCasting.step}${game.spellCasting.choiceOwner ? '/' + game.spellCasting.choiceOwner : ''}`
        : null,
    calibratePending: game.calibratePending
        ? `${game.calibratePending.owner}(${game.calibratePending.drawnCards?.length ?? 0}张)`
        : null,
    spellStack: (game.spellStack ?? []).map(s => s?.card?.key),
    consecutivePasses: game.consecutivePasses,
    enemyMana: `${game.enemyMana}/${game.enemySpellMana}`,
    attackTokenEnemy: game.attackToken?.enemy ?? null,
    // [2026-10-10 莉莉子] **连斩链现场**（本次要的决定性字段）：程实测「茉莉安大招连杀后 AI 宕机」
    //   时，`animating` 卡了 25s+，而看门狗快照里**完全没有链的信息** ⇒ 无法分辨
    //   "链还在逐击推进（只是慢）" 还是 "链死在半路（死链）"。
    //   📏 量级（**已按程的指正修正**）：实战一条链最多清 6~7 个单位、每击 1s
    //      ⇒ **链本身只有几秒**；`MAX_CHAIN = 20` 只是防死循环的护栏、不可达。
    //      ⇒ 若快照里 `pendingChain` 已 `done` 却仍在 `animating`，问题不在链的时长。
    // [2026-10-10 莉莉子 · 二轮审查建议③] 补 `prevPhase` / `casterSide` / `skipBeacon` ——
    //   `prevPhase` 是"链收尾还原成 animating"这类问题**唯一**的判据，务必带上。
    pendingChain: game.pendingChain
        ? {
            step: game.pendingChain.step, done: game.pendingChain.done,
            victimId: game.pendingChain.victimId,
            prevPhase: game.pendingChain.prevPhase,
            casterSide: game.pendingChain.casterSide,
            skipBeacon: !!game.pendingChain.skipBeacon,
          }
        : null,
    enemyHand: (live.enemyHand ?? []).map(c => c?.key),
    enemyBench: (live.enemyBench ?? []).map(c => c?.key),
    combatFieldLen: (live.combatField ?? []).length,
});

/**
 * [2026-10-04 独立审查 #6 修复] **进展指纹**：只取"真的推进了才会变"的标量。
 *
 * 病根：心跳的存活判据是"没被阻塞"（谓词），不是"游戏往前走了"（进展）。
 *   万一某个分支的动作**什么都没写**，依赖不会变、心跳又会以 0 延迟重排一次决策 ⇒
 *   1 次/秒的动作风暴，而且因为"没被阻塞"，看门狗的报警/逃生**全都不会触发**（完全隐形）。
 *   两次心跳之间指纹不变 ⇒ 判定空转并退避。
 */
const progressFingerprint = (g: GameState) =>
    `${g.phase}|${g.turnOwner}|${g.round}|${g.lastActionTimestamp}` +
    `|${g.pendingLevelUps?.length ?? 0}|${g.levelUpCard?.id ?? '-'}` +
    `|${g.spellStack?.length ?? 0}|${g.calibratePending ? 'cal' : '-'}|${g.consecutivePasses}`;

export const useAI = ({ game, enemyHand, enemyBench, playerBench, combatField, actions, setMessage, disabled = false, paused = false, difficulty = 'normal', personality = 'balanced' }: AIProps) => {
    // [修改] 将 playerBench 加入 Ref
    const stateRef = useRef({ game, enemyHand, enemyBench, playerBench, combatField });
    // [新增] 法术冷却标记：刚打出法术后跳过一轮判断，防止 async commitSpell 期间重复施法
    const spellCooldownRef = useRef(false);
    // [2026-08-06] 解析最终生效的 AI 参数（难度 × 性格）
    const aiConfig: AIDifficultyConfig = resolveAIConfig(difficulty, personality);
    const aiConfigRef = useRef(aiConfig);
    aiConfigRef.current = aiConfig;

    // 实时更新 Ref
    useEffect(() => {
        stateRef.current = { game, enemyHand, enemyBench, playerBench, combatField };
    }, [game, enemyHand, enemyBench, playerBench, combatField]);

    // ============================================================
    // [2026-10-04 莉莉子 · AI 停机保护性修复] 调度基建
    //   把"唤醒"从「纯依赖驱动」改成「依赖驱动 + 独立心跳兜底」：
    //     · scheduleTick()：**至多一个在途**决策定时器（依赖变化不再重置在途计时 ⇒ 消除"依赖
    //       抖一下就把 AI 的思考重置、永远轮不到它出手"的另一种死法）
    //     · 心跳（1s，deps=[]）：只要轮到 AI 且无阻塞，就保证一定有决策定时器在跑
    //     · 停机看门狗：被阻塞超阈值 → 打现场快照（自带取证）+ 只走引擎**已有**的安全出口
    //   ⚠️ 心跳与延迟回调的闭包是**首次渲染**的那一份，所以它们只能读下面这些 ref，
    //      绝不直接读 props/state（enabledRef 每渲染刷新，拿到的是最新 actions）。
    // ============================================================
    const runDecisionRef = useRef<() => void>(() => {});
    const decideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // [2026-10-04 独立审查 #10] 不再维护 append-only 的"延迟回调数组"：两个延迟回调各由下面
    //   两个 Timer ref 自己持有句柄（卸载时逐个清），否则已触发的句柄会永久堆积在数组里。
    // 在途互斥：格挡确认 / 进攻提交（修 P7"双 confirmBlock ⇒ 优先权被翻两次"）
    const blockConfirmInFlightRef = useRef(false);
    const blockConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const commitAttackInFlightRef = useRef(false);
    const commitAttackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 停机看门狗状态
    const stallRef = useRef<{ since: number; reason: string } | null>(null);
    const stallEscapedRef = useRef(false);
    // 连续崩溃退避（防止同一处异常被心跳以 1 次/秒无限刷屏）
    const crashStreakRef = useRef(0);
    // [2026-10-04 独立审查 #6] 进展指纹 + 空转计数（心跳退避用）—— 见 progressFingerprint 注释
    const lastFingerprintRef = useRef('');
    const noProgressStreakRef = useRef(0);
    // 最新一次渲染的 props（心跳/延迟回调唯一允许读的"外部输入"）
    const enabledRef = useRef({ disabled, paused, actions, setMessage });
    enabledRef.current = { disabled, paused, actions, setMessage };

    /**
     * 排定一次决策。**幂等**：已有在途定时器就直接返回（不重置、不叠加）。
     * 只读 ref ⇒ 可以被 deps=[] 的心跳安全调用。
     */
    const scheduleTick = (delayMs: number, reason: string) => {
        if (decideTimerRef.current !== null) return;
        const en = enabledRef.current;
        if (en.disabled || en.paused) return;
        const g = stateRef.current.game;
        const block = readBlockReason(g);
        if (block) {
            if (!stallRef.current || stallRef.current.reason !== block) {
                stallRef.current = { since: Date.now(), reason: block };
                stallEscapedRef.current = false;
            }
            return;
        }
        stallRef.current = null;
        stallEscapedRef.current = false;
        if (reason !== 'heartbeat') crashStreakRef.current = 0; // 有真实进展 ⇒ 清空崩溃退避

        // [2026-10-04 独立审查 #6 修复] 心跳是"存活判据"，不是"进展判据"：两次心跳之间指纹不变
        //   ⇒ 上一次决策什么都没改（空转）⇒ 退避 + 打日志。否则会变成 1 次/秒的动作风暴，
        //   而且因为"没被阻塞"，看门狗的报警/逃生**全都不会触发**（完全隐形）。
        const fp = progressFingerprint(g);
        if (reason === 'heartbeat' && fp === lastFingerprintRef.current) {
            noProgressStreakRef.current += 1;
            if (noProgressStreakRef.current === 1 || noProgressStreakRef.current % 10 === 0) {
                console.warn(`[AI-Watchdog] 🔁 决策空转 ${noProgressStreakRef.current} 次（未被阻塞、但状态无变化），已退避`,
                    snapshotAIState(g, stateRef.current));
            }
        } else if (reason !== 'heartbeat') {
            noProgressStreakRef.current = 0;
        }
        lastFingerprintRef.current = fp;

        const delay = reason === 'heartbeat'
            ? Math.min(AI_CRASH_BACKOFF_MAX_MS, delayMs + (crashStreakRef.current + noProgressStreakRef.current) * 3000)
            : delayMs;
        decideTimerRef.current = setTimeout(() => {
            decideTimerRef.current = null;
            // [2026-10-04 独立审查 #3 修复] 暂停 / 教程禁用必须在**开火时**再挡一次：
            //   原实现里 `paused`/`disabled` 既是闸门、又靠 effect cleanup 取消在途定时器；
            //   现在定时器不再随依赖重建 ⇒ 若不在此复查，暂停**之前**排定的那次决策会在
            //   PauseOverlay 后面照常出牌 / 发起进攻 / 让过。
            const fireEn = enabledRef.current;
            if (fireEn.disabled || fireEn.paused) {
                console.log('[AI] ⏸️ 开火时已暂停/禁用，取消本次决策');
                return;
            }
            runDecisionRef.current();
        }, delay);
    };

    // 决策体：每渲染刷新引用 ⇒ tick 执行时用的是**最新**的 actions / setMessage
    //（原实现把 actions 闭在"排定那一刻"的渲染里、1.5s 后才用 ⇒ 陈旧闭包写绝对法力值会吞掉新涨的法力）
    runDecisionRef.current = () => {
        // 开火前用**同一份**判据复查，消除"排定时快照 vs 开火时真值"的不对称
        const preG = stateRef.current.game;
        const preBlock = readBlockReason(preG);
        if (preBlock) {
            console.log(`[AI] ⏸️ 开火前复查发现阻塞（${preBlock}），本轮取消`);
            return;
        }
        // [2026-10-05] 法术冷却标记只在主阶段被消费；若这次唤醒落在别的阶段，必须就地清掉，
        //   否则它会跨回合存活，静默吞掉下一回合的第一次法术评估。
        if (preG.phase !== 'main') spellCooldownRef.current = false;
        try { // [try-catch 保护] 见下方 catch：原「崩溃就让过」是一张假保险
            const freshState = stateRef.current;
            const { game: g, enemyHand: hand, enemyBench: bench, combatField: field } = freshState;

            console.log(`[AI] ⏰ 行动 tick — phase=${g.phase} turnOwner=${g.turnOwner} hand=${hand.length} bench=${bench.length} mana=${g.enemyMana}`);

            if (!actions || !setMessage) return;
            if (g.gameResult) return; // [新增] 游戏已结束，AI 停止行动
            if (g.turnOwner !== 'enemy') return;
            if (g.spellCasting?.step === 'choose_mode') return;       // [2026-07-20] 二次守卫：AI 命运抉择中
            if (g.calibratePending) return;                            // [2026-10-03] 二次守卫：任一方校准中（原只认 enemy）

            // ============================================================
            // [2026-09-27 莉莉子] AI 反制响应（NEGATE）—— 程授权「最小侵入」档
            //
            // 背景：改动前 AI 在任何「法术栈非空」的时刻一律让过（下方两处硬编码 passTurn），
            //   于是 cards.ts 里三张反制牌（抵抗/抗拒/拒绝）的 ai 配置**永远不会被评估**
            //   —— 配了等于没配（死配置）。
            //
            // 口径（刻意收窄）：**只在**手牌里确实有 NEGATE 法术、且 evaluate 判定值得打时才出手。
            //   其余一切情形与改动前逐字一致（原样落到后面的让过分支），不改变任何既有 AI 行为。
            //   反制目标由 aiSpellStrategies 的 evaluateNEGATE 给出（栈上法术，含速度/费用白名单）。
            //
            // ⚠️ 调用点仅两处：格挡后响应阶段、主阶段「栈上有待结算法术」——正是改动前让过的两处。
            // ============================================================
            const tryRespondWithNegate = (): boolean => {
                const negates = hand.filter(c =>
                    c && c.type && c.type.includes('spell')
                    && c.ai?.pattern === 'NEGATE'
                    && canAffordCard(c, g.enemyMana, g.enemySpellMana, bench, 'enemy'));
                if (negates.length === 0) return false; // 没带反制牌 ⇒ 完全不介入

                const scored = negates
                    .map(spell => {
                        try {
                            const { playerBench: pBench } = stateRef.current;
                            const result = evaluate(spell, g, bench, pBench, hand, {
                                conservation: aiConfigRef.current.conservation,
                                mistakeRate: aiConfigRef.current.mistakeRate,
                                planningDepth: aiConfigRef.current.planningDepth,
                            });
                            return {
                                spell,
                                result,
                                score: result.shouldPlay ? result.score + (spell.ai?.priority ?? 0) * 5 : 0,
                            };
                        } catch (err) {
                            console.error(`[AI-NEGATE] ❌ ${spell.key} evaluate 抛出异常:`, err);
                            return { spell, result: { shouldPlay: false, score: 0, debug: `异常: ${err}` }, score: 0 };
                        }
                    })
                    .filter(e => e.result.shouldPlay)
                    .sort((a, b) => b.score - a.score);

                if (scored.length === 0) return false;

                const best = scored[0];
                console.log(`[AI-NEGATE] ⚡ 响应法术栈：${best.spell.key}(${best.spell.name}) targets=`, best.result.targets, `debug="${best.result.debug}"`);
                setMessage(`敌方反制：${best.spell.name}`);
                try {
                    actions.playCard(best.spell, 'enemy', best.result.targets);
                    spellCooldownRef.current = true; // 与主阶段施法同款冷却：跳过下一轮，等 commitSpell 结算完
                } catch (err) {
                    console.error('[AI-NEGATE] ❌ playCard 抛出异常:', err);
                    return false; // 出牌失败 ⇒ 退回原行为（让过）
                }
                return true;
            };

            // --- 阶段 A: 防守/格挡阶段 (Block Phase) ---
            if (g.phase === 'block_declare') {
                console.log(`[AI] 🛡️ 进入格挡阶段 — field=${field.length} bench=${bench.length}`);
                // [2026-10-04 莉莉子] 幂等守卫：本分支**不幂等** —— 重入会把格挡者重新分配一遍、
                //   再消耗一次备战席（覆盖已有 blocker + 多扣单位），并排出第二个 confirmBlock。
                //   而 confirmBlock 每次都会翻 turnOwner（useGameState.ts:2014-2021）⇒ 翻两次 = 白翻。
                if (blockConfirmInFlightRef.current) {
                    console.log('[AI] 🛡️ 格挡确认已在途，跳过重复决策（防优先权被翻两次）');
                    return;
                }
                // 🛡️ [修复] 检查进攻方归属——如果战场上是敌方在进攻，说明是敌方的进攻回合，AI 不应该格挡！
                const isPlayerAttacking = field.some(f => f.attacker && f.owner === 'player');
                if (!isPlayerAttacking) {
                    setMessage('敌方无须格挡，确认防线。');
                    // [2026-10-04 独立审查 #8 修复] 这条路径原来**完全没有在途标记**：
                    //   confirmBlock 每次都会翻 turnOwner（useGameState.ts:2014-2021），重复调用 = 白翻。
                    //   同步调用 ⇒ 成功/失败都立刻释放（失败时若尚未写 state，重试是安全的）。
                    if (blockConfirmInFlightRef.current) return;
                    blockConfirmInFlightRef.current = true;
                    try {
                        actions.confirmBlock(); // 强制推进到响应阶段，绝不能调用 passTurn
                    } finally {
                        blockConfirmInFlightRef.current = false;
                    }
                    return;
                }

                setMessage("敌方正在思考格挡...");
                // [2026-10-25 批次2] 此处原有一句 `const cfg = aiConfigRef.current;`：
                //   它的唯一消费者是 `cfg.threatAwareness`（致命兜底的布尔闸门），
                //   而该闸门已随「致命保护提为全档位底线」被移除 ⇒ 变量一并删除。

                // 1. 获取所有待分配的阻挡者 (复制一份备战席)
                let availableBlockers = bench.filter((c: CardData) => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
                // 2. 创建新的战场状态 (复制一份当前战场)
                const newCombatField = field.map(f => ({ ...f }));
                // 3. 玩家备战席 (用于判断威胁? 这里主要是处理 field 里的 attacker)

                // [2026-08-06 莉莉子 格挡增强] 致命伤害预防（原 `lethalThreat` 一次性快照）。
                // [2026-10-25 批次2 · 独立审查 #3] 攻力一律走「战斗中的真实值」：
                //   【无法攻击】在引擎里按 0 结算（`keywords.ts:331-333`），
                //   按面板算会高估威胁 —— 把垫刀全浪费在 0 伤害的进攻者身上。
                // [2026-10-25 批次2 · 二轮审查 N2] **原 `lethalThreat` 快照已删除**：
                //   「本回合是否致命」改由循环内的 `lethalNow = leakDmg() >= g.enemyNexus` 逐战线重算。
                //   在第一条战线上它就等于"全放行总伤"（与原口径一致），但它会随前面的战线被挡住而下降，
                //   因此不会像快照那样把整条备战席垫光。
                const atkPowerForBlock = (atk: CardData) =>
                    atk.keywords.includes('CantAttack') ? 0 : getPower(atk);
                // [2026-10-25 批次2] `threatAwareness` **自此不再参与格挡**：
                //   它原本只控制那条致命兜底，而致命保护现在是**全档位底线**（见下方「致命兜底」）。
                //   该参数在格挡链上已无消费者，别再拿它当难度依据。

                // ============================================================
                // [2026-10-25 莉莉子 · 批次2] normal 及以上：威胁排序 + 动态交换阈值
                //
                // 病根：本阶段原本直接 `forEach(newCombatField)` ⇒ 唯一的阻挡者被派给
                //   **数组里的第一个攻击者**，而数组顺序 = 玩家把单位拖进战场的 append 顺序
                //   （`useGameState.ts:5888`）⇒ 玩家调一下拖拽顺序就能让 AI 少挡一截伤害。
                //   例：15 攻里芙 + 16 攻芬妮(碾压) 打一个 1/1 —— AI 挡「先拖进来的那个」，
                //   先拖里芙则脸伤 16，先拖芬妮则脸伤 30（1/1 只吸 1 点，溢出 15 照打）。
                //
                // 修法：先算每个攻击者「挡住它能救回多少水晶伤害」，按此降序处理。
                //   排序只是**处理顺序**，`setCombatField` 仍用原数组 ⇒ 战线显示顺序不变。
                // ============================================================
                const caps = aiConfigRef.current.capabilities;

                // ⚠️ [2026-10-25 批次2 · 二轮审查 N8] **easy 档的"零回归"边界，写清楚免得后人误会**：
                //   easy 保留（与改动前逐字一致）：处理顺序＝战线数组顺序、牺牲闸门恒 2 倍、
                //   碾压不比较、不补漏。
                //   但下列**跨档位共享**的修复会一并影响 easy —— 这是刻意的，它们都是口径错：
                //     · 【屏障】排除 depletedKeywords（C5）
                //     · 【先攻/连击】下的"能换"判定（C6）
                //     · 攻力一律走真实值（【无法攻击】按 0）
                //     · 致命兜底对全档生效（C7，原为死代码）
                //   另有两处**已知未修**的旧欠债（非本次引入，为免扩大范围先记账）：
                //     · 【连击】第二击的二次反击未建模 ⇒ 会少算"其实能换掉连击手"的 trader
                //     · `canSurvive` 对「屏障 + 连击」恒判为能活（屏障只吸一击，第二击照打）

                /** 【屏障】是否还在 —— 必须排除 depletedKeywords（口径见引擎 `keywords.ts:366-369`） */
                const hasActiveBarrier = (b: CardData) =>
                    b.keywords.includes('Barrier') && !(b.depletedKeywords || []).includes('Barrier');
                /** 面板血量（坚韧＝+1），用于排序比较，绝不能参与减法型运算（屏障会算出 Infinity） */
                const rawHp = (b: CardData) => getHealth(b) + (b.keywords.includes('Tough') ? 1 : 0);
                /** 有效血量：屏障＝吸收一次（视为无穷），坚韧＝+1 */
                const effectiveHp = (b: CardData) =>
                    hasActiveBarrier(b) ? Number.POSITIVE_INFINITY : rawHp(b);
                /** 对位规则（无法格挡 / 隐秘 / 凶恶）——
                 *  [2026-10-26 莉莉子] 已抽到 `logic/blockRules.canBlockAttacker`，那是**全项目唯一门卫**
                 *  （玩家侧点击、玩家侧拖拽、玩家侧战场内挪位、AI 侧全部共用同一份判据）。
                 *  此处不再保留副本：当初写下这行"避免两套判据分叉"的注释时，
                 *  玩家侧的战场内挪位其实还没有判据 —— 副本留得越多，补漏就越会漏。 */
                /**
                 * 「挡住它能救回多少水晶伤害」—— 排序与碾压比较共用同一本账：
                 *   · 普通攻击者：伤害全落在阻挡者身上、水晶伤害归零 ⇒ 减伤 = 攻击力（全额）
                 *   · 【碾压】：溢出照打 ⇒ 减伤 = min(攻击力, 阻挡者的有效血)
                 *   ⇒ 这就是「派小单位去挡碾压很亏」的算术来源：
                 *     1/1 去挡 16 攻碾压只救回 1 点，还白死一个单位（引擎公式 `keywords.ts:387-389`）。
                 */
                const potentialSave = (atk: CardData, poolHp: number) => {
                    if (poolHp <= 0) return 0; // 无人可挡 ⇒ 派不出人，救不了
                    const p = atkPowerForBlock(atk);
                    return atk.keywords.includes('Overwhelm') ? Math.min(p, poolHp) : p;
                };
                /** 某攻击者从我方当前池子里能拿到的最大有效血 */
                const bestPoolHp = (atk: CardData) => {
                    const pool = availableBlockers.filter(b => canBlockAttacker(b, atk));
                    if (pool.length === 0) return 0;
                    return Math.max(...pool.map(effectiveHp));
                };

                /**
                 * 「这条战线当前还会漏多少水晶伤害」—— 与引擎 `keywords.ts:387-389` 同源：
                 *   · 没被挡住 ⇒ 全额打脸
                 *   · 被普通攻击者挡住 ⇒ 0
                 *   · 被挡住但攻击者【碾压】⇒ 溢出 `max(0, 攻击力 − 阻挡者有效血)`
                 * [2026-10-25 批次2 · 二轮审查 N1] 旧实现把「有 blocker」直接当 0，对碾压完美失明：
                 *   例：水晶 5、对面一个 10/10【碾压】、我方 1/1 挡上去 —— 引擎算的是
                 *   `5 − (10 − 1)` 直接死，而校验环节报「漏 0，安全」。
                 *   这恰恰是 hard「算完再验」最该生效的场面。
                 */
                const leakOf = (f: any): number => {
                    if (!f?.attacker || f.owner !== 'player') return 0;
                    const p = atkPowerForBlock(f.attacker);
                    if (!f.blocker) return p;
                    if (!f.attacker.keywords.includes('Overwhelm')) return 0;
                    const absorb = hasActiveBarrier(f.blocker) ? p : rawHp(f.blocker);
                    return Math.max(0, p - absorb);
                };
                const leakDmg = () => newCombatField.reduce((s: number, f: any) => s + leakOf(f), 0);

                // [2026-10-25 批次2 · 二轮审查 N3] 已处理过的战线 id：
                //   `betterElsewhere` 只允许把单位「留给还没轮到的那条」，
                //   不许认领一条已经跑完、并主动放弃了的战线（那等于凭空放行）。
                const processedIds = new Set<string>();

                // 按「减伤潜力」降序处理（关掉能力的档位保持原顺序 = 战场顺序）
                const orderedFights = caps.sortAttackers
                    ? [...newCombatField].sort((fa, fb) => {
                        // [2026-10-25 批次2 · 独立审查 #4] 比较器必须反对称：
                        //   两条空战线互相比较若都返回 1，TimSort 下相对顺序未定义。
                        if (!fa.attacker && !fb.attacker) return 0;
                        if (!fa.attacker) return 1;
                        if (!fb.attacker) return -1;
                        return potentialSave(fb.attacker, bestPoolHp(fb.attacker))
                            - potentialSave(fa.attacker, bestPoolHp(fa.attacker));
                    })
                    : newCombatField;

                // 遍历每一个战斗槽位进行决策
                orderedFights.forEach((fight) => {
                    const attacker = fight.attacker;
                    if (!attacker) return;
                    if (fight.isChallenged) return;
                    // [2026-10-25 批次2 · 独立审查 #3] 只处理**玩家战线**：格挡是防守行为，
                    //   不该给 AI 自己的进攻战线下判断（`owner` 语义见 `useGameState.ts:5888`）。
                    if (fight.owner !== 'player') return;
                    // [2026-10-25 批次2] 已有 blocker 的战线不重复分配（防重复扣备战席，属改动前的欠债）
                    if (fight.blocker) return;

                    processedIds.add(attacker.id); // 视为"已轮到"（无论后面是否选得出人）
                    // [2026-10-25 批次2 · 二轮审查 N2] 「致命」必须在**每条战线**上重算：
                    //   `lethalThreat` 是循环外的一次性快照，永远不知道"前面挡掉几条之后已经不致命"
                    //   ⇒ 会把整条备战席垫光（例：水晶 10、对面三条 4/6、我方三个 1/3，旧口径三条全垫；
                    //   最优只挡一条，剩余 8 < 10）。
                    const lethalNow = leakDmg() >= g.enemyNexus;
                    // 交换阈值（牺牲闸门的系数）：水晶越少越愿意「亏着换」；当前仍致命 ⇒ 压到最低档。
                    // ⚠️ 关掉 `dynamicTradeDiff` 的档位恒为 2（easy 保持原口径），但**致命兜底仍对全档生效**。
                    const tradeRatio = caps.dynamicTradeDiff
                        ? (lethalNow ? 0.5 : Math.max(0.5, Math.min(2, g.enemyNexus / 10)))
                        : 2;

                    // 筛选出所有能阻挡该单位的候选人（对位规则统一走 `canBlockAttacker`，避免分叉）
                    const validBlockers = availableBlockers.filter(b => canBlockAttacker(b, attacker));

                    if (validBlockers.length === 0) return; // 无人可挡

                    let chosenBlocker: CardData | null = null;
                    // [2026-10-25 批次2] 本战线的「真实攻力」（【无法攻击】按 0，与引擎同口径）——
                    //   后续所有"我能不能扛住 / 能不能换掉"的判据统一吃这一个值，避免多套口径。
                    const atkPower = atkPowerForBlock(attacker);

                    // [2026-07-09] 格挡关键词辅助函数
                    // [2026-10-25 批次2] `hasActiveBarrier` 已上移到循环外（排序与碾压比较也要用），此处不再重复定义。
                    const canSurvive = (b: CardData, atkPower: number) => {
                        if (hasActiveBarrier(b)) return true;
                        const hp = getHealth(b) + (b.keywords.includes('Tough') ? 1 : 0); // [2026-08-29] 真实面板
                        return hp > atkPower;
                    };
                    // [2026-10-25 莉莉子 · 批次0 口径修复] 「能换掉对手」必须感知【先攻 / 连击】：
                    //   ── 引擎侧：先攻且击杀阻挡者时 `attackerDamage = 0`（`keywords.ts:393-404`）
                    //      ⇒ 阻挡者根本挥不出反击；而【连击】第一击同样强制带先攻（`combat.ts:163`）。
                    //   ── 旧实现只比「我的攻 ≥ 你的血」⇒ 把"单方面送死"算成"换子"，
                    //      于是 sacrifice 分支会误把单位派上去白给。
                    //   ── 【反伤】不随反击失效：Thorns 由"阻挡者是否真的受伤"触发
                    //      （`keywords.ts:442`），与被先攻打断反击无关，故独立累加。
                    const canKillAtk = (b: CardData, attacker: CardData) => {
                        const firstStrikes = attacker.keywords.includes('QuickAttack')
                            || attacker.keywords.includes('Double Attack');
                        // [2026-10-25 批次2 · 独立审查 #6] 用「真正落到我身上的伤害」同时算两件事：
                        //   ① 我是否被先攻一击打死（死则挥不出反击）；
                        //   ② 【反伤】是否触发 —— 引擎按 `blockerDamage > 0` 判（`keywords.ts:440-443`），
                        //      屏障把伤害清零时反伤**不会**触发；旧实现无条件 +1 会误判"能换掉"。
                        //   攻击力取 `atkPowerForBlock`（【无法攻击】按 0），与引擎归零口径一致。
                        const incoming = hasActiveBarrier(b)
                            ? 0
                            : Math.max(0, atkPowerForBlock(attacker) - (b.keywords.includes('Tough') ? 1 : 0));
                        // 守方同样按引擎归零（`keywords.ts:351-353`）：备战席上的【无法攻击】单位
                        // 面板攻力已被还原成真值，若不归零会把它判成"能换掉高血攻击者"，进场后引擎给 0 反击。
                        let counterPower = b.keywords.includes('CantAttack') ? 0 : getPower(b);
                        if (firstStrikes && getHealth(b) <= incoming) counterPower = 0; // 被先攻打死 ⇒ 无反击
                        const thorns = (b.keywords.includes('Thorns') && incoming > 0) ? 1 : 0;
                        return counterPower + thorns >= getHealth(attacker);
                    };

                    // --- 决策逻辑 1: 应对碾压 (Overwhelm) ---
                    // 规则: 如果玩家派出高攻碾压，而场上没有生命值比该攻击力更高的单位，派出生命值最高的单位尽可能减伤
                    const hasOverwhelm = attacker.keywords.includes('Overwhelm');

                    if (hasOverwhelm) {
                        // 1. 屏障 blocker? 完美吸收，最优先派出
                        const barrierBlockers = validBlockers.filter(hasActiveBarrier); // [2026-10-25 批次0] 排除已弹掉的屏障
                        if (barrierBlockers.length > 0) {
                            chosenBlocker = barrierBlockers.sort((a, b) => a.cost - b.cost)[0];
                        } else {
                            // 尝试找能完美扛住的 (有效HP > Atk)
                            const survivors = validBlockers.filter(b => canSurvive(b, atkPower));
                            if (survivors.length > 0) {
                                chosenBlocker = survivors.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 没人能抗住，选有效血量最高的当肉盾 (考虑坚韧)
                                const shield = validBlockers.sort((a, b) => rawHp(b) - rawHp(a))[0];
                                // [2026-10-25 批次2] 碾压比较：派一个扛不住的单位去挡【碾压】，
                                //   只救回 min(攻击力, 它的血) —— 溢出照打、还白死一个单位。
                                //   若同一个单位留给「另一个普通攻击者」能救回更多，就让它过去。
                                const saveHere = shield ? potentialSave(attacker, effectiveHp(shield)) : 0;
                                // [2026-10-25 批次2 · 独立审查 #1 修复] 必须排除**已经派到阻挡者**的战线：
                                //   否则会把"更值得"判给一条早已分完人的战线 —— 那个 blocker 已经不在池子里，
                                //   结果碾压战线整段放行、单位闲置，比改动前净亏（可推演的回归路径）。
                                const betterElsewhere = !!shield && caps.compareTrampleOpt && orderedFights.some(f => {
                                    const other = f.attacker;
                                    if (!other || other.id === attacker.id || f.isChallenged) return false;
                                    if (f.owner !== 'player') return false; // 只看玩家战线
                                    if (f.blocker) return false;            // 已分完人 ⇒ 不能算作"留给它"
                                    if (processedIds.has(other.id)) return false; // 已跑完并放弃 ⇒ 更问不着它
                                    if (!canBlockAttacker(shield, other)) return false;
                                    return potentialSave(other, effectiveHp(shield)) > saveHere;
                                });
                                if (shield && !betterElsewhere) chosenBlocker = shield;
                            }
                        }
                    }
                    // --- 决策逻辑 2: 智能止损逻辑 (Smart Mitigation) ---
                    else {
                        // 策略A: 完美白吃 (我活，敌死) - 最优解
                        // [2026-10-25 批次0] canKillAtk 改收 attacker 本体（需要先攻/连击信息）
                        const perfectKillers = validBlockers.filter(b =>
                            canSurvive(b, atkPower) && canKillAtk(b, attacker)
                        );

                        // 策略B: 免费格挡 (我活，敌不死) - 拖延/蹭血
                        const survivors = validBlockers.filter(b => canSurvive(b, atkPower));

                        // 策略C: 牺牲格挡 (我死) - 包含互换(Trade)和填旋(Chump Block)
                        // [关键修改] 只有满足特定价值公式，AI 才愿意牺牲单位
                        const sacrificeCandidates = validBlockers.filter(b => {
                            // 能活就不算牺牲
                            if (canSurvive(b, atkPower)) return false;
                            // [2026-07-09] 幻象(Ephemeral)：回合结束必死，无脑填入
                            if (b.keywords.includes('Ephemeral')) return true;
                            // 斩杀保护：如果不挡水晶就炸了
                            if (g.enemyNexus <= atkPower) return true;
                            // 价值公式：挽回的水晶伤害 >= tradeRatio × 损失的单位生命值
                            //   [2026-10-25 批次2] 系数随水晶血量浮动（本回合致命时压到 0.5），
                            //   即「致命保护前置」—— 血少时愿意亏着换，血厚时才惜命。
                            //   关掉动态阈值（easy）时恒为 2，与该档改动前逐字一致。
                            if (atkPower >= tradeRatio * getHealth(b)) return true;
                            return false;
                        });

                        // --- 优先级执行 ---
                        if (perfectKillers.length > 0) {
                            // 1. 能白吃，优先让再生单位去 (反正下回合回满)
                            chosenBlocker = perfectKillers.sort((a, b) => {
                                const aRegen = a.keywords.includes('Regeneration') ? -1 : 0;
                                const bRegen = b.keywords.includes('Regeneration') ? -1 : 0;
                                return (a.cost - b.cost) || (aRegen - bRegen);
                            })[0];
                        } else if (survivors.length > 0) {
                            // 2. 能存活，同理优先再生
                            chosenBlocker = survivors.sort((a, b) => {
                                const aRegen = a.keywords.includes('Regeneration') ? -1 : 0;
                                const bRegen = b.keywords.includes('Regeneration') ? -1 : 0;
                                return (a.cost - b.cost) || (aRegen - bRegen);
                            })[0];
                        } else if (sacrificeCandidates.length > 0) {
                            // 3. 必须牺牲时，在“愿意牺牲”的名单里挑
                            // 优先选能换掉对手的 (Traders)
                            // [2026-10-25 批次0] canKillAtk 改收 attacker 本体（需要先攻/连击信息）
                            const traders = sacrificeCandidates.filter(b => canKillAtk(b, attacker));

                            if (traders.length > 0) {
                                // 能换掉对手，选最便宜的
                                chosenBlocker = traders.sort((a, b) => a.cost - b.cost)[0];
                            } else {
                                // 换不掉对手 (纯填旋)，选最便宜且血最少的 (止损)
                                chosenBlocker = sacrificeCandidates.sort((a, b) => a.cost - b.cost || getHealth(a) - getHealth(b))[0];
                            }
                        }
                        // 4. 致命兜底 —— **全档位底线**（easy 同样生效）
                        // [2026-10-25 批次2 · 独立审查 #2 修复] 旧实现从 `sacrificeCandidates` 里取人，
                        //   而走到这里的**前提**正是「白吃 / 存活 / 牺牲三个集合全空」
                        //   ⇒ `lastResort` 恒为 undefined，这条兜底自 2026-08-06 起就是**死代码**，
                        //   三档难度从没真正生效过（Dan Felder 点名的「该挡致命却不挡」正是这类）。
                        //   现改为直接从**全部合法候选**里挑「最不心疼」的强制填旋。
                        //   判据用 `lethalNow`（逐战线重算的剩余漏伤），不是循环外的快照。
                        if (!chosenBlocker && lethalNow) {
                            const lastResort = [...validBlockers].sort(
                                (a, b) => a.cost - b.cost || rawHp(a) - rawHp(b))[0];
                            if (lastResort) chosenBlocker = lastResort;
                        }
                        // 否则不格挡，脸接伤害
                    }

                    // 如果选中了阻挡者
                    if (chosenBlocker) {
                        fight.blocker = chosenBlocker;
                        // 从可用列表中移除，防止一人挡多路
                        availableBlockers = availableBlockers.filter(b => b.id !== chosenBlocker!.id);
                    }
                });

                // ============================================================
                // [2026-10-25 莉莉子 · 批次3] hard 专属：**结果校验 + 补漏**
                //
                // 参考 Forge `AiBlockController` 的「算完再验、不合格重排」三档回路
                // （`assignBlockers` 的 == 1./2./3. == 段）。但那边是**清空全部格挡重来**，
                // 我们改成**只补漏**：第一轮的 trade / 白吃通常是好配置，清空会把它们一起丢掉。
                // [2026-10-25 批次2 · 二轮审查 N1] 校验判据改用 `leakDmg()`（**含【碾压】溢出**，
                //   与引擎 `keywords.ts:387-389` 同源）。原文"与 lethalThreat 同口径"是错的：
                //   `lethalThreat` 算的是"全不挡"，这里要算的是"已挡了一部分之后还漏多少"。
                // ============================================================
                // [2026-10-25 批次2 · 独立审查 #3/#7 修复]
                //   ① 只统计**玩家战线**、且用战斗中的真实攻力（【无法攻击】按 0）——
                //      否则一个 0 伤害进攻者会让补漏把整条备战席逐个垫光（`break` 永不满足）；
                //   ② 水晶 ≤ 0 直接跳过：此时 `leakDmg() < g.enemyNexus` 恒假，循环会退化成
                //      「每条未挡战线都送一个最便宜的」，备战席一次性清空。
                // [2026-10-25 批次2 · 二轮审查 N7] 只补**有伤害**的未挡战线：否则会给
                //   【无法攻击】的战线垫人，真漏点一点没降，`rescued` 却照涨、日志谎报"已填挡"。
                if (caps.reassignOnLethal && g.enemyNexus > 0) {
                    if (leakDmg() >= g.enemyNexus) {
                        const unblocked = newCombatField
                            .filter(f => f.attacker && f.owner === 'player' && !f.blocker && !f.isChallenged
                                && atkPowerForBlock(f.attacker) > 0)
                            .sort((a, b) => atkPowerForBlock(b.attacker) - atkPowerForBlock(a.attacker));
                        let rescued = 0;
                        for (const fight of unblocked) {
                            if (leakDmg() < g.enemyNexus) break; // 已经不漏了，剩下的不必再送
                            const pool = availableBlockers.filter(b => canBlockAttacker(b, fight.attacker));
                            if (pool.length === 0) continue;
                            // 能拦下又不死的先派（不白亏），否则拿最便宜的垫
                            const survivor = pool
                                .filter(b => effectiveHp(b) > atkPowerForBlock(fight.attacker))
                                .sort((a, b) => a.cost - b.cost)[0];
                            const pick = survivor ?? [...pool].sort((a, b) => a.cost - b.cost || rawHp(a) - rawHp(b))[0];
                            if (!pick) continue;
                            fight.blocker = pick;
                            availableBlockers = availableBlockers.filter(b => b.id !== pick.id);
                            rescued += 1;
                        }
                        if (rescued > 0) {
                            console.log(
                                `[AI] 🧮 hard 补漏：格挡后仍有 ${leakDmg()} 点打脸（水晶 ${g.enemyNexus}），` +
                                `已额外填挡 ${rescued} 个 — 剩余备战席 ${availableBlockers.length}`);
                        }
                    }
                }

                // 应用格挡结果
                if (actions.setCombatField && actions.setEnemyBench) {
                    actions.setEnemyBench(availableBlockers); // 剩下的回备战席
                    actions.setCombatField(newCombatField);

                    // 稍微延迟一下确认，展示格挡意图
                    // [2026-10-04 莉莉子] 原为**裸 setTimeout**：不在 effect cleanup 里（暂停/卸载都拦不住），
                    //   且没有在途互斥 ⇒ 500ms 内有依赖变化会再进一次本分支、排出第二个 confirmBlock。
                    //   现：句柄挂 `blockConfirmTimerRef`（卸载统一清理）+ 在途标记（配合上方幂等守卫）。
                    blockConfirmInFlightRef.current = true;
                    const confirmTimer = setTimeout(() => {
                        blockConfirmTimerRef.current = null;
                        try {
                            actions.confirmBlock(); // [核心修复] 调用 confirmBlock，切入 react_to_block 阶段
                            // [2026-10-04 独立审查 #8 修复] **成功之后**才解除在途标记。
                            //   抛错时保持 true，交给心跳的"自愈"（定时器句柄已为 null ⇒ ≤1s 后复位）接手；
                            //   若在这里先解除，抛错会立刻让下一个 tick 重入本分支，
                            //   把已有 blocker 重新分配一遍、再多扣一次备战席（正是上面注释说的那种损坏）。
                            blockConfirmInFlightRef.current = false;
                        } catch (e) {
                            console.error('[AI] confirmBlock 抛出异常（格挡确认未完成）:', e);
                        }
                    }, 500);
                    blockConfirmTimerRef.current = confirmTimer;
                }
                return;
            }
            // --- 阶段 A.5: 格挡后响应阶段 (React to Block Phase) ---
            if (g.phase === 'react_to_block') {
                // [2026-09-27 莉莉子] 先看手牌里有没有反制牌值得打；没有则与改动前完全一致地让过
                if (tryRespondWithNegate()) return;
                console.log(`[AI] ⏭️ 格挡后响应阶段，不响应 (手牌中法术将在主阶段打出)`);
                setMessage("敌方让过（不响应格挡）。");
                // 因为目前 AI 还没有被教导如何在战斗中打出法术，所以直接交还优先权/确认物理结算
                actions.passTurn();
                return;
            }
            // --- 阶段 B: 进攻确认 (Attack Declare) ---
            if (g.phase === 'attack_declare') {
                console.log(`[AI] ✅ 进攻确认阶段 — commitAttack`);
                // AI 已经发起进攻，现在是确认阶段 (通常由 initiateAttack 后的逻辑触发)
                actions.commitAttack();
                return;
            }

            // --- 阶段 C: 主阶段 (Main Phase) ---
            if (g.phase === 'main') {
                console.log(`[AI] ==== AI 主阶段开始 ==== round=${g.round} mana=${g.enemyMana}/${g.enemySpellMana} bench=${bench.length}/${g.enemyNexus}hp hand=${hand.length} tok=${g.attackToken.enemy}`);
                // 1. 处理法术堆叠 (目前逻辑：如果有法术，直接让过/结算)
                if (g.spellStack.length > 0) {
                    // [2026-09-27 莉莉子] 响应窗口：先评估反制牌；没有可打的仍按原逻辑让过
                    if (tryRespondWithNegate()) return;
                    console.log(`[AI] 📚 法术堆叠有 ${g.spellStack.length} 个待结算 — 让过`);
                    setMessage("敌方让过（结算法术）。");
                    actions.passTurn();
                    return;
                }

                // ==========================================
                // [重构] AI 法术决策 — 数据驱动模式 (Pattern Engine)
                // 不再为每张法术硬编码 if-else，改为根据 spell.ai 配置
                // 路由到 aiSpellStrategies.ts 中的对应 Handler
                // ==========================================

                // [新增] 法术冷却：刚打出法术后跳过一轮，等 async commitSpell 结算完再重新判断
                const onCooldown = spellCooldownRef.current;
                spellCooldownRef.current = false;

                let castedSpell = false;

                // [已恢复] AI 法术决策 — 数据驱动模式 (Pattern Engine)
                if (!onCooldown) {
                    // ============================================
                    // 🎯 [LOG] 进入法术评估
                    // ============================================
                    console.log(`[AI-SPELL] ====== 开始法术评估 ====== state.phase=${g.phase} cooldown=${onCooldown}`);
                    console.log(`[AI-SPELL] 手牌数=${hand.length} 法力=${g.enemyMana}/${g.enemySpellMana} 敌方水晶=${g.playerNexus}`);

                    // 遍历手牌中的所有法术，按优先级评分选出最佳选择
                    const playableSpells = hand.filter(c => c && c.type.includes('spell') && canAffordCard(c, g.enemyMana, g.enemySpellMana, bench, 'enemy'));
                    console.log(`[AI-SPELL] 可打出法术数=${playableSpells.length}`, playableSpells.map(s => `${s.key}(${s.name})`));

                    // 用策略引擎评估所有可打出的法术，选评分最高的
                    const evaluated = playableSpells
                        .map(spell => {
                            // ⚠️ 每个法术独立 try-catch，一个挂了不影响其他
                            try {
                                const { playerBench: pBench } = stateRef.current;
                                const result = evaluate(spell, g, bench, pBench, hand, {
                                    conservation: aiConfigRef.current.conservation,
                                    mistakeRate: aiConfigRef.current.mistakeRate,
                                    planningDepth: aiConfigRef.current.planningDepth,
                                });
                                const adjustedScore = result.shouldPlay ? (result.score + (spell.ai?.priority ?? 0) * 5) : 0;
                                console.log(`[AI-SPELL]   🔍 ${spell.key}(${spell.name}) → shouldPlay=${result.shouldPlay} score=${adjustedScore} debug="${result.debug}" targets=`, result.targets);
                                return { spell, result, adjustedScore };
                            } catch (err) {
                                console.error(`[AI-SPELL]   ❌ ${spell.key}(${spell.name}) evaluate 抛出异常:`, err);
                                return { spell, result: { shouldPlay: false, score: 0, debug: `异常: ${err}` }, adjustedScore: 0 };
                            }
                        })
                        .filter(entry => entry.result.shouldPlay)
                        .sort((a, b) => b.adjustedScore - a.adjustedScore);

                    console.log(`[AI-SPELL] 筛选后候选法术数=${evaluated.length}`, evaluated.map(e => `${e.spell.key}(${e.adjustedScore}分)`));

                    if (evaluated.length > 0) {
                        const best = evaluated[0];
                        console.log(`[AI-SPELL] ✅ 选中: ${best.spell.key}(${best.spell.name}) 目标=`, best.result.targets);
                        setMessage(`敌方打出法术：${best.spell.name}`);
                        try {
                            actions.playCard(best.spell, 'enemy', best.result.targets);
                            castedSpell = true;
                            console.log(`[AI-SPELL] ✅ playCard 调用完成`);
                        } catch (err) {
                            console.error(`[AI-SPELL] ❌ playCard 抛出异常:`, err);
                            // playCard 异常时不要卡死，让 AI 继续后续逻辑
                        }
                    } else {
                        console.log(`[AI-SPELL] ⏭️ 无可用的法术，继续后续逻辑`);
                    }

                    if (castedSpell) {
                        console.log(`[AI-SPELL] 🚀 已打出法术，设置 cooldown，提前 return`);
                        spellCooldownRef.current = true; // 冷却标记：下一轮跳过法术判断
                        return;
                    }

                } // end of cooldown check

                // 2. 尝试打出单位
                // 策略：有费就打，铺场优先
                // [2026-07-08 新增日志] 打出全手牌详情
                console.log(`[AI] 👋 全手牌详情:`, hand.map(c =>
                    `${c.key}(${c.name}) type=${c.type} cost=${c.cost} 可购买=${canAffordCard(c, g.enemyMana, g.enemySpellMana, bench, 'enemy')}`
                ));
                const playableUnit = hand.find((c: CardData) =>
                    c && c.type && c.type.includes('unit') && canAffordCard(c, g.enemyMana, g.enemySpellMana, bench, 'enemy')
                );

                if (playableUnit && bench.length < 6) {
                    console.log(`[AI] 🃏 打出单位: ${playableUnit.key}(${playableUnit.name})`);
                    setMessage(`敌方打出：${playableUnit.name}`);
                    actions.playCard(playableUnit, 'enemy');
                    return;
                }
                console.log(`[AI] ⏭️ 无单位可打 (playableUnit=${!!playableUnit} bench=${bench.length}/6)`);

                // 3. 尝试发起进攻
                if (g.attackToken.enemy && bench.length > 0) {
                    const { playerBench: pBench } = stateRef.current;
                    const cfg = aiConfigRef.current;
                    const attackers: CardData[] = [];

                    // [2026-08-06] 斩杀线检测：敌方水晶已在所有攻击者总攻击力之下 → 困难AI全力进攻
                    // 简单AI可能忽略（mistakeRate 高），难度越高越重视斩杀
                    // ═══ [2026-08-28 莉莉子 重构] 进攻决策：阻挡者容量 + 总攻收益 ═══
                    // 旧逻辑问题：逐单位问"会不会被对手白吃"（isSuicide），却忽略"对手一次只能挡几个"。
                    // 例：AI 铺 6 单位、玩家只有 1 个里芙能白吃大部分 → 旧 AI 判定 5 个都是"自杀"不敢上，
                    // 实际里芙只能挡 1 路，其余 4 个会穿过去打脸 → 观感"铺满场却只打 1 点"。
                    // 修复：① 引入阻挡者容量（超容量 = 必打脸）② 算全压净收益（脸伤 vs 损失）按 aggression 权衡。
                    // 本函数被标准对战 + 肉鸽共用（都经 GameSession → useAI），全模式生效，非肉鸽专属。
                    const playerBlockers = pBench.filter((b: CardData) =>
                        !b.isDead && !b.animState?.startsWith('dying') && !b.keywords.includes('CantBlock')
                    );
                    const capacity = playerBlockers.length; // 对手最多能合法阻挡几个

                    const sureHitUnits: CardData[] = [];  // 必打脸（无合法阻挡者，如隐秘无对应阻挡）
                    const safeUnits: CardData[] = [];     // 不会被白吃（对手挡了也不亏）
                    const doomedUnits: CardData[] = [];   // 会被白吃（受容量 + aggression 约束）

                    bench.forEach(unit => {
                        if (unit.isDead || unit.animState === 'dying' || unit.animState === 'ephemeral_dying') return;
                        if (getPower(unit) === 0) return; // [2026-08-29] 真实攻血
                        if (unit.keywords.includes('CantAttack')) return; // [CantAttack] 无法造成伤害，不派去进攻

                        // [2026-07-09] 幻象(Ephemeral) → 回合结束必死，无脑进攻
                        if (unit.keywords.includes('Ephemeral')) { attackers.push(unit); return; }

                        // 该单位的合法阻挡者 —— [2026-10-26 莉莉子] 统一走门卫，与分配侧/玩家侧同源。
                        //   ⚠️ 参数序是 (阻挡者, 攻击者)：本处 `unit` 是攻击者，`b` 是玩家阻挡者。
                        //   此前这里是隐秘/凶恶的又一套手抄副本（第 3 份），
                        //   它一旦与门卫分叉，AI 会把"其实挡得住"的当成"必打脸"，收益账全盘算错。
                        const blockers = playerBlockers.filter(b => canBlockAttacker(b, unit));
                        if (blockers.length === 0) { sureHitUnits.push(unit); return; } // 挡不住 → 必打脸

                        const isSuicide = blockers.some(b =>
                            getPower(b) >= getHealth(unit) && getHealth(b) > getPower(unit)
                        ); // [2026-08-29] 真实攻血
                        if (isSuicide) doomedUnits.push(unit);
                        else safeUnits.push(unit);
                    });

                    // —— 总攻收益账 ——
                    // 全压候选；sureHit 伤害必中；blockable（safe+doomed）按对手挡"攻击力最高 capacity 个"估损失
                    const allInUnits = [...sureHitUnits, ...safeUnits, ...doomedUnits];
                    const sureHitDmg = sureHitUnits.reduce((s, u) => s + getPower(u), 0);
                    const blockableUnits = [...safeUnits, ...doomedUnits].sort((a, b) => getPower(b) - getPower(a));
                    const blockableDmg = blockableUnits.reduce((s, u) => s + getPower(u), 0);
                    const blockedDmg = blockableUnits.slice(0, Math.min(capacity, blockableUnits.length))
                        .reduce((s, u) => s + getPower(u), 0);
                    const guaranteedFace = sureHitDmg + Math.max(0, blockableDmg - blockedDmg); // 全压时至少打这么多脸
                    const allInDamage = allInUnits.reduce((s, u) => s + getPower(u), 0);
                    const lethalAllIn = allInDamage >= g.playerNexus;
                    const lossValue = blockableUnits.slice(0, Math.min(capacity, blockableUnits.length))
                        .reduce((s, u) => s + (u.cost || 0), 0); // 被挡单位的损失价值（费用）

                    // 决策①：全压可斩杀 → 果断全压（aggression 越高越果断）
                    if (lethalAllIn && cfg.aggression >= 0.6) {
                        attackers.push(...allInUnits);
                    }
                    // 决策②：全压收益评估——脸伤价值 ≥ 被挡损失的 aggression 加权 → 值就全压。
                    //   aggression 高（困难/激进性格）越愿意为脸伤送单位；低（保守）越惜命。
                    else if (guaranteedFace >= lossValue * cfg.aggression) {
                        attackers.push(...allInUnits);
                    }
                    // 决策③：保守但带容量意识——必打脸 + 安全单位全派；doomed 里超容量部分必打脸也派；
                    //   被挡住的 doomed 按 aggression 决定（换子不亏/极端激进才送）。
                    else {
                        attackers.push(...sureHitUnits, ...safeUnits);
                        const doomedByPow = [...doomedUnits].sort((a, b) => getPower(b) - getPower(a));
                        const surplus = Math.max(0, doomedUnits.length - capacity); // 挡不完 → 必打脸
                        attackers.push(...doomedByPow.slice(0, surplus));
                        const blockedDoomed = doomedByPow.slice(surplus);
                        // 换子不亏（能拼掉对方至少一个）→ 高侵略愿意送
                        const tradeable = blockedDoomed.filter(u =>
                            pBench.some(b => getPower(b) >= getHealth(u) && getHealth(b) <= getPower(u))
                        ); // [2026-08-29] 真实攻血
                        if (cfg.aggression >= 0.7) attackers.push(...tradeable);
                        // 极端侵略（困难 + 激进性格）→ 纯送逼血也打
                        if (cfg.aggression >= 0.85) attackers.push(...blockedDoomed.filter(u => !tradeable.includes(u)));
                        // 简单 AI 失误兜底：本该缩的也随机冲 1-2 个（mistakeRate 高）
                        if (attackers.length === 0 && allInUnits.length > 0 && Math.random() < cfg.mistakeRate) {
                            attackers.push(...blockableUnits.slice(0, Math.min(2, blockableUnits.length)));
                        }
                    }

                    if (attackers.length > 0) {
                        console.log(`[AI] ⚔️ 发起进攻: ${attackers.length} 个单位 (截取前 ${Math.min(attackers.length, 6)})`);
                        // [战场上限 6 格] AI 进攻最多 6 个单位
                        const cappedAttackers = attackers.slice(0, 6);
                        if (attackers.length > 6) {
                            console.log(`[AI] 进攻单位超过 6 个，截取前 6 个上场。`);
                        }
                        // [AI挑战者] 处理挑战者：选择高价值目标强制格挡
                        const challengedIds: string[] = [];
                        const challengerTargets = new Map<string, CardData>();

                        cappedAttackers.forEach(attacker => {
                            if (attacker.keywords.includes('Challenger') && playerBench.length > 0) {
                                const available = playerBench.filter(t => !challengedIds.includes(t.id));
                                if (available.length === 0) return;
                                const target = available.sort((a, b) => {
                                    const score = (c: CardData) =>
                                        (c.isChampion ? 100 : 0) +
                                        getPower(c) * 3 +
                                        (c.keywords.includes('QuickAttack') ? 15 : 0) +
                                        (c.keywords.includes('Overwhelm') ? 15 : 0) +
                                        (c.keywords.includes('Channel') ? 10 : 0) +
                                        getHealth(c);
                                    return score(b) - score(a);
                                })[0];
                                challengerTargets.set(attacker.id, target);
                                challengedIds.push(target.id);
                                console.log('[AI] ⚡ 挑战者 ' + attacker.name + ' => 拉取 ' + target.name);
                            }
                        });

                        setMessage("敌方发起进攻！");
                        if (actions.setCombatField && actions.setEnemyBench && actions.commitAttack) {
                            // [2026-10-04 莉莉子] 幂等守卫：同格挡分支 —— 重入会重复把单位推入战场并排出第二个 commitAttack
                            if (commitAttackInFlightRef.current) {
                                console.log('[AI] ⚔️ 进攻提交已在途，跳过重复决策');
                                return;
                            }
                            commitAttackInFlightRef.current = true;
                            const newCombat = cappedAttackers.map((c: CardData) => {
                                const target = challengerTargets.get(c.id);
                                return { attacker: c, blocker: target || null, owner: 'enemy', isChallenged: !!target };
                            });
                            const remainingBench = bench.filter(b => !cappedAttackers.some(a => a.id === b.id));

                            // 1. 从玩家备战席移除被挑战的单位
                            if (challengedIds.length > 0 && actions.setPlayerBench) {
                                actions.setPlayerBench((prev: CardData[]) => prev.filter(c => !challengedIds.includes(c.id)));
                            }
                            // 2. 先将卡牌实体状态推入战场
                            actions.setEnemyBench(remainingBench);
                            actions.setCombatField(newCombat);

                            // 2. 延迟 50ms 确保 React 完成 DOM 与 State 渲染后，调用标准发车指令触发所有特效
                            // [2026-10-04 莉莉子] 同格挡分支：句柄挂 `commitAttackTimerRef`（卸载统一清理）+ 在途标记
                            const atkTimer = setTimeout(() => {
                                commitAttackTimerRef.current = null;
                                try {
                                    actions.commitAttack();
                                    commitAttackInFlightRef.current = false; // 成功才解除（同 #8 的口径）
                                } catch (e) {
                                    console.error('[AI] commitAttack 抛出异常（进攻提交未完成）:', e);
                                }
                            }, 50);
                            commitAttackTimerRef.current = atkTimer;
                        }
                        return;
                    }
                }

                // 4. 无事可做，让过
                console.log(`[AI] ⏭️ 无事可做，让过 (phase=${g.phase} hand=${hand.length} bench=${bench.length} mana=${g.enemyMana} tok=${g.attackToken.enemy})`);
                if (hand.length > 0) {
                    console.log(`[AI] ⏭️ 手牌剩余原因分析:`, hand.map(c =>
                        `${c.key}(${c.name}) type=${c.type} cost=${c.cost} afford=${canAffordCard(c, g.enemyMana, g.enemySpellMana, bench, 'enemy')} isUnit=${c.type?.includes('unit')} isSpell=${c.type?.includes('spell')}`
                    ));
                }
                setMessage("敌方过。");
                actions.passTurn();
            } // ← 主阶段 if 结束

            // ========== AI 行动完整保护 ==========
        } catch (err) {
            crashStreakRef.current += 1;
            const gs = stateRef.current.game;
            // [2026-10-04 莉莉子 · 修复"假保险"]
            //   原实现注释写「任何未捕获异常都不会让 AI 卡死」，但唯一恢复动作是 actions.passTurn()——
            //   而 passTurn 在 calibratePending / 额外攻击+格挡 / 非白名单阶段
            //   （useGameState.ts:4721 / 4734 / 4785）都是**静默 no-op**，什么都不写 ⇒ 那张保险是空的。
            //   现改为：按**当前阶段**调用该阶段真正有效的推进动作 + 打印现场快照。
            //   "是否真的推进了"不在这里自证，由独立的心跳看门狗判定（不谎报成功）。
            console.error(
                `[AI] 💥 未捕获异常导致 AI 逻辑崩溃（连续第 ${crashStreakRef.current} 次）:`,
                err, snapshotAIState(gs, stateRef.current));
            try {
                if (gs.phase === 'main' || gs.phase === 'react_to_block') actions?.passTurn?.();
                else if (gs.phase === 'attack_declare') actions?.commitAttack?.();
                else if (gs.phase === 'block_declare') actions?.confirmBlock?.();
            } catch (e2) {
                console.error('[AI] 崩溃兜底动作本身抛出异常：', e2);
            }
        }
    };

    // 依赖变化 → **只发起调度**；在途定时器不重置（消除"依赖抖一下就把思考重置"的饿死）
    useEffect(() => {
        scheduleTick(1500, 'deps'); // 思考时间 1.5s
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        game.turnOwner,
        game.phase,
        game.lastActionTimestamp,
        enemyHand.length, // 监听手牌变化
        combatField.length, // 监听战场变化
        game.spellCasting?.step, // [2026-07-20] AI 抉择结束/开始时唤醒/暂停
        game.calibratePending,   // [2026-07-20] AI 校准结束/开始时唤醒/暂停
        paused,                  // [2026-08-30 莉莉子] 暂停/恢复时重跑 effect，清掉旧 timer
        // [2026-10-04 莉莉子] 补全"闸门在依赖表外"的两处漏项 —— 原本它们冻结 AI 却没人再唤醒它
        game.pendingLevelUps?.length,
        game.levelUpCard,
    ]);

    // ============================================================
    // [2026-10-04 莉莉子] 心跳 + 停机看门狗（deps=[]，不随状态重排）
    //   这是本次"永久停机"整类缺陷的总闸：
    //     · 只要轮到 AI 且无阻塞 ⇒ 保证一定有决策定时器在跑（依赖驱动的缺口由它补上）
    //     · 一旦被阻塞超时 ⇒ **自带取证**：打印现场快照，之后对症修复就有据可依
    //     · 到更高阈值只走引擎**已有**的安全出口，绝不擅自改引擎状态
    //   ⚠️ 闭包是首次渲染那一份，只能读 ref（enabledRef 每渲染刷新）。
    // ============================================================
    useEffect(() => {
        const iv = setInterval(() => {
            const en = enabledRef.current;
            const live = stateRef.current;
            const g = live.game;

            // 在途标记自愈：定时器已经不在了（被清理/组件抖动）但标记还留着 ⇒ 复位，
            // 否则"在途互斥"本身会变成新的永久停机源。
            if (blockConfirmTimerRef.current === null) blockConfirmInFlightRef.current = false;
            if (commitAttackTimerRef.current === null) commitAttackInFlightRef.current = false;

            if (en.disabled || en.paused) { stallRef.current = null; stallEscapedRef.current = false; return; }

            const block = readBlockReason(g);
            if (!block) {
                stallRef.current = null;
                stallEscapedRef.current = false;
                scheduleTick(0, 'heartbeat'); // 无阻塞 ⇒ 立刻保证有在途决策
                return;
            }

            const now = Date.now();
            if (!stallRef.current || stallRef.current.reason !== block) {
                stallRef.current = { since: now, reason: block };
                stallEscapedRef.current = false;
                console.warn(`[AI-Watchdog] ⏳ AI 被阻塞，开始计时 — 原因=${block}`, snapshotAIState(g, live));
                return;
            }
            const stalledMs = now - stallRef.current.since;

            if (stalledMs >= AI_STALL_WARN_MS && stalledMs < AI_STALL_WARN_MS + 1500) {
                console.warn(`[AI-Watchdog] ⚠️ AI 已被阻塞 ${Math.round(stalledMs / 1000)}s — 原因=${block}`, snapshotAIState(g, live));
            }

            if (stalledMs >= AI_STALL_ESCAPE_MS && !stallEscapedRef.current) {
                stallEscapedRef.current = true;
                console.error(
                    `[AI-Watchdog] 🚨 AI 持续被阻塞 ${Math.round(stalledMs / 1000)}s 未自愈 — 原因=${block}。` +
                    `现场快照如下（这就是本机制"自带取证"的用途，下次复发请把这几行发我）：`,
                    snapshotAIState(g, live));
                // 只处理**引擎已有安全出口**的那一种：AI 自己的校准面板
                //（引擎自带"放弃选择"分支，且会自动接着处理排队中的校准 —— useGameState.ts:5434 / 5451-5470）
                //
                // [2026-10-04 独立审查 #2 修复] **必须限定 owner === 'enemy'**：
                //   闸门对"任一方校准"一视同仁（沿用 2026-10-03 的口径，本次不改）；但**出手**只能替 AI 自己。
                //   否则玩家把校准面板开着 ≥45s，就会被**敌方 AI 的看门狗**"放弃"掉自己的校准、
                //   连同牌库被重排（confirmCalibrate 的放弃分支会重写牌库）。那是拿 AI 的手改玩家的决定。
                const calOwner = g.calibratePending?.owner;
                if (block === 'calibrate' && calOwner === 'enemy' && typeof en.actions?.confirmCalibrate === 'function') {
                    console.warn('[AI-Watchdog] 🛠️ 走引擎已有出口：confirmCalibrate()（放弃本次选择，接着处理排队中的校准）');
                    try {
                        en.actions.confirmCalibrate();
                        // [独立审查 #2 附带] 逃生是一次性的：若队列里还有同一方的下一次校准，
                        //   reason 字符串仍是 'calibrate' ⇒ 计时不会被刷新、逃生也不会再来。
                        //   这里主动复位，让下一块面板重新获得完整的 45s 窗口。
                        stallRef.current = null;
                        stallEscapedRef.current = false;
                    } catch (e) {
                        console.error('[AI-Watchdog] confirmCalibrate 抛出异常：', e);
                    }
                } else {
                    // 其余情况**不擅自改引擎状态**（升级链还牵着 L2 卡面数据替换，改错会永久丢数据）：
                    //   · phase_animating / levelup_* → 交给 useGameState 的 animating 看门狗（本次已改为"限时+进展感知"）
                    //   · 玩家侧的 calibrate → **不碰**（那是玩家的决定，只有玩家能确认）
                    //   · choose_mode → 交给 GameSession 的自动抉择（其依赖不含内联函数，不会被重渲染饿死）
                    console.warn(`[AI-Watchdog] ℹ️ 原因=${block}${block === 'calibrate' ? `(owner=${calOwner ?? '?'})` : ''} 不在本机制处置范围（避免擅改引擎状态 / 越权替玩家决定），已交由对应看门狗/自动流程`);
                }
            }
        }, 1000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 卸载清理：所有延迟回调必须跟着组件生命周期走（原先两个裸 setTimeout 不在 cleanup 里）
    useEffect(() => () => {
        if (decideTimerRef.current !== null) { clearTimeout(decideTimerRef.current); decideTimerRef.current = null; }
        // [2026-10-04 独立审查 #10] 两个延迟回调各自由自己的 ref 持有句柄 ⇒ 逐个清，不再用堆积数组
        if (blockConfirmTimerRef.current !== null) { clearTimeout(blockConfirmTimerRef.current); blockConfirmTimerRef.current = null; }
        if (commitAttackTimerRef.current !== null) { clearTimeout(commitAttackTimerRef.current); commitAttackTimerRef.current = null; }
        blockConfirmInFlightRef.current = false;
        commitAttackInFlightRef.current = false;
    }, []);
};