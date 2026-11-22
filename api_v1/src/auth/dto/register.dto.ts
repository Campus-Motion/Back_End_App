import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  password!: string;
}
