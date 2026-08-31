import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadContentAuthorAccount, type ContentAuthorAccount } from "../data/contentAuthor";

/**
 * Shared Content Author route guard — mirrors useRequireAdminAccount.ts.
 * Redirects to /content/login when no local Content Author session exists.
 * A Content Reviewer session (a different localStorage key entirely) does
 * NOT satisfy this guard — see useRequireContentReviewerAccount.ts.
 */
export function useRequireContentAuthorAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<ContentAuthorAccount | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // loadContentAuthorAccount() is now a real backend call (Phase 0) — see
    // ../data/contentAuthor.ts. Guarded with `cancelled` so a fast
    // navigation away doesn't set state on an unmounted component.
    (async () => {
      const acct = await loadContentAuthorAccount();
      if (cancelled) return;
      if (!acct) {
        navigate("/content/login", { replace: true });
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
