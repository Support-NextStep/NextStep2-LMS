import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import EmailVerification from "./pages/EmailVerification";
import Enrollment from "./pages/Enrollment";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import MyCourse from "./pages/MyCourse";
import SubjectPage from "./pages/SubjectPage";
import SessionPage from "./pages/SessionPage";
import Performance from "./pages/Performance";
import Portfolio from "./pages/Portfolio";
import PortfolioView from "./pages/PortfolioView";
import CompanySignup from "./pages/CompanySignup";
import CompanyLogin from "./pages/CompanyLogin";
import CompanyVerification from "./pages/CompanyVerification";
import CompanyProfile from "./pages/CompanyProfile";
import CompanyDashboard from "./pages/CompanyDashboard";
import CompanyHiringList from "./pages/CompanyHiringList";
import CompanyHiringForm from "./pages/CompanyHiringForm";
import CompanyHiringReview from "./pages/CompanyHiringReview";
import CompanyHiringView from "./pages/CompanyHiringView";
import CompanyHiringMatches from "./pages/CompanyHiringMatches";
import CompanyCandidateProfile from "./pages/CompanyCandidateProfile";
import ContentLogin from "./pages/ContentLogin";
import ContentDashboard from "./pages/ContentDashboard";
import ContentCourses from "./pages/ContentCourses";
import ContentSubmissions from "./pages/ContentSubmissions";
import ContentPackageDetail from "./pages/ContentPackageDetail";
import ContentPreviewSession from "./pages/ContentPreviewSession";
import ContentCourseDetail from "./pages/ContentCourseDetail";
import ContentSubjectDetail from "./pages/ContentSubjectDetail";
import ContentSessionAuthoring from "./pages/ContentSessionAuthoring";
import ReviewLogin from "./pages/ReviewLogin";
import ReviewDashboard from "./pages/ReviewDashboard";
import ReviewQueue from "./pages/ReviewQueue";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminStudents from "./pages/AdminStudents";
import AdminStudentDetail from "./pages/AdminStudentDetail";
import AdminContent from "./pages/AdminContent";
import AdminContentDetail from "./pages/AdminContentDetail";
import { ProgressProvider } from "./data/progress";

export default function App() {
  return (
    <ProgressProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/enroll" element={<Enrollment />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-course" element={<MyCourse />} />
          <Route path="/my-course/subject/:subjectId" element={<SubjectPage />} />

          <Route path="/session/:sessionId" element={<SessionPage />} />

          <Route path="/performance" element={<Performance />} />

          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/portfolio/view" element={<PortfolioView />} />

          {/* Company Flow — Slice 1: Signup, Login, Verification, Profile, Dashboard placeholder only. */}
          <Route path="/company/signup" element={<CompanySignup />} />
          <Route path="/company/login" element={<CompanyLogin />} />
          <Route path="/company/verify" element={<CompanyVerification />} />
          <Route path="/company/profile" element={<CompanyProfile />} />
          <Route path="/company/dashboard" element={<CompanyDashboard />} />
          <Route path="/company/hiring" element={<CompanyHiringList />} />
          <Route path="/company/hiring/new" element={<CompanyHiringForm />} />
          <Route path="/company/hiring/:id/edit" element={<CompanyHiringForm />} />
          <Route path="/company/hiring/:id/review" element={<CompanyHiringReview />} />
          <Route path="/company/hiring/:id/matches" element={<CompanyHiringMatches />} />
          <Route path="/company/hiring/:id/candidates/:candidateId" element={<CompanyCandidateProfile />} />
          <Route path="/company/hiring/:id" element={<CompanyHiringView />} />

          {/* Content Team (Content Author) — creates and prepares content, never
              approves/publishes it. See NEXTSTEP² role/workspace separation: this
              used to be one shared "Content Manager" workspace with both authoring
              and approval powers; it's now split into this namespace (/content/*)
              and the Content Reviewer's separate namespace (/review/*) below, with
              its own isolated login/session (contentAuthor.ts) and its own shell
              (ContentAuthorLayout.tsx). Both namespaces still operate on the same
              backend package/review data (authoredSessionApi.ts/
              contentReviewApi.ts) — nothing about the underlying domain model
              changed, only who can do what with it and which UI they see it
              through. */}
          <Route path="/content/login" element={<ContentLogin />} />
          <Route path="/content/dashboard" element={<ContentDashboard />} />
          <Route path="/content/courses" element={<ContentCourses />} />
          <Route path="/content/submissions" element={<ContentSubmissions />} />
          {/* Read-only submission status — no Approve/Publish/Request Changes here;
              those controls only render for role="reviewer" at /review/package/:id. */}
          <Route path="/content/submissions/:packageId" element={<ContentPackageDetail role="author" />} />
          <Route
            path="/content/preview/:packageId/:courseId/:subjectId/:sessionId"
            element={<ContentPreviewSession role="author" />}
          />
          {/* Content Team Session Authoring Workspace — the product-facing authoring
              path (see NEXTSTEP2_CONTENT_DOCUMENT_FIRST_MODEL.md). The legacy ZIP
              import UI and its /content/import route were retired in an earlier
              slice; uploaded content flows in only through real DOCX documents
              inside this workspace. */}
          <Route path="/content/courses/:courseId" element={<ContentCourseDetail />} />
          <Route path="/content/courses/:courseId/subjects/:subjectId" element={<ContentSubjectDetail />} />
          <Route
            path="/content/courses/:courseId/subjects/:subjectId/sessions/:sessionId/author"
            element={<ContentSessionAuthoring />}
          />

          {/* Content Approval Team (Content Reviewer) — reviews, requests changes,
              approves, and publishes; never edits authored content directly. Its
              own isolated mock login/session (contentReviewer.ts) and shell
              (ContentReviewerLayout.tsx), organized around a review queue by
              status rather than a course/subject/session authoring tree. */}
          <Route path="/review/login" element={<ReviewLogin />} />
          <Route path="/review/dashboard" element={<ReviewDashboard />} />
          <Route path="/review/pending" element={<ReviewQueue status="READY_FOR_REVIEW" title="Pending Review" />} />
          <Route path="/review/changes-requested" element={<ReviewQueue status="CHANGES_REQUESTED" title="Changes Requested" />} />
          <Route path="/review/approved" element={<ReviewQueue status="APPROVED" title="Approved" />} />
          <Route path="/review/published" element={<ReviewQueue status="PUBLISHED" title="Published" />} />
          {/* The real review/approve/publish workstation — see ContentPackageDetail.tsx's role prop. */}
          <Route path="/review/package/:packageId" element={<ContentPackageDetail role="reviewer" />} />
          <Route
            path="/review/preview/:packageId/:courseId/:subjectId/:sessionId"
            element={<ContentPreviewSession role="reviewer" />}
          />

          {/* Admin — Slice 1: read-only platform overview over Students + Content. */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/students" element={<AdminStudents />} />
          <Route path="/admin/students/:studentId" element={<AdminStudentDetail />} />
          <Route path="/admin/content" element={<AdminContent />} />
          <Route path="/admin/content/:courseId" element={<AdminContentDetail />} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ProgressProvider>
  );
}
