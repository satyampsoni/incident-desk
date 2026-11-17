const catalog = await callTool('services_list', {});
const findings = [];

for (const service of catalog.services) {
  const metrics = await callTool('metrics_compare', { service: service.id });
  const beforeRate = metrics.before.errors / metrics.before.requests;
  const afterRate = metrics.after.errors / metrics.after.requests;

  if (afterRate < 0.01 || afterRate <= beforeRate) continue;

  const deployments = await callTool('deployments_list', { service: service.id });
  const errors = await callTool('errors_sample', { service: service.id });

  findings.push({
    service: service.id,
    errorRate: afterRate,
    recentDeployments: deployments.items.length,
    errorSamples: errors.items.length,
  });
}

return findings;
