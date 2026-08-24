import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { loadCompanyAccount } from "../data/company";

export default function CompanyLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const workEmail = String(form.get("workEmail") ?? "").trim();

    if (!workEmail) {
      setError("Work email is required.");
      return;
    }

    setError(undefined);
    setLoading(true);
    // Mock auth — this prototype has no real backend or password check.
    setTimeout(() => {
      setLoading(false);
      const account = loadCompanyAccount();
      if (!account || account.workEmail.toLowerCase() !== workEmail.toLowerCase()) {
        setError("No company account found with that email.");
        return;
      }
      if (account.verificationStatus !== "verified") {
        navigate("/company/verify", { state: { email: account.workEmail } });
        return;
      }
      navigate("/company/dashboard");
    }, 600);
  }

  return (
    <AuthLayout
      title="Log in to your company account"
      subtitle="Access your NextStep² for Business workspace."
      brandBadge="For Business"
      brandHeading={
        <>
          Hire the next generation of
          <br />
          industry-ready talent.
        </>
      }
      brandDescription={
        <>
          Discover students who have already practiced real work, been
          assessed on it, and can prove what they can do.
        </>
      }
      footer={
        <p className="text-navy-500/60">
          Don&apos;t have a company account?{" "}
          <Link to="/company/signup" className="font-semibold text-brand-500 hover:text-brand-600">
            Sign Up
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Work Email"
          name="workEmail"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={error}
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
        />

        <Button type="submit" loading={loading}>
          Log In
        </Button>
      </form>
    </AuthLayout>
  );
}
