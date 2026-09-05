import type { Request, Response } from "express"
import { z } from "zod"
import { auditLogRepository } from "../repositories/auditLogRepository.js"

export const auditLogsController = {
  async list(req: Request, res: Response) {
    const query = z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).optional(),
        offset: z.coerce.number().min(0).optional(),
      })
      .parse(req.query)
    const result = await auditLogRepository.list(query)
    res.json(result)
  },
}
