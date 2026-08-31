-- Discovered while wiring the real submit-time ContentVersion writer: the
-- authoring model has a legitimate "AI Tutor not included for this
-- session" state (aiHelpIncluded: false), which needs to be representable
-- as NULL, exactly like video/delivery already are — not forced into a
-- fabricated empty object just to satisfy a NOT NULL constraint. Purely
-- relaxing a constraint; no existing row's data changes.
ALTER TABLE "content_versions" ALTER COLUMN "ai_help" DROP NOT NULL;
