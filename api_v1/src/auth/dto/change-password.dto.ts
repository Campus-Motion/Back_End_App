import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from './register.dto';

export class ChangePasswordDto {
  // Only presence: accounts created before the length rule may have a
  // shorter current password.
  @IsString()
  @IsNotEmpty()
  current_password!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `new_password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  new_password!: string;
}
