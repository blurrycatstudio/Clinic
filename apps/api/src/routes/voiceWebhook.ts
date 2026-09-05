import { Router } from "express"
import { receiveVapiWebhook, verifyVapiSignature } from "../controllers/voiceWebhookController.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const voiceWebhookRouter = Router()

voiceWebhookRouter.post("/", verifyVapiSignature, asyncHandler(async (req, res) => receiveVapiWebhook(req, res)))
