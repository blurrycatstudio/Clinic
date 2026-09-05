import type { Request, Response } from "express"
import { z } from "zod"
import { conversationRepository } from "../repositories/conversationRepository.js"
import { messageRepository } from "../repositories/messageRepository.js"
import { whatsappService } from "../services/whatsappService.js"
import { NotFoundError } from "../lib/errors.js"

export const conversationsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        status: z.enum(["active", "closed", "escalated"]).optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await conversationRepository.list(query)
    res.json(result)
  },

  async getMessages(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const messages = await messageRepository.listForConversation(params.id)
    res.json({ messages })
  },

  /** Lets staff send a free-form manual WhatsApp message from the dashboard (e.g. Messages page). */
  async sendManualMessage(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ text: z.string().min(1) }).parse(req.body)

    const conv = await conversationRepository.findById(params.id)
    if (!conv) throw new NotFoundError("Conversation not found")
    const { messageId } = await whatsappService.sendTextMessage(conv.wa_phone_e164, body.text)
    const message = await messageRepository.log({
      conversationId: conv.id,
      direction: "outbound",
      messageType: "text",
      body: body.text,
      waMessageId: messageId,
    })
    res.status(201).json({ message })
  },
}
