export type Level = 'distrito' | 'concelho' | 'freguesia';

export type Counts = Record<string, number>;

export interface AreaProps {
  id: string;
  name: string;
  parent?: string;
  pop21?: number;
  est21?: number;
  pct_est21?: number;
  o21?: Counts;
  empregados?: number;
  primario?: number;
  pct_primario?: number;
  res23?: number;
  n23?: Counts;
  populacao?: number;
  pct_res23?: number;
  densidade?: number;
  pedidos?: number;
  pc?: Counts;
  p23?: Counts;
  pct_pedidos_asia?: number;
  ganho_pt?: number;
  ganho_extra?: number;
  ganho_ue?: number;
  ganho_rel?: number;
  top21?: string;
  top21_pct?: number;
  ph?: number[][];
  nuts2?: string;
  [key: string]: unknown;
}

export interface Meta {
  built: string;
  national: AreaProps;
  countries: Record<string, string>;
  continents: Record<string, string>;
  histYears: number[];
  projYears: number[];
  proj: Record<string, { name: string; Baixo?: (number | null)[]; Central?: (number | null)[]; Alto?: (number | null)[] }>;
  periods: Record<string, string>;
  sources: Record<string, string>;
}

export interface Metric {
  key: string;
  label: string;
  short: string;
  format: (v: number) => string;
  help: string;
  period: string;
  value: (p: AreaProps, country: string) => number | undefined;
}

const nf = new Intl.NumberFormat('pt-PT');
const pct = (v: number) => `${v.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} %`;

export const METRICS: Metric[] = [
  { key: 'pct_res23', label: '% de residentes estrangeiros (2023)', short: '% estrangeiros 2023', format: pct, period: 'residentes',
    help: 'Estrangeiros com estatuto legal de residente em % da população estimada. Só por concelho (nas freguesias vê-se o concelho).',
    value: p => p.pct_res23 },
  { key: 'pct_est21', label: '% de estrangeiros na população (Censos 2021)', short: '% estrangeiros 2021', format: pct, period: 'censos',
    help: 'População de nacionalidade estrangeira recenseada em 2021. Disponível até à freguesia.',
    value: p => p.pct_est21 },
  { key: 'res23', label: 'Residentes estrangeiros (2023, n.º)', short: 'estrangeiros', format: v => nf.format(v), period: 'residentes',
    help: 'Número de estrangeiros com estatuto legal de residente.',
    value: p => p.res23 },
  { key: 'pct_primario', label: '% do emprego na agricultura, floresta e pesca', short: '% setor primário', format: pct, period: 'censos',
    help: 'Parte da população empregada que trabalha no setor primário (Censos 2021, local de residência).',
    value: p => p.pct_primario },
  { key: 'pct_pedidos_asia', label: '% dos novos pedidos de residência vindos da Ásia', short: '% pedidos Ásia', format: pct, period: 'pedidos',
    help: 'Parte dos pedidos de estatuto de residente feitos em 2023 por nacionais de países asiáticos (Índia, Nepal, Bangladesh, Paquistão…).',
    value: p => p.pct_pedidos_asia },
  { key: 'ganho_rel', label: 'Salário de estrangeiros extra-UE vs portugueses', short: 'salário extra-UE / PT', format: v => `${v} %`, period: 'ganho',
    help: 'Ganho mensal mediano dos trabalhadores por conta de outrem de nacionalidade extra-UE em % do dos portugueses (Quadros de Pessoal). 100 % = igual.',
    value: p => p.ganho_rel },
  { key: 'nac', label: 'Uma nacionalidade: % da população (Censos 2021)', short: '% da população', format: v => pct(v), period: 'censos',
    help: 'Residentes da nacionalidade escolhida em % da população recenseada em 2021.',
    value: (p, c) => (p.o21 && p.pop21 ? ((p.o21[c] ?? 0) / p.pop21) * 100 : undefined) },
];

export const metricByKey = Object.fromEntries(METRICS.map(m => [m.key, m]));

/** Countries offered in the nationality selector (census 2021 codes), in display order. */
export const FEATURED_COUNTRIES = ['BR', 'NP', 'IN', 'BD', 'PK', 'CN', 'UA', 'RO', 'MD', 'GB', 'DE', 'FR', 'NL', 'ES', 'IT', 'CV', 'AO', 'GW', 'ST', 'MZ', 'VE', 'US'];

export const LEVEL_LABEL: Record<Level, string> = { distrito: 'Distrito', concelho: 'Concelho', freguesia: 'Freguesia' };

export const ZOOM_CONCELHO = 7.4;
export const ZOOM_FREGUESIA = 9.8;
export const levelForZoom = (z: number): Level => (z < ZOOM_CONCELHO ? 'distrito' : z < ZOOM_FREGUESIA ? 'concelho' : 'freguesia');

export const fmtInt = (v: number) => nf.format(Math.round(v));
export const fmtPct = pct;
