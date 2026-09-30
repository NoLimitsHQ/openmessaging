import { io, type Socket } from "socket.io-client";

/** Geliştirmede "/" (Vite proxy), üretimde backend adresi. */
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ??
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "/";

let socket: Socket | null = null;
let currentToken: string | null = null;

/**
 * Socket.io bağlantısını kurar (veya aynı token için mevcut bağlantıyı döner).
 * Handshake'te gerçek JWT gönderilir; backend `payload.sub` ile kullanıcıyı bulur.
 */
export function connectSocket(token: string): Socket {
  if (socket && currentToken === token) return socket;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  currentToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
}

// ---------------------------- Oda işlemleri ----------------------------
export function joinConversation(conversationId: string): void {
  socket?.emit("join_conversation", { conversationId });
}

export function leaveConversation(conversationId: string): void {
  socket?.emit("leave_conversation", { conversationId });
}

// ---------------------------- Mesajlaşma ----------------------------
export function sendMessage(conversationId: string, content: string): void {
  socket?.emit("send_message", { conversationId, content });
}

export function startTyping(conversationId: string): void {
  socket?.emit("typing_start", { conversationId });
}

export function stopTyping(conversationId: string): void {
  socket?.emit("typing_stop", { conversationId });
}

export function markSeen(conversationId: string): void {
  socket?.emit("mark_seen", { conversationId });
}
