import { NavLink, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { clearContentManagerAccount } from "../data/contentManager";

export default function ContentHeader({ managerName }: { managerName: string }) {
  const navigate = useNavigate();

  function handleLogout() {
    clearContentManagerAccount();
    navigate("/content/login");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-8">
          <Logo className="h-8" />
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink
              to="/content/dashboard"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-600" : "text-navy-500/65 hover:bg-slate-50 hover:text-navy-500"
                }`
              }
            >
              Dashboard
            </NavLink>
          </nav>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-navy-500/50">
            Content Manager
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden text-sm font-medium text-navy-500/70 sm:block">{managerName}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium text-navy-500/60 hover:text-navy-500"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
}
