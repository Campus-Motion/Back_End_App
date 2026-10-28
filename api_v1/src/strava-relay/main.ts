// Strava event relay: reads unread Strava club-event announcements from the
// Campus Motion Gmail inbox and publishes them as Campus Motion events.
// Run periodically (cron); see strava-relay/README.md for the setup.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ApiClient } from './api-client';
import { parsePartnerClubs, relayAnnouncement } from './relay';

const STRAVA_SENDER = 'no-reply@strava.com';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

async function main(): Promise<void> {
  const partners = parsePartnerClubs(requireEnv('STRAVA_RELAY_CLUBS'));
  const api = new ApiClient(
    process.env.STRAVA_RELAY_API_URL ?? 'http://api-server:3000',
    requireEnv('STRAVA_RELAY_API_EMAIL'),
    requireEnv('STRAVA_RELAY_API_PASSWORD'),
  );
  const imap = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: requireEnv('STRAVA_RELAY_GMAIL_USER'),
      pass: requireEnv('STRAVA_RELAY_GMAIL_APP_PASSWORD'),
    },
    logger: false,
  });

  await imap.connect();
  const lock = await imap.getMailboxLock('INBOX');
  try {
    const uids =
      (await imap.search(
        { seen: false, from: STRAVA_SENDER },
        { uid: true },
      )) || [];
    for (const uid of uids) {
      const message = await imap.fetchOne(
        String(uid),
        { source: true },
        { uid: true },
      );
      if (!message || !message.source) continue;
      const mail = await simpleParser(message.source);
      const receivedAt = mail.date ?? new Date();

      try {
        const outcome = await relayAnnouncement(
          mail.text ?? '',
          receivedAt,
          partners,
          api,
        );
        console.log(`[strava-relay] ${outcome}: ${mail.subject ?? uid}`);
        // Unparsed emails are starred so someone can check them in Gmail.
        const flags =
          outcome === 'unparsed' ? ['\\Seen', '\\Flagged'] : ['\\Seen'];
        await imap.messageFlagsAdd(String(uid), flags, { uid: true });
      } catch (error) {
        // Left unread: retried on the next run.
        console.error(`[strava-relay] failed, will retry: ${String(error)}`);
      }
    }
  } finally {
    lock.release();
    await imap.logout();
  }
}

main().catch((error) => {
  console.error(`[strava-relay] ${String(error)}`);
  process.exit(1);
});
