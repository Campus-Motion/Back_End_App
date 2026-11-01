// Parses Strava "group event announcement" emails (French or English) into
// the facts we relay: club, title, start time and the Strava event link.

export interface Announcement {
  clubId: string;
  clubName: string;
  title: string;
  eventUrl: string;
  startTime: Date;
}

const STRAVA_TIME_ZONE = 'Europe/Zurich';

// Both patterns capture the same named groups; `meridiem` (AM/PM) only
// exists in English, where times use the 12-hour clock.
const CLUB = String.raw`(?<club>.+?) \( https?:\/\/www\.strava\.com\/clubs\/(?<clubId>\d+) \)`;
const EVENT = String.raw`(?<title>.+?) \( https?:\/\/www\.strava\.com\/clubs\/\d+\/group_events\/(?<eventId>\d+) \)`;

const LOCALES: { pattern: RegExp; months: Record<string, number> }[] = [
  {
    // "<club> ( <club url> ) vous invite à participer à <title> ( <event url> )
    // le ven. 30 oct. à 18:00."
    pattern: new RegExp(
      String.raw`${CLUB} vous invite à participer à ${EVENT} le \S+ (?<day>\d{1,2}) (?<month>\S+?)\.? à (?<hour>\d{1,2}):(?<minute>\d{2})`,
    ),
    months: {
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
    },
  },
  {
    // "<club> ( <club url> ) invited you to join <title> ( <event url> )
    // on Thu, Nov 5 at 5:30 PM."
    pattern: new RegExp(
      String.raw`${CLUB} invited you to join ${EVENT} on \S+ (?<month>[A-Za-z]+)\.? (?<day>\d{1,2}) at (?<hour>\d{1,2}):(?<minute>\d{2}) (?<meridiem>AM|PM)`,
    ),
    months: {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      sept: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    },
  },
];

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
  for (const { pattern, months } of LOCALES) {
    const groups = pattern.exec(flat)?.groups;
    if (!groups) continue;

    const month = months[groups.month.toLowerCase()];
    if (!month) return null;

    return {
      clubId: groups.clubId,
      // The club name follows the "****" banner that closes the email header.
      clubName: groups.club.replace(/^.*\*/, '').trim(),
      title: groups.title.trim(),
      eventUrl: `https://www.strava.com/clubs/${groups.clubId}/group_events/${groups.eventId}`,
      startTime: resolveStartTime(
        receivedAt,
        month,
        Number(groups.day),
        to24Hour(Number(groups.hour), groups.meridiem),
        Number(groups.minute),
      ),
    };
  }
  return null;
}

// 12 AM is midnight and 12 PM is noon; without a meridiem the hour is already
// on the 24-hour clock.
function to24Hour(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  return (hour % 12) + (meridiem === 'PM' ? 12 : 0);
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
