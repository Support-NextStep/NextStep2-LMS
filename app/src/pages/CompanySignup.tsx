import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import FormField from "../components/FormField";
import Button from "../components/Button";
import { generateCompanyId, saveCompanyAccount } from "../data/company";

type Errors = {
  companyName?: string;
  workEmail?: string;
  contactPerson?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
};

const PHONE_PATTERN = /^[+]?[\d\s()-]{7,}$/;

export default function CompanySignup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const companyName = String(form.get("companyName") ?? "").trim();
    const workEmail = String(form.get("workEmail") ?? "").trim();
    const contactPerson = String(form.get("contactPerson") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const website = String(form.get("website") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    const terms = form.get("terms");

    const nextErrors: Errors = {};
    if (!companyName) nextErrors.companyName = "Company name is required.";
    if (!workEmail) nextErrors.workEmail = "Work email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(workEmail)) nextErrors.workEmail = "Enter a valid email address.";
    if (!contactPerson) nextErrors.contactPerson = "Contact person name is required.";
    if (!phone) nextErrors.phone = "Phone number is required.";
    else if (!PHONE_PATTERN.test(phone)) nextErrors.phone = "Enter a valid phone number.";
    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match.";
    if (!terms) nextErrors.terms = "Please acknowledge the Terms and Privacy Policy.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setLoading(true);
    // Mock signup — replace with real API call later.
    setTimeout(() => {
      saveCompanyAccount({
        id: generateCompanyId(),
        companyName,
        workEmail,
        contactPerson,
        phone,
        website: website || undefined,
        verificationStatus: "unverified",
      });
      setLoading(false);
      navigate("/company/verify", { state: { email: workEmail } });
    }, 700);
  }

  return (
    <AuthLayout
      title="Create your company account"
      subtitle="Find and hire industry-ready talent on NextStep²."
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
          Already have a company account?{" "}
          <Link to="/company/login" className="font-semibold text-brand-500 hover:text-brand-600">
            Log In
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Company Name"
          name="companyName"
          autoComplete="organization"
          placeholder="Acme Inc."
          error={errors.companyName}
        />
        <FormField
          label="Work Email"
          name="workEmail"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.workEmail}
        />
        <FormField
          label="Contact Person Name"
          name="contactPerson"
          autoComplete="name"
          placeholder="Jordan Smith"
          error={errors.contactPerson}
        />
        <FormField
          label="Phone Number"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          error={errors.phone}
        />
        <FormField
          label="Company Website"
          name="website"
          type="url"
          autoComplete="url"
          placeholder="https://company.com (optional)"
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
          Create Company Account
        </Button>
      </form>
    </AuthLayout>
  );
}
