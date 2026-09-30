import { Router, type Response } from "express";
import {
  getOrCreateConversation,
  listConversationsForUser,
  listMessages,
  markConversationSeen,
  otherParticipant,
  serializeMessage,
} from "./service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitToUser } from "../sockets/handler.js";
import prisma from "../db.js";

const router = Router();

const USER_CARD_SELECT = {
  id: true,
  username: true,
  userTag: true,
  displayName: true,
  avatarUrl: true,
  lastSeen: true,
} as const;

// -------------------------------------------------------
// GET /conversations → sohbet listesi
// -------------------------------------------------------
router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit ?? "50"), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const userId = req.user!.id;

    const rows = await listConversationsForUser(userId, limit);

    const conversations = await Promise.all(
      rows.map(async (conv) => {
        const otherId = otherParticipant(conv, userId);
        const [other, unreadCount] = await Promise.all([
          prisma.user.findUnique({ where: { id: otherId }, select: USER_CARD_SELECT }),
          prisma.message.count({
            where: { conversationId: conv.id, senderId: { not: userId }, status: { not: "READ" } },
          }),
        ]);
        if (!other) return null;

        const last = conv.messages[0];

        return {
          id: conv.id,
          user: {
            id: other.id,
            username: other.username,
            userTag: other.userTag,
            displayName: other.displayName,
            avatarUrl: other.avatarUrl,
          },
          lastMessage: last ? serializeMessage(last) : null,
          unreadCount,
          updatedAt: conv.lastMessageAt,
        };
      }),
    );

    res.json({ ok: true, conversations: conversations.filter(Boolean) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Sohbet listesi yüklenemedi." });
  }
});

// -------------------------------------------------------
// POST /conversations → { userId } ile sohbeti bul/oluştur
// -------------------------------------------------------
router.post("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { userId: targetId } = req.body as { userId?: string };

    if (!targetId || typeof targetId !== "string") {
      return res.status(400).json({ ok: false, error: "userId gerekli." });
    }
    if (targetId === userId) {
      return res.status(400).json({ ok: false, error: "Kendinizle sohbet başlatamazsınız." });
    }

    const target = await prisma.user.findUnique({ where: { id: targetId }, select: USER_CARD_SELECT });
    if (!target) {
      return res.status(404).json({ ok: false, error: "Kullanıcı bulunamadı." });
    }

    const conversation = await getOrCreateConversation(userId, targetId);

    res.status(200).json({
      ok: true,
      conversation: {
        id: conversation.id,
        user: {
          id: target.id,
          username: target.username,
          userTag: target.userTag,
          displayName: target.displayName,
          avatarUrl: target.avatarUrl,
        },
        lastMessage: null,
        unreadCount: 0,
        updatedAt: conversation.lastMessageAt,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Sohbet başlatılamadı." });
  }
});

// -------------------------------------------------------
// GET /conversations/:id → mesajlar
// -------------------------------------------------------
router.get("/:id", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });

    if (!conversation) {
      return res.status(404).json({ ok: false, error: "Sohbet bulunamadı." });
    }
    if (conversation.participantA !== userId && conversation.participantB !== userId) {
      return res.status(403).json({ ok: false, error: "Bu sohbete erişim yetkiniz yok." });
    }

    const messages = await listMessages(conversation.id);
    const otherId = otherParticipant(conversation, userId);
    const other = await prisma.user.findUnique({ where: { id: otherId }, select: USER_CARD_SELECT });

    res.json({
      ok: true,
      conversation: {
        id: conversation.id,
        participantA: conversation.participantA,
        participantB: conversation.participantB,
        lastMessageAt: conversation.lastMessageAt,
        lastMessage: conversation.lastMessage,
        user: other
          ? {
              id: other.id,
              username: other.username,
              userTag: other.userTag,
              displayName: other.displayName,
              avatarUrl: other.avatarUrl,
            }
          : null,
        messages: messages.map(serializeMessage),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Mesajlar yüklenemedi." });
  }
});

// -------------------------------------------------------
// POST /conversations/:id/read → sohbeti okundu işaretle
// -------------------------------------------------------
router.post("/:id/read", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) {
      return res.status(404).json({ ok: false, error: "Sohbet bulunamadı." });
    }
    if (conversation.participantA !== userId && conversation.participantB !== userId) {
      return res.status(403).json({ ok: false, error: "Bu sohbete erişim yetkiniz yok." });
    }

    const otherId = otherParticipant(conversation, userId);
    const readIds = await markConversationSeen(conversation.id, userId);

    for (const messageId of readIds) {
      emitToUser(otherId, "message:ack", { messageId, status: "READ" });
    }

    res.json({ ok: true, readCount: readIds.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "İşlem başarısız." });
  }
});

export default router;
