# All-MCP-Chat

Internal Zendesk chat workspace that answers questions using connected MCP tools. Use **All MCPs** to search across every source, or pick one tab for more focused results.

**Live app:** [https://all-mcp-chat.internal.zenai-apps.com/](https://all-mcp-chat.internal.zenai-apps.com/)

Author: [ldeguzman-ai on GitHub](https://github.com/ldeguzman-ai?tab=repositories)

This URL is behind Zendesk Pomerium SSO. You must be signed in on the Zendesk network or VPN.

![All-MCP-Chat UI in dark mode with All MCPs connected](docs/all-mcp-chat-ui.png)

## When you need to connect MCP

You need to connect MCP **once per browser account** (your SSO email) before tools can run.

Connect when:

- The header shows **Connect MCP** instead of **MCP connected**
- A tab has a gray status dot
- Chat says tools are not connected and gives a connect link
- You are using the app for the first time, or tokens expired and a tab dropped back to disconnected

You do **not** need to connect again for every question. After the dots are green, just chat. Switching tabs does not disconnect anything; it only changes which tools that question can use.

Plain greetings can still get an LLM reply without tools. Real lookups (Confluence, Slack, flags, search) need a connected MCP.

## Experience when connecting

1. Open the [live app](https://all-mcp-chat.internal.zenai-apps.com/).
2. Stay on **All MCPs** and click **Connect MCP**, or open  
   `https://all-mcp-chat.internal.zenai-apps.com/?mcp_connect=all`
3. The page **reloads** as each MCP is authorized. That is expected.
4. You only need to interact if:
   - a page asks you to **allow** that MCP, or
   - **Society** asks you to log in as an **agent** or **end user**
5. After each approval you return to the app. The count goes up (`1 of 12`, `2 of 12`, …).
6. Click **Continue connecting** until you see **12 of 12 MCPs connected**.

Green dots on tabs mean connected. Gray dots mean that MCP still needs auth. Click a single MCP tab, then **Connect MCP**, if you only want that source.

The gateway allows **one MCP binding per login**, so All MCPs cannot finish in a single consent screen.

## How to use the app

- **All MCPs:** the model picks tools from every connected source. Prefer this for broad questions. For internal docs it searches first and prefers the newest dated result when the tool provides dates.
- **One MCP tab:** only that source is used. Choose this for better, narrower results (for example Atlassian or Tavily).
- Chat **remembers the last 10 prompts** in the **selected tab** for this browser session. Refreshing the page starts a new conversation.
- Dark mode is the default. Use the Light / Dark toggle anytime.

## MCP sources

All MCPs, Atlassian, Society, Cerebro, Unleash, z2-help-center, zendeskdev, Slack, Google Drive, Tavily, Fetch, zendesk-search-mcp, and Researcher.

## Run locally

```bash
npm install
npm run dev
```

Without `VITE_CHAT_ENDPOINT`, the UI is a local preview and does not call the LLM or MCP.

Production chat goes to `POST /api/chat` on the App Foundry app. LLM access is App Foundry / Vertex workload identity. MCP auth is per-user OAuth against `https://mcp-gateway.zende.sk` (no shared gateway secret). Encrypted tokens are stored in Postgres.
