# Code Mode beyond the token-saving headlines

*Cloudflare’s catalog numbers, the experiments on Substack, and a small incident investigator built with NitroStack and Grafana.*

The number that gets repeated is 99.9%. Cloudflare can put its API behind a Code Mode interface that takes roughly a thousand tokens to describe. If you have spent time pruning an agent’s tool list, that is an appealing result.

But I have four tools in Incident Desk, not thousands of API endpoints. Applying that percentage to this application would tell us very little.

I went through Cloudflare’s original posts, the implementation writeups on Substack, and the published comparisons behind the claims. The useful question became more specific: when does moving a workflow into code reduce the work the model has to do, and what does running that workflow cost?

Incident Desk is a small way to examine that question. It investigates a synthetic service regression through NitroStack’s real Code Mode runtime. Grafana shows the executions. The project is [on GitHub](https://github.com/satyampsoni/incident-desk); the evidence behind the article is linked below.

## First, separate the measurements

There are at least three costs in play: describing the available tools, carrying out the task, and starting the environment that runs the generated code. A result about one cannot answer a question about the others.

Here is the evidence I found most useful. These are the publishers’ results, not measurements from Incident Desk.

| Source and setup | Reported result | What the comparison covers |
| --- | --- | --- |
| [Cloudflare API MCP, February 2026](https://blog.cloudflare.com/code-mode-mcp/) | About **1.17 million → 1,000 tokens**, reported as **99.9% less** | The initial tool-interface footprint; discovery and task execution add work |
| [Cloudflare enterprise portal](https://blog.cloudflare.com/enterprise-mcp/) | **52 tools**, about **9,400 → 600 tokens**, reported as **94% less** | Definitions from four internal MCP servers, replaced by a discovery/execution interface |
| [Anthropic’s MCP code-execution example](https://www.anthropic.com/research/code-execution-with-mcp) | **150,000 → 2,000 tokens**, reported as **98.7% less** | Loading relevant tool definitions in the illustrated workflow; not a repeated multi-task evaluation |
| [Anthropic’s programmatic tool calling](https://www.anthropic.com/research/advanced-tool-use) | **43,588 → 27,297 tokens**, a reported **37% reduction** | Average token usage on complex research tasks in its internal evaluation |
| [Michael Levan’s Substack comparison](https://michaellevan.substack.com/p/a-week-in-ai-issue-16) | **13,869 → 1,368 prompt tokens**, reported as **90.14% less** | A GitHub MCP comparison; the post does not establish a broad repeated-task benchmark |
| [Pydantic’s October 2026 evaluation](https://pydantic.dev/articles/why-code-mode-is-the-future) | On long tasks: **58% lower cost**, **51% less wall time**, **+16 percentage points** success | Eight models; 5,276 graded runs overall, with 288 runs per arm in the long-task tier |
| [Bifrost’s published report](https://github.com/maximhq/bifrost-benchmarking/blob/main/mcp-code-mode-benchmark/benchmark_report.md) | At 508 tools: **92.8% fewer input tokens**, **17.1% less total wall time** | A vendor-run, 65-query comparison using Claude Sonnet 4.6; cumulative agent-loop tokens |
| [Hex-Rays’ IDA MCP announcement](https://hex-rays.com/blog/hex-rays-ida-mcp-server) | Approximately **20% fewer tokens** | An internal malware-analysis evaluation against other implementations; limited methodological detail in the announcement |

The percentages belong beside their denominators. A catalog token count is useful for sizing an integration. A repeated task evaluation is useful for choosing an execution strategy. Neither gives this project a performance result by association.

The same applies to cost. Fewer uncached input tokens, fewer cached input tokens, and fewer output tokens have different billing effects. A subscription may not change price at all. For an application, I would compare the total cost of a correct result, including unsuccessful attempts.

## What Cloudflare actually changed

In [September 2025, Kenton Varda and Sunil Pai](https://blog.cloudflare.com/code-mode/) described converting MCP tools into a TypeScript API and asking the model to write the code that uses it. The program can pass a result into the next call without asking the model to reproduce that result as another set of arguments.

The [February API server](https://blog.cloudflare.com/code-mode-mcp/) put this behind MCP itself. The client gets `search` and `execute`: discover operations, then submit a program. Its initial interface is small; discovery and execution still add work.

Cloudflare subsequently applied the approach at an [enterprise portal](https://blog.cloudflare.com/enterprise-mcp/), in its [internal engineering stack](https://blog.cloudflare.com/internal-ai-engineering-stack/), and in [Skipper, its data-platform agent](https://blog.cloudflare.com/our-unified-data-platform/). That is an important deployment choice: the execution interface can live in front of several existing servers, rather than requiring every upstream API to be redesigned.

The [current documentation](https://developers.cloudflare.com/agents/tools/codemode/) also covers progressive discovery, reusable snippets, and integrations beyond the original API server. Its discovery surface has evolved. Treat Code Mode as an execution pattern; check the particular SDK’s contracts before copying an example.

The protocol and the execution strategy are separate decisions. An MCP client can load tools selectively. A direct-tool client can batch independent calls. A useful comparison should say whether its baseline does those things.

## Substack is useful when you follow the claim back to the experiment

The practitioner posts explain why someone would bother changing a working agent.

[Youssef Hosni’s Bifrost walkthrough](https://todatabeyond.substack.com/p/how-i-use-bifrost-mcp-gateway-and) is about controlling access as much as saving context: tool filtering, virtual keys, and a gateway shared by clients. Its benchmark discussion leads back to Bifrost’s report. I would read it as a setup guide, then use the report to assess the numbers.

[Juan Velasquez’s account at GuruSup](https://odzen.substack.com/p/what-changed-when-our-agents-started) is closer to this application. A program pages through overdue tickets and groups them by customer. His demonstrated run uses two model requests instead of four. He also notes that some programs returned selected fields while others printed entire responses. Writing code only helps context use if the returned data is appropriately shaped.

[Dan Cucolea’s portal article](https://allagentsconsidered.substack.com/p/one-mcp-to-rule-them-all) makes the operational tradeoff clear: a shared connection is easier to manage, but becomes another dependency on the request path. [Architecture Corner](https://architecturecorner.substack.com/p/code-mode-a-better-way-to-use-mcp) places the approach alongside narrower servers and CLI/skill-based integration. Those are reasonable alternatives for a small tool set.

The [This Week in NET conversation](https://thisweekinnet.substack.com/p/code-mode-giving-ai-agents-an-entire) provides demos with Cloudflare’s Matt Carey. Its description uses an estimate of more than two million tokens; the currently accessible technical post says 1.17 million. I use the technical post’s figure in the table rather than combining the two.

Michael Levan’s comparison is useful as a reported observation. Its prompt-token reduction does not justify dividing a different application’s whole bill by ten. We need the model, workload, cache behavior, retries, and correctness results before making that prediction.

These posts describe different experiences. Repeating the same Cloudflare figure across several newsletters does not create several independent benchmarks.

## The task benchmarks are more interesting than the biggest percentage

Pydantic’s evaluation is relevant because it includes small CRUD applications. The results change with task size: at five items, Code Mode costs more on three of five scaling tasks, by 21–38%. At 200 items, it is 47–75% cheaper across those tasks.

There is also a good correction to the usual round-trip explanation. In one calendar example, direct calling already batches 205 tool calls into eight model requests. Code Mode uses six model requests and 215 tool calls, yet takes 28.5 seconds rather than 119.5. Backend work did not disappear. The model carried less orchestration and intermediate data. These are internal benchmark results, not a prediction for NitroStack. [Pydantic’s results and methodology](https://pydantic.dev/articles/why-code-mode-is-the-future).

Bifrost shows another distinction. Its input-token reduction grows from **58.2% at 96 tools**, to **84.5% at 251**, to **92.8% at 508**. The corresponding total wall-time reductions are **26.8%, 6.8%, and 17.1%**. In the largest round, output tokens increase **72.2%**, while estimated cost falls **92.2%**. A token saving is plainly not the same percentage improvement in elapsed time. The report also describes reruns and cases accepted with partial data, which matter when interpreting its pass rates. [Original report](https://github.com/maximhq/bifrost-benchmarking/blob/main/mcp-code-mode-benchmark/benchmark_report.md).

A [November 2026 preprint by Abhishek Rai](https://arxiv.org/html/2611.19123v1) adds a detail I would test before tuning execution speed: output contracts. In its controlled mock-tool environment, removing return-shape hints reduces success by 22.7 and 39.5 percentage points for two models. The proposed extra routing layer does not show a statistically confirmed improvement over Code Mode alone. This is a recent preprint with a synthetic environment, but it is a useful warning against attributing every result to the execution architecture.

For Incident Desk, these findings argue for a modest first goal: make a dependent workflow easy to inspect, keep its tool contracts clear, and measure the runtime. A model-quality or cost claim needs a separate experiment.

## The application: collect evidence before suggesting an action

Incident Desk has three services in a fixed synthetic snapshot. The question is straightforward: which services got worse between two observation windows, and what evidence should an engineer examine next?

Checkout’s error rate goes from 0.5% to 6%. Its p95 latency goes from 210 ms to 1,480 ms. There is a recent deployment and a sample of address-provider timeouts. Inventory’s error rate goes from 1.2% to 1.8%. Payments stays at 0.5%.

The application exposes four read-only tools:

| Tool | Evidence |
| --- | --- |
| `services_list` | Service identities, owners, snapshot time, comparison windows |
| `metrics_compare` | Request counts, errors, and supplied p95 values for both windows |
| `deployments_list` | Deployment records for one service |
| `errors_sample` | A bounded sample of error records |

The [canonical workflow](workflows/triage.js) reads the catalog, compares each service, and requests deployments and errors only for services that cross the policy thresholds. It returns checkout as critical, inventory as watch, and leaves healthy payments out of the findings.

That is eight host tool calls: one catalog read, three comparisons, and four detail reads. The work happens inside one execution request.

Here is the tool-composition part, shortened to show the control flow:

```javascript
const catalog = await callTool('services_list', {});
const evidence = [];

for (const service of catalog.services) {
  const metrics = await callTool('metrics_compare', { service: service.id });
  const errorRate = metrics.after.errors / metrics.after.requests;
  if (errorRate < 0.05) continue;

  evidence.push({
    service: service.id,
    errorRate,
    deployments: await callTool('deployments_list', { service: service.id }),
    errors: await callTool('errors_sample', { service: service.id }),
  });
}

return evidence;
```

This excerpt only demonstrates the critical error-rate branch. The complete workflow also handles latency regression, the watch threshold, zero-error baselines, ranking, and provenance.

There is no reason to have a model calculate these fractions in prose. There is also no reason to call a deployment tool for every healthy service. The program expresses both decisions directly.

The deployment remains evidence to investigate. The report does not claim that timing proves causation, and the application cannot perform a rollback. If this were a permanent, unchanging reporting requirement, an ordinary reviewed backend function would be a good choice. Code Mode becomes more useful when a caller needs to compose the same tools differently for the next question.

## Why NitroStack here, rather than a Cloudflare Worker

I wanted the example to run locally without an account or a model key. NitroStack provides the execution runtime and MCP interface in a Node.js application. Cloudflare’s implementation provides a different deployment environment. Choosing between them involves where the application should run and which capabilities it needs.

| This project | Cloudflare’s implementation |
| --- | --- |
| QuickJS WebAssembly in a Node worker pool | V8 isolates through Dynamic Workers |
| Registered read-only host tools | Capabilities supplied to the Worker environment |
| NitroStack meta-tools: `search`, `get_schema`, `execute` | API-server interface: `search`, `execute`; other integrations have their own discovery contracts |
| Local HTTP and optional stdio MCP access | Cloudflare-hosted runtime and MCP integrations |

Cloudflare’s [“100x faster” sandboxing post](https://blog.cloudflare.com/dynamic-workers/) compares isolate startup with a typical container: a few milliseconds and a few megabytes for the isolate. That is a runtime-startup claim. It does not compare this QuickJS application with Cloudflare, or establish a 100-fold improvement in a complete agent task.

In Incident Desk, [the execution wrapper](src/runtime.ts) delegates to NitroStack’s actual `CodeModeTransform`. It adds admission and telemetry around that execution. The defaults are two workers, a 64 MiB per-sandbox limit, a three-second execution deadline, and 24 tool calls. At most four executions can be running or waiting. The next request gets 429.

HTTP and MCP execution enter that same wrapper. Otherwise it would be easy to measure the demonstration endpoint and miss the scripts submitted by an actual client. An MCP client can discover the tools, inspect their inputs, and submit a different script through `execute`. The default HTTP investigation endpoint submits the reviewed workflow; it does not secretly invoke a model.

The guest has no Node globals or general network access. Host tools remain the authority boundary. Adding a powerful tool would grant a powerful capability; putting it behind a sandbox would not make it read-only. Cloudflare’s [execution-model documentation](https://developers.cloudflare.com/agents/tools/codemode/how-it-works/) is useful reading for the separation between generated code and the host operations it can request.

## What Grafana tells me about a run

An execution can look like one successful tool call to the client while doing several things behind that boundary. I wanted the dashboard to expose enough of that work to investigate a problem.

![Runtime overview from the running Grafana instance](docs/assets/dashboard-overview.png)

The top panels show completed runs, outcome, calls per run, current admission, and worker capacity. The graphs show execution rate, duration, tool activity, handler duration, and admission rejections. Process memory and returned result size give some context when a run grows unexpectedly.

The measurements have specific meanings. Run duration includes queue wait. Host-call metrics count handler entries; schema validation can reject a call before it enters a handler. A request rejected at capacity is recorded separately from a script that started and failed. Five-second scrapes can miss brief queue peaks.

The duration p95 is a histogram estimate over observed executions. A worker gauge sitting at zero during fast fixture reads is plausible. Neither panel should be converted into a claim about model inference latency or total agent cost.

The evidence section is separate:

![Fixed synthetic incident evidence](docs/assets/dashboard-evidence.png)

Those error fractions and latency values come from the fixture, observed at its stated timestamp. The execution graphs come from actual runs. Finding counts update after the canonical workflow succeeds. Custom scripts cannot overwrite those counts by returning an object named `findings`.

The screenshots include deliberately failed runs from the traffic generator. They show that the monitoring path works; they are not a success-rate evaluation of an AI model.

## What this build establishes, and the benchmark I would run next

The repository has ten passing integration tests using real QuickJS workers and a real MCP client. They cover the expected report, input validation, isolation, timeout recovery, tool budgets, admission, and HTTP boundaries. The stack check verifies Prometheus ingestion, the provisioned dashboard, all 21 panel expressions, and three alert rules. [Recorded verification](docs/VERIFICATION.md).

It has no measured token saving, model-task success rate, or direct-tool comparison. It also has a documented SDK cleanup-timer patch and an unresolved Zod dependency advisory. Those details belong in the [decision record](DECISIONS.md) when deciding whether to take the example further.

For a useful next experiment, I would compare three agent configurations:

| Arm | What the client gets |
| --- | --- |
| Direct tools | The four tools, with independent-call batching enabled |
| Discovery plus direct calls | The same tools loaded selectively, without script execution |
| Code Mode | Discovery and schemas, then a generated investigation program |

Every arm needs the same evidence, permissions, input and output contracts, model version, and required answer. The final report should be graded for correct service classifications, preserved evidence, and unsupported causal claims. An empty but cheap report is a failure.

I would repeat paired tasks at several sizes and report distributions, rather than select the best trace. Input, cached input, output, retries, billed cost, model requests, backend tool calls, and end-to-end duration should be separate fields. Runtime-only timing can then be examined alongside the full task timing.

The catalog and workload should grow independently. Adding irrelevant tool definitions tests discovery overhead. Adding services tests orchestration and data handling. For the latter, the default tool budget must scale: this workflow needs `1 + service count + 2 × flagged service count` calls. Leaving a 24-call limit in place while expanding the fixture could turn a configuration limit into a misleading accuracy result.

I would also test missing fields, empty deployments, backend errors, and timeouts. If a model needs three repairs before its script works, those repairs belong in the result. If an adapter returns a large raw object and the script prints it all back, that belongs in the result too.

This would tell us whether Code Mode helps this workflow. The current build gives us a runnable place to conduct that experiment and observe the execution underneath it.

## Run the example

```bash
docker compose up -d --build

curl -sS http://127.0.0.1:4310/api/investigate \
  -H 'Content-Type: application/json' -d '{}'
```

Open [Grafana](http://127.0.0.1:4311/d/incident-desk). With Node.js 22 or 24, you can populate the graphs and verify the stack:

```bash
npm ci
npm run demo -- --traffic --include-failures --count 60
npm run smoke:stack
```

The [README](README.md) includes the optional stdio MCP setup, configuration, and a disposable-storage variant. For a three-service fixture, use the project to understand the execution path. For a larger integration, use the published evidence to choose a comparison worth running on your own workload.

## Reading notes

Research checked on **17 November 2026**. The [source register](docs/research/CODE_MODE_SOURCES.md) records the wider Cloudflare and Substack search, which pages contain original measurements, and which are commentary or repeat another source’s claim. It also records the 81% retrospective claim, the source discrepancy in the API-catalog estimate, and additional ecosystem coverage that would otherwise distract from the implementation.

For a short reading sequence: start with [Cloudflare’s original proposal](https://blog.cloudflare.com/code-mode/), read [the API-server measurement](https://blog.cloudflare.com/code-mode-mcp/), then [the Pydantic task evaluation](https://pydantic.dev/articles/why-code-mode-is-the-future). Follow with [the GuruSup example](https://odzen.substack.com/p/what-changed-when-our-agents-started) for a small workflow and [the Bifrost report](https://github.com/maximhq/bifrost-benchmarking/blob/main/mcp-code-mode-benchmark/benchmark_report.md) for catalog scaling. They answer different questions, which is what makes the set useful.
