import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadAdminAccount, type AdminAccount } from "../data/adminAccount";

/**
 * Shared Admin route guard. Mirrors the per-page "load account, redirect to
 * login if missing" pattern every Content Manager page already uses (see
 * ContentDashboard.tsx etc.) — pulled into one hook since six Admin pages
 * all need the identical check. Redirects to /admin/login when no local
 * Admin session exists.
 */
export function useRequireAdminAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const acct = loadAdminAccount();
    if (!acct) {
      navigate("/admin/login", { replace: true });
      return;
    }
    setAccount(acct);
    setChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return { account, checked };
}
