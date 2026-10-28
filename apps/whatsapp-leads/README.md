# WhatsApp Leads

Painel para **monitorar leads e conversar com eles pelo seu WhatsApp**, usando a
[API oficial do WhatsApp Business (Cloud API da Meta)](https://developers.facebook.com/docs/whatsapp/cloud-api).

- 📥 **Caixa de entrada ao vivo**: as mensagens chegam pelo webhook e aparecem na hora (com notificação no navegador).
- 👤 **Leads automáticos**: quem chama seu número vira lead; formulários de sites enviam leads por `POST /api/intake`; também dá para cadastrar à mão ou importar CSV.
- 📊 **Indicadores**: novos, não lidas, aguardando resposta, convertidos, enviadas/lidas/falhas nas últimas 24h.
- ✓✓ **Status de entrega**: enviado, entregue, lido ou falhou, para cada mensagem.
- 🤖 **Automação**: modelo de boas-vindas para novos leads e follow-up automático para quem não respondeu (com limite e horário comercial).
- 🔎 **Prospecção**: encontra empresas sem site na sua cidade e prepara a abordagem pelo WhatsApp do seu celular.
- 📣 **Envio em massa** de modelos aprovados, filtrando por status e tag.
- 🛡️ **Respeita as regras do WhatsApp**: janela de 24h, opt-in obrigatório para modelos e descadastro automático quando o lead manda "SAIR".

Não precisa de banco de dados nem de `npm install`: só **Node.js 20+**. Os dados ficam em `data/db.json`.

## Testar agora (modo simulação)

```bash
cd apps/whatsapp-leads
cp .env.example .env
npm start
```

Abra http://localhost:3000 (usuário `admin`; se `ADMIN_PASSWORD` estiver vazio, a senha aparece no terminal).
Sem as credenciais da Meta o app roda em **modo simulação**: tudo funciona, mas nenhuma mensagem sai de verdade.

Para simular uma mensagem recebida:

```bash
curl -X POST localhost:3000/webhook -H 'Content-Type: application/json' -d '{"entry":[{"changes":[{"value":{
  "contacts":[{"wa_id":"5511987654321","profile":{"name":"Maria"}}],
  "messages":[{"from":"5511987654321","id":"teste1","timestamp":"'$(date +%s)'","type":"text","text":{"body":"Oi, quero um orçamento"}}]}}]}]}'
```

## Conectar ao seu WhatsApp

1. Em [developers.facebook.com](https://developers.facebook.com/apps), crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Em *WhatsApp › Configuração da API*, adicione e verifique o **número da sua empresa**.
   > ⚠️ O número usado na Cloud API não pode estar ativo no app WhatsApp comum ao mesmo tempo. Use um número dedicado ou migre o número do WhatsApp Business.
3. Crie um **usuário do sistema** no Gerenciador de Negócios com a permissão `whatsapp_business_messaging` e gere um **token permanente**.
4. Preencha no `.env`:
   - `WHATSAPP_TOKEN`: o token permanente
   - `WHATSAPP_PHONE_NUMBER_ID`: o *ID do número de telefone* (não é o número em si)
   - `WHATSAPP_APP_SECRET`: *Configurações do app › Básico › Chave secreta do app*
   - `WHATSAPP_VERIFY_TOKEN`: qualquer texto que você inventar
5. Publique o app num endereço **HTTPS** (Render, Railway, Fly.io, uma VPS com Caddy…). Para testar localmente: `npx ngrok http 3000` ou `cloudflared tunnel --url http://localhost:3000`.
6. Em *WhatsApp › Configuração › Webhook*, use a URL `https://SEU-DOMINIO/webhook` e o mesmo `WHATSAPP_VERIFY_TOKEN`. Assine o campo **messages**.
7. Crie seus **modelos de mensagem** em *Gerenciador do WhatsApp › Modelos de mensagem* e aguarde a aprovação.

## Regras do WhatsApp que o app aplica

| Situação | O que pode enviar |
|---|---|
| O lead mandou mensagem nas últimas 24h | Texto livre |
| Fora dessa janela (ou primeiro contato) | Só **modelo aprovado**, e só para quem deu **opt-in** |
| O lead mandou `SAIR`, `PARAR`, `STOP`… | Nada. O lead fica marcado como descadastrado e recebe uma confirmação |

Quem chama seu número primeiro conta como opt-in. Leads importados ou vindos de formulário
precisam ter o consentimento marcado (coluna `optin` = `sim` no CSV, ou `consentimento=on` no formulário).
Enviar para quem não autorizou gera denúncias, derruba a qualidade do número e pode levar ao bloqueio.

## Prospecção: encontrar empresas e abordar pelo seu celular

Em **🔎 Prospecção** (`/prospeccao.html`) o app:

1. **Busca empresas da cidade** (padrão: Petrolina, PE) em vários ramos: restaurantes, clínicas, salões, academias, lojas, oficinas…
   - Com `GOOGLE_PLACES_API_KEY` usa o **Google Maps**: muitos resultados. A Google dá crédito mensal grátis, suficiente para algumas centenas de buscas.
   - Sem a chave usa o **OpenStreetMap**: grátis, mas com poucas empresas cadastradas.
2. **Filtra** e mantém só empresas **sem site** (bons clientes para quem vende sites), com **celular** e que ainda não estão cadastradas.
3. Monta a **mensagem padrão** personalizada com o nome de cada empresa: sites e sistemas web a partir de R$ 250. Dá para editar o texto na própria tela.
4. Mostra uma **fila**. Abra o painel **no navegador do celular** e toque em **"Abrir no WhatsApp e enviar"**: o WhatsApp abre com a mensagem pronta e você só toca em enviar. Depois volte e siga para a próxima. São uns 3 toques por empresa.
5. Controla o **limite diário** (`PROSPECT_DAILY_LIMIT`, padrão 25) e o andamento de cada empresa (enviado, respondeu, interessado, sem interesse, número inválido). Quem se interessar vira lead com **"Virou lead"**.

**Por que o último toque é seu:** o WhatsApp bane números que mandam mensagens automáticas em massa para quem nunca falou com você. A API oficial também proíbe esse envio. Mandar uma por uma pelo próprio aparelho, em pequeno volume e com texto personalizado, é o que mantém seu número ativo.

Dicas para não ser bloqueado:
- Comece com 10 a 20 contatos por dia e aumente aos poucos.
- Responda rápido a quem responder e respeite quem pedir para não ser contatado (marque como "Sem interesse").
- Muitas denúncias de "spam" derrubam o número. Mensagem curta, educada e com saída fácil reduz isso.

Para usar no celular, o app precisa estar publicado na internet (veja *Conectar ao seu WhatsApp*, passo 5) ou na mesma rede Wi-Fi do computador (`http://IP-DO-COMPUTADOR:3000`).

## Captura de leads dos sites

Defina `INTAKE_TOKEN` no `.env` e aponte o formulário do site para `/api/intake`:

```html
<form action="https://SEU-DOMINIO/api/intake?token=SEU_TOKEN" method="post">
  <input name="nome" placeholder="Seu nome">
  <input name="telefone" placeholder="WhatsApp" required>
  <label><input type="checkbox" name="consentimento" required> Aceito receber contato pelo WhatsApp</label>
  <button>Quero ser contactado</button>
</form>
```

Também aceita JSON (`fetch` com o cabeçalho `X-Intake-Token`). Campos: `nome`, `telefone`, `email`, `origem`, `tags`, `mensagem`, `consentimento`.
Se `WELCOME_TEMPLATE` estiver configurado, o lead recebe o modelo de boas-vindas na hora.

## Follow-up automático

Com `FOLLOWUP_TEMPLATE` configurado, a cada minuto o app procura leads com status *Novo* ou *Em contato*
que receberam mensagem, não respondem há `FOLLOWUP_AFTER_HOURS` horas e ainda não chegaram a
`FOLLOWUP_MAX` follow-ups. Os envios só acontecem entre `FOLLOWUP_START_HOUR` e `FOLLOWUP_END_HOUR`, no fuso `TIMEZONE`.
Assim que o lead responde, ele passa para *Respondeu* e sai da fila.

## API

Todas as rotas `/api/*` (menos `/api/intake`) exigem o usuário e a senha do painel (HTTP Basic).

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/webhook` | Verificação e eventos da Meta |
| POST | `/api/intake` | Captura de lead (token) |
| GET | `/api/leads?q=&status=` | Lista leads |
| POST | `/api/leads` | Cria lead |
| GET/PATCH/DELETE | `/api/leads/:id` | Detalhes e mensagens / atualiza / exclui |
| POST | `/api/leads/:id/messages` | `{ "text": "…" }` ou `{ "template": "nome", "language": "pt_BR", "params": ["…"] }` |
| POST | `/api/leads/import` | Corpo = CSV |
| POST | `/api/broadcast` | `{ "leadIds": [...], "template": "…", "params": ["{primeiro_nome}"] }` |
| GET | `/api/stats` | Indicadores |
| GET | `/api/prospecting` | Configuração da prospecção e contador do dia |
| PUT | `/api/prospecting/message` | `{ "message": "…" }` salva a mensagem padrão |
| POST | `/api/prospects/search` | `{ "city": "Petrolina, PE", "categories": [...], "onlyWithoutWebsite": true, "onlyMobile": true }` |
| GET | `/api/prospects?q=&status=` | Empresas encontradas (com link do WhatsApp) |
| PATCH/DELETE | `/api/prospects/:id` | Muda status / remove |
| POST | `/api/prospects/:id/contacted` · `/convert` | Marca como contatado / transforma em lead |
| GET | `/api/events` | Eventos em tempo real (SSE) |

## Testes

```bash
npm test
```
