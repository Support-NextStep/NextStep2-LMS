import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import CompanyHeader from "../components/CompanyHeader";
import BackLink from "../components/BackLink";
import FormField from "../components/FormField";
import Button from "../components/Button";
import {
  loadCompanyAccount,
  loadCompanyProfile,
  saveCompanyProfile,
  type CompanyAccount,
} from "../data/company";

type Errors = {
  companyName?: string;
  description?: string;
  industry?: string;
  location?: string;
  contactPerson?: string;
  contactEmail?: string;
  phone?: string;
};

const INDUSTRIES = [
  "Software & IT",
  "Finance & Banking",
  "Healthcare",
  "Education",
  "E-commerce & Retail",
  "Manufacturing",
  "Media & Entertainment",
  "Other",
];

export default function CompanyProfile() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<CompanyAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [logo, setLogo] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    const acct = loadCompanyAccount();
    // Guard: an unverified (or nonexistent) company cannot reach the profile
    // step as though it were verified.
    if (!acct) {
      navigate("/company/signup", { replace: true });
      return;
    }
    if (acct.verificationStatus !== "verified") {
      navigate("/company/verify", { state: { email: acct.workEmail }, replace: true });
      return;
    }
    setAccount(acct);
    const existing = loadCompanyProfile();
    if (existing?.logo) setLogo(existing.logo);
    setChecked(true);
  }, [navigate]);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!account) return;
    const form = new FormData(e.currentTarget);
    const companyName = String(form.get("companyName") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const industry = String(form.get("industry") ?? "").trim();
    const website = String(form.get("website") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const contactPerson = String(form.get("contactPerson") ?? "").trim();
    const contactEmail = String(form.get("contactEmail") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();

    const nextErrors: Errors = {};
    if (!companyName) nextErrors.companyName = "Company name is required.";
    if (!description) nextErrors.description = "A short company description helps students know who you are.";
    if (!industry) nextErrors.industry = "Select an industry.";
    if (!location) nextErrors.location = "Location is required.";
    if (!contactPerson) nextErrors.contactPerson = "Contact person is required.";
    if (!contactEmail) nextErrors.contactEmail = "Contact email is required.";
    else if (!/^\S+@\S+\.\S+$/.test(contactEmail)) nextErrors.contactEmail = "Enter a valid email address.";
    if (!phone) nextErrors.phone = "Phone number is required.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    // Mock save — replace with real API call later.
    setTimeout(() => {
      saveCompanyProfile({
        companyName,
        logo,
        description,
        industry,
        website,
        location,
        contactPerson,
        contactEmail,
        phone,
      });
      setSaving(false);
      navigate("/company/dashboard");
    }, 700);
  }

  if (!checked || !account) return null;

  return (
    <div className="min-h-screen bg-[#f4f7fc]">
      <CompanyHeader companyName={account.companyName} />

      <main className="mx-auto max-w-[1100px] px-6 py-10 sm:px-10">
        <BackLink to="/company/dashboard" label="Back to Dashboard" />

        <h1 className="mt-4 text-2xl font-semibold text-navy-500">Company Profile</h1>
        <p className="mt-1.5 text-sm text-navy-500/60">
          Tell students who you are. This is your company&apos;s identity on NextStep² — not a hiring requirement.
        </p>

        <form
          className="mt-8 flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-lg font-semibold text-brand-600">
              {logo ? (
                <img src={logo} alt="Company logo" className="h-full w-full object-cover" />
              ) : (
                (account.companyName[0] ?? "C").toUpperCase()
              )}
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-navy-500 hover:bg-slate-50">
                Upload logo
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              </label>
              <p className="mt-1.5 text-xs text-navy-500/50">Optional — PNG or JPG.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              label="Company Name"
              name="companyName"
              defaultValue={account.companyName}
              error={errors.companyName}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="industry" className="text-sm font-medium text-navy-500">
                Industry
              </label>
              <select
                id="industry"
                name="industry"
                defaultValue=""
                className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-navy-500 outline-none transition-colors ${
                  errors.industry
                    ? "border-error focus:border-error focus:ring-2 focus:ring-error/15"
                    : "border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
                }`}
              >
                <option value="" disabled>
                  Select an industry
                </option>
                {INDUSTRIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {errors.industry && <p className="text-sm text-error">{errors.industry}</p>}
            </div>

            <FormField
              label="Website"
              name="website"
              type="url"
              defaultValue={account.website ?? ""}
              placeholder="https://company.com"
            />
            <FormField label="Location" name="location" placeholder="City, Country" error={errors.location} />

            <FormField
              label="Contact Person"
              name="contactPerson"
              defaultValue={account.contactPerson}
              error={errors.contactPerson}
            />
            <FormField
              label="Contact Email"
              name="contactEmail"
              type="email"
              defaultValue={account.workEmail}
              error={errors.contactEmail}
            />

            <FormField
              label="Phone Number"
              name="phone"
              type="tel"
              defaultValue={account.phone}
              error={errors.phone}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="description" className="text-sm font-medium text-navy-500">
              Company Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              placeholder="What does your company do, and what kind of talent are you looking for?"
              className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-navy-500 placeholder:text-navy-500/35 outline-none transition-colors ${
                errors.description
                  ? "border-error focus:border-error focus:ring-2 focus:ring-error/15"
                  : "border-slate-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
              }`}
            />
            {errors.description && <p className="text-sm text-error">{errors.description}</p>}
          </div>

          <Button type="submit" loading={saving} className="!w-auto">
            Save Company Profile
          </Button>
        </form>
      </main>
    </div>
  );
}
