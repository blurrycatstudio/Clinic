import type { Request, Response } from "express"
import { z } from "zod"
import { voiceCallRepository, callTranscriptRepository } from "../repositories/voiceCallRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { vapiService } from "../services/vapiService.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"
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

  /** Staff-triggered outbound call to any phone number — places a real call through Vapi. */
  async initiateOutbound(req: Request, res: Response) {
    const body = z.object({ phoneE164: z.string().min(8) }).parse(req.body)

    const patient = await patientRepository.findByPhone(body.phoneE164)
    const { vapiCallId } = await vapiService.createOutboundCall({ phoneE164: body.phoneE164 })
    const call = await voiceCallRepository.create({
      vapiCallId,
      phoneE164: body.phoneE164,
      direction: "outbound",
      patientId: patient?.id ?? null,
    })

    await auditLogRepository.record({
      actorType: "staff",
      actorId: req.staffUser?.id ?? null,
      action: "voice_call.outbound_initiated",
      entityType: "voice_call",
      entityId: call.id,
      metadata: { phoneE164: body.phoneE164 },
    })

    res.status(201).json({ call })
  },
}
