import { z } from "zod";

const emailField = z.string().max(254).transform((s) => s.trim().toLowerCase()).pipe(z.string().email().max(254));
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Password must be at most 72 bytes.");
const tokenField = z.string().regex(/^[0-9a-f]{64}$/i, "Invalid token");

export const customerSignupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120),
  email: emailField,
  password: passwordField,
});
export const customerEmailSchema = z.object({ email: emailField });
/** Verifying needs the link AND the password chosen at signup, so a stranger's signup with someone else's email cannot be completed by that person. */
export const customerVerifySchema = z.object({ token: tokenField, password: z.string().min(1).max(200) });
export const customerResetSchema = z.object({ token: tokenField, password: passwordField });
export const customerProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    currentPassword: z.string().max(200).optional(),
    newPassword: passwordField.optional(),
  })
  .refine((b) => !b.newPassword || !!b.currentPassword, { message: "Enter your current password to set a new one.", path: ["currentPassword"] });
