import { IsNotEmpty, IsString } from 'class-validator';

// Only presence is checked: accounts created before RegisterDto existed may
// have an email or password that the register rules would now reject.
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
