/**
 * DialogueBox — 教程对话系统
 *
 * 角色头像 + 姓名 + 气泡文字 + 点击推进 / 自动推进。
 * 使用 HERO_IMAGES 查找角色立绘，支持自动推进延时。
 *
 * 设计者：程
 * 实现者：莉莉子
 */

import React, { useEffect, useRef, useState } from 'react';
import type { DialogueStep } from '../../data/tutorialScript';
import { HERO_IMAGES } from '../../data/imageData';
import { CARD_CROP_CONFIG } from '../../data/cardCropConfig'; // [新增] 读取头像裁剪

// ════════════════════════════════════════════════════════════

interface DialogueBoxProps {
  /** 对话步骤数据 */
  step: DialogueStep;
  /** 对话完成时回调 */
  onComplete: () => void;
}

export const DialogueBox: React.FC<DialogueBoxProps> = ({ step, onComplete }) => {
  // 与 ScaleWrapper 一致的缩放比
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const handleResize = () => {
      const s = Math.min(window.innerWidth / 1680, window.innerHeight / 1050);
      setScale(s);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [isVisible, setIsVisible] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [isTextFullyShown, setIsTextFullyShown] = useState(false);
  const charIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── 入场动画 ───
  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // ─── 逐字显示效果 ───
  useEffect(() => {
    charIndexRef.current = 0;
    setDisplayedText('');
    setIsTextFullyShown(false);

    const text = step.text;
    if (!text) {
      setIsTextFullyShown(true);
      return;
    }

    timerRef.current = setInterval(() => {
      charIndexRef.current += 1;
      if (charIndexRef.current >= text.length) {
        setDisplayedText(text);
        setIsTextFullyShown(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setDisplayedText(text.slice(0, charIndexRef.current));
      }
    }, 30);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step.text]);

  // ─── 自动推进 ───
  useEffect(() => {
    if (!isTextFullyShown || !step.autoAdvance || !step.autoAdvanceDelay) return;
    const t = setTimeout(() => {
      onComplete();
    }, step.autoAdvanceDelay);
    return () => clearTimeout(t);
  }, [isTextFullyShown, step.autoAdvance, step.autoAdvanceDelay, onComplete]);

  // ─── 点击推进（仅文字显示完毕后有效） ───
  const handleClick = () => {
    if (!isTextFullyShown) {
      // 文字没显示完 → 直接跳至全文
      setDisplayedText(step.text);
      setIsTextFullyShown(true);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    onComplete();
  };

  // ─── 获取角色头像 ───
  const portraitUrl = HERO_IMAGES[step.speakerKey as keyof typeof HERO_IMAGES]?.base ?? '';
  // [新增] 读取头像裁剪配置（与 useCardCrop 一致：优先 localStorage 热更新 → 静态字典 → 默认）
  const avatarCrop = (() => {
    try {
      const localData = localStorage.getItem('dev_crop_overrides');
      if (localData) {
        const parsed = JSON.parse(localData);
        const localCrop = parsed[step.speakerKey]?.[0]?.avatar;
        if (localCrop) return localCrop;
      }
    } catch (e) { /* ignore */ }
    return CARD_CROP_CONFIG[step.speakerKey]?.[0]?.avatar;
  })();

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[95] px-6 pb-6 pt-2
                  transition-all duration-500 ease-out
                  ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
      onClick={handleClick}
      style={{ pointerEvents: 'auto', cursor: isTextFullyShown ? 'pointer' : 'default', transform: `translateY(${isVisible ? '0' : '100%'}) scale(${scale})`, transformOrigin: 'bottom center' }}
    >
      {/* 对话框容器 */}
      <div className="max-w-4xl mx-auto flex items-end gap-4">
        {/* 角色头像 */}
        <div className="flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden
                        border-2 border-cyan-400/60 shadow-lg shadow-cyan-500/20
                        bg-slate-800 flex items-center justify-center"> {/* [核心修复] 补齐 Flex 居中引力场，对齐 ArtStudio 沙盒环境 */}
          {portraitUrl ? (
            <img
              src={portraitUrl}
              alt={step.speakerName}
              // [核心修复] 加入 block 消除幽灵空白，彻底对齐 ArtStudio 里的 <img className="max-w-none block" ... />
              className={avatarCrop ? 'max-w-none block' : 'w-full h-full object-cover'}
              draggable={false}
              style={avatarCrop ? {
                width: '100%',
                height: 'auto',
                transform: `translate(${avatarCrop.offsetX}%, ${avatarCrop.offsetY}%) scale(${avatarCrop.scale})`
              } : undefined}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">
              {step.speakerName.charAt(0)}
            </div>
          )}
        </div>

        {/* 气泡 */}
        <div className="flex-1 bg-slate-900/95 backdrop-blur-sm border border-slate-700/60
                        rounded-2xl rounded-bl-sm px-6 py-4 shadow-xl">
          {/* 名字 */}
          <div className="text-cyan-400 font-bold text-sm mb-1">
            {step.speakerName}
          </div>
          {/* 文字 */}
          <div className="text-white/90 text-base leading-relaxed min-h-[3em]">
            {displayedText}
            {/* 闪烁光标 */}
            {!isTextFullyShown && (
              <span className="inline-block w-0.5 h-4 bg-cyan-400 ml-0.5 animate-pulse" />
            )}
          </div>
          {/* 点击继续提示 */}
          {isTextFullyShown && (
            <div className="text-right text-xs text-white/40 mt-1 animate-pulse">
              {step.autoAdvance ? '···' : '点击继续 ▸'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
