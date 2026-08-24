import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";

export default function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      setError("Email is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(undefined);
    setLoading(true);
    // Mock request — replace with real API call later.
    setTimeout(() => {
      setLoading(false);
      setSentTo(email);
    }, 700);
  }

  if (sentTo) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We've sent password reset instructions to ${sentTo}.`}
        footer={
          <p className="text-navy-500/60">
            Back to{" "}
            <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
              Log In
            </Link>
          </p>
        }
      >
        <div className="flex flex-col items-center gap-6 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-7 w-7 text-brand-500">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <p className="text-sm text-navy-500/60">
            Didn&apos;t get the email? Check your spam folder, or try again.
          </p>
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            Try a different email
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot password?"
      subtitle="Enter your email and we'll send you reset instructions."
      footer={
        <p className="text-navy-500/60">
          Remembered your password?{" "}
          <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
            Log In
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
          error={error}
        />
        <Button type="submit" loading={loading}>
          Send Reset Link
        </Button>
      </form>
    </AuthLayout>
  );
}
