## Overview

**Experimental.** All-MCP-Chat is a Zendesk-internal workspace for testing every available Zendesk MCP as a chatbot. It is intended for exploration and evaluation, not as a production knowledge system.

Pick **one MCP tab**, connect it, and ask questions against that source only. There is no All MCPs combined search. Answers can be incomplete when an MCP cannot return full page, thread, or record content. Verify important information in the original source.

## Quick links

* **Live app:** https://all-mcp-chat.internal.zenai-apps.com/
* **GitHub repo:** https://github.com/ldeguzman-ai/All-MCP-Chat

Access requires Zendesk Pomerium SSO (Zendesk network or VPN).

**Maintainer:** @Lawrence de Guzman

---

## How to use

1. Open the live app.
2. Select one MCP tab (tabs are alphabetical).
3. If the tab has a gray dot, click **Connect MCP** and complete the allow/login step. The page reloads as that MCP authorizes. That is expected.
4. Ask a question. Factual questions call MCP tools: search first, then retrieve the primary page, record, thread, or document.
5. Follow 1–2 source links in the answer when a page or record was used.

Green dots mean connected. Gray dots mean that MCP still needs auth. Connecting is once per SSO account, not once per question. Switching tabs does not disconnect anything; it only changes which tools that question can use.

The gateway allows **one MCP binding per login**, so each source must be connected separately.

**Society:** you may be asked to log in as an **agent** or **end user**.

Chat remembers the last 10 user prompts (plus replies) for the selected tab in this browser session. Refresh starts a new conversation. Dark mode is the default.

### Chat experience

_Select one MCP tab, connect it, then ask a question. Source pages used in the answer appear as clickable links._

---

## MCP sources and research instructions

Each tab uses a dedicated research playbook.

| Tab | Source id | Use for |
| --- | --- | --- |
| Atlassian | `atlassian` | Confluence pages and Jira issues |
| Cerebro | `cerebro` | Internal operational and systems knowledge |
| Fetch | `fetch` | Retrieve a specific URL |
| Google Drive | `google-drive` | Docs, Sheets, and shared Drive files |
| Researcher | `researcher` | Multi-step research |
| Slack | `slack` | Messages, channels, and threads |
| Society | `society` | Internal Society knowledge and community content |
| Tavily | `tavily` | Public web search |
| Unleash | `unleash` | Feature flags, targeting, and rollout |
| z2-help-center | `z2-help-center` | Zendesk Help Center articles |
| zendesk-search-mcp | `zendesk-search-mcp` | Support tickets, users, and organizations |
| zendeskdev | `zendeskdev` | Zendesk developer docs and APIs |

### Atlassian

* Search narrowly by the exact system, process, or role, plus space, project, label, status, or recency when available.
* Open the selected page or issue by page id, content id, or issue key. Search snippets are locators only.
* Inspect the full body. Prefer rendered view/HTML or ADF so Expand, Details, dropdowns, Page Properties, includes, and tables are not stripped.
* Match the exact product or system (for example NetSuite vs Monitor User Access Reviews). Do not reuse an approver from a neighboring row, region, or role.
* For Jira, distinguish current fields from historical comments. Cite the opened page or issue and updated time when available.
* If collapsed or embedded content is still missing, say so. Do not invent a name, owner, or date.

### Society

* Search related posts, then retrieve the full entry, accepted answer, comments, revisions, and linked canonical resources.
* Ranking is a discovery signal, not correctness. Distinguish official guidance, community consensus, and an individual report.
* Keep audience, product, region, and date limits. If posts disagree, summarize the disagreement.

### Cerebro

* Retrieve the applicable runbook and current change or incident context first, then related services, lessons, or postmortems.
* Verify environment, service, owner, hazards, approvals, rollback, validation, and last-verified time before treating a procedure as safe.
* Never infer live production state from an old runbook.

### Unleash

* Resolve the exact flag, project, and environment, then retrieve the full definition: strategies, constraints, segments, variants, and rollout.
* Do not call a flag globally enabled from one environment. Distinguish configured state from evaluation for a user or request.
* If the name or environment is ambiguous, ask or retrieve exact matches. Do not expose targeting identifiers or credentials.

### z2-help-center

* Search, then open the full published article and metadata. Prefer official Help Center pages over comments or third-party pages.
* Preserve plan, product, channel, locale, and visibility. Do not mix Guide, Support, Messaging, or Sunshine unless the article says they share behavior.
* On conflict, use the newest applicable published article and mention the conflict. Search indexing can lag updates.

### zendeskdev

* Open the official reference page plus linked auth, pagination, and rate-limit pages. Prefer reference docs over tutorials.
* Verify product, endpoint, version, auth, scopes, parameters, pagination, limits, and errors. Do not invent fields or payloads.
* State which API applies. Never expose tokens, subdomains, or customer IDs.

### Slack

* Search, then retrieve surrounding context and the complete thread (paginate replies). A single search hit is not enough.
* Preserve author, time, edits, order, reactions, files, and linked docs when they change the meaning.
* Treat Slack as discussion, not policy. Prefer an approved linked document when one exists. Return only what answers the question.

### Google Drive

* Search by title, type, folder, and modified time, then retrieve by file id and read the real document or export.
* For Sheets, keep the exact tab, range, column, and row. Do not flatten tables into misleading prose.
* Only call a file current when metadata supports it. Say when an export omits comments, formulas, or layout.

### Tavily

* Plan the evidence needed, search, rank by authority and recency, then open canonical sources for each material claim.
* Prefer official docs, regulators, filings, and direct statements. Snippets, rankings, and AI summaries are not evidence.
* For current or disputed facts, corroborate independently, state an as-of date, and surface unresolved conflicts.

### Fetch

* Fetch the canonical URL and answer only from the retrieved body.
* If the page is incomplete or JavaScript-rendered, retry once with a rendering reader if available. Do not bypass logins, paywalls, or access controls.
* Quotes must match fetched text. Never guess from the URL or title.

### zendesk-search-mcp

* Determine the object type, query narrowly, then open the primary record. Prefer ticket id, email or external id, and exact org name.
* Verify current status from the record, not a search title. Do not merge identities because names match.
* Return the minimum authorized data. Omit unrelated PII, internal notes, and comments unless needed to answer.

### Researcher

* Plan subquestions and evidence gaps, retrieve primary sources, compare conflicts, then report what was verified vs uncertain.
* Each tool call should fill one named gap. Do not repeat the same call or chase tangential facts.
* Stop when claims are supported or the call budget is reached; then return the best supported partial answer.

---

## Access, privacy, and data handling

* This is internal Zendesk tooling and must not be made public.
* Chat uses per-user MCP OAuth against `https://mcp-gateway.zende.sk`. Encrypted tokens are stored in Postgres. There is no shared gateway secret.
* LLM access is App Foundry / Vertex workload identity.
* Do not add tokens, credentials, or `.env` files to documentation or source control.
* Treat answers as experimental. Confirm owners, flags, ticket state, and policy in the source system.

## Support

For questions about this experimental chatbot, contact @Lawrence de Guzman.
