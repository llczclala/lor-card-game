import React, { useMemo } from 'react';
import { GameSession } from '../GameSession';
import type { Room } from '../../net/room';
import { normalizeIntent, type NetIntentChannel } from '../../net/intent';
import { toGuestView } from '../../net/snapshot';
import { CARD_DB } from '../../data/cards'; // [2026-11-07 联机] 从卡组里认主英雄（isChampion）
import type { GameState } from '../../types';
// [2026-11-07 联机诊断] 只在通道边界埋点：这里能看到「意图/快照到底有没有过一次搬运」。
import { nlog, nlogChanged, ncount } from '../../net/audit';

// 与 StandardGameWrapper 同一套做法：从组件本身取 Props 类型，避免手抄。
type GameSessionProps = React.ComponentProps<typeof GameSession>;

/**
 * [2026-11-07 联机] 从展开的卡组里认出「主英雄」——第一张 `isChampion` 的卡。
 * 它的 key 就是 `GameSession` 拿来取头像（`HERO_IMAGES[key].base`，1 级卡面）的卡组图标。
 * 认不出来（空卡组 / 测试卡组）就返回 undefined ⇒ 那边退回该玩家的卡背。
 */
function pickDeckHeroKey(deck: string[]): string | undefined {
    for (const key of deck) {
        if (CARD_DB[key]?.isChampion) return key;
    }
    return undefined;
}

interface OnlineGameWrapperProps extends Omit<
    GameSessionProps,
    'deck' | 'enemyDeck' | 'onExit' | 'onVictory' | 'onDefeat' | 'netIntent' | 'netSnapshot' | 'matchMode'
> {
    /** 退出对局（回到房间或大厅，由 App 决定） */
    onExitGame: () => void;
    /** 房间对象（主机或客方） */
    room: Room;
    /** 我的卡组（已展开成 key 数组） */
    myDeck: string[];
    /** 对方的卡组（已展开） */
    opponentDeck: string[];
    /** 本地视角下的先手方（由房间开局指令给出） */
    firstAttacker?: 'player' | 'enemy';
}

/**
 * 超元链接 · 联机对局的第四个 Wrapper（与 Standard / Tutorial / Rogue 平级）。
 *
 * 职责只有一件事：**把房间通道翻译成 `GameSession` 认识的两种东西**
 *   · `netIntent`   —— 玩家操作往哪走（主机本地执行 / 客方上报）
 *   · `netSnapshot` —— 客方的状态从哪来（房主的权威快照）
 *
 * 战斗逻辑一行都不在这里，`GameSession` 对网络层零感知。
 */
export const OnlineGameWrapper: React.FC<OnlineGameWrapperProps> = ({
    onExitGame,
    room,
    myDeck,
    opponentDeck,
    firstAttacker = 'player',
    ...rest
}) => {
    const isHost = room.isHost;

    // [2026-11-07 联机] 双方名字：取房间成员表里自己 / 对方那一条
    //   （建房、加入时传的就是 App 顶下来的玩家昵称，见 OnlineRoomScreen 的 playerName）。
    //   room.state 是可变对象，本组件不订阅它 —— 名字在开局前就定死了，够用；
    //   真要中途改名属于「房间层」的事，不在这里补监听。
    const myMember = room.state.members.find(m => m.role === (isHost ? 'host' : 'guest'));
    const enemyMember = room.state.members.find(m => m.role === (isHost ? 'guest' : 'host'));
    const myPlayerName = myMember?.name || room.myName || undefined;
    const enemyPlayerName = enemyMember?.name || undefined;

    // [2026-11-07 联机] 卡组图标：各自卡组里的主英雄 key（GameSession 内解析成 1 级卡面，认不到退回卡背）
    const myDeckIcon = pickDeckHeroKey(myDeck);
    const enemyDeckIcon = pickDeckHeroKey(opponentDeck);

    const intentChannel = useMemo<NetIntentChannel>(() => {
        nlog('channel创建', { isHost, hasRoom: !!room });
        if (isHost) {
            return {
                // 房主是权威：操作照常本地执行，结果通过快照同步
                authoritative: true,
                emit: () => { /* 自己就是权威，无需上报 */ },
                // 收客方意图 → 在本地引擎的 enemy 侧执行
                subscribeRemote: (cb) => room.on('action', (action) => {
                    const intent = normalizeIntent(action);
                    if (intent) {
                        nlog('房主收到意图', intent.op);
                        cb(intent);
                    } else {
                        // [联机诊断] 走到这里说明意图没过 `validateIntent`，是被**丢弃**而不是没收到。
                        nlog('房主收到意图(非法已丢弃)', action);
                    }
                }),
                // 状态变了就按**客方视角**投影后发出去（翻转 + 裁剪隐藏信息）
                publish: (snap) => {
                    nlogChanged('房主publish调用', { round: (snap as any)?.round, turnOwner: (snap as any)?.turnOwner, phase: (snap as any)?.phase });
                    room.sendSnapshot(toGuestView(snap as GameState));
                    ncount('房主sendSnapshot');
                },
            };
        }
        return {
            // 客方不执行任何逻辑，只上报意图
            authoritative: false,
            emit: (intent) => room.sendAction(intent),
        };
    }, [isHost, room]);

    const snapshotSource = useMemo(() => {
        if (isHost) return undefined; // 房主自己就是权威，不需要覆盖
        return {
            subscribe: (cb: (snap: GameState) => void) =>
                room.on('snapshot', (snap) => {
                    if (snap && typeof snap === 'object') {
                        nlog('客方收到快照', { round: (snap as any)?.round, turnOwner: (snap as any)?.turnOwner });
                        cb(snap as GameState);
                    }
                }),
        };
    }, [isHost, room]);

    return (
        <GameSession
            {...rest}
            deck={myDeck}
            enemyDeck={opponentDeck}
            onExit={onExitGame}
            firstAttacker={firstAttacker}
            // 对手是真人：必须关掉 AI，否则本地会替对方出牌
            disableAI={true}
            // 对手是真人 ⇒ 引擎要把敌方当"另一个玩家"对待（也切 4 张起手、换牌同样生效）
            onlineMode={true}
            // [2026-11-07 联机] 左右两侧「玩家名字 + 卡组图标」（单机各 wrapper 不传 ⇒ 一像素都不渲染）
            myPlayerName={myPlayerName}
            enemyPlayerName={enemyPlayerName}
            myDeckIcon={myDeckIcon}
            enemyDeckIcon={enemyDeckIcon}
            netIntent={intentChannel}
            netSnapshot={snapshotSource}
            // [2026-11-07 联机] 联机回合倒计时 90 秒（单机默认 30）。
            //   理由：客方的操作要多走「意图 → 房主执行 → 快照回传 → 客方应用」一趟，
            //   实测有 ~3 秒延迟；再叠上真人思考时间，30 秒只会变成双方频繁烧绳。
            turnTimer={90}
        />
    );
};
