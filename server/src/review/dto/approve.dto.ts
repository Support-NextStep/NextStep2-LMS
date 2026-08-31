import { IsObject } from 'class-validator';

export class ApproveDto {
  @IsObject()
  checklist!: Record<string, boolean>;
}
