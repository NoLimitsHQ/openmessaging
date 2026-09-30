import { Router, type Response } from "express";
import { lookupUserByTag } from "../auth/services.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import { emitToUser } from "../sockets/handler.js";
import prisma from "../db.js";

const router = Router();

const CONTACT_SELECT = {
  id: true,
  email: true,
  userTag: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  lastSeen: true,
} as const;

function toContactCard(contact: {
  id: string;
  email: string;
  userTag: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastSeen: Date;
}) {
  return {
    id: contact.id,
    email: contact.email,
    userTag: contact.userTag,
    username: contact.username,
    displayName: contact.displayName,
    avatarUrl: contact.avatarUrl,
    lastSeen: contact.lastSeen,
  };
}

// -------------------------------------------------------
// GET /contacts → kişi listesi
// -------------------------------------------------------
router.get("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { holderId: req.user!.id },
      include: { contact: { select: CONTACT_SELECT } },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ok: true,
      contacts: contacts.map((c) => ({ ...toContactCard(c.contact), addedAt: c.createdAt })),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Kişi listesi yüklenemedi." });
  }
});

// -------------------------------------------------------
// POST /contacts → { userTag } ile kişi ekle
// -------------------------------------------------------
router.post("/", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const rawTag = (req.body as { userTag?: string })?.userTag;

    if (!rawTag || typeof rawTag !== "string") {
      return res.status(400).json({ ok: false, error: "Kullanıcı kodu gerekli." });
    }

    const userTag = rawTag.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(userTag)) {
      return res.status(400).json({
        ok: false,
        error: "Kullanıcı kodu 6 haneli olmalı (ör. K83M2P).",
      });
    }

    const target = await lookupUserByTag(userTag);
    if (!target) {
      return res.status(404).json({ ok: false, error: "Bu kullanıcı koduna sahip hesap bulunamadı." });
    }
    if (target.id === userId) {
      return res.status(400).json({ ok: false, error: "Kendinizi kişi olarak ekleyemezsiniz." });
    }

    const existing = await prisma.contact.findUnique({
      where: { holderId_contactId: { holderId: userId, contactId: target.id } },
    });

    const contact = existing
      ? existing
      : await prisma.contact.create({ data: { holderId: userId, contactId: target.id } });

    const card = { ...toContactCard(target), addedAt: contact.createdAt };

    if (!existing) {
      emitToUser(userId, "contact:added", { contact: card });
    }

    res.status(existing ? 200 : 201).json({ ok: true, contact: card, alreadyAdded: Boolean(existing) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Kişi eklenemedi." });
  }
});

export default router;
