import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadAdminAccount, type AdminAccount } from "../data/adminAccount";
import { refreshCourseCatalogFromBackend } from "../data/mock";

/**
 * Shared Admin route guard — the same pattern as
 * useRequireContentAuthorAccount.ts / useRequireContentReviewerAccount.ts,
 * pulled into one hook since six Admin pages all need the identical check.
 * Redirects to /admin/login when no local Admin session exists.
 *
 * BUG FIX (Slice 5 — Admin/Reviewer operations validation): AdminContent.tsx/
 * AdminContentDetail.tsx read course/subject/session titles via mock.ts's
 * synchronous listCourses()/listSubjectSummaries()/listSessionSummaries() —
 * plain in-memory bindings that stay at their hardcoded placeholder values
 * until refreshCourseCatalogFromBackend() overwrites them in place with the
 * real backend catalog. Nothing in the Admin route tree ever triggered that
 * refresh, so a freshly-loaded Admin session showed the raw course id
 * ("full-stack-with-ai") instead of its real title ("Full Stack with ai") —
 * confirmed live. Same root cause, and the same fix, as the identical bug
 * already found and fixed for Content Author in useRequireContentAuthorAccount.ts;
 * see that file's own comment for the full mechanism (React never re-renders
 * a component for a plain module-level object mutating in place unless
 * something local gives it a reason to).
 */
export function useRequireAdminAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [, forceRerenderAfterCatalogLoad] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    refreshCourseCatalogFromBackend().then((changed) => {
      if (!cancelled && changed) forceRerenderAfterCatalogLoad((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { account, checked };
}
