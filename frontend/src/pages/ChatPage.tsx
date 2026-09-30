import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { useAuth } from "../authContext";
import {
  addContact,
  fetchContacts,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  startConversation,
  type Contact,
  type ConversationListItem,
  type Message,
  type MessageStatus,
} from "../api";
import {
  connectSocket,
  joinConversation,
  markSeen,
  sendMessage,
  startTyping,
  stopTyping,
} from "../sockets";
import Sidebar from "../components/Sidebar";
import MessagePanel from "../components/MessagePanel";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "openmessaging.theme";

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

interface MessageNewPayload {
  conversationId: string;
  message: Message;
}

export default function ChatPage() {
  const { user, token, logout } = useAuth();

  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addTag, setAddTag] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const typingSentRef = useRef(false);

  // ---------------- Tema ----------------
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // ---------------- Veri yükleme ----------------
  const loadSidebarData = useCallback(async () => {
    const [contactsRes, conversationsRes] = await Promise.all([
      fetchContacts(),
      fetchConversations(),
    ]);
    if (contactsRes.ok) setContacts(contactsRes.contacts);
    if (conversationsRes.ok) setConversations(conversationsRes.conversations);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingConversations(true);
      await loadSidebarData();
      if (!cancelled) setLoadingConversations(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSidebarData]);

  // ---------------- Socket bağlantısı ----------------
  useEffect(() => {
    if (!token) return;

    const s = connectSocket(token);
    setSocket(s);
    setConnected(s.connected);

    const onConnect = () => {
      setConnected(true);
      const current = selectedIdRef.current;
      if (current) joinConversation(current);
    };
    const onDisconnect = () => setConnected(false);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, [token]);

  // ---------------- Socket olayları ----------------
  const upsertMessage = useCallback((message: Message) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onMessageNew = ({ conversationId, message }: MessageNewPayload) => {
      if (conversationId === selectedIdRef.current) {
        upsertMessage(message);
        // Gelen mesajı hemen okundu işaretle.
        if (message.senderId !== user?.id) {
          markSeen(conversationId);
          void markConversationRead(conversationId);
        }
      } else if (message.senderId !== user?.id) {
        const label = message.senderUserTag ?? message.senderUsername ?? "Yeni mesaj";
        toast.info(`${label}: ${message.content.slice(0, 60)}`);
      }
      void loadSidebarData();
    };

    const onTypingStart = ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      if (conversationId !== selectedIdRef.current || userId === user?.id) return;
      setTypingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
    };

    const onTypingStop = ({ userId }: { userId: string }) => {
      setTypingUserIds((prev) => prev.filter((id) => id !== userId));
    };

    const onAck = ({ messageId, status }: { messageId: string; status: MessageStatus }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)));
    };

    const onContactAdded = () => {
      void loadSidebarData();
    };

    const onSocketError = (err: { message?: string }) => {
      if (err?.message) toast.error(err.message);
    };

    socket.on("message:new", onMessageNew);
    socket.on("typing_start", onTypingStart);
    socket.on("typing_stop", onTypingStop);
    socket.on("message:ack", onAck);
    socket.on("contact:added", onContactAdded);
    socket.on("error", onSocketError);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("typing_start", onTypingStart);
      socket.off("typing_stop", onTypingStop);
      socket.off("message:ack", onAck);
      socket.off("contact:added", onContactAdded);
      socket.off("error", onSocketError);
    };
  }, [socket, user?.id, upsertMessage, loadSidebarData]);

  // ---------------- Sohbet açma ----------------
  const openConversation = useCallback(async (conversationId: string) => {
    selectedIdRef.current = conversationId;
    setSelectedId(conversationId);
    setMobileChatOpen(true);
    setTypingUserIds([]);
    setMessages([]);
    setLoadingMessages(true);

    const res = await fetchConversation(conversationId);
    if (res.ok) {
      setMessages(res.conversation.messages);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
    } else {
      toast.error(res.error);
    }
    setLoadingMessages(false);

    joinConversation(conversationId);
    markSeen(conversationId);
    void markConversationRead(conversationId);
  }, []);

  const handleStartConversation = useCallback(
    async (contact: Contact) => {
      const res = await startConversation(contact.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      const conversation = res.conversation;
      setConversations((prev) =>
        prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev],
      );
      await openConversation(conversation.id);
    },
    [openConversation],
  );

  const handleCloseConversation = useCallback(() => {
    setMobileChatOpen(false);
  }, []);

  // ---------------- Mesaj gönderme ----------------
  const handleSend = useCallback(() => {
    const content = draftRef.current.trim();
    const conversationId = selectedIdRef.current;
    if (!content || !conversationId || !socket) return;

    sendMessage(conversationId, content);
    setDraft("");
    typingSentRef.current = false;
    stopTyping(conversationId);
  }, [socket]);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
    const conversationId = selectedIdRef.current;
    if (!conversationId) return;

    const hasText = value.trim().length > 0;
    if (hasText && !typingSentRef.current) {
      typingSentRef.current = true;
      startTyping(conversationId);
    } else if (!hasText && typingSentRef.current) {
      typingSentRef.current = false;
      stopTyping(conversationId);
    }
  }, []);

  const handleDraftKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ---------------- Kişi ekleme ----------------
  const submitAddContact = useCallback(async () => {
    const tag = addTag.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(tag)) {
      setAddError("Kullanıcı kodu 6 haneli olmalı (ör. K83M2P).");
      return;
    }

    setAdding(true);
    setAddError(null);
    const res = await addContact(tag);
    setAdding(false);

    if (!res.ok) {
      setAddError(res.error);
      return;
    }

    toast.success(
      res.alreadyAdded ? "Bu kişi zaten listende" : `${res.contact.userTag} kişi listene eklendi`,
    );
    setAddOpen(false);
    setAddTag("");
    await loadSidebarData();
  }, [addTag, loadSidebarData]);

  // ---------------- Türetilmiş değerler ----------------
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  if (!user) return null;

  return (
    <div className="app-shell">
      <div className={`sidebar ${mobileChatOpen ? "sidebar--hidden-mobile" : ""}`}>
        <Sidebar
          user={user}
          theme={theme}
          conversations={conversations}
          contacts={contacts}
          selectedConversationId={selectedId}
          loading={loadingConversations}
          connected={connected}
          onSelectConversation={openConversation}
          onStartConversation={handleStartConversation}
          onAddContact={() => setAddOpen(true)}
          onToggleTheme={toggleTheme}
          onLogout={() => void logout()}
        />
      </div>

      <div className={`message-panel ${mobileChatOpen ? "active-panel" : ""}`}>
        {activeConversation ? (
          <MessagePanel
            conversation={activeConversation}
            messages={messages}
            typingUserIds={typingUserIds}
            currentUserId={user.id}
            loading={loadingMessages}
            draft={draft}
            connected={connected}
            onDraftChange={handleDraftChange}
            onSend={handleSend}
            onKeyDown={handleDraftKeyDown}
            onBack={handleCloseConversation}
          />
        ) : (
          <div className="chat-empty-state">
            <div className="auth-logo" style={{ marginBottom: 0 }}>
              <div className="auth-logo-icon">O</div>
              <div className="auth-logo-text">OpenMessaging</div>
            </div>
            <p className="auth-subtitle" style={{ marginBottom: 0 }}>
              {connected
                ? "Bir sohbet seçin ya da yeni bir kişi ekleyerek konuşmaya başlayın."
                : "Sunucuya bağlanılıyor…"}
            </p>
            <button className="add-contact-btn" onClick={() => setAddOpen(true)}>
              + Kişi Ekle
            </button>
          </div>
        )}
      </div>

      {addOpen && (
        <div className="overlay" onClick={() => setAddOpen(false)}>
          <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
            <div className="overlay-title">Kişi Ekle</div>
            <div className="overlay-subtitle">
              Karşı tarafın 6 haneli Kullanıcı Kodunu girin (ör. K83M2P). Kişiler yalnızca bu kod
              ile eklenir.
            </div>

            <div className="overlay-form">
              <input
                className="auth-field-input"
                type="text"
                placeholder="K83M2P"
                value={addTag}
                autoFocus
                onChange={(e) => {
                  setAddTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitAddContact();
                }}
                disabled={adding}
                style={{ letterSpacing: "3px", textTransform: "uppercase", fontSize: 18, textAlign: "center" }}
              />

              {addError && <div className="auth-error">{addError}</div>}

              <div className="overlay-actions">
                <button
                  className="overlay-btn overlay-btn-secondary"
                  onClick={() => setAddOpen(false)}
                >
                  İptal
                </button>
                <button
                  className="overlay-btn overlay-btn-primary"
                  onClick={submitAddContact}
                  disabled={adding || addTag.length !== 6}
                >
                  {adding ? "Ekleniyor…" : "Ekle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
