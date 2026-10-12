import { DO_STRESS, OUTLOOK_HOURS, TIME_ZONE } from '../config';
import type { FarmOutlook } from '../sim/risk';

export const timeAt = (now: Date, hour: number) => new Date(now.getTime() + hour * 3_600_000);

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, ...opts });
const weekdayLong = fmt({ weekday: 'long' });
const weekdayShort = fmt({ weekday: 'short' });
const dayMonth = fmt({ day: 'numeric', month: 'long' });
const dayNum = fmt({ day: 'numeric' });
const clock = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hourOfDay = fmt({ hour: 'numeric', hourCycle: 'h23' });

export const formatClock = (d: Date) => clock.format(d);
export const formatDate = (d: Date) => `${weekdayLong.format(d)} ${dayMonth.format(d)}`;
export const formatShortDay = (d: Date) => `${weekdayShort.format(d)} ${dayNum.format(d)}`;
export const formatWhen = (d: Date) => `${weekdayLong.format(d)} ${clock.format(d)}`;
export const localHour = (d: Date) => Number(hourOfDay.format(d));

export function aboutDuration(hours: number) {
  if (hours < 1.5) return 'within the hour';
  if (hours < 36) return `about ${Math.round(hours)} hours`;
  const days = Math.round(hours / 12) / 2;
  return `about ${days % 1 === 0 ? days : days.toFixed(1)} days`;
}

export function relativeLabel(hour: number) {
  const h = Math.round(hour);
  if (h === 0) return 'Now';
  if (h > 0) return `Forecast, ${aboutDuration(h).replace('about ', '')} ahead`;
  return `Observed, ${aboutDuration(-h).replace('about ', '')} ago`;
}

export const OUTLOOK_DAYS = OUTLOOK_HOURS / 24;

/** One short line for the farm list. */
export function outlookShort(o: FarmOutlook) {
  if (o.presentNow) return 'Bloom at the cages now';
  if (o.etaHours !== null && o.etaHours <= 120) return `Bloom likely in ${aboutDuration(o.etaHours)}`;
  if (o.chance >= 0.2) return `Possible in ${OUTLOOK_DAYS} days, ${Math.round(o.chance * 100)}% chance`;
  if (o.minOxygen < DO_STRESS) return 'Oxygen may run low at night';
  return `Clear for the next ${OUTLOOK_DAYS} days`;
}

export function outlookHeadline(o: FarmOutlook, name: string) {
  if (o.presentNow) return `Bloom is at the ${name} cages now.`;
  if (o.etaHours !== null && o.etaHours <= 120) return `Bloom likely to reach ${name} in ${aboutDuration(o.etaHours)}.`;
  if (o.chance >= 0.2) return `A bloom could reach ${name} within ${OUTLOOK_DAYS} days.`;
  return `No bloom expected at ${name} in the next ${OUTLOOK_DAYS} days.`;
}

export const ACTIONS: Record<FarmOutlook['level'], string[]> = {
  low: ['Keep the normal feeding routine.', 'Look at the water colour each morning.'],
  watch: [
    'Check dissolved oxygen at dawn and dusk.',
    'Get aerators ready to run.',
    'Avoid overfeeding. Uneaten feed fuels algae.',
  ],
  high: [
    'Cut feed by half until the bloom passes.',
    'Run aerators through the night.',
    'Hold off on restocking and net changes.',
    'Plan an early harvest of market-size fish.',
  ],
  severe: [
    'Stop feeding until oxygen recovers.',
    'Run aerators continuously.',
    'Harvest market-size fish early.',
    'Tell the district fisheries office (Dinas Perikanan).',
  ],
};

export const compassPoint = (deg: number) =>
  ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][
    Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  ];

export const COMPASS_NAMES: Record<string, string> = {
  N: 'north',
  NNE: 'north-north-east',
  NE: 'north-east',
  ENE: 'east-north-east',
  E: 'east',
  ESE: 'east-south-east',
  SE: 'south-east',
  SSE: 'south-south-east',
  S: 'south',
  SSW: 'south-south-west',
  SW: 'south-west',
  WSW: 'west-south-west',
  W: 'west',
  WNW: 'west-north-west',
  NW: 'north-west',
  NNW: 'north-north-west',
};
