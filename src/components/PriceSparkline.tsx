import type { CurrencyCode } from '../types/shop';
import { formatPrice } from '../utils/pricing';

interface PriceSparklineProps {
  history: number[];
  currency: CurrencyCode;
  height?: number;
}

export function PriceSparkline({ history, currency, height = 88 }: PriceSparklineProps) {
  if (history.length < 2) return null;

  const width = 320;
  const padX = 10;
  const padY = 12;
  const minVal = Math.min(...history);
  const maxVal = Math.max(...history);
  const range = Math.max(1, maxVal - minVal);

  const points = history.map((val, idx) => {
    const x = padX + (idx / (history.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (val - minVal) / range) * (height - padY * 2);
    return { x, y, val };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - 4} L ${points[0].x.toFixed(1)} ${height - 4} Z`;
  const lastPt = points[points.length - 1];
  const avgVal = Math.round(history.reduce((s, v) => s + v, 0) / history.length);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>30-day price radar</span>
        <div className="flex items-center gap-3 tabular-nums font-mono">
          <span>Low {formatPrice(minVal, currency)}</span>
          <span aria-hidden="true">·</span>
          <span>Avg {formatPrice(avgVal, currency)}</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-700 font-medium">Now {formatPrice(lastPt.val, currency)}</span>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={`30-day price trend from ${formatPrice(history[0], currency)} to ${formatPrice(lastPt.val, currency)}`}
        >
          <defs>
            <linearGradient id="priceAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#priceAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={lastPt.x} cy={lastPt.y} r="4.5" fill="#059669" stroke="#ffffff" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}
