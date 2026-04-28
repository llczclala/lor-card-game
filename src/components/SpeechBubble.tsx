import React from 'react';

export const SpeechBubble: React.FC = () => {
    return (
        <div className="absolute -top-12 -right-8 z-[60] animate-pop-in">
            {/* 气泡主体 */}
            <div className="bg-white text-black px-3 py-2 rounded-xl rounded-bl-none shadow-lg border-2 border-gray-200 flex items-center justify-center min-w-[3rem]">
                {/* 动态点点点 */}
                <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-black rounded-full animate-bounce"></div>
                </div>
            </div>
            {/* 气泡小尾巴 */}
            <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border-b-2 border-l-2 border-gray-200 transform translate-y-1.5 -translate-x-0.5 rotate-45"></div>
        </div>
    );
};