# Engineering decisions

Status: implemented local example. Recorded 17 November 2026. Scope: a useful Code Mode application, operational visibility in Grafana, and an explanation grounded in running code.

## 1. An incident investigator gives the orchestration a reason to exist

The application compares service behavior across two windows and gathers additional evidence only where it is useful. That creates a dependency between calls: the metrics decide whether deployment and error tools should run. An arithmetic demo would exercise JavaScript without demonstrating why an agent benefits from Code Mode. A full incident-response system would introduce credentials, production access, and write operations before the execution model was understandable.

The chosen boundary is evidence collection. It returns a ranked investigation report. It does not roll back deployments, restart services, page engineers, or claim to have established a root cause.

## 2. Use the actual NitroStack sandbox

`ObservedCodeMode` extends the published `CodeModeTransform` and calls `super.execute()`. NitroStack owns the QuickJS runtime, worker pool, tool bridge, schema checks, and execution limits. There is no host `eval`, `new Function`, fake interpreter, or home-grown approximation of Code Mode.

The programmatic `Tool` and `NitroStackServer` APIs fit four small handlers and a transform with explicit dependencies. Decorators and a DI module graph would also work, but add indirection here without adding useful separation. The application still exercises NitroStack's real catalog transform and MCP transport.

## 3. Reviewed workflow for the demo; generated code through MCP when wanted

The default HTTP endpoint submits `workflows/triage.js`. Its behavior is deterministic and reviewable, which makes tests and the blog reproducible. Requiring a model key would make installation depend on a provider, credentials, billing, model behavior, and prompt quality.

The custom-code endpoint and MCP `execute` tool remain available. An AI client can discover schemas and write a different program. The distinction matters: the default endpoint demonstrates the execution mechanism; it is not itself a natural-language agent.

## 4. A fixed snapshot makes correctness testable

The checked-in JSON records three services, request/error counts, per-window latency, deployments, and sampled errors. Its observation time is fixed and appears in the report and Grafana evidence section. We do not move the timestamps forward on every start or disguise fixtures as a production incident.

A live Prometheus/Loki/GitHub integration would be a sensible next adapter. It would also need data-source permissions, query budgets, field redaction, backend deadlines, and snapshot consistency. A fixture keeps those concerns outside the first implementation while preserving useful tool contracts. The schema validates the file at startup, before workers receive data.

## 5. Compare error fractions, not raw error counts

Traffic changes can increase error counts without increasing failure probability. The workflow divides errors by requests in each window. Equal window durations make the report easier to interpret; the schema rejects unequal or overlapping comparison windows.

The policy is intentionally small:

- Critical: at least 5% errors, or p95 at least one second and at least twice the baseline.
- Watch: at least 1% errors and an increase of at least 50%, including a new nonzero error population from a zero-error baseline.

These thresholds are demo policy, not statistical significance tests or universal SLOs. Counts must be positive and bounded. The 3/2 watch boundary is compared with integer cross-products so the exact 1.2% → 1.8% fixture is not misclassified by floating-point multiplication. Bounds keep those products within JavaScript's safe integer range. Percentile values are supplied per window; the application does not average percentiles to invent an aggregate p95.

## 6. Fetch detail after identifying a candidate

All services need a metrics comparison. Only flagged services need deployment and error details. The provided investigation uses one catalog call, three metrics calls, and two detail calls for each of two flagged services: eight host calls.

The code deliberately executes these calls sequentially. There are three services and inexpensive fixture reads. Parallel fan-out would add load-shaping questions without a meaningful benefit. A future live adapter can use bounded concurrency; unbounded `Promise.all` over an untrusted service list would be a poor default.

## 7. Code Mode changes where orchestration happens

An MCP client discovers tools, reads schemas, then submits a script. Inside that execution, `callTool` still invokes individual host tools. Those backend calls do not disappear. Discovery and schema retrieval may also require model/client interactions.

The benefit being demonstrated is that intermediate results can stay within the execution environment while the script joins, filters, and aggregates them. This project does not claim an eightfold latency improvement, a particular token saving, atomic execution, or a benchmark win. There is no model in the repeatable demo and no measured token baseline.

## 8. Read-only capabilities make the example easier to reason about

The four registered tools read evidence and have read-only annotations. No file-system, shell, deployment, or arbitrary HTTP tool is registered. The SDK also receives `allowDestructive: false`.

Annotations describe behavior; they do not prove it. The handlers are read-only because of their implementations. A sandbox limits guest computation, but a host tool is a granted capability. If a future handler can delete infrastructure, the sandbox does not make that action harmless or roll it back after a timeout. Tool discovery is not an authorization system either; a hidden raw tool name must not be treated as a security boundary.

## 9. Separate admission from the worker pool

Two workers execute scripts. At most four requests are admitted, including those waiting for a worker. Extra requests receive 429 before a worker job is created. This bounds the application's contribution to the SDK queue and gives clients an explicit backpressure signal.

We could queue every request and hope the execution deadline would contain resource use. That leaves a growing set of promises and request state under sustained overload. A bounded admission count is simpler to inspect and test. The SDK's execution timeout and this application's wall-clock duration are different measurements: the latter includes queue wait. A slow live host handler would also need its own deadline and cancellation support.

## 10. Instrument both ingress paths in one place

HTTP and MCP both invoke `ObservedCodeMode.run()`. The MCP `execute` resolution returns a wrapper that routes through that method, rather than returning the SDK's uninstrumented execution handler. Direct HTTP execution calls the same method.

This avoids a common partial implementation where the demo endpoint is measured but real agent executions bypass its counters and limits. Tests open a real stdio MCP client, discover tools, fetch a schema, and execute code through that path.

## 11. Telemetry separates outcomes, capacity, and evidence

Completed runs have success/error labels. Admission rejections are counted separately. Host tool calls count handler entries; arguments rejected by an earlier SDK validation stage may never enter a handler. A failed run can therefore have zero measured host handler calls.

Runtime histograms describe execution and handler time. Snapshot gauges describe fixed incident evidence. Latest-finding gauges update only when the canonical workflow succeeds. A custom script returning an object called `findings` does not change the canonical evidence panels.

Metrics do not use script text, request IDs, errors, deployment versions, or timestamps as label values. Those would create unnecessary cardinality. Run identifiers and a SHA-256 code hash live in bounded history and structured logs. No submitted source or returned evidence is logged by the application, although a caller-authored error message can appear in a truncated error summary.

## 12. Histograms and a scrape pipeline fit the question

Prometheus is a natural fit for counters, gauges, and aggregatable latency distributions. Grafana queries the store; it is not used as the metric database. Classic histograms are widely supported and let the dashboard estimate p95 with explicit bucket bounds.

A full OpenTelemetry collector, trace backend, log store, and exemplars would be useful when requests cross live systems. Here they would add services before there is a distributed trace to explain. The initial stack therefore uses one metrics backend and logs to stderr. We switched from the deprecated `prom-client` name to its maintained successor, `@prometheus-io/client`, after checking its API and runtime requirements.

Five-second scrapes help a short demo populate quickly. They can miss very brief active-worker peaks. Counters retain completed work, while queue and worker gauges are instantaneous observations. A blank latency graph after inactivity is more honest than substituting a zero-latency sample.

## 13. Provision Grafana from versioned files

Datasource and dashboard providers live in YAML; the dashboard JSON is committed. `scripts/dashboard.mjs` defines the panels without forcing a reviewer to edit repeated JSON by hand. Grafana reloads the generated file. UI edits are disabled so changes do not silently diverge from the repository.

Creating dashboards through an API would work, but requires setup credentials and lifecycle handling. File provisioning gives the local example a single startup command and a stable dashboard UID. Panel descriptions state units and interpretation. The evidence row explicitly labels its fixed synthetic source.

## 14. Use memory for run summaries, persistent volumes for the default monitoring stack

The application keeps only the latest 100 run summaries, in memory. It does not store script source or full results. Adding SQLite solely to retain demo history would introduce migrations and retention policy without improving the execution lesson.

Default Compose uses named volumes for Prometheus and Grafana. Verification on this machine encountered a full Docker data volume. `compose.ephemeral.yaml` replaces only those services' data targets with 128 MiB temporary filesystems. It leaves existing named volumes intact. The disposable variant is for short demonstrations; its data is lost on container recreation and it has a finite memory budget. No unrelated Docker images, volumes, or containers were pruned.

## 15. Keep local access simple and explicit

Published ports bind to loopback. Anonymous Grafana access is Viewer-only; the demo admin credentials are documented and configurable. The HTTP API can require a bearer token. Metrics and health stay accessible to local scraping. Browser-origin API calls are rejected because the project has no browser execution interface that needs them.

The stdio MCP process is a separate local trust boundary. Starting it while Compose is running creates another application instance; the existing dashboard does not magically observe it. The README explains how to scrape that process separately. We avoided implementing a custom JSON-RPC server or exposing another unauthenticated MCP HTTP endpoint merely to combine ports.

This is not an internet deployment design. A shared service would need per-user authentication and authorization, tenant-specific capabilities, durable audit storage, transport-level rate limits, resource isolation, and a dependency upgrade review.

## 16. Pin versions and make an SDK lifecycle workaround explicit

The package lock fixes the dependency graph. Container images are pinned to verified registry digests. The application uses Node.js 22; the maintained Prometheus client supports Node 22 and 24, so the README names those runtimes rather than promising every newer odd-numbered release.

NitroStack 1.1.3's rate-limit decorator starts a global cleanup interval during import without calling `.unref()`. Closing the SDK server does not own that interval. Integration tests exposed the result: completed test processes stayed alive. The postinstall script changes exactly that expression to an unreferenced timer. It is idempotent and refuses to proceed if the expected text is absent. This is preferable to forcing test processes to exit and concealing the lifecycle problem. Remove the patch after an SDK release fixes the timer and the shutdown checks still pass.

## 17. An audit finding remains; do not hide it with a major-version override

At verification time, `npm audit` reports [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): oversized constrained collections can exhaust memory in affected Zod versions. The SDK declares Zod 3; the audit lists the fixed line as Zod 4.6.6 or later, and reports no compatible fix for this SDK graph. Both the direct Zod dependency and its dependent SDK are marked high severity; these are two package findings for the same advisory chain.

We have not forced Zod 4 under a Zod 3 SDK. That would make the audit superficially quieter while potentially breaking schema detection or validation. The application's HTTP request-size cap, source cap, bounded fixture, and scalar tool inputs narrow the inputs it accepts, but do not constitute a general fix for the dependency. The remaining finding is documented as a limitation. Before public deployment, adopt a compatible patched SDK/dependency graph and rerun validation and sandbox tests.

## 18. Validate the behavior that can fail

The tests run actual QuickJS and the real MCP client. They check exact evidence results, isolation across runs, denied globals, invalid tool inputs, recursive meta-tool rejection, timeout recovery, budgets, admission pressure, and HTTP boundaries. The stack smoke check queries Prometheus and Grafana APIs rather than treating an HTTP 200 from the application as end-to-end success. Every panel expression is executed against the running Prometheus instance.

The checked-in response, verification record, and screenshots are evidence from this implementation. They do not establish production load capacity, statistical detection quality, token savings, or safety for hostile multi-tenant workloads.

## Reference material

- [NitroStack Code Mode](https://docs.nitrostack.ai/docs/sdk/transforms/code-mode)
- [NitroStack source](https://github.com/nitrocloudofficial/nitrostack)
- [Prometheus instrumentation practices](https://prometheus.io/docs/practices/instrumentation/)
- [Prometheus histograms](https://prometheus.io/docs/practices/histograms/)
- [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Prometheus JavaScript client](https://github.com/prometheus/client_js)
