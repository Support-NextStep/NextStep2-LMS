import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * One in-editor file at submission time. Deliberately just `name` +
 * `content` — nothing here is trusted as an identifier or path; `name` is
 * display-only (matches CodeFile in practiceExecution.ts on the frontend).
 */
export class SubmissionFileDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(200_000)
  content!: string;
}

/**
 * The ONLY thing the client sends. studentId comes from the JWT,
 * sessionId comes from the route, contentVersionId comes from resolving
 * the session's currently-published Publication, attemptNumber is
 * server-computed, and language is derived from the published Exercise's
 * own authored language — none of those are accepted from the request
 * body, per Slice 1's "never trust the browser" requirement.
 */
export class CreateSubmissionDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SubmissionFileDto)
  files!: SubmissionFileDto[];
}
