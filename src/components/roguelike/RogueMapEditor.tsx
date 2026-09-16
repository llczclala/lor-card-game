// ==========================================
// 悖论迷宫 · 肉鸽地图编辑器（GM STUDIO 插件）
// 交互：左键拖节点 = 移动节点；左键拖空白 = 平移地图；右键按住拖 = 框选多选
//      滚轮缩放 · Ctrl+Z 撤销 · Delete 删除 · 增删节点 · 调类型·大小·坐标
// [2026-09-04 连线编辑] 工具栏「连线」模式：点起点→点终点建连（可扇出多个）；点已画线段删除该连接；点空白取消。
//      属性面板「连接(next)」也可勾选目标 / ✕ 移除，带防自连/重复/防环守卫。
// ⚠️ 坐标系统（对齐夏目大屏编辑器框选方案）：
//    选框/节点都渲染在画布容器内部，用「画布内部坐标」；换算统一用
//    canvasRef.getBoundingClientRect()（实时视觉坐标）÷ 缩放系数。换算与渲染共用
//    同一个 rect，数学自洽，且自动适应侧边栏挤压/视口变化。
// ⚠️ 数据源与游戏地图一致（三张难度图 ROGUE_MAPS，顶部切换 普通/机密/绝密 分别编辑）。导出后粘贴回 mapLayout.ts 对应常量生效。
// ==========================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Copy, Undo2, Redo2, Map as MapIcon, MousePointerClick, Link2 } from 'lucide-react';
import {
    ROGUE_MAPS, MAP_WIDTH, MAP_HEIGHT,
    type RogueNode, type RogueNodeType,
} from '../../data/roguelike/mapLayout';
import { ROGUE_DIFFICULTIES, type RogueDifficulty } from '../../data/roguelike/difficulties'; // [2026-08-28] 三难度切换
import { MapNode } from './MapNode';
import mapZero from '../../image/map/map_zero.webp';
import { DIALOGUE_BG_KEYS } from '../../data/roguelike/dialogueBg'; // [2026-08-27] 进入面板背景图选项

const NODE_TYPE_OPTIONS: RogueNodeType[] = ['start', 'enhance', 'battle', 'elite', 'boss', 'rest', 'shop', 'event', 'treasure'];
const TYPE_LABELS: Record<RogueNodeType, string> = {
    start: '起点战旗', enhance: '迷宫强化', battle: '战斗', elite: '精英',
    boss: 'Boss', rest: '休息', shop: '商店', event: '事件', treasure: '宝箱',
};
const MAX_HISTORY = 50;
const MAX_SCALE = 3;

interface RogueMapEditorProps {
    onClose: () => void;
}

export const RogueMapEditor: React.FC<RogueMapEditorProps> = ({ onClose }) => {
    // ── 编辑数据（三张难度地图，切换编辑对应难度） ──
    const [difficulty, setDifficulty] = useState<RogueDifficulty>('normal'); // [2026-08-28] 当前编辑难度
    const [nodes, setNodes] = useState<RogueNode[]>(() =>
        (ROGUE_MAPS.normal[0]?.nodes ?? []).map(n => ({ ...n }))
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [past, setPast] = useState<RogueNode[][]>([]);
    const [future, setFuture] = useState<RogueNode[][]>([]);
    const [copied, setCopied] = useState(false);
    // 框选：画布内部坐标（除以缩放系数后的原始坐标）
    const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    // [2026-09-04 连线编辑] 连线模式 + 待连起点（pending 源节点高亮）
    const [linkMode, setLinkMode] = useState(false);
    const [linkFromId, setLinkFromId] = useState<string | null>(null);
    const linkFromIdRef = useRef(linkFromId);
    useEffect(() => { linkFromIdRef.current = linkFromId; }, [linkFromId]);

    // 画布变换：画布居中 + translate(tx,ty) 平移 + scale 缩放（origin center，夏目式）
    const [canvasTf, setCanvasTf] = useState({ scale: 0.3, tx: 0, ty: 0 });

    // refs（避免闭包读旧值）
    const nodesRef = useRef(nodes);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    const selectedRef = useRef(selectedIds);
    useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);
    const canvasTfRef = useRef(canvasTf);
    useEffect(() => { canvasTfRef.current = canvasTf; }, [canvasTf]);

    const workspaceRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ ids: string[]; startX: number; startY: number; origPos: Map<string, { x: number; y: number }>; before: RogueNode[] } | null>(null);
    const panRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);
    const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({}); // 节点 DOM 引用（框选判断用真实屏幕位置）

    const selected = nodes.find(n => selectedIds.has(n.id)) ?? null;
    const selectedCount = selectedIds.size;

    // ── 画布边界钳制（无黑边） ──
    // 画布 canvasRect.left（相对 workspace）= w/2 + tx - MAP_WIDTH*s/2（画布中心在容器中心+tx）
    const clampCanvas = useCallback((tf: { scale: number; tx: number; ty: number }, w: number, h: number) => {
        const s = tf.scale;
        const cx = w / 2 - MAP_WIDTH * s / 2;
        const cy = h / 2 - MAP_HEIGHT * s / 2;
        const minX = Math.min(0, w - MAP_WIDTH * s) - cx;
        const maxX = Math.max(0, w - MAP_WIDTH * s) - cx;
        const minY = Math.min(0, h - MAP_HEIGHT * s) - cy;
        const maxY = Math.max(0, h - MAP_HEIGHT * s) - cy;
        return {
            ...tf,
            tx: Math.max(minX, Math.min(maxX, tf.tx)),
            ty: Math.max(minY, Math.min(maxY, tf.ty)),
        };
    }, []);

    // ── 画布适配：容器实测尺寸 → 无黑边居中（tx=ty=0 使画布中心对准容器中心） ──
    useEffect(() => {
        const el = workspaceRef.current;
        if (!el) return;
        const recompute = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            const minZoom = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT);
            setCanvasTf(_prev => clampCanvas({ scale: minZoom, tx: 0, ty: 0 }, w, h));
        };
        recompute();
        window.addEventListener('resize', recompute);
        return () => window.removeEventListener('resize', recompute);
    }, [clampCanvas]);

    // ── 撤销 / 重做 ──
    const commit = useCallback((next: RogueNode[]) => {
        setPast(prev => [...prev.slice(-MAX_HISTORY), nodesRef.current]);
        setNodes(next);
        setFuture([]);
    }, []);

    const undo = useCallback(() => {
        if (past.length === 0) return;
        const last = past[past.length - 1];
        setFuture(f => [nodesRef.current, ...f]);
        setNodes(last);
        setPast(prev => prev.slice(0, -1));
        setSelectedIds(new Set());
    }, [past]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const [head, ...rest] = future;
        setPast(p => [...p.slice(-MAX_HISTORY), nodesRef.current]);
        setNodes(head);
        setFuture(rest);
        setSelectedIds(new Set());
    }, [future]);

    // 键盘：Ctrl+Z 撤销 / Ctrl+Shift+Z·Ctrl+Y 重做 / Delete 删除
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault(); redo();
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current.size > 0) {
                e.preventDefault();
                deleteSelected();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [undo, redo]);

    // ── 坐标换算（[2026-08-05 全面修正 ScaleWrapper]） ──
    // 游戏外层有 ScaleWrapper transform scale（窗口缩放后实测 k≈0.617），clientX 是浏览器坐标、
    // getBoundingClientRect 是游戏缩放后坐标。所有「屏幕→画布内部」换算必须用**综合缩放**：
    //   compos = 编辑器画布 scale × 游戏 scale（= 画布实际屏幕宽 / MAP_WIDTH）
    const getComposScale = useCallback(() => {
        const rect = canvasRef.current?.getBoundingClientRect();
        return rect && rect.width > 0 ? rect.width / MAP_WIDTH : 1;
    }, []);
    // 游戏外层 scale：浏览器 px ↔ workspace CSS px 的换算系数
    const getGameScale = useCallback(() => {
        const compos = getComposScale();
        const s = canvasTfRef.current.scale;
        return s > 0 ? compos / s : 1;
    }, [getComposScale]);

    // ── 滚轮缩放（以鼠标为中心） ──
    useEffect(() => {
        const el = workspaceRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = canvasRef.current?.getBoundingClientRect();
            const ws = workspaceRef.current?.getBoundingClientRect();
            if (!rect || !ws) return;
            const { scale } = canvasTfRef.current;
            const compos = rect.width / MAP_WIDTH; // 当前综合缩放（编辑器 × 游戏 ScaleWrapper）
            const gs = compos / scale;             // 游戏外层 scale
            const mapX = (e.clientX - rect.left) / compos;
            const mapY = (e.clientY - rect.top) / compos;
            const factor = e.deltaY < 0 ? 1.15 : 0.85;
            // 无黑边缩放下限（与游戏 RogueMapScreen 一致）：地图两维必须 >= 视口，缩不出黑边
            const w = workspaceRef.current?.clientWidth ?? 0;
            const h = workspaceRef.current?.clientHeight ?? 0;
            const minZoom = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT);
            const newScale = Math.max(minZoom, Math.min(MAX_SCALE, scale * factor));
            // 保持鼠标下的地图点：canvasRect.left = ws.left + (w/2 + tx)*gs - 宽*newScale*gs/2
            const txNew = (e.clientX - ws.left) / gs - w / 2 + MAP_WIDTH * newScale / 2 - mapX * newScale;
            const tyNew = (e.clientY - ws.top) / gs - h / 2 + MAP_HEIGHT * newScale / 2 - mapY * newScale;
            setCanvasTf(clampCanvas({ scale: newScale, tx: txNew, ty: tyNew }, w, h));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [clampCanvas]);

    // ── 单节点属性修改（每次产生历史） ──
    const applyToSelected = useCallback((patch: Partial<RogueNode>) => {
        const selId = Array.from(selectedRef.current)[0];
        if (!selId) return;
        setPast(prev => [...prev.slice(-MAX_HISTORY), nodesRef.current]);
        setNodes(prev => prev.map(n => (n.id === selId ? { ...n, ...patch } : n)));
        setFuture([]);
    }, []);

    // ── 节点指针交互：左键拖节点 ──
    const onNodePointerDown = (e: React.PointerEvent, node: RogueNode) => {
        if (e.button !== 0) return; // 仅左键；右键放行给画布框选
        e.stopPropagation();
        const curSel = selectedRef.current;
        let ids: string[];
        if (e.shiftKey) {
            const next = new Set(curSel);
            if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
            setSelectedIds(next);
            ids = Array.from(next);
        } else if (curSel.has(node.id)) {
            ids = Array.from(curSel);
        } else {
            setSelectedIds(new Set([node.id]));
            ids = [node.id];
        }
        const origPos = new Map<string, { x: number; y: number }>();
        for (const id of ids) {
            const n = nodesRef.current.find(x => x.id === id);
            if (n) origPos.set(id, { x: n.x, y: n.y });
        }
        dragRef.current = { ids, startX: e.clientX, startY: e.clientY, origPos, before: nodesRef.current };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    // ── 画布指针：左键拖空白 = 平移；右键拖 = 框选 ──
    const onCanvasPointerDown = (e: React.PointerEvent) => {
        if (e.button === 2) {
            e.preventDefault();
            // 框选直接用 client 屏幕坐标（鼠标真实位置，绕开一切 transform 换算）
            const m = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
            marqueeRef.current = m;
            setMarquee(m);
            setSelectedIds(new Set());
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } else if (e.button === 0) {
            panRef.current = {
                startX: e.clientX, startY: e.clientY,
                origTx: canvasTfRef.current.tx, origTy: canvasTfRef.current.ty,
            };
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }
    };

    const onCanvasPointerMove = (e: React.PointerEvent) => {
        // 1. 节点拖拽（画布内部坐标换算：屏幕 px / scale）
        const d = dragRef.current;
        if (d) {
            const compos = getComposScale(); // 综合缩放（编辑器 × 游戏 ScaleWrapper）
            const dx = (e.clientX - d.startX) / compos;
            const dy = (e.clientY - d.startY) / compos;
            setNodes(prev => prev.map(n => {
                const orig = d.origPos.get(n.id);
                return orig ? { ...n, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) } : n;
            }));
            return;
        }
        // 2. 地图平移（画布内部像素，translate 平移）
        const p = panRef.current;
        if (p) {
            const w = workspaceRef.current?.clientWidth ?? 0;
            const h = workspaceRef.current?.clientHeight ?? 0;
            const gs = getGameScale(); // 浏览器 px → workspace CSS px（画布 translate 是 CSS 坐标，被游戏 scale 显示）
            setCanvasTf(tf => clampCanvas({
                ...tf,
                tx: p.origTx + (e.clientX - p.startX) / gs,
                ty: p.origTy + (e.clientY - p.startY) / gs,
            }, w, h));
            return;
        }
        // 3. 框选（client 屏幕坐标；节点用 DOM getBoundingClientRect 真实位置判断，与选框同一坐标系）
        const m = marqueeRef.current;
        if (m) {
            const next = { ...m, x1: e.clientX, y1: e.clientY };
            marqueeRef.current = next;
            setMarquee(next);
            const minX = Math.min(next.x0, next.x1), maxX = Math.max(next.x0, next.x1);
            const minY = Math.min(next.y0, next.y1), maxY = Math.max(next.y0, next.y1);
            const inside: string[] = [];
            for (const n of nodesRef.current) {
                const el = nodeRefs.current[n.id];
                if (!el) continue;
                const r = el.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) inside.push(n.id);
            }
            setSelectedIds(new Set(inside));
        }
    };

    const onCanvasPointerUp = () => {
        if (dragRef.current) {
            const before = dragRef.current.before; // [2026-08-16] 回调外取值，避免 setState 回调内 dragRef.current 重新判定 possibly-null
            setPast(prev => [...prev.slice(-MAX_HISTORY), before]);
            setFuture([]);
            dragRef.current = null;
        }
        panRef.current = null;
        marqueeRef.current = null;
        setMarquee(null);
    };

    // [2026-08-28 莉莉子] 三难度编辑切换：加载对应难度图（当前工具「导出即保存」，有未导出修改时确认丢弃）
    const DIFFICULTY_STYLE: Record<RogueDifficulty, string> = {
        normal: 'text-emerald-400 border-emerald-400/40',
        secret: 'text-sky-400 border-sky-400/40',
        topsecret: 'text-red-400 border-red-400/40',
    };
    const switchDifficulty = (d: RogueDifficulty) => {
        if (d === difficulty) return;
        const dirty = past.length > 0 || future.length > 0;
        if (dirty && !window.confirm('切换难度将丢弃当前未导出的编辑，继续？')) return;
        setDifficulty(d);
        setNodes((ROGUE_MAPS[d][0]?.nodes ?? []).map(n => ({ ...n })));
        setSelectedIds(new Set());
        setLinkMode(false);      // [2026-09-04 连线编辑] 切难度重置连线状态
        setLinkFromId(null);
        setPast([]);
        setFuture([]);
        setCopied(false);
    };

    // ── 增删节点 ──
    const addNode = () => {
        const id = `node_${Date.now()}`;
        const newNode: RogueNode = { id, type: 'battle', x: 200 + (nodesRef.current.length % 8) * 30, y: 400, size: 44, next: [] };
        commit([...nodesRef.current, newNode]);
        setSelectedIds(new Set([id]));
    };

    const deleteSelected = () => {
        const ids = selectedRef.current;
        if (ids.size === 0) return;
        commit(
            nodesRef.current
                .filter(n => !ids.has(n.id))
                .map(n => ({ ...n, next: n.next.filter(id => !ids.has(id)) }))
        );
        setSelectedIds(new Set());
    };

    // ==========================================
    // [2026-09-04 连线编辑] 创建/删除节点连接（next）
    // ==========================================
    /** 建立 fromId→toId 连接。防自连 / 防重复 / 防环（若 to 已能回到 from 则成环，阻止）。
     *  @returns 是否成功加入 */
    const addLink = useCallback((fromId: string, toId: string): boolean => {
        if (fromId === toId) return false;
        const list = nodesRef.current;
        const from = list.find(n => n.id === fromId);
        const to = list.find(n => n.id === toId);
        if (!from || !to) return false;
        if (to.type === 'start') { window.alert('起点(start)只能作为出发端，不能作为连接目标'); return false; }
        if (from.next.includes(toId)) return false; // 已存在
        // 防环：若 to 已可达 from，再加 from→to 会形成死循环路径
        const nextMap = new Map(list.map(n => [n.id, n.next]));
        const seen = new Set<string>();
        const stack = [toId];
        while (stack.length) {
            const id = stack.pop()!;
            if (id === fromId) { window.alert(`⚠️ 该连接会形成死循环（${toId} 已能绕回 ${fromId}），已阻止`); return false; }
            if (seen.has(id)) continue;
            seen.add(id);
            (nextMap.get(id) ?? []).forEach(x => stack.push(x));
        }
        commit(list.map(n => (n.id === fromId ? { ...n, next: [...n.next, toId] } : n)));
        return true;
    }, [commit]);

    /** 移除 fromId→toId 连接 */
    const removeLink = useCallback((fromId: string, toId: string) => {
        commit(nodesRef.current.map(n => (n.id === fromId ? { ...n, next: n.next.filter(x => x !== toId) } : n)));
    }, [commit]);

    /** 连线模式下的节点点击：第一下设起点（高亮），第二下连向目标（保持起点便于扇出）；再点起点取消 */
    const handleLinkNodeClick = (node: RogueNode) => {
        if (linkFromIdRef.current === null) {
            setLinkFromId(node.id);
            setSelectedIds(new Set([node.id]));
            return;
        }
        if (linkFromIdRef.current === node.id) {
            setLinkFromId(null); // 再点一次取消起点
            return;
        }
        addLink(linkFromIdRef.current, node.id);
        setSelectedIds(new Set([node.id])); // 目标高亮；起点仍 pending（linkFromId 不变）便于扇出
    };

    // ── 导出源码 ──
    const exportCode = () => {
        const list = nodesRef.current.map(n => {
            const sizePart = n.size ? `, size: ${n.size}` : '';
            const bgPart = n.dialogueBg ? `, dialogueBg: '${n.dialogueBg}'` : ''; // [2026-08-27] 进入面板背景图
            const nextPart = n.next.length ? `[${n.next.map(id => `'${id}'`).join(', ')}]` : '[]';
            return `            { id: '${n.id}', type: '${n.type}', x: ${n.x}, y: ${n.y}${sizePart}${bgPart}, next: ${nextPart} },`;
        }).join('\n');
        const constName = `ROGUE_MAP_${difficulty.toUpperCase()}`; // [2026-08-28] 按当前难度导出对应常量
        const code = `export const ${constName}: RogueAct[] = [
    {
        index: 1,
        name: '悖论迷宫',
        nodes: [
${list}
        ],
    },
];`;
        navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    // 连线（地图坐标，svg viewBox 自动缩放）；携带 fromId/toId 供连线模式点选删除
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const lines: Array<{ fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number }> = [];
    for (const node of nodes) {
        for (const nextId of node.next) {
            const t = nodeById.get(nextId);
            if (t) lines.push({ fromId: node.id, toId: nextId, x1: node.x, y1: node.y, x2: t.x, y2: t.y });
        }
    }

    // 选框渲染在 workspace 层。⚠️ 关键修复 [2026-08-05 实测]：游戏外层有 ScaleWrapper transform scale
    // （窗口缩放后 k≈0.617）。clientX 是浏览器坐标、getBoundingClientRect 是游戏缩放后坐标，混用会导致选框偏左上。
    // 解法：把 client 偏移除以祖先缩放 k = rect.width/clientWidth，选框被祖先 scale 压缩后正好回到鼠标位置。
    const marqueeStyle = marquee ? (() => {
        const wsEl = workspaceRef.current;
        if (!wsEl) return null;
        const ws = wsEl.getBoundingClientRect();
        const k = ws.width / wsEl.clientWidth || 1; // 祖先 transform scale（无缩放时为 1）
        return {
            left: (Math.min(marquee.x0, marquee.x1) - ws.left) / k,
            top: (Math.min(marquee.y0, marquee.y1) - ws.top) / k,
            width: Math.abs(marquee.x1 - marquee.x0) / k,
            height: Math.abs(marquee.y1 - marquee.y0) / k,
        };
    })() : null;

    const { scale } = canvasTf;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full flex flex-col bg-black text-white font-sans select-none"
        >
            {/* 顶部工具栏 */}
            <div className="h-14 shrink-0 flex items-center gap-2 px-4 bg-slate-900 border-b border-white/10">
                <MapIcon size={20} className="text-emerald-400" />
                <span className="font-black tracking-widest mr-2">肉鸽地图编辑器</span>
                {/* [2026-08-28] 三难度切换（普通/机密/绝密分别编辑保存） */}
                <div className="flex items-center gap-1 ml-1">
                    {ROGUE_DIFFICULTIES.map(d => (
                        <button key={d.key} onClick={() => switchDifficulty(d.key)}
                            title={`编辑${d.label}难度地图`}
                            className={`px-3 py-1.5 rounded-md text-sm font-bold border transition-colors ${
                                difficulty === d.key
                                    ? `bg-white/10 ${DIFFICULTY_STYLE[d.key]}`
                                    : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10 hover:text-gray-300'
                            }`}>
                            {d.label}
                        </button>
                    ))}
                </div>
                <button onClick={undo} disabled={past.length === 0} title="撤销 (Ctrl+Z)"
                    className="p-2 rounded-md bg-white/5 hover:bg-white/15 disabled:opacity-30">
                    <Undo2 size={16} />
                </button>
                <button onClick={redo} disabled={future.length === 0} title="重做 (Ctrl+Y)"
                    className="p-2 rounded-md bg-white/5 hover:bg-white/15 disabled:opacity-30">
                    <Redo2 size={16} />
                </button>
                <span className="text-xs text-gray-600 font-mono ml-1 hidden lg:inline">左键拖节点移动 · 左键拖空白平移 · 右键拖框选 · 滚轮缩放 · Ctrl+Z 撤销 · 「连线」点两点建连/点线段删连</span>
                <div className="flex-1" />
                <span className="text-xs text-gray-500 font-mono">{selectedCount > 0 ? `已选 ${selectedCount} 个节点` : ''}</span>
                <button onClick={addNode} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-sm font-bold flex items-center gap-1.5">
                    <Plus size={16} /> 新增节点
                </button>
                <button onClick={deleteSelected} disabled={selectedIds.size === 0}
                    className="px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 disabled:opacity-40 text-sm font-bold flex items-center gap-1.5">
                    <Trash2 size={16} /> 删除
                </button>
                <button onClick={() => { setLinkMode(m => !m); setLinkFromId(null); }}
                    title="连线模式：点起点节点 → 点终点节点建连（可连多个=扇出）；点线段删除该连接；点空白取消起点"
                    className={`px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5 border transition-colors ${
                        linkMode ? 'bg-yellow-500/20 border-yellow-400/60 text-yellow-300' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}>
                    <Link2 size={16} /> {linkMode ? '连线中' : '连线'}
                </button>
                <button onClick={exportCode} className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-bold flex items-center gap-1.5">
                    <Copy size={16} /> {copied ? '已复制 ✓' : '导出源码'}
                </button>
                <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm font-bold flex items-center gap-1.5">
                    <X size={16} /> 关闭
                </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 中央画布工作区 */}
                <div ref={workspaceRef} className="flex-1 relative overflow-hidden bg-[#0a0a12] cursor-grab active:cursor-grabbing"
                    onPointerDown={onCanvasPointerDown}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onPointerLeave={onCanvasPointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {/* 画布容器：居中 + translate 平移 + scale 缩放（origin center，夏目式） */}
                    <div
                        ref={canvasRef}
                        style={{
                            position: 'absolute',
                            left: '50%', top: '50%',
                            width: MAP_WIDTH, height: MAP_HEIGHT,
                            transform: `translate(calc(-50% + ${canvasTf.tx}px), calc(-50% + ${canvasTf.ty}px)) scale(${scale})`,
                            transformOrigin: 'center',
                        }}
                        className="shadow-2xl border border-white/10"
                    >
                        <img src={mapZero} width={MAP_WIDTH} height={MAP_HEIGHT}
                            className="w-full h-full object-cover pointer-events-none" draggable={false} alt="地图背景" />
                        {/* 连线层（viewBox 自动缩放地图坐标）；连线模式下可点线段删除、点空白取消待连起点 */}
                        <svg
                            className="absolute inset-0 w-full h-full"
                            style={{ pointerEvents: linkMode ? 'auto' : 'none' }}
                            width={MAP_WIDTH} height={MAP_HEIGHT}
                            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                            onPointerDown={(e) => {
                                if (linkMode) { e.stopPropagation(); if (linkFromId) setLinkFromId(null); } // 点空白 → 取消待连起点
                            }}
                        >
                            {lines.map((l, i) => {
                                const isFromPending = linkMode && linkFromId === l.fromId; // 待连起点发出的线亮黄
                                return (
                                    <g key={i}>
                                        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                            stroke={isFromPending ? '#facc15' : 'white'}
                                            strokeWidth={6 / scale} strokeDasharray={`${20 / scale} ${16 / scale}`}
                                            strokeOpacity={isFromPending ? 0.9 : 0.55} />
                                        {linkMode && (
                                            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                                stroke="transparent" strokeWidth={26 / scale}
                                                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { e.stopPropagation(); removeLink(l.fromId, l.toId); }} // 连线模式点线段 = 删除该连接
                                            />
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                        {/* 节点（画布内部坐标，wrapper 居中） */}
                        {nodes.map(node => {
                            const isSel = selectedIds.has(node.id);
                            const isLinkFrom = linkMode && linkFromId === node.id; // 连线模式的待连起点
                            const highlight = isSel || isLinkFrom;
                            return (
                                <div
                                    key={node.id}
                                    ref={(el) => { nodeRefs.current[node.id] = el; }}
                                    style={{ position: 'absolute', left: node.x, top: node.y, transform: 'translate(-50%, -50%)' }}
                                    onPointerDown={(e) => {
                                        if (linkMode) { e.stopPropagation(); return; } // 连线模式：不拖拽、交给点击连线下发
                                        onNodePointerDown(e, node);
                                    }}
                                    onClick={(e) => {
                                        if (linkMode) { e.stopPropagation(); handleLinkNodeClick(node); }
                                    }}
                                    className="relative"
                                >
                                    <MapNode
                                        type={node.type}
                                        x={0}
                                        y={0}
                                        state={highlight ? 'current' : 'available'}
                                        size={node.size}
                                        onActivate={() => { if (!linkMode) setSelectedIds(new Set([node.id])); }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* 框选矩形（workspace 层，client 屏幕坐标，绝对准确） */}
                    {marqueeStyle && (
                        <div className="absolute border-2 border-cyan-400/80 bg-cyan-400/10 pointer-events-none"
                            style={marqueeStyle} />
                    )}
                </div>

                {/* 右侧属性面板 */}
                <div className="w-80 shrink-0 bg-slate-900 border-l border-white/10 p-4 overflow-y-auto">
                    {selected && selectedIds.size === 1 ? (
                        <>
                            <h3 className="font-black text-lg mb-1">节点属性</h3>
                            <p className="text-xs font-mono text-gray-500 mb-4">{selected.id}</p>

                            <label className="block text-xs text-gray-400 mb-1">类型</label>
                            <select value={selected.type}
                                onChange={e => applyToSelected({ type: e.target.value as RogueNodeType })}
                                className="w-full mb-4 px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-sm font-bold">
                                {NODE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                            </select>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">X 坐标</label>
                                    <input type="number" value={selected.x}
                                        onChange={e => applyToSelected({ x: Number(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-sm font-mono" />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1">Y 坐标</label>
                                    <input type="number" value={selected.y}
                                        onChange={e => applyToSelected({ y: Number(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-sm font-mono" />
                                </div>
                            </div>

                            <label className="block text-xs text-gray-400 mb-1">大小 <span className="text-gray-600 font-mono">{selected.size ?? 44}px</span></label>
                            <input type="range" min={20} max={100} value={selected.size ?? 44}
                                onChange={e => applyToSelected({ size: Number(e.target.value) })}
                                className="w-full mb-4 accent-violet-500" />

                            <label className="block text-xs text-gray-400 mb-1">进入面板背景图 <span className="text-gray-600 font-mono">{selected.dialogueBg ? `dialogue/${selected.dialogueBg}.png` : '随机'}</span></label>
                            <select value={selected.dialogueBg ?? ''}
                                onChange={e => applyToSelected({ dialogueBg: e.target.value || undefined })}
                                className="w-full mb-4 px-3 py-2 rounded-md bg-slate-800 border border-white/10 text-sm font-bold">
                                <option value="">随机（进入时随机一张）</option>
                                {DIALOGUE_BG_KEYS.map(k => <option key={k} value={k}>dialogue/{k}.png</option>)}
                            </select>

                            <label className="block text-xs text-gray-400 mb-1">连接（next）<span className="text-gray-600 font-mono"> {selected.next.length} 条</span></label>
                            {selected.next.length > 0 ? (
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {selected.next.map(tid => {
                                        const tn = nodeById.get(tid);
                                        return (
                                            <span key={tid}
                                                className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-mono text-gray-300">
                                                {tn?.id ?? tid}
                                                <button title="删除此连接" onClick={() => removeLink(selected.id, tid)}
                                                    className="px-1 rounded hover:bg-red-500/40 text-red-400 hover:text-red-200">✕</button>
                                            </span>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs font-mono text-gray-600 mb-3">无 — 用下方勾选或工具栏「连线」添加</p>
                            )}

                            <label className="block text-xs text-gray-400 mb-1">加入目标节点</label>
                            <div className="max-h-44 overflow-y-auto border border-white/10 rounded-md mb-4 bg-black/20 text-xs font-mono no-scrollbar">
                                {nodes.filter(c => c.id !== selected.id && c.type !== 'start').map(c => {
                                    const on = selected.next.includes(c.id);
                                    return (
                                        <label key={c.id}
                                            className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-white/5 transition-colors ${on ? 'text-yellow-300' : 'text-gray-400'}`}>
                                            <input type="checkbox" checked={on}
                                                onChange={(e) => {
                                                    if (e.target.checked) addLink(selected.id, c.id);
                                                    else removeLink(selected.id, c.id);
                                                }}
                                                className="accent-yellow-500" />
                                            <span className="truncate">{c.id}</span>
                                            <span className="text-[9px] ml-auto shrink-0">{TYPE_LABELS[c.type]}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </>
                    ) : selectedIds.size > 1 ? (
                        <>
                            <h3 className="font-black text-lg mb-4">多选 · {selectedIds.size} 个节点</h3>
                            <p className="text-xs text-gray-500 leading-relaxed mb-4">
                                已选中 {selectedIds.size} 个节点。按住任一节点拖动可整体移动；Delete 可批量删除。
                            </p>
                            <button onClick={() => setSelectedIds(new Set())}
                                className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-sm font-bold">
                                取消选择
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                            <MousePointerClick size={32} className="text-gray-600" />
                            <p className="text-sm text-center leading-relaxed">
                                左键拖节点 = 移动<br />
                                左键拖空白 = 平移地图<br />
                                右键拖 = 框选 · 滚轮缩放<br />
                                Ctrl+Z = 撤销
                            </p>
                        </div>
                    )}
                    {selectedIds.size <= 1 && (
                        <p className="text-[11px] text-gray-600 leading-relaxed border-t border-white/10 pt-3 mt-4">
                            正在编辑 <span className="text-violet-400">ROGUE_MAP_{difficulty.toUpperCase()}</span>（{ROGUE_DIFFICULTIES.find(d => d.key === difficulty)?.label} 难度）地图。
                            三张难度图分别编辑保存。点「导出源码」复制，粘贴回 <span className="text-violet-400">src/data/roguelike/mapLayout.ts</span> 覆盖对应常量生效。
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
