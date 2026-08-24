import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import Button from "../components/Button";

const RESEND_COOLDOWN = 30; // seconds

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();

  // Email comes from Signup via router state; fall back if the page was opened directly.
  const email = (location.state as { email?: string } | null)?.email ?? "you@example.com";

  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [cooldown, setCooldown] = useState(0);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function handleResend() {
    if (resendState === "sending" || cooldown > 0) return;
    setResendState("sending");
    // Mock resend — replace with real API call later.
    setTimeout(() => {
      setResendState("sent");
      setCooldown(RESEND_COOLDOWN);
    }, 900);
  }

  function handleContinue() {
    setContinuing(true);
    // Mock verification check — replace with real API call later.
    setTimeout(() => navigate("/enroll"), 500);
  }

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="You're almost there — just confirm your email to activate your account."
      footer={
        <p className="text-navy-500/60">
          Already have a verified account?{" "}
          <Link to="/login" className="font-semibold text-brand-500 hover:text-brand-600">
            Log In
          </Link>
        </p>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              className="h-7 w-7 text-brand-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>

          <div>
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Account created successfully
            </p>
            <p className="mt-2 text-sm text-navy-500/70">
              We&apos;ve sent a verification link to
            </p>
            <p className="mt-0.5 font-semibold text-navy-500">{email}</p>
          </div>

          <p className="text-sm text-navy-500/60">
            Open the email and click the verification link to activate your
            account. Don&apos;t forget to check your spam folder.
          </p>

          <div className="flex w-full flex-col gap-3">
            <Button
              type="button"
              onClick={handleResend}
              loading={resendState === "sending"}
              disabled={cooldown > 0}
              variant="secondary"
            >
              {cooldown > 0
                ? `Resend email in ${cooldown}s`
                : resendState === "sent"
                ? "Verification email resent"
                : "Resend verification email"}
            </Button>

            <Link
              to="/signup"
              className="text-sm font-medium text-navy-500/60 hover:text-navy-500"
            >
              Wrong email? Change email
            </Link>
          </div>
        </div>

        <Button type="button" onClick={handleContinue} loading={continuing}>
          I&apos;ve verified my email — Continue
        </Button>
      </div>
    </AuthLayout>
  );
}
