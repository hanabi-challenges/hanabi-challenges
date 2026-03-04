import type { UserEventRecord } from '../userApi';

export function pickActiveEvents(events: UserEventRecord[]): UserEventRecord[] {
  const now = Date.now();
  const active = events.filter((event) => {
    if (!event.ends_at) return true;
    const endsAt = Date.parse(event.ends_at);
    return Number.isNaN(endsAt) ? true : endsAt >= now;
  });

  if (active.length > 0) return active.slice(0, 3);
  return events.slice(0, 3);
}
