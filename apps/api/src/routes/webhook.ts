import { Router } from "express"
import { verifyWebhook, receiveWebhook } from "../controllers/webhookController.js"
import { verifyWhatsappSignature } from "../middleware/verifyWhatsappSignature.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const webhookRouter = Router()

webhookRouter.get("/", verifyWebhook)
webhookRouter.post("/", verifyWhatsappSignature, asyncHandler(async (req, res) => receiveWebhook(req, res)))
