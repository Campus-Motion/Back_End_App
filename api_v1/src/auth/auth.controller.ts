import { Controller, Post, Body, HttpCode, Req } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/register
  @Post('register')
  register(
    @Body('username') username: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Req() req: any,
  ) {
    return this.authService.register(username, email, password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/auth/register',
      httpMethod: 'POST',
    });
  }

  // POST /auth/login
  @Post('login')
  @HttpCode(200) // NestJS defaults POST to 201, we want 200 for login
  login(
    @Body('email') email: string,
    @Body('password') password: string,
    @Req() req: any,
  ) {
    return this.authService.login(email, password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/auth/login',
      httpMethod: 'POST',
    });
  }
}
