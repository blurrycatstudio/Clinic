import type { Request, Response } from "express"
import { z } from "zod"
import { consultationRepository } from "../repositories/consultationRepository.js"
import { NotFoundError } from "../lib/errors.js"

export const consultationsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        patientId: z.string().uuid().optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await consultationRepository.list(query)
    res.json(result)
  },

  async get(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const consultation = await consultationRepository.findById(params.id)
    if (!consultation) throw new NotFoundError("Consultation not found")
    res.json({ consultation })
  },

  async create(req: Request, res: Response) {
    const body = z
      .object({
        patientId: z.string().uuid(),
        appointmentId: z.string().uuid().optional(),
        chiefComplaint: z.string().min(1),
        diagnosis: z.string().default(""),
        notes: z.string().default(""),
        weightKg: z.coerce.number().positive().optional(),
        heightCm: z.coerce.number().positive().optional(),
        temperatureC: z.coerce.number().optional(),
      })
      .parse(req.body)

    const consultation = await consultationRepository.create(body)
    res.status(201).json({ consultation })
  },
}
