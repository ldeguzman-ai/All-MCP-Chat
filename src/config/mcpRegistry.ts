export type McpSource = {
  id: string
  name: string
  description: string
  accent: string
  icon: string
}

export const allMcpSource = {
  id: 'all',
  name: 'All MCPs',
  description:
    'Ask across every connected Zendesk MCP. The assistant chooses the sources that best match your question.',
  accent: '#03363d',
  icon: '✦',
}

export const mcpSources: McpSource[] = [
  {
    id: 'atlassian',
    name: 'Atlassian',
    description: 'Search and work with Jira issues and Confluence pages.',
    accent: '#1868db',
    icon: 'A',
  },
  {
    id: 'society',
    name: 'Society',
    description: 'Look up Zendesk internal Society knowledge and related community content.',
    accent: '#805ad5',
    icon: 'S',
  },
  {
    id: 'cerebro',
    name: 'Cerebro',
    description: 'Query Zendesk internal operational and systems knowledge.',
    accent: '#cf3f6d',
    icon: 'C',
  },
  {
    id: 'unleash',
    name: 'Unleash',
    description: 'Check feature flags, targeting, and rollout status.',
    accent: '#5932a2',
    icon: 'U',
  },
  {
    id: 'z2-help-center',
    name: 'z2-help-center',
    description: 'Search Zendesk Help Center articles and customer-facing support content.',
    accent: '#00a5a5',
    icon: '?',
  },
  {
    id: 'zendeskdev',
    name: 'zendeskdev',
    description: 'Look up Zendesk developer docs, APIs, and integration guidance.',
    accent: '#17494d',
    icon: '</>',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Find messages, channels, and people in Slack.',
    accent: '#4a154b',
    icon: 'S',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search and retrieve files, docs, and shared Drive content.',
    accent: '#4285f4',
    icon: 'D',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'Search the public web for current information.',
    accent: '#161f3d',
    icon: 'T',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Retrieve and summarize content from a specific URL.',
    accent: '#ef7c00',
    icon: '↗',
  },
  {
    id: 'zendesk-search-mcp',
    name: 'zendesk-search-mcp',
    description: 'Search Zendesk tickets, users, and related Support data.',
    accent: '#00a880',
    icon: 'Z',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Run a deeper multi-step research pass across available sources.',
    accent: '#e15d38',
    icon: 'R',
  },
]

export const sourceById = (sourceId: string) =>
  sourceId === allMcpSource.id
    ? allMcpSource
    : mcpSources.find((source) => source.id === sourceId) ?? allMcpSource
