import { useEffect, useMemo, useState } from 'react';
import { FRAME_COUNT, TIMELINE_END_H, TIMELINE_START_H } from '../config';
import { frameOfHour } from '../sim/risk';
import { getRegion } from '../data/region';
import { DATA_SOURCE, useApp } from '../state/store';
import { algaeCss } from './color';
import { formatClock, formatDate, formatShortDay, localHour, relativeLabel, timeAt } from './format';
import { WindControl } from './WindControl';

const SPAN = TIMELINE_END_H - TIMELINE_START_H;
const pct = (h: number) => `${((h - TIMELINE_START_H) / SPAN) * 100}%`;
const SPEEDS = [
  { label: 'Slow', value: 3 },
  { label: 'Normal', value: 6 },
  { label: 'Fast', value: 14 },
];

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
      <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3.2 1.6v10.8a.8.8 0 0 0 1.2.7l8.6-5.4a.8.8 0 0 0 0-1.4L4.4.9a.8.8 0 0 0-1.2.7Z" fill="currentColor" />
    </svg>
  );
}

/** The browser clock, refreshed every 30 s, for the timeline before any forecast exists. */
function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

export function Timeline() {
  const hour = useApp((s) => s.hour);
  const playing = useApp((s) => s.playing);
  const speed = useApp((s) => s.speed);
  const setHour = useApp((s) => s.setHour);
  const setPlaying = useApp((s) => s.setPlaying);
  const setSpeed = useApp((s) => s.setSpeed);
  const now = useApp((s) => s.now);
  const sim = useApp((s) => s.sim);
  const hasForecast = useApp((s) => s.hasForecast);
  const loadError = useApp((s) => s.simError);
  const loading = useApp((s) => s.observedLoading);
  const world = useApp((s) => s.world);
  const outlooks = useApp((s) => s.outlooks);
  const selectedId = useApp((s) => s.selectedFarmId);
  const [windOpen, setWindOpen] = useState(false);

  const days = useMemo(() => {
    const out: { h: number; label: string }[] = [];
    for (let h = TIMELINE_START_H; h <= TIMELINE_END_H; h++) {
      if (localHour(timeAt(now, h)) === 0) out.push({ h, label: formatShortDay(timeAt(now, h)) });
    }
    return out;
  }, [now]);

  // Strip of algae at the selected farm, or at the farm most at risk.
  const strip = useMemo(() => {
    if (!world || outlooks.length === 0) return null;
    let i = world.farms.findIndex((f) => f.id === selectedId);
    if (i < 0) {
      const order = { severe: 0, high: 1, watch: 2, low: 3 };
      i = outlooks.reduce((best, o, k) => (order[o.level] < order[outlooks[best].level] ? k : best), 0);
    }
    return { name: world.farms[i].name, values: outlooks[i].series.median };
  }, [world, outlooks, selectedId]);

  const wind = useMemo(() => {
    if (!sim) return [];
    const out: { h: number; from: number; speed: number }[] = [];
    for (let h = TIMELINE_START_H + 3; h <= TIMELINE_END_H; h += 6) {
      const f = frameOfHour(h);
      out.push({ h, from: sim.windFrom[f], speed: sim.windSpeed[f] });
    }
    return out;
  }, [sim]);

  const clock = useClock();
  const ready = !!sim;
  // Without a forecast there is no observed/forecast span to show, so the header is just today.
  const current = ready ? timeAt(now, Math.round(hour)) : clock;

  return (
    <section
      aria-label="Timeline"
      className="panel absolute inset-x-3 bottom-3 z-30 px-3 pb-3 pt-2.5 lg:inset-x-4 lg:bottom-4 lg:px-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setPlaying(!playing)}
          disabled={!ready}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-white transition-colors hover:bg-lake disabled:opacity-40"
          aria-label={playing ? 'Pause' : 'Play the forecast'}
        >
          <PlayIcon playing={playing} />
        </button>
        <div className="min-w-[10.5rem] leading-tight">
          <p className="text-[13px] text-ink-2">{formatDate(current)}</p>
          <p className="text-[20px] font-bold tabular-nums tracking-[-0.01em]">
            {formatClock(current)} <span className="text-[13px] font-semibold text-ink-2">{getRegion().timeZoneLabel}</span>
          </p>
        </div>
        <p
          className={`rounded-md px-2 py-1 text-[13px] font-semibold ${
            ready && Math.round(hour) > 0 ? 'bg-lake/10 text-lake' : 'bg-ink/8 text-ink'
          }`}
        >
          {!ready ? (loading ? 'Loading' : 'Today') : Math.round(hour) === 0 && DATA_SOURCE === 'backend' ? 'Latest data' : relativeLabel(hour)}
        </p>
        {ready && Math.round(hour) !== 0 && (
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setHour(0);
            }}
            className="rounded-md px-2 py-1 text-[13px] font-semibold text-ink-2 underline decoration-ink/30 underline-offset-4 hover:text-ink"
          >
            Back to now
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div role="group" aria-label="Playback speed" className="hidden rounded-lg bg-ink/6 p-0.5 sm:flex">
            {SPEEDS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSpeed(s.value)}
                aria-pressed={speed === s.value}
                className={`rounded-md px-2.5 py-1 text-[13px] font-semibold transition-colors ${
                  speed === s.value ? 'bg-white text-ink shadow-[0_0_0_1px_rgb(30_42_48/0.1)]' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* The what-if wind reruns the simulation; real forecasts come from the model as they are. */}
          {DATA_SOURCE === 'sim' && <WindControl open={windOpen} onOpenChange={setWindOpen} />}
        </div>
      </div>

      {!ready && loading && (
        <div className="mt-2.5" role="status" aria-live="polite">
          <p className="text-[13px] text-ink-2">Loading the latest observed days…</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
            {/* Indeterminate: the request reports no progress, so a segment slides across until it's back. */}
            <div className="timeline-loading h-full w-1/3 rounded-full bg-lake" />
          </div>
        </div>
      )}
      {!ready && !loading && (
        <p className="mt-2.5 text-[13px] text-ink-2" role={loadError ? 'alert' : undefined}>
          {loadError && DATA_SOURCE === 'backend'
            ? `Couldn't load the observed days: ${loadError} Refresh the page once the backend is reachable.`
            : 'No forecast yet. Run the 5-day forecast from the farm list to see the observed days and the days ahead here.'}
        </p>
      )}
      {ready && (
        <div className="mt-2.5 grid grid-cols-[3.25rem_1fr] gap-x-2 sm:grid-cols-[4.5rem_1fr]">
          <span className="self-center text-xs text-ink-3">Wind</span>
          <div className="relative h-5" aria-hidden="true">
            {wind.map((w) => (
              <span
                key={w.h}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: pct(w.h), opacity: 0.35 + Math.min(1, w.speed / 7) * 0.65 }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: `rotate(${w.from + 180}deg)` }}>
                  <path d="M6 1v10M6 1 3 4.2M6 1l3 3.2" stroke="#46555d" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ))}
          </div>

          <span className="self-center truncate text-xs text-ink-3" title={strip ? `Algae at ${strip.name}` : undefined}>
            {strip ? strip.name : 'Algae'}
          </span>
          <div className="relative mt-1 h-2.5 overflow-hidden rounded-sm" aria-hidden="true">
            {strip && (
              <svg className="absolute inset-0 size-full" viewBox={`0 0 ${FRAME_COUNT} 1`} preserveAspectRatio="none">
                {Array.from(strip.values, (v, f) => (
                  <rect key={f} x={f} y={0} width={1.05} height={1} fill={algaeCss(v)} />
                ))}
              </svg>
            )}
          </div>

          <span className="self-start pt-1.5 text-xs text-ink-3">Time</span>
          <div className="relative mt-1.5 h-9">
            <div className="absolute inset-x-0 top-0 h-4 overflow-hidden rounded-[5px] bg-mist-deep/50 text-2xs font-semibold leading-4">
              <div className="absolute inset-y-0 bg-ink/18" style={{ left: 0, width: pct(0) }} />
              {hasForecast && (
                <div
                  className="absolute inset-y-0 bg-[repeating-linear-gradient(90deg,rgb(42_104_134/0.14)_0_2px,transparent_2px_6px)]"
                  style={{ left: pct(0), right: 0 }}
                />
              )}
              <span className="absolute left-1.5 text-ink-2">Observed</span>
              <span className={`absolute ${hasForecast ? 'text-lake' : 'text-ink-3'}`} style={{ left: `calc(${pct(0)} + 6px)` }}>
                {hasForecast ? 'Forecast' : 'No forecast yet'}
              </span>
            </div>
            <span className="absolute top-0 h-4 w-px bg-ink" style={{ left: pct(0) }} aria-hidden="true" />
            {days.map((d) => (
              <span key={d.h} className="absolute top-4 -translate-x-px text-2xs leading-none text-ink-3" style={{ left: pct(d.h) }}>
                <span className="mb-0.5 block h-1.5 w-px bg-ink/30" />
                {d.h - TIMELINE_START_H < SPAN * 0.95 && <span className="ml-1 hidden sm:inline">{d.label}</span>}
              </span>
            ))}
            <span
              className="pointer-events-none absolute -top-1 h-6 w-[3px] -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_2px_#f7f9f9]"
              style={{ left: pct(hour) }}
              aria-hidden="true"
            />
            <input
              type="range"
              className="range-track absolute inset-x-0 -top-1 h-6"
              min={TIMELINE_START_H}
              max={TIMELINE_END_H}
              step={1}
              value={Math.round(hour)}
              disabled={!ready}
              aria-label="Time on the map"
              aria-valuetext={`${formatDate(current)}, ${formatClock(current)}. ${relativeLabel(hour)}`}
              onChange={(e) => {
                setPlaying(false);
                setHour(Number(e.target.value));
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
