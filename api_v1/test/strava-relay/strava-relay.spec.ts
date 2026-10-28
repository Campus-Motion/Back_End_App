import { parseAnnouncement } from '../../src/strava-relay/announcement';
import {
  parsePartnerClubs,
  relayAnnouncement,
} from '../../src/strava-relay/relay';

// Plain-text part of a real Strava announcement (French), footer trimmed.
function announcementText(dateLine = 'le ven. 30 oct. à 18:00'): string {
  return `Ça vous intéresse ? Voici les détails.

Strava

****************
Rejoignez-nous !
****************

Campus Motion ( http://www.strava.com/clubs/1999456 ) vous invite
à participer à 5k run
( http://www.strava.com/clubs/1999456/group_events/3550136692242408010 )
 ${dateLine}. Si ça vous intéresse, consultez les
détails et envoyez votre réponse.

Voir l'événement
( http://www.strava.com/clubs/1999456/group_events/3550136692242408010 )
`;
}

const receivedAt = new Date('2026-10-27T12:15:48Z');
const eventUrl =
  'https://www.strava.com/clubs/1999456/group_events/3550136692242408010';

describe('parseAnnouncement', () => {
  it('extracts the club, title, link and start time', () => {
    expect(parseAnnouncement(announcementText(), receivedAt)).toEqual({
      clubId: '1999456',
      clubName: 'Campus Motion',
      title: '5k run',
      eventUrl,
      // 18:00 in Lausanne in winter (UTC+1).
      startTime: new Date('2026-10-30T17:00:00Z'),
    });
  });

  it('applies summer time and rolls past dates to next year', () => {
    const parsed = parseAnnouncement(
      announcementText('le dim. 13 juin à 09:30'),
      receivedAt,
    );
    expect(parsed?.startTime).toEqual(new Date('2027-06-13T07:30:00Z'));
  });

  it('places a January event announced in December in the next year', () => {
    const parsed = parseAnnouncement(
      announcementText('le sam. 9 janv. à 10:00'),
      new Date('2026-12-20T09:00:00Z'),
    );
    expect(parsed?.startTime).toEqual(new Date('2027-01-09T09:00:00Z'));
  });

  it('returns null for other Strava emails', () => {
    expect(
      parseAnnouncement('Votre récapitulatif hebdomadaire', receivedAt),
    ).toBeNull();
  });
});

describe('relayAnnouncement', () => {
  const partners = parsePartnerClubs('1999456:run, 42:bike');

  function fakeApi(existing = false) {
    return {
      exists: jest.fn().mockResolvedValue(existing),
      createEvent: jest.fn().mockResolvedValue(1),
    };
  }

  it('publishes a partner club event with only its facts and link', async () => {
    const api = fakeApi();
    await expect(
      relayAnnouncement(announcementText(), receivedAt, partners, api),
    ).resolves.toBe('created');
    expect(api.createEvent).toHaveBeenCalledWith({
      title: '5k run',
      type: 'run',
      body: 'Événement organisé par Campus Motion. Inscription sur Strava.',
      start_time: '2026-10-30T17:00:00.000Z',
      strava_url: eventUrl,
    });
  });

  it('skips events that are already published', async () => {
    const api = fakeApi(true);
    await expect(
      relayAnnouncement(announcementText(), receivedAt, partners, api),
    ).resolves.toBe('duplicate');
    expect(api.createEvent).not.toHaveBeenCalled();
  });

  it('ignores clubs that are not partners', async () => {
    const api = fakeApi();
    await expect(
      relayAnnouncement(announcementText(), receivedAt, new Map(), api),
    ).resolves.toBe('not-partner');
    expect(api.exists).not.toHaveBeenCalled();
  });

  it('reports emails it cannot parse', async () => {
    const api = fakeApi();
    await expect(
      relayAnnouncement('Bonjour', receivedAt, partners, api),
    ).resolves.toBe('unparsed');
  });
});
