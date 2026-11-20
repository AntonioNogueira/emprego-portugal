# Emprego Portugal

Quem trabalha no interior agrícola de Portugal: **de onde vêm os residentes estrangeiros** de cada concelho e freguesia.

Mapa coroplético (MapLibre) com dados oficiais do INE. O nível muda com o zoom:
**distrito → concelho → freguesia**. Um filtro isola os **concelhos agrícolas e do interior**
(emprego no setor primário ≥ X % e densidade ≤ Y hab/km², ajustáveis) e soma de onde vem a população estrangeira desse conjunto.

## Indicadores

| Indicador | Fonte INE (código) | Nível | Período |
|---|---|---|---|
| Residentes estrangeiros e % da população (11 nacionalidades + outros) | 0013219 + 0012918 | concelho | 2023 |
| Estrangeiros por país de nacionalidade (≈60 países: Nepal, Índia, Bangladesh, Paquistão…) | 0014632 (Censos 2021) | freguesia | 2021 |
| Novas chegadas: pedidos de estatuto de residente por país/continente | 0013193 | concelho | 2023 |
| % do emprego no setor primário (agricultura, floresta, pesca) | 0014636 (Censos 2021) | freguesia | 2021 |
| Densidade populacional | 0013189 | concelho | 2023 |
| Ganho mensal mediano por nacionalidade (portuguesa, UE, extra-UE) | 0013010 (Quadros de Pessoal) | concelho | 2024 |

Notas:
- **Distritos** somam os concelhos.
- Os dados de 2023 (residentes e pedidos) só existem por concelho; nas freguesias o mapa mostra o concelho por baixo.
- Os residentes legais de 2023 só detalham 11 nacionalidades; o detalhe por país vem dos Censos 2021 e dos pedidos de 2023.
- Por agora só o continente. Limites: CAOP (DGT, CC BY 4.0), versão anterior à reorganização de freguesias de 2025.

## Correr localmente

Requer Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

Actualizar os dados (descarrega do INE para `.cache/` e escreve `public/data/`):

```bash
rm -rf .cache && npm run data
```

## Publicar no Render

`render.yaml` define um site estático: Render → New → Blueprint → escolher este repositório. Sem chaves nem servidor.

## Estrutura

| Parte | Onde |
|---|---|
| Interface (React 19 + Tailwind 4), filtro agrícola, totais do grupo | `src/App.tsx` |
| "De onde vêm": países (Censos 2021) e continentes (pedidos 2023) | `src/components/Origins.tsx` |
| Mapa, camadas por nível de zoom | `src/components/Map.tsx` |
| Indicadores e textos | `src/lib/metrics.ts` |
| Pipeline de dados | `scripts/build-data.mjs`, `scripts/lib/ine.mjs`, `scripts/lib/geo.mjs` |
