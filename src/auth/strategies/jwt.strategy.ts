import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET')!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.authService.validateJwtPayload(payload.sub);

      if (!user) throw new UnauthorizedException('User not found or inactive');

      // Debugging: make sure role/status exist on the final request.user used by guards.
      // eslint-disable-next-line no-console
      console.log(
        '🧠 JwtStrategy validate payload.role=',
        payload.role,
        'payload.status=',
        payload.status,
        'validatedUser.role=',
        user?.role,
        'validatedUser.status=',
        user?.status,
      );

      // Passport will attach this object to req.user.
      // RolesGuard + ApprovedUserGuard rely on `req.user.role` and `req.user.status`.
      return { ...payload, ...user };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
