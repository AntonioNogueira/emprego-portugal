import { useState } from 'react';
import type { AreaProps, Meta } from '../lib/metrics';
import { fmtInt } from '../lib/metrics';
import { CONTINENT_COLORS } from './Origins';

const W = 360;
const H = 150;
const PAD = { l: 40, r: 10, t: 10, b: 20 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p).find(m => m >= v)!;
}
const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} mil` : String(v));

/** Residence requests per year (2008–2023), stacked by continent of nationality. */
export function RequestsHistory({ area, meta }: { area: AreaProps; meta: Meta }) {
  const [hover, setHover] = useState<number | null>(null);
  const ph = area.ph as number[][] | undefined;
  if (!ph?.length) return null;
  const years = meta.histYears;
  const max = niceMax(Math.max(...ph.map(y => y[0])));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const bw = iw / years.length;
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const shown = hover ?? years.length - 1;
  const row = ph[shown];
  const first = ph.findIndex(r => r[0] > 0);
  const growth = first >= 0 && ph[first][0] ? ph[ph.length - 1][0] / ph[first][0] : null;

  return (
    <div>
      <h4 className="text-sm font-medium">Pedidos de residência por ano</h4>
      <p className="mb-1 text-[11px] text-[var(--ink-3)]">
        {years[0]}–{years.at(-1)} · por continente de nacionalidade{growth && growth >= 1.5 ? ` · ×${growth.toFixed(growth >= 10 ? 0 : 1).replace('.', ',')} desde ${years[first]}` : ''}
      </p>
      <div className="mb-1 h-4 text-[11px] tabular-nums text-[var(--ink-2)]">
        <strong className="text-[var(--ink)]">{years[shown]}</strong>: {fmtInt(row[0])} pedidos
        {row[0] > 0 && <> · Ásia {Math.round((row[4] / row[0]) * 100)} % · América {Math.round((row[3] / row[0]) * 100)} %</>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Pedidos de residência por ano e continente" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(max * f) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)">{compact(max * f)}</text>
          </g>
        ))}
        {ph.map((r, i) => {
          let acc = 0;
          const x = PAD.l + i * bw + 1;
          return (
            <g key={i} opacity={hover == null || hover === i ? 1 : 0.45}>
              {[1, 2, 3, 4, 5].map(k => {
                const v = r[k];
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={k} x={x} width={Math.max(bw - 2, 1)} y={y1} height={Math.max(y0 - y1 - 1, 0.5)} fill={CONTINENT_COLORS[k]} />;
              })}
              <rect x={PAD.l + i * bw} width={bw} y={PAD.t} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            </g>
          );
        })}
        {years.map((yr, i) => (i % 3 === 0 || i === years.length - 1) && (
          <text key={yr} x={PAD.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--ink-3)">{yr}</text>
        ))}
      </svg>
    </div>
  );
}

/** INE projection of the annual net migration (saldo migratório) for the area's NUTS II region. */
export function MigrationProjection({ region, meta }: { region: string; meta: Meta }) {
  const [hover, setHover] = useState<number | null>(null);
  const p = meta.proj?.[region];
  if (!p?.Central) return null;
  const years = meta.projYears;
  const all = [...p.Central, ...(p.Alto ?? []), ...(p.Baixo ?? [])].filter((v): v is number => v != null);
  const max = niceMax(Math.max(...all, 0));
  const dataMin = Math.min(0, ...all);
  // Small negative dips get room but no tick of their own (it would collide with the 0 label).
  const min = dataMin < -0.15 * max ? -niceMax(-dataMin) : dataMin * 1.15;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (i / (years.length - 1)) * iw;
  const y = (v: number) => PAD.t + ih - ((v - min) / (max - min)) * ih;
  const line = (vals: (number | null)[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`).join('');
  const band = p.Alto && p.Baixo
    ? `${line(p.Alto)}${[...p.Baixo].reverse().map((v, j) => `L${x(years.length - 1 - j).toFixed(1)},${y(v ?? 0).toFixed(1)}`).join('')}Z` : '';
  const shown = hover ?? 0;
  const ticks = dataMin < -0.15 * max ? [min, 0, max] : [0, max / 2, max];

  return (
    <div>
      <h4 className="text-sm font-medium">Previsão: saldo migratório anual · {p.name}</h4>
      <p className="mb-1 text-[11px] text-[var(--ink-3)]">Projeções do INE (2025–2100), cenários baixo, central e alto · mostra até {years.at(-1)}</p>
      <div className="mb-1 h-4 text-[11px] tabular-nums text-[var(--ink-2)]">
        <strong className="text-[var(--ink)]">{years[shown]}</strong>: central {fmtInt(p.Central[shown] ?? 0)}
        {p.Baixo && p.Alto && <> · intervalo {fmtInt(p.Baixo[shown] ?? 0)} a {fmtInt(p.Alto[shown] ?? 0)}</>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Projeção do saldo migratório, ${p.name}`} onMouseLeave={() => setHover(null)}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(years.length - 1, Math.round(((px - PAD.l) / iw) * (years.length - 1)))));
        }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--ink-3)' : 'var(--line)'} strokeWidth={1} />
            <text x={PAD.l - 4} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--ink-3)">{compact(v)}</text>
          </g>
        ))}
        {band && <path d={band} fill="#2a78d6" opacity={0.15} />}
        {p.Alto && <path d={line(p.Alto)} fill="none" stroke="#2a78d6" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
        {p.Baixo && <path d={line(p.Baixo)} fill="none" stroke="#2a78d6" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
        <path d={line(p.Central)} fill="none" stroke="#2a78d6" strokeWidth={2} />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--ink-3)" strokeWidth={1} />}
        <circle cx={x(shown)} cy={y(p.Central[shown] ?? 0)} r={3.5} fill="#2a78d6" stroke="var(--surface)" strokeWidth={2} />
        {p.Alto && <text x={W - PAD.r} y={y(p.Alto.at(-1) ?? 0) - 4} textAnchor="end" fontSize={9} fill="var(--ink-2)">alto</text>}
        <text x={W - PAD.r} y={y(p.Central.at(-1) ?? 0) - 4} textAnchor="end" fontSize={9} fill="var(--ink)">central</text>
        {p.Baixo && <text x={W - PAD.r} y={Math.min(y(p.Baixo.at(-1) ?? 0) + 11, PAD.t + ih - 2)} textAnchor="end" fontSize={9} fill="var(--ink-2)">baixo</text>}
        {[0, 5, 10, 15, 20, 25].filter(i => i < years.length).map(i => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--ink-3)">{years[i]}</text>
        ))}
      </svg>
      <p className="text-[11px] text-[var(--ink-3)]">O Orçamento do Estado 2027 não traz previsões de imigração nem de pedidos; esta é a projeção oficial do INE.</p>
    </div>
  );
}
