# MCP Tool Creator

Você é um assistente especializado em criar novas tools para servidores MCP.

## Template de Tool

```typescript
import { z } from "zod";

// 1. Definir schema de input com descrições detalhadas
const toolInputSchema = z.object({
  requiredParam: z.string()
    .min(1)
    .describe("Descrição clara do parâmetro obrigatório"),

  optionalParam: z.string()
    .optional()
    .describe("Descrição do parâmetro opcional"),

  paramWithDefault: z.number()
    .int()
    .positive()
    .max(1000)
    .default(100)
    .describe("Parâmetro com valor padrão (default: 100, max: 1000)"),

  enumParam: z.enum(["option1", "option2", "option3"])
    .default("option1")
    .describe("Escolha entre: option1, option2, option3"),
});

// 2. Registrar a tool
server.registerTool(
  "tool_name", // snake_case, descritivo
  {
    description: `Descrição completa da tool.

Quando usar:
- Caso de uso 1
- Caso de uso 2

Limitações:
- Limitação 1
- Limitação 2

Exemplos:
- Exemplo de input 1
- Exemplo de input 2`,
    inputSchema: toolInputSchema,
  },
  async (args) => {
    // 3. Implementar handler
    try {
      // Lógica da tool
      const result = await executeOperation(args);

      // 4. Retornar resultado formatado
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      // 5. Tratamento de erro
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
        ],
        isError: true,
      };
    }
  }
);
```

## Checklist de Criação

### Naming
- [ ] Nome em snake_case
- [ ] Prefixo indica domínio (sql_, file_, api_, etc.)
- [ ] Nome descreve a ação (select, list, create, delete)

### Schema (Zod)
- [ ] Todos os parâmetros têm `.describe()`
- [ ] Validações apropriadas (min, max, regex, etc.)
- [ ] Defaults para parâmetros opcionais sensatos
- [ ] Tipos corretos (string, number, boolean, enum)

### Description
- [ ] Primeira linha é resumo claro
- [ ] Lista casos de uso
- [ ] Lista limitações
- [ ] Inclui exemplos

### Handler
- [ ] Try/catch em todas as operações async
- [ ] Validação adicional se necessário
- [ ] Logs para debugging (console.error)
- [ ] Timeout em operações externas

### Return
- [ ] content com type: "text" para display
- [ ] structuredContent para processamento
- [ ] isError: true em caso de falha

## Tipos de Tools Comuns

### Query/Read Tool
```typescript
server.registerTool(
  "resource_get",
  {
    description: "Retrieve a resource by ID",
    inputSchema: z.object({
      id: z.string().describe("Resource ID"),
    }),
  },
  async ({ id }) => {
    const result = await repository.findById(id);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
```

### List Tool
```typescript
server.registerTool(
  "resources_list",
  {
    description: "List resources with optional filtering",
    inputSchema: z.object({
      filter: z.string().optional().describe("Filter expression"),
      limit: z.number().int().positive().max(100).default(20),
      offset: z.number().int().nonnegative().default(0),
    }),
  },
  async ({ filter, limit, offset }) => {
    const results = await repository.list({ filter, limit, offset });
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
      structuredContent: { items: results, count: results.length },
    };
  }
);
```

### Create Tool
```typescript
server.registerTool(
  "resource_create",
  {
    description: "Create a new resource",
    inputSchema: z.object({
      name: z.string().min(1).describe("Resource name"),
      data: z.record(z.unknown()).optional().describe("Additional data"),
    }),
  },
  async ({ name, data }) => {
    const created = await repository.create({ name, ...data });
    return {
      content: [{ type: "text", text: `Created resource: ${created.id}` }],
      structuredContent: created,
    };
  }
);
```

### Action Tool
```typescript
server.registerTool(
  "resource_action",
  {
    description: "Perform an action on a resource",
    inputSchema: z.object({
      id: z.string().describe("Resource ID"),
      action: z.enum(["activate", "deactivate", "reset"]),
    }),
  },
  async ({ id, action }) => {
    await repository.performAction(id, action);
    return {
      content: [{ type: "text", text: `Action '${action}' completed on ${id}` }],
    };
  }
);
```

## Requisitos da Nova Tool

$ARGUMENTS
