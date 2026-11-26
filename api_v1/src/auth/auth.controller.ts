import {
  Controller,
  Post,
  Body,
  HttpCode,
  Req,
  Put,
  UseGuards,
  UseFilters,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SingleMessageBadRequestFilter } from '../common/filters/single-message-bad-request.filter';

// The mobile app reads `message` as a string: send validation errors as one.
@UseFilters(SingleMessageBadRequestFilter)
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // POST /auth/register
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.authService.register(dto.username, dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/auth/register',
      httpMethod: 'POST',
    });
  }

  // POST /auth/login
  @Post('login')
  @HttpCode(200) // Override default 201 Created status
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(dto.email, dto.password, {
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
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      {
        current_password: dto.current_password,
        new_password: dto.new_password,
      },
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        endpoint: '/auth/password',
        httpMethod: 'PUT',
      },
    );
  }

  // POST /auth/logout
  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any) {
    return this.authService.logout(req.user.id, req.user.username, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      endpoint: '/auth/logout',
      httpMethod: 'POST',
    });
  }
}
