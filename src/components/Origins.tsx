import type { AreaProps, Meta } from '../lib/metrics';
import { fmtInt, fmtPct } from '../lib/metrics';

// Categorical slots (fixed order) for the five continents; every segment is also labelled in the legend.
const CONTINENT_COLORS: Record<string, string> = { 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#eda100', 5: '#e87ba4' };

interface Props {
  area: AreaProps;
  meta: Meta;
  /** Show the "×N vs Portugal" comparison (off when the area is Portugal itself). */
  compare?: boolean;
}

/** Where the foreign residents come from: census 2021 by country, and 2023 residence requests by continent. */
export default function Origins({ area, meta, compare = true }: Props) {
  const nat = meta.national;
  const o21 = Object.entries(area.o21 ?? {}).sort((a, b) => b[1] - a[1]);
  const est = area.est21 ?? 0;
  const top = o21.slice(0, 10);
  const max = top[0]?.[1] ?? 1;
  const natShare = (c: string) => (nat.o21?.[c] ?? 0) / (nat.est21 || 1);

  const pc = Object.entries(area.pc ?? {}).filter(([, v]) => v > 0);
  const pcTotal = pc.reduce((a, [, v]) => a + v, 0);
  const p23 = Object.entries(area.p23 ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium">De onde vêm (Censos 2021)</h4>
        <p className="mb-2 text-[11px] text-[var(--ink-3)]">{fmtInt(est)} residentes estrangeiros · % do total de estrangeiros{compare ? ' · comparação com o peso nacional' : ''}</p>
        {!top.length && <p className="text-xs text-[var(--ink-3)]">Sem estrangeiros recenseados.</p>}
        <div className="space-y-1">
          {top.map(([c, n]) => {
            const share = est ? n / est : 0;
            const ratio = natShare(c) ? share / natShare(c) : 0;
            return (
              <div key={c} className="flex items-center gap-2 text-xs" title={`${meta.countries[c] ?? c}: ${fmtInt(n)} (${fmtPct(share * 100)})`}>
                <span className="w-24 shrink-0 truncate">{short(meta.countries[c] ?? c)}</span>
                <div className="h-3.5 flex-1"><div className="h-3.5 rounded-r bg-[#eb6834]" style={{ width: `${(n / max) * 100}%` }} /></div>
                <span className="w-11 shrink-0 text-right tabular-nums">{fmtPct(share * 100)}</span>
                {compare && <span className={`w-10 shrink-0 text-right text-[11px] tabular-nums ${ratio >= 2 ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>{ratio >= 1.5 ? `×${ratio.toFixed(ratio >= 10 ? 0 : 1).replace('.', ',')}` : ''}</span>}
              </div>
            );
          })}
        </div>
        {compare && <p className="mt-1 text-[11px] text-[var(--ink-3)]">×N: quantas vezes o peso dessa nacionalidade é maior do que em Portugal.</p>}
      </div>

      {pcTotal > 0 && (
        <div>
          <h4 className="text-sm font-medium">Novas chegadas: pedidos de residência em {meta.periods.pedidos}</h4>
          <p className="mb-2 text-[11px] text-[var(--ink-3)]">{fmtInt(area.pedidos ?? pcTotal)} pedidos, por continente de nacionalidade</p>
          <div className="flex h-4 gap-[2px] overflow-hidden rounded">
            {pc.map(([k, v]) => <div key={k} style={{ width: `${(v / pcTotal) * 100}%`, background: CONTINENT_COLORS[k] }} title={`${meta.continents[k]}: ${fmtPct((v / pcTotal) * 100)}`} />)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--ink-2)]">
            {pc.map(([k, v]) => (
              <span key={k} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CONTINENT_COLORS[k] }} />{meta.continents[k]} {fmtPct((v / pcTotal) * 100)}</span>
            ))}
          </div>
          {!!p23.length && (
            <p className="mt-1.5 text-[11px] text-[var(--ink-2)]">Principais: {p23.map(([c, n]) => `${short(meta.countries[c] ?? c)} ${fmtInt(n)}`).join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function short(name: string) {
  return name.replace('Reino Unido da Grã-Bretanha e Irlanda do Norte', 'Reino Unido').replace('Outros países - ', 'Outros · ')
    .replace(' (Reino dos)', '').replace(' (República Bolivariana da)', '').replace('Estados Unidos da América', 'EUA').replace('Federação da Rússia', 'Rússia');
}
