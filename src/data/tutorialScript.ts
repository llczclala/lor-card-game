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
}

/** 引导层定义 */
export interface GuideLayerStep {
  /** 需要保持正常显示（不被模糊）的元素选择器列表 */
  highlightSelectors: string[];
  /** 画面中出现的标注文字 */
  annotations: GuideTextAnnotation[];
  /** 玩家操作以关闭引导层 */
  dismissOnClick: true;
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

/** 分步引导：单个引导指示（箭头 + 文字） */
export interface GuidanceInstruction {
  /** 引导文字 */
  text: string;
  /** 箭头指向的目标元素选择器（为空则不显示箭头） */
  arrowTarget?: string;
  /** 箭头位置偏移 */
  arrowOffset?: { x: number; y: number };
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
   */
  expectedAction: {
    type: 'click_target' | 'drag_target';
    /** 玩家需要操作的目标元素选择器 */
    targetSelector: string;
    /** 拖拽目标区域选择器（drag_target 时使用） */
    dropZoneSelector?: string;
    /**
     * 操作完成后如何判定：
     * - 'element_clicked': 点击了目标元素即可
     * - 'block_assigned': 格挡已分配
     * - 'block_recalled': 格挡已撤回
     */
    completionCondition: 'element_clicked' | 'block_assigned' | 'block_recalled';
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
  action: 'enemy_attack';
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
  /** 我方水晶 HP */
  playerCrystalHp: number;
  /** 敌方水晶 HP（可配置） */
  enemyCrystalHp: number;
  /** 我方场上单位 [{ cardKey, hp, power, ... }] */
  playerField: { cardKey: string; hp: number; power: number }[];
  /** 敌方场上单位 [{ cardKey, hp, power, ... }] */
  enemyField: { cardKey: string; hp: number; power: number }[];
  /** 我方备战席卡牌 key 列表 */
  playerBench: string[];
  /** 我方手牌卡牌 key 列表 */
  playerHand?: string[];
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
    playerCrystalHp: 1,
    enemyCrystalHp: 10,        // 🔧 程可调
    playerField: [
      { cardKey: 'lyfe', hp: 3, power: 2 },
    ],
    enemyField: [
      { cardKey: 'titan_gaimer', hp: 10, power: 2 },  // 🔧 HP 程可调
    ],
    playerBench: [
      'fenny', 'prayer', 'test_impact',
    ],
    playerHand: [],
    disableMulligan: true,
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
        text: '引航者，战况紧急。敌方的主力单位已经压境，我方的枢纽仅剩最后一道防线。但还未到放弃的时候——让我来为你说明基本的作战规则。',
      },
    },

    // ──── 1. 引导层①：胜利条件 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '#player-crystal',     // 我方水晶
        ],
        annotations: [
          {
            targetSelector: '#player-crystal',
            text: '摧毁敌方枢纽以获得胜利，保护我方枢纽，我方枢纽被摧毁时我方将败北',
            position: 'center',
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
        text: '很好，看来你理解了目标。现在敌人要发动进攻了——注意看他们是如何攻击的。',
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
        text: '敌人开始进攻了！我们必须想办法挡住这一击。注意看战场上方的进攻标识和敌人的属性。',
      },
    },

    // ──── 5. 引导层②：解析敌人与格挡 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '#enemy-crystal',      // 敌方水晶
          '#player-crystal',     // 我方水晶
          '#attack-token',       // 进攻标识
          '[data-entity-id="titan_gaimer_enemy"]',  // 敌方盖弥尔
        ],
        annotations: [
          {
            targetSelector: '#player-crystal',
            text: '当心，敌人的此次进攻足够摧毁我方枢纽',
            position: 'top',
          },
          {
            targetSelector: '[data-entity-id="titan_gaimer_enemy"]',
            text: '敌人的攻击力是2点，代表他的进攻会造成2点伤害\n敌人的生命值是X点，代表敌人只能承受这么多伤害',
            position: 'right',
          },
          {
            targetSelector: '#attack-token',
            text: '持有进攻标识时，可以发起进攻',
            position: 'bottom',
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
        text: '现在，让我来教你如何格挡。当攻击发生后，你可以派出备战席上的单位进行阻挡——每名单位只能阻挡一名敌人。',
      },
    },

    // ──── 7. 引导层③：格挡机制 ────
    {
      type: 'guide_layer',
      data: {
        highlightSelectors: [
          '[data-entity-id="lyfe"]',  // 我方场上的里芙
        ],
        annotations: [
          {
            targetSelector: '[data-entity-id="lyfe"]',
            text: '当攻击发生后，可以派出备战席上的单位进行格挡',
            position: 'center',
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
                arrowTarget: '[data-entity-id="lyfe"]',
              },
              {
                text: '请点击进攻中的敌人',
                arrowTarget: '[data-entity-id="titan_gaimer_enemy"]',
              },
              {
                text: '点击格挡达成！',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="titan_gaimer_enemy"]',
              completionCondition: 'block_assigned',
            },
          },

          // ── 子任务 2：点击以撤回 ──
          {
            id: 'click_to_recall',
            description: '点击以撤回格挡',
            guidanceSteps: [
              {
                text: '请点击刚刚完成格挡分配的里芙',
                arrowTarget: '[data-entity-id="lyfe"]',
              },
              {
                text: '点击撤回格挡达成！',
              },
            ],
            expectedAction: {
              type: 'click_target',
              targetSelector: '[data-entity-id="lyfe"]',
              completionCondition: 'block_recalled',
            },
          },

          // ── 子任务 3：拖拽以格挡 ──
          {
            id: 'drag_to_block',
            description: '拖拽以格挡',
            guidanceSteps: [
              {
                text: '请拖拽里芙至战场上',
                arrowTarget: '[data-entity-id="lyfe"]',
              },
              {
                text: '拖拽格挡达成！',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '[data-entity-id="lyfe"]',
              dropZoneSelector: '#combat-field',
              completionCondition: 'block_assigned',
            },
          },

          // ── 子任务 4：拖拽以撤回 ──
          {
            id: 'drag_to_recall',
            description: '拖拽以撤回格挡',
            guidanceSteps: [
              {
                text: '请拖拽里芙从战场返回备战席',
                arrowTarget: '.combat-card[data-entity-id="lyfe"]',
              },
              {
                text: '拖拽撤回格挡达成！',
              },
            ],
            expectedAction: {
              type: 'drag_target',
              targetSelector: '.combat-card[data-entity-id="lyfe"]',
              dropZoneSelector: '#bench-area',
              completionCondition: 'block_recalled',
            },
          },
        ],
      },
    },
  ],
};

/** 所有教程剧本的索引 */
export const TUTORIAL_SCRIPTS: Record<string, TutorialScript> = {
  [BASIC_TUTORIAL_SCRIPT.id]: BASIC_TUTORIAL_SCRIPT,
};
