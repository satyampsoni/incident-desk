# Code Mode you can operate: an incident investigator with NitroStack and Grafana

A service starts failing after a release. Before deciding what to do, an engineer needs several kinds of evidence: the request failure rate, the latency change, what was deployed, and what the errors actually say. Those answers usually live behind different tools.

That makes incident investigation a useful place to explore Code Mode. The interesting work is not calling one endpoint. It is deciding which tool to call next, joining the answers, and returning the small part of the evidence that deserves attention.

This walkthrough builds Incident Desk, a read-only investigation service using NitroStack's QuickJS-based Code Mode runtime. It also builds the operational side: Prometheus instrumentation, a provisioned Grafana dashboard, failure exercises, and integration checks.

The included incident data is synthetic. The executions and monitoring pipeline are real. You can reproduce the example without an LLM key, then connect an MCP client when you want a model to write the scripts.

![Incident Desk running in Grafana](docs/assets/dashboard-overview.png)

## Start with a question that needs more than one tool

Our investigation asks:

> Which services regressed between the two observation windows, and what evidence should an engineer inspect next?

The fixture contains three services: checkout, inventory, and payments. Each has request counts, error counts, and a supplied p95 latency for equal 20-minute windows. It also contains deployment metadata and a small, illustrative sample of errors.

The checkout service is the obvious candidate. Its error rate rises from 0.5% to 6%, while p95 latency rises from 210 ms to 1,480 ms. A deployment enables synchronous address validation; the error samples report address-provider timeouts. That combination is worth investigating. It is not proof that the deployment caused the incident.

Inventory shows a smaller increase, from 1.2% errors to 1.8%. Payments remains at 0.5% errors. A useful report should keep the inventory signal without presenting payments as another incident just because its data exists.

Four host tools supply the evidence:

| Tool | What it returns |
| --- | --- |
| `services_list` | Service identities, owners, snapshot provenance, and comparison windows |
| `metrics_compare` | Before/after request counts, error counts, and p95 latency |
| `deployments_list` | Deployment evidence for one service |
| `errors_sample` | A bounded sample of errors for one service |

The tools deliberately do not decide whether a service is unhealthy. The workflow owns that policy. This makes the difference between data access and orchestration visible in the code.

## Move the investigation loop into a program

In a conventional agent loop, the model may fetch a service list, receive the result, ask for metrics, receive those results, and continue asking for deployment and error details. Every decision passes through another model turn.

With NitroStack Code Mode, the client can discover the capabilities, inspect their schemas, and submit a JavaScript program through `execute`. That program uses the asynchronous `callTool` bridge to invoke host tools. NitroStack runs the guest program in a QuickJS WebAssembly sandbox. The model can receive the final report rather than every intermediate object. [NitroStack documents this discovery-and-execution interface](https://docs.nitrostack.ai/docs/sdk/transforms/code-mode).

A minimal investigation looks like this:

```javascript
const catalog = await callTool('services_list', {});
const comparisons = [];

for (const service of catalog.services) {
  const metrics = await callTool('metrics_compare', { service: service.id });
  comparisons.push({
    service: service.id,
    errorRate: metrics.after.errors / metrics.after.requests,
  });
}

return comparisons;
```

The important change is where the loop runs. Backend calls still happen. Tool validation still happens. Discovery can still cost separate client interactions. Code Mode does not turn several operations into a database transaction, and it does not make the network disappear.

For this application, the interesting improvement is structural: the script can retain intermediate evidence, branch on it, and return a compact report from one execution request. We do not attach a token-saving percentage or latency multiplier to that claim; this project has no measured model baseline.

## Make the first example repeatable

The canonical workflow is checked in as `workflows/triage.js`. The HTTP investigation endpoint submits that reviewed file. No model generates it at request time.

That choice makes the example reproducible. A model account, provider SDK, prompt, or stochastic completion cannot change the first-run result. It also gives us a stable program to test against the real sandbox.

This is still a Code Mode application. It runs the actual SDK's worker pool and bridge, and accepts custom programs through the HTTP execution endpoint. The optional stdio MCP transport exposes `search`, `get_schema`, and `execute`, so an AI client can discover the tools and generate its own investigation. The fixed program is the reproducible entry point, not a pretend autonomous agent.

## Write the policy carefully enough to test it

The policy marks a service critical if its error fraction reaches 5%, or if its p95 is at least a second and at least twice the baseline. A watch finding requires an error fraction of at least 1% and a relative increase of at least 50%.

The workflow first reads metrics for every service. It then fetches deployments and errors only for services that cross a threshold. With the supplied fixture, the call count is:

```text
1 service catalog
3 metrics comparisons
2 deployment queries
2 error queries
----------------------
8 host tool calls
```

Healthy payments does not trigger detail requests. This is a small example of why a program is useful: tool selection follows the evidence instead of a fixed “fetch everything” sequence.

One test caught a less glamorous issue. Computing a 50% increase as `afterRate >= beforeRate * 1.5` missed the exact 1.2% to 1.8% boundary because of floating-point rounding. The implementation now compares the rational threshold with integer cross-products:

```javascript
const increasedByHalf =
  metrics.after.errors * metrics.before.requests * 2
  >= metrics.before.errors * metrics.after.requests * 3;
```

The snapshot schema caps request counts so these products stay within JavaScript's safe integer range. This does not turn the policy into a statistical detector. It does make the stated boundary behave as intended.

The report also handles zero-error baselines explicitly rather than dividing by zero and returning an infinite ratio. Positive request counts, unique service IDs, equal window lengths, and non-overlapping windows are validated when the snapshot loads.

## Put limits around an execution, not just around JavaScript

The application configures two workers, a 64 MiB sandbox memory limit, a three-second execution deadline, and a budget of 24 tool calls. It admits at most four running or waiting executions.

The admission bound is separate from the worker count. Two requests can run while two wait; the next request gets HTTP 429 with `Retry-After: 1`. This keeps an enthusiastic client from building an unlimited queue of promises and request state.

There are also limits around the HTTP boundary: 48 KiB request bodies, 32 KiB scripts, and 256 KiB serialized result values. The last check runs after the SDK produces a result, so it should not be mistaken for a host allocation limit. A script should project or aggregate data before returning it.

All four host tools are read-only. Guest code cannot access Node's `process` or `require`, and there is no arbitrary network tool. The SDK is configured to reject destructive tools. These choices reduce the capabilities available to the guest; they do not make every future handler safe by association.

If a later version adds a deployment tool, that handler's side effects would still happen in the host system. A sandbox timeout cannot undo a completed rollback or cancel a payment. A live data adapter would also need its own abortable I/O and backend deadline. The fixture handlers are synchronous, bounded reads, so they do not hide a hanging upstream request.

## Measure the path that real clients use

It is easy to instrument a convenient demonstration endpoint and miss the actual agent path. Incident Desk avoids that by putting admission and execution measurements in `ObservedCodeMode.run()`.

HTTP submits to that method directly. The MCP resolution for `execute` returns a tool wrapper that calls the same method. The underlying computation still delegates to NitroStack's `CodeModeTransform.execute()`.

Each completed run records its outcome, wall-clock duration, host handler entries, result size, and a code hash. The wall-clock duration includes time waiting for a worker. Histograms capture latency distributions. A bounded in-memory history retains the latest 100 summaries, and structured completion events go to stderr so stdout remains valid MCP traffic.

Admission rejections are separate from completed errors. A request rejected at capacity never entered the sandbox; calling it a failed script would hide the operational distinction.

Host-call metrics also have a precise meaning: they count calls that entered a host handler. An invalid argument can fail the SDK's schema validation before that point. Consequently, a failed execution can correctly have zero handler entries. Metric names and panel descriptions need to say what was measured rather than imply a more comprehensive count.

Run IDs, script bodies, timestamps, and deployment versions are not metric labels. The small label sets are workflow, outcome, known tool name, and the bounded fixture service identities. Prometheus explicitly warns that every label combination creates a time series, so cardinality belongs in the design rather than in a cleanup exercise later. [Prometheus instrumentation guidance](https://prometheus.io/docs/practices/instrumentation/).

## Give Grafana two clearly separated stories

The dashboard's first story is operational:

- How many executions completed, and how many succeeded?
- What is the recent p95 execution duration?
- How many host tools does a run invoke?
- Are workers busy, is anything queued, and are requests being rejected?
- Which handlers receive traffic, and what do their latency distributions look like?
- What is happening to process memory and returned result size?

Prometheus scrapes the app every five seconds. Counters preserve completed events between scrapes, but instantaneous worker and queue gauges can miss short bursts. A mostly empty queue graph during a fast fixture workload is not evidence that queuing is impossible.

The run-duration panel uses a histogram quantile:

```promql
histogram_quantile(
  0.95,
  sum by (le, workflow) (
    rate(incident_desk_run_duration_seconds_bucket[$__rate_interval])
  )
)
```

This is an estimate based on configured buckets and recent observations. It can be blank while idle. Substituting zero would suggest an observation that did not happen. [Prometheus explains the limitations and aggregation properties of histograms](https://prometheus.io/docs/practices/histograms/).

The second story is the incident evidence. That row is explicitly labeled **FIXED DEMO SNAPSHOT**, with the observation timestamp and comparison windows. Its bars show the supplied service error fractions and p95 latency. Latest-finding counts update after the canonical triage workflow succeeds. A custom script cannot publish a fake canonical finding just by returning a similarly named object.

This separation matters. A service's 6% error rate is incident evidence; a failed sandbox execution is application behavior. Putting both under a generic “errors” heading would make the dashboard harder to reason about.

![The separately labeled evidence section](docs/assets/dashboard-evidence.png)

## Provision the dashboard as part of the application

Compose starts the app, Prometheus, and Grafana. Datasource and dashboard providers are committed YAML. The dashboard has a stable UID and a committed JSON definition generated by `scripts/dashboard.mjs`.

Grafana loads that definition from a mounted directory. UI editing is disabled so repository changes remain authoritative. This avoids a setup sequence where someone must log in, add the right datasource, import JSON, and remember which settings were changed. [Grafana's file provisioning mechanism supports this workflow](https://grafana.com/docs/grafana/latest/administration/provisioning/).

Three Prometheus rules cover an unavailable scrape target, a sustained execution-error fraction with a minimum sample count, and sustained admission pressure. The rules are evaluated locally. Notification routing is outside this example; a valid alert expression does not itself deliver a page.

Default Compose uses persistent named volumes. The machine used for verification had a full Docker data volume, which prevented Grafana's database and Prometheus's storage from initializing. We did not prune unrelated data. An optional Compose override puts only these demo stores in temporary filesystems. That disposable mode is useful for a walkthrough, but its history disappears when containers are recreated.

## Exercise failures before writing the success story

The application tests use the real QuickJS runtime. They check the expected evidence report, fresh interpreter state, missing host globals, invalid arguments, unknown tools, and nested meta-tool rejection. They also run an infinite loop, confirm that it times out, and then execute another script to verify recovery.

Separate tests cover the tool-call budget, bounded admission, code/result limits, HTTP authentication and payload handling, and an actual MCP client session. The client lists the meta-tools, searches, asks for a schema, and executes a script. This is more useful than mocking the sandbox and asserting that a wrapper called a method.

Those tests exposed an SDK lifecycle detail too. NitroStack 1.1.3 starts an import-time cleanup interval in its rate-limit decorator. That timer kept completed CLI and test processes alive even after the server stopped. The installation includes a narrow, checked patch that calls `.unref()` on that interval. It is documented, idempotent, and fails if the expected SDK code changes. Forcing the test runner to exit would have concealed the behavior.

End-to-end verification goes beyond application tests: it runs the canonical report, waits for Prometheus to ingest the finding gauge, loads the provisioned Grafana dashboard, executes all 21 panel queries against Prometheus, and checks three healthy alert rules. The dashboard has 24 panels including headings and explanatory text. The checked-in verification record and screenshots come from that running stack.

The dependency audit is also recorded. The current NitroStack dependency graph includes a Zod collection-validation advisory with no compatible audited fix in its Zod 3 line. Bounds on this application's inputs narrow what it accepts, but are not a general dependency fix. This remains a local example; a public multi-tenant service needs a compatible patched dependency graph and a separate deployment review. The exact finding and tradeoff are in `DECISIONS.md`.

## Run it yourself

From the project directory:

```bash
docker compose up -d --build

curl -sS http://127.0.0.1:4310/api/investigate \
  -H 'Content-Type: application/json' -d '{}'
```

Open `http://127.0.0.1:4311/d/incident-desk`. To create a short stream of actual executions, install the helper dependencies with Node.js 22 or 24 and run:

```bash
npm ci
npm run demo -- --traffic --include-failures --count 60
npm run smoke:stack
```

Every tenth traffic-generator run deliberately throws. Those errors should be visible in run history, completion counters, and Grafana. The command is a demonstration workload, not a throughput test.

For your own evidence, start with an exported JSON snapshot matching `src/snapshot.ts`. A later version can replace the four handlers with real monitoring and deployment queries while keeping the guest workflow contract. Preserve bounded queries and independent backend timeouts, and make the data's observation time visible.

The result is a small application with an inspectable execution model: a program gathers evidence through narrow tools, the runtime bounds and measures it, and the dashboard explains what happened. That is a practical foundation for adding an AI client without making the underlying system depend on one.
