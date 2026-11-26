import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ACTIVITY_TYPES } from '../../common/activity-types';
import type { ActivityType } from '../../common/activity-types';

export enum TrainingIntensity {
  LIGHT = 'light',
  MODERATE = 'moderate',
  INTENSE = 'intense',
  EXTREME = 'extreme',
}

export enum FitnessGoal {
  LOSE_WEIGHT = 'lose_weight',
  BUILD_MUSCLE = 'build_muscle',
  IMPROVE_ENDURANCE = 'improve_endurance',
  STAY_ACTIVE = 'stay_active',
  COMPETE = 'compete',
  HAVE_FUN = 'have_fun',
}

export enum ExperienceLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  @IsEnum(ACTIVITY_TYPES, { each: true })
  preferred_sports?: ActivityType[];

  @IsOptional()
  @IsEnum(TrainingIntensity)
  intensity?: TrainingIntensity;

  @IsOptional()
  @IsEnum(FitnessGoal)
  goal?: FitnessGoal;

  @IsOptional()
  @IsEnum(ExperienceLevel)
  level?: ExperienceLevel;

  @IsOptional()
  @IsBoolean()
  open_to_groups?: boolean;

  @IsOptional()
  @IsBoolean()
  open_to_new_sports?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  max_distance_km?: number;
}
