import React, { useState } from 'react';
import { User, Plus, Trash2, Check, X } from 'lucide-react';
// [修正] 改为从 cards 导入数据，避免直接引用 imageData 可能导致的路径问题
import { CARD_DB } from '../data/cards';
import type { UserSummary } from '../utils/storageUtils';

interface AccountSelectionModalProps {
    currentUserUid: string;
    userList: UserSummary[];
    onConfirmSwitch: (uid: string) => void;
    onDeleteUser: (uid: string) => void;
    onCreateUser: (name: string) => void;
    onClose: () => void;
}

export const AccountSelectionModal: React.FC<AccountSelectionModalProps> = ({
    currentUserUid,
    userList,
    onConfirmSwitch,
    onDeleteUser,
    onCreateUser,
    onClose
}) => {
    const [selectedUid, setSelectedUid] = useState<string>(currentUserUid);
    const [isCreating, setIsCreating] = useState(false);
    const [newUserName, setNewUserName] = useState('');

    const handleCreate = () => {
        if (!newUserName.trim()) return;
        onCreateUser(newUserName);
        setIsCreating(false);
        setNewUserName('');
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div
                className="w-[600px] bg-slate-900 border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 标题栏 */}
                <div className="p-6 border-b border-white/10 bg-slate-800/50 flex justify-between items-center">
                    <h2 className="text-xl font-black tracking-widest text-white flex items-center gap-3">
                        <User className="text-blue-400" /> SELECT ACCOUNT
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* 账户列表 */}
                <div className="flex-1 p-6 overflow-y-auto max-h-[400px] space-y-3 custom-scrollbar">
                    {userList.map(user => {
                        const isSelected = selectedUid === user.uid;
                        const isCurrent = currentUserUid === user.uid;

                        // [修正] 从 CARD_DB 获取头像图片 (默认里芙)
                        const avatarId = user.avatarId || 'lyfe';
                        const avatar = CARD_DB[avatarId]?.imageUrl || CARD_DB['lyfe'].imageUrl;

                        return (
                            <div
                                key={user.uid}
                                onClick={() => setSelectedUid(user.uid)}
                                className={`
                                    relative flex items-center gap-4 p-3 rounded-xl border-2 cursor-pointer transition-all
                                    ${isSelected
                                        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                                        : 'border-white/5 bg-white/5 hover:border-white/20 hover:bg-white/10'}
                                `}
                            >
                                {/* 头像 */}
                                <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 bg-black">
                                    <img src={avatar} className="w-full h-full object-cover" alt="Avatar" />
                                </div>

                                {/* 信息 */}
                                <div className="flex-1">
                                    <div className="font-bold text-white flex items-center gap-2">
                                        {user.displayName}
                                        {user.type === 'full' && <span className="text-[10px] bg-yellow-600/50 px-1 rounded text-yellow-200">DEV</span>}
                                        {isCurrent && <span className="text-[10px] bg-green-600/50 px-1 rounded text-green-200">CURRENT</span>}
                                    </div>
                                    <div className="text-xs font-mono text-gray-500">
                                        UID: {user.uid.slice(0, 8).toUpperCase()}
                                    </div>
                                </div>

                                {/* 选中标记 */}
                                {isSelected && <Check className="text-blue-400" size={20} />}
                            </div>
                        );
                    })}

                    {/* 新建账户输入框 */}
                    {isCreating ? (
                        <div className="flex gap-2 animate-fade-in-up">
                            <input
                                type="text"
                                autoFocus
                                placeholder="Enter Agent Name..."
                                value={newUserName}
                                onChange={e => setNewUserName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                className="flex-1 bg-black/40 border border-white/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <button
                                onClick={handleCreate}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-bold transition-colors"
                            >
                                OK
                            </button>
                            <button
                                onClick={() => setIsCreating(false)}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-3 rounded-lg transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full py-3 border-2 border-dashed border-white/10 hover:border-white/30 rounded-xl flex items-center justify-center gap-2 text-gray-400 hover:text-white transition-all hover:bg-white/5"
                        >
                            <Plus size={16} /> CREATE NEW ACCOUNT
                        </button>
                    )}
                </div>

                {/* 底部按钮栏 */}
                <div className="p-6 border-t border-white/10 bg-slate-800/50 flex justify-between items-center gap-4">
                    <button
                        onClick={() => onDeleteUser(selectedUid)}
                        disabled={selectedUid === currentUserUid} // 禁止删除当前登录的账号
                        className={`
                            px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all
                            ${selectedUid === currentUserUid
                                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-red-900/50 text-red-200 hover:bg-red-800 hover:text-white'}
                        `}
                    >
                        <Trash2 size={18} /> DELETE
                    </button>

                    <button
                        onClick={() => onConfirmSwitch(selectedUid)}
                        disabled={selectedUid === currentUserUid} // 如果选的是自己，禁用确定按钮
                        className={`
                            flex-1 py-3 rounded-lg font-black tracking-widest text-lg transition-all shadow-lg
                            ${selectedUid === currentUserUid
                                ? 'bg-gray-700 text-gray-400 cursor-default'
                                : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 shadow-blue-900/50'}
                        `}
                    >
                        {selectedUid === currentUserUid ? 'CURRENT' : 'CONFIRM SWITCH'}
                    </button>
                </div>
            </div>
        </div>
    );
};