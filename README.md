# Controle de estoque na requisição (RTT)

Aplicação Next.js (App Router, TypeScript) que substitui o HTML único anterior. Mantém as duas telas originais:

- **Parâmetros de reposição**: ponto de pedido, máximo e necessidade prevista por almoxarifado, filtrados por projeto.
- **Requisição com saldo na tela**: análise do item, aprovação especial, SC em montagem e relatório em PDF.

## Como os dados chegam

Os dados ficam no servidor (Netlify Blobs; em desenvolvimento, na pasta `.data/`). Sem nada gravado, a aplicação usa `data/seed.json` (dados de 03/11/2026 do HTML original).

Há três formas de atualizar, todas pelo botão **Atualizar** no topo da página:

| Forma | Como funciona |
|---|---|
| **Excel** | Selecione os 5 arquivos `.xlsx`. O navegador os processa (Web Worker) e publica o resultado. |
| **Sistema (Protheus)** | O botão chama `POST /api/atualizar`, que busca o JSON em `SOURCE_URL` (consulta do consultor). |
| **Agendada** | `netlify/functions/agendada.mts` dispara a atualização às 07h, 12h e 17h (seg a sáb, horário de Brasília). |

O fluxo n8n do consultor também pode **empurrar** os dados: `PUT /api/dados` com o JSON (ou gzip) e o cabeçalho `Authorization: Bearer <ADMIN_TOKEN>`.

O formato aceito é o descrito em [docs/especificacao_dados_consultor.md](docs/especificacao_dados_consultor.md) ou o formato interno (`lib/types.ts`).

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
```

Variáveis de ambiente: copie `.env.example` para `.env.local`.

## Publicando (Netlify + GitHub)

Mesmo padrão do sistema de inventário: o site é ligado a este repositório e **cada push na `main` publica automaticamente** (build `npm run build`, definido em `netlify.toml`). O CI em `.github/workflows/ci.yml` roda tipos, lint e build.

- **Repositório privado:** `data/seed.json` contém dados internos da empresa.
- **Variáveis** (Netlify → Site configuration → Environment variables): `ADMIN_TOKEN`, `CRON_SECRET` e, quando o consultor entregar a consulta, `SOURCE_URL` (e `SOURCE_TOKEN`, se houver). Mudança de variável só vale no próximo deploy. Sem `ADMIN_TOKEN` nem `CRON_SECRET`, as gravações são recusadas em produção.
- **Créditos:** cada deploy de produção consome créditos; junte mudanças em um push só e desligue deploys de preview e de branch (*Build & deploy → Continuous deployment*).
- **Acesso ao site:** a Netlify não protege o site por padrão. Defina senha ou login Microsoft Entra antes de publicar dados reais.

## Estrutura

- `app/`: páginas e rotas de API (`/api/dados`, `/api/status`, `/api/atualizar`).
- `components/`: interface (cabeçalho com logo, painel de atualização, telas).
- `lib/calc.ts`: cálculo de ponto de pedido, máximo e necessidade (mesmas regras do HTML original).
- `lib/etl/`: conversão Excel → dados e dados normalizados → formato interno.
- `netlify/functions/`: atualização em segundo plano e agendador.
