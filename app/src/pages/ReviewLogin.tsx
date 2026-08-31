import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { loginContentReviewerAccount } from "../data/contentReviewer";
import { ApiError } from "../data/apiClient";

export default function ReviewLogin() {
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
    // Real authentication against the backend (Phase 0) — see
    // ../data/contentReviewer.ts. A separate account/session boundary from
    // Content Author (a different `role` value on the same `users` table),
    // even if the same person happens to log in with the same email on
    // both. This can now genuinely fail (wrong password, not a Content
    // Reviewer account, or the backend being unreachable), unlike the old
    // mock which always "succeeded."
    try {
      await loginContentReviewerAccount(email, password);
      navigate("/review/dashboard");
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
      title="Content Approval Login"
      subtitle="Review submitted content, request changes, approve, and publish."
      brandBadge="Approval Team"
      brandHeading={
        <>
          Turn submitted content into
          <br />
          published learning.
        </>
      }
      brandDescription={
        <>
          Review content the way a student will see it, request changes when something isn&apos;t
          ready, and publish once it is — the Content Team&apos;s source content is never edited
          here.
        </>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@nextstep2.com"
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
