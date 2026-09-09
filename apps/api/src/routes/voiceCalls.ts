import { Router } from "express"
import { voiceCallsController } from "../controllers/voiceCallsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const voiceCallsRouter = Router()

voiceCallsRouter.use(requireStaffAuth)
voiceCallsRouter.get("/", asyncHandler(async (req, res) => voiceCallsController.list(req, res)))
voiceCallsRouter.get("/:id/transcript", asyncHandler(async (req, res) => voiceCallsController.getTranscript(req, res)))
voiceCallsRouter.post("/outbound", asyncHandler(async (req, res) => voiceCallsController.initiateOutbound(req, res)))
