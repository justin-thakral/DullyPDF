import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import type { MaterializePdfExportMode, TemplateApiSchema } from '../../services/api';
import { resolveApiUrl } from '../../services/apiConfig';
import type { ApiFillManagerDialogProps } from '../../hooks/useWorkspaceTemplateApi';
import './ApiFillManagerDialog.css';

type ApiExampleId = 'curl' | 'node' | 'python';

const EXAMPLE_PAYLOAD_PATH = './payload.json';
const EXAMPLE_OUTPUT_PATH = './filled.pdf';
const DEFAULT_SCHEMA_PREVIEW_FIELD_LIMIT = 20;

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMonthLabel(value?: string | null): string {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Current month';
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) return normalized;
  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return normalized;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

function buildPayloadSnippet(schema: TemplateApiSchema | null, exportMode: MaterializePdfExportMode): string {
  return JSON.stringify(
    {
      data: schema?.exampleData || {},
      exportMode,
      strict: true,
    },
    null,
    2,
  );
}

function buildSchemaPreviewSnippet(
  schema: TemplateApiSchema | null,
  exportMode: MaterializePdfExportMode,
  maxFieldCount?: number,
): string {
  const sourceData = schema?.exampleData || {};
  const entries = Object.entries(sourceData);
  const previewData = maxFieldCount && entries.length > maxFieldCount
    ? Object.fromEntries(entries.slice(0, maxFieldCount))
    : sourceData;

  return JSON.stringify(
    {
      data: previewData,
      exportMode,
      strict: true,
    },
    null,
    2,
  );
}

function buildCurlSnippet(fillUrl: string): string {
  return [
    `curl -X POST "${fillUrl}" \\`,
    '  -H "Authorization: Basic $(printf \'%s:\' \"$API_KEY\" | base64)" \\',
    '  -H "Content-Type: application/json" \\',
    `  --data "@${EXAMPLE_PAYLOAD_PATH}" \\`,
    `  --output "${EXAMPLE_OUTPUT_PATH}"`,
  ].join('\n');
}

function buildNodeSnippet(fillUrl: string): string {
  return [
    "import { readFile, writeFile } from 'node:fs/promises';",
    '',
    "const apiKey = process.env.DULLYPDF_API_KEY;",
    `const payloadPath = ${JSON.stringify(EXAMPLE_PAYLOAD_PATH)};`,
    "const payload = JSON.parse(await readFile(payloadPath, 'utf8'));",
    '',
    `const response = await fetch(${JSON.stringify(fillUrl)}, {`,
    "  method: 'POST',",
    '  headers: {',
    "    'Content-Type': 'application/json',",
    "    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,",
    '  },',
    '  body: JSON.stringify(payload),',
    '});',
    '',
    "if (!response.ok) throw new Error(await response.text());",
    "const pdf = Buffer.from(await response.arrayBuffer());",
    `await writeFile(${JSON.stringify(EXAMPLE_OUTPUT_PATH)}, pdf);`,
  ].join('\n');
}

function buildPythonSnippet(fillUrl: string): string {
  return [
    'import base64',
    'import json',
    'import os',
    'import requests',
    '',
    "api_key = os.environ['DULLYPDF_API_KEY']",
    `url = ${JSON.stringify(fillUrl)}`,
    `payload_path = ${JSON.stringify(EXAMPLE_PAYLOAD_PATH)}`,
    "with open(payload_path, 'r', encoding='utf-8') as payload_file:",
    '    payload = json.load(payload_file)',
    '',
    "auth = base64.b64encode(f'{api_key}:'.encode('utf-8')).decode('ascii')",
    "response = requests.post(url, json=payload, headers={",
    "    'Authorization': f'Basic {auth}',",
    "    'Content-Type': 'application/json',",
    '})',
    'response.raise_for_status()',
    `with open(${JSON.stringify(EXAMPLE_OUTPUT_PATH)}, 'wb') as output_file:`,
    '    output_file.write(response.content)',
  ].join('\n');
}

async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function EndpointSchemaSummary({ schema }: { schema: TemplateApiSchema }) {
  return (
    <div className="template-api-dialog__schema-grid">
      <div className="template-api-dialog__schema-card">
        <span className="template-api-dialog__schema-count">{schema.fields.length}</span>
        <span className="template-api-dialog__schema-label">Scalar fields</span>
      </div>
      <div className="template-api-dialog__schema-card">
        <span className="template-api-dialog__schema-count">{schema.checkboxFields.length}</span>
        <span className="template-api-dialog__schema-label">Checkbox fields</span>
      </div>
      <div className="template-api-dialog__schema-card">
        <span className="template-api-dialog__schema-count">{schema.checkboxGroups.length}</span>
        <span className="template-api-dialog__schema-label">Checkbox groups</span>
      </div>
      <div className="template-api-dialog__schema-card">
        <span className="template-api-dialog__schema-count">{schema.radioGroups.length}</span>
        <span className="template-api-dialog__schema-label">Radio groups</span>
      </div>
    </div>
  );
}

export default function ApiFillManagerDialog({
  open,
  onClose,
  templateName,
  hasActiveTemplate,
  endpoint,
  schema,
  limits,
  recentEvents,
  loading,
  publishing,
  rotating,
  revoking,
  error,
  latestSecret,
  onPublish,
  onRotate,
  onRevoke,
  onRefresh,
}: ApiFillManagerDialogProps) {
  const [exportMode, setExportMode] = useState<MaterializePdfExportMode>('flat');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [selectedExampleId, setSelectedExampleId] = useState<ApiExampleId>('curl');
  const [schemaPreviewExpanded, setSchemaPreviewExpanded] = useState(false);

  useEffect(() => {
    const nextMode = schema?.defaultExportMode === 'editable' ? 'editable' : 'flat';
    setExportMode(nextMode);
  }, [schema?.defaultExportMode, endpoint?.id]);

  useEffect(() => {
    setCopyNotice(null);
  }, [endpoint?.id, latestSecret, open, schema?.snapshotVersion]);

  useEffect(() => {
    setSchemaPreviewExpanded(false);
  }, [endpoint?.id, schema?.snapshotVersion]);

  const fillUrl = useMemo(() => resolveApiUrl(String(endpoint?.fillPath || '').trim()), [endpoint?.fillPath]);
  const schemaUrl = useMemo(
    () => resolveApiUrl(endpoint?.id ? `/api/v1/fill/${encodeURIComponent(endpoint.id)}/schema` : ''),
    [endpoint?.id],
  );
  const schemaFieldCount = useMemo(
    () => Object.keys(schema?.exampleData || {}).length,
    [schema?.exampleData],
  );
  const schemaPreviewLimit = schemaPreviewExpanded ? undefined : DEFAULT_SCHEMA_PREVIEW_FIELD_LIMIT;
  const payloadSnippet = useMemo(
    () => buildPayloadSnippet(schema, exportMode),
    [exportMode, schema],
  );
  const schemaPreviewSnippet = useMemo(
    () => buildSchemaPreviewSnippet(schema, exportMode, schemaPreviewLimit),
    [exportMode, schema, schemaPreviewLimit],
  );
  const schemaPreviewIsTruncated = schemaFieldCount > DEFAULT_SCHEMA_PREVIEW_FIELD_LIMIT;
  const curlSnippet = useMemo(
    () => buildCurlSnippet(fillUrl),
    [fillUrl],
  );
  const nodeSnippet = useMemo(
    () => buildNodeSnippet(fillUrl),
    [fillUrl],
  );
  const pythonSnippet = useMemo(
    () => buildPythonSnippet(fillUrl),
    [fillUrl],
  );
  const examples = useMemo(
    () => [
      {
        id: 'curl' as const,
        label: 'cURL',
        description: `Save the request body above as ${EXAMPLE_PAYLOAD_PATH}, then run a strict server-side smoke test.`,
        snippet: curlSnippet,
      },
      {
        id: 'node' as const,
        label: 'Node',
        description: `Uses native fetch, reads ${EXAMPLE_PAYLOAD_PATH}, and writes ${EXAMPLE_OUTPUT_PATH}.`,
        snippet: nodeSnippet,
      },
      {
        id: 'python' as const,
        label: 'Python',
        description: `Uses requests, reads ${EXAMPLE_PAYLOAD_PATH}, and writes ${EXAMPLE_OUTPUT_PATH}.`,
        snippet: pythonSnippet,
      },
    ],
    [curlSnippet, nodeSnippet, pythonSnippet],
  );
  const selectedExample = examples.find((example) => example.id === selectedExampleId) || examples[0];

  const endpointStatusLabel = endpoint?.status === 'revoked' ? 'Revoked' : endpoint ? 'Active' : 'Not published';
  const publishButtonLabel = !endpoint || endpoint.status === 'revoked' ? 'Generate key' : 'Republish snapshot';
  const isActiveEndpoint = endpoint?.status === 'active';
  const trackedFailureCount = (endpoint?.authFailureCount || 0) + (endpoint?.validationFailureCount || 0) + (endpoint?.runtimeFailureCount || 0);

  const handleCopy = async (value: string, successNotice: string, failureNotice: string) => {
    const copied = await copyText(value);
    setCopyNotice(copied ? successNotice : failureNotice);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="API Fill"
      description="Publish a saved template as a scoped PDF fill endpoint. The generated key is server-side only and authenticates one template snapshot at a time."
      className="template-api-dialog"
    >
      <div className="template-api-dialog__body">
        <section className="template-api-dialog__hero">
          <div>
            <p className="template-api-dialog__eyebrow">Saved template</p>
            <h3>{templateName || 'No saved template selected'}</h3>
            <p className="template-api-dialog__support">
              API Fill uses the last published snapshot for this template. Save editor changes before publishing or republishing to update the live endpoint.
            </p>
          </div>
          <div className={`template-api-dialog__status template-api-dialog__status--${endpoint?.status || 'idle'}`}>
            {endpointStatusLabel}
          </div>
        </section>

        {!hasActiveTemplate ? (
          <div className="template-api-dialog__empty">
            Save the current PDF as a template first. API Fill is only available for saved templates because the public endpoint must publish a frozen snapshot.
          </div>
        ) : null}

        {error ? <div className="template-api-dialog__error">{error}</div> : null}
        {copyNotice ? <div className="template-api-dialog__notice">{copyNotice}</div> : null}

        {hasActiveTemplate ? (
          <section className="template-api-dialog__card">
            <div className="template-api-dialog__card-header">
              <div>
                <h4>Publish settings</h4>
                <p>Choose how generated PDFs should be returned by default.</p>
              </div>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--compact"
                onClick={() => void onRefresh()}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="template-api-dialog__mode-row" role="radiogroup" aria-label="Default export mode">
              <button
                type="button"
                className={exportMode === 'flat' ? 'template-api-dialog__mode template-api-dialog__mode--active' : 'template-api-dialog__mode'}
                onClick={() => setExportMode('flat')}
              >
                <strong>Flat PDF</strong>
                <span>Return a non-editable final PDF.</span>
              </button>
              <button
                type="button"
                className={exportMode === 'editable' ? 'template-api-dialog__mode template-api-dialog__mode--active' : 'template-api-dialog__mode'}
                onClick={() => setExportMode('editable')}
              >
                <strong>Editable PDF</strong>
                <span>Keep form fields intact in the response.</span>
              </button>
            </div>
            <div className="template-api-dialog__actions">
              <button
                type="button"
                className="ui-button ui-button--primary"
                onClick={() => void onPublish(exportMode)}
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : publishButtonLabel}
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void onRotate()}
                disabled={!endpoint || endpoint.status !== 'active' || rotating}
              >
                {rotating ? 'Rotating...' : 'Rotate key'}
              </button>
              <button
                type="button"
                className="ui-button ui-button--ghost"
                onClick={() => void onRevoke()}
                disabled={!endpoint || endpoint.status !== 'active' || revoking}
              >
                {revoking ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </section>
        ) : null}

        {latestSecret ? (
          <section className="template-api-dialog__secret-card">
            <div>
              <p className="template-api-dialog__eyebrow">API key</p>
              <h4>Shown once</h4>
              <p>Store this key on your server. DullyPDF only stores a hash after publish or rotation.</p>
            </div>
            <div className="template-api-dialog__secret-row">
              <span className="template-api-dialog__secret-value" aria-label="API key">
                {latestSecret}
              </span>
              <button
                type="button"
                className="ui-button ui-button--ghost ui-button--compact"
                onClick={() => void handleCopy(latestSecret, 'API key copied.', 'Copy failed. Copy the key manually.')}
              >
                Copy key
              </button>
            </div>
          </section>
        ) : null}

        {endpoint && schema ? (
          <>
            <section className="template-api-dialog__card">
              <div className="template-api-dialog__card-header">
                <div>
                  <h4>Endpoint</h4>
                  <p>
                    {isActiveEndpoint
                      ? 'Use Basic auth with the API key as the username and a blank password.'
                      : 'This endpoint is revoked. Generate a new key to publish a fresh live URL before running server-side fill requests.'}
                  </p>
                </div>
              </div>
              {isActiveEndpoint ? (
                <>
                  <div className="template-api-dialog__endpoint-row">
                    <div className="template-api-dialog__endpoint-copy-target">
                      <span className="template-api-dialog__meta-label">URL</span>
                      <span className="template-api-dialog__endpoint-value">{fillUrl}</span>
                    </div>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={() => void handleCopy(fillUrl, 'Endpoint URL copied.', 'Copy failed. Copy the URL manually.')}
                    >
                      Copy URL
                    </button>
                  </div>
                  <div className="template-api-dialog__endpoint-row">
                    <div className="template-api-dialog__endpoint-copy-target">
                      <span className="template-api-dialog__meta-label">Schema URL</span>
                      <span className="template-api-dialog__endpoint-value">{schemaUrl}</span>
                    </div>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={() => void handleCopy(schemaUrl, 'Schema URL copied.', 'Copy failed. Copy the schema URL manually.')}
                    >
                      Copy schema URL
                    </button>
                  </div>
                </>
              ) : (
                <p className="template-api-dialog__support">
                  The previous public endpoint is inactive. The schema and activity history below are still available for reference.
                </p>
              )}
              <div className="template-api-dialog__metadata-grid">
                <div>
                  <span className="template-api-dialog__meta-label">Key prefix</span>
                  <strong>{endpoint.keyPrefix || 'Unavailable'}</strong>
                </div>
                <div>
                  <span className="template-api-dialog__meta-label">Snapshot version</span>
                  <strong>{endpoint.snapshotVersion}</strong>
                </div>
                <div>
                  <span className="template-api-dialog__meta-label">Usage count</span>
                  <strong>{endpoint.usageCount}</strong>
                </div>
                <div>
                  <span className="template-api-dialog__meta-label">Last used</span>
                  <strong>{formatDateLabel(endpoint.lastUsedAt)}</strong>
                </div>
              </div>
            </section>

            {limits ? (
              <section className="template-api-dialog__card">
                <div className="template-api-dialog__card-header">
                  <div>
                    <h4>Limits and activity</h4>
                    <p>API Fill runs on DullyPDF servers. Search & Fill stays local in the browser, but API Fill sends record data to the backend at request time.</p>
                  </div>
                </div>
                <div className="template-api-dialog__metadata-grid">
                  <div>
                    <span className="template-api-dialog__meta-label">Active endpoints</span>
                    <strong>{limits.activeEndpointsUsed} / {limits.activeEndpointsMax}</strong>
                  </div>
                  <div>
                    <span className="template-api-dialog__meta-label">Requests this month</span>
                    <strong>{limits.requestsThisMonth} / {limits.requestsPerMonthMax}</strong>
                    <span className="template-api-dialog__meta-support">{formatMonthLabel(limits.requestUsageMonth)}</span>
                  </div>
                  <div>
                    <span className="template-api-dialog__meta-label">Template pages</span>
                    <strong>{limits.templatePageCount} / {limits.maxPagesPerRequest}</strong>
                  </div>
                  <div>
                    <span className="template-api-dialog__meta-label">Failure signals</span>
                    <strong>{endpoint.suspiciousFailureCount || 0} suspicious</strong>
                    <span className="template-api-dialog__meta-support">{trackedFailureCount} tracked failures</span>
                  </div>
                </div>
                {endpoint.lastFailureReason ? (
                  <p className="template-api-dialog__support">
                    Last failure: {endpoint.lastFailureReason} ({formatDateLabel(endpoint.lastFailureAt)})
                  </p>
                ) : null}
              </section>
            ) : null}

            {recentEvents.length ? (
              <section className="template-api-dialog__card">
                <div className="template-api-dialog__card-header">
                  <div>
                    <h4>Recent activity</h4>
                    <p>Rotation, revoke, publish, and public fill outcomes are recorded without storing raw field values by default.</p>
                  </div>
                </div>
                <div className="template-api-dialog__events">
                  {recentEvents.map((event) => (
                    <article key={event.id} className="template-api-dialog__event">
                      <div className="template-api-dialog__event-header">
                        <strong>{event.summary}</strong>
                        <span>{formatDateLabel(event.createdAt)}</span>
                      </div>
                      <div className="template-api-dialog__event-meta">
                        <span>{event.outcome}</span>
                        {event.snapshotVersion ? <span>Snapshot v{event.snapshotVersion}</span> : null}
                        {typeof event.metadata?.exportMode === 'string' ? <span>{event.metadata.exportMode}</span> : null}
                      </div>
                      {typeof event.metadata?.reason === 'string' && event.metadata.reason ? (
                        <p className="template-api-dialog__event-reason">{event.metadata.reason}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="template-api-dialog__card">
              <div className="template-api-dialog__card-header">
                <div>
                  <h4>Schema</h4>
                  <p>These are the JSON keys the published endpoint currently accepts. Save the request template below as <code>{EXAMPLE_PAYLOAD_PATH}</code> before running the examples.</p>
                </div>
                <button
                  type="button"
                  className="ui-button ui-button--ghost ui-button--compact"
                  onClick={() => void handleCopy(payloadSnippet, 'Payload file copied.', 'Copy failed. Copy the payload file manually.')}
                >
                  Copy payload file
                </button>
              </div>
              <EndpointSchemaSummary schema={schema} />
              {schemaPreviewIsTruncated ? (
                <div className="template-api-dialog__schema-preview-actions">
                  <span className="template-api-dialog__meta-support">
                    Showing {schemaPreviewExpanded ? schemaFieldCount : DEFAULT_SCHEMA_PREVIEW_FIELD_LIMIT} of {schemaFieldCount} fields in the preview.
                  </span>
                  <button
                    type="button"
                    className="ui-button ui-button--ghost ui-button--compact"
                    onClick={() => setSchemaPreviewExpanded((current) => !current)}
                  >
                    {schemaPreviewExpanded ? 'Show first 20 fields' : 'Show all fields'}
                  </button>
                </div>
              ) : null}
              <pre className="template-api-dialog__code-block">{schemaPreviewSnippet}</pre>
            </section>

            {isActiveEndpoint ? (
              <section className="template-api-dialog__example">
                <div className="template-api-dialog__card-header">
                  <div>
                    <h4>Examples</h4>
                    <p>{selectedExample.description}</p>
                  </div>
                  <div className="template-api-dialog__example-controls">
                    <label className="template-api-dialog__example-select">
                      <span className="template-api-dialog__meta-label">Language</span>
                      <select
                        aria-label="Example language"
                        value={selectedExampleId}
                        onChange={(event) => setSelectedExampleId(event.target.value as ApiExampleId)}
                      >
                        {examples.map((example) => (
                          <option key={example.id} value={example.id}>
                            {example.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={() => void handleCopy(
                        selectedExample.snippet,
                        `${selectedExample.label} example copied.`,
                        `Copy failed. Copy the ${selectedExample.label} example manually.`,
                      )}
                    >
                      Copy {selectedExample.label}
                    </button>
                  </div>
                </div>
                <pre className="template-api-dialog__code-block">{selectedExample.snippet}</pre>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
