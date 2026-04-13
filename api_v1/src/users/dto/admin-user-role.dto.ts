import { IsEnum } from 'class-validator';

export class AdminUserRoleDto {
  @IsEnum(['user', 'moderator', 'admin'], {
    message: 'role must be one of: user, moderator, admin',
  })
  role!: 'user' | 'moderator' | 'admin';
}
