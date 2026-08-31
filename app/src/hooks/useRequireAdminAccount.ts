import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadAdminAccount, type AdminAccount } from "../data/adminAccount";

/**
 * Shared Admin route guard — the same pattern as
 * useRequireContentAuthorAccount.ts / useRequireContentReviewerAccount.ts,
 * pulled into one hook since six Admin pages all need the identical check.
 * Redirects to /admin/login when no local Admin session exists.
 */
export function useRequireAdminAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // loadAdminAccount() is now a real backend call (Phase 0) — see
    // ../data/adminAccount.ts. Guarded with `cancelled` so a fast
    // navigation away doesn't set state on an unmounted component.
    (async () => {
      const acct = await loadAdminAccount();
      if (cancelled) return;
      if (!acct) {
        navigate("/admin/login", { replace: true });
        return;
      }
      setAccount(acct);
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return { account, checked };
}
