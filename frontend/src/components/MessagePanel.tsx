import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { ConversationListItem, Message } from "../api";
import MessageBubble from "./MessageBubble";

interface MessagePanelProps {
  conversation: ConversationListItem;
  messages: Message[];
  typingUserIds: string[];
  currentUserId: string;
  loading: boolean;
  draft: string;
  connected: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBack: () => void;
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Bugün";
  if (date.toDateString() === yesterday.toDateString()) return "Dün";

  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function MessagePanel({
  conversation,
  messages,
  typingUserIds,
  currentUserId,
  loading,
  draft,
  connected,
  onDraftChange,
  onSend,
  onKeyDown,
  onBack,
}: MessagePanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Yeni mesaj geldiğinde en alta kaydır.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typingUserIds]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = [];
    for (const message of messages) {
      const day = dayLabel(message.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(message);
      else groups.push({ day, items: [message] });
    }
    return groups;
  }, [messages]);

  const title = conversation.user.displayName ?? conversation.user.username ?? "Kullanıcı";

  return (
    <div className="message-panel-inner">
      <div className="panel-header">
        <button className="panel-header-back" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <div className="panel-header-avatar">
          {conversation.user.avatarUrl ? (
            <img src={conversation.user.avatarUrl} alt="" />
          ) : (
            (conversation.user.userTag ?? conversation.user.username ?? "?")[0].toUpperCase()
          )}
        </div>
        <div className="panel-header-info">
          <div className="panel-header-name">
            {title}
            <span className="panel-header-tag">{conversation.user.userTag}</span>
          </div>
          <div className="panel-header-sub">
            {typingUserIds.length > 0
              ? "yazıyor…"
              : connected
                ? "çevrimiçi"
                : "bağlantı koptu"}
          </div>
        </div>
      </div>

      <div className="message-list scrollbar-thin" ref={listRef}>
        {loading ? (
          <div className="message-list-empty">Mesajlar yükleniyor…</div>
        ) : messages.length === 0 ? (
          <div className="message-list-empty">
            <p>Henüz mesaj yok.</p>
            <span>İlk mesajı sen yaz!</span>
          </div>
        ) : (
          grouped.map((group, index) => (
            <div key={`${group.day}-${index}`}>
              <div className="message-day-separator">
                <span>{group.day}</span>
              </div>
              {group.items.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOutgoing={message.senderId === currentUserId}
                />
              ))}
            </div>
          ))
        )}

        {typingUserIds.length > 0 && (
          <div className="message-row incoming">
            <div className="message-bubble message-bubble--typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
      </div>

      <div className="message-input-area">
        <div className="message-input-wrapper">
          <textarea
            className="message-input"
            placeholder={connected ? "Bir mesaj yazın…" : "Bağlantı bekleniyor…"}
            value={draft}
            rows={1}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!connected}
          />
        </div>
        <button className="send-btn" onClick={onSend} disabled={!draft.trim() || !connected}>
          ➤
        </button>
      </div>
    </div>
  );
}
