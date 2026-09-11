import type { Request, Response } from "express"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { patientDocumentRepository } from "../repositories/patientDocumentRepository.js"
import { patientRepository } from "../repositories/patientRepository.js"
import { storageService } from "../services/storageService.js"
import { NotFoundError, ValidationError } from "../lib/errors.js"

const MAX_SIZE_BYTES = 10 * 1024 * 1024

export const patientDocumentsController = {
  async list(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const patient = await patientRepository.findById(params.id)
    if (!patient) throw new NotFoundError("Patient not found")
    const documents = await patientDocumentRepository.listForPatient(params.id)
    res.json({ documents })
  },

  async upload(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        name: z.string().min(1),
        mimeType: z.string().min(1),
        dataBase64: z.string().min(1),
      })
      .parse(req.body)

    const patient = await patientRepository.findById(params.id)
    if (!patient) throw new NotFoundError("Patient not found")

    const buffer = Buffer.from(body.dataBase64, "base64")
    if (buffer.length === 0) throw new ValidationError("Empty file")
    if (buffer.length > MAX_SIZE_BYTES) throw new ValidationError("File is larger than 10MB")

    const extension = body.name.includes(".") ? body.name.slice(body.name.lastIndexOf(".")) : ""
    const key = `patient-documents/${params.id}/${randomUUID()}${extension}`
    const url = await storageService.uploadFile(key, buffer, body.mimeType)

    const document = await patientDocumentRepository.create({
      patientId: params.id,
      name: body.name,
      mimeType: body.mimeType,
      sizeBytes: buffer.length,
      url,
    })
    res.status(201).json({ document })
  },

  async remove(req: Request, res: Response) {
    const params = z.object({ id: z.string().uuid(), documentId: z.string().uuid() }).parse(req.params)
    await patientDocumentRepository.delete(params.documentId, params.id)
    res.status(204).send()
  },
}
