# Published Code Mode benchmark notes

Checked 17 November 2026. Supporting material for the [company article](../../BLOG.md); these figures do not describe measured gains in Incident Desk.

## What each number measures

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


## Task size, batching, and evaluation limits

Pydantic’s evaluation is relevant because it includes small CRUD applications. The results change with task size: at five items, Code Mode costs more on three of five scaling tasks, by 21–38%. At 200 items, it is 47–75% cheaper across those tasks.

There is also a good correction to the usual round-trip explanation. In one calendar example, direct calling already batches 205 tool calls into eight model requests. Code Mode uses six model requests and 215 tool calls, yet takes 28.5 seconds rather than 119.5. Backend work did not disappear. The model carried less orchestration and intermediate data. These are internal benchmark results, not a prediction for NitroStack. [Pydantic’s results and methodology](https://pydantic.dev/articles/why-code-mode-is-the-future).

Bifrost shows another distinction. Its input-token reduction grows from **58.2% at 96 tools**, to **84.5% at 251**, to **92.8% at 508**. The corresponding total wall-time reductions are **26.8%, 6.8%, and 17.1%**. In the largest round, output tokens increase **72.2%**, while estimated cost falls **92.2%**. A token saving is plainly not the same percentage improvement in elapsed time. The report also describes reruns and cases accepted with partial data, which matter when interpreting its pass rates. [Original report](https://github.com/maximhq/bifrost-benchmarking/blob/main/mcp-code-mode-benchmark/benchmark_report.md).

A [November 2026 preprint by Abhishek Rai](https://arxiv.org/html/2611.19123v1) adds a detail I would test before tuning execution speed: output contracts. In its controlled mock-tool environment, removing return-shape hints reduces success by 22.7 and 39.5 percentage points for two models. The proposed extra routing layer does not show a statistically confirmed improvement over Code Mode alone. This is a recent preprint with a synthetic environment, but it is a useful warning against attributing every result to the execution architecture.

For Incident Desk, these findings argue for a modest first goal: make a dependent workflow easy to inspect, keep its tool contracts clear, and measure the runtime. A model-quality or cost claim needs a separate experiment.


See the [source register](CODE_MODE_SOURCES.md) for the wider reading trail.
