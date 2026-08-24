import { useState, type ReactElement, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Logo from "./Logo";
import { STUDENT } from "../data/mock";

type NavItem = {
  label: string;
  to: string;
  icon: (props: { className?: string }) => ReactElement;
};

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-5.25a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z"
      />
    </svg>
  );
}

function IconCourse({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6.04C10.5 4.9 8.4 4.25 6.5 4.25c-1.02 0-2.02.15-2.95.46a.75.75 0 00-.55.72v11.9a.75.75 0 001 .71c.79-.27 1.63-.4 2.5-.4 1.9 0 4 .65 5.5 1.79m0-13.39c1.5-1.14 3.6-1.79 5.5-1.79 1.02 0 2.02.15 2.95.46a.75.75 0 01.55.72v11.9a.75.75 0 01-1 .71 8.7 8.7 0 00-2.5-.4c-1.9 0-4 .65-5.5 1.79m0-13.39v13.39"
      />
    </svg>
  );
}

function IconPerformance({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.98 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}

function IconPortfolio({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 14.15v4.1a2 2 0 01-2 2H5.75a2 2 0 01-2-2v-4.1M3.75 14.15v-3.4a2 2 0 012-2h12.5a2 2 0 012 2v3.4m-16.5 0a2 2 0 002 2h12.5a2 2 0 002-2m-16.5 0h16.5M9 8.75V6.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6.5v2.25"
      />
    </svg>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M18 12H9m9 0l-3-3m3 3l-3 3"
      />
    </svg>
  );
}

function IconMenuToggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: IconDashboard },
  { label: "My Course", to: "/my-course", icon: IconCourse },
  { label: "Performance", to: "/performance", icon: IconPerformance },
  { label: "Portfolio", to: "/portfolio", icon: IconPortfolio },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              isActive
                ? "bg-brand-50 text-brand-600"
                : "text-navy-500/65 hover:bg-slate-50 hover:text-navy-500"
            }`
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          {!collapsed && label}
        </NavLink>
      ))}
    </nav>
  );
}

function LogoutButton({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();

  function handleLogout() {
    onNavigate?.();
    // Mock auth — no real session to invalidate, just return to Login.
    navigate("/login");
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      title={collapsed ? "Log Out" : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium text-navy-500/65 transition-colors hover:bg-error/5 hover:text-error ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <IconLogout className="h-5 w-5 shrink-0" />
      {!collapsed && "Log Out"}
    </button>
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fc]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-500/70 hover:bg-slate-50 lg:hidden"
          >
            <IconMenuToggle className="h-5 w-5" />
          </button>
          <Logo className="h-12" />
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-navy-500/70 hover:bg-slate-50 lg:flex"
          >
            <IconMenuToggle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm font-medium text-navy-500/70 sm:block">
            {STUDENT.name}
          </span>
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-500/60 hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-500 text-xs font-semibold text-white">
            {initials(STUDENT.name)}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white py-6 transition-[width] duration-200 lg:flex ${
            collapsed ? "w-20 px-2.5" : "w-60 px-4"
          }`}
        >
          <div className="flex-1">
            <NavList collapsed={collapsed} />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <LogoutButton collapsed={collapsed} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-navy-500/30"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white px-4 py-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between px-1">
                <Logo className="h-12" />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-500/60 hover:bg-slate-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1">
                <NavList onNavigate={() => setDrawerOpen(false)} />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <LogoutButton onNavigate={() => setDrawerOpen(false)} />
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
