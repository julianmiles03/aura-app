import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar, { GroupPair } from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../components/ui.jsx';
import { formatTime, plural } from '../format.js';

const POLL_MS = 5000;

export default function ChatScreen({ chatId, refreshMe }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      setData(await api(`/chats/${chatId}/messages`));
    } catch (err) {
      setError(err);
    }
  }, [chatId]);

  // Load, mark read (server does it on GET), then poll for new messages while open.
  useEffect(() => {
    load().then(refreshMe);
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, refreshMe]);

  useEffect(() => {
    const count = data?.messages.length ?? 0;
    if (count !== lastCount.current) bottom.current?.scrollIntoView({ block: 'end' });
    lastCount.current = count;
  }, [data]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { message } = await api(`/chats/${chatId}/messages`, { method: 'POST', body: { body } });
      setData((d) => ({ ...d, messages: [...d.messages, message] }));
      setDraft('');
    } catch (err) {
      toast(err.message, { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="screen">
        <a className="link-btn" href="#/messages"><Icon name="chevronLeft" size={18} /> Messages</a>
        <div className="empty" style={{ marginTop: 16 }}>
          <h2>Can't open this chat</h2>
          <p>{error.message}</p>
        </div>
      </div>
    );
  }
  if (!data) return <div className="loading">Opening chat…</div>;

  const { chat, messages, participants } = data;
  return (
    <div className="chat-screen">
      <header className="chat-head">
        <a href="#/messages" className="icon-btn icon-btn--plain" aria-label="Back to Messages">
          <Icon name="chevronLeft" size={26} />
        </a>
        <GroupPair mine={chat.myGroup} other={chat.otherGroup} size={36} />
        <div>
          <div className="chat-head__name">{chat.name}</div>
          <div className="chat-head__meta">{plural(chat.peopleCount, 'person', 'people')}</div>
        </div>
      </header>

      <div className="chat-body">
        <p className="chat-intro">
          {chat.myGroup.name} matched with {chat.otherGroup.name}.<br />
          {participants.map((p) => p.firstName).join(', ')}
        </p>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showSender = !m.mine && (!prev || prev.sender?.id !== m.sender?.id);
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showSender && <div className="msg__sender">{m.sender?.firstName ?? 'Former member'}</div>}
              <div className={`msg ${m.mine ? 'msg--mine' : ''}`}>
                {!m.mine && (showSender && m.sender
                  ? <Avatar initials={m.sender.initials} color={m.sender.avatarColor} size={36} />
                  : <span className="msg__spacer" />)}
                <div className="msg__bubble">{m.body}</div>
                <span className="msg__time">{formatTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={send}>
        <label className="sr-only" htmlFor="composer">Message</label>
        <input
          id="composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${chat.otherGroup.name}`}
          maxLength={2000}
          autoComplete="off"
        />
        <button type="submit" className="icon-btn" aria-label="Send" disabled={!draft.trim() || sending}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
