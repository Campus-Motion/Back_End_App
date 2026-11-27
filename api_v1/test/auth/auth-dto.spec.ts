import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { ChangePasswordDto } from '../../src/auth/dto/change-password.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(metatype: ArgumentMetadata['metatype'], value: unknown) {
  return pipe.transform(value, { type: 'body', metatype }) as Promise<unknown>;
}

// Resolves to the messages of the 400 the pipe throws for this body.
async function rejectionMessages(
  metatype: ArgumentMetadata['metatype'],
  body: unknown,
): Promise<string[]> {
  const error: unknown = await validate(metatype, body).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  const response = (error as BadRequestException).getResponse() as {
    message: string[];
  };
  return response.message;
}

const validRegister = {
  username: 'flavien',
  email: 'flavien@epfl.ch',
  password: 'securepassword123',
};
const validLogin = { email: 'flavien@epfl.ch', password: 'x' };

describe('RegisterDto', () => {
  it('accepts a valid body unchanged', async () => {
    await expect(validate(RegisterDto, validRegister)).resolves.toEqual(
      validRegister,
    );
  });

  it.each([
    ['username', { ...validRegister, username: undefined }, 'username'],
    ['empty username', { ...validRegister, username: '' }, 'username'],
    ['email', { ...validRegister, email: undefined }, 'email'],
    ['invalid email', { ...validRegister, email: 'not-an-email' }, 'email'],
    ['password', { ...validRegister, password: undefined }, 'password'],
    ['7-char password', { ...validRegister, password: '1234567' }, 'password'],
  ])('rejects a missing or invalid %s', async (_case, body, field) => {
    const messages = await rejectionMessages(RegisterDto, body);
    expect(messages.some((m) => m.startsWith(field))).toBe(true);
  });

  it('accepts an 8-character password', async () => {
    await expect(
      validate(RegisterDto, { ...validRegister, password: '12345678' }),
    ).resolves.toBeDefined();
  });
});

describe('LoginDto', () => {
  it('accepts a valid body unchanged', async () => {
    await expect(validate(LoginDto, validLogin)).resolves.toEqual(validLogin);
  });

  it.each([
    ['email', { password: 'x' }],
    ['password', { email: 'flavien@epfl.ch' }],
    ['email', { ...validLogin, email: '' }],
  ])('rejects a missing or empty %s', async (field, body) => {
    const messages = await rejectionMessages(LoginDto, body);
    expect(messages.some((m) => m.startsWith(field))).toBe(true);
  });
});

describe('ChangePasswordDto', () => {
  const valid = { current_password: 'old', new_password: 'newPassword2' };

  it('accepts a short current password and a valid new one', async () => {
    await expect(validate(ChangePasswordDto, valid)).resolves.toEqual(valid);
  });

  it.each([
    ['current_password', { new_password: 'newPassword2' }],
    ['current_password', { ...valid, current_password: '' }],
    ['new_password', { current_password: 'old' }],
    ['new_password', { ...valid, new_password: '' }],
    ['new_password', { ...valid, new_password: '1234567' }],
  ])('rejects a missing, empty or short %s', async (field, body) => {
    const messages = await rejectionMessages(ChangePasswordDto, body);
    expect(messages.some((m) => m.startsWith(field))).toBe(true);
  });
});
