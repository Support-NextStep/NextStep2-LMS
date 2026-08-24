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
import ContentImport from "./pages/ContentImport";
import ContentPackageDetail from "./pages/ContentPackageDetail";
import ContentPreviewSession from "./pages/ContentPreviewSession";
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

          {/* Content Manager — Slice 1: Login, Dashboard, Import + Validate only. */}
          <Route path="/content/login" element={<ContentLogin />} />
          <Route path="/content/dashboard" element={<ContentDashboard />} />
          <Route path="/content/import" element={<ContentImport />} />
          <Route path="/content/package/:packageId" element={<ContentPackageDetail />} />
          <Route
            path="/content/preview/:packageId/:courseId/:subjectId/:sessionId"
            element={<ContentPreviewSession />}
          />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </ProgressProvider>
  );
}
