import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { SearchUsersDto } from '../../src/users/dto/search-users.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(value: unknown) {
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: SearchUsersDto,
  };
  return pipe.transform(value, metadata);
}

describe('SearchUsersDto', () => {
  it('trims q and defaults limit to 20', async () => {
    await expect(validate({ q: '  al  ' })).resolves.toMatchObject({
      q: 'al',
      limit: 20,
    });
  });

  it('converts limit from the query string', async () => {
    await expect(validate({ q: 'al', limit: '100' })).resolves.toMatchObject({
      limit: 100,
    });
  });

  it('rejects a missing, one-character or blank q', async () => {
    for (const value of [{}, { q: 'a' }, { q: '   ' }]) {
      await expect(validate(value)).rejects.toMatchObject({
        response: { statusCode: 400 },
      });
    }
  });

  it('rejects a limit below 1 and unknown parameters', async () => {
    await expect(validate({ q: 'al', limit: '0' })).rejects.toMatchObject({
      response: { statusCode: 400 },
    });
    await expect(validate({ q: 'al', email: 'x' })).rejects.toMatchObject({
      response: { message: ['property email should not exist'] },
    });
  });
});
