import { useCallback } from 'react';
import type { CursorState } from '../data/mouseData';

export const useCursor = () => {
    // 切换全局指针状态
    const setCursor = useCallback((state: CursorState | null) => {
        if (state) {
            document.body.setAttribute('data-game-cursor', state);
        } else {
            // 传入 null 时，剥离覆盖，恢复为默认状态
            document.body.removeAttribute('data-game-cursor');
        }
    }, []);

    return { setCursor };
};