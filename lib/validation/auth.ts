import { z } from "zod";

const emailField = z
  .string()
  .max(254)
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email().max(254));

export const forgotPasswordSchema = z.object({ email: emailField });
export const resendVerificationSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/i, "Invalid token"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Password must be at most 72 bytes."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
