import { Router } from "express"
import { dashboardController } from "../controllers/dashboardController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const dashboardRouter = Router()

dashboardRouter.use(requireStaffAuth)
dashboardRouter.get("/stats", asyncHandler(async (req, res) => dashboardController.getStats(req, res)))
