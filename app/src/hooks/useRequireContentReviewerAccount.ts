import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadContentReviewerAccount, type ContentReviewerAccount } from "../data/contentReviewer";

/**
 * Shared Content Reviewer route guard — mirrors useRequireAdminAccount.ts.
 * Redirects to /review/login when no local Content Reviewer session exists.
 * A Content Author session does NOT satisfy this guard — see
 * useRequireContentAuthorAccount.ts. This is what keeps the two roles'
 * route namespaces genuinely isolated from each other.
 */
export function useRequireContentReviewerAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<ContentReviewerAccount | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // loadContentReviewerAccount() is now a real backend call (Phase 0) —
    // see ../data/contentReviewer.ts. Guarded with `cancelled` so a fast
    // navigation away doesn't set state on an unmounted component.
    (async () => {
      const acct = await loadContentReviewerAccount();
      if (cancelled) return;
      if (!acct) {
        navigate("/review/login", { replace: true });
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
