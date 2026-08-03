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
  /**
   * 强制悬停检视的卡牌选择器列表
   * 激活时模拟鼠标悬停在这些卡牌上，浮现大图预览
   */
  forceHoverSelectors?: string[];
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
    /** 拖拽目标区域选择器（drag_target 时使用） */
    dropZoneSelector?: string;
    /**
     * 操作完成后如何判定：
     * - 'element_clicked': 点击了目标元素即可
     * - 'block_assigned': 格挡已分配
     * - 'block_recalled': 格挡已撤回
     * - 'block_confirmed': 格挡已确认
     * - 'free': 自由模式，自然完成
     * - 'round_end': 回合结束按钮被点击
     * - 'play_card': 打出了一张手牌
     * - 'attack_declared': 发起了进攻宣言
     */
    completionCondition: 'element_clicked' | 'block_assigned' | 'block_recalled' | 'block_confirmed' | 'free' | 'round_end' | 'play_card' | 'attack_declared' | 'attack_recalled';
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
    playerCrystalHp: 2,
    enemyCrystalHp: 4,        // 🔧 程可调
    playerField: [
      { cardKey: 'lyfe', hp: 6, power: 2 },          // 里芙基础 6 血，吃 2 发暗箭后剩 3
    ],
    enemyField: [
      { cardKey: 'titan_gaimer', hp: 8, power: 2 },  // 盖弥尔基础 8 血，吃 4 发暗箭后剩 4
    ],
    playerBench: [
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
            text: '敌人的攻击力是2点，代表他的进攻会造成2点伤害\n敌人的生命值是4点，代表敌人只能承受4点伤害',
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
            text: '当攻击发生后，可以派出备战席上的单位进行格挡，每名单位只能阻挡一名敌人',
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
                arrowOffset: { x: -44 },
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
            text: '派出我们备战席的卡牌进行进攻吧',
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
    playerMana: 5,
    playerMaxMana: 10,
    playerField: [
      { cardKey: 'lyfe', hp: 6, power: 2 },
      { cardKey: 'fenny', hp: 5, power: 3 },
    ],
    enemyField: [
      { cardKey: 'Ghost_Squad_Antina', hp: 3, power: 2 },
      { cardKey: 'Ghost_Squad_Vez', hp: 2, power: 2 },
    ],
    playerBench: [],
    playerHand: ['single_combat', 'hidden_arrow', 'inspire'],
    disableMulligan: true,
  },

  steps: [
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '分析员，敌人的部队已经逼近了。我方枢纽非常脆弱，一旦被击中就会失守。但别担心——只要正确运用战术，我们就能化解危机。' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-entity-id="player_nexus"]', '[data-card-key="Ghost_Squad_Antina"]', '[data-card-key="Ghost_Squad_Vez"]'], annotations: [{ targetSelector: '[data-entity-id="player_nexus"]', text: '我方枢纽仅剩1点生命，绝不能让任何敌方单位击中它', position: 'bottom' }, { targetSelector: '[data-card-key="Ghost_Squad_Antina"]', text: '注意这个敌人——她的攻击力是2点，足以摧毁我们最后的防线', position: 'bottom' }], dismissOnClick: true } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '敌人开始进攻了！我们得想办法阻挡它们。' } },
    { type: 'auto_action', data: { action: 'enemy_attack', params: {} } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="lyfe"]', '[data-card-key="fenny"]', '[data-entity-id="attack-token"]'], annotations: [{ targetSelector: '[data-card-key="lyfe"]', text: '点击里芙，然后点击你要格挡的敌人来分配格挡', position: 'right' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '初识隐秘', subTasks: [{ id: 'try_block_antina', description: '尝试格挡安蒂娜', guidanceSteps: [{ text: '请点击里芙选择她作为格挡者', arrowTarget: '[data-card-key="lyfe"]', direction: 'right' }, { text: '现在请点击安蒂娜——看看会发生什么', arrowTarget: '[data-card-key="Ghost_Squad_Antina"]', direction: 'right' }], expectedAction: { type: 'click_target', targetSelector: '[data-card-key="Ghost_Squad_Antina"]', completionCondition: 'block_assigned', lockActionButton: true } }] } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '不行！这个敌人有【隐秘】能力，我无法阻挡她……分析员，请右键点击那张卡牌，看看【隐秘】到底是什么效果。' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="Ghost_Squad_Antina"]'], annotations: [{ targetSelector: '[data-card-key="Ghost_Squad_Antina"]', text: '📖 在卡牌上点击【右键】，打开卡牌详情界面查看关键词说明', position: 'bottom' }], dismissOnClick: true } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="Ghost_Squad_Antina"]'], annotations: [{ targetSelector: '[data-card-key="Ghost_Squad_Antina"]', text: '🔍 在详情界面中，将鼠标【悬停】到【隐秘】关键词上查看详细说明\n\n查看完毕后点击空白处或右上角关闭', position: 'bottom' }], dismissOnClick: true } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '原来【隐秘】的效果是「只能被拥有隐秘的单位阻挡」。难怪我无法挡住她……不过，我们可以用别的方法来解决她。分析员，请使用手牌中的「单挑」！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="single_combat"]'], annotations: [{ targetSelector: '[data-card-key="single_combat"]', text: '「单挑」是一个【快速法术】。快速法术可以在战斗阶段打出，会进入法术堆叠等待结算。\n先选择敌方安蒂娜，再选择我方任意一个单位，让他们互相打击！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '快速法术·单挑', subTasks: [{ id: 'cast_single_combat', description: '从手牌打出「单挑」', guidanceSteps: [{ text: '请从手牌中打出「单挑」', arrowTarget: '[data-card-key="single_combat"]', direction: 'top' }, { text: '先后选择敌方安蒂娜和我方任意一个单位' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="single_combat"]', completionCondition: 'play_card', lockActionButton: true } }] } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 2000 } } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '漂亮的配合！安蒂娜被解决了。现在让我来挡住剩下的敌人……' } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 3000 } } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '等等……敌人在准备一个大型法术！那是慢速法术，不会立即生效——我们有时间反制它！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="hidden_arrow"]'], annotations: [{ targetSelector: '[data-card-key="hidden_arrow"]', text: '敌方施放的是【慢速法术】——进入堆叠后不会立即结算。\n\n「暗箭」是【极速法术】——可在任意阶段打出，且【立即结算】！\n\n打出暗箭，在慢速法术生效前摧毁目标！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '极速法术·暗箭', subTasks: [{ id: 'cast_hidden_arrow', description: '打出「暗箭」反制', guidanceSteps: [{ text: '请从手牌中打出「暗箭」', arrowTarget: '[data-card-key="hidden_arrow"]', direction: 'top' }, { text: '选择敌方目标' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="hidden_arrow"]', completionCondition: 'play_card', lockActionButton: true } }] } },
    { type: 'auto_action', data: { action: 'wait', params: { delay: 2000 } } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-entity-id="game-action-btn"]'], annotations: [{ targetSelector: '[data-entity-id="game-action-btn"]', text: '📚 三种法术速度小结：\n\n⚡ 极速(Burst)：任意阶段打出，立即结算\n🔵 快速(Fast)：战斗阶段可打出，按顺序结算\n🟡 慢速(Slow)：仅主阶段打出，最晚结算\n\n💡 极速 > 快速 > 慢速，速度越快越能抢得先机！', position: 'top' }], dismissOnClick: true } },
    { type: 'dialogue', data: { speakerKey: 'lyfe', speakerName: '里芙', text: '敌方的威胁解除了！现在轮到我们反击了。准备进入下一回合吧。' } },
    { type: 'task_group', data: { groupName: '进入下一回合', subTasks: [{ id: 'end_turn_02', description: '点击右侧按钮结束回合', guidanceSteps: [{ text: '请点击右侧按钮进入下一回合', arrowTarget: '[data-entity-id="game-action-btn"]', direction: 'left' }], expectedAction: { type: 'click_target', targetSelector: '[data-entity-id="game-action-btn"]', completionCondition: 'round_end' } }] } },
    { type: 'dialogue', data: { speakerKey: 'fenny', speakerName: '芬妮', text: '轮到我们表演了！分析员，让我们一鼓作气拿下胜利！' } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-card-key="inspire"]', '[data-entity-id="player-mana"]'], annotations: [{ targetSelector: '[data-card-key="inspire"]', text: '「振奋」是一个【快速法术】，可以给所有友方单位+3/+3。费用5点，我们刚好够用！', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '强化部队', subTasks: [{ id: 'cast_inspire', description: '打出「振奋」强化全员', guidanceSteps: [{ text: '请从手牌中打出「振奋」', arrowTarget: '[data-card-key="inspire"]', direction: 'top' }], expectedAction: { type: 'free', targetSelector: '[data-card-key="inspire"]', completionCondition: 'play_card', lockActionButton: true } }] } },
    { type: 'guide_layer', data: { highlightSelectors: ['[data-action="attack"]', '[data-card-key="lyfe"]', '[data-card-key="fenny"]'], annotations: [{ targetSelector: '[data-action="attack"]', text: '现在发起总攻！点击「进攻」按钮，然后派出我们的单位', position: 'top' }], dismissOnClick: true } },
    { type: 'task_group', data: { groupName: '发动进攻', subTasks: [{ id: 'attack_victory', description: '派出所有单位发动进攻', guidanceSteps: [{ text: '请点击「进攻」按钮发起攻击宣言', arrowTarget: '[data-action="attack"]', direction: 'left' }, { text: '请派出里芙和芬妮进攻', arrowTarget: '[data-card-key="lyfe"]', direction: 'right' }], expectedAction: { type: 'free', targetSelector: '[data-action="attack"]', completionCondition: 'attack_declared', lockSkipButton: true } }] } },
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
    enemyCrystalHp: 8,
    playerMana: 3,
    playerMaxMana: 10,
    playerField: [
      { cardKey: 'test_overwhelm', hp: 1, power: 4 },
      { cardKey: 'lyfe', hp: 4, power: 2 },
    ],
    enemyField: [
      { cardKey: 'test_frostbite', hp: 3, power: 0 },
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
          '[data-entity-id="player_mana"]',
        ],
        annotations: [
          {
            targetSelector: '[data-card-key="test_overwhelm"]',
            text: '👈【碾压】单位：攻击力4点，溢出伤害穿透格挡者\n👉 普通单位：攻击力2点，无溢出效果',
            position: 'bottom',
          },
          {
            targetSelector: '[data-entity-id="player_mana"]',
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
            description: '派出所有单位发动进攻',
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
              completionCondition: 'attack_declared',
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
      data: { action: 'wait', params: { delay: 2500 } },
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
            description: '派出单位发动最终进攻',
            guidanceSteps: [
              {
                text: '点击「进攻」，派出所有单位直击敌方水晶！',
                arrowTarget: '[data-action="attack"]',
                direction: 'left',
              },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'attack_declared',
            },
          },
        ],
      },
    },

    // ──── 10. 等待战斗动画 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2500 } },
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
            description: '派出所有单位发动进攻',
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
              completionCondition: 'attack_declared',
              lockSkipButton: true,
            },
          },
        ],
      },
    },

    // ──── 3. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2500 } },
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
            description: '派出所有单位发动最终进攻',
            guidanceSteps: [
              { text: '现在攻击！两个单位一起上，彻底击杀再生守卫！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'attack_declared',
            },
          },
        ],
      },
    },

    // ──── 12. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2500 } },
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
              { text: '点击进攻，派出所有单位终结战斗！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'attack_declared',
            },
          },
        ],
      },
    },

    // ──── 17. 等待战斗 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2500 } },
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
        text: '分析员！这次我们来学习【快攻】。这两个单位攻击力相近，但左边那个有快攻能力——它能先发制人！',
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
            text: '⚡【快攻】进攻时先出手——若击杀格挡者则不会受到反击',
            position: 'bottom',
          },
          {
            targetSelector: '[data-card-key="test_overwhelm"]',
            text: '❌ 这个单位没有快攻——进攻时会和格挡者互相攻击',
            position: 'bottom',
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
            description: '派出两个单位一起进攻',
            guidanceSteps: [
              { text: '点击「进攻」，然后派两个单位一起上，观察它们的区别！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'attack_declared',
              lockSkipButton: true,
            },
          },
        ],
      },
    },

    // ──── 3. 等待 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 3000 } },
    },

    // ──── 4. 对话：解释 ────
    {
      type: 'dialogue',
      data: {
        speakerKey: 'lyfe',
        speakerName: '里芙',
        text: '看到了吗？快攻单位先出手击杀了格挡者，所以没有受到反击——它活下来了！而没有快攻的单位虽然也赢了，但自己也被打伤了。这就是【快攻】的优势！',
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
            text: '💡【快攻】总结：\n\n进攻时 → 快攻单位先出手\n→ 击杀格挡者 → 不受反击\n→ 未击杀 → 正常受反击\n\n优势：先手击杀，保全自己！',
            position: 'bottom',
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
        text: '格挡者已经不在了！让快攻单位发挥它的速度优势，抢先终结战斗吧！',
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
              { text: '派出所有单位攻击敌方水晶！', arrowTarget: '[data-action="attack"]', direction: 'left' },
            ],
            expectedAction: {
              type: 'free',
              targetSelector: '[data-action="attack"]',
              completionCondition: 'attack_declared',
            },
          },
        ],
      },
    },

    // ──── 10. 等待 ────
    {
      type: 'auto_action',
      data: { action: 'wait', params: { delay: 2500 } },
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
