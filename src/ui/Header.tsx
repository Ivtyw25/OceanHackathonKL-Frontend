import { getRegion, getRegionIndex, switchRegion } from '../data/region';
import { DATA_SOURCE, useApp } from '../state/store';

function PlacePicker() {
  const region = getRegion();
  const { regions } = getRegionIndex();
  if (regions.length < 2) {
    return (
      <p className="mt-1 text-xs text-ink-2">
        {region.name}, {region.area}
      </p>
    );
  }
  return (
    <label className="relative mt-1 flex items-center text-xs text-ink-2">
      <span className="sr-only">Place</span>
      {/* Padding widens the tap area to 44 px; the negative margin keeps the header compact. */}
      <select
        value={region.id}
        onChange={(e) => switchRegion(e.target.value)}
        className="-my-3.5 cursor-pointer appearance-none rounded bg-transparent py-3.5 pr-4 text-ink-2 hover:text-ink"
      >
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}, {r.area}
          </option>
        ))}
      </select>
      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" className="pointer-events-none absolute right-0">
        <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </label>
  );
}

function DataBadge() {
  const info = useApp((s) => s.forecastInfo);
  const [label, short, title] =
    DATA_SOURCE === 'sim'
      ? ['Demo data', 'Demo', 'Farms, sample points and forecasts in this prototype are simulated.']
      : info?.synthetic === false
        ? ['Demo farms', 'Demo', 'Water data and forecasts are real. Farm positions are approximate and cage counts are made up.']
        : ['Demo model', 'Demo', 'Water data is real Copernicus observations. The forecast model is a placeholder trained on synthetic data, and farm positions are approximate.'];
  return (
    <span className="ml-1 rounded-md bg-status-watch/25 px-2 py-1 text-2xs font-semibold text-ink" title={title}>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function Header() {
  return (
    <header className="pointer-events-none absolute left-3 top-3 z-30 lg:left-4 lg:top-4">
      <div className="panel pointer-events-auto flex items-center gap-3 py-2 pl-2.5 pr-3">
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <circle cx="15" cy="15" r="14" fill="#1b4660" />
          <path d="M9.5 9.8c2.4-1.6 5.2.3 7.6 2.2 2.6 2 4.6 4.6 3.7 7.3-.9 2.6-4.2 2.4-6 .6-1.5-1.5-2-3.6-3.7-4.7-1.8-1.2-3.8-3.7-1.6-5.4Z" fill="#c9d4d8" />
          <circle cx="20.5" cy="10" r="3.4" fill="#7fbe3c" />
        </svg>
        <div className="leading-none">
          <p className="text-[17px] font-bold tracking-[-0.015em]">AlgaWatch</p>
          <PlacePicker />
        </div>
        <DataBadge />
      </div>
    </header>
  );
}
