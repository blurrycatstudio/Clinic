import { Router } from "express"
import { appointmentsController } from "../controllers/appointmentsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const appointmentsRouter = Router()

appointmentsRouter.use(requireStaffAuth)
appointmentsRouter.get("/", asyncHandler(async (req, res) => appointmentsController.list(req, res)))
appointmentsRouter.get("/slots", asyncHandler(async (req, res) => appointmentsController.getSlots(req, res)))
appointmentsRouter.post("/", asyncHandler(async (req, res) => appointmentsController.create(req, res)))
appointmentsRouter.patch("/:id/reschedule", asyncHandler(async (req, res) => appointmentsController.reschedule(req, res)))
appointmentsRouter.patch("/:id/cancel", asyncHandler(async (req, res) => appointmentsController.cancel(req, res)))
appointmentsRouter.patch("/:id/status", asyncHandler(async (req, res) => appointmentsController.updateStatus(req, res)))
appointmentsRouter.post("/:id/call", asyncHandler(async (req, res) => appointmentsController.callToConfirm(req, res)))
