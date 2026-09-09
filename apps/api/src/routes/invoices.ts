import { Router } from "express"
import { invoicesController } from "../controllers/invoicesController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const invoicesRouter = Router()

invoicesRouter.use(requireStaffAuth)
invoicesRouter.get("/", asyncHandler(async (req, res) => invoicesController.list(req, res)))
invoicesRouter.get("/:id", asyncHandler(async (req, res) => invoicesController.get(req, res)))
invoicesRouter.post("/", asyncHandler(async (req, res) => invoicesController.create(req, res)))
invoicesRouter.patch("/:id/paid", asyncHandler(async (req, res) => invoicesController.markPaid(req, res)))
invoicesRouter.get("/:id/pdf", asyncHandler(async (req, res) => invoicesController.downloadPdf(req, res)))
invoicesRouter.post("/:id/send", asyncHandler(async (req, res) => invoicesController.send(req, res)))
