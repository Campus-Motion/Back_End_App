export const ACTIVITY_TYPES = [
  'run',
  'walk',
  'cycle',
  'hike',
  'swim',
  'triathlon',
  'street_workout',
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

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
