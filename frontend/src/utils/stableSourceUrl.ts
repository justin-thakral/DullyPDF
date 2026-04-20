import {
  getStableSourceLabel as getStableSourceLabelShared,
  getStableSourceUrl as getStableSourceUrlShared,
} from '../config/stableSourceUrl.mjs';

export type StableUrlInput = {
  sourceUrl: string;
  formNumber: string;
  section?: string;
};

export function getStableSourceUrl({ sourceUrl, formNumber }: StableUrlInput): string | null {
  return getStableSourceUrlShared({ sourceUrl, formNumber });
}

export function getStableSourceLabel(stableUrl: string): string {
  return getStableSourceLabelShared(stableUrl);
}
