# Deploy MCP Server Remotamente

Este guia explica como hospedar o MCP Server do Baserow em um servidor remoto.

## Opção 1: Cloudflare Workers (Recomendado - Gratuito)

### Pré-requisitos

1. Conta na Cloudflare (grátis): https://dash.cloudflare.com/sign-up
2. Node.js instalado

### Passo a Passo

```bash
# 1. Instalar Wrangler CLI
npm install -g wrangler

# 2. Login na Cloudflare
wrangler login

# 3. Navegar para a pasta workers
cd workers

# 4. Configurar secrets (variáveis de ambiente secretas)
wrangler secret put BASEROW_API_TOKEN
# Cole seu token quando solicitado

wrangler secret put TABLE_ID_MO
# Digite: 744439

wrangler secret put TABLE_ID_FG
# Digite: 744438

wrangler secret put TABLE_ID_PARTS_USAGE
# Digite: 744445

wrangler secret put TABLE_ID_FG_PARTS_MAPPING
# Digite: 744442

wrangler secret put TABLE_ID_RM_LOTS
# Digite: 744446

wrangler secret put TABLE_ID_LABEL_INVENTORY
# Digite: 745389

wrangler secret put TABLE_ID_PARTS
# Digite: 744797

# 5. Deploy
wrangler deploy
```

### Após o Deploy

Você receberá uma URL como:

```
https://baserow-mcp-server.seu-usuario.workers.dev
```

### Configurar Claude Desktop para usar o servidor remoto

Edite `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "baserow-remote": {
      "command": "npx",
      "args": ["mcp-remote", "https://baserow-mcp-server.novaeo.workers.dev"]
    }
  }
}
```

---

## Opção 2: Railway/Render/Fly.io

Para plataformas como Railway, Render ou Fly.io, você precisa de uma versão do servidor que rode como HTTP server padrão.

### Usando Express + SSE

Crie um arquivo `server-remote.ts`:

```typescript
import express from "express";
import { getMCPHandler } from "./src/mcp/handler.js";

const app = express();
app.use(express.json());

const handler = getMCPHandler();

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Tool call endpoint
app.post("/tool/:name", async (req, res) => {
  try {
    const result = await handler.handleToolCall(req.params.name, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});
```

---

## Opção 3: GitHub Codespaces

1. Crie um repositório no GitHub com seu código
2. Abra em Codespaces
3. Execute `npm run dev`
4. Use a URL do Codespace com port forwarding

---

## Opção 4: VPS (DigitalOcean, AWS, etc.)

```bash
# No servidor
git clone seu-repo
cd baserow-mcp-custom
npm install
npm run build

# Com PM2 para manter rodando
npm install -g pm2
pm2 start dist/server-remote.js --name mcp-baserow

# Com systemd
sudo nano /etc/systemd/system/mcp-baserow.service
```

Conteúdo do service:

```ini
[Unit]
Description=Baserow MCP Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/baserow-mcp-custom
ExecStart=/usr/bin/node dist/server-remote.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=BASEROW_API_TOKEN=seu-token

[Install]
WantedBy=multi-user.target
```

---

## Testando a Conexão

```bash
# Health check
curl https://seu-servidor.workers.dev/health

# Lista de tabelas (se tiver endpoint REST)
curl -X POST https://seu-servidor.workers.dev/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "list_tables", "params": {}}'
```

---

## Notas Importantes

1. **Segurança**: Em produção, adicione autenticação (API key, JWT, etc.)
2. **Logs**: Configure logging para monitorar erros
3. **Rate Limiting**: Adicione limitação de requisições
4. **CORS**: Já configurado no worker, ajuste se necessário

---

## Limitações

- Cloudflare Workers tem limite de 10ms CPU time no plano grátis
- Para operações longas, considere Workers Paid ($5/mês) ou outra plataforma
- SSE tem limitações em alguns ambientes (use WebSocket se necessário)
