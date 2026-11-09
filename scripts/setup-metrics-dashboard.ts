/** Creates or updates the Langfuse import dashboard with environment selection in the dashboard. */

import { LangfuseClient } from '@langfuse/client';
import { getEnv } from '../server/src/env.js';

getEnv('LANGFUSE_PUBLIC_KEY');
getEnv('LANGFUSE_SECRET_KEY');
const client = new LangfuseClient();
const api = client.api.unstable;
const name = 'Import costs and timing';
type Widget = Parameters<typeof api.dashboardWidgets.create>[0];
const importFilter: Widget['filters'][number] = {
  column: 'traceName',
  type: 'stringOptions',
  operator: 'any of',
  value: ['process_import', 'process_attachment'],
};
const filters: Widget['filters'] = [
  importFilter,
  { column: 'type', type: 'stringOptions', operator: 'any of', value: ['GENERATION', 'TOOL'] },
];
const definitions: Widget[] = [
  {
    name: `${name}: known charges by task (USD)`,
    chartType: 'HORIZONTAL_BAR',
    dimensions: [{ field: 'name' }],
    metrics: [{ measure: 'totalCost', agg: 'sum' }],
    view: 'observations',
    filters,
  },
  {
    name: `${name}: known charges by provider (USD)`,
    chartType: 'HORIZONTAL_BAR',
    dimensions: [{ field: 'tags' }],
    metrics: [{ measure: 'totalCost', agg: 'sum' }],
    view: 'observations',
    filters,
  },
  {
    name: `${name}: tokens by task`,
    chartType: 'VERTICAL_BAR',
    dimensions: [{ field: 'name' }],
    metrics: [
      { measure: 'inputTokens', agg: 'sum' },
      { measure: 'outputTokens', agg: 'sum' },
    ],
    view: 'observations',
    filters,
  },
  {
    name: `${name}: p95 task duration (ms)`,
    chartType: 'HORIZONTAL_BAR',
    dimensions: [{ field: 'name' }],
    metrics: [{ measure: 'latency', agg: 'p95' }],
    view: 'observations',
    filters: [
      importFilter,
      { column: 'name', type: 'string', operator: 'starts with', value: 'execute_' },
    ],
  },
  {
    name: `${name}: provider calls and charges`,
    chartType: 'PIVOT_TABLE',
    dimensions: [{ field: 'name' }, { field: 'tags' }],
    metrics: [
      { measure: 'count', agg: 'count' },
      { measure: 'totalCost', agg: 'sum' },
    ],
    view: 'observations',
    filters,
  },
];

// Reads every page so reruns update the dashboard even as the project's widget library grows.
async function listAll<T>(
  load: (page: number) => Promise<{ data: T[]; meta: { totalPages: number } }>,
) {
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const result = await load(page);
    rows.push(...result.data);
    if (page >= result.meta.totalPages) return rows;
  }
}

const dashboards = await listAll((page) => api.dashboards.list({ page, limit: 100 }));
const existing = dashboards.find((dashboard) => dashboard.name === name);
const dashboard =
  existing ??
  (await api.dashboards.create({
    name,
    description:
      'Provider charges before credits, tax and shared subscription allocation. Import reports identify unpriced calls and associated attachment work.',
  }));
const widgets = await listAll((page) => api.dashboardWidgets.list({ page, limit: 100 }));
for (const [index, definition] of definitions.entries()) {
  const existingWidget = widgets.find((widget) => widget.name === definition.name);
  const widget = existingWidget
    ? await api.dashboardWidgets.update(existingWidget.id, definition)
    : await api.dashboardWidgets.create(definition);
  if (
    !dashboard.definition.widgets.some(
      (placement) => placement.type === 'widget' && placement.widgetId === widget.id,
    )
  ) {
    await api.dashboards.addPlacement(dashboard.id, {
      type: 'widget',
      widgetId: widget.id,
      x: (index % 2) * 6,
      y: Math.floor(index / 2) * 6,
      width: index === 4 ? 12 : 6,
      height: 6,
    });
  }
}
const projectId = (await client.api.projects.get()).data[0].id;
console.log(`${getEnv('LANGFUSE_BASE_URL')}/project/${projectId}/dashboards/${dashboard.id}`);
