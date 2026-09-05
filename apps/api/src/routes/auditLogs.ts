import { Router } from "express"
import { auditLogsController } from "../controllers/auditLogsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const auditLogsRouter = Router()

auditLogsRouter.use(requireStaffAuth)
auditLogsRouter.get("/", asyncHandler(async (req, res) => auditLogsController.list(req, res)))
