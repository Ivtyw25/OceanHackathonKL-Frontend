import { useState } from 'react';
import { CHL_BLOOM } from '../config';
import { useApp, type LayerKey } from '../state/store';
import { algaeCss } from './color';
import { useMediaQuery } from './useMediaQuery';

const LAYERS: { key: LayerKey; label: string; hint?: string }[] = [
  { key: 'algaeColour', label: 'Algae colour' },
  { key: 'algaeHeight', label: 'Raised algae layer', hint: 'Stands taller where algae is denser' },
  { key: 'fronts', label: 'Forecast bloom edges' },
  { key: 'uncertainty', label: 'Forecast uncertainty', hint: 'Where forecast runs disagree' },
  { key: 'currents', label: 'Surface currents' },
  { key: 'buoys', label: 'Buoys', hint: 'Hover one to read it' },
  { key: 'contours', label: 'Contour lines', hint: 'Every 100 m on land, 50 m underwater' },
];

const LOG_MIN = Math.log(2);
const LOG_MAX = Math.log(300);
const at = (chl: number) => ((Math.log(chl) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
const TICKS = [5, 25, 80, 220];

export function MapKey() {
  const layers = useApp((s) => s.layers);
  const toggle = useApp((s) => s.toggleLayer);
  const panelOpen = useApp((s) => s.selectedFarmId !== null);
  const resetView = useApp((s) => s.resetView);
  const [showLayers, setShowLayers] = useState(false);
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 1024px)');
  // Expanded by default on wide screens with no farm open; a button otherwise.
  const expanded = open || (!panelOpen && wide);

  const gradient = `linear-gradient(90deg, ${Array.from({ length: 12 }, (_, i) => {
    const chl = Math.exp(LOG_MIN + (i / 11) * (LOG_MAX - LOG_MIN));
    return `${algaeCss(chl)} ${(i / 11) * 100}%`;
  }).join(', ')})`;

  const side = panelOpen ? 'lg:right-[416px]' : 'lg:right-4';
  return (
    <>
      {(!expanded || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className={`panel absolute right-3 top-3 z-20 px-3 py-2 text-[13px] font-semibold lg:top-4 ${side}`}
        >
          <span className="flex items-center gap-1.5">
            Map key
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={open ? 'rotate-180' : ''}>
              <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </button>
      )}
      <div
        className={`panel absolute right-3 z-20 w-[248px] p-3.5 ${side} ${expanded ? 'block' : 'hidden'} ${
          open ? 'top-[8.6rem] lg:top-[3.9rem]' : 'top-3 lg:top-4'
        }`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-[13px] font-bold">Algae on the water</h2>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink-2 hover:bg-white hover:text-ink"
          >
            Whole lake
          </button>
        </div>
        <div className="relative mt-2">
          <div className="h-2.5 rounded-sm" style={{ background: gradient }} />
          <div className="relative mt-1 h-4 text-2xs tabular-nums text-ink-2">
            {TICKS.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${at(t)}%` }}>
                {t === 220 ? '220+' : t}
              </span>
            ))}
          </div>
          <span
            className="absolute top-0 h-2.5 w-0.5 -translate-x-1/2 bg-ink"
            style={{ left: `${at(CHL_BLOOM)}%` }}
            aria-hidden="true"
          />
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-2">
          Chlorophyll-a in µg/L. A bloom starts at {CHL_BLOOM}.
        </p>

        <h2 className="mt-3 text-[13px] font-bold">Forecast bloom edge</h2>
        <div className="mt-1.5 flex items-center gap-3 rounded-md bg-[#1b4660] px-2.5 py-1.5 text-2xs font-semibold text-white">
          {[
            { label: 'In 24 h', w: 2.6, o: 1 },
            { label: '48 h', w: 2, o: 0.75 },
            { label: '72 h', w: 1.5, o: 0.5 },
          ].map((k) => (
            <span key={k.label} className="flex items-center gap-1.5">
              <span className="block w-4 rounded-full bg-white" style={{ height: k.w, opacity: k.o }} />
              {k.label}
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-2">Where most forecast runs show a bloom.</p>

        <button
          type="button"
          onClick={() => setShowLayers((v) => !v)}
          aria-expanded={showLayers}
          className="mt-3 flex w-full items-center justify-between rounded-md py-1 text-[13px] font-bold"
        >
          Map layers
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={showLayers ? 'rotate-180' : ''}>
            <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {showLayers && (
          <ul className="mt-1 space-y-0.5">
            {LAYERS.map((l) => (
              <li key={l.key}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 hover:bg-white/70">
                  <input
                    type="checkbox"
                    checked={layers[l.key]}
                    onChange={() => toggle(l.key)}
                    className="mt-0.5 size-4 accent-ink"
                  />
                  <span className="leading-tight">
                    <span className="block text-[13px]">{l.label}</span>
                    {l.hint && <span className="block text-xs text-ink-3">{l.hint}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
