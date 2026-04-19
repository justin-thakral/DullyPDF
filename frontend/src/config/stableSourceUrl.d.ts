export type StableUrlInput = {
  sourceUrl: string;
  formNumber: string;
  section?: string;
};

export function getStableSourceUrl(input: StableUrlInput): string;
export function getStableSourceLabel(stableUrl: string): string;
