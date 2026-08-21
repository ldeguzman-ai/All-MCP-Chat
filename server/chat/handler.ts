import { mcpEndpoints, resolveMcpSources, type McpSourceId } from '../mcp/registry'

export type ChatRequest = {
  prompt: string
  sourceId: string
}

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: object
}

export type ToolCall = {
  name: string
  arguments: object
}

export type LlmTurn = {
  content?: string
  toolCalls?: ToolCall[]
}

export type McpConnection = {
  listTools(): Promise<ToolDefinition[]>
  callTool(call: ToolCall): Promise<unknown>
}

export type ChatDependencies = {
  connectMcp(sourceId: McpSourceId, endpoint: string): Promise<McpConnection>
  complete(input: {
    prompt: string
    tools: ToolDefinition[]
    toolResults: Array<{ call: ToolCall; result: unknown }>
  }): Promise<LlmTurn>
}

const maxToolRounds = 4

/**
 * Adapter-ready chat orchestration for an App Foundry server route.
 *
 * Wire `connectMcp` to the MCP SDK transport supported by your gateway and
 * `complete` to the App Foundry-managed LLM client. Keep both implementations
 * server-side so client sessions cannot retrieve tokens or gateway credentials.
 */
export async function handleChat(
  request: ChatRequest,
  dependencies: ChatDependencies,
): Promise<{ content: string; sources: string[] }> {
  const sourceIds = resolveMcpSources(request.sourceId)
  const connections = await Promise.all(
    sourceIds.map(async (sourceId) => ({
      sourceId,
      client: await dependencies.connectMcp(sourceId, mcpEndpoints[sourceId]),
    })),
  )

  const tools = (
    await Promise.all(
      connections.map(async ({ sourceId, client }) =>
        (await client.listTools()).map((tool) => ({
          ...tool,
          name: `${sourceId}__${tool.name}`,
        })),
      ),
    )
  ).flat()

  const toolResults: Array<{ call: ToolCall; result: unknown }> = []
  for (let round = 0; round < maxToolRounds; round += 1) {
    const turn = await dependencies.complete({
      prompt: request.prompt,
      tools,
      toolResults,
    })

    if (!turn.toolCalls?.length) {
      return {
        content: turn.content ?? 'No answer was returned.',
        sources: [...new Set(toolResults.map(({ call }) => call.name.split('__')[0]))],
      }
    }

    for (const call of turn.toolCalls) {
      const [sourceId, ...toolName] = call.name.split('__')
      const connection = connections.find(({ sourceId: id }) => id === sourceId)
      if (!connection || toolName.length === 0) {
        throw new Error('The model requested a tool outside the selected MCP scope.')
      }
      toolResults.push({
        call,
        result: await connection.client.callTool({ ...call, name: toolName.join('__') }),
      })
    }
  }

  throw new Error('The request exceeded the maximum tool-call rounds.')
}
