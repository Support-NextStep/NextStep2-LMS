import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { deriveAdminName, saveAdminAccount } from "../data/adminAccount";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const nextErrors: typeof errors = {};
    if (!email) nextErrors.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Password is required.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    // Mock internal-role auth — no real backend/credential store exists yet.
    // First login on a fresh browser creates the local Admin session.
    setTimeout(() => {
      saveAdminAccount({ name: deriveAdminName(email), email });
      setLoading(false);
      navigate("/admin/dashboard");
    }, 500);
  }

  return (
    <AuthLayout
      title="Admin Login"
      subtitle="Platform visibility over students and content — read-only."
      brandBadge="Admin"
      brandHeading={
        <>
          See what&apos;s happening
          <br />
          across the platform.
        </>
      }
      brandDescription={
        <>
          Review student progress and performance, and see what content is
          published, in review, or awaiting changes — all in one place.
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

        <Button type="submit" loading={loading}>
          Log In
        </Button>
      </form>
    </AuthLayout>
  );
}
