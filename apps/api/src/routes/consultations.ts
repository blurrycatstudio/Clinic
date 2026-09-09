import { Router } from "express"
import { consultationsController } from "../controllers/consultationsController.js"
import { requireStaffAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const consultationsRouter = Router()

consultationsRouter.use(requireStaffAuth)
consultationsRouter.get("/", asyncHandler(async (req, res) => consultationsController.list(req, res)))
consultationsRouter.get("/:id", asyncHandler(async (req, res) => consultationsController.get(req, res)))
consultationsRouter.post("/", asyncHandler(async (req, res) => consultationsController.create(req, res)))
