// Builds public/data/*.geojson: boundaries (distrito → concelho → freguesia) joined with INE data on
// foreign residents, their nationalities, the weight of agriculture in employment and earnings by nationality.
// Run: npm run data   (downloads into .cache/, delete it to refresh)
import { rows, allPeriods, caopCode, num, index } from './lib/ine.mjs';
import { boundaries, write } from './lib/geo.mjs';

console.log('INE indicators');
const residents = await rows('0013219', { period: 'S7A2023' });          // estrangeiros com estatuto legal de residente × nacionalidade
const requests = await rows('0013193', { period: 'S7A2023', filters: { Dim3: 'T' } }); // pedidos de estatuto de residente × nacionalidade (novas chegadas)
const census = await rows('0014632', { filters: { Dim3: 'T', Dim4: 'T' } }); // Censos 2021 população × nacionalidade (detalhe por país)
const employment = await rows('0014636');                                // Censos 2021 população empregada × setor
const population = await rows('0012918', { period: 'S7A2023' });         // estimativas de população residente
const density = await rows('0013189', { period: 'S7A2023' });
const earnings = await rows('0013010', { period: 'S7A2024' });           // ganho mensal × nacionalidade × quartis (Quadros de Pessoal)
const requestsHistory = await allPeriods('0008627', { Dim3: 'T' });      // pedidos de estatuto de residente 2008–2023 × nacionalidade
const projection = await allPeriods('0014555');                         // projeções do saldo migratório 2025–2100 × NUTS II × cenário

// Census nationality codes that are aggregates, not countries.
const CENSUS_AGGREGATES = new Set(['T', 'PT', 'EST', '1', '2', '3', '4', '5', '1XG']);
const CONTINENTS = { 1: 'Europa', 2: 'África', 3: 'América', 4: 'Ásia', 5: 'Oceânia' };
const countryNames = {};

/** { concelho: Map(code → obj), freguesia: Map } of per-code counters. */
function bucket(rowsList, filter, key, value = r => num(r.valor)) {
  const out = { concelho: new Map(), freguesia: new Map() };
  for (const r of rowsList) {
    if (!filter(r)) continue;
    const c = caopCode(r.geocod);
    const v = value(r);
    if (!c || !v) continue;
    const o = out[c.level].get(c.code) ?? {};
    const k = key(r);
    o[k] = (o[k] ?? 0) + v;
    out[c.level].set(c.code, o);
  }
  return out;
}

const census21 = bucket(census.rows, r => !CENSUS_AGGREGATES.has(r.dim_5), r => { countryNames[r.dim_5] = r.dim_5_t; return r.dim_5; });
const censusTotals = bucket(census.rows, r => ['T', 'EST', '1', '2', '3', '4', '5'].includes(r.dim_5), r => r.dim_5);
const req = bucket(requests.rows, r => /^[A-Z]{2}$/.test(r.dim_4), r => { countryNames[r.dim_4] ??= r.dim_4_t; return r.dim_4; });
const reqTotals = bucket(requests.rows, r => r.dim_4 === 'T' || r.dim_4 in CONTINENTS, r => r.dim_4);
const res23 = bucket(residents.rows, () => true, r => r.dim_3_t === 'Total' ? 'T' : r.dim_3_t);
const sectors = bucket(employment.rows, r => r.dim_3_t === 'HM' && r.dim_5_t === 'Total', r => r.dim_4_t);
const pop = index(population.rows, r => r.dim_3_t === 'HM' && r.dim_4_t === 'Total');
const dens = index(density.rows);
const earn = bucket(earnings.rows, r => r.dim_4_t === '2.º quartil', r => r.dim_3_t);

// Requests per year and continent: [total, Europa, África, América, Ásia, Oceânia] for each year.
const HIST_KEYS = ['T', '1', '2', '3', '4', '5'];
const HIST_YEARS = Object.keys(requestsHistory);
const hist = new Map(); // DTMN or 'PT' → number[][]
HIST_YEARS.forEach((year, yi) => {
  for (const r of requestsHistory[year]) {
    const k = HIST_KEYS.indexOf(r.dim_4);
    if (k < 0) continue;
    const id = r.geocod === 'PT' ? 'PT' : r.geocod.length === 7 ? r.geocod.slice(3) : null;
    if (!id) continue;
    if (!hist.has(id)) hist.set(id, HIST_YEARS.map(() => HIST_KEYS.map(() => 0)));
    hist.get(id)[yi][k] = num(r.valor) ?? 0;
  }
});

// NUTS II (2024) of each concelho, to show its region's migration projection.
const nuts2 = new Map(residents.rows.filter(r => r.geocod.length === 7).map(r => [r.geocod.slice(3), r.geocod.slice(0, 2)]));
const PROJ_YEARS = Object.keys(projection).filter(y => +y <= 2050);
const proj = {};
PROJ_YEARS.forEach((year, yi) => {
  for (const r of projection[year]) {
    if (r.dim_3_t === 'Sem migrações') continue; // zero by definition
    proj[r.geocod] ??= { name: r.geodsg };
    (proj[r.geocod][r.dim_3_t] ??= PROJ_YEARS.map(() => null))[yi] = num(r.valor);
  }
});

function fill(p, level) {
  const id = p.id;
  const c21 = census21[level].get(id);
  const ct = censusTotals[level].get(id);
  if (ct) {
    p.pop21 = ct.T; p.est21 = ct.EST ?? 0;
    p.pct_est21 = ct.T ? round(p.est21 / ct.T * 100, 2) : undefined;
  }
  if (c21) p.o21 = c21;
  const s = sectors[level].get(id);
  if (s) { p.empregados = s.Total; p.primario = s['Setor primário'] ?? 0; }
  if (level === 'concelho') {
    const r = res23.concelho.get(id);
    if (r) { p.res23 = r.T; p.n23 = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'T')); }
    p.populacao = pop.concelho.get(id);
    p.densidade = dens.concelho.get(id);
    const q = reqTotals.concelho.get(id);
    if (q) { p.pedidos = q.T; p.pc = Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'T')); }
    const qc = req.concelho.get(id);
    if (qc) p.p23 = qc;
    if (hist.has(id)) p.ph = hist.get(id);
    if (nuts2.has(id)) p.nuts2 = nuts2.get(id);
    const e = earn.concelho.get(id);
    if (e) { p.ganho_pt = e.Portuguesa; p.ganho_extra = e['Estrangeira extra UE (27)']; p.ganho_ue = e['Estrangeira intra UE (27)']; p.ganho = e.Total; }
  }
  derive(p);
}

function derive(p) {
  if (p.empregados) p.pct_primario = round(p.primario / p.empregados * 100, 1);
  if (p.res23 != null && p.populacao) p.pct_res23 = round(p.res23 / p.populacao * 100, 2);
  if (p.pedidos && p.pc) p.pct_pedidos_asia = round((p.pc[4] ?? 0) / p.pedidos * 100, 1);
  if (p.ganho_extra && p.ganho_pt) p.ganho_rel = round(p.ganho_extra / p.ganho_pt * 100, 0);
  if (p.o21) {
    const [code, n] = Object.entries(p.o21).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (code && p.est21) { p.top21 = code; p.top21_pct = round(n / p.est21 * 100, 0); }
  }
  for (const k of Object.keys(p)) if (p[k] == null || Number.isNaN(p[k])) delete p[k];
}
function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }

const addObj = (a = {}, b = {}) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] ?? 0) + v; return a; };

function aggregateDistricts(distritos, concelhos) {
  for (const d of distritos.features) {
    const p = d.properties;
    const kids = concelhos.features.map(f => f.properties).filter(c => c.parent === p.id);
    for (const k of ['pop21', 'est21', 'empregados', 'primario', 'res23', 'populacao', 'pedidos']) {
      const s = kids.reduce((a, c) => a + (c[k] ?? 0), 0);
      if (s) p[k] = s;
    }
    const ph = kids.filter(c => c.ph).map(c => c.ph);
    if (ph.length) p.ph = ph[0].map((year, yi) => year.map((_, k) => ph.reduce((a, c) => a + c[yi][k], 0)));
    for (const k of ['o21', 'n23', 'pc', 'p23']) {
      const s = kids.reduce((a, c) => addObj(a, c[k]), {});
      if (Object.keys(s).length) p[k] = s;
    }
    if (p.pop21) p.pct_est21 = round(p.est21 / p.pop21 * 100, 2);
    p.concelhos = kids.length;
    derive(p);
  }
}

console.log('Boundaries');
const geo = await boundaries();
for (const f of geo.concelho.features) fill(f.properties, 'concelho');
for (const f of geo.freguesia.features) fill(f.properties, 'freguesia');
aggregateDistricts(geo.distrito, geo.concelho);

// Portugal (mainland + islands) totals from the INE "PT" rows.
const pick = (list, f) => list.filter(r => r.geocod === 'PT' && f(r));
const national = { o21: {}, pc: {}, p23: {}, n23: {} };
for (const r of pick(census.rows, r => !CENSUS_AGGREGATES.has(r.dim_5))) national.o21[r.dim_5] = num(r.valor);
for (const r of pick(census.rows, r => r.dim_5 === 'T' || r.dim_5 === 'EST')) national[r.dim_5 === 'T' ? 'pop21' : 'est21'] = num(r.valor);
for (const r of pick(requests.rows, r => r.dim_4 in CONTINENTS)) national.pc[r.dim_4] = num(r.valor);
for (const r of pick(requests.rows, r => /^[A-Z]{2}$/.test(r.dim_4))) national.p23[r.dim_4] = num(r.valor);
for (const r of pick(requests.rows, r => r.dim_4 === 'T')) national.pedidos = num(r.valor);
for (const r of pick(residents.rows, () => true)) { if (r.dim_3_t === 'Total') national.res23 = num(r.valor); else national.n23[r.dim_3_t] = num(r.valor); }
for (const r of pick(population.rows, r => r.dim_3_t === 'HM' && r.dim_4_t === 'Total')) national.populacao = num(r.valor);
for (const r of pick(employment.rows, r => r.dim_3_t === 'HM' && r.dim_5_t === 'Total')) {
  if (r.dim_4_t === 'Total') national.empregados = num(r.valor);
  if (r.dim_4_t === 'Setor primário') national.primario = num(r.valor);
}
for (const r of pick(earnings.rows, r => r.dim_4_t === '2.º quartil')) {
  const k = { Portuguesa: 'ganho_pt', 'Estrangeira extra UE (27)': 'ganho_extra', 'Estrangeira intra UE (27)': 'ganho_ue', Total: 'ganho' }[r.dim_3_t];
  if (k) national[k] = num(r.valor);
}
national.ph = hist.get('PT');
national.pct_est21 = round(national.est21 / national.pop21 * 100, 2);
derive(national);

console.log('Writing');
for (const level of ['distrito', 'concelho', 'freguesia']) write(`public/data/${level}.geojson`, geo[level]);
write('public/data/meta.json', {
  built: new Date().toISOString().slice(0, 10),
  national,
  countries: countryNames,
  continents: CONTINENTS,
  histYears: HIST_YEARS.map(Number),
  projYears: PROJ_YEARS.map(Number),
  proj,
  periods: { censos: census.period, residentes: residents.period, pedidos: requests.period, ganho: earnings.period, populacao: population.period, historico: `${HIST_YEARS[0]}–${HIST_YEARS.at(-1)}`, projecao: `${PROJ_YEARS[0]}–${PROJ_YEARS.at(-1)}` },
  sources: { censos: '0014632', setor: '0014636', residentes: '0013219', pedidos: '0013193', ganho: '0013010', populacao: '0012918', densidade: '0013189', historico: '0008627', projecao: '0014555' },
});
const covered = (level, k) => geo[level].features.filter(f => f.properties[k] != null).length + '/' + geo[level].features.length;
console.log(`Coverage: concelhos %est21 ${covered('concelho', 'pct_est21')}, res23 ${covered('concelho', 'res23')}, freguesias %est21 ${covered('freguesia', 'pct_est21')}, primário ${covered('freguesia', 'pct_primario')}`);
