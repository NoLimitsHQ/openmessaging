import { Server as SocketServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import prisma from "../db.js";
import {
  createMessage,
  markConversationSeen,
  markMessageDelivered,
  markUndeliveredForUser,
  otherParticipant,
  serializeMessage,
} from "../conversations/service.js";
import { verifyAccessToken } from "../middleware/auth.js";

let io: SocketServer | null = null;

export function getIo(): SocketServer | null {
  return io;
}

const userRoom = (userId: string) => `user:${userId}`;

/** Bir kullanıcının tüm açık sekmelerine olay gönderir. */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(userRoom(userId)).emit(event, payload);
}

export async function isUserOnline(userId: string): Promise<boolean> {
  if (!io) return false;
  const sockets = await io.in(userRoom(userId)).fetchSockets();
  return sockets.length > 0;
}

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: allowedOrigins(), credentials: true },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // Handshake doğrulaması: JWT (auth.token veya Authorization header)
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("Token gerekli."));

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Geçersiz veya süresi dolmuş token."));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId as string;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    await socket.join(userRoom(userId));

    prisma.user
      .update({ where: { id: userId }, data: { lastSeen: new Date() } })
      .catch(() => {});

    // Kullanıcı çevrimiçi oldu: bekleyen mesajları DELIVERED yap ve
    // göndericilere ack gönder (ikinci tik).
    markUndeliveredForUser(userId)
      .then((acks) => {
        for (const ack of acks) {
          emitToUser(ack.senderId, "message:ack", {
            messageId: ack.messageId,
            status: "DELIVERED",
          });
        }
      })
      .catch(() => {});

    // ---------------- Oda işlemleri ----------------
    socket.on("join_conversation", async ({ conversationId }: { conversationId?: string }) => {
      if (!conversationId) return;
      const conv = await prisma.conversation
        .findUnique({
          where: { id: conversationId },
          select: { participantA: true, participantB: true },
        })
        .catch(() => null);

      if (!conv || !isParticipant(conv, userId)) {
        socket.emit("error", { code: "FORBIDDEN", message: "Bu sohbete erişim yok." });
        return;
      }

      await socket.join(conversationId);
      socket.emit("joined", { conversationId });
    });

    socket.on("leave_conversation", ({ conversationId }: { conversationId?: string }) => {
      if (!conversationId) return;
      socket.leave(conversationId);
    });

    // ---------------- Mesaj gönderme ----------------
    socket.on(
      "send_message",
      async ({ conversationId, content }: { conversationId?: string; content?: string }) => {
        const text = (content ?? "").trim();
        if (!conversationId || !text) {
          socket.emit("error", { code: "INVALID", message: "Mesaj boş olamaz." });
          return;
        }

        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { participantA: true, participantB: true },
          });

          if (!conv || !isParticipant(conv, userId)) {
            socket.emit("error", { code: "FORBIDDEN", message: "Bu sohbete erişim yok." });
            return;
          }

          const message = await createMessage({ conversationId, senderId: userId, content: text });

          // Alıcı çevrimiçiyse mesaj anında iletilmiş sayılır.
          const recipientId = otherParticipant(conv, userId);
          if (await isUserOnline(recipientId)) {
            const delivered = await markMessageDelivered(message.id);
            message.status = delivered.status;
            socket.emit("message:ack", { messageId: message.id, status: "DELIVERED" });
          }

          const payload = { conversationId, message: serializeMessage(message) };

          // İki katılımcının da tüm sekmelerine gönder (oda katılımı gerekmez).
          emitToUser(conv.participantA, "message:new", payload);
          emitToUser(conv.participantB, "message:new", payload);
        } catch (err) {
          socket.emit("error", { code: "INTERNAL", message: "Mesaj gönderilemedi." });
        }
      },
    );

    // ---------------- Yazma göstergesi ----------------
    socket.on("typing_start", ({ conversationId }: { conversationId?: string }) => {
      if (!conversationId) return;
      socket.to(conversationId).emit("typing_start", { conversationId, userId });
    });

    socket.on("typing_stop", ({ conversationId }: { conversationId?: string }) => {
      if (!conversationId) return;
      socket.to(conversationId).emit("typing_stop", { conversationId, userId });
    });

    // ---------------- Okundu ----------------
    socket.on("mark_seen", async ({ conversationId }: { conversationId?: string }) => {
      if (!conversationId) return;
      try {
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { participantA: true, participantB: true },
        });
        if (!conv || !isParticipant(conv, userId)) return;

        const otherUserId = otherParticipant(conv, userId);
        const readIds = await markConversationSeen(conversationId, userId);

        for (const messageId of readIds) {
          emitToUser(otherUserId, "message:ack", { messageId, status: "READ" });
        }

        io?.to(conversationId).emit("conversation:seen", {
          conversationId,
          readerId: userId,
          messageIds: readIds,
        });
      } catch {
        // sessizce yut
      }
    });

    socket.on("disconnect", () => {
      prisma.user
        .update({ where: { id: userId }, data: { lastSeen: new Date() } })
        .catch(() => {});
    });
  });

  return io;
}

function isParticipant(
  conv: { participantA: string; participantB: string },
  userId: string,
): boolean {
  return conv.participantA === userId || conv.participantB === userId;
}
