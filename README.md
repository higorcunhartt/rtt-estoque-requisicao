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

## Login com MFA

Toda a aplicação exige login: **e-mail + senha + código de 6 dígitos enviado por e-mail**. Os dados (`/api/dados`, `/api/status`) só saem do servidor com sessão válida.

- **Usuários:** banco PostgreSQL próprio (Neon). `npm run migrate` cria as tabelas e o primeiro administrador (`ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`). Outros usuários: `USER_PASSWORD=... npm run usuario -- email@rttshop.com.br "Nome" user` (ou `admin`). 
- **Papéis:** `user` consulta e simula requisições. `gestor` (gestor de suprimentos) também atualiza os dados (Excel e botão do sistema), cria usuários comuns e ativa/desativa usuários comuns; não redefine senha de ninguém, não mexe em papéis nem em administradores. `admin` faz tudo, inclusive redefinir senhas e criar/promover gestores e administradores.
- **Máquinas** (n8n, agendador): continuam usando `ADMIN_TOKEN`/`CRON_SECRET` em cabeçalho, sem sessão.
- **Segurança:** senhas com bcrypt (custo 12); sessão em cookie `HttpOnly`, `Secure`, `SameSite=Strict` (prefixo `__Host-` em produção), 8 h, revogável no servidor (logout, troca de senha, desativação); código MFA de uso único, 10 min, 5 tentativas, guardado só como HMAC; limite de tentativas por IP, por conta e por código; respostas iguais para conta inexistente; verificação de `Origin` contra CSRF; trilha de auditoria (`audit_log`).
- **Usuários:** administradores usam a aba **Usuários** (criar, mudar papel, desativar, redefinir senha). Cada ação pede a sua senha de novo e derruba as sessões da conta afetada. **Ninguém vê nem envia senha**: ao criar a conta (ou ao redefinir), a pessoa recebe um link por e-mail (vale 24 h, uso único) e define a própria senha em `/definir-senha`; depois entra com senha + código por e-mail. Redefinir invalida a senha atual na hora. O comando `usuario` (senha provisória) fica só para emergências, como perder o acesso de todos os administradores.
- **Esqueci minha senha:** o login tem o link "Esqueci minha senha", que envia um link de 1 hora ao e-mail cadastrado (resposta igual para e-mails desconhecidos).
- **Local sem e-mail:** com `npm run dev` e sem SMTP, o código MFA aparece no terminal.
- Testes: `npm test` (login, MFA, revogação, limites e proteção das rotas, com PGlite em memória).

## Publicando (Netlify + GitHub)

Mesmo padrão do sistema de inventário: o site é ligado a este repositório e **cada push na `main` publica automaticamente** (build `npm run build`, definido em `netlify.toml`). O CI em `.github/workflows/ci.yml` roda tipos, lint e build.

- **Repositório privado:** `data/seed.json` contém dados internos da empresa.
- **Variáveis** (Netlify → Site configuration → Environment variables): `DATABASE_URL`, `JWT_SECRET`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM` (login), `ADMIN_TOKEN`, `CRON_SECRET` e, quando o consultor entregar a consulta, `SOURCE_URL` (e `SOURCE_TOKEN`, se houver). Mudança de variável só vale no próximo deploy. Sem `ADMIN_TOKEN` nem `CRON_SECRET`, as gravações são recusadas em produção.
- **Créditos:** cada deploy de produção consome créditos; junte mudanças em um push só e desligue deploys de preview e de branch (*Build & deploy → Continuous deployment*).
- **Acesso ao site:** protegido pelo login com MFA descrito acima.

## Estrutura

- `app/`: páginas e rotas de API (`/api/dados`, `/api/status`, `/api/atualizar`).
- `components/`: interface (cabeçalho com logo, painel de atualização, telas).
- `lib/calc.ts`: cálculo de ponto de pedido, máximo e necessidade (mesmas regras do HTML original).
- `lib/etl/`: conversão Excel → dados e dados normalizados → formato interno.
- `netlify/functions/`: atualização em segundo plano e agendador.
