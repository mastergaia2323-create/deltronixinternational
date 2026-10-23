# Deltronix International – Landing page

Landing page de venda consultiva dos bisturis elétricos (unidades eletrocirúrgicas) Deltronix, servida por um Cloudflare Worker (`deltronixinternational`). O deploy é disparado por push na `main`.

## Estrutura

- `public/index.html` – landing page (HTML/CSS/JS sem dependências)
- `public/assets/img/` – imagens e logotipo otimizados (WebP)
- `src/index.js` – Worker: serve a página e recebe os leads em `POST /api/lead`
- `schema.sql` – tabela `leads` do banco D1 `deltronix-leads`
- `wrangler.jsonc` – configuração do Worker (assets + binding D1 `DB`)

## CRM (`/admin`)

Todo lead enviado pelo formulário entra automaticamente no CRM em **`/admin`**, na etapa **Novo**.

- **Pipeline (Kanban):** Novo → Contatado → Qualificado → Proposta enviada → Negociação → Ganho / Perdido. Arraste os cards entre colunas.
- **Lista:** tabela ordenável com todos os campos.
- **Relatórios:** funil, leads por semana, por linha, país, perfil, prazo, origem (UTM), campanha e tipo de estabelecimento.
- **Ficha do lead:** dados completos, botões de WhatsApp/e-mail/ligar, responsável, valor estimado (USD), data do próximo follow-up e histórico de atividades (notas, ligações, reuniões; mudanças de etapa são registradas automaticamente).
- **Temperatura (Quente/Morno/Frio):** pontuação automática pelo prazo de compra, quantidade, perfil e tipo de estabelecimento.
- Busca, filtros, exportação CSV e atualização automática a cada 60 s (avisa quando chega lead novo).

**Login:** por enquanto o painel é aberto. Para proteger, crie o secret `ADMIN_PASSWORD` no Worker (Settings → Variables and Secrets); o navegador passará a pedir usuário `admin` + essa senha.

## Leads

Cada envio do formulário é salvo no D1 `deltronix-leads` (tabela `leads`), incluindo UTMs, referrer e país do visitante.

- **Ver no painel:** Cloudflare → Storage & Databases → D1 → `deltronix-leads` → Console: `SELECT * FROM leads ORDER BY id DESC;`
- **Exportar CSV:** defina o secret `ADMIN_TOKEN` no Worker e acesse `/api/leads.csv?token=SEU_TOKEN`.
- **Notificação / CRM:** defina o secret `LEAD_WEBHOOK_URL` (Zapier, Make, n8n, Slack, HubSpot…) e cada lead é enviado em JSON para essa URL.

## Rastreamento

A página publica eventos em `window.dataLayer` (`cta_click`, `lead_step_1`, `selector_cta`, `generate_lead`). Basta adicionar o Google Tag Manager / Meta Pixel no `<head>` para usá-los como conversão.

## Desenvolvimento local

```bash
npm install
npx wrangler d1 execute deltronix-leads --local --file=schema.sql
npx wrangler dev
```
