// A compact time chart for one series at a farm, aligned with the timeline.

import { useId, useMemo, useState } from 'react';
import { TIMELINE_END_H, TIMELINE_START_H } from '../config';
import { frameOfHour, NOW_FRAME } from '../sim/risk';
import { formatShortDay, formatWhen, localHour, timeAt } from './format';

interface Props {
  label: string;
  values: Float32Array;
  band?: { lo: Float32Array; hi: Float32Array };
  color: string;
  yMax: number;
  yTicks: number[];
  unit: string;
  decimals?: number;
  threshold?: { value: number; label: string };
  zoneBelow?: { value: number; label: string };
  hour: number;
  now: Date;
  onScrub: (hour: number) => void;
}

const W = 352;
const H = 136;
const M = { l: 30, r: 10, t: 12, b: 22 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const SPAN = TIMELINE_END_H - TIMELINE_START_H;

const x = (h: number) => M.l + ((h - TIMELINE_START_H) / SPAN) * PW;

export function TimeChart(props: Props) {
  const { values, band, color, yMax, yTicks, unit, decimals = 0, threshold, zoneBelow, hour, now, onScrub } = props;
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const y = (v: number) => M.t + (1 - Math.min(v, yMax) / yMax) * PH;

  const { line, area, days } = useMemo(() => {
    let d = '';
    for (let f = 0; f < values.length; f++) d += `${f ? 'L' : 'M'}${x(f + TIMELINE_START_H).toFixed(1)},${y(values[f]).toFixed(1)}`;
    let a = '';
    if (band) {
      const pts: string[] = [];
      for (let f = NOW_FRAME; f < values.length; f++) pts.push(`${x(f + TIMELINE_START_H).toFixed(1)},${y(band.hi[f]).toFixed(1)}`);
      for (let f = values.length - 1; f >= NOW_FRAME; f--) pts.push(`${x(f + TIMELINE_START_H).toFixed(1)},${y(band.lo[f]).toFixed(1)}`);
      a = `M${pts.join('L')}Z`;
    }
    const ds: { h: number; label: string }[] = [];
    for (let h = TIMELINE_START_H; h <= TIMELINE_END_H; h++) {
      if (localHour(timeAt(now, h)) === 0 && h < TIMELINE_END_H - 8) ds.push({ h, label: formatShortDay(timeAt(now, h)) });
    }
    return { line: d, area: a, days: ds };
  }, [values, band, yMax, now]);

  const at = (h: number) => values[Math.min(values.length - 1, Math.max(0, frameOfHour(h)))];
  const fmt = (v: number) => v.toFixed(decimals);
  const cursorH = Math.round(hour);
  const tipLeft = Math.min(W - 170, Math.max(0, x(hover ?? cursorH) - 70));

  const hourFromEvent = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    return Math.round(TIMELINE_START_H + fx * SPAN);
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full overflow-visible"
        role="img"
        aria-label={`${props.label}. At the selected hour: ${fmt(at(cursorH))} ${unit}.`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={M.l} y={M.t - 2} width={PW} height={PH + 4} />
          </clipPath>
        </defs>
        <rect x={x(0)} y={M.t} width={x(TIMELINE_END_H) - x(0)} height={PH} fill="#dfe7ea" opacity={0.45} />
        {zoneBelow && (
          <>
            <rect x={M.l} y={y(zoneBelow.value)} width={PW} height={M.t + PH - y(zoneBelow.value)} fill="#d03b3b" opacity={0.08} />
            <text x={M.l + 4} y={M.t + PH - 4} className="fill-ink-2 text-[10px]">
              {zoneBelow.label}
            </text>
          </>
        )}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={M.l + PW} y1={y(t)} y2={y(t)} stroke="#d9e1e4" strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {days.map((d) => (
          <g key={d.h}>
            <line x1={x(d.h)} x2={x(d.h)} y1={M.t + PH} y2={M.t + PH + 4} stroke="#9aa8ae" />
            <text x={x(d.h) + 3} y={H - 6} className="fill-ink-3 text-[10px]">
              {d.label}
            </text>
          </g>
        ))}
        {threshold && (
          <>
            <line
              x1={M.l}
              x2={M.l + PW}
              y1={y(threshold.value)}
              y2={y(threshold.value)}
              stroke="#46555d"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text x={M.l + 4} y={y(threshold.value) - 4} className="fill-ink-2 text-[10px]">
              {threshold.label}
            </text>
          </>
        )}
        <g clipPath={`url(#${clipId})`}>
          {area && <path d={area} fill={color} opacity={0.16} />}
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </g>
        <line x1={x(0)} x2={x(0)} y1={M.t - 2} y2={M.t + PH} stroke="#46555d" strokeWidth={1} />
        <text x={x(0) + 3} y={M.t + 7} className="fill-ink-2 text-[10px]">
          Now
        </text>
        <line x1={x(cursorH)} x2={x(cursorH)} y1={M.t} y2={M.t + PH} stroke="#1e2a30" strokeWidth={1.5} />
        <circle cx={x(cursorH)} cy={y(at(cursorH))} r={4} fill={color} stroke="#f7f9f9" strokeWidth={2} />
        {hover !== null && hover !== cursorH && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + PH} stroke="#63727a" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(at(hover))} r={4} fill={color} stroke="#f7f9f9" strokeWidth={2} />
          </>
        )}
        <rect
          x={M.l}
          y={0}
          width={PW}
          height={H}
          fill="transparent"
          className="cursor-crosshair"
          onPointerMove={(e) => setHover(hourFromEvent(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onScrub(hourFromEvent(e))}
        />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg bg-white/95 px-2 py-1 text-xs shadow-[0_0_0_1px_rgb(30_42_48/0.12),0_8px_20px_-12px_rgb(30_42_48/0.6)]"
          style={{ left: `${(tipLeft / W) * 100}%`, transform: 'translateY(-90%)' }}
        >
          <span className="font-semibold tabular-nums text-ink">
            {fmt(at(hover))} {unit}
          </span>
          {band && hover > 0 && (
            <span className="text-ink-2">
              {' '}
              (range {fmt(band.lo[frameOfHour(hover)])} to {fmt(band.hi[frameOfHour(hover)])})
            </span>
          )}
          <span className="block text-ink-2">{formatWhen(timeAt(now, hover))}</span>
        </div>
      )}
    </div>
  );
}
