import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The ONLY thing the client sends. studentId comes from the JWT, sessionId
 * and activityType come from the route — none of those are accepted from
 * the request body. `answeredCheckpointIds` is only meaningful (and only
 * checked) for activityType="videoCheck"; see
 * ActivityProgressService.completeActivity() for how it's validated against
 * the session's own published required checkpoints. Absent/empty for
 * "learning"/"practice", which have no server-checkable payload.
 */
export class CompleteActivityDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  answeredCheckpointIds?: string[];
}
