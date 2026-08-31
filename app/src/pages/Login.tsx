import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { loginStudentAccount } from "../data/auth";
import { ApiError } from "../data/apiClient";

// ---------------------------------------------------------------------------
// Real authentication against the backend (Phase 0) — see
// NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md Part 11.
//
// Deliberately NOT adding a route guard to the rest of the Student app here.
// Every Student page (Dashboard, My Course, Session, Performance, Portfolio)
// remains exactly as reachable as it is today — this Phase 0 change makes
// the login itself real (a wrong password now genuinely fails, and a
// successful login establishes a real httpOnly-cookie session) without
// retrofitting access control onto pages that never had any, which would be
// a materially larger behavior change than "connect authentication" asked
// for. Student-generated data (progress/performance/portfolio/exercise
// submissions) is still local-only in this phase — see the implementation
// report — so nothing downstream of login reads the now-real session yet.
// ---------------------------------------------------------------------------
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const nextErrors: typeof errors = {};
    if (!email) nextErrors.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Password is required.";

    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    try {
      await loginStudentAccount(email, password);
      navigate("/dashboard");
    } catch (err) {
      setFormError(
        err instanceof ApiError && err.status === 401
          ? "Invalid email or password."
          : err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue your learning journey."
      footer={
        <p className="text-navy-500/60">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="font-semibold text-brand-500 hover:text-brand-600">
            Create account
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={errors.password}
        />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-navy-500/70">
            <input
              type="checkbox"
              name="remember"
              className="h-4 w-4 rounded border-slate-300 text-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="font-medium text-brand-500 hover:text-brand-600">
            Forgot password?
          </Link>
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-error">
            {formError}
          </p>
        )}

        <Button type="submit" loading={loading}>
          Log In
        </Button>
      </form>
    </AuthLayout>
  );
}
