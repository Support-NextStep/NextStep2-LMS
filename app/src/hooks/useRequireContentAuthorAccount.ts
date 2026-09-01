import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadContentAuthorAccount, type ContentAuthorAccount } from "../data/contentAuthor";
import { refreshCourseCatalogFromBackend } from "../data/mock";

/**
 * Shared Content Author route guard — mirrors useRequireAdminAccount.ts.
 * Redirects to /content/login when no local Content Author session exists.
 * A Content Reviewer session (a different localStorage key entirely) does
 * NOT satisfy this guard — see useRequireContentReviewerAccount.ts.
 *
 * BUG FIX (end-to-end LMS validation): ContentCourses.tsx/ContentCourseDetail.tsx/
 * ContentSubjectDetail.tsx all read the real course/subject catalog via
 * mock.ts's synchronous listCourses()/listSubjectSummaries()/getSubjectSummary()
 * — plain in-memory bindings that stay at their hardcoded placeholder values
 * (COURSE.id = "full-stack-web-development", etc.) until
 * refreshCourseCatalogFromBackend() overwrites them in place with whatever
 * course/subject the backend actually has. On the student side that refresh
 * is triggered once by ProgressProvider; nothing in the Content Author route
 * tree ever called it, so a freshly-loaded Content Author session only ever
 * saw the placeholder catalog — never the real one — and any action that
 * needed the real id (e.g. creating a new session under the real subject)
 * failed server-side with a 500, since no Subject row with the placeholder
 * id exists. This hook runs on every Content Author page (it's the shared
 * auth guard), so triggering the refresh here — exactly the same
 * fetch-once-and-force-a-rerender idiom ProgressProvider already uses —
 * fixes it everywhere in one place rather than duplicating the effect
 * across every page that reads the catalog. refreshCourseCatalogFromBackend()
 * itself is idempotent per page load (an internal `catalogLoaded` flag skips
 * the network call on every call after the first), so mounting this on
 * several Content Author pages in the same session is still just one fetch.
 */
export function useRequireContentAuthorAccount() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<ContentAuthorAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [, forceRerenderAfterCatalogLoad] = useState(0);

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
