# Verification record

Verified on 17 November 2026 on macOS arm64. Local tests used Node.js 22.15.0; the pinned application container runs Node.js 22.23.5. Grafana is 12.3.0, Prometheus is 3.8.0, and NitroStack is 1.1.3. Exact container digests are committed in the Dockerfile and Compose configuration.

## Application checks

`npm test` passed **10/10** tests. The suite compiles the project, executes real QuickJS workers, and connects a real MCP client. It does not mock the Code Mode runtime.

The checks cover:

- Correct service findings and eight host tool calls, including the exact 50% error-rate boundary.
- Canonical findings remain unchanged after a custom script returns a different `findings` object.
- Missing guest host globals and fresh interpreter state between runs.
- Invalid tool inputs, unknown capabilities, and rejection of nested Code Mode meta-tools.
- CPU timeout followed by a successful run on the recovered pool.
- Tool-call exhaustion followed by a successful run.
- Admission rejection at capacity.
- Script and result-size bounds.
- Snapshot constraints for counts, service identities, and windows.
- HTTP authentication, browser-origin rejection, payload validation, and public local scrape access.
- MCP tool discovery, schema lookup, script execution, and an instrumented execution identifier.

Several assertions share a test case. [Full test output](examples/test-results.txt) records the test runner's actual results.

## Running stack

The stack was started with:

```bash
docker compose -f compose.yaml -f compose.ephemeral.yaml up -d --build
```

The Docker VM's existing storage volume was full. The isolated disposable override uses temporary filesystems only for this project's Grafana and Prometheus data. Existing Docker data was not deleted. The default named-volume variant built successfully, but the two storage-backed services could not initialize on this full volume; persistence for that variant was not verified on this machine.

`npm run smoke:stack` passed:

| Check | Result |
| --- | --- |
| Application health | Passed |
| Canonical report and expected findings | Passed |
| Eight actual SDK tool calls | Passed |
| Prometheus scrape target | Up |
| Prometheus ingestion of finding metric | Passed |
| Grafana dashboard provisioning | Passed; UID `incident-desk` |
| Dashboard expressions | 21/21 executed successfully |
| Dashboard composition | 24 panels, including headings and explanatory text |
| Alert rule evaluation | Three rules, healthy |

`promtool check config` and `promtool check rules` also passed inside the Prometheus container. Notifications were not sent or configured.

The smoke command records its timestamp and result in [stack-verification.json](examples/stack-verification.json) and saves an actual [investigation response](examples/investigation.json). Its expression checks verify that queries execute; they do not assert that every latency series must have observations during an idle interval.

## Dashboard rendering

The traffic generator completed 60 real sandbox executions at roughly one request per second. Six were deliberately failed executions. This was a demonstration workload, not a benchmark.

Grafana was opened in a clean headless Chrome session. Overview and evidence screenshots were captured and visually inspected. There were no recorded page exceptions or visible matching panel errors. See [browser-verification.json](examples/browser-verification.json), [overview](assets/dashboard-overview.png), and [evidence](assets/dashboard-evidence.png).

To repeat capture with the installed Chrome browser on macOS:

```bash
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node scripts/capture-dashboard.mjs
```

Alternatively, install Playwright's Chromium with `npx playwright install chromium`, then run that script without `CHROME_PATH`. Screenshots use the live dashboard and are not generated mockups.

## Article diagrams and executable example

The expanded Code Mode article includes two sequence diagrams. Their editable Mermaid definitions live in `docs/assets/*.mmd`, with PNG and SVG exports alongside them. Both diagrams were rendered with Mermaid 11.4.1 and visually inspected.

Regenerate the exports with:

```bash
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  node scripts/render-blog-diagrams.mjs
```

The renderer downloads the pinned Mermaid bundle and uses the installed browser. Without `CHROME_PATH`, it uses Playwright Chromium, as described in the dashboard-capture instructions above.

The [article's example program](examples/code-mode-investigation.js) was executed through NitroStack's QuickJS runtime. It made eight host tool calls and returned the checkout and inventory summaries printed in the article. This teaching example uses an increasing error-rate threshold of 1%; the main application workflow includes additional severity and latency rules.

## Dependency audit and limitations

The [saved audit report](examples/dependency-audit.json) reports two high-severity package findings in one advisory chain: Zod and its dependent NitroStack package. The advisory is [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5); no compatible audited fix is available in the pinned SDK graph. The command therefore exits with status 1. This is an acknowledged dependency finding, not a passing audit.

`DECISIONS.md` explains the input bounds, local scope, and why a forced incompatible dependency upgrade was not used. The SDK cleanup-timer patch is also documented there and applied during installation.

No production telemetry, credentials, LLM inference, token consumption, high-concurrency capacity, hostile multi-tenant isolation, alert notification delivery, or durable application history was tested. The evidence snapshot is synthetic and fixed. Reported execution durations and process memory belong to this development environment.
