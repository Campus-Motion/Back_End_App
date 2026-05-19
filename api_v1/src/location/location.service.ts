import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateLocationDto } from './dto/create-location.dto';

@Injectable()
export class LocationService {
  constructor(@Inject('API_DB') private readonly db: any) {}

  async findAll() {
    return this.db`SELECT * FROM locations`;
  }

  async findOne(id: number) {
    const result = await this.db`SELECT * FROM locations WHERE id = ${id}`;
    if (!result[0]) throw new NotFoundException(`Location #${id} not found`);
    return result[0];
  }

  async create(dto: CreateLocationDto, userId: number) {
    const { label, description, latitude, longitude } = dto;
    const result = await this.db`
      INSERT INTO locations (label, description, latitude, longitude)
      VALUES (${label}, ${description ?? null}, ${latitude}, ${longitude})
      RETURNING *
    `;
    return result[0];
  }

  async delete(id: number) {
    const result = await this.db`
      DELETE FROM locations WHERE id = ${id} RETURNING *
    `;
    if (!result[0]) throw new NotFoundException(`Location #${id} not found`);
    return result[0];
  }
}
