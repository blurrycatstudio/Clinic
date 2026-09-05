import type { Request, Response } from "express"
import { z } from "zod"
import { voiceCallRepository, callTranscriptRepository } from "../repositories/voiceCallRepository.js"
import { NotFoundError } from "../lib/errors.js"

export const voiceCallsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({ limit: z.coerce.number().min(1).max(200).optional(), offset: z.coerce.number().min(0).optional() })
      .parse(req.query)
    const result = await voiceCallRepository.list(query)
    res.json(result)
  },

  async getTranscript(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const call = await voiceCallRepository.findById(params.id)
    if (!call) throw new NotFoundError("Voice call not found")
    const transcript = await callTranscriptRepository.listForCall(call.id)
    res.json({ call, transcript })
  },
}
