import { Alert } from '../../ui/Alert';
import type { PublicSigningFlowState } from './usePublicSigningFlow';

type PublicSigningCompletedCardProps = {
  flow: PublicSigningFlowState;
};

export function PublicSigningCompletedCard({ flow }: PublicSigningCompletedCardProps) {
  if (!flow.request || flow.request.status !== 'completed') {
    return null;
  }

  const envelope = flow.request.envelope || null;
  const signerCount = Math.max(0, Number(envelope?.signerCount) || 0);
  const completedSignerCount = Math.max(0, Number(envelope?.completedSignerCount) || 0);
  const artifactsLockedByEnvelope = signerCount > 1 && completedSignerCount < signerCount;
  const progressLabel = artifactsLockedByEnvelope ? `${completedSignerCount}/${signerCount} signers completed` : null;
  const digitalSignature = flow.request.artifacts?.signedPdf?.digitalSignature;

  const showSignedPdfAction = Boolean(flow.request.artifacts?.signedPdf?.available || artifactsLockedByEnvelope);
  const showAuditReceiptAction = Boolean(flow.request.artifacts?.auditReceipt?.available || artifactsLockedByEnvelope);
  const showValidationAction = Boolean(flow.request.validationPath || artifactsLockedByEnvelope);

  function renderLockedArtifactAction(label: string, style: 'primary' | 'ghost') {
    return (
      <div className="public-signing-page__artifact-action public-signing-page__artifact-action--locked">
        <button
          className={`ui-button ${style === 'primary' ? 'ui-button--primary' : 'ui-button--ghost'}`}
          type="button"
          disabled
          aria-disabled="true"
        >
          {label}
        </button>
        {progressLabel ? (
          <span className="public-signing-page__artifact-lock-label">{progressLabel}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="public-signing-page__card">
      <Alert
        tone="success"
        variant="inline"
        message={`This signing request was completed${flow.request.completedAt ? ` on ${new Date(flow.request.completedAt).toLocaleString()}` : ''}.`}
      />
      {flow.verificationRequired && !flow.verificationComplete ? (
        <Alert
          tone="info"
          variant="inline"
          message="Verify your email to open the immutable source PDF or download the completed signing artifacts."
        />
      ) : null}
      {digitalSignature?.available ? (
        <div className="public-signing-page__signature-helper">
          <strong>Embedded PDF signature:</strong>{' '}
          The signed PDF includes a cryptographic PDF signature
          {digitalSignature.method ? ` via ${digitalSignature.method}` : ''}.
          {digitalSignature.certificateSubject ? ` Certificate subject: ${digitalSignature.certificateSubject}.` : ''}
        </div>
      ) : null}
      {flow.verificationComplete && artifactsLockedByEnvelope ? (
        <Alert
          tone="info"
          variant="inline"
          message={`Completed artifacts unlock after every signer finishes this envelope. ${progressLabel}.`}
        />
      ) : null}
      {flow.verificationComplete ? (
        <div className="public-signing-page__button-group">
          {showSignedPdfAction ? (
            artifactsLockedByEnvelope ? renderLockedArtifactAction('Download signed PDF', 'primary') : (
              <button
                className="ui-button ui-button--primary"
                type="button"
                disabled={flow.artifactBusyKey !== null || !flow.sessionToken}
                onClick={flow.handleDownloadSignedPdf}
              >
                {flow.artifactBusyKey === 'signedPdf' ? 'Downloading signed PDF…' : 'Download signed PDF'}
              </button>
            )
          ) : null}
          {showAuditReceiptAction ? (
            artifactsLockedByEnvelope ? renderLockedArtifactAction('Download audit receipt', 'ghost') : (
              <button
                className="ui-button ui-button--ghost"
                type="button"
                disabled={flow.artifactBusyKey !== null || !flow.sessionToken}
                onClick={flow.handleDownloadAuditReceipt}
              >
                {flow.artifactBusyKey === 'auditReceipt' ? 'Downloading audit receipt…' : 'Download audit receipt'}
              </button>
            )
          ) : null}
          {showValidationAction ? (
            artifactsLockedByEnvelope ? renderLockedArtifactAction('Validate retained record', 'ghost') : (
              <a className="ui-button ui-button--ghost" href={flow.request.validationPath || undefined}>
                Validate retained record
              </a>
            )
          ) : null}
          <button
            className="ui-button ui-button--ghost"
            type="button"
            disabled={flow.artifactBusyKey !== null || !flow.documentObjectUrl || flow.documentLoading}
            onClick={() => flow.handleOpenDocument('The immutable source PDF is not available yet.')}
          >
            {flow.documentLoading ? 'Loading source PDF…' : 'Open original immutable source'}
          </button>
        </div>
      ) : null}
      {flow.documentError ? <Alert tone="error" variant="inline" message={flow.documentError} /> : null}
    </div>
  );
}
