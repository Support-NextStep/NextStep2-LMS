// ---------------------------------------------------------------------------
// PLACEHOLDER DEMO CONTENT for /portfolio/view.
//
// This file exists ONLY to visually validate what a finished student
// portfolio should look like. Everything in here is fabricated sample
// content — it is NOT real student data and must never be presented as such
// outside of this preview.
//
// It is intentionally isolated from the real data layer:
//   - src/data/portfolio.ts   (the student's actual saved profile/skills/
//                               projects/links, edited at /portfolio)
//   - src/data/progress.tsx   (the student's actual LMS course/subject data)
//
// Next step (not part of this task): PortfolioView should read from those
// two real sources instead of this file. Only the "Education" section
// already does that today — everything else below is demo-only.
// ---------------------------------------------------------------------------

export const DEMO_PROFILE = {
  name: "Jordan Smith",
  headline: "Full-Stack Developer",
  tagline:
    "Building modern web applications with clean code, practical problem solving, and AI-powered technologies.",
  about:
    "I'm a full-stack developer focused on building practical, user-friendly web applications. I enjoy turning ideas into working products and continuously improving my skills through hands-on development.",
};

export const DEMO_SKILLS: { category: string; skills: string[] }[] = [
  { category: "Frontend", skills: ["HTML", "CSS", "JavaScript", "React"] },
  { category: "Backend", skills: ["Node.js", "Express", "REST APIs"] },
  { category: "Database", skills: ["PostgreSQL", "MongoDB"] },
  { category: "Tools", skills: ["Git", "GitHub", "Docker"] },
  { category: "AI", skills: ["AI API Integration", "Prompt Engineering"] },
];

export type DemoProject = {
  id: string;
  title: string;
  description: string;
  technologies: string[];
};

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "student-management-system",
    title: "Student Management System",
    description:
      "A web application for managing students, courses, attendance and academic information.",
    technologies: ["React", "Node.js", "PostgreSQL"],
  },
  {
    id: "ai-document-assistant",
    title: "AI Document Assistant",
    description:
      "An AI-powered application that allows users to upload documents and interact with their content.",
    technologies: ["React", "Python", "FastAPI", "OpenAI API"],
  },
  {
    id: "ecommerce-application",
    title: "E-Commerce Application",
    description:
      "A full-stack shopping application with authentication, product management, cart and order workflows.",
    technologies: ["React", "Node.js", "PostgreSQL"],
  },
];

export const DEMO_ACHIEVEMENTS: string[] = [
  "Completed Full-Stack Web Development training",
  "Built multiple hands-on web applications",
  "Completed practical frontend and backend projects",
];

export const DEMO_CONTACT = {
  email: "jordan.smith@example.com",
  linkedin: "#",
  github: "#",
};
