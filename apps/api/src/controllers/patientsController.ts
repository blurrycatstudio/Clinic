import type { Request, Response } from "express"
import { z } from "zod"
import { patientRepository } from "../repositories/patientRepository.js"
import { appointmentRepository } from "../repositories/appointmentRepository.js"
import { NotFoundError } from "../lib/errors.js"

export const patientsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await patientRepository.list(query)
    res.json(result)
  },

  async get(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const patient = await patientRepository.findById(params.id)
    if (!patient) throw new NotFoundError("Patient not found")
    const appointments = await appointmentRepository.listUpcomingForPatient(patient.id)
    res.json({ patient, upcomingAppointments: appointments })
  },
}
