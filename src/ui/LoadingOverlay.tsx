import { useApp } from '../state/store';

export function LoadingOverlay() {
  const world = useApp((s) => s.world);
  const sim = useApp((s) => s.sim);
  const progress = useApp((s) => s.simProgress);
  const loadError = useApp((s) => s.loadError);
  const simError = useApp((s) => s.simError);

  if (sim && !loadError) return null;
  const error = loadError ?? (sim ? null : simError);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-6">
      <div className="panel pointer-events-auto w-[min(360px,100%)] px-5 py-4" role="status" aria-live="polite">
        {error ? (
          <>
            <p className="text-[15px] font-bold">The lake model didn't load</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">{error}</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">{world ? 'Running the five-day forecast' : 'Building the Lake Toba relief'}</p>
            <p className="mt-1 text-[13px] text-ink-2">
              {world ? 'Eight forecast runs, each with a slightly different wind.' : 'Loading terrain and lake depth.'}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-lake transition-[width] duration-200"
                style={{ width: `${world ? 15 + progress * 85 : 8}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
