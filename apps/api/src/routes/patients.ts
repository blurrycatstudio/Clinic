import { Router } from "express"
import { patientsController } from "../controllers/patientsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const patientsRouter = Router()

patientsRouter.use(requireStaffAuth)
patientsRouter.get("/", asyncHandler(async (req, res) => patientsController.list(req, res)))
patientsRouter.get("/:id", asyncHandler(async (req, res) => patientsController.get(req, res)))
