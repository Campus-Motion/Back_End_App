// roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.get<string[]>('roles', context.getHandler()) ??
      this.reflector.get<string[]>('roles', context.getClass()); // ← also checks controller-level @SetMetadata
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!requiredRoles.includes(user.role)) {
      const isDev = process.env.NODE_ENV !== 'production';
      throw new ForbiddenException(
        isDev
          ? `[Roles] Required: ${requiredRoles.join(' or ')} — you have: ${user.role}`
          : 'Forbidden',
      );
    }
    return true;
  }
}
