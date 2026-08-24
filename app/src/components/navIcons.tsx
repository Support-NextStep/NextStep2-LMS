// ---------------------------------------------------------------------------
// Sidebar navigation icons shared across role layouts (StudentLayout,
// ContentManagerLayout, AdminLayout). Extracted from the Student sidebar
// (the original UX reference) so Dashboard/Content — which multiple roles
// need — aren't redefined per role. Student's four icons are copied here
// byte-for-byte from the original StudentLayout.tsx; nothing about their
// paths changed.
// ---------------------------------------------------------------------------
import type { ReactElement } from "react";

export type NavIconProps = { className?: string };
export type NavIcon = (props: NavIconProps) => ReactElement;

export const IconDashboard: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 9.75L12 3l9 6.75V21a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-5.25a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H3.75A.75.75 0 013 21V9.75z"
    />
  </svg>
);

export const IconCourse: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.04C10.5 4.9 8.4 4.25 6.5 4.25c-1.02 0-2.02.15-2.95.46a.75.75 0 00-.55.72v11.9a.75.75 0 001 .71c.79-.27 1.63-.4 2.5-.4 1.9 0 4 .65 5.5 1.79m0-13.39c1.5-1.14 3.6-1.79 5.5-1.79 1.02 0 2.02.15 2.95.46a.75.75 0 01.55.72v11.9a.75.75 0 01-1 .71 8.7 8.7 0 00-2.5-.4c-1.9 0-4 .65-5.5 1.79m0-13.39v13.39"
    />
  </svg>
);

export const IconPerformance: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.48 3.5a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.98 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
    />
  </svg>
);

export const IconPortfolio: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 14.15v4.1a2 2 0 01-2 2H5.75a2 2 0 01-2-2v-4.1M3.75 14.15v-3.4a2 2 0 012-2h12.5a2 2 0 012 2v3.4m-16.5 0a2 2 0 002 2h12.5a2 2 0 002-2m-16.5 0h16.5M9 8.75V6.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6.5v2.25"
    />
  </svg>
);

/** Content Manager's "Content" and Admin's "Content" — a document with a folded corner and content lines. */
export const IconContent: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.25 4.5h5.25l4.5 4.5v10.5a.75.75 0 01-.75.75H8.25a.75.75 0 01-.75-.75V5.25a.75.75 0 01.75-.75z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5V9h4.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5h5M10.5 16.5h5" />
  </svg>
);

/** Admin's "Students" — two simple heads/shoulders. */
export const IconStudents: NavIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className}>
    <circle cx="8.5" cy="8" r="2.75" />
    <circle cx="16" cy="9" r="2.25" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.25 19.25c.5-3.2 2.7-5.25 5.25-5.25s4.75 2.05 5.25 5.25M14 15.25c2.1.15 3.85 1.85 4.25 4"
    />
  </svg>
);
