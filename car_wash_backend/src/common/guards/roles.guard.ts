import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) {
      throw new ForbiddenException('Access denied');
    }
    const actualRole = String(user.role).toUpperCase();
    const hasRole = requiredRoles
      .map((r) => String(r).toUpperCase())
      .includes(actualRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions (required: ${requiredRoles.join(', ')}, actual: ${actualRole})`,
      );
    }
    return true;
  }
}
