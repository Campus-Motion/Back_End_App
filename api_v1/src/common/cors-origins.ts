// Sites allowed to call the API when CORS_ORIGINS is unset or empty.
export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://feed.campusmotion.ch',
  'https://admin.campusmotion.ch',
  'https://api.campusmotion.ch',
];

// CORS_ORIGINS: comma-separated sites, set per environment. A trailing "/" is
// removed, since the browser's Origin header never has one.
export function parseCorsOrigins(value: string | undefined): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return origins.length ? origins : DEFAULT_CORS_ORIGINS;
}
