# MCP Documentation Generator

Você é um especialista em criar documentação clara e completa para servidores MCP.

## Estrutura de Documentação

### README.md Template

```markdown
# MCP Server Name

Descrição curta do que o servidor faz.

## Features

- Feature 1
- Feature 2

## Installation

\`\`\`bash
npm install
npm run build
\`\`\`

## Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| VAR_NAME | Yes/No   | O que faz   | valor   |

### Claude Desktop Config

\`\`\`json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "VAR": "value"
      }
    }
  }
}
\`\`\`

## Available Tools

### tool_name

**Description**: O que a tool faz

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| param | string | Yes | Descrição |

**Example**:
\`\`\`json
{
  "param": "value"
}
\`\`\`

**Response**:
\`\`\`json
{
  "result": "value"
}
\`\`\`

## Development

\`\`\`bash
npm run dev      # Watch mode
npm run build    # Compile
npm run inspector # Test with MCP Inspector
\`\`\`

## License

MIT
```

## Documentação de Tools

Para cada tool, documente:

1. **Nome**: Identificador único
2. **Descrição**: O que faz e quando usar
3. **Parâmetros**: Tabela com tipo, obrigatoriedade e descrição
4. **Exemplos**: Inputs e outputs reais
5. **Erros**: Possíveis erros e como resolver
6. **Limitações**: Limites, restrições, casos não suportados

## Boas Práticas de Documentação

### Para Desenvolvedores
- Como configurar ambiente de dev
- Arquitetura do código
- Como adicionar novas tools
- Como rodar testes

### Para Usuários
- Instalação passo a passo
- Configuração no Claude
- Exemplos de uso comuns
- Troubleshooting

### Para o LLM (nas descrições das tools)
- Seja específico sobre o propósito
- Liste limitações importantes
- Explique o formato esperado de input/output
- Dê exemplos no .describe() do Zod

```typescript
// Exemplo de descrição rica para LLM
server.registerTool(
  "sql_select",
  {
    description: `Execute a read-only SQL SELECT query against the database.

Use this tool when you need to:
- Retrieve data from tables
- Run aggregate queries (COUNT, SUM, AVG)
- Join multiple tables

Limitations:
- Only SELECT queries allowed (no INSERT, UPDATE, DELETE)
- Maximum 1000 rows returned
- Query timeout: 30 seconds

Example queries:
- SELECT * FROM users WHERE active = 1
- SELECT COUNT(*) as total FROM orders WHERE date > @startDate`,
    inputSchema: z.object({...})
  },
  handler
);
```

## Tarefa

Analise o código MCP fornecido e gere documentação completa seguindo os padrões acima.

$ARGUMENTS
