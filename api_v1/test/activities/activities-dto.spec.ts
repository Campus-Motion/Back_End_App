import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { CreateActivityDto } from '../../src/activities/dto/create-activities.dto';
import { UpdateActivityDto } from '../../src/activities/dto/update-activity.dto';
import { CreateEventDto } from '../../src/events/dto/create-event.dto';
import { UpdateEventDto } from '../../src/events/dto/update-event.dto';
import { UpdatePreferencesDto } from '../../src/users/dto/update-preference.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

function validate(metatype: ArgumentMetadata['metatype'], value: unknown) {
  return pipe.transform(value, { type: 'body', metatype });
}

describe('activity DTOs duration, distance_km and cycle type', () => {
  it('accepts optional duration and distance_km on create', async () => {
    await expect(
      validate(CreateActivityDto, {
        title: 'Lakeside Ride',
        type: 'cycle',
        duration: 42.5,
        distance_km: 15.25,
        is_public: false,
      }),
    ).resolves.toMatchObject({
      title: 'Lakeside Ride',
      type: 'cycle',
      duration: 42.5,
      distance_km: 15.25,
      is_public: false,
    });
  });

  it('accepts zero duration and zero distance_km on create', async () => {
    await expect(
      validate(CreateActivityDto, {
        title: 'Quick Session',
        type: 'run',
        duration: 0,
        distance_km: 0,
      }),
    ).resolves.toMatchObject({
      duration: 0,
      distance_km: 0,
    });
  });

  it('accepts create requests without duration or distance_km', async () => {
    const result = (await validate(CreateActivityDto, {
      title: 'Morning Walk',
      type: 'walk',
    })) as CreateActivityDto;

    expect(result.title).toBe('Morning Walk');
    expect(result.type).toBe('walk');
    expect(result.duration).toBeUndefined();
    expect(result.distance_km).toBeUndefined();
  });

  it('rejects negative or non-numeric duration and distance_km on create', async () => {
    await expect(
      validate(CreateActivityDto, {
        title: 'Bad Duration',
        type: 'run',
        duration: -5,
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(CreateActivityDto, {
        title: 'Bad Distance',
        type: 'run',
        distance_km: -1.2,
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(CreateActivityDto, {
        title: 'String Duration',
        type: 'run',
        duration: '45m',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects legacy bike type and unknown fields on create', async () => {
    await expect(
      validate(CreateActivityDto, {
        title: 'Old Bike Type',
        type: 'bike',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(CreateActivityDto, {
        title: 'Extra Field',
        type: 'cycle',
        distance_m: 5000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('accepts partial updates with duration, distance_km and cycle on update', async () => {
    await expect(
      validate(UpdateActivityDto, {
        duration: 30,
        distance_km: 6.4,
      }),
    ).resolves.toMatchObject({
      duration: 30,
      distance_km: 6.4,
    });

    await expect(
      validate(UpdateActivityDto, {
        title: 'Updated Ride',
        type: 'cycle',
        is_public: true,
      }),
    ).resolves.toMatchObject({
      title: 'Updated Ride',
      type: 'cycle',
      is_public: true,
    });
  });

  it('rejects invalid fields on update', async () => {
    await expect(
      validate(UpdateActivityDto, { title: '' }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(UpdateActivityDto, { type: 'bike' }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(UpdateActivityDto, { duration: -1 }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      validate(UpdateActivityDto, { distance_km: -0.1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('aligns cycle enum across event and preference DTOs', async () => {
    await expect(
      validate(CreateEventDto, {
        title: 'Campus Cycle',
        type: 'cycle',
        start_time: '2026-05-01T09:00:00Z',
      }),
    ).resolves.toMatchObject({ type: 'cycle' });

    await expect(
      validate(UpdateEventDto, { type: 'cycle' }),
    ).resolves.toMatchObject({ type: 'cycle' });

    await expect(
      validate(UpdatePreferencesDto, { preferred_sports: ['run', 'cycle'] }),
    ).resolves.toMatchObject({ preferred_sports: ['run', 'cycle'] });

    await expect(
      validate(UpdatePreferencesDto, { preferred_sports: ['bike'] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
