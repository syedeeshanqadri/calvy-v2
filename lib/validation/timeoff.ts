import { z } from "zod";
import { text, id, dateField, timeField, blankToUndef } from "./common";

/**
 * Time off is entered as calendar days (and optional clock times) in the
 * business timezone: no times = whole days, startDate..endDate inclusive.
 */
export const timeOffCreateSchema = z
  .object({
    staffId: z.preprocess(blankToUndef, id.optional()),
    startDate: dateField,
    endDate: z.preprocess(blankToUndef, dateField.optional()),
    startTime: z.preprocess(blankToUndef, timeField.optional()),
    endTime: z.preprocess(blankToUndef, timeField.optional()),
    reason: z.preprocess(blankToUndef, text(200).optional()),
  })
  .refine((b) => !!b.startTime === !!b.endTime, { message: "Give both startTime and endTime, or neither", path: ["endTime"] })
  .refine((b) => !b.endDate || b.endDate >= b.startDate, { message: "endDate cannot be before startDate", path: ["endDate"] });

export const timeOffListQuery = z.object({
  staffId: id.optional().catch(undefined),
  from: dateField.optional().catch(undefined),
});
