import prisma from "../db.js";

export const MESSAGE_SENDER_SELECT = {
  id: true,
  username: true,
  userTag: true,
  displayName: true,
  avatarUrl: true,
} as const;

/** participantA < participantB invariant'ı (string compare). */
export function normalizeParticipantPair(
  a: string,
  b: string,
): { participantA: string; participantB: string } {
  return a < b ? { participantA: a, participantB: b } : { participantA: b, participantB: a };
}

export function otherParticipant(
  conversation: { participantA: string; participantB: string },
  userId: string,
): string {
  return conversation.participantA === userId ? conversation.participantB : conversation.participantA;
}

export async function getOrCreateConversation(userIdA: string, userIdB: string) {
  const { participantA, participantB } = normalizeParticipantPair(userIdA, userIdB);

  const existing = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA, participantB } },
  });
  if (existing) return existing;

  try {
    return await prisma.conversation.create({ data: { participantA, participantB } });
  } catch {
    // Aynı anda iki istek gelirse unique kısıtı tetiklenebilir; tekrar oku.
    const created = await prisma.conversation.findUnique({
      where: { participantA_participantB: { participantA, participantB } },
    });
    if (!created) throw new Error("Sohbet oluşturulamadı.");
    return created;
  }
}

export async function findConversationById(id: string) {
  return prisma.conversation.findUnique({ where: { id } });
}

export async function listMessages(conversationId: string, limit = 200) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sender: { select: MESSAGE_SENDER_SELECT } },
  });
  return messages.reverse();
}

export async function listConversationsForUser(userId: string, limit = 50) {
  return prisma.conversation.findMany({
    where: { OR: [{ participantA: userId }, { participantB: userId }] },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: MESSAGE_SENDER_SELECT } },
      },
    },
  });
}

export async function createMessage({
  conversationId,
  senderId,
  content,
}: {
  conversationId: string;
  senderId: string;
  content: string;
}) {
  const message = await prisma.message.create({
    data: { conversationId, senderId, content, status: "SENT" },
    include: { sender: { select: MESSAGE_SENDER_SELECT } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastMessage: content.slice(0, 1024), lastSenderId: senderId },
  });

  return message;
}

export async function markMessageDelivered(messageId: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  });
}

export async function markConversationSeen(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantA: true, participantB: true },
  });
  if (!conversation) return [];

  const otherUserId = otherParticipant(conversation, userId);

  const pending = await prisma.message.findMany({
    where: { conversationId, senderId: otherUserId, status: { not: "READ" } },
    select: { id: true },
  });
  if (pending.length === 0) return [];

  await prisma.message.updateMany({
    where: { id: { in: pending.map((m) => m.id) } },
    data: { status: "READ", readAt: new Date() },
  });

  return pending.map((m) => m.id);
}

/** Kullanıcı çevrimiçi olduğunda ona gönderilmiş bekleyen mesajları DELIVERED yapar. */
export async function markUndeliveredForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ participantA: userId }, { participantB: userId }] },
    select: { id: true, participantA: true, participantB: true },
  });

  const acks: { senderId: string; messageId: string }[] = [];

  for (const conv of conversations) {
    const otherUserId = otherParticipant(conv, userId);
    const pending = await prisma.message.findMany({
      where: { conversationId: conv.id, senderId: otherUserId, status: "SENT" },
      select: { id: true },
    });
    if (pending.length === 0) continue;

    await prisma.message.updateMany({
      where: { id: { in: pending.map((m) => m.id) } },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });

    for (const m of pending) acks.push({ senderId: otherUserId, messageId: m.id });
  }

  return acks;
}

export function serializeMessage(message: {
  id: string;
  content: string;
  senderId: string;
  status: string;
  createdAt: Date;
  sender: { userTag: string | null; username: string | null };
}) {
  return {
    id: message.id,
    content: message.content,
    senderId: message.senderId,
    senderUserTag: message.sender.userTag,
    senderUsername: message.sender.username,
    status: message.status,
    createdAt: message.createdAt,
  };
}
