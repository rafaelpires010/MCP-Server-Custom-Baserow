# Deploy MCP Server Remotamente

Este guia explica como hospedar o MCP Server do Baserow em um servidor remoto.

## Opção 1: Railway (Recomendado - Mais Simples)

Railway é uma plataforma fácil de usar que suporta Node.js nativamente.

### Passo a Passo

1. **Crie uma conta no Railway**: https://railway.app

2. **Conecte seu repositório GitHub**:
   - Vá em "New Project" → "Deploy from GitHub repo"
   - Selecione o repositório `MCP-Server-Custom-Baserow`

3. **Configure as variáveis de ambiente**:
   No painel do Railway, vá em "Variables" e adicione:

   ```
   BASEROW_API_TOKEN=seu-token-aqui
   BASEROW_API_URL=https://api.baserow.io
   TABLE_ID_MANUFACTURING_ORDERS=749415
   TABLE_ID_FINISHED_GOODS=747400
   TABLE_ID_MO_PARTS_USAGE=758739
   TABLE_ID_FG_PARTS_MAPPING=748088
   TABLE_ID_RAW_MATERIAL_LOTS=761349
   TABLE_ID_LABEL_INVENTORY=759996
   TABLE_ID_PARTS=744797
   ```

4. **Configure o comando de build e start**:
   No Railway, vá em Settings e configure:
   - Build Command: `npm install && npm run build:railway`
   - Start Command: `npm run start:railway`

5. **Deploy!**
   O Railway vai fazer deploy automaticamente.

### URL do Servidor

Após o deploy, você receberá uma URL como:
```
https://mcp-server-custom-baserow-production.up.railway.app
```

### Configurar Claude Desktop

Edite `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "baserow-railway": {
      "command": "npx",
      "args": ["mcp-remote", "https://SEU-APP.up.railway.app/mcp"]
    }
  }
}
```

### Testar o Servidor

```bash
# Health check
curl https://SEU-APP.up.railway.app/health

# Testar JSON-RPC
curl -X POST https://SEU-APP.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Opção 2: Cloudflare Workers (Gratuito)

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
# Digite: 749415

wrangler secret put TABLE_ID_FG
# Digite: 747400

wrangler secret put TABLE_ID_PARTS_USAGE
# Digite: 758739

wrangler secret put TABLE_ID_FG_PARTS_MAPPING
# Digite: 748088

wrangler secret put TABLE_ID_RM_LOTS
# Digite: 761349

wrangler secret put TABLE_ID_LABEL_INVENTORY
# Digite: 759996

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
      "args": ["mcp-remote", "https://baserow-mcp-server.novaeo.workers.dev/mcp"]
    }
  }
}
```

---

## Opção 3: VPS (DigitalOcean, AWS, etc.)

```bash
# No servidor
git clone https://github.com/rafaelpires010/MCP-Server-Custom-Baserow.git
cd MCP-Server-Custom-Baserow
npm install
npm run build:railway

# Com PM2 para manter rodando
npm install -g pm2
pm2 start dist/server-railway.js --name mcp-baserow

# Configurar variáveis de ambiente
export BASEROW_API_TOKEN=seu-token
export TABLE_ID_MANUFACTURING_ORDERS=749415
# ... outras variáveis
```

---

## Testando a Conexão

```bash
# Health check
curl https://seu-servidor.up.railway.app/health

# Lista de ferramentas
curl -X POST https://seu-servidor.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

## Notas Importantes

1. **Segurança**: Em produção, considere adicionar autenticação (API key, JWT)
2. **Logs**: Railway mostra logs automaticamente no painel
3. **Custos**: Railway tem plano grátis com limites, Cloudflare Workers também

---

## Tabela de Comparação

| Plataforma | Dificuldade | Gratuito | Persistência |
|------------|-------------|----------|--------------|
| Railway | Fácil | Sim (limites) | Sim |
| Cloudflare Workers | Médio | Sim (limites) | Não |
| VPS | Difícil | Não | Sim |
