import { Router } from "express"
import { agentController } from "../controllers/agentController.js"
import { requireAgentAuth } from "../middleware/auth.js"
import { asyncHandler } from "../middleware/errorHandler.js"

export const agentRouter = Router()

agentRouter.use(requireAgentAuth)

agentRouter.get("/availability", asyncHandler(async (req, res) => agentController.getAvailability(req, res)))
agentRouter.get("/patients/lookup", asyncHandler(async (req, res) => agentController.lookupPatient(req, res)))
agentRouter.post("/patients", asyncHandler(async (req, res) => agentController.upsertPatient(req, res)))
agentRouter.get("/appointments/search", asyncHandler(async (req, res) => agentController.searchAppointments(req, res)))
agentRouter.post("/appointments", asyncHandler(async (req, res) => agentController.bookAppointment(req, res)))
agentRouter.patch("/appointments/:id/reschedule", asyncHandler(async (req, res) => agentController.rescheduleAppointment(req, res)))
agentRouter.patch("/appointments/:id/cancel", asyncHandler(async (req, res) => agentController.cancelAppointment(req, res)))
agentRouter.patch("/appointments/:id/confirm", asyncHandler(async (req, res) => agentController.confirmAttendance(req, res)))
agentRouter.get("/faq", asyncHandler(async (req, res) => agentController.getFaq(req, res)))
agentRouter.post("/whatsapp-location", asyncHandler(async (req, res) => agentController.sendLocation(req, res)))
agentRouter.post("/whatsapp-availability", asyncHandler(async (req, res) => agentController.sendAvailabilityOnWhatsapp(req, res)))
agentRouter.post("/whatsapp-appointment-details", asyncHandler(async (req, res) => agentController.sendAppointmentDetailsOnWhatsapp(req, res)))
agentRouter.post("/escalations", asyncHandler(async (req, res) => agentController.escalate(req, res)))
agentRouter.post("/whatsapp-handoff", asyncHandler(async (req, res) => agentController.whatsappHandoff(req, res)))
