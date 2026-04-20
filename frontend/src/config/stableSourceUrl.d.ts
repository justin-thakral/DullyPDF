export type StableUrlInput = {
  sourceUrl: string;
  formNumber: string;
  section?: string;
};

export function getStableSourceUrl(input: StableUrlInput): string | null;
export function getStableSourceLabel(stableUrl: string): string;
