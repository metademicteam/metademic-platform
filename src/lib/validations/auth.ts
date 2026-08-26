import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const orcidRegex = /^(\d{4}-){3}\d{3}[\dX]$/;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password is too long.")
      .regex(/[A-Z]/, "Must contain an uppercase letter.")
      .regex(/[a-z]/, "Must contain a lowercase letter.")
      .regex(/[0-9]/, "Must contain a number."),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the terms." }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ---------------------------------------------------------------------------
// Forgot / Reset password
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Onboarding — collected after registration (TASK §5)
// ---------------------------------------------------------------------------

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  displayName: z.string().trim().max(120).optional().or(z.literal("")),
  countryCode: z
    .string()
    .trim()
    .length(2, "Use a 2-letter country code (e.g. US, GB).")
    .toUpperCase()
    .optional()
    .or(z.literal("")),
  orcid: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || orcidRegex.test(v), {
      message: "ORCID must be in the form 0000-0000-0000-0000.",
    }),
  institutionName: z.string().trim().max(200).optional().or(z.literal("")),
  department: z.string().trim().max(200).optional().or(z.literal("")),
  position: z.string().trim().max(120).optional().or(z.literal("")),
  researchInterests: z
    .array(z.string().trim().min(1).max(60))
    .max(20, "At most 20 interests.")
    .optional()
    .default([]),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
  timezone: z.string().trim().max(60).optional().or(z.literal("")),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ---------------------------------------------------------------------------
// Update profile
// ---------------------------------------------------------------------------

export const updateProfileSchema = onboardingSchema.partial().extend({
  avatarUrl: z.string().url("Must be a valid URL.").optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL.").optional().or(z.literal("")),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
