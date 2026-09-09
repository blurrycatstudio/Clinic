import type { Request, Response } from "express"
import { z } from "zod"
import { clinicSettingsRepository } from "../repositories/clinicSettingsRepository.js"
import { auditLogRepository } from "../repositories/auditLogRepository.js"

const updateSchema = z.object({
  clinic_name: z.string().min(1).optional(),
  doctor_name: z.string().min(1).optional(),
  doctor_specialty: z.string().optional(),
  doctor_license: z.string().optional(),
  address: z.string().optional(),
  google_maps_url: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  phone_e164: z.string().optional(),
  hours_summary_en: z.string().optional(),
  hours_summary_es: z.string().optional(),
  parking_info_en: z.string().optional(),
  parking_info_es: z.string().optional(),
  fees_info_en: z.string().optional(),
  fees_info_es: z.string().optional(),
  insurance_info_en: z.string().optional(),
  insurance_info_es: z.string().optional(),
  reminder_call_enabled: z.boolean().optional(),
  reminder_call_hours_before: z.number().int().min(1).max(72).optional(),
})

export const settingsController = {
  async get(_req: Request, res: Response) {
    const settings = await clinicSettingsRepository.get()
    res.json({ settings })
  },

  async update(req: Request, res: Response) {
    const body = updateSchema.parse(req.body)
    const current = await clinicSettingsRepository.get()
    const updated = await clinicSettingsRepository.update(current.id, body)

    await auditLogRepository.record({
      actorType: "staff",
      actorId: req.staffUser?.id ?? null,
      action: "settings.updated",
      entityType: "clinic_settings",
      entityId: updated.id,
      metadata: { changedFields: Object.keys(body) },
    })

    res.json({ settings: updated })
  },
}
