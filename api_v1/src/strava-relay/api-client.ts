// Minimal client for the Campus Motion API, used by the relay to publish
// events through the same endpoints (and role checks) as the admin tools.

export interface RelayedEvent {
  title: string;
  type: string;
  body: string;
  start_time: string;
  strava_url: string;
}

interface ExistingEvent {
  id: number;
  strava_url: string | null;
}

export class ApiClient {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly email: string,
    private readonly password: string,
  ) {}

  /** True when an event with this Strava link already starts at [startTime]. */
  async exists(stravaUrl: string, startTime: Date): Promise<boolean> {
    const minute = 60_000;
    const params = new URLSearchParams({
      after: new Date(startTime.getTime() - minute).toISOString(),
      before: new Date(startTime.getTime() + minute).toISOString(),
      limit: '100',
    });
    const res = await this.request('GET', `/events?${params}`);
    const body = (await res.json()) as { data?: ExistingEvent[] };
    return (body.data ?? []).some((e) => e.strava_url === stravaUrl);
  }

  async createEvent(event: RelayedEvent): Promise<number> {
    const res = await this.request('POST', '/events', event, true);
    const created = (await res.json()) as { id: number };
    return created.id;
  }

  private async login(): Promise<string> {
    const res = await this.request('POST', '/auth/login', {
      email: this.email,
      password: this.password,
    });
    const body = (await res.json()) as { access_token: string };
    return body.access_token;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    authenticated = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authenticated) {
      this.token ??= await this.login();
      headers.Authorization = `Bearer ${this.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} failed with ${res.status}`);
    }
    return res;
  }
}
