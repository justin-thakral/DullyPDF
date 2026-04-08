const TRANSIENT_OPENAI_BUSY_MESSAGES = new Set([
  'Mapping is already running.',
  'Rename is already running.',
  'Please wait for the current workspace task to finish.',
  'Please wait — a mapping operation is still running.',
  'Please wait — rename is still running.',
]);

export function shouldSuppressTransientBusyBanner(
  message: string | null | undefined,
  flags: {
    mappingInProgress?: boolean;
    mapSchemaInProgress?: boolean;
    renameInProgress?: boolean;
  },
): boolean {
  if (!message || !TRANSIENT_OPENAI_BUSY_MESSAGES.has(message)) return false;
  return Boolean(flags.mappingInProgress || flags.mapSchemaInProgress || flags.renameInProgress);
}
