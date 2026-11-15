/**
 * Server-side validation for the calendar endpoint. Kept apart from
 * shared/calendar.ts so the browser bundle does not pull in zod for date helpers.
 */
import { z } from "zod";
import { MAX_YEAR, MIN_YEAR } from "./calendar";

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(MIN_YEAR).max(MAX_YEAR),
  month: z.coerce.number().int().min(1).max(12),
});
