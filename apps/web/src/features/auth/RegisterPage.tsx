import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button } from "@copilot/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";

import { AuthLayout } from "@/components/AuthLayout";
import { applyApiError } from "@/features/auth/form-errors";
import { FormField } from "@/features/auth/FormField";
import { registerSchema, type RegisterValues } from "@/features/auth/schemas";
import { useServices } from "@/lib/services";

export function RegisterPage() {
  const { auth } = useServices();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async ({ full_name, ...values }) => {
    setFormError(null);
    try {
      await auth.register({ ...values, full_name: full_name || null });
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(applyApiError(error, ["full_name", "email", "password"], setError));
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Upload your resume once. Apply everywhere faster."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <FormField
          label="Full name (optional)"
          autoComplete="name"
          error={errors.full_name?.message}
          {...register("full_name")}
        />
        <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <FormField
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="mt-2 w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
