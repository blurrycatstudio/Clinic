import { Router } from "express"
import { settingsController } from "../controllers/settingsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const settingsRouter = Router()

settingsRouter.use(requireStaffAuth)
settingsRouter.get("/", asyncHandler(async (req, res) => settingsController.get(req, res)))
settingsRouter.patch("/", asyncHandler(async (req, res) => settingsController.update(req, res)))
