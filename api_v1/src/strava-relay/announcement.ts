// Parses Strava "group event announcement" emails (French locale) into the
// facts we relay: club, title, start time and the Strava event link.

export interface Announcement {
  clubId: string;
  clubName: string;
  title: string;
  eventUrl: string;
  startTime: Date;
}

const STRAVA_TIME_ZONE = 'Europe/Zurich';

const FRENCH_MONTHS: Record<string, number> = {
  janv: 1,
  févr: 2,
  mars: 3,
  avr: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  août: 8,
  sept: 9,
  oct: 10,
  nov: 11,
  déc: 12,
};

// "<club> ( http://www.strava.com/clubs/<id> ) vous invite à participer à
// <title> ( <event url> ) le ven. 30 oct. à 18:00."
const FRENCH_PATTERN =
  /(.+?) \( https?:\/\/www\.strava\.com\/clubs\/(\d+) \) vous invite à participer à (.+?) \( https?:\/\/www\.strava\.com\/clubs\/\d+\/group_events\/(\d+) \) le \S+ (\d{1,2}) (\S+?)\.? à (\d{1,2}):(\d{2})/;

/**
 * Returns the announcement contained in [text] (the plain-text part of the
 * email), or null when the text is not a recognised announcement.
 * [receivedAt] is the email's date; it supplies the year, which the email omits.
 */
export function parseAnnouncement(
  text: string,
  receivedAt: Date,
): Announcement | null {
  const flat = text.replace(/\s+/g, ' ');
  const match = FRENCH_PATTERN.exec(flat);
  if (!match) return null;

  const [, clubLine, clubId, title, eventId, day, monthToken, hour, minute] =
    match;
  const month = FRENCH_MONTHS[monthToken.toLowerCase()];
  if (!month) return null;

  return {
    clubId,
    // The club name follows the "****" banner that closes the email header.
    clubName: clubLine.replace(/^.*\*/, '').trim(),
    title: title.trim(),
    eventUrl: `https://www.strava.com/clubs/${clubId}/group_events/${eventId}`,
    startTime: resolveStartTime(
      receivedAt,
      month,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  };
}

// Picks the first occurrence of the date on or after the day the email was
// received, so an announcement sent in December for January lands next year.
function resolveStartTime(
  receivedAt: Date,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const received = zonedParts(receivedAt);
  const year =
    month < received.month || (month === received.month && day < received.day)
      ? received.year + 1
      : received.year;
  return zonedTimeToUtc(year, month, day, hour, minute);
}

function zonedParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STRAVA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Converts a wall-clock time in Europe/Zurich to the matching UTC instant,
// including the summer-time offset.
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMs = zoneOffsetMs(new Date(asUtc));
  return new Date(asUtc - offsetMs);
}

function zoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STRAVA_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
  );
  return wallAsUtc - date.getTime();
}
