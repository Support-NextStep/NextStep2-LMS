// ---------------------------------------------------------------------------
// MOCK CANDIDATE DATASET — isolated demo data for Candidate Matching.
//
// WHY THIS EXISTS:
// This prototype's Student LMS (src/data/mock.ts, progress.tsx, portfolio.ts,
// performance.ts) models exactly ONE student — there is no multi-student
// roster or backend to source real candidates from. Candidate Matching needs
// several distinct students to rank, so this file provides ~5 clearly
// fabricated demo candidates for UI and algorithm verification ONLY.
//
// THIS IS NOT REAL STUDENT DATA. It must never be merged with, or presented
// as, the real student's progress/portfolio/performance records.
//
// FUTURE REPLACEMENT PATH:
// Each field here intentionally mirrors the shape of an existing real data
// source so this file can be deleted and replaced with a real query once a
// multi-student backend exists, without changing the matching engine:
//   - skills / completedSubjects / courseComplete  → shape of mock.ts's
//     Subject/COURSE model (per-student course progress)
//   - projects                                     → shape of
//     portfolio.ts's PortfolioProject / portfolioDemoContent.ts
//   - performance.averageScore                     → shape of
//     performance.ts's CoursePerformance.averageScore
// The matching engine (src/data/matching.ts) only depends on this shape, not
// on this file being mock data — swapping the data source is a one-file change.
// ---------------------------------------------------------------------------

export type CandidateProject = {
  id: string;
  title: string;
  description: string;
  technologies: string[];
};

export type MockCandidate = {
  id: string;
  name: string;
  headline: string;
  about: string;
  skills: string[];
  courseName: string;
  courseComplete: boolean;
  /** Subject titles the candidate has completed — mirrors mock.ts subject titles. */
  completedSubjects: string[];
  projects: CandidateProject[];
  /** Mirrors performance.ts's CoursePerformance.averageScore shape — null if nothing scoreable yet. */
  performance: { averageScore: number | null };
  achievements: string[];
  experienceYears: number;
  location: string;
  workMode: "On-site" | "Remote" | "Hybrid";
  /** Most recent session/subject completion — powers the "Recently Completed" sort. */
  lastActivityAt: string;
};

export const MOCK_CANDIDATES: MockCandidate[] = [
  {
    id: "cand-devansh-kapoor",
    name: "Devansh Kapoor",
    headline: "Full-Stack Developer",
    about:
      "Full-stack developer focused on building practical, user-friendly web applications with React and Node.js.",
    skills: ["React", "JavaScript", "Node.js", "PostgreSQL", "HTML", "CSS", "Express"],
    courseName: "Full-Stack Web Development",
    courseComplete: true,
    completedSubjects: [
      "Web & Programming Foundations",
      "Frontend Development",
      "Backend & API Development",
      "Database & Data Management",
      "Full-Stack Application Development",
      "Project & Industry Practice",
    ],
    projects: [
      {
        id: "sms",
        title: "Student Management System",
        description: "A web application for managing students, courses, attendance and academic information.",
        technologies: ["React", "Node.js", "PostgreSQL"],
      },
      {
        id: "ecommerce",
        title: "E-Commerce Application",
        description: "A full-stack shopping application with authentication, product management, and orders.",
        technologies: ["React", "Node.js", "PostgreSQL"],
      },
      {
        id: "ai-doc",
        title: "AI Document Assistant",
        description: "An AI-powered application that lets users upload documents and interact with their content.",
        technologies: ["React", "Python", "FastAPI"],
      },
    ],
    performance: { averageScore: 91 },
    achievements: [
      "Completed Full-Stack Web Development training",
      "Built multiple hands-on web applications",
    ],
    experienceYears: 1,
    location: "Coimbatore",
    workMode: "Hybrid",
    lastActivityAt: "2026-08-18T10:00:00.000Z",
  },
  {
    id: "cand-riya-menon",
    name: "Riya Menon",
    headline: "Frontend Developer",
    about: "Frontend-focused developer who enjoys building clean, accessible React interfaces.",
    skills: ["React", "JavaScript", "HTML", "CSS", "Redux"],
    courseName: "Full-Stack Web Development",
    courseComplete: false,
    completedSubjects: ["Web & Programming Foundations", "Frontend Development"],
    projects: [
      {
        id: "task-tracker",
        title: "Task Tracker App",
        description: "A React task management app with drag-and-drop boards.",
        technologies: ["React", "Redux", "CSS"],
      },
    ],
    performance: { averageScore: 78 },
    achievements: ["Completed Frontend Development module with strong scores"],
    experienceYears: 1,
    location: "Coimbatore",
    workMode: "Hybrid",
    lastActivityAt: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "cand-arjun-nair",
    name: "Arjun Nair",
    headline: "Backend Developer",
    about: "Backend-leaning developer comfortable with Node.js APIs and relational databases.",
    skills: ["JavaScript", "Node.js", "Express", "MongoDB", "SQL"],
    courseName: "Full-Stack Web Development",
    courseComplete: false,
    completedSubjects: ["Web & Programming Foundations", "Backend & API Development", "Database & Data Management"],
    projects: [
      {
        id: "inventory-api",
        title: "Inventory API",
        description: "A REST API for tracking warehouse inventory with role-based access.",
        technologies: ["Node.js", "Express", "MongoDB"],
      },
    ],
    performance: { averageScore: 72 },
    achievements: ["Completed Backend & API Development module"],
    experienceYears: 0,
    location: "Chennai",
    workMode: "Remote",
    lastActivityAt: "2026-08-15T10:00:00.000Z",
  },
  {
    id: "cand-meera-iyer",
    name: "Meera Iyer",
    headline: "Junior Web Developer",
    about: "Early-career developer with foundational JavaScript skills, currently expanding into React.",
    skills: ["JavaScript", "HTML", "CSS", "Vue"],
    courseName: "Full-Stack Web Development",
    courseComplete: false,
    completedSubjects: ["Web & Programming Foundations"],
    projects: [
      {
        id: "portfolio-site",
        title: "Personal Portfolio Site",
        description: "A static personal site built with HTML, CSS, and vanilla JavaScript.",
        technologies: ["HTML", "CSS", "JavaScript"],
      },
    ],
    performance: { averageScore: 58 },
    achievements: ["Completed Web & Programming Foundations"],
    experienceYears: 0,
    location: "Bangalore",
    workMode: "On-site",
    lastActivityAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "cand-vikram-rao",
    name: "Vikram Rao",
    headline: "Data & Backend Engineer",
    about: "Backend and data-oriented engineer with a Python background, exploring web development.",
    skills: ["Python", "SQL", "Java"],
    courseName: "Full-Stack Web Development",
    courseComplete: false,
    completedSubjects: ["Web & Programming Foundations"],
    projects: [
      {
        id: "data-pipeline",
        title: "Data Import Pipeline",
        description: "A Python script suite for cleaning and importing CSV data into a SQL database.",
        technologies: ["Python", "SQL"],
      },
    ],
    performance: { averageScore: 65 },
    achievements: [],
    experienceYears: 2,
    location: "Hyderabad",
    workMode: "Remote",
    lastActivityAt: "2026-08-05T10:00:00.000Z",
  },
];
