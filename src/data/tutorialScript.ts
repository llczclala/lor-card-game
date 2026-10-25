/**
 * 教程模式 · 剧本数据
 *
 * 定义教程模式的完整演出流程，包括：
 * - 初始战场配置（水晶 HP、场上单位等）
 * - 对话序列
 * - 引导层（高斯模糊遮罩 + 重点高亮 + 悬浮文字）
 * - 任务系统（子任务分解 + 分步箭头引导）
 *
 * 设计者：程
 * 整理者：莉莉子
 */
import { isTouchInput } from '../utils/touchGaze';

/**
 * [2026-10-16 莉莉子] 平台自适应文案：触屏与 PC 的"查看卡牌详情"入口**不是同一个操作**。
 *   · PC：鼠标**右键**卡牌 → 直接打开详情界面（`Card.tsx` 的 onContextMenu → onViewArt）
 *   · 触屏：**长按**卡牌 → 弹出悬停大图 → 点浮层上的圆形「详情」按钮 → 打开详情界面
 *     （触屏没有右键，且 `TouchFeedbackLayer` 会吃掉 contextmenu；见 FloatingCardPreview 的滞留操作条）
 * 若在教程里写死"请右键"，手机端玩家就照着一个不存在的手势做 ⇒ 必然卡关。
 * 脚本在模块加载时求值一次即可（进程内不会中途换设备）。
 */
const TOUCH_UI = isTouchInput();
const t = (pc: string, touch: string): string => (TOUCH_UI ? touch : pc);

// ============================================================
// 类型定义
// ============================================================

/** 引导层：对某个元素的文字标注 */
export interface GuideTextAnnotation {
  /** 标注指向的元素选择器 */
  targetSelector: string;
  /** 标注文字内容 */
  text: string;
  /** 文字相对目标的位置 */
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** [2026-08-26 莉莉子] 气泡相对锚点的偏移微调（dx 正=右，dy 正=下；可选，不传不偏移） */
  offset?: GuideOffset;
}

/** [2026-08-26 莉莉子] 引导气泡偏移微调：dx 水平偏移（正向右）、dy 垂直偏移（正向下） */
export interface GuideOffset {
  dx?: number;
  dy?: number;
}

/** [2026-08-26 莉莉子] 锚定提示：把引导文字钉在指定元素旁（fixedPrompt 数组模式专用） */
export interface AnchoredPrompt {
  /** 提示文字内容 */
  text: string;
  /** 锚点目标选择器（如详情界面关键词图标 / 关闭按钮） */
  targetSelector: string;
  /** 文字相对目标的位置（默认 left） */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** [2026-08-26 莉莉子] 气泡相对锚点的偏移微调（dx 正=右，dy 正=下；可选，不传不偏移） */
  offset?: GuideOffset;
}

/** 引导层定义 */
export interface GuideLayerStep {
  /** 需要保持正常显示（不被模糊）的元素选择器列表 */
  highlightSelectors: string[];
  /** 画面中出现的标注文字 */
  annotations: GuideTextAnnotation[];
  /** 玩家操作以关闭引导层 */
  dismissOnClick: true;
  /**
   * 强制悬停检视的卡牌选择器列表
   * 激活时模拟鼠标悬停在这些卡牌上，浮现大图预览
   */
  forceHoverSelectors?: string[];
  /** [2026-08-21 莉莉子] 右键任意卡牌（打开详情）即自动推进引导，无需再左键点击引导层 */
  dismissOnRightClick?: boolean;
  /**
   * [2026-10-16 莉莉子] 触屏：**长按**高亮卡牌即推进引导（触屏没有右键，镜像 `dismissOnRightClick`）。
   *   长按还会把浮点派发给该卡牌，让它的悬停预览浮出来 ⇒ 玩家接着点浮层上的「详情」按钮看详情。
   *   与 `dismissOnRightClick` 成对使用，两平台各走一条；PC 不生效。
   */
  dismissOnTouchLongPress?: boolean;
  /** [2026-08-21 莉莉子] 覆盖引导层默认 z-index（配合详情界面等上层 UI，如 10010 盖在 FullArtOverlay 之上） */
  zIndex?: number;
  /** [2026-08-21 莉莉子] 独立提示模式：无遮罩无高亮，屏幕中上方显示提示文字（配合全屏详情界面）。点击提示关闭推进 */
  fixedPrompt?: string;
  /** [2026-08-26 莉莉子] 锚定提示列表：每个气泡钉在指定元素旁（配合详情界面等上层 UI，如关键词图标/关闭按钮） */
  anchoredPrompts?: AnchoredPrompt[];
  /** [2026-08-26 莉莉子] 点击命中这些选择器的元素时，引导层自动推进（如详情界面关闭按钮 X）——教玩家操作目标元素，而非点击引导层 */
  dismissOnSelectorClick?: string[];
}

/** 对话定义 */
export interface DialogueStep {
  /** 说话的角色 key（对应 CARD_DB 或 HERO_IMAGES） */
  speakerKey: string;
  /** 说话者名字（显示用） */
  speakerName: string;
  /** 对话文本 */
  text: string;
  /** 对话结束后是否自动进入下一步 */
  autoAdvance?: boolean;
  /** 自动推进延迟（ms） */
  autoAdvanceDelay?: number;
}

// 修改后的新的代码片段
export interface GuidanceInstruction {
  /** 引导文字 */
  text: string;
  /** 箭头指向的目标元素选择器（为空则不显示箭头） */
  arrowTarget?: string;
  /** 箭头位置偏移 */
  arrowOffset?: { x: number; y: number };
  /** [新增] 强制指定箭头摆放的位置（不填则自动推算） */
  direction?: 'top' | 'bottom' | 'left' | 'right';
}

/** 单个子任务 */
export interface TutorialSubTask {
  /** 子任务 ID */
  id: string;
  /** 子任务描述 */
  description: string;
  /** 完成前的分步引导队列（按顺序执行） */
  guidanceSteps: GuidanceInstruction[];
  /**
   * 预期玩家操作类型
   * - click_target: 点击某个元素
   * - drag_target: 拖拽某个元素到目标区域
   * - free: 自由操作（不做限制，由游戏自然判定）
   */
  expectedAction: {
    type: 'click_target' | 'drag_target' | 'free';
    /** 玩家需要操作的目标元素选择器 */
    targetSelector: string;
    /**
     * [2026-10-16 莉莉子] 必须由这张卡完成操作（卡牌 key）。
     * 例：block_assigned 子任务要求「必须用里芙格挡焰心」时填 `lyfe`——
     *   玩家点其他单位会被拦下并提示，而不是静默选中（否则任务完成、演示目标却落空）。
     */
    requireCardKey?: string;
    /** 拖拽目标区域选择器（drag_target 时使用） */
    dropZoneSelector?: string;
    /**
     * 操作完成后如何判定：
     * - 'element_clicked': 点击了目标元素即可
     * - 'block_assigned': 格挡已分配
     * - 'block_selected': 已选中格挡者
     * - 'block_rejected': 格挡被拒（隐秘/凶恶，用于"尝试格挡失败"教学）
     * - 'block_recalled': 格挡已撤回
     * - 'block_confirmed': 格挡已确认
     * - 'free': 自由模式，自然完成
     * - 'round_end': 回合结束按钮被点击
     * - 'play_card': 打出了一张手牌
     * - 'attack_declared': 发起了进攻宣言
     * - 'combat_resolved': [2026-10-17 莉莉子] **本次战斗结算完毕**（`resolveCombatAnimation` 收尾广播）
     *   —— 与 'attack_declared'（只是点了进攻按钮）的区别：它会等到「派完单位 → 敌方格挡 → 结算播完」之后。
     *   教学里「打完这一段再讲解」必须用它，否则台词会抢在结算之前弹出（程实测）。
     * - 'unit_die': [2026-08-26 莉莉子] 指定单位死亡（配合 targetCardKey 精确匹配，如单挑消灭安蒂娜）
     * - 'spell_targets_selected': [2026-08-26 莉莉子] 法术目标全部选完、进入结算（如暗箭选完目标）
     */
    completionCondition: 'element_clicked' | 'block_assigned' | 'block_selected' | 'block_rejected' | 'block_recalled' | 'block_confirmed' | 'free' | 'round_end' | 'play_card' | 'attack_declared' | 'attack_recalled' | 'combat_resolved' | 'unit_die' | 'spell_targets_selected';
    /**
     * [2026-10-16 莉莉子] 本子任务完成后要触发的敌方演出。
   * ⚠️ 生效条件（**两条都要满足**，见 `useTutorialController`）：
   *   · 子任务 id 以 `enemy_cast_` 开头；
   *   · **本字段必须存在** —— 只带前缀、不配本字段的子任务**不会**触发（缺配置曾被当成
   *     "默认 150ms + 空参数"照打，导致敌方单挑在格挡瞬间抢跑，程实测过一次）。
     * 用途：某些教学要求"玩家刚做完 A，敌方立刻做 B"（如「里芙格挡焰心」→「敌方单挑反打」）。
     * 若写成独立的 auto_action 步骤，会与 task_group 推进（600ms 自动 advanceStep）产生时序竞争。
     */
    onCompleteAction?: {
      /** 演出类型（对应 GameSession 的 TUTORIAL_AUTO_ACTION 分支，如 'single_combat'） */
      action: string;
      params?: Record<string, unknown>;
      /**
       * [2026-10-16 莉莉子] 子任务完成后，等多少毫秒再让敌方出手（默认 150ms）。
       * 用于"玩家点完「确定」、还得等这次进攻结算播完，才轮到敌方拿法术瞄准"的场景：
       * 这时候双方都还在交战区，必须给结算留出时间（本关「确认防线」填 2500）。
       * ⚠️ 不要再用"监听某个战斗事件"来等 —— 那种做法会在子任务激活期就把待触发挂上，
       *    被上一场战斗的事件误触发（程实测过一次，已删）。
       */
      delayMs?: number;
    };
    /**
     * 锁死右下方"跳过"按钮
     * 防止玩家误触跳过教程，但保留上半部分"进攻"按钮可点击
     */
    lockSkipButton?: boolean;
    /**
     * 锁死右侧主操作按钮（格挡/确认/结束回合等）
     * 防止玩家跳过教学步骤
     */
    lockActionButton?: boolean;
    /** [2026-08-26 莉莉子] 完成判定的目标卡牌 key（如 unit_die 时精确匹配死亡单位是否为安蒂娜） */
    targetCardKey?: string;
  };
}

/** 任务组定义 */
export interface TaskGroupStep {
  /** 任务组名称 */
  groupName: string;
  /** 子任务列表（按顺序解锁） */
  subTasks: TutorialSubTask[];
}

/** 自动行为：让游戏自动执行某个动作 */
export interface AutoActionStep {
  /** 动作类型 */
  action: 'enemy_attack' | 'pause_upgrade' | 'resume_upgrade' | 'wait';
  /** 动作参数 */
  params: Record<string, unknown>;
}

/** 剧本步骤类型 */
export type TutorialStep =
  | { type: 'dialogue'; data: DialogueStep }
  | { type: 'guide_layer'; data: GuideLayerStep }
  | { type: 'task_group'; data: TaskGroupStep }
  | { type: 'auto_action'; data: AutoActionStep };

/** 初始战场配置 */
export interface InitialBattleState {
  /** 先手方（默认 'enemy'，由 TutorialGameWrapper 读取）。教学关卡如需玩家第一回合先手请设 'player' */
  firstAttacker?: 'player' | 'enemy';
  /** 我方水晶 HP */
  playerCrystalHp: number;
  /** 敌方水晶 HP（可配置） */
  enemyCrystalHp: number;
  /** 我方法力（默认0） */
  playerMana?: number;
  /** 我方最大法力（默认0） */
  playerMaxMana?: number;
  /** 敌方法力（默认0） */
  enemyMana?: number;
  /** 敌方最大法力（默认0） */
  enemyMaxMana?: number;
  /** 我方场上单位 [{ cardKey, hp, power, ... }] */
  playerField: { cardKey: string; hp: number; power: number }[];
  /** 敌方场上单位 [{ cardKey, hp, power, ... }] */
  enemyField: { cardKey: string; hp: number; power: number }[];
  /** 我方备战席卡牌 key 列表 */
  playerBench: string[];
  /**
   * [2026-10-16 莉莉子] 备战席单位的血量覆盖（可选）。
   * 为何需要：**格挡者只能来自备战席**（`assignBlocker` 只查 `playerBench`），
   *   而 `playerBench` 是纯 key 数组、不吃 `playerField` 的 hp 覆盖 ⇒
   *   想让「里芙满血 6/6 去格挡焰心」这种桥段成立，必须能单独指定备战席血量。
   */
  playerBenchHp?: { cardKey: string; hp: number }[];
  /** 我方手牌卡牌 key 列表 */
  playerHand?: string[];
  /**
   * [2026-10-16 莉莉子] **教程专用**：每回合开始时的最大法力加成（默认 0）。
   * ── 为什么需要：每回合最大法力由 `calculateRoundStart` **从零重算**
   *    （`min(10, round + manaBonus)`，`logic/core.ts:128`），`initialState.playerMaxMana` 根本不参与。
   *    于是「施法的速度」里玩家第 1 回合花掉 3 费后，第 2 回合只回 `min(10,2)=2` 点，
   *    而「振奋」要 5 费 ⇒ 卡死打不出（程实测："正好少了一点"）。
   * ── 语义：只影响**教程对局**，标准对局不传即 0，零回归。
   */
  manaBonus?: number;
  /** 禁用开局换牌 */
  disableMulligan: boolean;
}

/** 完整教程剧本 */
export interface TutorialScript {
  /** 剧本 ID */
  id: string;
  /** 剧本名称 */
  name: string;
  /** 关联的考核关卡 ID */
  stageId: string;
  /** 初始战场配置 */
  initialState: InitialBattleState;
  /**
   * 开场演出配置（可选）：开局前演出法术秀（如暗箭连发）。
   * 仅配置了该字段的剧本才会演出——未配置则直接进入教程。
   */
  openingShow?: {
    /** 演出阶段：[{cardKey, owner, targetKey, count}] */
    phases: { cardKey: string; owner: 'player' | 'enemy'; targetKey: string; count: number }[];
  };
  /** [2026-08-26 莉莉子] 开局初始暂停升级：关卡初始战场已达成英雄升级条件时，先暂停升级扫描，避免开局升级影片与教程对话重叠；配合步骤里的 resume_upgrade 手动触发升级影片 */
  pauseUpgradeAtStart?: boolean;
  /** 演出步骤序列 */
  steps: TutorialStep[];
}

// ============================================================
// 剧本：基础教程「战斗与胜利」
// ============================================================

export const BASIC_TUTORIAL_SCRIPT: TutorialScript = {
  id: 'basic_combat_victory',
  name: '战斗与胜利',
  stageId: 'basic_01_victory',

  // ══════════════════════════════════════════════
  // 初始战场配置
  // ══════════════════════════════════════════════
  initialState: {
    playerCrystalHp: 2,
    enemyCrystalHp: 4,        // 🔧 程可调
    playerField: [
      { cardKey: 'lyfe', hp: 6, power: 2 },          // 里芙基础 6 血，吃 2 发暗箭后剩 4
    ],
    enemyField: [
      // [2026-10-17 莉莉子] 盖弥尔自带【屏障】（cards.ts:2124 → keywords: ['Titan','Barrier']）：
      //   4 发暗箭的**首发会被屏障整个吸收并破盾**，其余 3 发落地 ⇒ 8 - 3 = 5 血。
      //   下方第 5 步"敌人的生命值是5点"的引导文案与此对齐（不可再按 4 血写）。
      { cardKey: 'titan_gaimer', hp: 8, power: 2 },
    ],
    playerBench: [
    ],
    playerHand: [],
    disableMulligan: true,
  },

  // ══════════════════════════════════════════════
  // 开场演出：开局暗箭连发（仅基础教程第一关保留）
  // ══════════════════════════════════════════════
  openingShow: {
    phases: [
      { cardKey: 'hidden_arrow', owner: 'enemy', targetKey: 'lyfe', count: 2 },          // 敌方暗箭 ×2 → 里芙（6 血 → 4 血）
      { cardKey: 'hidden_arrow', owner: 'player', targetKey: 'titan_gaimer', count: 4 }, // 我方暗箭 ×4 → 盖弥尔（8 血 → 4 血）
    ],
  },

  // ══════════════════════════════════════════════
  // 演出步骤序列
  // ══════════════════════════════════════════════
  steps: [
    // ──── 0. 开场对话① ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '分析员，欢迎回来，战况紧急。敌方的主力单位已经迫近，我方的枢纽仅剩最后一道防线。但还未到放弃的时候——让我来为你说明基本的作战规则。',
      },
    },

    // ──── 1. 引导层①：胜利条件 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="player_nexus"]',     // 我方水晶
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="player_nexus"]',
            text: '摧毁敌方枢纽以获得胜利，保护我方枢纽，我方枢纽被摧毁时我方将失败',
            position: 'bottom' ,
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 2. 对话② ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '敌袭！敌人要发起攻击了！',
      },
    },

    // ──── 3. 自动行为：敌方进攻 ────
    {
      type: 'auto_action',
      data: {
        action: 'enemy_attack',
        params: {},
      },
    },

    // ──── 4. 对话③ ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '敌人已经发起进攻了！挡不住的话，交给我！',
      },
    },

    // ──── 5. 引导层②：解析敌人与格挡 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="enemy_nexus"]',      // 敌方水晶
          '[data-entity-id="player_nexus"]',     // 我方水晶
          '[data-entity-id="attack-token"]',     // 进攻标识
          '[data-card-key="titan_gaimer"]',      // 敌方盖弥尔
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="player_nexus"]',
            text: '当心，敌人的此次进攻足够摧毁我方枢纽',
            position: 'bottom' ,
          },
          {
            targetSelector: '[data-card-key="titan_gaimer"]',
            text: '敌人的攻击力是2点，代表他的进攻会造成2点伤害\n敌人的生命值是5点，代表敌人只能承受5点伤害',
            position: 'bottom',
          },
          {
            targetSelector: '[data-entity-id="attack-token"]',
            text: '持有进攻标识时，可以发起进攻',
            position: 'bottom' ,
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 6. 对话④ ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '敌人的攻击发起了，分析员，请让我来进行阻挡。',
      },
    },

    // ──── 7. 引导层③：格挡机制 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="lyfe"]',  // 我方场上的里芙
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="lyfe"]',
            text: '当攻击发生后，可以指派备战席上的单位进行格挡，每名单位只能阻挡一名敌人',
            position: 'left' ,
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 8. 任务组：格挡与撤回 ────
    {
      type: 'task_group',
      data: {
        groupName: '格挡与撤回',
        subTasks: [
          // ── 子任务 1：点击以格挡 ──
          {
            id: 'click_to_block',
            description: '点击以格挡',
            guidanceSteps: [
              {
                text: '请点击里芙',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right' // [核心新增] 强制箭头放置在右侧！
              },
              {
                text: '请点击进攻中的敌人',
                arrowTarget: '[data-card-key="titan_gaimer"]',
                direction: 'right' // [核心新增] 强制箭头放置在右侧！
              },
              {
                text: '点击格挡达成！',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-card-key="titan_gaimer"]',
              completionCondition: 'block_assigned',
              lockActionButton: true,
            },
          },

          // ── 子任务 2：点击以撤回 ──
          {
            id: 'click_to_recall',
            description: '点击以撤回格挡',
            guidanceSteps: [
              {
                text: '请点击刚刚完成格挡分配的里芙',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right'
              },
              {
                text: '点击撤回格挡达成！',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-card-key="lyfe"]',
              completionCondition: 'block_recalled',
              lockActionButton: true,
            },
          },

          // ── 子任务 3：拖拽以格挡 ──
          {
            id: 'drag_to_block',
            description: '拖拽以格挡',
            guidanceSteps: [
              {
                text: '请将备战席的里芙拖至战场格挡',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right'
              },
              {
                text: '拖拽格挡达成！',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '[data-card-key="lyfe"]',
              dropZoneSelector: '#combat-field',
              completionCondition: 'block_assigned',
              lockActionButton: true,
            },
          },

          // ── 子任务 4：拖拽以撤回 ──
          {
            id: 'drag_to_recall',
            description: '拖拽以撤回格挡',
            guidanceSteps: [
              {
                text: '请拖拽里芙从战场返回备战席',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right'
              },
              {
                text: '拖拽撤回格挡达成！',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '[data-card-key="lyfe"]',
              dropZoneSelector: '#bench-area',
              completionCondition: 'block_recalled',
              lockActionButton: true,
            },
          },

          // ── 子任务 5：自由练习 ──
          {
            id: 'free_block',
            description: '以你喜欢的方式完成格挡',
            guidanceSteps: [
              {
                text: '以你喜欢的方式完成格挡吧。',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right',
              },
              {
                text: '点击该按钮以确认格挡',
                arrowTarget: '[data-entity-id="game-action-btn"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-card-key="lyfe"]',
              completionCondition: 'block_confirmed',
              lockSkipButton: true,
            },
          },
        ],
      },
    },

    // ══════════════════════════════════════════════════════
    // 第二幕：战斗结算 & 第二回合
    // ══════════════════════════════════════════════════════

    // ──── 9. 等待：战斗动画播放 ────
    {
      type: 'auto_action',
      data: {
        action: 'wait',
        params: { delay: 2000 },
      },
    },

    // ──── 10. 对话⑤：战后总结 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '勉强挡住了，但现在的情况并不乐观，如果有更多敌人出现，那就麻烦了，我们必须速战速决。',
      },
    },

    // ──── 11. 引导层④：战斗结果解析 + 指向下一回合按钮 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="titan_gaimer"]',
          '[data-card-key="lyfe"]',
          '[data-entity-id="game-action-btn"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="titan_gaimer"]',
            text: '盖弥尔在战场中受到里芙的攻击伤害，扣除了2点生命值',
            position: 'bottom',
          },
          {
            targetSelector: '[data-card-key="lyfe"]',
            text: '里芙在战场中受到盖弥尔的攻击伤害，扣除了2点生命值',
            position: 'left',
          },
          {
            targetSelector: '[data-entity-id="game-action-btn"]',
            text: '成功完成阻挡，让我们进入下一回合',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 12. 子任务：结束回合 ────
    {
      type: 'task_group',
      data: {
        groupName: '进入下一回合',
        subTasks: [
          {
            id: 'end_turn',
            description: '点击右侧的按钮，完成此回合',
            guidanceSteps: [
              {
                text: '请点击右侧的按钮进入下一回合',
                arrowTarget: '[data-entity-id="game-action-btn"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="game-action-btn"]',
              completionCondition: 'round_end',
            },
          },
        ],
      },
    },

    // ──── 13. 对话⑥：芬妮登场（新回合开始，芬妮上手后）────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'fenny',
        speakerName: '芬妮',
        text: '大明星返场，星期三，这里就交给～我～吧～',
      },
    },

    // ──── 14. 引导层⑤：讲解抽牌 / 费用 / 法力值 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="player-deck"]',
          '[data-card-key="fenny"]',
          '[data-entity-id="player-mana"]',
          '[data-entity-id="game-action-btn"]',
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="player-deck"]',
            text: '每个新回合开始，我们会从牌库中抽取一张卡牌',
            position: 'top',
          },
          {
            targetSelector: '[data-card-key="fenny"]',
            text: '芬妮的费用是2费',
            position: 'top',
          },
          {
            targetSelector: '[data-entity-id="player-mana"]',
            text: '初始的费用是1点，每个回合开始时，最大费用增加1，最大为10，未使用的费用会转换成能量值储存起来，能量值最多存储3点',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 15. 对话⑦：芬妮请求出场 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'fenny',
        speakerName: '芬妮',
        text: '分析员，快派我出场进行支援吧。',
      },
    },

    // ──── 16. 自动行为：暂停升级 ────
    {
      type: 'auto_action',
      data: {
        action: 'pause_upgrade',
        params: {},
      },
    },

    // ──── 17. 子任务：打出芬妮 ────
    {
      type: 'task_group',
      data: {
        groupName: '打出芬妮',
        subTasks: [
          {
            id: 'play_fenny',
            description: '通过点击或者拖拽，打出芬妮',
            guidanceSteps: [
              {
                text: '请从手牌中打出芬妮',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'top',
                arrowOffset: { x: -44, y: 0 },
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-card-key="fenny"]',
              completionCondition: 'play_card',
              lockActionButton: true,
            },
          },
        ],
      },
    },

    // ──── 18. 对话⑧：出场对话 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'fenny',
        speakerName: '芬妮',
        text: '我来了，芬妮已就位，一鼓作气解决它们！',
      },
    },
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '支援已抵达，分析员，我们即刻展开反击。',
        autoAdvance: true,
        autoAdvanceDelay: 2000,
      },
    },

    // ──── 19. 引导层⑥：强制悬停检视芬妮大图 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="fenny"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="fenny"]',
            text: '天启者可以通过完成各自不同的任务达成局内升级，芬妮的升级条件已达成',
            position: 'top',
          },
        ],
        dismissOnClick: true,
        forceHoverSelectors: ['[data-card-key="fenny"]'],
      },
    },

    // ──── 20. 对话⑨：芬妮准备升级 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'fenny',
        speakerName: '芬妮',
        text: '这里必须拿出真本事了呢！',
      },
    },

    // ──── 21. 自动行为：恢复升级，触发芬妮升级 ────
    {
      type: 'auto_action',
      data: {
        action: 'resume_upgrade',
        params: {},
      },
    },


    // ──── 23. 对话⑩：升级完成 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'fenny',
        speakerName: '芬妮',
        text: '冲啊！！！！！！',
      },
    },

    // ──── 24. 引导层⑦：进攻教学说明 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="attack-token"]',
          '[data-card-key="fenny"]',
          '[data-card-key="lyfe"]',
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="attack-token"]',
            text: '本回合我方拥有进攻权',
            position: 'bottom',
          },
          {
            targetSelector: '[data-card-key="fenny"]',
            text: '用我们备战席的卡牌发起进攻吧',
            position: 'top',
          },
          {
            targetSelector: '[data-action="attack"]',
            text: '点击攻击发起攻击宣言，注意不要跳过回合',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 25. 任务组：进攻教学 ────
    {
      type: 'task_group',
      data: {
        groupName: '进攻与撤回',
        subTasks: [
          // ── 子任务 1：点击以进攻（3步引导）──
          {
            id: 'click_to_attack',
            description: '点击以进攻',
            guidanceSteps: [
              {
                text: '请点击右侧的「进攻」按钮发起进攻宣言',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
              {
                text: '请点击芬妮发起进攻',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'right',
              },
              {
                text: '请点击里芙发起进攻',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'free',
              lockSkipButton: true,
            },
          },

          // ── 子任务 2：点击以撤回（2步）──
          {
            id: 'click_to_recall_attack',
            description: '点击以撤回进攻',
            guidanceSteps: [
              {
                text: '请点击战场中的芬妮，撤回进攻',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'top',
              },
              {
                text: '请点击战场中的里芙，撤回进攻',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'top',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-card-key="fenny"]',
              completionCondition: 'free',
            },
          },

          // ── 子任务 3：拖拽以进攻（2步）──
          {
            id: 'drag_to_attack',
            description: '拖拽以进攻',
            guidanceSteps: [
              {
                text: '请拖拽芬妮到战场发起进攻',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'right',
              },
              {
                text: '请拖拽里芙到战场发起进攻',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'right',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '[data-card-key="fenny"]',
              dropZoneSelector: '#combat-field',
              completionCondition: 'free',
            },
          },

          // ── 子任务 4：拖拽以撤回（2步）──
          {
            id: 'drag_to_recall_attack',
            description: '拖拽以撤回进攻',
            guidanceSteps: [
              {
                text: '请拖拽芬妮从战场撤回备战席',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'top',
              },
              {
                text: '请拖拽里芙从战场撤回备战席',
                arrowTarget: '[data-card-key="lyfe"]',
                direction: 'top',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '[data-card-key="fenny"]',
              dropZoneSelector: '#bench-area',
              completionCondition: 'free',
            },
          },

          // ── 子任务 5：自由进攻 ──
          {
            id: 'free_attack',
            description: '以你喜欢的方式完成进攻',
            guidanceSteps: [
              {
                text: '以你喜欢的方式发起进攻吧！',
                arrowTarget: '[data-card-key="fenny"]',
                direction: 'right',
              },
              {
                text: '点击「进攻」按钮发起总攻',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-card-key="fenny"]',
              completionCondition: 'attack_declared',
              lockSkipButton: true,
            },
          },

        ],
      },
    },

    // ──── 等待：战斗结算（敌方格挡+反击）────
    {
      type: 'auto_action',
      data: {
        action: 'wait',
        params: { delay: 4000 },
      },
    },

    // ──── 恭喜完成新手教程 ────
    {
      type: 'task_group',
      data: {
        groupName: '恭喜通关',
        subTasks: [
          {
            id: 'congratulations',
            description: '恭喜完成新手教程',
            guidanceSteps: [],
            expectedAction: {
              type: 'free',
              targetSelector: '',
              completionCondition: 'free',
            },
          },
        ],
      },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════
// 剧本：基础教程「施法的速度」02
// ══════════════════════════════════════════════════════════════════

export const BASIC_TUTORIAL_SCRIPT_02: TutorialScript = {
  id: 'basic_spell_speed',
  name: '施法的速度',
  stageId: 'basic_02_spell_speed',

  initialState: {
    playerCrystalHp: 1,
    enemyCrystalHp: 10,
    // [2026-10-16 莉莉子] 第 1 回合法力：覆盖式给 5（单挑 2 + 暗箭 1 + 留 2）。
    //   ⚠️ `playerMaxMana` 在这里**不起作用**：每回合最大法力由 `calculateRoundStart` 从零重算
    //   （`min(10, round + manaBonus)`，`logic/core.ts:128`），根本不读这个字段。
    playerMana: 5,
    // [2026-10-16 莉莉子] 敌方法力：敌方要用「单挑」(2费) 打我方单位，必须给法力，否则施放不出来
    enemyMana: 5,
    enemyMaxMana: 5,
    playerField: [
      { cardKey: 'fenny', hp: 5, power: 3 },
    ],
    enemyField: [
      { cardKey: 'Ghost_Squad_Antina', hp: 3, power: 2 },
      // [2026-10-16 程拍板] 维兹 → 焰心（4/3，带【无法格挡】= 它自己不能挡，但可以被挡）
      { cardKey: 'Typhoon_Squad_Flameheart', hp: 3, power: 4 },
    ],
    // [2026-08-15 莉莉子] 里芙放备战席才能被选为格挡者（selectBlocker 仅对 bench 生效）；此前放场上导致"无法选中里芙"
    playerBench: ['lyfe'],
    // [2026-10-16 程拍板] 里芙满血 6/6 待命：格挡焰心(4攻)吃 4 点 → 6→2 血存活，
    //   随后被敌方「单挑」盯上 → 玩家用暗箭抢先反制救下，这才有"救命"的教学张力。
    playerBenchHp: [{ cardKey: 'lyfe', hp: 6 }],
    playerHand: ['single_combat', 'hidden_arrow', 'inspire'],
    // [2026-10-16 莉莉子] 第 2 回合最大法力 = min(10, 2 + 3) = 5 ⇒ 刚好够打出「振奋」(5费)。
    //   不设的话第 2 回合只有 min(10,2)=2 点，振奋永远打不出（程实测卡在这里）。
    manaBonus: 3,
    disableMulligan: true,
  },

  // [2026-08-26 莉莉子] 芬妮升级条件"任一水晶血量≤10"开局即满足（enemyCrystalHp=10），
  // [2026-10-04 程拍板] 条件已改为「任一方水晶 ≤ **其自身上限的一半**」；本关仍然满足、**无需改教程**：
  //   · 玩家水晶 1 ≤ 20/2 = 10 ✅（上限 20 = 标准对局缺省）
  //   · 敌方水晶 10 ≤ 20/2 = 10 ✅（enemyNexusMax = 20，教程只覆盖当前值、不动上限）
  // 若不暂停，开局升级影片会与里芙开场白重叠。先暂停 → 开场白播完点继续 → resume_upgrade 触发升级影片
  pauseUpgradeAtStart: true,

  steps: [
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '分析员，敌人的部队已经逼近了。我方枢纽非常脆弱，一旦被击中就会失守。但别担心——只要正确运用战术，我们就能化解危机。' } },
    // [2026-08-26 莉莉子] 开场白播完（玩家点击继续）后恢复升级扫描 → 芬妮升级影片弹出 → 播完再继续后续教学
    { type: 'auto_action', data: { action: 'resume_upgrade', params: {} } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-entity-id="player_nexus"]', '[data-card-key="Ghost_Squad_Antina"]', '[data-card-key="Typhoon_Squad_Flameheart"]'], annotations: [{ targetSelector: '[data-entity-id="player_nexus"]', text: '我方枢纽仅剩1点生命，绝不能让任何敌方单位击中它', position: 'bottom' }, { targetSelector: '[data-card-key="Ghost_Squad_Antina"]', text: '抵御敌人的进攻，任意对水晶的攻击都足以摧毁我们最后的防线', position: 'bottom' }], dismissOnClick: true } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '敌人开始进攻了！我们得想办法阻挡它们。' } },
    // [2026-10-16 程拍板] 两人**一起进攻**：安蒂娜（隐秘·不可被挡）+ 焰心（4攻·可被挡）。
    //   分工：里芙负责挡焰心；安蒂娜挡不住 ⇒ 稍后必须用「单挑」把她解决掉，
    //   否则确认防线时她的 4 攻会直击我方 1 血枢纽（那才是真正的败北条件）。
    { type: 'auto_action', data: { action: 'enemy_attack', params: { attackerKeys: ['Ghost_Squad_Antina', 'Typhoon_Squad_Flameheart'] } } },
    // [2026-08-21 莉莉子 删除] 原引导层"点击里芙，然后点击你要格挡的敌人来分配格挡"与任务组分步引导重复，
    // 且高亮区域盖住敌方槽位导致点击穿透、引导层无法按 dismissOnClick 关闭 → 玩家被卡在引导层。
    // 由任务组分步引导接管（选里芙 → 点安蒂娜 → 拒绝演出 → 对话圆场），里芙被退回即进入下一步。
    { type: 'task_group', data: { groupName: '初识隐秘', subTasks: [{ id: 'try_block_antina', description: '尝试格挡安蒂娜', guidanceSteps: [{ text: '请点击里芙选择她作为格挡者', arrowTarget: '[data-card-key="lyfe"]', direction: 'right' }, { text: '现在请点击安蒂娜——看看会发生什么', arrowTarget: '[data-card-key="Ghost_Squad_Antina"]', direction: 'right' }], expectedAction: { type: 'click_target', targetSelector: '[data-card-key="Ghost_Squad_Antina"]', completionCondition: 'block_rejected', lockActionButton: true } }] } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: t('不行！这个敌人有【隐秘】能力，我无法阻挡她……分析员，请右键点击那张卡牌，看看【隐秘】到底是什么效果。', '不行！这个敌人有【隐秘】能力，我无法阻挡她……分析员，请长按那张卡牌，再点弹出来的「详情」按钮，看看【隐秘】到底是什么效果。') } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="Ghost_Squad_Antina"]'], annotations: [{ targetSelector: '[data-card-key="Ghost_Squad_Antina"]', text: t('📖 在卡牌上点击【右键】，打开卡牌详情界面查看关键词说明', '📖 【长按】这张卡牌 → 在弹出的预览上点「详情」，打开卡牌详情界面查看关键词说明'), position: 'bottom' }], dismissOnClick: true, dismissOnRightClick: true, dismissOnTouchLongPress: true } },
    { type: 'guide_layer', data: { highlightSelectors: [], annotations: [], dismissOnClick: true, zIndex: 10010, dismissOnSelectorClick: ['[data-tutorial-close="fullart"]'], anchoredPrompts: [
      { text: t('🔍 在详情界面中，将鼠标【悬停】到【隐秘】关键词上查看详细说明', '🔍 在详情界面中，【点击】【隐秘】关键词即可查看详细说明'), targetSelector: '[data-tutorial-keyword="Elusive"]', position: 'left' },
      { text: '查看完毕后点击这里关闭详情界面', targetSelector: '[data-tutorial-close="fullart"]', position: 'left' }
    ] } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '原来【隐秘】的效果是「只能被拥有隐秘的单位阻挡」。难怪我无法挡住她……不过，我们可以用别的方法来解决她。分析员，请使用手牌中的「单挑」！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="single_combat"]'], annotations: [{ targetSelector: '[data-card-key="single_combat"]', text: '「单挑」是一个【快速法术】。快速法术可以在战斗阶段打出，会进入法术堆叠等待结算。\n打出后先选择我方【芬妮】（安蒂娜的 2 点反击会让里芙伤得太重），再选择敌方【安蒂娜】，让她们互相打击！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '快速法术·单挑', subTasks: [
      { id: 'cast_single_combat', description: '从手牌打出「单挑」', guidanceSteps: [{ text: '请从手牌中打出「单挑」', arrowTarget: '[data-card-key="single_combat"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="single_combat"]', completionCondition: 'play_card', lockActionButton: true } },
      // [2026-10-16 莉莉子 BUG修复 · 施法的速度「选完第一个目标后断链」]
      //   症状：子任务要求"先选友方、再选敌方"，玩家选完第一个目标后引导文案/箭头纹丝不动，像卡死。
      //   根因两层：① 本子任务 type 是 'free'，而既有推进逻辑只认 type === 'click_target'
      //              （TutorialController 的 SFX_SELECT_BLOCKER_UNIT 监听）；
      //            ② 更根本——单挑选**第一个目标**时游戏侧一个事件都不发
      //              （旧实现只有最后一步选满才 emit TUTORIAL_SPELL_TARGETS_SELECTED）。
      //   修复（引擎侧）：useSpellSystem.handleTargetClick 在某一步选满且仍有后续步骤时补发
      //     TUTORIAL_SPELL_TARGET_STEP_DONE，TutorialController 据 stepIndex 去重后推进引导步。
      //   于是"先选友方(箭头) → 选完自动切 → 再选敌方(箭头)"真正可用；
      //   完成判定仍为"安蒂娜死亡"(unit_die)，玩家选完安蒂娜触发结算、安蒂娜阵亡 → 任务完成。
      //   ⚠️ 友方单位选**芬妮**（不是里芙）：里芙本回合还要满血去**格挡焰心**（4攻，格挡互击会吃 4 点），
      //      若再被单挑的反击打掉 2 点就会当场阵亡，后面的总攻就没了主力。
      //   ⚠️ 完成判定用 `spell_targets_selected`（**选完目标即完成**），不用 `unit_die`。
      //      为什么：单挑是**玩家的快速法术** ⇒ 选完目标走 `finalizeSpell → commitSpell`，
      //      而 commitSpell 对玩家快速法术只做 `pendingSpell + 入栈等待确认`，**不结算、不判死**；
      //      唯一会广播 `UNIT_DIE` 的 `judgeLifeAndDeath` 只在 `settleStack/resolveStack` 里调，
      //      要等玩家确认并让过之后才跑 ⇒ 把完成条件挂在 `unit_die` 上会一直等不到（实测卡住的就是这里）。
      //      改成选完目标即完成：玩家选完安蒂娜立刻收工进入下一步，安蒂娜的死亡由随后的结算自然处理。
      { id: 'resolve_single_combat', description: '先选我方【芬妮】，再选敌方【安蒂娜】', guidanceSteps: [{ text: '先选择我方【芬妮】——她的 3 点攻击足以消灭安蒂娜', arrowTarget: '[data-card-key="fenny"]', direction: 'top' }, { text: '接着选择敌方【安蒂娜】，让她们互相打击', arrowTarget: '[data-card-key="Ghost_Squad_Antina"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '', completionCondition: 'spell_targets_selected', lockActionButton: true } },
      // [2026-10-16 程拍板] 安蒂娜解决后**立刻补一步**：让里芙去格挡焰心（并入同一任务组，不另拆一段）。
      //   ── 为什么必须格挡：格挡 = 互相打击 ⇒ 里芙(2攻)反击焰心 2 点 ⇒ 焰心 3血 → **1血**。
      //      这是后面「暗箭(1伤)能杀掉焰心」的**唯一前置**——不格挡，1 伤打 3 血就是空谈。
      //   ── 里芙满血 6 吃掉焰心 4 点 → **2 血存活**（受伤但不死），稍后撤回备战席参加总攻。
      //   ── ⚠️ 本步**不**触发任何敌方演出：格挡只是"把里芙挂上战线"，战斗还没结算。
      //      敌方「单挑」放在后面的「确认防线」组（等 COMBAT_RESOLVED 之后才打）。
      // [2026-10-16 莉莉子 BUG修复 · 敌方单挑提前跳出]
      //   ⚠️ 子任务 id 一旦沿用 `enemy_cast_` 前缀，就会被 useTutorialController 的钩子当成
      //      "本步完成 ⇒ 敌方施法"的开关（钩子只看前缀，不要求配 onCompleteAction）。
      //      本步只是"分配格挡"，根本不是敌方演出 ⇒ 必须用普通 id，绝不能带该前缀。
      //      （上一个版本它叫 `enemy_cast_single_combat`，与下面「确认防线」那步**重名**，
      //        于是格挡一落地就先以默认 `delayMs=150` + 空参数打了一发敌方单挑，
      //        程实测："我一用里芙去格挡焰心，单挑就锁定了里芙和焰心"。）
      { id: 'block_flameheart', description: '用里芙格挡焰心', guidanceSteps: [
        { text: '安蒂娜解决了！现在请点击【里芙】选择她作为格挡者', arrowTarget: '[data-card-key="lyfe"]', direction: 'right' },
        { text: '点击进攻中的【焰心】——用里芙挡住它', arrowTarget: '[data-card-key="Typhoon_Squad_Flameheart"]', direction: 'right' },
      ], expectedAction: { type: 'click_target', targetSelector: '[data-card-key="Typhoon_Squad_Flameheart"]', requireCardKey: 'lyfe', completionCondition: 'block_assigned', lockActionButton: true } }
    ] } },
    // [2026-10-16 莉莉子 · 程实测纠正] 台词与演出的**顺序**必须严格对齐：
    //   格挡分配 ≠ 进攻结算。玩家还要点「确定」确认防线，然后战斗才结算（里芙挨 4 点、焰心被反击 2 点）。
    //   此前把"焰心被我反击…"这句挂在格挡完成上 ⇒ 玩家还没确认防线、敌方单挑更没打出来，
    //   台词就抢跑了（程："我都还没确认格挡，就看到里芙弹出这句话"）。
    //   现在顺序是：格挡完成 → 提示确认防线 → 战斗结算 → 敌方单挑 → 才提示"垂死挣扎"和暗箭。
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '接下来点右侧的「确定」确认防线——让这次进攻结算完，我们才好继续。' } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 1200 } } },
    // 本任务组只负责"提示玩家确认防线"；真正的敌方「单挑」等进攻结算完毕（COMBAT_RESOLVED）再打出
    { type: 'task_group', data: { groupName: '确认防线', subTasks: [
      { id: 'enemy_cast_single_combat', description: '点「确定」确认防线，结算这次进攻', guidanceSteps: [
        { text: '请点击右侧按钮「确定」，让这次进攻结算完毕', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' },
      ], expectedAction: { type: 'click_target', targetSelector: '[data-entity-id="game-action-btn"]', completionCondition: 'combat_resolved', lockActionButton: true, onCompleteAction: { action: 'single_combat', params: { spellKey: 'single_combat', allyKey: 'Typhoon_Squad_Flameheart', targetKey: 'lyfe' }, delayMs: 2500 } } }
    ] } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 2500 } } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '焰心被我的反击打成了重伤……但等等，敌人在垂死挣扎！它打出了「单挑」想拉我一起陪葬——那是【快速法术】，马上就要结算了！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="hidden_arrow"]'], annotations: [{ targetSelector: '[data-card-key="hidden_arrow"]', text: '敌方打出的是【快速法术】——进入堆叠后按顺序结算，还没轮到它！\n\n「暗箭」是【极速法术】——可在任意阶段打出，且【立即结算】！\n\n焰心已经被里芙的反击打成 1 点生命——打出暗箭抢先击杀它，敌方的法术就会失去目标而落空！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '极速法术·暗箭', subTasks: [
      { id: 'cast_hidden_arrow', description: '打出「暗箭」反制', guidanceSteps: [{ text: '请从手牌中打出「暗箭」', arrowTarget: '[data-card-key="hidden_arrow"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="hidden_arrow"]', completionCondition: 'play_card', lockActionButton: true } },
      // [2026-08-26 莉莉子 BUG修复] 拆第二步：选择目标，完成判定=目标选完进入结算（替代"打出瞬间"完成）
      { id: 'resolve_hidden_arrow', description: '选择焰心作为目标', guidanceSteps: [{ text: '请点击【焰心】，用暗箭抢先击杀它', arrowTarget: '[data-card-key="Typhoon_Squad_Flameheart"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '', completionCondition: 'spell_targets_selected', targetCardKey: 'Typhoon_Squad_Flameheart', lockActionButton: true } }
      // [2026-10-16 莉莉子 删除] 原本此处还有第 3 个子任务「撤回里芙的格挡」——**是错的**：
      //   里芙在「确认防线 → 战斗结算」那一步就已经自动归位回备战席
      //   （`resolveCombatAnimation` 收尾清空交战区、幸存者归位，`useGameState.ts:4854-4859`）；
      //   此刻战斗区里**没有她的 blocker** ⇒ `recallBlocker` 的 `if (combat && combat.blocker)`
      //   判空、静默不做事 ⇒ 子任务永远完不成、卡死（程实测指出）。
      //   "点右侧按钮推进"由紧随其后的「进入下一回合」任务组承担，不在这里重复。
    ] } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 2000 } } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-entity-id="game-action-btn"]'], annotations: [{ targetSelector: '[data-entity-id="game-action-btn"]', text: '📚 三种法术速度小结：\n\n⚡ 极速(Burst)：任意阶段打出，立即结算\n🔵 快速(Fast)：战斗阶段可打出，按顺序结算\n🟡 慢速(Slow)：仅主阶段打出，最晚结算\n\n💡 极速 > 快速 > 慢速，速度越快越能抢得先机！', position: 'top' }], dismissOnClick: true } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '敌方的威胁解除了！现在轮到我们反击了。准备进入下一回合吧。' } },
    { type: 'task_group', data: { groupName: '结束回合', subTasks: [{ id: 'end_turn_02', description: '点击右侧按钮结束回合', guidanceSteps: [{ text: '威胁已清除！点右侧按钮结束回合吧', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' }], expectedAction: { type: 'click_target', targetSelector: '[data-entity-id="game-action-btn"]', completionCondition: 'round_end' } }] } },
    { type: 'dialogue', data: { speakerKey: 'fenny', speakerName: '芬妮', text: '轮到我们表演了！分析员，让我们一鼓作气拿下胜利！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="inspire"]', '[data-entity-id="player-mana"]'], annotations: [{ targetSelector: '[data-card-key="inspire"]', text: '「振奋」是一个【慢速法术】，本回合给所有友方单位 +2/+1。费用5点，我们刚好够用！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '强化部队', subTasks: [{ id: 'cast_inspire', description: '打出「振奋」强化全员', guidanceSteps: [{ text: '请从手牌中打出「振奋」', arrowTarget: '[data-card-key="inspire"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="inspire"]', completionCondition: 'play_card', lockActionButton: true } }] } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-action="attack"]', '[data-card-key="lyfe"]', '[data-card-key="fenny"]'], annotations: [{ targetSelector: '[data-action="attack"]', text: '现在发起总攻！点击「进攻」按钮，然后指派我们的单位', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '发动进攻', subTasks: [{ id: 'attack_victory', description: '指派所有单位发动进攻', guidanceSteps: [{ text: '请点击「进攻」按钮发起攻击宣言', arrowTarget: '[data-action="attack"]', direction: 'left' }, { text: '请指派里芙和芬妮进攻', arrowTarget: '[data-card-key="lyfe"]', direction: 'right' }], expectedAction: { type: 'free', targetSelector: '[data-action="attack"]', completionCondition: 'attack_declared', lockSkipButton: true } }] } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 3000 } } },
    { type: 'task_group', data: { groupName: '恭喜通关', subTasks: [{ id: 'congrats_02', description: '恭喜完成「施法的速度」', guidanceSteps: [], expectedAction: { type: 'free', targetSelector: '', completionCondition: 'free' } }] } },
  ],
};

// ══════════════════════════════════════════════════════════════════
// 剧本：关键词「碾压」
// ══════════════════════════════════════════════════════════════════

export const OVERWHELM_TUTORIAL_SCRIPT: TutorialScript = {
  id: 'keyword_overwhelm',
  name: '穿透防线——碾压',
  stageId: 'keyword_01_overwhelm',

  initialState: {
    playerCrystalHp: 10,
    firstAttacker: 'player', // [2026-08-15] 关键词考核：玩家第一回合先手
    // [2026-10-17 莉莉子 · 程拍板] 碾压关：敌方水晶 2 点 —— 每回合 1 点溢出，第 2 回合「最终进攻」即打爆。
    //   ⇒ 教学以一场**真胜利**收尾（代价：剧本末尾的 wait +「恭喜通关」会被胜利结算盖掉，程已知）
    enemyCrystalHp: 2,
    playerMana: 3,
    playerMaxMana: 10,
    playerField: [
      { cardKey: 'test_overwhelm', hp: 1, power: 4 },
      { cardKey: 'lyfe', hp: 4, power: 2 },
    ],
    // [2026-10-17 莉莉子 · 程拍板] 敌方备战席 6 张【幻莲音蛇】(0攻3血)：
    //   · 0 攻 ⇒ 格挡不反击，我方 1 血碾压单位不会被打死
    //   · 3 血 ⇒ 被 4 攻打穿，溢出恰好 1 点（对上第 4 步台词"多余的1点伤害"）
    //   · ≥2 张 ⇒ 我方两条进攻线**各有一个格挡者** ⇒「1 点溢出」不再依赖玩家点选顺序
    //   ⚠️ 教程里 enemyField 的单位是落在**备战席**的（useGameState.ts:684-710）—— 这正是"备战席 6 个"
    //   ⚠️ 暂无自动补员（enemyBenchRefill 属下一轮 B+C 步）⇒ 打到第 3~4 回合会逐渐见底
    enemyField: [
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
      { cardKey: 'Loka_Phantom_Serpent', hp: 3, power: 0 },
    ],
    playerBench: [],
    playerHand: [],
    disableMulligan: true,
  },

  steps: [
    // ──── 0. 开场对话 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '分析员，前方有一道坚固的防线。但我们有【碾压】能力——它能让溢出的伤害穿透格挡者，直击敌方水晶。',
      },
    },

    // ──── 1. 引导层：高亮双方单位 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="test_overwhelm"]',
          '[data-card-key="lyfe"]',
          // [2026-10-17 莉莉子 BUG修复] 原写 `player_mana`（下划线）**不是真实锚点** ——
          //   真身在 ManaGemSystem.tsx:95 的 `data-entity-id={isPlayer ? 'player-mana' : 'enemy-mana'}`。
          //   锚点不存在 ⇒ measureHighlights 打 warn 跳过（GuideLayer.tsx:34-37）
          //   ⇒ 这条标注被 GuideLayer.tsx:416 静默丢弃，**玩家一个字都看不到**。
          '[data-entity-id="player-mana"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_overwhelm"]',
            text: '👈【碾压】单位：攻击力4点，溢出伤害穿透格挡者\n👉 普通单位：攻击力2点，无溢出效果',
            // [2026-10-17 莉莉子 BUG修复] 原为 'bottom' —— 碾压单位在**我方备战席**（屏幕最下方），
            //   'bottom' 会把气泡放到卡牌**下方** ⇒ 直接溢出屏幕底边、根本看不见（程实测反馈）。
            //   'top' ⇒ 气泡落在备战席**上方** ✅
            position: 'top',
          },
          {
            targetSelector: '[data-entity-id="player-mana"]',
            text: '费用充足，无需出牌，直接进攻即可',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 2. 任务：发起进攻 ────
    {
      type: 'task_group',
      data: {
        groupName: '发起进攻',
        subTasks: [
          {
            id: 'declare_attack_overwhelm',
            description: '指派所有单位发动进攻',
            guidanceSteps: [
              {
                text: '请点击「进攻」按钮，然后选择两个单位发起进攻',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
              lockSkipButton: true,
              lockActionButton: true,
            },
          },
        ],
      },
    },

    // ──── 3. 等待战斗动画 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 4. 讲解碾压效果 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '看到了吗？碾压单位击中格挡者后，多余的1点伤害穿透了防线，打到了敌方水晶！这就是【碾压】的力量。',
      },
    },

    // ──── 5. 引导层：碾压总结 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="enemy_nexus"]',
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="enemy_nexus"]',
            text: '💡【碾压】总结：\n\n当碾压单位被格挡时：\n  伤害 — 格挡者生命值 = 溢出伤害 → 直击水晶\n\n当碾压单位未被格挡时：\n  全额伤害 → 直击水晶（同普通单位）\n\n简单说：碾压 = "打穿防线"！',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 6. 结束回合 ────
    {
      type: 'task_group',
      data: {
        groupName: '结束回合',
        subTasks: [
          {
            id: 'end_turn_overwhelm',
            description: '点击结束回合',
            guidanceSteps: [
              {
                text: '请点击结束回合，等待下一轮进攻',
                arrowTarget: '[data-entity-id="game-action-btn"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="game-action-btn"]',
              completionCondition: 'round_end',
            },
          },
        ],
      },
    },

    // ──── 7. 等待敌回合 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2000 } },
    },

    // ──── 8. 对话：准备总攻 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '防线的格挡者已被击溃！现在发动总攻，让碾压单位直击水晶，终结这场战斗！',
      },
    },

    // ──── 9. 任务：最终进攻 ────
    {
      type: 'task_group',
      data: {
        groupName: '最终进攻',
        subTasks: [
          {
            id: 'final_attack_overwhelm',
            description: '指派单位发动最终进攻',
            guidanceSteps: [
              {
                text: '点击「进攻」，指派所有单位直击敌方水晶！',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
            },
          },
        ],
      },
    },

    // ──── 10. 等待战斗动画 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 11. 恭喜通关 ────
    {
      type: 'task_group',
      data: {
        groupName: '恭喜通关',
        subTasks: [
          {
            id: 'congrats_overwhelm',
            description: '恭喜完成「穿透防线——碾压」！',
            guidanceSteps: [],
            expectedAction: { type: 'free', targetSelector: '', completionCondition: 'free' },
          },
        ],
      },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════
// 剧本：关键词「再生」
// ══════════════════════════════════════════════════════════════════

export const REGENERATION_TUTORIAL_SCRIPT: TutorialScript = {
  id: 'keyword_regeneration',
  name: '不灭之身——再生',
  stageId: 'keyword_02_regeneration',

  initialState: {
    playerCrystalHp: 15,
    firstAttacker: 'player', // [2026-08-15] 关键词考核：玩家第一回合先手
    enemyCrystalHp: 6,
    playerMana: 5,
    playerMaxMana: 10,
    playerField: [
      { cardKey: 'test_overwhelm', hp: 1, power: 4 },
      { cardKey: 'lyfe', hp: 4, power: 2 },
    ],
    enemyField: [
      { cardKey: 'test_regeneration', hp: 6, power: 0 },
      { cardKey: 'test_frostbite', hp: 2, power: 0 },
    ],
    playerHand: ['hidden_arrow'],
    playerBench: [],
    disableMulligan: true,
  },

  steps: [
    // ──── 0. 开场对话 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '分析员，前方的守卫拥有【再生】能力——每回合开始时它会自动回满血。必须在一回合内集中火力击杀它。先试探一下它的实力。',
      },
    },

    // ──── 1. 引导层：高亮再生守卫 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="test_regeneration"]',
          '[data-card-key="test_overwhelm"]',
          '[data-card-key="lyfe"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_regeneration"]',
            text: '💚 这就是【再生】单位——每回合开始回复满血！\n当前6点生命值，相当耐打',
            position: 'bottom',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 2. 任务：发起进攻 ────
    {
      type: 'task_group',
      data: {
        groupName: '试探攻击',
        subTasks: [
          {
            id: 'attack_regeneration_1',
            description: '指派所有单位发动进攻',
            guidanceSteps: [
              {
                text: '点击「进攻」，两个单位一起攻击，看看能打掉它多少血',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
              lockSkipButton: true,
            },
          },
        ],
      },
    },

    // ──── 3. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 4. 对话：还没打死 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '虽然造成了伤害，但再生守卫还活着。更麻烦的是——下回合开始它会回满血。我们结束回合看看。',
      },
    },

    // ──── 5. 结束回合 ────
    {
      type: 'task_group',
      data: {
        groupName: '结束回合',
        subTasks: [
          {
            id: 'end_turn_regen_1',
            description: '点击结束回合',
            guidanceSteps: [
              { text: '请点击结束回合', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="game-action-btn"]',
              completionCondition: 'round_end',
            },
          },
        ],
      },
    },

    // ──── 6. 等待敌人回合 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2000 } },
    },

    // ──── 7. 对话：再生演示 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '看！再生守卫的血量又回满了！这就是【再生】的效果——每回合开始恢复至满血。必须在一回合内用足够的伤害彻底击杀它！',
      },
    },

    // ──── 8. 引导层：集火策略 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="test_regeneration"]',
          '[data-card-key="hidden_arrow"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_regeneration"]',
            text: '💡 策略：先用「暗箭」打3伤，再让两个单位同时进攻，总伤害 3+4+2=9 > 6，一回合必杀！',
            position: 'bottom',
          },
          {
            targetSelector: '[data-card-key="hidden_arrow"]',
            text: '先从手牌打出暗箭！',
            position: 'top',
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 9. 任务：打出暗箭 ────
    {
      type: 'task_group',
      data: {
        groupName: '打出暗箭',
        subTasks: [
          {
            id: 'cast_hidden_arrow_regen',
            description: '从手牌打出「暗箭」',
            guidanceSteps: [
              { text: '请点击手牌中的暗箭，选择再生守卫作为目标', arrowTarget: '[data-card-key="hidden_arrow"]', direction: 'top' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-card-key="hidden_arrow"]',
              completionCondition: 'play_card',
              lockActionButton: true,
            },
          },
        ],
      },
    },

    // ──── 10. 等待法术动画 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2000 } },
    },

    // ──── 11. 任务：总攻 ────
    {
      type: 'task_group',
      data: {
        groupName: '最终进攻',
        subTasks: [
          {
            id: 'final_attack_regen',
            description: '指派所有单位发动最终进攻',
            guidanceSteps: [
              { text: '现在攻击！两个单位一起上，彻底击杀再生守卫！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
            },
          },
        ],
      },
    },

    // ──── 12. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 13. 对话：胜利在望 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '漂亮！集火成功，再生守卫被彻底击杀了！一回合内造成足够伤害就能破解再生。现在，给敌方水晶最后一击！',
      },
    },

    // ──── 14. 结束回合 ────
    {
      type: 'task_group',
      data: {
        groupName: '结束回合',
        subTasks: [
          {
            id: 'end_turn_regen_2',
            description: '点击结束回合',
            guidanceSteps: [
              { text: '请结束回合', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="game-action-btn"]',
              completionCondition: 'round_end',
            },
          },
        ],
      },
    },

    // ──── 15. 等待敌方回合 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2000 } },
    },

    // ──── 16. 任务：终结 ────
    {
      type: 'task_group',
      data: {
        groupName: '最终一击',
        subTasks: [
          {
            id: 'final_blow_regen',
            description: '发动最后一次进攻，击破水晶！',
            guidanceSteps: [
              { text: '点击进攻，指派所有单位终结战斗！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
            },
          },
        ],
      },
    },

    // ──── 17. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 18. 恭喜通关 ────
    {
      type: 'task_group',
      data: {
        groupName: '恭喜通关',
        subTasks: [
          {
            id: 'congrats_regen',
            description: '恭喜完成「不灭之身——再生」！',
            guidanceSteps: [],
            expectedAction: { type: 'free', targetSelector: '', completionCondition: 'free' },
          },
        ],
      },
    },
  ],
};

// ══════════════════════════════════════════════════════════════════
// 剧本：关键词「快攻」
// ══════════════════════════════════════════════════════════════════

export const QUICK_ATTACK_TUTORIAL_SCRIPT: TutorialScript = {
  id: 'keyword_quickattack',
  name: '先发制人——快攻',
  stageId: 'keyword_03_quickattack',

  initialState: {
    playerCrystalHp: 15,
    firstAttacker: 'player', // [2026-08-15] 关键词考核：玩家第一回合先手
    enemyCrystalHp: 8,
    playerMana: 5,
    playerMaxMana: 10,
    playerField: [
      { cardKey: 'test_quickattack', hp: 1, power: 3 },
      { cardKey: 'test_overwhelm', hp: 1, power: 4 },
    ],
    enemyField: [
      { cardKey: 'test_frostbite', hp: 3, power: 2 },
    ],
    playerHand: [],
    playerBench: [],
    disableMulligan: true,
  },

  steps: [
    // ──── 0. 开场对话 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '分析员！这次我们来学习【先攻】。这两个单位攻击力相近，但左边那个有先攻能力——它能先发制人！',
      },
    },

    // ──── 1. 引导层 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="test_quickattack"]',
          '[data-card-key="test_overwhelm"]',
          '[data-entity-id="enemy_nexus"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_quickattack"]',
            text: '⚡【先攻】进攻时先出手——若击杀格挡者则不会受到反击',
            position: 'top', // [2026-10-17] 目标是备战席单位，'bottom' 会溢出屏幕底边（同碾压关）
          },
          {
            targetSelector: '[data-card-key="test_overwhelm"]',
            text: '❌ 这个单位没有先攻——进攻时会和格挡者互相攻击',
            position: 'top', // [2026-10-17] 目标是备战席单位，'bottom' 会溢出屏幕底边（同碾压关）
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 2. 任务：对比攻击 ────
    {
      type: 'task_group',
      data: {
        groupName: '对比攻击',
        subTasks: [
          {
            id: 'attack_quick_compare',
            description: '指派两个单位一起进攻',
            guidanceSteps: [
              { text: '点击「进攻」，然后派两个单位一起上，观察它们的区别！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
              lockSkipButton: true,
            },
          },
        ],
      },
    },

    // ──── 3. 等待 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 4. 对话：解释 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '看到了吗？先攻单位先出手击杀了格挡者，所以没有受到反击——它活下来了！而没有先攻的单位虽然也赢了，但自己也被打伤了。这就是【先攻】的优势！',
      },
    },

    // ──── 5. 引导层总结 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-card-key="test_quickattack"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_quickattack"]',
            text: '💡【先攻】总结：\n\n进攻时 → 先攻单位先出手\n→ 击杀格挡者 → 不受反击\n→ 未击杀 → 正常受反击\n\n优势：先手击杀，保全自己！',
            position: 'top', // [2026-10-17] 目标是备战席单位，'bottom' 会溢出屏幕底边（同碾压关）
          },
        ],
        dismissOnClick: true,
      },
    },

    // ──── 6. 结束回合 ────
    {
      type: 'task_group',
      data: {
        groupName: '结束回合',
        subTasks: [
          {
            id: 'end_turn_qa',
            description: '点击结束回合',
            guidanceSteps: [
              { text: '结束回合进入下一轮', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="game-action-btn"]',
              completionCondition: 'round_end',
            },
          },
        ],
      },
    },

    // ──── 7. 等待 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2000 } },
    },

    // ──── 8. 对话：终极一击 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '格挡者已经不在了！让先攻单位发挥它的速度优势，抢先终结战斗吧！',
      },
    },

    // ──── 9. 任务：最终进攻 ────
    {
      type: 'task_group',
      data: {
        groupName: '最终进攻',
        subTasks: [
          {
            id: 'final_attack_qa',
            description: '发动最终进攻',
            guidanceSteps: [
              { text: '指派所有单位攻击敌方水晶！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'combat_resolved', // [2026-10-17] 改判"结算完毕"：派完单位→敌方格挡→战斗结算播完
            },
          },
        ],
      },
    },

    // ──── 10. 等待 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 800 } },
    },

    // ──── 11. 恭喜通关 ────
    {
      type: 'task_group',
      data: {
        groupName: '恭喜通关',
        subTasks: [
          {
            id: 'congrats_qa',
            description: '恭喜完成「先发制人——快攻」！',
            guidanceSteps: [],
            expectedAction: { type: 'free', targetSelector: '', completionCondition: 'free' },
          },
        ],
      },
    },
  ],
};

/** 所有教程剧本的索引 */
export const TUTORIAL_SCRIPTS: Record<string, TutorialScript> = {
  [BASIC_TUTORIAL_SCRIPT.id]: BASIC_TUTORIAL_SCRIPT,
  [BASIC_TUTORIAL_SCRIPT_02.id]: BASIC_TUTORIAL_SCRIPT_02,
  [OVERWHELM_TUTORIAL_SCRIPT.id]: OVERWHELM_TUTORIAL_SCRIPT,
  [REGENERATION_TUTORIAL_SCRIPT.id]: REGENERATION_TUTORIAL_SCRIPT,
  [QUICK_ATTACK_TUTORIAL_SCRIPT.id]: QUICK_ATTACK_TUTORIAL_SCRIPT,
};
