/**
 * Coaching Module — barrel export
 */

export { registerCoachingRoutes } from "./routes.js";
export { registerCoachRelationshipRoutes } from "./relationshipRoutes.js";
export {
  requireCoachOf,
  activeRelationship,
  coachOf,
  clientsOf,
  assignCoach,
  endCoaching,
} from "./relationships.js";
export {
  enrollInRoutine,
  reconcileHabits,
  pauseRoutine,
  abandonRoutine,
} from "./enrollment.js";
export {
  formatLocalDateString,
  parseLocalDate,
  addDays,
  subtractDays,
  daysBetween,
} from "../../shared/utils/dates.js";
