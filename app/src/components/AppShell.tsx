import { useState, type ReactElement, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import Logo from "./Logo";

// ---------------------------------------------------------------------------
// Shared authenticated application shell — Topbar + Sidebar + Main content.
//
// This is the Student layout's architecture (StudentLayout.tsx was the UX
// reference), generalized so every internal-role workspace renders inside the
// exact same chrome instead of its own standalone top-header page.
// Role-specific navigation is passed in; the shell itself has no idea which
// role is using it beyond the label/nav items/logout handler it's given.
//
// StudentLayout.tsx, ContentAuthorLayout.tsx, ContentReviewerLayout.tsx, and
// AdminLayout.tsx are thin per-role wrappers around this component — each
// supplies its own nav items, account name, optional role badge, and logout
// behavior, matching how StudentLayout already worked before this refactor.
// ---------------------------------------------------------------------------

export type AppShellNavItem = {
  label: string;
  to: string;
  icon: (props: { className?: string }) => ReactElement;
  /** Passed through to NavLink — forces exact-path matching. Needed when two nav items share a path prefix (e.g. an alias route) so only one highlights active at a time. */
  end?: boolean;
};

export type AppShellProps = {
  navItems: AppShellNavItem[];
  userName: string;
  /** Small pill shown next to the logo — e.g. "Content Author" / "Content Reviewer" / "Admin". Omitted for Student — no badge, same as before this refactor. */
  roleLabel?: string;
  onLogout: () => void;
  /** Student-only: the notification bell was never part of the internal-role headers, and isn't being added for them now — omit (default) to leave it out. */
  showNotifications?: boolean;
  children: ReactNode;
};

function IconMenuToggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavList({
  navItems,
  collapsed,
  onNavigate,
}: {
  navItems: AppShellNavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ label, to, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
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

function LogoutButton({
  onLogout,
  collapsed,
  onNavigate,
}: {
  onLogout: () => void;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  function handleLogout() {
    onNavigate?.();
    onLogout();
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

export default function AppShell({ navItems, userName, roleLabel, onLogout, showNotifications = false, children }: AppShellProps) {
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
          {roleLabel && (
            <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-navy-500/50 sm:inline-block">
              {roleLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <span className="hidden text-sm font-medium text-navy-500/70 sm:block">{userName}</span>
          {showNotifications && (
            <button
              type="button"
              aria-label="Notifications"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-500/60 hover:bg-slate-50"
            >
              <IconBell className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-500 text-xs font-semibold text-white">
            {initials(userName)}
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
            <NavList navItems={navItems} collapsed={collapsed} />
          </div>

          <div className="border-t border-slate-100 pt-3">
            <LogoutButton onLogout={onLogout} collapsed={collapsed} />
          </div>
        </aside>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-navy-500/30" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white px-4 py-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between px-1">
                <Logo className="h-12" />
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close menu"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-500/60 hover:bg-slate-50"
                >
                  <IconClose className="h-5 w-5" />
                </button>
              </div>
              {roleLabel && (
                <span className="mb-4 inline-block w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-navy-500/50">
                  {roleLabel}
                </span>
              )}
              <div className="flex-1">
                <NavList navItems={navItems} onNavigate={() => setDrawerOpen(false)} />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <LogoutButton onLogout={onLogout} onNavigate={() => setDrawerOpen(false)} />
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
