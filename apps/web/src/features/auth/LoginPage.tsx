import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button } from "@copilot/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";

import { AuthLayout } from "@/components/AuthLayout";
import { applyApiError } from "@/features/auth/form-errors";
import { FormField } from "@/features/auth/FormField";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { useServices } from "@/lib/services";

export function LoginPage() {
  const { auth } = useServices();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.login(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/") ? from : "/", { replace: true });
    } catch (error) {
      setFormError(applyApiError(error, ["email", "password"], setError));
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your applications"
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" className="mt-2 w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
