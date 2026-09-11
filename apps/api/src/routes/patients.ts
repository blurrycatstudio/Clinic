import { Router } from "express"
import { patientsController } from "../controllers/patientsController.js"
import { patientDocumentsController } from "../controllers/patientDocumentsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const patientsRouter = Router()

patientsRouter.use(requireStaffAuth)
patientsRouter.get("/", asyncHandler(async (req, res) => patientsController.list(req, res)))
patientsRouter.get("/:id", asyncHandler(async (req, res) => patientsController.get(req, res)))
patientsRouter.patch("/:id", asyncHandler(async (req, res) => patientsController.updateBasicInfo(req, res)))
patientsRouter.patch("/:id/clinical-info", asyncHandler(async (req, res) => patientsController.updateClinicalInfo(req, res)))
patientsRouter.get("/:id/documents", asyncHandler(async (req, res) => patientDocumentsController.list(req, res)))
patientsRouter.post("/:id/documents", asyncHandler(async (req, res) => patientDocumentsController.upload(req, res)))
patientsRouter.delete("/:id/documents/:documentId", asyncHandler(async (req, res) => patientDocumentsController.remove(req, res)))
