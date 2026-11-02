import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateNewsDto } from '../../src/news/dto/create-news.dto';
import { UpdateNewsDto } from '../../src/news/dto/update-news.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(metatype: ArgumentMetadata['metatype'], value: unknown) {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('news DTOs published flag', () => {
  it('accepts is_published on create', async () => {
    await expect(
      validate(CreateNewsDto, { title: 't', body: 'b', is_published: false }),
    ).resolves.toMatchObject({ is_published: false });
  });

  it('accepts is_published on update (publish and unpublish)', async () => {
    for (const value of [true, false]) {
      await expect(
        validate(UpdateNewsDto, { is_published: value }),
      ).resolves.toMatchObject({ is_published: value });
    }
  });

  it('rejects the ispublished spelling sent by the old admin client', async () => {
    await expect(
      validate(CreateNewsDto, { title: 't', body: 'b', ispublished: false }),
    ).rejects.toMatchObject({
      response: { message: ['property ispublished should not exist'] },
    });
    await expect(
      validate(UpdateNewsDto, { ispublished: true }),
    ).rejects.toMatchObject({
      response: { message: ['property ispublished should not exist'] },
    });
  });
});
