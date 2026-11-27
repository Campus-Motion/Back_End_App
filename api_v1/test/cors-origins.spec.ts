import {
  DEFAULT_CORS_ORIGINS,
  parseCorsOrigins,
} from '../src/common/cors-origins';

describe('parseCorsOrigins', () => {
  it.each([undefined, '', '   ', ' , ,'])(
    'falls back to the default list for %p',
    (value) => {
      expect(parseCorsOrigins(value)).toEqual(DEFAULT_CORS_ORIGINS);
    },
  );

  it('splits, trims and removes trailing slashes', () => {
    expect(
      parseCorsOrigins(
        ' https://admin.staging.campusmotion.ch/ ,https://feed.campusmotion.ch',
      ),
    ).toEqual([
      'https://admin.staging.campusmotion.ch',
      'https://feed.campusmotion.ch',
    ]);
  });
});
