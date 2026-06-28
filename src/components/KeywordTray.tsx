import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { Keyword } from '../types';
import { KEYWORD_DB } from '../data/keywords';

interface KeywordTrayProps {
    keywords: Keyword[];
    isAttacking?: boolean; // 核心状态：是否正在发起进攻
    isDefending?: boolean; // 核心状态：是否正在格挡
    sizeClass?: string;    // 自定义图标尺寸 (例如 'w-[18px] h-[18px]')
    className?: string;    // 外部容器的自定义样式
    animState?: string;    // [新增] 宿主的动画状态，用于判定阵亡
    depletedKeywords?: Keyword[]; // [泰坦] 黯淡关键词列表，关键词不再触发但仍计入计数
    titanCount?: number;   // [泰坦] 场上泰坦总数，用于在泰坦图标上预显示脉冲加成
    isOnBoard?: boolean;   // [泰坦] 卡牌是否在场上（备战席/战场），用于泰坦呼吸灯

}

// 内部子组件：拥有独立特效大脑的“智能关键词图标”
const SmartKeywordIcon = ({ keyword, sizeClass, isAttacking, isDefending, animState, isDepleted, titanCount, isOnBoard }: { keyword: Keyword, sizeClass: string, isAttacking?: boolean, isDefending?: boolean, animState?: string, isDepleted?: boolean, titanCount?: number, isOnBoard?: boolean }) => {
    const config = KEYWORD_DB[keyword];
    if (!config) return null;

    // [能力] 手牌中不显示能力图标
    if (keyword === 'Ability' && !isOnBoard) return null;

    // [光环] 手牌中不显示光环图标
    if (keyword === 'Aura' && !isOnBoard) return null;

    // 1. 状态计算大脑：判断当前词条是否被”激活”
    let isActive = false;
    let glowColor = '';
    // [新增] 加入 shield (护盾) 类型
    let animType: 'pulse' | 'flash' | 'stealth' | 'hunt' | 'shield' | 'titan_breath' | 'ability_breath' | 'aura_constant' | 'none' = 'none';

    // [新增] 最高优先级：瞬息阵亡谢幕拦截！
    if (animState === 'ephemeral_dying' && keyword === 'Ephemeral') {
        isActive = true;
        glowColor = 'rgba(168, 85, 247, 1)'; // 极其纯粹的紫色
        animType = 'ephemeral_death' as any; // 强行挂载专属谢幕动画
    }
    // [核心新增] 被动常驻类词条激活判断 (无视进攻防御状态，永远激活)
    else if (keyword === 'Elusive') {
        isActive = true;
        glowColor = 'rgba(249, 115, 22, 0.8)'; // 保持橙色危险警告
        animType = 'stealth';
    } else if (keyword === 'Barrier' && !isDepleted) {
        isActive = true;
        glowColor = 'rgba(253, 224, 71, 0.9)'; // 金黄色高亮护盾
        animType = 'shield';
    }
    // [泰坦] 沉稳呼吸：在场上时，未黯淡的泰坦图标保持巨人般的呼吸节奏
    else if (keyword === 'Titan' && isOnBoard && !isDepleted) {
        isActive = true;
        glowColor = 'rgba(6, 182, 212, 0.6)'; // 青蓝光
        animType = 'titan_breath';
    }
    // [能力] 呼吸灯：在场上时未耗尽的能力图标保持金色呼吸，耗尽时靠 isDepleted 变灰
    else if (keyword === 'Ability' && isOnBoard && !isDepleted) {
        isActive = true;
        glowColor = 'rgba(59, 130, 246, 0.8)'; // 金色统一光效
        animType = 'ability_breath';
    }
    // [光环] 常亮灯：在场上时始终保持柔和光效，永不暗淡
    else if (keyword === 'Aura' && isOnBoard) {
        isActive = true;
        glowColor = 'rgba(168, 85, 247, 0.7)'; // 紫色光环
        animType = 'aura_constant';
    }

    // 进攻类词条激活判断
    if (isAttacking) {
        switch (keyword) {
            case 'Overwhelm': // 碾压：血红色力量
                isActive = true; glowColor = 'rgba(220, 38, 38, 0.8)'; animType = 'pulse'; break;
            case 'QuickAttack': // 先攻：蓝色闪电
                isActive = true; glowColor = 'rgba(59, 130, 246, 0.8)'; animType = 'flash'; break;
            case 'Double Attack': // 连击：橙色爆发
                isActive = true; glowColor = 'rgba(249, 115, 22, 0.8)'; animType = 'flash'; break;
            case 'Challenger': // 挑战者：专属雷达锁定与跃击
                isActive = true; glowColor = 'rgba(249, 115, 22, 0.8)'; animType = 'hunt'; break;
            case 'Sniper': // 狙击：青色锁定光
                isActive = true; glowColor = 'rgba(6, 182, 212, 0.8)'; animType = 'flash'; break;
            case 'Impact': // 冲击：深红爆破
                isActive = true; glowColor = 'rgba(225, 29, 72, 0.8)'; animType = 'pulse'; break;
        }
    }

    // 防御/常驻类词条激活判断 (后续可扩展)
    if (isDefending) {
        switch (keyword) {
            case 'Tough': // 坚韧：岩石色护甲
                isActive = true; glowColor = 'rgba(100, 116, 139, 0.8)'; animType = 'pulse'; break;
            case 'Thorns': // 反伤：毒绿色
                isActive = true; glowColor = 'rgba(132, 204, 22, 0.8)'; animType = 'flash'; break;
        }
    }

    // 2. Framer Motion 特效变体库
    const variants: Variants = {
        idle: {
            scale: 1,
            filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.5))'
        },
        // [核心修改] 常驻脉冲：沉重的呼吸灯，体积膨胀感与粘滞感更强
        active_pulse: {
            scale: [0.25, 2.15, 0.25], // 将膨胀比例调大，增加物理压迫感
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 15px ${glowColor})`, // 同步增强发光范围
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            // 动画时长拉长至 2.5 秒，并将 ease 改为 "circInOut" (两头慢、中间快的粘滞曲线)
            transition: { duration: 2, repeat: Infinity, ease: "circInOut" }
        },
        // [新增] 幽灵潜行：不改变大小，纯粹依靠透明度的潮汐呼吸
        active_stealth: {
            scale: 1, // 拒绝膨胀，保持克制
            opacity: [0.3, 1, 0.3], // 若隐若现的核心
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 12px ${glowColor})`,
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
        },
        // 瞬发爆闪：急促的光效，适合先攻/连击这种强调速度的词条
        active_flash: {
            scale: [0.25, 1.5, 0.25],
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 12px ${glowColor})`,
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: { duration: 0.3, repeat: Infinity, ease: "easeOut" }
        },
        // [新增] 狩猎锁定：挑战者专属，360度旋转放大 + 向上跃击
        active_hunt: {
            scale: [0.2, 1.5, 1.5, 0.2],
            rotate: [0, 360, 360, 0],
            y: [0, 3, -3, 0],
            x: [0, 3, -3, 0],
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 15px ${glowColor})`,
                `drop-shadow(0px 0px 20px ${glowColor})`, // 跃击时最高亮
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: {
                duration: 2,
                times: [0, 0.4, 0.8, 1], // 精准切分：0.4秒转完放大，停顿到0.8秒开始跃击并收缩
                repeat: Infinity,
                ease: "easeInOut"
            }
        },
        // [新增] 坚壁护盾：稳如泰山的微频脉冲，防御感拉满
        active_shield: {
            scale: [1, 1.5, 1.5, 1.5, 1.5, 1.5, 1],
            y: [ 1.5, 0, 1.5, 0, 1.5, 0, 1.5],
            filter: [
                `drop-shadow(0px 0px 2px ${glowColor})`,
                `drop-shadow(0px 0px 10px ${glowColor})`,
                `drop-shadow(0px 0px 10px ${glowColor})`,
                `drop-shadow(0px 0px 10px ${glowColor})`,
                `drop-shadow(0px 0px 10px ${glowColor})`,
                `drop-shadow(0px 0px 10px ${glowColor})`,
                `drop-shadow(0px 0px 2px ${glowColor})`
            ],
            transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
        },
        // [新增] 瞬息谢幕：伴随 1.5s 卡面时序，亮度狂飙并消散
        active_ephemeral_death: {
            scale: [1, 1, 3.5], // 前 1.2s 保持不动，最后猛然放大
            opacity: [1, 1, 0],
            filter: [
                `brightness(1) drop-shadow(0px 0px 2px ${glowColor})`,
                `brightness(4) drop-shadow(0px 0px 20px ${glowColor})`, // 1.2s 时亮度达到顶峰
                `brightness(5) drop-shadow(0px 0px 40px ${glowColor})`
            ],
            transition: {
                duration: 1.5,
                times: [0, 0.8, 1], // 精准对齐 1.2s (80%) 的挂起时机
                ease: "easeIn"
            }
        },
        // [泰坦] 沉稳呼吸：巨人般的亮度 + 缩放节奏（4s周期，低亮度抬高确保图标可见）
        active_titan_breath: {
            scale: [0.65, 0.65, 0.9, 0.65, 0.65],
            filter: [
                `brightness(0.55) drop-shadow(0px 0px 3px ${glowColor})`,
                `brightness(0.55) drop-shadow(0px 0px 3px ${glowColor})`,
                `brightness(1.15) drop-shadow(0px 0px 12px ${glowColor})`,
                `brightness(0.55) drop-shadow(0px 0px 3px ${glowColor})`,
                `brightness(0.55) drop-shadow(0px 0px 3px ${glowColor})`,
            ],
            transition: {
                duration: 4,
                times: [0, 0.2, 0.4, 0.6, 1], // 低0.8s → 升0.8s → 降0.8s → 低1.6s
                repeat: Infinity,
                ease: "easeInOut"
            }
        },
        // [能力] 金色呼吸灯：沉稳的明暗+缩放循环
        active_ability_breath: {
            scale: [0.75, 0.95, 0.75],
            filter: [
                `brightness(0.6) drop-shadow(0px 0px 3px ${glowColor})`,
                `brightness(1.1) drop-shadow(0px 0px 10px ${glowColor})`,
                `brightness(0.6) drop-shadow(0px 0px 3px ${glowColor})`,
            ],
            transition: { duration: 2.5, repeat: Infinity, ease: "easeInOut" }
        },
        // [光环] 紫色常亮灯：稳定柔和光晕，不做缩放
        active_aura_constant: {
            scale: 1,
            filter: [
                `brightness(1) drop-shadow(0px 0px 6px ${glowColor})`,
            ],
            transition: { duration: 0.5 }
        }
    };

    return (
        <div className={`relative flex items-center justify-center group cursor-help ${sizeClass}`} title={`${config.label}: ${config.description}`}>

            {/* 特效光环底底衬 (仅激活时渲染，避免性能浪费) */}
            {isActive && (
                <motion.div
                    className="absolute inset-0 rounded-full z-0"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 0.6, scale: 1 }}
                    style={{ backgroundColor: glowColor, filter: 'blur(4px)' }}
                />
            )}

            {/* 图标本体 (承载主要的动态光影) */}
            <motion.div
                variants={variants}
                animate={isActive ? `active_${animType}` : 'idle'}
                className="w-full h-full relative z-10 flex items-center justify-center"
            >
                {config.icon ? (
                    <img src={config.icon} alt={config.label}
                      className={`w-full h-full object-contain drop-shadow-md group-hover:brightness-125 transition-all ${isDepleted ? 'grayscale opacity-30 brightness-50' : ''}`} />
                ) : (
                    <span className={`text-[10px] font-bold text-${config.color}-400`}>{config.label.substring(0, 1)}</span>
                )}

                {/* [泰坦] 预显示脉冲加成数字（在 motion.div 内部，随图标一起呼吸缩放） */}
                {keyword === 'Titan' && titanCount !== undefined && titanCount > 0 && !isDepleted && (
                    isOnBoard ? (
                        /* 场上模式：白字蓝紫描边斜体加粗，居中覆盖在图标上 */
                        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                            <span className="text-white font-black italic text-[10px] leading-none"
                                  style={{ textShadow: '0 0 4px rgba(99,102,241,0.9), -1px -1px 0 #6366f1, 1px -1px 0 #6366f1, -1px 1px 0 #6366f1, 1px 1px 0 #6366f1' }}>
                                {titanCount}
                            </span>
                        </div>
                    ) : (
                        /* 手牌/预览模式：右上角蓝紫色数字徽章 */
                        <div className="absolute -top-2 -right-2 z-20 min-w-[18px] h-[18px] rounded-full bg-indigo-600/90 text-white text-[10px] font-black flex items-center justify-center px-1 border border-indigo-300/40 shadow-lg shadow-indigo-500/40">
                            {titanCount}
                        </div>
                    )
                )}
            </motion.div>
        </div>
    );
};

// 暴露给外部 (Card.tsx) 调用的主体容器组件
export const KeywordTray: React.FC<KeywordTrayProps> = ({
    keywords,
    isAttacking = false,
    isDefending = false,
    sizeClass,
    className = '',
    animState,
    depletedKeywords,
    titanCount,
    isOnBoard = false,
}) => {
    if (!keywords || keywords.length === 0) return null;

    // 智能自适应大小：如果词条太多，自动把图标变小防止溢出
    const finalSizeClass = sizeClass || (keywords.length > 6 ? 'w-3 h-3' : 'w-[18px] h-[18px]');

    return (
        <div
            className={`bg-black/90 backdrop-blur-sm px-3 py-1 flex flex-wrap justify-center items-center gap-[2px] max-w-[95%] transition-colors duration-300 ${className}`}
            // 完美的六边形切角设计
            style={{ clipPath: 'polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%)' }}
        >
            {keywords.map(k => (
                <SmartKeywordIcon
                    key={k}
                    keyword={k}
                    sizeClass={finalSizeClass}
                    isAttacking={isAttacking}
                    isDefending={isDefending}
                    animState={animState}
                    isDepleted={depletedKeywords?.includes(k)} // [泰坦] 黯淡关键词 → 图标变灰
                    titanCount={titanCount}
                    isOnBoard={isOnBoard} // [泰坦] 场上模式 → 呼吸灯 + 居中数字
                />
            ))}
        </div>
    );
};