import { Router } from "express"
import { patientDocumentsController } from "../controllers/patientDocumentsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const documentsRouter = Router()

documentsRouter.use(requireStaffAuth)
documentsRouter.get("/", asyncHandler(async (req, res) => patientDocumentsController.listAll(req, res)))
