# Code Mode source register

Research date: **17 November 2026**. This register supports [the revised blog](../../BLOG.md).

Scope: public Code Mode material found on Cloudflare and Substack, followed by the original measurements linked from those discussions. Search included `code mode`, `codemode`, MCP, tokens, latency, benchmarks, and the official Cloudflare Agents documentation index. This is a record of the material found and reviewed, not a claim to enumerate every newsletter or paywalled post on the internet.

The blog contains the selected quantitative comparisons, their denominators, the implementation, Grafana screenshots, and a proposed evaluation. This register retains the wider reading trail without reproducing other authors' articles.

## Cloudflare articles

| Source | Date verified | Role in the research |
| --- | --- | --- |
| [Original Code Mode proposal](https://blog.cloudflare.com/code-mode/) | 26 Sep 2025 | Original architecture explanation |
| [Cloudflare API through Code Mode](https://blog.cloudflare.com/code-mode-mcp/) | 20 Feb 2026 | Primary catalog-footprint measurement |
| [Dynamic Workers sandboxing](https://blog.cloudflare.com/dynamic-workers/) | 24 Mar 2026 | Runtime-startup comparison, separately identified |
| [Enterprise MCP architecture](https://blog.cloudflare.com/enterprise-mcp/) | Retrieved 17 Nov 2026 | Portal implementation and a smaller catalog comparison |
| [Internal AI engineering stack](https://blog.cloudflare.com/internal-ai-engineering-stack/) | 20 Apr 2026 | Practical portal deployment context |
| [Unified data platform and Skipper](https://blog.cloudflare.com/our-unified-data-platform/) | 28 May 2026 | Data-query orchestration example |
| [MCP’s next generation](https://blog.cloudflare.com/mcp-v2/) | 6 Aug 2026 | Protocol and deployment context, not an efficiency benchmark |

The Dynamic Workers article also retrospectively mentions an **81%** token reduction. It does not supply a separate controlled evaluation in that passage. The blog does not count it as another independent task benchmark.

The API post and podcast description give different baselines. The blog identifies its primary-page source; the reason for the discrepancy is not established.

## Cloudflare documentation map

The official [Agents documentation index](https://developers.cloudflare.com/agents/llms.txt) listed these ten Code Mode pages. Overview, execution model, MCP integration, and durable-runtime material were read for architectural context. The remaining pages are indexed integration/reference reading; none supplies an extra benchmark result in this article.

1. [Overview](https://developers.cloudflare.com/agents/tools/codemode/)
2. [AI SDK integration](https://developers.cloudflare.com/agents/tools/codemode/ai-sdk/)
3. [API reference](https://developers.cloudflare.com/agents/tools/codemode/api-reference/)
4. [Browser integration](https://developers.cloudflare.com/agents/tools/codemode/browser/)
5. [Durable runtime](https://developers.cloudflare.com/agents/tools/codemode/durable-runtime/)
6. [Execution model](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/)
7. [MCP tools integration](https://developers.cloudflare.com/agents/tools/codemode/mcp/)
8. [OpenAPI integration](https://developers.cloudflare.com/agents/tools/codemode/openapi/)
9. [TanStack AI integration](https://developers.cloudflare.com/agents/tools/codemode/tanstack-ai/)
10. [Build a Code Mode MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/)

These APIs are versioned product surfaces. Cloudflare's overview labels Code Mode experimental. The blog describes the pattern and differentiates runtime implementations instead of treating old examples as an installation guide for the current SDK.

## Substack reading trail

“Original observation” means an author reports their own run. It does not imply independent replication or statistical adequacy. “Secondary” means the numerical claim comes from another publisher.

| Author / publication | Article | Evidence classification |
| --- | --- | --- |
| Architecture Corner | [Code Mode and MCP](https://architecturecorner.substack.com/p/code-mode-a-better-way-to-use-mcp) — 12 May 2026 | Architecture commentary; secondary figures |
| Youssef Hosni | [Bifrost gateway setup](https://todatabeyond.substack.com/p/how-i-use-bifrost-mcp-gateway-and) — 8 May 2026 | Implementation walkthrough; follow numerical claims to Bifrost |
| Michael Levan | [The Agentic Chronicles, issue 16](https://michaellevan.substack.com/p/a-week-in-ai-issue-16) — 1 Aug 2026 | Original reported prompt-token comparison |
| Juan Velasquez | [Agents writing code at GuruSup](https://odzen.substack.com/p/what-changed-when-our-agents-started) — 11 Nov 2026 | Original workflow demonstration |
| This Week in NET | [Conversation with Matt Carey](https://thisweekinnet.substack.com/p/code-mode-giving-ai-agents-an-entire) — 27 Feb 2026 | Cloudflare interview/demos; secondary numerical summary |
| Dan Cucolea | [Shared MCP portals](https://allagentsconsidered.substack.com/p/one-mcp-to-rule-them-all) — 6 Oct 2026 | Documentation-based operational analysis |
| CTO Lunch NYC | [Winter 2026 architecture discussion](https://ctolunchnyc.substack.com/p/cto-lunch-nyc-winter-2026) | Commentary; no original task evaluation used |
| Latent Space / AINews | [Pi release coverage](https://swyx.substack.com/p/ainews-pi-10-pi-durable-and-aie-nyc) — 2 Oct 2026 | Ecosystem coverage; public portion reviewed, remainder paywalled |
| Hungry Minds / Alexandre Zajac | [Newsletter including a Codemode explainer](https://hungrymindsdev.substack.com/p/airbnb-tested-db-migrations-with) — 12 Oct 2026 | Discovery link; no independent Code Mode measurement |
| CTO at NCSC | [Week-ending October 4 reading list](https://ctoatncsc.substack.com/p/cto-at-ncsc-summary-week-ending-october-8fd) | Discovery route to the Hex-Rays primary source |
| InstaTunnel | [Agents and local tunnels](https://instatunnel.substack.com/p/letting-ai-agents-manage-your-local) | Secondary Cloudflare integration/context |
| kgb data-driven research | [Opinion on the efficiency claim](https://kgbgk.substack.com/p/the-999-efficiency-trap-how-cloudflare) — 23 Feb 2026 | Opinion; not used to establish performance or labor-market claims |
| Rick Hightower | [Pi software-factory discussion](https://rickhigh.substack.com/p/pi-ai-software-factories) — 4 Nov 2026 | Indexed transcript summary; insufficient benchmark detail for its numerical claim |

Substack pages that failed in the search tool were checked through their public HTML where available. Paid text was not accessed. The blog relies on accessible original experiments or primary documentation, rather than treating newsletter repetition as corroborating trials.

## Original evaluations and related evidence

| Source | Material used | Limitation to retain |
| --- | --- | --- |
| [Anthropic MCP code execution](https://www.anthropic.com/research/code-execution-with-mcp) — 4 Nov 2025 | Worked example | Not a multi-task trial |
| [Anthropic advanced tool use](https://www.anthropic.com/research/advanced-tool-use) — 24 Nov 2025 | Programmatic-call evaluation | Internal task/model configuration |
| [Pydantic task evaluation](https://pydantic.dev/articles/why-code-mode-is-the-future) — 28 Oct 2026 | Task-size and batching results | Internal benchmark; different runtime |
| [Bifrost comparison report](https://github.com/maximhq/bifrost-benchmarking/blob/main/mcp-code-mode-benchmark/benchmark_report.md) and [runner](https://github.com/maximhq/bifrost-benchmarking/tree/main/mcp-code-mode-benchmark) | Catalog scaling | Vendor-run comparison, grading/rerun details |
| [Hex-Rays IDA MCP](https://hex-rays.com/blog/hex-rays-ida-mcp-server) | Original domain-specific claim | Limited public protocol detail |
| [Abhishek Rai preprint](https://arxiv.org/html/2611.19123v1) — 14 Nov 2026 | Return-shape ablation | Recent preprint, mock environment |

Anthropic's advanced-tool-use page discusses Tool Search and Programmatic Tool Calling separately. The former's figures should not be relabeled as results of executing a generated program. The blog's relevant row explicitly identifies programmatic calling.

For Bifrost, the blog uses the overall summary's cumulative-token and total-wall-time comparisons. Its costs are estimates at stated prices.

## How claims were handled

- Token percentages were checked against their named baseline and labeled as catalog footprint, prompt usage, or cumulative task usage.
- Reported cost estimates remain estimates. No claim is made about the bill for this repository.
- Original provider reports, controlled experiments, demonstrations, and commentary remain distinct evidence categories.
- Faster sandbox startup is kept separate from faster end-to-end task completion.
- Architecture claims do not replace host-side authorization. Tool visibility and sandboxing are not permission systems by themselves.
- No external result is presented as a benchmark of NitroStack or Incident Desk.
- The proposed evaluation in the blog has not been run. Existing local checks remain the tests and stack verification recorded in [VERIFICATION.md](../VERIFICATION.md).

The research changes the article's framing and sections. It does not change application behavior or manufacture a new benchmark for it.
