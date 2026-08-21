import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { mcpSources, sourceById } from './config/mcpRegistry'
import { sendChatMessage } from './services/chatClient'
import { mcpRpc } from './services/mcpApi'
import { fetchMcpStatus, type McpStatus } from './services/mcpStatus'

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  sourceId: string
  sources?: string[]
  citations?: Array<{ source: string; url: string }>
}

const suggestedPrompts = [
  'What are the latest updates on this project?',
  'Find documentation for setting up webhooks',
  'What feature flags are rolling out this week?',
]

const mcpConnectHint =
  'This page will reload as the selected MCP connects. You only need to act if you are asked to allow the MCP on a page, or to log in to Society as an agent or end user.'

type Theme = 'light' | 'dark'
const themeStorageKey = 'all-mcp-chat-theme-v2'

function trimUrl(url: string) {
  return url.replace(/[.,;:!?)]+$/, '')
}

function renderFormattedText(text: string, keyPrefix: string) {
  const chunks = text.split(/(\*\*[^*]+\*\*)/g)
  return chunks.map((chunk, chunkIndex) =>
    chunk.startsWith('**') && chunk.endsWith('**') ? (
      <strong key={`${keyPrefix}-b-${chunkIndex}`}>{chunk.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-t-${chunkIndex}`}>{chunk}</span>
    ),
  )
}

function renderMessageContent(content: string) {
  const nodes: Array<{ type: 'text' | 'link'; text: string; href?: string }> = []
  const pattern =
    /\[((?:[^\[\]]|\[[^\]]*\])*)\]\s*\(\s*(https?:\/\/[^\s<>"']+)\)|(https?:\/\/[^\s<>"']+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: content.slice(lastIndex, match.index) })
    }
    if (match[1] != null && match[2]) {
      nodes.push({
        type: 'link',
        text: match[1].replace(/^["']|["']$/g, '').trim() || 'Source',
        href: trimUrl(match[2]),
      })
    } else if (match[3]) {
      const href = trimUrl(match[3])
      nodes.push({ type: 'link', text: 'Source', href })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) nodes.push({ type: 'text', text: content.slice(lastIndex) })

  return nodes.flatMap((node, index) => {
    if (node.type === 'link') {
      return [
        <a key={`link-${index}`} href={node.href} target="_blank" rel="noreferrer">
          {node.text}
        </a>,
      ]
    }
    return renderFormattedText(node.text, `text-${index}`)
  })
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(themeStorageKey)
  const theme = stored === 'light' || stored === 'dark' ? stored : 'dark'
  document.documentElement.dataset.theme = theme
  return theme
}

function App() {
  const [activeSourceId, setActiveSourceId] = useState(mcpSources[0].id)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null)
  const [oauthBusy, setOauthBusy] = useState(() => {
    if (typeof window === 'undefined') return false
    const params = new URLSearchParams(window.location.search)
    return Boolean(params.get('code') || params.get('error') || params.get('mcp_connect'))
  })
  const requestRef = useRef<AbortController | null>(null)

  const activeSource = useMemo(() => sourceById(activeSourceId), [activeSourceId])
  const orderedMcpSources = useMemo(
    () => [...mcpSources].sort((left, right) => left.name.localeCompare(right.name)),
    [],
  )
  const connectionBySourceId = useMemo(
    () => new Map(mcpStatus?.sources.map((source) => [source.id, source.connected])),
    [mcpStatus],
  )
  const activeSourceConnected = Boolean(connectionBySourceId.get(activeSourceId))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('code') || params.get('error') || params.get('mcp_connect')) return undefined
    let cancelled = false
    void fetchMcpStatus('all').then((status) => {
      if (!cancelled) setMcpStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')
    const connect = params.get('mcp_connect')
    if (!code && !error && !connect) return undefined

    let cancelled = false
    const clearOauthQuery = () => window.history.replaceState({}, '', window.location.pathname || '/')

    void (async () => {
      try {
        const result = code || error
          ? await mcpRpc<{ authorizeUrl?: string }>({
              mcpOAuth: {
                code,
                state,
                error,
                description: params.get('error_description'),
              },
            })
          : await mcpRpc<{ authorizeUrl?: string }>({ mcpConnect: connect })
        if (cancelled) return
        if (result.authorizeUrl) {
          window.location.assign(result.authorizeUrl)
          return
        }
        clearOauthQuery()
        setOauthBusy(false)
        const status = await fetchMcpStatus('all')
        if (!cancelled) setMcpStatus(status)
      } catch {
        if (!cancelled) {
          clearOauthQuery()
          setOauthBusy(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const submitPrompt = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const prompt = input.trim()
    if (!prompt || isSending) return

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    const history = messages
      .filter((message) => message.sourceId === activeSourceId)
      .slice(-20)
      .map(({ role, content }) => ({ role, content }))

    setMessages((current) => [
      ...current,
      { id: Date.now(), role: 'user', content: prompt, sourceId: activeSourceId },
    ])
    setInput('')
    setIsSending(true)

    try {
      const response = await sendChatMessage({
        prompt,
        sourceId: activeSourceId,
        history,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.content,
          sourceId: activeSourceId,
          sources: response.sources,
          citations: response.citations,
        },
      ])
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        return
      }
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          sourceId: activeSourceId,
          content:
            error instanceof Error
              ? error.message
              : 'Something went wrong while sending your message.',
        },
      ])
    } finally {
      if (requestRef.current === controller) {
        setIsSending(false)
        requestRef.current = null
      }
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitPrompt()
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div className="brand">
            <img className="brand-mark" src="/zendesk-mark.png" alt="Zendesk" />
            <div>
              <p className="eyebrow">ZENDESK</p>
              <h1>All-MCP-Chat</h1>
            </div>
          </div>
          <div className="theme-toggle" role="group" aria-label="Color theme">
            <button
              type="button"
              className={theme === 'light' ? 'selected' : ''}
              aria-pressed={theme === 'light'}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'selected' : ''}
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
          </div>
        </header>

        <nav className="source-tabs" aria-label="MCP sources">
          {orderedMcpSources.map((source) => (
            <button key={source.id} type="button" title={source.description} onClick={() => setActiveSourceId(source.id)} className={`source-tab ${activeSourceId === source.id ? 'selected' : ''}`}>
              <span className="source-icon" style={{ backgroundColor: source.accent }}>{source.icon}</span><span>{source.name}</span><span className={`mcp-status-dot ${connectionBySourceId.get(source.id) ? 'connected' : 'disconnected'}`} aria-label={connectionBySourceId.get(source.id) ? `${source.name} connected` : `${source.name} not connected`} />
            </button>
          ))}
        </nav>

        <div className="source-context">
          <span className="source-icon large" style={{ backgroundColor: activeSource.accent }}>{activeSource.icon}</span>
          <div><h2>{activeSource.name}</h2><p>{activeSource.description}</p></div>
          {activeSourceConnected ? (
            <span className="mcp-connected">MCP connected</span>
          ) : (
            <a className="connect-mcp" href={`/?mcp_connect=${encodeURIComponent(activeSourceId)}`}>
              {oauthBusy ? 'Connecting...' : 'Connect MCP'}
            </a>
          )}
        </div>
        {(oauthBusy || !activeSourceConnected) && (
          <p className="mcp-connect-hint">{mcpConnectHint}</p>
        )}

        <section className={`conversation ${messages.length ? 'has-messages' : ''}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-mark">✦</div><p className="welcome-eyebrow">ZENDESK INTELLIGENCE</p>
              <h2>How can I help?</h2>
              <p className="welcome-copy">Ask anything that {activeSource.name} can help you find.</p>
              <div className="suggestions">
                {suggestedPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}<span>↗</span></button>)}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">{message.role === 'assistant' ? '✦' : 'You'}</div>
                  <div className="message-body">
                    <strong className="message-sender">{message.role === 'assistant' ? 'All-MCP-Chat' : 'You'}</strong>
                    <p>{renderMessageContent(message.content)}</p>
                    {message.citations?.length ? (
                      <div className="used-sources">
                        {message.citations.slice(0, 2).map((citation) => (
                          <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">
                            {citation.source}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {isSending && <div className="thinking"><span /><span /><span /> Searching your connected tools</div>}
            </div>
          )}
        </section>

        <form className="composer" onSubmit={(event) => void submitPrompt(event)}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={`Message ${activeSource.name}`}
            rows={1}
            aria-label="Message"
          />
          <div className="composer-actions">
            <span className="model-pill">Powered by App Foundry LLM</span>
            <button type="submit" className="send-button" disabled={!input.trim() || isSending} aria-label="Send message">↑</button>
          </div>
        </form>
        <p className="disclaimer">This chat remembers the last 10 prompts in the selected MCP tab for context. When a source page is used, it appears as 1 or 2 links in the answer. Verify important information.</p>
      </section>
    </main>
  )
}

export default App
