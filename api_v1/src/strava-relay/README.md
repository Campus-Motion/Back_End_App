# Strava event relay

Publishes partner clubs' Strava group events as Campus Motion events.

A dedicated Strava account (`campusmotion.epfl@gmail.com`) joins each partner club with the club's agreement and receives Strava's email announcement for every new club event. Every 10 minutes, a cron job on the VM reads the unread announcements in that Gmail inbox and creates the matching event through the API (`POST /events`, as a moderator).

Only the facts are relayed: title, start time, club name and the link to the Strava event, where people sign up. No member data, email text or attachments are stored.

## How it works

| File | Role |
|---|---|
| `announcement.ts` | Parses the plain-text part of a French announcement ("X vous invite à participer à Y ... le ven. 30 oct. à 18:00"). The email has no year, so the year is the first one that puts the date on or after the day the email arrived. Times are Lausanne time, converted to UTC. |
| `relay.ts` | Skips clubs that are not partners, skips events already published (same Strava link at the same start time), then creates the event. |
| `api-client.ts` | Signs in as the relay's moderator account and calls the existing events endpoints. |
| `main.ts` | Reads unread emails from `no-reply@strava.com` over IMAP and runs the relay on each one. |

What happens to each email:

| Outcome | Email marked | Meaning |
|---|---|---|
| `created` | read | The event was published. |
| `duplicate` | read | The event was already published. |
| `not-partner` | read | The club is not in `STRAVA_RELAY_CLUBS`. |
| `unparsed` | read and starred | Not a recognised announcement (another Strava email, or Strava changed its format). Check starred emails in Gmail. |
| error | left unread | The API or network failed; retried on the next run. |

Strava's email format can change without notice. If starred emails appear for real announcements, update the pattern in `announcement.ts` and its test in `test/strava-relay/`. Only French announcements are recognised for now; keep the Strava account's language set to French.

## Setup

### 1. Gmail

1. On `campusmotion.epfl@gmail.com`, turn on 2-Step Verification (Google Account, Security).
2. Create an app password (Google Account, Security, App passwords) named "strava-relay". Keep the 16-character password for step 4.
3. IMAP is always on for Gmail; nothing to enable.

### 2. Strava

1. Sign up on Strava with `campusmotion.epfl@gmail.com`, language French.
2. Settings, Notifications, Email: turn on the group event announcements (the setting behind "Me désinscrire des e-mails d'annonces d'événements de groupe" in the footer of these emails).
3. Join each partner club once the club has agreed. Note the club id from its URL (`https://www.strava.com/clubs/<id>`).

### 3. Campus Motion API account

1. Register a dedicated account, for example `strava-relay@campusmotion.ch`, through `POST /auth/register`.
2. An admin gives it the moderator role: `PATCH /admin/users/<id>/role` with `{ "role": "moderator" }`.

### 4. VM environment

Add to the `.env` file next to `docker-compose.yml`:

```bash
STRAVA_RELAY_GMAIL_USER=campusmotion.epfl@gmail.com
STRAVA_RELAY_GMAIL_APP_PASSWORD=<app password from step 1>
STRAVA_RELAY_API_EMAIL=<relay account email from step 3>
STRAVA_RELAY_API_PASSWORD=<relay account password>
# Partner clubs: <strava club id>:<event type>, comma separated.
# Types: run, walk, bike, hike, swim, triathlon, fitness_trail, climbing,
# volleyball, basketball, soccer, badminton, tennis, golf, other.
STRAVA_RELAY_CLUBS=1999456:run
```

Removing a club from `STRAVA_RELAY_CLUBS` stops its relay at the next run. Events already published stay until an admin deletes them.

### 5. Build and try once

```bash
cd /path/to/Back_End_App
docker compose --profile jobs build strava-relay
docker compose run --rm strava-relay
```

Each processed email prints one line, for example `[strava-relay] created: Campus Motion vous a invité à participer à un événement en club`.

### 6. Cron (every 10 minutes)

`crontab -e` as the user that runs Docker, then add:

```cron
*/10 * * * * cd /path/to/Back_End_App && docker compose run --rm strava-relay >> /var/log/strava-relay.log 2>&1
```

Create the log file once with `sudo touch /var/log/strava-relay.log && sudo chown $USER /var/log/strava-relay.log`. After each backend deployment, rebuild the job image with the build command in step 5.

## Tests

```bash
cd api_v1
npx jest test/strava-relay
```
