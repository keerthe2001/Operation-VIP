import { z } from "zod";

const email = z.string().trim().min(1, "Enter your email").email("Enter a valid email address");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  full_name: z.string().trim().max(200, "Name is too long").optional(),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Use at most 128 characters"),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
