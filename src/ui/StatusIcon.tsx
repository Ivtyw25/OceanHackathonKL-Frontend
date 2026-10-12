import { STATUS_COLORS } from '../scene/palette';
import type { RiskLevel } from '../sim/risk';

export const STATUS_LABEL: Record<RiskLevel, string> = {
  low: 'Low',
  watch: 'Watch',
  high: 'High',
  severe: 'Severe',
};

/** Each level has its own shape as well as its own colour, so it never relies on colour alone. */
export function StatusIcon({ level, size = 16 }: { level: RiskLevel; size?: number }) {
  const fill = STATUS_COLORS[level];
  const mark = level === 'low' ? null : (
    <>
      <rect x="7.1" y="4.4" width="1.8" height="5" rx="0.9" fill="#fff" />
      <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
    </>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      {level === 'low' && (
        <>
          <circle cx="8" cy="8" r="7" fill={fill} />
          <path d="M4.8 8.2 7 10.3l4.3-4.6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {level === 'watch' && <path d="M8 1.2 15.2 14H.8Z" fill={fill} stroke={fill} strokeLinejoin="round" strokeWidth="1" />}
      {level === 'high' && <path d="M8 .6 15.4 8 8 15.4.6 8Z" fill={fill} />}
      {level === 'severe' && <path d="M5.1.8h5.8l4.3 4.3v5.8l-4.3 4.3H5.1L.8 10.9V5.1Z" fill={fill} />}
      {level === 'watch' ? (
        <>
          <rect x="7.15" y="5.6" width="1.7" height="4.4" rx="0.85" fill="#1e2a30" />
          <circle cx="8" cy="11.9" r="0.95" fill="#1e2a30" />
        </>
      ) : (
        mark
      )}
    </svg>
  );
}
