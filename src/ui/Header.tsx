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
          <p className="text-[17px] font-bold tracking-[-0.015em]">BloomWatch</p>
          <p className="mt-1 text-xs text-ink-2">Lake Toba, North Sumatra</p>
        </div>
        <span
          className="ml-1 rounded-md bg-status-watch/25 px-2 py-1 text-2xs font-semibold text-ink"
          title="Farms, buoys and forecasts in this prototype are simulated."
        >
          Demo<span className="hidden sm:inline"> data</span>
        </span>
      </div>
    </header>
  );
}
