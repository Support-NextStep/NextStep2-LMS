import type { ReactNode } from "react";
import Logo from "./Logo";

type AuthLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Small pill shown above the brand headline — e.g. "For Business". Omit for the default student experience. */
  brandBadge?: string;
  /** Overrides the default student marketing headline in the brand panel. */
  brandHeading?: ReactNode;
  /** Overrides the default student marketing subtext in the brand panel. */
  brandDescription?: ReactNode;
};

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  brandBadge,
  brandHeading,
  brandDescription,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#f4f7fc] lg:grid lg:grid-cols-2">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden overflow-hidden bg-navy-500 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(22,103,239,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(22,103,239,0.25), transparent 40%)",
          }}
        />
        <div className="relative">
          <Logo className="h-11" variant="light" />
        </div>
        <div className="relative max-w-lg">
          {brandBadge && (
            <span className="mb-4 inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
              {brandBadge}
            </span>
          )}
          <p className="text-4xl font-bold leading-[1.15] tracking-tight text-white">
            {brandHeading ?? (
              <>
                Learn industry skills.
                <br />
                Build real proof of what you can do.
              </>
            )}
          </p>
          <p className="mt-5 text-base text-white/60">
            {brandDescription ?? (
              <>
                Practice, get assessed, and grow a performance profile that
                connects you to real placement opportunities.
              </>
            )}
          </p>
        </div>
        <p className="relative text-sm text-white/40">
          &copy; {new Date().getFullYear()} NextStep². Where Careers Begin.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="h-9" withTagline />
          </div>

          <h1 className="text-2xl font-semibold text-navy-500">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 text-sm text-navy-500/60">{subtitle}</p>
          )}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-center text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
