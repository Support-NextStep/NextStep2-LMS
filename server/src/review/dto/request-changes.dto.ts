import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class RequestChangesDto {
  @IsObject()
  checklist!: Record<string, boolean>;

  @IsString()
  @IsNotEmpty()
  notes!: string;
}
