import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";

type Errors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

export default function Signup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const terms = form.get("terms");

    const nextErrors: Errors = {};
    if (!fullName) nextErrors.fullName = "Full name is required.";
    if (!email) nextErrors.email = "Email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match.";
    if (!terms) nextErrors.terms = "Please acknowledge the Terms and Privacy Policy.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    // Mock signup — replace with real API call later.
    setTimeout(() => {
      setLoading(false);
      navigate("/verify-email", { state: { email } });
    }, 700);
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start learning industry-ready skills today."
      footer={
        <p className="text-navy-500/60">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
            Log In
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Full Name"
          name="fullName"
          autoComplete="name"
          placeholder="Jordan Smith"
          error={errors.fullName}
        />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password}
        />
        <FormField
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          error={errors.confirmPassword}
        />

        <div>
          <label className="flex items-start gap-2.5 text-sm text-navy-500/70">
            <input
              type="checkbox"
              name="terms"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            />
            <span>
              I agree to the{" "}
              <a href="#" className="font-medium text-brand-500 hover:text-brand-600">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="font-medium text-brand-500 hover:text-brand-600">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-sm text-error">{errors.terms}</p>}
        </div>

        <Button type="submit" loading={loading}>
          Create Account
        </Button>
      </form>
    </AuthLayout>
  );
}
