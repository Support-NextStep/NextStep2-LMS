import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { loginContentAuthorAccount } from "../data/contentAuthor";
import { ApiError } from "../data/apiClient";

export default function ContentLogin() {
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
    // ../data/contentAuthor.ts. This can now genuinely fail (wrong
    // password, not a Content Author account, or the backend being
    // unreachable), unlike the old mock which always "succeeded."
    try {
      await loginContentAuthorAccount(email, password);
      navigate("/content/dashboard");
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
      title="Content Team Login"
      subtitle="Author and prepare course content, then submit it for the Approval Team to review."
      brandBadge="Content Team"
      brandHeading={
        <>
          Turn a session document into
          <br />
          ready-for-review content.
        </>
      }
      brandDescription={
        <>
          Author a session, upload its DOCX documents, and submit it for review — the Approval Team
          takes it from there.
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
