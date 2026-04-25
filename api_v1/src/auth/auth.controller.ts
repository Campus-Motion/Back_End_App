import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  Put,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

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
  @HttpCode(200) // Override default 201 Created status
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

  // PUT /auth/password
  @Put('password')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Req() req: any,
    @Body('current_password') current_password: string,
    @Body('new_password') new_password: string,
  ) {
    return this.authService.changePassword(
      req.user.id,
      { current_password, new_password },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: '/auth/password',
        httpMethod: 'PUT',
      },
    );
  }
}
