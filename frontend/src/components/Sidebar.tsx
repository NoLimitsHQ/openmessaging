import { useMemo, useState } from "react";
import type { AuthUser, Contact, ConversationListItem } from "../api";

interface SidebarProps {
  user: AuthUser;
  theme: "dark" | "light";
  conversations: ConversationListItem[];
  contacts: Contact[];
  selectedConversationId: string | null;
  loading: boolean;
  connected: boolean;
  onSelectConversation: (conversationId: string) => void;
  onStartConversation: (contact: Contact) => void;
  onAddContact: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

const initials = (value?: string | null) => (value && value.length > 0 ? value[0].toUpperCase() : "?");

function formatTime(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}

export default function Sidebar({
  user,
  theme,
  conversations,
  contacts,
  selectedConversationId,
  loading,
  connected,
  onSelectConversation,
  onStartConversation,
  onAddContact,
  onToggleTheme,
  onLogout,
}: SidebarProps) {
  const [query, setQuery] = useState("");

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.user.username?.toLowerCase().includes(q) ||
        c.user.userTag?.toLowerCase().includes(q) ||
        c.user.displayName?.toLowerCase().includes(q) ||
        c.lastMessage?.content.toLowerCase().includes(q),
    );
  }, [conversations, query]);

  const chattableContacts = useMemo(() => {
    const inConversation = new Set(conversations.map((c) => c.user.id));
    const rest = contacts.filter((c) => !inConversation.has(c.id));
    const q = query.trim().toLowerCase();
    if (!q) return rest;
    return rest.filter(
      (c) =>
        c.username?.toLowerCase().includes(q) ||
        c.userTag?.toLowerCase().includes(q) ||
        c.displayName?.toLowerCase().includes(q),
    );
  }, [contacts, conversations, query]);

  const nothingToShow = filteredConversations.length === 0 && chattableContacts.length === 0;

  return (
    <>
      <div className="sidebar-header">
        <div className="sidebar-header-info">
          <div className="sidebar-header-name">
            {user.displayName ?? user.username ?? user.email}
          </div>
          <div className="sidebar-header-tag">
            <span className="sidebar-header-status-dot" data-online={connected} />
            Kod: <strong>{user.userTag}</strong>
          </div>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="icon-btn" onClick={onLogout} title="Çıkış yap">
            ⎋
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Kişi, kod veya mesaj ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-contact-list scrollbar-thin">
        {loading ? (
          <div className="sidebar-empty">Yükleniyor…</div>
        ) : nothingToShow ? (
          <div className="sidebar-empty">
            {query ? (
              <>
                <p>Sonuç bulunamadı.</p>
                <button className="add-contact-btn" onClick={() => setQuery("")}>
                  Aramayı temizle
                </button>
              </>
            ) : (
              <>
                <p>Henüz kimse yok.</p>
                <button className="add-contact-btn" onClick={onAddContact}>
                  + Kişi Ekle
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {filteredConversations.map((item) => {
              const isActive = item.id === selectedConversationId;
              const preview = item.lastMessage
                ? `${item.lastMessage.senderId === user.id ? "Sen: " : ""}${item.lastMessage.content}`
                : "Henüz mesaj yok";

              return (
                <div
                  key={item.id}
                  className={`sidebar-contact-item${isActive ? " active" : ""}`}
                  onClick={() => onSelectConversation(item.id)}
                >
                  <div className="sidebar-contact-avatar">
                    {item.user.avatarUrl ? (
                      <img src={item.user.avatarUrl} alt="" />
                    ) : (
                      initials(item.user.userTag ?? item.user.username)
                    )}
                  </div>
                  <div className="sidebar-contact-info">
                    <div className="sidebar-contact-name">
                      {item.user.displayName ?? item.user.username ?? "Kullanıcı"}
                      {item.user.userTag && (
                        <span className="sidebar-contact-tag">{item.user.userTag}</span>
                      )}
                    </div>
                    <div className="sidebar-contact-preview">{preview}</div>
                  </div>
                  <div className="sidebar-contact-meta">
                    <div className="sidebar-contact-time">
                      {formatTime(item.lastMessage?.createdAt ?? item.updatedAt)}
                    </div>
                    {item.unreadCount > 0 && (
                      <div className="sidebar-contact-badge">{item.unreadCount}</div>
                    )}
                  </div>
                </div>
              );
            })}

            {chattableContacts.length > 0 && (
              <div className="sidebar-section-label">Kişiler</div>
            )}

            {chattableContacts.map((contact) => (
              <div
                key={contact.id}
                className="sidebar-contact-item"
                onClick={() => onStartConversation(contact)}
                title="Sohbet başlat"
              >
                <div className="sidebar-contact-avatar">
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt="" />
                  ) : (
                    initials(contact.userTag ?? contact.username)
                  )}
                </div>
                <div className="sidebar-contact-info">
                  <div className="sidebar-contact-name">
                    {contact.displayName ?? contact.username ?? "Kullanıcı"}
                    {contact.userTag && (
                      <span className="sidebar-contact-tag">{contact.userTag}</span>
                    )}
                  </div>
                  <div className="sidebar-contact-preview sidebar-contact-preview--muted">
                    Sohbet başlatmak için dokun
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-profile">
          <div className="sidebar-footer-avatar">{initials(user.userTag ?? user.username)}</div>
          <div>
            <div className="sidebar-footer-name">{user.username ?? user.email}</div>
            <div className="sidebar-footer-status">Kullanıcı Kodu: {user.userTag}</div>
          </div>
        </div>
        <button className="add-contact-btn" onClick={onAddContact}>
          + Kişi
        </button>
      </div>
    </>
  );
}
