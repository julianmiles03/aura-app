import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar, { GroupPair } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/ui.jsx';
import ChatScreen from './ChatScreen.jsx';
import { formatChatTime, plural } from '../format.js';

const VIEW_TITLES = { archived: 'Archived', deleted: 'Recently deleted' };

export default function MessagesScreen({ me, onSwitchGroup, refreshMe, isDesktop = false, chatId = null }) {
  const toast = useToast();
  const groupId = me.activeGroupId;
  const activeGroup = me.groups.find((g) => g.id === groupId);
  const [view, setView] = useState('inbox');
  const [likes, setLikes] = useState(null);
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [pendingLikeId, setPendingLikeId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [newChatId, setNewChatId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [likeData, chatData] = await Promise.all([
        api(`/groups/${groupId}/incoming-likes`),
        api(`/groups/${groupId}/chats?view=${view}`),
      ]);
      setLikes(likeData.likes);
      setChats(chatData.chats);
    } catch (err) {
      setError(err);
    }
  }, [groupId, view]);

  useEffect(() => {
    setChats(null);
    setSelected(new Set());
    load();
  }, [load]);

  // Desktop: the open chat pane reports reads/sends so the list's previews and unread counts stay current.
  const refreshChats = useCallback(async () => {
    try {
      setChats((await api(`/groups/${groupId}/chats?view=${view}`)).chats);
    } catch {
      // The list keeps its last good state; the next full load will retry.
    }
  }, [groupId, view]);

  // The vertical slice: accept -> server creates match + chat -> we update the lists in place.
  const accept = async (like) => {
    setPendingLikeId(like.id);
    try {
      const { chat } = await api(`/likes/${like.id}/accept`, { method: 'POST' });
      setLikes((ls) => ls.filter((l) => l.id !== like.id));
      if (view === 'inbox') setChats((cs) => [chat, ...(cs ?? []).filter((c) => c.id !== chat.id)]);
      setNewChatId(chat.id);
      if (isDesktop) window.location.hash = `#/messages/${chat.id}`; // open it in the chat pane
      toast(`You matched with ${like.group.name}! Say hi in your new chat.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
      if (['ALREADY_MATCHED', 'ALREADY_DECIDED', 'LIKE_NOT_FOUND'].includes(err.code)) load();
    } finally {
      setPendingLikeId(null);
    }
  };

  const decline = async (like) => {
    setPendingLikeId(like.id);
    try {
      await api(`/likes/${like.id}/decline`, { method: 'POST' });
      setLikes((ls) => ls.filter((l) => l.id !== like.id));
      toast(`Declined ${like.group.name}.`);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setPendingLikeId(null);
    }
  };

  const selecting = selected.size > 0;
  const allSelected = chats?.length > 0 && selected.size === chats.length;
  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const bulk = async (action, verb) => {
    const ids = [...selected];
    try {
      await api('/chats/bulk', { method: 'POST', body: { action, chatIds: ids } });
      setChats((cs) => cs.filter((c) => !selected.has(c.id)));
      setSelected(new Set());
      toast(`${plural(ids.length, 'chat')} ${verb}.`);
      refreshMe();
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };

  const listPane = (
    <div className={isDesktop ? 'messages__list' : 'screen'}>
      <header className="page-head">
        <h1 className="page-title">Messages</h1>
      </header>

      {me.groups.length > 0 && (
        <div className="chatting-as">
          <span className="chatting-as__label">Chatting as</span>
          <div className="chatting-as__groups">
            {[...me.groups].sort((a, b) => a.id - b.id).map((g) => (
              <button
                key={g.id}
                type="button"
                className="as-pill"
                aria-pressed={g.id === groupId}
                onClick={() => g.id !== groupId && onSwitchGroup(g.id)}
              >
                <Avatar initials={g.initials} color={g.id === groupId ? '#FFFFFF' : g.avatarColor} size={42} />
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="empty">
          <h2>Couldn't load messages</h2>
          <p>{error.message}</p>
          <button type="button" className="btn btn--primary" onClick={load}>Try again</button>
        </div>
      )}

      {view === 'inbox' && likes?.length > 0 && (
        <section className="likes-box" aria-label="Groups that liked you">
          <h2 className="likes-box__title">
            {plural(likes.length, 'group')} {likes.length === 1 ? 'wants' : 'want'} to meet {activeGroup?.name}
          </h2>
          {likes.map((like) => {
            const g = like.group;
            const extra = g.stats?.mutualFriends
              ? plural(g.stats.mutualFriends, 'mutual friend')
              : plural(g.stats?.sharedInterestCount ?? 0, 'shared interest');
            const pending = pendingLikeId === like.id;
            return (
              <div key={like.id} className="like-row" style={{ opacity: pending ? 0.6 : 1 }}>
                <Avatar initials={g.initials} color={g.avatarColor} size={48} shape="square" />
                <div className="like-row__info">
                  <div className="like-row__name">{g.name}</div>
                  <div className="like-row__meta">{plural(g.memberCount, 'member')} · {extra}</div>
                </div>
                <div className="like-row__actions">
                  <button type="button" className="icon-btn icon-btn--square" aria-label={`Decline ${g.name}`} disabled={pending} onClick={() => decline(like)}>
                    <Icon name="x" />
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" disabled={pending} onClick={() => accept(like)}>
                    {pending ? '…' : 'Accept'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {view !== 'inbox' && (
        <div className="view-banner">
          <button type="button" className="link-btn" onClick={() => setView('inbox')}>
            <Icon name="chevronLeft" size={18} /> Chats
          </button>
          <strong>{VIEW_TITLES[view]}</strong>
        </div>
      )}

      <div className="chats-head">
        <h2 className="section-label">{view === 'inbox' ? 'Chats' : VIEW_TITLES[view]}</h2>
        {chats?.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setSelected(allSelected ? new Set() : new Set(chats.map((c) => c.id)))}>
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        )}
        {view === 'inbox' && (
          <>
            <button
              type="button"
              className="icon-btn icon-btn--plain"
              aria-label={selecting ? 'Archive selected chats' : 'Show archived chats'}
              title={selecting ? 'Archive selected' : 'Archived chats'}
              onClick={() => (selecting ? bulk('archive', 'archived') : setView('archived'))}
            >
              <Icon name="archive" />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--plain"
              aria-label={selecting ? 'Delete selected chats' : 'Show recently deleted chats'}
              title={selecting ? 'Delete selected' : 'Recently deleted'}
              onClick={() => (selecting ? bulk('delete', 'moved to Recently deleted') : setView('deleted'))}
            >
              <Icon name="trash" />
            </button>
          </>
        )}
        {view === 'archived' && selecting && (
          <button type="button" className="btn btn--sm btn--soft" onClick={() => bulk('unarchive', 'moved back to Chats')}>Unarchive</button>
        )}
        {view === 'deleted' && selecting && (
          <button type="button" className="btn btn--sm btn--soft" onClick={() => bulk('restore', 'restored')}>
            <Icon name="restore" size={18} /> Restore
          </button>
        )}
      </div>

      {!chats && !error && <div className="loading">Loading chats…</div>}
      {chats?.length === 0 && (
        <div className="empty">
          <span className="empty__icon"><Icon name="messages" size={30} /></span>
          <h2>{view === 'inbox' ? 'No chats yet' : `Nothing ${view === 'archived' ? 'archived' : 'deleted'}`}</h2>
          <p>{view === 'inbox' ? 'When two groups connect, a shared group chat shows up here.' : 'Chats you move here will show up in this list.'}</p>
          {view === 'inbox' && <a className="btn btn--primary" href="#/find">Find groups</a>}
        </div>
      )}
      {chats?.length > 0 && (
        <div className="chat-list">
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              isNew={chat.id === newChatId}
              isOpen={isDesktop && chat.id === chatId}
              selecting={selecting}
              selected={selected.has(chat.id)}
              onToggle={() => toggle(chat.id)}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!isDesktop) return listPane;
  return (
    <div className="messages-split">
      {listPane}
      <section className="messages__pane" aria-label="Conversation">
        {chatId ? (
          <ChatScreen key={chatId} chatId={chatId} refreshMe={refreshMe} onActivity={refreshChats} embedded />
        ) : (
          <div className="pane-empty">
            <span className="empty__icon"><Icon name="messages" size={30} /></span>
            <h2>Pick a chat</h2>
            <p>Choose a conversation on the left, or accept a group that wants to meet {activeGroup?.name}.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ChatRow({ chat, isNew, isOpen, selecting, selected, onToggle }) {
  const last = chat.lastMessage;
  const preview = last
    ? `${last.mine ? 'You' : last.senderFirstName ?? 'Someone'}: ${last.body}`
    : 'New match! Say hi to the group.';
  const open = () => {
    if (selecting) onToggle();
    else window.location.hash = `#/messages/${chat.id}`;
  };
  return (
    <button
      type="button"
      className={`chat-row ${isNew ? 'chat-row--new' : ''} ${isOpen ? 'chat-row--open' : ''}`}
      onClick={open}
      aria-pressed={selecting ? selected : undefined}
      aria-current={isOpen ? 'true' : undefined}
      data-chat-id={chat.id}
    >
      {selecting && (
        <span className={`check ${selected ? 'check--on' : ''}`} aria-hidden="true">
          {selected && <Icon name="check" size={16} strokeWidth={3} />}
        </span>
      )}
      <GroupPair mine={chat.myGroup} other={chat.otherGroup} size={46} />
      <span className="chat-row__main">
        <span className="chat-row__top">
          <span className="chat-row__name">{chat.name}</span>
          <span className="chat-row__time">{formatChatTime(chat.lastActivityAt)}</span>
        </span>
        <span className="chat-row__mid">
          <span className={`chat-row__last ${last ? '' : 'chat-row__last--new'}`}>{preview}</span>
          {chat.unreadCount > 0 && <span className="count-dot" aria-label={`${chat.unreadCount} unread`}>{chat.unreadCount}</span>}
        </span>
        <span className="chat-row__people" style={{ display: 'block' }}>{plural(chat.peopleCount, 'person', 'people')}</span>
      </span>
    </button>
  );
}
