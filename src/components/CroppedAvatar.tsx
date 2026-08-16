// ==========================================
// 通用裁剪头像组件
// [2026-08-10 莉莉子] 读取 cardCropConfig 的 avatar 裁剪配置渲染头像，
//   供敌方卡组编辑器 / 肉鸽地图等圆形头像位置使用（让卡面编辑器调好的头像在游戏中生效）。
//   形状由外层 className 控制（rounded-full 圆形 / rounded-xl 方形等）。
//   读取优先级：localStorage 热更新（dev_crop_overrides）→ 静态字典 → 无配置时原图居中。
// ==========================================
import React from 'react';
import { CARD_DB } from '../data/cards';
import { CARD_CROP_CONFIG } from '../data/cardCropConfig';

interface CroppedAvatarProps {
    cardKey: string;
    skinId?: number;
    className?: string; // 外层形状/尺寸类：默认圆形 64px
}

// 读取 avatar 裁剪配置：localStorage 热更新优先 → 静态字典 → null
const getAvatarCrop = (cardKey: string, skinId: number) => {
    try {
        const overrides = JSON.parse(localStorage.getItem('dev_crop_overrides') || '{}');
        const o = overrides[cardKey]?.[skinId]?.['avatar'];
        if (o?.scale !== undefined) return o;
    } catch { /* ignore parse errors */ }
    return CARD_CROP_CONFIG[cardKey]?.[skinId]?.['avatar']
        || CARD_CROP_CONFIG[cardKey]?.[0]?.['avatar']
        || null;
};

export const CroppedAvatar: React.FC<CroppedAvatarProps> = ({ cardKey, skinId = 0, className = 'w-16 h-16 rounded-full' }) => {
    const card = CARD_DB[cardKey];
    if (!card) return null;

    const crop = getAvatarCrop(cardKey, skinId);
    const scale = crop?.scale ?? 1;
    const offsetX = crop?.offsetX ?? 0;
    const offsetY = crop?.offsetY ?? 0;
    // [2026-08-10] 法术卡面为横向 → 高撑满容器；单位/英雄卡面竖向 → 宽撑满
    const isSpell = card.type.includes('spell');

    return (
        <div className={`relative overflow-hidden bg-black ${className}`}>
            <img
                src={card.imageUrl}
                alt={card.name}
                className="max-w-none pointer-events-none absolute"
                style={{
                    top: '50%', left: '50%',
                    width: isSpell ? 'auto' : '100%',
                    height: isSpell ? '100%' : 'auto',
                    // calc 结合百分比偏移与缩放，对齐 GameLobby renderAvatar / ArtStudio 工作台算法
                    transform: `translate(calc(-50% + ${offsetX}%), calc(-50% + ${offsetY}%)) scale(${scale})`
                }}
            />
        </div>
    );
};
