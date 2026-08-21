import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { allMcpSource, mcpSources, sourceById } from './config/mcpRegistry'
import { sendChatMessage } from './services/chatClient'
import { mcpRpc } from './services/mcpApi'
import { fetchMcpStatus, type McpStatus } from './services/mcpStatus'

type ChatMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  sourceId: string
  sources?: string[]
}

const suggestedPrompts = [
  'What are the latest updates on this project?',
  'Find documentation for setting up webhooks',
  'What feature flags are rolling out this week?',
]

const mcpConnectHint =
  'This page will reload as each MCP connects. You only need to act if you are asked to allow the MCP on a page, or to log in to Society as an agent or end user. Click an MCP tab if you prefer to use a single MCP source.'

type Theme = 'light' | 'dark'
const themeStorageKey = 'all-mcp-chat-theme-v2'

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(themeStorageKey)
  const theme = stored === 'light' || stored === 'dark' ? stored : 'dark'
  document.documentElement.dataset.theme = theme
  return theme
}

function App() {
  const [activeSourceId, setActiveSourceId] = useState('all')
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
  const connectedMcpCount = mcpStatus?.sources.filter((source) => source.connected).length ?? 0
  const totalMcpCount = mcpStatus?.sources.length ?? 0
  const connectionBySourceId = useMemo(
    () => new Map(mcpStatus?.sources.map((source) => [source.id, source.connected])),
    [mcpStatus],
  )
  const activeSourceConnected =
    activeSourceId === 'all' ? Boolean(mcpStatus?.connected) : Boolean(connectionBySourceId.get(activeSourceId))
  const isConnectingAll = activeSourceId === 'all' && totalMcpCount > 0 && !mcpStatus?.connected

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
          <button type="button" onClick={() => setActiveSourceId('all')} className={`source-tab ${activeSourceId === 'all' ? 'selected' : ''}`}>
            <span className="source-icon all-icon">{allMcpSource.icon}</span><span>All MCPs</span><span className={`mcp-status-dot ${mcpStatus?.connected ? 'connected' : 'disconnected'}`} aria-label={mcpStatus?.connected ? 'All MCPs connected' : 'Some MCPs are not connected'} /><span className="tab-count">{mcpSources.length}</span>
          </button>
          {mcpSources.map((source) => (
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
            <a className="connect-mcp" href={mcpStatus?.connectUrl || `/?mcp_connect=${encodeURIComponent(activeSourceId)}`}>
              {oauthBusy ? 'Connecting...' : isConnectingAll ? 'Continue connecting' : 'Connect MCP'}
            </a>
          )}
        </div>
        {(oauthBusy || !activeSourceConnected) && (
          <p className="mcp-connect-hint">{mcpConnectHint}</p>
        )}
        {activeSourceId === 'all' && mcpStatus && (
          <div className="mcp-progress" role="status" aria-live="polite">
            <div className="mcp-progress-copy">
              <strong>{connectedMcpCount} of {totalMcpCount} MCPs connected</strong>
              <span>{mcpStatus.connected ? 'All MCP connections are ready.' : 'Each MCP is authorized separately for your account. Click a tab to use one MCP source for focused results.'}</span>
            </div>
            <div className="mcp-progress-track" aria-hidden="true">
              <span style={{ width: `${totalMcpCount ? (connectedMcpCount / totalMcpCount) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        <section className={`conversation ${messages.length ? 'has-messages' : ''}`}>
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-mark">✦</div><p className="welcome-eyebrow">ZENDESK INTELLIGENCE</p>
              <h2>How can I help?</h2>
              <p className="welcome-copy">{activeSourceId === 'all' ? 'Ask a question and I’ll bring together the right knowledge from your connected tools.' : `Ask anything that ${activeSource.name} can help you find.`}</p>
              <div className="suggestions">
                {suggestedPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}<span>↗</span></button>)}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">{message.role === 'assistant' ? '✦' : 'You'}</div>
                  <div className="message-body"><strong>{message.role === 'assistant' ? 'All-MCP-Chat' : 'You'}</strong><p>{message.content}</p>
                    {message.sources && <div className="used-sources">{message.sources.map((source) => <span key={source}>⌁ {source}</span>)}</div>}
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
        <p className="disclaimer">This chat remembers the last 10 prompts in the selected MCP tab for context. Choose one MCP tab for more focused results. Verify important information.</p>
      </section>
    </main>
  )
}

export default App
