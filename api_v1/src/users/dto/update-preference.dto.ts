import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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

const VALID_SPORTS = [
  'run',
  'walk',
  'bike',
  'hike',
  'swim',
  'triathlon',
  'fitness_trail',
  'climbing',
  'volleyball',
  'basketball',
  'soccer',
  'badminton',
  'tennis',
  'golf',
  'other',
] as const;

export class UpdatePreferencesDto {
  @IsOptional()
  @IsArray()
  preferred_sports?: (typeof VALID_SPORTS)[number][];

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
