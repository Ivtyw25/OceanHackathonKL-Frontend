import { useMemo, useState } from 'react';
import { RISK_ORDER } from '../sim/risk';
import { DATA_SOURCE, useApp } from '../state/store';
import { OUTLOOK_DAYS, outlookShort } from './format';
import { STATUS_LABEL, StatusIcon } from './StatusIcon';

export function FarmList() {
  const world = useApp((s) => s.world);
  const outlooks = useApp((s) => s.outlooks);
  const selected = useApp((s) => s.selectedFarmId);
  const selectFarm = useApp((s) => s.selectFarm);
  const [openOnSmall, setOpenOnSmall] = useState(false);

  const rows = useMemo(() => {
    if (!world || outlooks.length === 0) return [];
    return world.farms
      .map((farm, i) => ({ farm, outlook: outlooks[i] }))
      .sort(
        (a, b) =>
          RISK_ORDER[a.outlook.level] - RISK_ORDER[b.outlook.level] ||
          (a.outlook.etaHours ?? 999) - (b.outlook.etaHours ?? 999) ||
          b.outlook.chance - a.outlook.chance,
      );
  }, [world, outlooks]);

  if (!world) return null;
  if (rows.length === 0) return <NoForecast />;
  const needAction = rows.filter((r) => r.outlook.level === 'high' || r.outlook.level === 'severe').length;

  return (
    <nav
      aria-label="Farms"
      className="pointer-events-none absolute left-3 top-[4.6rem] z-20 flex max-h-[calc(100%-4.6rem-10.5rem)] w-[min(280px,calc(100%-1.5rem))] flex-col lg:left-4 lg:top-[5.1rem] lg:max-h-[calc(100%-5.1rem-10.25rem)]"
    >
      <div className="panel pointer-events-auto flex min-h-0 flex-col overflow-hidden">
        <button
          type="button"
          className="flex items-baseline justify-between gap-2 px-4 pb-2 pt-3 text-left lg:pointer-events-none"
          onClick={() => setOpenOnSmall((v) => !v)}
          aria-expanded={openOnSmall}
        >
          <span className="text-[15px] font-bold">Farms</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            {needAction > 0 ? `${needAction} need action` : 'All clear'}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={`lg:hidden ${openOnSmall ? 'rotate-180' : ''}`}>
              <path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </span>
        </button>
        <ul className={`${openOnSmall ? 'block' : 'hidden'} min-h-0 overflow-y-auto px-1.5 pb-1.5 lg:block`}>
          {rows.map(({ farm, outlook }) => {
            const isSelected = farm.id === selected;
            return (
              <li key={farm.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectFarm(farm.id);
                    setOpenOnSmall(false);
                  }}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`group grid w-full grid-cols-[16px_1fr_auto] items-start gap-x-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                    isSelected ? 'bg-white shadow-[0_0_0_1px_rgb(30_42_48/0.14)]' : 'hover:bg-white/60'
                  }`}
                >
                  <span className="pt-[3px]">
                    <StatusIcon level={outlook.level} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold leading-snug">{farm.name}</span>
                    <span className="block text-[13px] leading-snug text-ink-2">{outlookShort(outlook)}</span>
                  </span>
                  <span className="pt-[3px] text-xs font-semibold text-ink-2">{STATUS_LABEL[outlook.level]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className={`${openOnSmall ? 'block' : 'hidden'} px-4 pb-3 pt-1 text-xs text-ink-3 lg:block`}>
          Sorted by risk over the next {OUTLOOK_DAYS} days.
        </p>
      </div>
    </nav>
  );
}

/** Before the first forecast: the farms, and a button to run the forecast on demand. */
function NoForecast() {
  const world = useApp((s) => s.world);
  const running = useApp((s) => s.simRunning);
  const progress = useApp((s) => s.simProgress);
  const error = useApp((s) => s.simError);
  const wind = useApp((s) => s.forecastWind);
  const runForecast = useApp((s) => s.runForecast);
  const issueDate = useApp((s) => s.issueDate);
  const selectFarm = useApp((s) => s.selectFarm);
  if (!world) return null;

  return (
    <nav
      aria-label="Farms"
      className="pointer-events-none absolute left-3 top-[4.6rem] z-20 flex max-h-[calc(100%-4.6rem-10.5rem)] w-[min(280px,calc(100%-1.5rem))] flex-col lg:left-4 lg:top-[5.1rem] lg:max-h-[calc(100%-5.1rem-10.25rem)]"
    >
      <div className="panel pointer-events-auto flex min-h-0 flex-col overflow-hidden">
        <div className="px-4 pb-3 pt-3" role="status" aria-live="polite">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">Farms</span>
            <span className="text-xs text-ink-2">No forecast yet</span>
          </p>
          {running ? (
            <>
              <p className="mt-2 text-[13px] leading-snug text-ink-2">
                {DATA_SOURCE === 'backend' ? 'Loading observations and asking the forecast model.' : 'Running eight forecast runs, each with a slightly different wind.'}
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-lake transition-[width] duration-200"
                  style={{ width: `${Math.max(4, progress * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-snug text-ink-2">
                {error ? `The forecast didn't run: ${error}` : DATA_SOURCE === 'backend' && issueDate
                    ? `Five days ahead from ${issueDate}, for ${world.farms.length} farms.`
                    : `Five days ahead for ${world.farms.length} farms. Takes a few seconds.`}
              </p>
              <button
                type="button"
                onClick={() => void runForecast(wind)}
                className="mt-3 min-h-11 w-full rounded-lg bg-ink px-3.5 text-[14px] font-semibold text-white hover:bg-lake"
              >
                {error ? 'Try again' : 'Run 5-day forecast'}
              </button>
            </>
          )}
        </div>
        <ul className="hidden min-h-0 overflow-y-auto border-t border-ink/10 px-1.5 py-1.5 lg:block">
          {world.farms.map((farm) => (
            <li key={farm.id}>
              <button
                type="button"
                onClick={() => selectFarm(farm.id)}
                className="w-full rounded-[10px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/60"
              >
                <span className="block truncate text-[14px] font-semibold leading-snug">{farm.name}</span>
                <span className="block text-xs leading-snug text-ink-2">{farm.shore}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
