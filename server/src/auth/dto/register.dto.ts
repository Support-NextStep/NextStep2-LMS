import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * No `role` field, deliberately — self-registration always creates a
 * student account server-side (see AuthService.register). A client can
 * never choose its own role by sending one here; there is no code path
 * anywhere that reads a role off this DTO.
 */
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}
