import { getRegion } from '../data/region';
import { useApp } from '../state/store';

/** Covers the screen only while the map loads; the forecast has its own progress in the farm list. */
export function LoadingOverlay() {
  const world = useApp((s) => s.world);
  const loadError = useApp((s) => s.loadError);

  if (world && !loadError) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-6">
      <div className="panel pointer-events-auto w-[min(360px,100%)] px-5 py-4" role="status" aria-live="polite">
        {loadError ? (
          <>
            <p className="text-[15px] font-bold">The map didn't load</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">{loadError}</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">{`Building the ${getRegion().name} relief`}</p>
            <p className="mt-1 text-[13px] text-ink-2">Loading terrain and water depth.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-[8%] rounded-full bg-lake" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
