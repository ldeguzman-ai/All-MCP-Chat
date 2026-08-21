import { mcpRpc } from './mcpApi'

export type McpStatus = {
  connected: boolean
  connectUrl: string
  sources: Array<{ id: string; connected: boolean }>
  database: boolean
}

export async function fetchMcpStatus(sourceId: string): Promise<McpStatus | null> {
  try {
    return await mcpRpc<McpStatus>({ mcpStatus: true, sourceId })
  } catch {
    return null
  }
}
