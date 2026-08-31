import { IsString, MinLength } from 'class-validator';

export class CreatePackageDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
