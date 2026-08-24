import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import AppShell, { type AppShellNavItem } from "./AppShell";
import { IconContent } from "./navIcons";
import { clearContentManagerAccount } from "../data/contentManager";

// Content Manager has exactly one real screen today: the "Content Packages"
// list + review entry point at /content/dashboard. A second "Dashboard" link
// to that same screen (even via an alias route) just reads as a bug — two
// nav items that both open the identical page. One honest nav item instead.
const NAV_ITEMS: AppShellNavItem[] = [{ label: "Content", to: "/content/dashboard", icon: IconContent }];

export default function ContentManagerLayout({ managerName, children }: { managerName: string; children: ReactNode }) {
  const navigate = useNavigate();

  function handleLogout() {
    clearContentManagerAccount();
    navigate("/content/login");
  }

  return (
    <AppShell navItems={NAV_ITEMS} userName={managerName} roleLabel="Content Manager" onLogout={handleLogout}>
      {children}
    </AppShell>
  );
}
