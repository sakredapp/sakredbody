/**
 * Coaching Module — barrel export
 */

export { registerCoachingRoutes } from "./routes";
export {
  enrollInRoutine,
  reconcileHabits,
  pauseRoutine,
  abandonRoutine,
} from "./enrollment";
export {
  formatLocalDateString,
  parseLocalDate,
  addDays,
  subtractDays,
  daysBetween,
} from "../../shared/utils/dates";
