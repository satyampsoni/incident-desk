// This file runs in QuickJS. No Node.js globals or outbound network are available.
const catalog = await callTool('services_list', {});
const findings = [];

for (const service of catalog.services) {
  const metrics = await callTool('metrics_compare', { service: service.id });
  const beforeRate = metrics.before.errors / metrics.before.requests;
  const afterRate = metrics.after.errors / metrics.after.requests;
  const errorRateRatio = beforeRate === 0 ? null : afterRate / beforeRate;
  const latencyRatio = metrics.before.p95LatencyMs === 0
    ? null : metrics.after.p95LatencyMs / metrics.before.p95LatencyMs;

  const critical = afterRate >= 0.05 || (
    metrics.after.p95LatencyMs >= 1000 && latencyRatio !== null && latencyRatio >= 2
  );
  // Cross-multiply the 3/2 threshold so a 1.2% → 1.8% boundary is exact.
  // The snapshot schema caps counts, keeping these products in the safe integer range.
  const watch = metrics.after.errors * 100 >= metrics.after.requests && (
    metrics.before.errors === 0
    || metrics.after.errors * metrics.before.requests * 2
      >= metrics.before.errors * metrics.after.requests * 3
  );
  if (!critical && !watch) continue;

  // Fetch details only for services that crossed a policy threshold.
  const deployments = await callTool('deployments_list', { service: service.id });
  const errors = await callTool('errors_sample', { service: service.id });
  findings.push({
    service: service.id,
    owner: service.owner,
    severity: critical ? 'critical' : 'watch',
    beforeErrorRate: beforeRate,
    afterErrorRate: afterRate,
    errorRateRatio,
    p95LatencyMs: metrics.after.p95LatencyMs,
    latencyRatio,
    recentDeployments: deployments.items,
    errorSamples: errors.items,
    nextStep: deployments.items.length > 0
      ? 'Compare the deployment diff with these errors; timing alone does not establish causation.'
      : 'Inspect the sampled errors and check upstream dependencies.',
  });
}

findings.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical')
  || b.afterErrorRate - a.afterErrorRate);

return {
  snapshot: catalog.snapshot,
  source: catalog.source,
  observedAt: catalog.observedAt,
  windows: catalog.windows,
  servicesChecked: catalog.services.length,
  findings,
};
