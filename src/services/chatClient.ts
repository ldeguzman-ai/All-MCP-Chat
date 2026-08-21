import { sourceById } from '../config/mcpRegistry'

export type ChatRequest = {
  prompt: string
  sourceId: string
  history?: Array<{ role: 'assistant' | 'user'; content: string }>
  signal?: AbortSignal
}

export type ChatResponse = {
  content: string
  sources: string[]
  citations?: Array<{ source: string; url: string }>
}

const endpoint = import.meta.env.VITE_CHAT_ENDPOINT

export async function sendChatMessage({
  prompt,
  sourceId,
  history,
  signal,
}: ChatRequest): Promise<ChatResponse> {
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, sourceId, history }),
      signal,
    })

    if (!response.ok) {
      throw new Error('The chat service could not complete this request.')
    }

    return response.json() as Promise<ChatResponse>
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, 650)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeoutId)
        reject(new DOMException('The chat was cancelled.', 'AbortError'))
      },
      { once: true },
    )
    if (signal?.aborted) {
      window.clearTimeout(timeoutId)
      reject(new DOMException('The chat was cancelled.', 'AbortError'))
    }
  })
  return {
    content:
      'This is a local preview. Set VITE_CHAT_ENDPOINT to receive a live answer from the selected MCP.',
    sources: [sourceById(sourceId).name],
  }
}
