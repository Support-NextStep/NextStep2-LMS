import { NavLink, useNavigate } from "react-router-dom";
import Logo from "./Logo";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/company/dashboard" },
  { label: "Hiring Requirements", to: "/company/hiring" },
  { label: "Company Profile", to: "/company/profile" },
];

export default function CompanyHeader({ companyName }: { companyName: string }) {
  const navigate = useNavigate();

  function handleLogout() {
    navigate("/company/login");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <Logo className="h-8" />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-brand-50 text-brand-600" : "text-navy-500/65 hover:bg-slate-50 hover:text-navy-500"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden text-sm font-medium text-navy-500/70 sm:block">{companyName}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-navy-500/60 hover:text-navy-500"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
        {NAV_ITEMS.map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? "bg-brand-50 text-brand-600" : "text-navy-500/65 hover:bg-slate-50"
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
