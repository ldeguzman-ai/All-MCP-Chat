/**
 * Server-only MCP configuration.
 *
 * Deploy this file in an App Foundry server/runtime. Do not import it from
 * `src/`: Vite bundles `src/` into the browser.
 */
export const mcpEndpoints = {
  atlassian: 'https://mcp-gateway.zende.sk/mcps/atlassian',
  society: 'https://mcp-gateway.zende.sk/mcps/society',
  cerebro: 'https://mcp-gateway.zende.sk/mcps/cerebro',
  unleash: 'https://mcp-gateway.zende.sk/mcps/unleash',
  'z2-help-center': 'https://mcp-gateway.zende.sk/mcps/z2-help-center',
  zendeskdev: 'https://mcp-gateway.zende.sk/mcps/zendeskdev',
  slack: 'https://mcp-gateway.zende.sk/mcps/slack',
  'google-drive': 'https://mcp-gateway.zende.sk/mcps/google-drive',
  tavily: 'https://mcp-gateway.zende.sk/mcps/tavily',
  fetch: 'https://mcp-gateway.zende.sk/mcps/fetch',
  'zendesk-search-mcp': 'https://mcp-gateway.zende.sk/mcps/zendesk-search-mcp',
  researcher: 'https://mcp-gateway.zende.sk/mcps/researcher',
} as const

export type McpSourceId = keyof typeof mcpEndpoints

export function resolveMcpSources(sourceId: string): McpSourceId[] {
  if (sourceId === 'all') return Object.keys(mcpEndpoints) as McpSourceId[]
  if (sourceId in mcpEndpoints) return [sourceId as McpSourceId]
  throw new Error(`Unknown MCP source: ${sourceId}`)
}
