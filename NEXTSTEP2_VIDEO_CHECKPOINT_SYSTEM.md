# NEXTSTEP² — Video Checkpoint System: MVP Design

**Status:** Approved. This is the frozen design referenced by the implementation slices that follow it (Slice 1: data model + authoring cleanup; a later slice: real YouTube playback). Produced from a read-only audit of the existing Video + Video Checkpoints implementation — no code was written or modified in producing this document.

---

## A. Checkpoint model

`videoCheckpoint` becomes an array: `checkpoints: VideoCheckpoint[]` (plural name, so it stops implying "one").

**Keep:** `id`, `timestampSeconds`, `question`, `options`, `correctIndex`, `feedback`, `required`.
**Remove:** `continueImmediately` (see D).
**Add:** nothing for MVP. No speculative `type`/`questionType` field (see B). No stored `order` — sort by `timestampSeconds` at build/render time instead of maintaining a second source of truth.

```
VideoCheckpoint = { id, timestampSeconds, question, options, correctIndex, feedback, required }
```

This one shape should exist once, shared by the authoring draft, `ContentSessionContent`, and `SessionContent` — today's problem is partly that near-identical shapes diverge at each hop.

## B. Question types

MVP = Multiple Choice only. The current "Question Type" selector is a disabled dropdown hardcoded to one value with no backing field — worse than nothing, since it implies a capability that doesn't exist. **Remove it entirely** rather than leaving it disabled. Reintroduce a real selector only when a second question type is actually built, at which point add a genuine `type` field — a trivial additive change later, not worth reserving space for now.

## C. Required

- `required: true` → the student must **answer** (attempt) the checkpoint before it's resolved. Blocks the "videoCheck" required-activity gate on Complete Session, and (in the future playback slice) blocks forward-seeking past it.
- `required: false` → still pauses and shows the question (that's what makes it a checkpoint), but the student may skip it; never blocks completion or seeking.
- "Must answer" means *attempted*, not *correct* — getting it wrong still resolves it. This reuses the existing `{completed, correct}` split already established in `performance.ts` and the Practice-cleanup slice's "completion ≠ correctness" principle — no new philosophy invented.

## D. Continue Immediately

Remove it. The audit found today's actual behavior is unconditionally "continue immediately" regardless of configuration — the field already has zero effect. Keeping a setting that does nothing teaches distrust of the tool (same mistake as Question Type). If "must get it right before continuing" becomes a real requirement later, that's a deliberate, visible feature addition with its own retry UX — not a silently-inert flag today.

## E. YouTube implementation (future playback slice — not this slice)

- **Init:** singleton loader injects `https://www.youtube.com/iframe_api` once; `new YT.Player(elementId, { videoId, playerVars: { enablejsapi: 1, rel: 0, modestbranding: 1, fs: 0 } })`.
- **Lifecycle:** construct on session video mount, `destroy()` on unmount/session change.
- **Time detection:** no native time-update event — poll `player.getCurrentTime()` every ~250–300ms while `PLAYING`; stop polling otherwise.
- **Crossing detection:** checkpoints sorted by `timestampSeconds` + a `Set` of resolved ids; each poll tick, compare against the next unresolved checkpoint.
- **Pause/resume:** `pauseVideo()` on crossing; `playVideo()` after the student answers/skips.
- **Duplicate triggers:** the resolved-id `Set` persists for the player's mounted lifetime; once resolved, never retriggers (either direction — see F).
- **Refresh:** MVP does not persist mid-video/per-checkpoint state across a hard refresh — consistent with every other piece of this component's state today.
- **Mobile:** reuse the existing responsive `aspect-video` iframe pattern; tap-friendly full-width option buttons; disable native YouTube fullscreen (`fs: 0`) so the checkpoint overlay is never hidden behind it.
- **Ending:** drive "lesson watched" off `onStateChange === ENDED`, replacing today's fake timer.

## F. Seeking

- **Forward seek past an unresolved checkpoint** (e.g. 05:29 → 06:00, checkpoint at 05:30): the checkpoint **must still trigger** — detect the jump, `seekTo()` back to the checkpoint's timestamp, pause, show it.
- **Backward seek past an already-resolved checkpoint** (rewatch 04:00 → past 05:30 again): **must not** retrigger — once resolved, an id stays resolved for the life of the player mount, regardless of direction.

## G. Required checkpoint bypass

Any seek (progress-bar drag, keyboard, chapter click) that jumps past an unresolved **required** checkpoint forces a pause + rewind to that checkpoint before playback is allowed to continue from the new position. Non-required checkpoints impose no such correction. **This is good-faith UX enforcement, not tamper-proof** — it runs entirely in the student's browser; true tamper-resistance would require server-side verification, out of scope here.

## H. Data flow

```
Content Author → AuthoredSessionDraft.checkpoints[] (no continueImmediately)
  → buildContentSessionContent() — maps the FULL sorted array, not checkpoints[0]
  → ContentPackageRecord.courses[0]...content = { video: {youtubeUrl,title}, checkpoints: VideoCheckpoint[] }
  → Review / Approve / Publish — unchanged, these only ever touch status/review
  → toPreviewSessionContent() — copies `video` through (no longer dropped); copies `checkpoints` through (no longer collapsed to one)
  → SessionContent { video?, checkpoints: VideoCheckpoint[] } — `video` becomes a first-class field of the Student-facing type itself
  → SessionWorkspace / future VideoCheckpointPlayer
```

Every field (`id`, `timestampSeconds`, `question`, `options`, `correctIndex`, `feedback`, `required`) must survive every hop, for every checkpoint, not just the first.

## I. Preview

Preview must use the identical player/checkpoint component as Student — never a second implementation. Once `video`/`checkpoints` are ordinary fields on `SessionContent`, the special-cased `video={draftContent.video}` read that exists only to work around the old data loss becomes unnecessary. Both callers should end up symmetric, differing only in the pre-existing `mode: "student" | "preview"` flag (real vs. no-op completion/submission callbacks, banner copy) — never in checkpoint/video behavior itself.

## J. Completion

No new scoring system. Reuse `SessionActivitiesInput.videoCheck: { completed, correct }` verbatim:
- `completed` = every **required** checkpoint has been answered.
- `correct` = every required checkpoint was answered correctly (a single boolean reduction, not a percentage). `null` when there are no required checkpoints, exactly like today's "nothing to score" case.
- "Lesson watched" switches from the fake timer to the real `ENDED` event.

## K. Architecture

Three small pieces, mirroring the existing `practiceExecution.ts` provider-abstraction pattern rather than inventing something new:
1. A thin YouTube loader module (script injection + player construction) — the only place touching `window.YT`.
2. A `useVideoCheckpoints` hook — lifecycle, polling, seek detection, checkpoint resolution state; provider-agnostic outward interface.
3. A `VideoCheckpointPlayer` component — mounts the player, renders the question/feedback UI; rendered identically by Student and Preview.

Not a plugin registry, not a DI framework — that would be overengineering one provider and one question type.

## L. Migration

Client-only prototype, no server, no schema versioning — the safe approach is a **read-time compatibility shim, never a destructive rewrite**:
- Keep the old singular `videoCheckpoint?` field on `ContentSessionContent`, deprecated, documented, never written by new code (same pattern as the ZIP-era `packageVersion`/`contentTeam` fields).
- Add `checkpoints?: VideoCheckpoint[]`.
- One adapter, at the point content is converted for rendering: if `checkpoints` is missing/empty but the legacy `videoCheckpoint` is present, synthesize a one-item array from it, defaulting fields the old shape never had (`timestampSeconds: 0`, `feedback: ""`, `required: true`) rather than inventing anything specific.
- Never guess/backfill real historical values that don't exist. A Content Author wanting the full new experience re-authors via the existing "Author New Version" flow.

## M. Final recommendation

1. **Product decisions to freeze:** array-based checkpoints; MVP-only Multiple Choice (selector removed, not disabled); `continueImmediately` removed; `required` = must-answer, blocks completion and (later) forward-seek; seek rules per F; enforcement is good-faith UX only; Preview and Student share one implementation; no new scoring system.
2. **Data model changes:** `AuthoredCheckpoint` drops `continueImmediately`; `ContentSessionContent`/`SessionContent` gain `video`/`checkpoints` (array), with `videoCheckpoint` kept only as deprecated/compat.
3. **Student playback architecture** (future slice): loader → `useVideoCheckpoints` hook → `VideoCheckpointPlayer` component, replacing the inline mock-video state machine.
4. **Preview architecture:** identical component/hook/enforcement to Student; only `mode` differs.
5. **Test plan:** real video renders; multiple checkpoints trigger in order; authored feedback shown; required blocks completion; seek rules (F/G) hold; `ENDED` marks watched; Preview matches Student exactly; legacy data doesn't crash.
6. **Implementation order:** (1) data model + mapping fixes — this slice; (2) YouTube loader + hook with forward-only detection; (3) `VideoCheckpointPlayer` wired into both Student and Preview together; (4) seek detection + required-bypass rule; (5) completion/performance reduction last.

---

## Slice status

- **Slice 1 (complete):** data model + data flow fix (§A, H, L) + authoring UI cleanup (§B, D) + Required definition in the model only (§C, no blocking behavior yet).
- **Slice 2 (complete):** the real YouTube IFrame Player API (`youtubePlayer.ts`), playback-time polling + checkpoint-crossing detection + pause/resume + seek handling + required-checkpoint bypass prevention (`useVideoCheckpoints.ts`), the shared `VideoCheckpointPlayer` component wired into both Student and Preview via `SessionWorkspace.tsx` (§I), and the unified completion/performance reduction (§J) — all per §E/F/G/J/K. Sessions with no authored `content.video` still use the pre-Slice-2 mock/simulated video state machine untouched, as decided for backward compatibility with curated/default content that has no video.
- **Not yet implemented / explicitly out of scope so far:** anything beyond what §A–M covers — e.g. refresh-persistence of playback position (§E decided against it for MVP), a non-YouTube video provider, or question types other than Multiple Choice (§B).
