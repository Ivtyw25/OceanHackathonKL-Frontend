import { useEffect, useRef, useState } from 'react';
import { getRegion } from '../data/region';
import { useApp } from '../state/store';
import { compassPoint, COMPASS_NAMES } from './format';

const POINTS = Array.from({ length: 16 }, (_, i) => i * 22.5);

function Arrow({ fromDeg, size = 14 }: { fromDeg: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ transform: `rotate(${fromDeg + 180}deg)` }}>
      <path d="M6 1v10M6 1 3 4.2M6 1l3 3.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Compass({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const r = 66;
  const c = 84;
  const rad = ((value - 90) * Math.PI) / 180;
  return (
    <div className="relative mx-auto size-[168px]" role="radiogroup" aria-label="Wind direction (blowing from)">
      <svg className="absolute inset-0" viewBox="0 0 168 168" aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgb(30 42 48 / 0.15)" />
        <circle cx={c} cy={c} r={30} fill="#1b4660" opacity={0.9} />
        <line
          x1={c + Math.cos(rad) * (r - 10)}
          y1={c + Math.sin(rad) * (r - 10)}
          x2={c - Math.cos(rad) * 22}
          y2={c - Math.sin(rad) * 22}
          stroke="#1e2a30"
          strokeWidth={2}
          strokeLinecap="round"
          markerEnd="url(#wind-head)"
        />
        <defs>
          <marker id="wind-head" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 10 5 0 10Z" fill="#1e2a30" />
          </marker>
        </defs>
      </svg>
      {POINTS.map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        const name = compassPoint(deg);
        const major = deg % 90 === 0;
        const selected = Math.abs(((value - deg + 540) % 360) - 180) < 11.25;
        return (
          <button
            key={deg}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`From the ${COMPASS_NAMES[name]}`}
            onClick={() => onChange(deg)}
            className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full font-semibold transition-colors ${
              major ? 'size-7 text-xs' : 'size-6 text-[10px]'
            } ${selected ? 'bg-ink text-white' : 'bg-white/80 text-ink-2 hover:bg-white hover:text-ink'}`}
            style={{ left: c + Math.cos(a) * r, top: c + Math.sin(a) * r }}
          >
            {major || selected ? name : ''}
          </button>
        );
      })}
    </div>
  );
}

export function WindControl({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const wind = useApp((s) => s.forecastWind);
  const running = useApp((s) => s.simRunning);
  const progress = useApp((s) => s.simProgress);
  const error = useApp((s) => s.simError);
  const runForecast = useApp((s) => s.runForecast);
  const [draft, setDraft] = useState(wind);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(wind);
  }, [open, wind]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const changed = draft.fromDeg !== wind.fromDeg || draft.speed !== wind.speed;
  const defaultWind = getRegion().simulation.forecastWind;
  const isDefault = wind.fromDeg === defaultWind.fromDeg && wind.speed === defaultWind.speed;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[13px] font-semibold shadow-[0_0_0_1px_rgb(30_42_48/0.12)] hover:shadow-[0_0_0_1px_rgb(30_42_48/0.3)]"
      >
        <Arrow fromDeg={wind.fromDeg} />
        <span>
          Wind from {compassPoint(wind.fromDeg)}, {wind.speed} m/s
        </span>
        {running && <span className="font-normal text-ink-2">updating</span>}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Change the forecast wind"
          className="panel absolute bottom-full right-0 mb-3 w-[min(320px,calc(100vw-1.5rem))] p-4"
        >
          <h2 className="text-[15px] font-bold">Try a different wind</h2>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">
            The five-day forecast reruns with this wind. The observed days stay as they were.
          </p>
          <div className="mt-3">
            <Compass value={draft.fromDeg} onChange={(fromDeg) => setDraft((d) => ({ ...d, fromDeg }))} />
            <p className="mt-1 text-center text-[13px] text-ink-2">
              Blowing from the {COMPASS_NAMES[compassPoint(draft.fromDeg)]}
            </p>
          </div>
          <label className="mt-4 block">
            <span className="flex items-baseline justify-between text-[13px] font-semibold">
              Wind speed
              <output className="tabular-nums">{draft.speed.toFixed(1)} m/s</output>
            </span>
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={draft.speed}
              onChange={(e) => setDraft((d) => ({ ...d, speed: Number(e.target.value) }))}
              className="mt-2 w-full accent-ink"
            />
            <span className="flex justify-between text-xs text-ink-3">
              <span>Calm</span>
              <span>Strong breeze</span>
            </span>
          </label>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={running || !changed}
              onClick={() => void runForecast(draft)}
              className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-lake disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? `Updating forecast, ${Math.round(progress * 100)}%` : 'Update forecast'}
            </button>
            {!isDefault && !running && (
              <button
                type="button"
                onClick={() => void runForecast(defaultWind)}
                className="rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-white hover:text-ink"
              >
                Use original wind
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-[13px] text-ink">The forecast didn't update: {error}</p>}
        </div>
      )}
    </div>
  );
}
