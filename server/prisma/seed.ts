// ---------------------------------------------------------------------------
// Phase 0 seed data.
//
// Two jobs, both dev/bootstrap-only (never a runtime API path):
//
// 1. Create one account per role with a known dev password. Self-registration
//    (POST /auth/register) always creates a student — there is no endpoint
//    anywhere that lets a client create an admin/content_author/
//    content_reviewer account, by design (see auth.service.ts). Those three
//    internal roles have to come from somewhere for Phase 0 to be usable at
//    all, and a seed script is exactly that "somewhere," matching how the
//    old localStorage prototype's mock accounts worked (an account just
//    exists) without reintroducing a real security hole (no HTTP endpoint
//    ever grants an internal role).
//
// 2. Populate courses/subjects/sessions with EXACTLY the same ids, titles,
//    descriptions, and order the frontend currently has hardcoded in
//    app/src/data/mock.ts — so switching the frontend's read path from the
//    hardcoded arrays to this database is invisible to a user (same
//    curriculum, same ids). One session ("components-and-state") additionally
//    gets a real, published ContentVersion — copied verbatim from
//    app/src/data/sessionContent.ts's curated SESSION_CONTENT entry — so the
//    canonical published-content read path (Part 4/5 of the architecture
//    doc) has one real, end-to-end-verifiable row to resolve.
//
// Run with: npm run prisma:seed (after `prisma migrate deploy` against a
// real Postgres instance — this script does not create tables).
// ---------------------------------------------------------------------------
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function upsertUser(email: string, password: string, name: string, role: 'ADMIN' | 'CONTENT_AUTHOR' | 'CONTENT_REVIEWER' | 'STUDENT') {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, passwordHash, name, role },
  });
}

const SUBJECTS_BASE = [
  { id: 'web-foundations', title: 'Web & Programming Foundations', description: 'Core programming concepts and how the web works.' },
  { id: 'frontend-development', title: 'Frontend Development', description: 'Build interactive interfaces with React.' },
  { id: 'backend-api', title: 'Backend & API Development', description: 'Design and build APIs that power real applications.' },
  { id: 'database-management', title: 'Database & Data Management', description: 'Model, store, and query application data.' },
  { id: 'fullstack-application', title: 'Full-Stack Application Development', description: 'Combine frontend and backend into one working product.' },
  { id: 'industry-practice', title: 'Project & Industry Practice', description: 'Apply your skills to a real, portfolio-ready project.' },
];

// Exactly SUBJECT_SESSIONS["frontend-development"] from mock.ts.
const FRONTEND_DEVELOPMENT_SESSIONS = [
  { id: 'react-fundamentals', title: 'React Fundamentals', description: 'Understand components, props, state, and the fundamentals of building React applications.' },
  { id: 'components-and-state', title: 'HTML Forms', description: 'Learn how to collect user input using HTML form elements.' },
  { id: 'routing-and-forms', title: 'React Routing & Forms', description: 'Build multi-page experiences and handle user input.' },
  { id: 'api-integration', title: 'API Integration', description: 'Connect frontend applications with backend APIs.' },
  { id: 'frontend-project', title: 'Frontend Project', description: 'Apply your frontend skills in a practical project.' },
];

// Verbatim copy of sessionContent.ts's curated SESSION_CONTENT["components-and-state"]
// (post Practice-Self-Check-removal / Exercise-field-preservation cleanup —
// see NEXTSTEP2_FRONTEND_BACKEND_DATA_CONTRACT_AUDIT.md). Kept identical on
// purpose: this seed proves the backend read path works without changing
// what a student visibly sees for this one session.
const COMPONENTS_AND_STATE_CONTENT = {
  objective: "By the end of this lesson you'll be able to build a working HTML form.",
  concepts: ['form', 'input', 'label', 'type', 'validation'],
  keyConcepts: [
    'The <form> element wraps all input fields.',
    'Each input should have a matching <label>.',
    'The type attribute controls what kind of input is collected.',
  ],
  examples: [
    'Example: <label>Name</label><input type="text" name="name" />',
    'Example: <input type="email" name="email" required />',
    'Example: <button type="submit">Submit</button>',
  ],
  video: null as unknown,
  checkpoints: [
    {
      id: 'components-and-state-checkpoint-1',
      timestampSeconds: 0,
      question: 'Which HTML element is used to collect user input?',
      options: ['<form>', '<div>', '<section>', '<span>'],
      correctIndex: 0,
      feedback: 'Right — <form> is the container every input, label, and submit button belongs inside.',
      required: true,
    },
  ],
  practice: {
    task: 'Create a simple HTML registration form containing: Name, Email, Password, and a Submit button.',
    starterCode: '<form>\n  \n</form>',
    language: 'html',
  },
  aiHelp: {
    suggestedPrompts: [
      'Explain this topic',
      'Explain more simply',
      'Give me an example',
      'Give me a hint',
      'Help me understand my mistake',
      'How would I ask AI to build this?',
      'Help me improve my prompt',
    ],
  },
  exercise: {
    objective: 'Build a registration form independently.',
    requirements: ['Name', 'Email', 'Password', 'Submit button', 'Basic validation'],
    starterCode: '<!-- Build your registration form here -->\n<form>\n\n</form>',
    language: 'html',
  },
  requiredActivities: ['learning', 'videoCheck', 'practice', 'exercise'],
  projectConnection: "This concept will later be used when you build the user registration feature of your full-stack project.",
  delivery: null as unknown,
};

/**
 * Day 8 security hardening: this script's whole point is dev/bootstrap
 * convenience — a known password for four accounts that otherwise have no
 * other way to exist (see the file header). That is only ever safe in a
 * non-production environment. Refuse to seed a literal, guessable default
 * password into a database that NODE_ENV says is production — an operator
 * who genuinely needs these accounts in production must set the
 * corresponding SEED_*_PASSWORD env var explicitly, which this check then
 * allows through unchanged.
 */
function assertNoDefaultPasswordsInProduction() {
  if (process.env.NODE_ENV !== 'production') return;
  const requiredOverrides = ['SEED_ADMIN_PASSWORD', 'SEED_CONTENT_AUTHOR_PASSWORD', 'SEED_CONTENT_REVIEWER_PASSWORD', 'SEED_STUDENT_PASSWORD'];
  const missing = requiredOverrides.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to seed default/guessable passwords in production (NODE_ENV=production). ` +
        `Set these env vars explicitly first: ${missing.join(', ')}.`
    );
  }
}

async function main() {
  assertNoDefaultPasswordsInProduction();
  console.log('Seeding accounts...');
  const admin = await upsertUser(
    process.env.SEED_ADMIN_EMAIL ?? 'admin@nextstep2.dev',
    process.env.SEED_ADMIN_PASSWORD ?? 'password',
    'Admin',
    'ADMIN',
  );
  const contentAuthor = await upsertUser(
    process.env.SEED_CONTENT_AUTHOR_EMAIL ?? 'author@nextstep2.dev',
    process.env.SEED_CONTENT_AUTHOR_PASSWORD ?? 'password',
    'Content Author',
    'CONTENT_AUTHOR',
  );
  const contentReviewer = await upsertUser(
    process.env.SEED_CONTENT_REVIEWER_EMAIL ?? 'reviewer@nextstep2.dev',
    process.env.SEED_CONTENT_REVIEWER_PASSWORD ?? 'password',
    'Content Reviewer',
    'CONTENT_REVIEWER',
  );
  // Name matches mock.ts's STUDENT.name exactly — student-generated data
  // (progress/performance/portfolio/submissions) is still local-only in
  // Phase 0 (see the implementation report), so this account exists purely
  // so student login is real; it is not yet wired to any of that data.
  await upsertUser(
    process.env.SEED_STUDENT_EMAIL ?? 'jordan.smith@nextstep2.dev',
    process.env.SEED_STUDENT_PASSWORD ?? 'password',
    'Jordan Smith',
    'STUDENT',
  );

  console.log('Seeding course/subject/session structure...');
  await prisma.course.upsert({
    where: { id: 'full-stack-web-development' },
    update: {},
    create: {
      id: 'full-stack-web-development',
      title: 'Full-Stack Web Development',
      description:
        'Learn industry-ready skills through structured learning, hands-on practice, assessment, and real exercises.',
    },
  });

  for (const [index, subject] of SUBJECTS_BASE.entries()) {
    await prisma.subject.upsert({
      where: { id: subject.id },
      update: {},
      create: {
        id: subject.id,
        courseId: 'full-stack-web-development',
        title: subject.title,
        description: subject.description,
        order: index + 1,
      },
    });

    const sessions =
      subject.id === 'frontend-development'
        ? FRONTEND_DEVELOPMENT_SESSIONS
        : Array.from({ length: 4 }, (_, i) => ({
            id: `${subject.id}-session-${i + 1}`,
            title: `Session ${i + 1}`,
            description: subject.description,
          }));

    for (const [sessionIndex, session] of sessions.entries()) {
      await prisma.session.upsert({
        where: { id: session.id },
        update: {},
        create: {
          id: session.id,
          subjectId: subject.id,
          title: session.title,
          description: session.description,
          order: sessionIndex + 1,
        },
      });
    }
  }

  console.log('Seeding one published ContentVersion for "components-and-state"...');
  const existingPublication = await prisma.publication.findFirst({
    where: { sessionId: 'components-and-state', supersededAt: null },
  });
  if (!existingPublication) {
    const pkg = await prisma.contentPackage.create({
      data: {
        fileName: 'HTML Forms (seed)',
        importedById: contentAuthor.id,
        status: 'PUBLISHED',
        sessionId: 'components-and-state',
      },
    });
    const version = await prisma.contentVersion.create({
      data: {
        sessionId: 'components-and-state',
        packageId: pkg.id,
        objective: COMPONENTS_AND_STATE_CONTENT.objective,
        concepts: COMPONENTS_AND_STATE_CONTENT.concepts,
        keyConcepts: COMPONENTS_AND_STATE_CONTENT.keyConcepts,
        examples: COMPONENTS_AND_STATE_CONTENT.examples,
        video: COMPONENTS_AND_STATE_CONTENT.video ?? undefined,
        checkpoints: COMPONENTS_AND_STATE_CONTENT.checkpoints,
        practice: COMPONENTS_AND_STATE_CONTENT.practice,
        aiHelp: COMPONENTS_AND_STATE_CONTENT.aiHelp,
        exercise: COMPONENTS_AND_STATE_CONTENT.exercise,
        requiredActivities: COMPONENTS_AND_STATE_CONTENT.requiredActivities,
        projectConnection: COMPONENTS_AND_STATE_CONTENT.projectConnection,
        delivery: COMPONENTS_AND_STATE_CONTENT.delivery ?? undefined,
      },
    });
    // Keeps this seeded package internally consistent with the real
    // submit/approve/publish flow's own invariant: a package's
    // currentContentVersionId always points at the version any of its
    // ContentReview rows (and, once published, its Publication) refer to.
    await prisma.contentPackage.update({
      where: { id: pkg.id },
      data: { currentContentVersionId: version.id },
    });
    await prisma.publication.create({
      data: {
        contentVersionId: version.id,
        sessionId: 'components-and-state',
        publishedById: contentReviewer.id,
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  admin:             ${admin.email}`);
  console.log(`  content_author:    ${contentAuthor.email}`);
  console.log(`  content_reviewer:  ${contentReviewer.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
