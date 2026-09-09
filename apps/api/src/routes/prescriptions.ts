import { Router } from "express"
import { prescriptionsController } from "../controllers/prescriptionsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const prescriptionsRouter = Router()

prescriptionsRouter.use(requireStaffAuth)
prescriptionsRouter.get("/", asyncHandler(async (req, res) => prescriptionsController.list(req, res)))
prescriptionsRouter.get("/:id", asyncHandler(async (req, res) => prescriptionsController.get(req, res)))
prescriptionsRouter.post("/", asyncHandler(async (req, res) => prescriptionsController.create(req, res)))
prescriptionsRouter.get("/:id/pdf", asyncHandler(async (req, res) => prescriptionsController.downloadPdf(req, res)))
prescriptionsRouter.post("/:id/send", asyncHandler(async (req, res) => prescriptionsController.send(req, res)))
