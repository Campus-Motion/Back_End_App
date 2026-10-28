import { parseAnnouncement } from './announcement';
import { ApiClient } from './api-client';

/** Partner clubs that agreed to the relay: Strava club id -> event type. */
export type PartnerClubs = Map<string, string>;

export type RelayOutcome = 'created' | 'duplicate' | 'not-partner' | 'unparsed';

/**
 * Publishes the event announced in one email, if it comes from a partner club
 * and is not already published. Throws when the API call fails, so the caller
 * can retry the email on the next run.
 */
export async function relayAnnouncement(
  text: string,
  receivedAt: Date,
  partners: PartnerClubs,
  api: Pick<ApiClient, 'exists' | 'createEvent'>,
): Promise<RelayOutcome> {
  const announcement = parseAnnouncement(text, receivedAt);
  if (!announcement) return 'unparsed';

  const type = partners.get(announcement.clubId);
  if (!type) return 'not-partner';

  if (await api.exists(announcement.eventUrl, announcement.startTime)) {
    return 'duplicate';
  }

  await api.createEvent({
    title: announcement.title,
    type,
    body: `Événement organisé par ${announcement.clubName}. Inscription sur Strava.`,
    start_time: announcement.startTime.toISOString(),
    strava_url: announcement.eventUrl,
  });
  return 'created';
}

/** Parses "1999456:run,123:bike" into a club id -> event type map. */
export function parsePartnerClubs(value: string): PartnerClubs {
  const partners: PartnerClubs = new Map();
  for (const entry of value.split(',')) {
    const [clubId, type = 'other'] = entry.trim().split(':');
    if (clubId) partners.set(clubId, type);
  }
  return partners;
}
