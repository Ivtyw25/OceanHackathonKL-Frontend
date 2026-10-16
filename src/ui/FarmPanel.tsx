import { useMemo } from 'react';
import { DO_DANGER, DO_STRESS, TIMELINE_END_H } from '../config';
import { frameOfHour, type FarmOutlook } from '../sim/risk';
import { useApp } from '../state/store';
import { actionsFor, formatShortDay, formatWhen, outlookHeadline, timeAt } from './format';
import { STATUS_LABEL, StatusIcon } from './StatusIcon';
import { TimeChart } from './TimeChart';

const ALGAE_SERIES = '#3f9d4b';
const OXYGEN_SERIES = '#2a6886';

/** Chlorophyll with sensible precision: real coastal values are often below 1 µg/L. */
const chlText = (v: number) => (v < 10 ? v.toFixed(1) : v.toFixed(0));

const ALGAE_SCALES = [
  { max: 2, ticks: [0, 1, 2] },
  { max: 5, ticks: [0, 2.5, 5] },
  { max: 10, ticks: [0, 5, 10] },
  { max: 20, ticks: [0, 10, 20] },
  { max: 40, ticks: [0, 20, 40] },
  { max: 60, ticks: [0, 30, 60] },
  { max: 100, ticks: [0, 50, 100] },
  { max: 150, ticks: [0, 50, 100, 150] },
  { max: 200, ticks: [0, 100, 200] },
  { max: 300, ticks: [0, 100, 200, 300] },
  { max: 400, ticks: [0, 200, 400] },
];

function algaeScale(peak: number) {
  return ALGAE_SCALES.find((s) => s.max >= peak * 1.1) ?? ALGAE_SCALES[ALGAE_SCALES.length - 1];
}

function supportLine(o: FarmOutlook, members: number, now: Date, bloom: number) {
  const agree = Math.round(o.chance * members);
  // A single model run gives a probability, not a count of agreeing runs.
  const odds = members > 1 ? `${agree} of ${members} forecast runs bring it here` : `${Math.round(o.chance * 100)}% chance it arrives`;
  if (o.presentNow) return `Chlorophyll-a is ${chlText(o.nowChl)} µg/L at the cages. Bloom level here is ${chlText(bloom)}.`;
  const near = o.nearbyKm != null ? ` Bloom water about ${o.nearbyKm} km away.` : '';
  if (o.etaHours !== null) {
    return `Around ${formatWhen(timeAt(now, o.etaHours))}. ${odds} within 3 days.${near}`;
  }
  return `${odds} within 3 days.${near}`;
}

function dailyRows(o: FarmOutlook, now: Date) {
  const rows: { key: string; label: string; chance: number; peak: number; minOxygen: number }[] = [];
  for (let h = 0; h <= TIMELINE_END_H; h++) {
    const key = formatShortDay(timeAt(now, h));
    let row = rows[rows.length - 1];
    if (!row || row.key !== key) {
      row = { key, label: rows.length === 0 ? 'Today' : key, chance: 0, peak: 0, minOxygen: Infinity };
      rows.push(row);
    }
    const f = frameOfHour(h);
    row.chance = Math.max(row.chance, o.series.prob[f]);
    row.peak = Math.max(row.peak, o.series.median[f]);
    row.minOxygen = Math.min(row.minOxygen, o.series.oxygen[f]);
  }
  return rows;
}

export function FarmPanel() {
  const world = useApp((s) => s.world);
  const sim = useApp((s) => s.sim);
  const outlooks = useApp((s) => s.outlooks);
  const selectedId = useApp((s) => s.selectedFarmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const resetView = useApp((s) => s.resetView);
  const hour = useApp((s) => s.hour);
  const setHour = useApp((s) => s.setHour);
  const setPlaying = useApp((s) => s.setPlaying);
  const now = useApp((s) => s.now);

  const index = world?.farms.findIndex((f) => f.id === selectedId) ?? -1;
  const farm = index >= 0 ? world!.farms[index] : null;
  const outlook = index >= 0 ? outlooks[index] : undefined;
  const rows = useMemo(() => (outlook ? dailyRows(outlook, now) : []), [outlook, now]);

  if (!farm || !outlook || !sim) return null;
  const f = frameOfHour(hour);
  const bloom = outlook.bloomChl ?? sim.bloomChl;
  const scale = algaeScale(Math.max(...outlook.series.p90, bloom * 1.6));
  const scrub = (h: number) => {
    setPlaying(false);
    setHour(h);
  };
  const close = () => {
    selectFarm(null);
    resetView();
  };

  return (
    <aside
      aria-label={`${farm.name} forecast`}
      className="panel absolute inset-x-3 bottom-[13.25rem] z-30 flex max-h-[calc(100%-21rem)] flex-col overflow-hidden sm:bottom-[10.75rem] lg:inset-x-auto lg:bottom-[10.25rem] lg:right-4 lg:top-4 lg:max-h-none lg:w-[384px]"
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{farm.name}</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            {farm.shore}, {farm.cages} fish cages
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          className="-mr-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-white hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="min-h-0 overflow-y-auto px-5 pb-5">
        <section className="border-t border-ink/10 pt-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <StatusIcon level={outlook.level} />
            {STATUS_LABEL[outlook.level]} risk over the next 3 days
          </p>
          <p className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.01em]">
            {outlookHeadline(outlook, farm.name)}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{supportLine(outlook, sim.members, now, bloom)}</p>
        </section>

        <section className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-bold">Algae at the cages</h3>
            <p className="text-[13px] tabular-nums text-ink-2">
              {chlText(outlook.series.median[f])} µg/L, {formatWhen(timeAt(now, Math.round(hour)))}
            </p>
          </div>
          <p className="mb-2 text-xs text-ink-3">Chlorophyll-a. The shaded band is the forecast's likely range.</p>
          <TimeChart
            label={`Chlorophyll-a at ${farm.name}`}
            values={outlook.series.median}
            band={{ lo: outlook.series.p10, hi: outlook.series.p90 }}
            color={ALGAE_SERIES}
            yMax={scale.max}
            yTicks={scale.ticks}
            unit="µg/L"
            threshold={{ value: bloom, label: `Bloom level, ${chlText(bloom)}` }}
            hour={hour}
            now={now}
            onScrub={scrub}
          />
        </section>

        <section className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-bold">Oxygen at the cages</h3>
            <p className="text-[13px] tabular-nums text-ink-2">{outlook.series.oxygen[f].toFixed(1)} mg/L</p>
          </div>
          <p className="mb-2 text-xs text-ink-3">
            Dissolved oxygen. Caged fish are stressed below {DO_STRESS} mg/L and can die below {DO_DANGER}.
          </p>
          <TimeChart
            label={`Dissolved oxygen at ${farm.name}`}
            values={outlook.series.oxygen}
            color={OXYGEN_SERIES}
            yMax={12}
            yTicks={[0, 4, 8, 12]}
            unit="mg/L"
            decimals={1}
            threshold={{ value: DO_STRESS, label: `Stress, ${DO_STRESS}` }}
            zoneBelow={{ value: DO_DANGER, label: 'Fish kill risk' }}
            hour={hour}
            now={now}
            onScrub={scrub}
          />
        </section>

        <section className="mt-5">
          <h3 className="text-[14px] font-bold">Day by day</h3>
          <table className="mt-2 w-full text-left text-[13px]">
            <thead className="text-xs text-ink-3">
              <tr>
                <th className="py-1 font-semibold">Day</th>
                <th className="py-1 text-right font-semibold">Bloom chance</th>
                <th className="py-1 text-right font-semibold">Peak algae</th>
                <th className="py-1 text-right font-semibold">Lowest oxygen</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-ink/8">
                  <td className="py-1.5 font-semibold">{r.label}</td>
                  <td className="py-1.5 text-right">{Math.round(r.chance * 100)}%</td>
                  <td className="py-1.5 text-right">{chlText(r.peak)} µg/L</td>
                  <td className={`py-1.5 text-right ${r.minOxygen < DO_STRESS ? 'font-bold' : ''}`}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {r.minOxygen < DO_STRESS && (
                        <StatusIcon level={r.minOxygen < DO_DANGER ? 'severe' : 'high'} size={12} />
                      )}
                      {r.minOxygen.toFixed(1)} mg/L
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-5">
          <h3 className="text-[14px] font-bold">What to do</h3>
          <ul className="mt-2 space-y-1.5 text-[14px] leading-snug">
            {actionsFor(outlook.level).map((a) => (
              <li key={a} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-ink-2" />
                {a}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
