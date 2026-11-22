import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { Info, Sprout, X } from 'lucide-react';
import Map from './components/Map';
import Legend from './components/Legend';
import Origins from './components/Origins';
import { MigrationProjection, RequestsHistory } from './components/Trends';
import { colorStops } from './lib/colors';
import { FEATURED_COUNTRIES, LEVEL_LABEL, METRICS, fmtInt, fmtPct, metricByKey, type AreaProps, type Counts, type Level, type Meta } from './lib/metrics';

const LEVELS: Level[] = ['distrito', 'concelho', 'freguesia'];
type Data = Record<Level, FeatureCollection>;

export default function App() {
  const [raw, setRaw] = useState<Data | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('pct_res23');
  const [country, setCountry] = useState('NP');
  const [filterOn, setFilterOn] = useState(true);
  const [minPrimario, setMinPrimario] = useState(10);
  const [maxDensidade, setMaxDensidade] = useState(100);
  const [level, setLevel] = useState<Level>('distrito');
  const [scaleView, setScaleView] = useState(false);
  const [visible, setVisible] = useState<{ level: Level; values: number[] } | null>(null);
  const [selected, setSelected] = useState<{ level: Level; id: string } | null>(null);
  const [flyTo, setFlyTo] = useState<{ level: Level; id: string; n: number } | null>(null);

  useEffect(() => {
    Promise.all([...LEVELS.map(l => fetch(`data/${l}.geojson`).then(r => r.json())), fetch('data/meta.json').then(r => r.json())])
      .then(([d, c, f, m]) => { setRaw({ distrito: d, concelho: c, freguesia: f }); setMeta(m); })
      .catch(e => setError(String(e)));
  }, []);

  const byId = useMemo(() => {
    const out = {} as Record<Level, Record<string, AreaProps>>;
    for (const l of LEVELS) out[l] = Object.fromEntries((raw?.[l].features ?? []).map(f => [f.properties!.id, f.properties as AreaProps]));
    return out;
  }, [raw]);

  // "Interior agrícola": concelhos where farming weighs in employment and population density is low.
  const inFilter = useMemo(() => {
    const ok = (c?: AreaProps) => !!c && (c.pct_primario ?? 0) >= minPrimario && (c.densidade ?? Infinity) <= maxDensidade;
    return (l: Level, p: AreaProps) => !filterOn || l === 'distrito' || ok(l === 'concelho' ? p : byId.concelho[p.parent as string]);
  }, [filterOn, minPrimario, maxDensidade, byId]);

  const m = metricByKey[metric];
  const value = (p: AreaProps) => m.value(p, country);

  // Map data: only id/name/parent and the value to colour ("v").
  const data = useMemo(() => {
    if (!raw) return null;
    const out = {} as Data;
    for (const l of LEVELS) {
      out[l] = { type: 'FeatureCollection', features: raw[l].features.map(f => {
        const p = f.properties as AreaProps;
        const v = inFilter(l, p) ? value(p) : undefined;
        return { type: 'Feature', geometry: f.geometry, properties: { id: p.id, name: p.name, ...(v != null && Number.isFinite(v) ? { v } : {}) } };
      }) };
    }
    return out;
  }, [raw, metric, country, inFilter]);

  const breaks = useMemo(() => {
    const out = { distrito: [], concelho: [], freguesia: [] } as Record<Level, number[]>;
    if (!data) return out;
    for (const l of LEVELS) {
      const src = l === 'freguesia' ? 'concelho' : l;
      out[l] = colorStops(data[src].features.map(f => f.properties?.v).filter((v): v is number => typeof v === 'number'));
    }
    // "Área visível": refit the scale of the level on screen to the areas in view.
    if (scaleView && visible && visible.values.length >= 3) out[visible.level] = colorStops(visible.values);
    return out;
  }, [data, scaleView, visible]);

  // Totals for the concelhos in the filter: the answer to "where do the people in farming areas come from?"
  const group = useMemo(() => {
    if (!raw || !filterOn) return null;
    const kids = raw.concelho.features.map(f => f.properties as AreaProps).filter(p => inFilter('concelho', p));
    const sum = (k: keyof AreaProps) => kids.reduce((a, c) => a + ((c[k] as number) ?? 0), 0);
    const add = (k: 'o21' | 'pc' | 'p23') => kids.reduce((acc: Counts, c) => { for (const [x, v] of Object.entries(c[k] ?? {})) acc[x] = (acc[x] ?? 0) + v; return acc; }, {});
    const g: AreaProps = { id: 'grupo', name: 'Concelhos agrícolas e de baixa densidade', est21: sum('est21'), pop21: sum('pop21'), res23: sum('res23'), populacao: sum('populacao'),
      empregados: sum('empregados'), primario: sum('primario'), pedidos: sum('pedidos'), o21: add('o21'), pc: add('pc'), p23: add('p23') };
    const ph = kids.filter(c => c.ph).map(c => c.ph!);
    if (ph.length) g.ph = ph[0].map((yr, yi) => yr.map((_, k) => ph.reduce((a, c) => a + c[yi][k], 0)));
    return { n: kids.length, area: g };
  }, [raw, filterOn, inFilter]);

  const ranking = useMemo(() => {
    if (!raw) return [];
    return raw[level].features.map(f => f.properties as AreaProps)
      .filter(p => inFilter(level, p) && Number.isFinite(value(p) as number))
      .sort((a, b) => (value(b) as number) - (value(a) as number));
  }, [raw, level, metric, country, inFilter]);

  const sel = selected ? byId[selected.level]?.[selected.id] : null;
  const parents = (() => {
    if (!selected || !sel) return [];
    if (selected.level === 'freguesia') {
      const c = byId.concelho[sel.parent as string];
      return [c?.name, c && byId.distrito[c.parent as string]?.name].filter(Boolean) as string[];
    }
    if (selected.level === 'concelho') return [byId.distrito[sel.parent as string]?.name].filter(Boolean) as string[];
    return [];
  })();
  const pick = (l: Level, id: string) => { setSelected({ level: l, id }); setFlyTo({ level: l, id, n: Date.now() }); };
  const title = metric === 'nac' && meta ? `${meta.countries[country]}: % da população` : m.short;
  const nat = meta?.national;

  return (
    <div className="flex h-full flex-col-reverse md:flex-row">
      <aside className="h-[52%] w-full shrink-0 overflow-y-auto border-[var(--line)] bg-[var(--surface)] md:h-full md:w-[420px] md:border-r">
        <div className="space-y-4 p-4">
          <header>
            <div className="flex items-center gap-2">
              <Sprout size={20} className="text-[#c9521f]" />
              <h1 className="text-xl font-semibold">Emprego Portugal</h1>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-2)]">Quem trabalha no interior agrícola: de onde vêm os residentes estrangeiros de cada concelho e freguesia.</p>
          </header>

          <div>
            <label htmlFor="metric" className="text-xs font-medium text-[var(--ink-2)]">Indicador no mapa</label>
            <select id="metric" value={metric} onChange={e => setMetric(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
              {METRICS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            {metric === 'nac' && meta && (
              <select aria-label="Nacionalidade" value={country} onChange={e => setCountry(e.target.value)} className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm">
                {FEATURED_COUNTRIES.filter(c => meta.countries[c]).map(c => <option key={c} value={c}>{meta.countries[c]}</option>)}
              </select>
            )}
            <p className="mt-1.5 flex gap-1.5 text-xs text-[var(--ink-2)]"><Info size={14} className="mt-px shrink-0" />{m.help}</p>
            {meta && <p className="mt-1 text-[11px] text-[var(--ink-3)]">Período: {meta.periods[m.period]} · Fonte: INE</p>}
          </div>

          <section className="rounded-xl border border-[var(--line)] bg-white p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={filterOn} onChange={e => setFilterOn(e.target.checked)} className="accent-[#c9521f]" />
              Só concelhos agrícolas e do interior
            </label>
            {filterOn && (
              <div className="mt-2 space-y-2 text-xs text-[var(--ink-2)]">
                <label className="block">Emprego no setor primário ≥ <strong className="text-[var(--ink)]">{minPrimario} %</strong> <span className="text-[var(--ink-3)]">(Portugal: {nat ? fmtPct(nat.pct_primario ?? 0) : '—'})</span>
                  <input type="range" min={0} max={30} step={1} value={minPrimario} onChange={e => setMinPrimario(+e.target.value)} className="mt-1 w-full accent-[#c9521f]" />
                </label>
                <label className="block">Densidade ≤ <strong className="text-[var(--ink)]">{maxDensidade} hab/km²</strong>
                  <input type="range" min={10} max={500} step={10} value={maxDensidade} onChange={e => setMaxDensidade(+e.target.value)} className="mt-1 w-full accent-[#c9521f]" />
                </label>
              </div>
            )}
          </section>

          {sel && meta && selected && (
            <section className="rounded-xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">{LEVEL_LABEL[selected.level]}{parents.length ? ` · ${parents.join(' · ')}` : ''}</div>
                  <h2 className="text-lg font-semibold leading-tight">{sel.name}</h2>
                </div>
                <button onClick={() => setSelected(null)} className="rounded p-1 text-[var(--ink-3)] hover:bg-black/5" aria-label="Fechar"><X size={16} /></button>
              </div>
              <Kpis area={sel} meta={meta} />
              <div className="mt-4"><Origins area={sel} meta={meta} /></div>
              <div className="mt-4"><RequestsHistory area={selected.level === 'freguesia' ? byId.concelho[sel.parent as string] ?? sel : sel} meta={meta} /></div>
              {selected.level === 'freguesia' && <p className="text-[11px] text-[var(--ink-3)]">Série do concelho (não há pedidos por freguesia).</p>}
              <div className="mt-4"><MigrationProjection region={(selected.level === 'freguesia' ? byId.concelho[sel.parent as string]?.nuts2 : sel.nuts2) ?? 'PT'} meta={meta} /></div>
            </section>
          )}

          {group && meta && (
            <section className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h2 className="text-base font-semibold leading-tight">{group.n} concelhos agrícolas e de baixa densidade</h2>
              <p className="text-[11px] text-[var(--ink-3)]">Setor primário ≥ {minPrimario} % · densidade ≤ {maxDensidade} hab/km² · somados</p>
              <Kpis area={group.area} meta={meta} />
              <div className="mt-4"><Origins area={group.area} meta={meta} /></div>
              <div className="mt-4"><RequestsHistory area={group.area} meta={meta} /></div>
            </section>
          )}

          {!filterOn && meta && nat && (
            <section className="rounded-xl border border-[var(--line)] bg-white p-4">
              <h2 className="text-base font-semibold">Portugal</h2>
              <Kpis area={nat} meta={meta} />
              <div className="mt-4"><Origins area={nat} meta={meta} compare={false} /></div>
              <div className="mt-4"><RequestsHistory area={nat} meta={meta} /></div>
              <div className="mt-4"><MigrationProjection region="PT" meta={meta} /></div>
            </section>
          )}

          {!!ranking.length && (
            <section>
              <h3 className="mb-1 text-sm font-medium">{LEVEL_LABEL[level]}s com valor mais alto</h3>
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">{ranking.length} {filterOn ? 'no filtro' : 'com dados'} · clique para ver no mapa</p>
              <ol className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] bg-white text-sm">
                {ranking.slice(0, 10).map((p, i) => (
                  <li key={p.id}>
                    <button onClick={() => pick(level, p.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-black/[0.03]">
                      <span className="w-5 text-xs tabular-nums text-[var(--ink-3)]">{i + 1}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="tabular-nums text-[var(--ink-2)]">{m.format(value(p) as number)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <footer className="pb-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Dados: INE — População estrangeira com estatuto legal de residente e pedidos de residência (SEF/AIMA), Censos 2021, estimativas de população,
            Quadros de Pessoal (MTSSS/GEP). Limites: CAOP (DGT). Só o continente por agora.
            {meta && <> Dados actualizados a {meta.built}.</>}
          </footer>
        </div>
      </aside>

      <main className="relative min-h-0 flex-1">
        {error && <div className="absolute inset-0 grid place-items-center text-sm text-red-700">Não foi possível carregar os dados: {error}</div>}
        {data && <Map data={data} metric="v" format={m.format} breaks={breaks} selected={selected} flyTo={flyTo} onSelect={setSelected} onLevel={setLevel} onVisible={(l, values) => setVisible({ level: l, values })} />}
        <div className="absolute top-3 left-3 flex overflow-hidden rounded-lg bg-white/95 text-xs shadow-md ring-1 ring-black/5" role="group" aria-label="Escala de cores">
          <span className="px-2.5 py-1.5 text-[var(--ink-2)]">Escala</span>
          {([['Portugal', false], ['Área visível', true]] as const).map(([label, v]) => (
            <button key={label} onClick={() => setScaleView(v)} aria-pressed={scaleView === v}
              className={`px-2.5 py-1.5 font-medium ${scaleView === v ? 'bg-[var(--ink)] text-white' : 'hover:bg-black/5'}`}>{label}</button>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-6 left-3">
          <Legend metric={m} title={title} breaks={breaks[level]} level={level} fitted={scaleView && visible?.level === level} />
        </div>
      </main>
    </div>
  );
}

function Kpis({ area, meta }: { area: AreaProps; meta: Meta }) {
  const pctRes = area.res23 != null && area.populacao ? (area.res23 / area.populacao) * 100 : null;
  const pctPrim = area.empregados ? ((area.primario ?? 0) / area.empregados) * 100 : null;
  const nat = meta.national;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Kpi label="Residentes estrangeiros 2023" value={area.res23 != null ? fmtInt(area.res23) : '—'} note={pctRes != null ? `${fmtPct(pctRes)} da população (PT ${fmtPct(nat.pct_res23 ?? 0)})` : null} />
      <Kpi label="Estrangeiros Censos 2021" value={area.est21 != null ? fmtInt(area.est21) : '—'} note={area.est21 != null && area.pop21 ? `${fmtPct((area.est21 / area.pop21) * 100)} da população` : null} />
      <Kpi label="Emprego no setor primário" value={pctPrim != null ? fmtPct(pctPrim) : '—'} note={area.primario != null ? `${fmtInt(area.primario)} pessoas (2021)` : null} />
      {area.ganho_extra != null
        ? <Kpi label="Salário mediano (mês)" value={`${fmtInt(area.ganho_extra)} €`} note={`extra-UE · portugueses ${area.ganho_pt != null ? fmtInt(area.ganho_pt) + ' €' : '—'}`} />
        : <Kpi label="Pedidos de residência 2023" value={area.pedidos != null ? fmtInt(area.pedidos) : '—'} />}
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="rounded-lg bg-[var(--surface)] p-2 ring-1 ring-[var(--line)]">
      <div className="text-[11px] leading-tight text-[var(--ink-2)]">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[11px] leading-tight text-[var(--ink-3)]">{note}</div>}
    </div>
  );
}
