import { Router } from "express"
import { conversationsController } from "../controllers/conversationsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const conversationsRouter = Router()

conversationsRouter.use(requireStaffAuth)
conversationsRouter.get("/", asyncHandler(async (req, res) => conversationsController.list(req, res)))
conversationsRouter.get("/:id/messages", asyncHandler(async (req, res) => conversationsController.getMessages(req, res)))
conversationsRouter.post("/:id/messages", asyncHandler(async (req, res) => conversationsController.sendManualMessage(req, res)))
