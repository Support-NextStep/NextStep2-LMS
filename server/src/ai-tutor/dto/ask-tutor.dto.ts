import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The ONLY thing the client sends. studentId comes from the JWT, sessionId
 * comes from the route, and all lesson context is derived server-side from
 * the session's currently-published ContentVersion — none of those are
 * accepted from the request body. `message` covers both the existing quick
 * "help actions" (their literal button text, e.g. "Give me a hint") and a
 * free-form student question — the frontend already sends both through the
 * same sendChat() code path, so the backend needs only one field either way.
 *
 * MaxLength here is the DTO-level (fails fast, clear 400) copy of
 * AiTutorConfig.maxMessageChars (the defense-in-depth copy enforced again in
 * the service, same convention as CreateSubmissionDto vs
 * EvaluationConfig.maxTotalInputChars) — kept in sync by both reading the
 * same intent, not by importing one into the other (a DTO's validators must
 * be static decorators, not config-driven at runtime).
 */
export class AskTutorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2_000)
  message!: string;
}
