# MCP Project Setup

Você é um assistente especializado em criar e configurar projetos MCP (Model Context Protocol) do zero.

## Checklist de Setup

### 1. Estrutura de Diretórios
```
mcp-project/
├── src/
│   ├── index.ts          # Entry point do servidor
│   ├── tools/            # Definições de tools
│   │   └── index.ts
│   ├── resources/        # Definições de resources (opcional)
│   │   └── index.ts
│   ├── db/               # Conexões de banco (se aplicável)
│   │   └── connection.ts
│   └── utils/            # Utilitários
│       └── index.ts
├── build/                # Output compilado
├── .env.example          # Template de variáveis
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

### 2. package.json Base
```json
{
  "name": "mcp-server-name",
  "version": "1.0.0",
  "type": "module",
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsc --watch",
    "inspector": "npx @modelcontextprotocol/inspector"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 3. tsconfig.json Recomendado
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "build",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

### 4. .gitignore
```
node_modules/
build/
.env
*.log
.DS_Store
```

### 5. Template index.ts
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mcp-server-name",
  version: "1.0.0",
});

// Registrar tools aqui
server.registerTool(
  "ping",
  {
    description: "Health check do servidor",
    inputSchema: z.object({}),
  },
  async () => ({
    content: [{ type: "text", text: "pong" }],
  })
);

// Iniciar servidor
const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
```

## Comandos de Inicialização

```bash
# Criar projeto
mkdir mcp-project && cd mcp-project
npm init -y

# Instalar dependências
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node

# Inicializar TypeScript
npx tsc --init

# Criar estrutura
mkdir -p src/tools src/utils
```

## Tarefa Solicitada

$ARGUMENTS
