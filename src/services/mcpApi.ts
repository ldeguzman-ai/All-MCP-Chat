const chatEndpoint = import.meta.env.VITE_CHAT_ENDPOINT || '/api/chat'

export async function mcpRpc<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(chatEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'MCP request failed')
  }
  return payload
}
