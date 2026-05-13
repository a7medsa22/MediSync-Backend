// auth/guards/ownership.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_KEY } from '../decorators/owner.decorator';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramKey = this.reflector.get<string>(
      OWNER_KEY,
      context.getHandler(),
    );

    // لو مفيش @Owner → نعدّي
    if (!paramKey) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const resourceOwnerId = request.params[paramKey];

    // If it's a public route and we don't have a user, we can't check ownership
    // but we should allow it if the developer marked it as @Public()
    // This is common during registration steps
    if (!user) {
      const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);
      if (isPublic) return true;
      throw new ForbiddenException('Access denied');
    }

    if (!resourceOwnerId) {
      throw new ForbiddenException('Access denied');
    }

    if (user.sub !== resourceOwnerId) {
      throw new ForbiddenException('You do not own this resource');
    }

    return true;
  }
}
