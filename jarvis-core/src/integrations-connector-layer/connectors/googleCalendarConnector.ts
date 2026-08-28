import {
  BaseConnector,
  ConnectorCapability,
  ConnectorHealth,
  ConnectorId,
} from '../types.js';

export class GoogleCalendarConnector implements BaseConnector {
  id: ConnectorId;
  name: string;
  type: string;
  version: string;
  private accessToken?: string;
  private baseUrl = 'https://www.googleapis.com/calendar/v3';

  constructor() {
    this.id = 'google-calendar' as ConnectorId;
    this.name = 'Google Calendar';
    this.type = 'google-calendar';
    this.version = '1.0.0';
  }

  async initialize(config: Record<string, any>): Promise<void> {
    this.accessToken = config.accessToken;
  }

  async execute(capability: string, parameters: Record<string, any>): Promise<any> {
    switch (capability) {
      case 'list_calendars':
        return this.listCalendars();
      case 'list_events':
        return this.listEvents(
          parameters.calendarId,
          parameters.timeMin,
          parameters.timeMax,
          parameters.maxResults
        );
      case 'create_event':
        return this.createEvent(
          parameters.calendarId,
          parameters.summary,
          parameters.description,
          parameters.start,
          parameters.end,
          parameters.attendees
        );
      case 'delete_event':
        return this.deleteEvent(parameters.calendarId, parameters.eventId);
      case 'get_free_busy':
        return this.getFreeBusy(parameters.timeMin, parameters.timeMax, parameters.items);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  }

  getCapabilities(): ConnectorCapability[] {
    return [
      {
        name: 'list_calendars',
        description: 'List user calendars',
        parameters: [],
        returns: 'array',
      },
      {
        name: 'list_events',
        description: 'List calendar events',
        parameters: [
          { name: 'calendarId', type: 'string', required: false, description: 'Calendar ID (default primary)' },
          { name: 'timeMin', type: 'string', required: false, description: 'ISO min time' },
          { name: 'timeMax', type: 'string', required: false, description: 'ISO max time' },
          { name: 'maxResults', type: 'number', required: false, description: 'Max results' },
        ],
        returns: 'array',
      },
      {
        name: 'create_event',
        description: 'Create a calendar event',
        parameters: [
          { name: 'calendarId', type: 'string', required: false, description: 'Calendar ID' },
          { name: 'summary', type: 'string', required: true, description: 'Event title' },
          { name: 'description', type: 'string', required: false, description: 'Event description' },
          { name: 'start', type: 'string', required: true, description: 'ISO start time' },
          { name: 'end', type: 'string', required: true, description: 'ISO end time' },
          { name: 'attendees', type: 'array', required: false, description: 'List of emails' },
        ],
        returns: 'object',
      },
      {
        name: 'delete_event',
        description: 'Delete a calendar event',
        parameters: [
          { name: 'calendarId', type: 'string', required: false, description: 'Calendar ID' },
          { name: 'eventId', type: 'string', required: true, description: 'Event ID' },
        ],
        returns: 'boolean',
      },
      {
        name: 'get_free_busy',
        description: 'Query free/busy availability',
        parameters: [
          { name: 'timeMin', type: 'string', required: true, description: 'ISO start time' },
          { name: 'timeMax', type: 'string', required: true, description: 'ISO end time' },
          { name: 'items', type: 'array', required: true, description: 'Calendar IDs to query' },
        ],
        returns: 'object',
      },
    ];
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.request('/users/me/calendarList');
      return {
        connectorId: this.id,
        status: 'healthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 0,
      };
    } catch {
      return {
        connectorId: this.id,
        status: 'unhealthy',
        lastCheck: new Date(),
        latency: Date.now() - start,
        errorRate: 1,
      };
    }
  }

  async dispose(): Promise<void> {}

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      throw new Error(`Google Calendar API error ${response.status}: ${await response.text()}`);
    }
    return response.status === 204 ? undefined : await response.json();
  }

  private listCalendars(): Promise<any> {
    return this.request('/users/me/calendarList');
  }

  private listEvents(
    calendarId = 'primary',
    timeMin?: string,
    timeMax?: string,
    maxResults = 25
  ): Promise<any> {
    const params = new URLSearchParams({ maxResults: String(maxResults) });
    if (timeMin) params.set('timeMin', timeMin);
    if (timeMax) params.set('timeMax', timeMax);
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  }

  private createEvent(
    calendarId = 'primary',
    summary: string,
    description?: string,
    start?: string,
    end?: string,
    attendees?: string[]
  ): Promise<any> {
    const body: Record<string, any> = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'UTC' },
      end: { dateTime: end, timeZone: 'UTC' },
    };
    if (attendees && attendees.length > 0) {
      body.attendees = attendees.map(email => ({ email }));
    }
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private deleteEvent(calendarId = 'primary', eventId: string): Promise<boolean> {
    return this.request(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
    }).then(() => true);
  }

  private getFreeBusy(timeMin: string, timeMax: string, items: string[]): Promise<any> {
    return this.request('/freeBusy', {
      method: 'POST',
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: items.map(id => ({ id })),
      }),
    });
  }
}
