import { useCallback, useState } from 'react';
import type { BannerNotice } from '../types';
import type { GroupTemplateWorkspaceSnapshot } from './useGroupTemplateCache';
import type { DownloadGroupPdfArchiveItem } from '../services/api';
import { ApiService } from '../services/api';
import { debugLog } from '../utils/debug';
import { normaliseFormName, prepareFieldsForMaterialize } from '../utils/fields';
import {
  buildPdfDownloadRequestId,
  formatPdfDownloadLimitMessage,
  isPdfDownloadLimitError,
} from '../utils/pdfDownloadQuota';

type GroupDownloadTemplate = {
  id: string;
  name: string;
};

type UseGroupDownloadDeps = {
  verifiedUser: unknown;
  activeGroupId: string | null;
  activeGroupName: string | null;
  activeGroupTemplates: GroupDownloadTemplate[];
  activeSavedFormId: string | null;
  captureActiveGroupTemplateSnapshot: () => GroupTemplateWorkspaceSnapshot | null;
  ensureGroupTemplateSnapshot: (
    formId: string,
    templateNameHint?: string | null,
  ) => Promise<GroupTemplateWorkspaceSnapshot>;
  refreshProfile?: () => Promise<unknown> | void;
  setLoadError: (message: string | null) => void;
  setBannerNotice: (notice: BannerNotice | null) => void;
};

function sanitizeArchiveSegment(value: string | null | undefined, fallback: string): string {
  const raw = (value || fallback).trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || fallback;
}

function buildPdfArchiveName(value: string | null | undefined): string {
  const base = sanitizeArchiveSegment(normaliseFormName(value), 'form');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function ensureUniqueArchiveName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const extensionIndex = name.toLowerCase().lastIndexOf('.pdf');
  const stem = extensionIndex >= 0 ? name.slice(0, extensionIndex) : name;
  let suffix = 2;
  while (true) {
    const candidate = `${stem}-${suffix}.pdf`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
}

export function useGroupDownload(deps: UseGroupDownloadDeps) {
  const [downloadGroupInProgress, setDownloadGroupInProgress] = useState(false);

  const handleDownloadGroup = useCallback(async () => {
    if (!deps.activeGroupId || !deps.activeGroupTemplates.length) {
      deps.setBannerNotice({ tone: 'error', message: 'Open a group before downloading it.' });
      return;
    }
    if (!deps.verifiedUser) {
      deps.setLoadError('Sign in to download this group.');
      return;
    }

    setDownloadGroupInProgress(true);
    deps.setLoadError(null);

    try {
      const usedNames = new Set<string>();
      const archiveItems: DownloadGroupPdfArchiveItem[] = [];

      for (const template of deps.activeGroupTemplates) {
        const activeSnapshot = template.id === deps.activeSavedFormId
          ? deps.captureActiveGroupTemplateSnapshot()
          : null;
        const snapshot = activeSnapshot ?? await deps.ensureGroupTemplateSnapshot(template.id, template.name);
        archiveItems.push({
          sourceFile: snapshot.sourceFile,
          filename: ensureUniqueArchiveName(
            buildPdfArchiveName(snapshot.templateName || template.name),
            usedNames,
          ),
          fields: prepareFieldsForMaterialize(
            snapshot.fields,
            snapshot.globalFieldFont,
            snapshot.globalFieldFontColor,
            { preserveAppOnlyFieldMarkers: true },
          ),
          exportMode: 'editable' as const,
          appearance: {
            globalFieldFont: snapshot.globalFieldFont,
            globalFieldFontSize: snapshot.globalFieldFontSize,
            globalFieldFontColor: snapshot.globalFieldFontColor,
            globalFieldAlignment: snapshot.globalFieldAlignment,
          },
        });
      }

      const archiveBlob = await ApiService.downloadGroupPdfArchive({
        groupId: deps.activeGroupId,
        groupName: deps.activeGroupName,
        downloadRequestId: buildPdfDownloadRequestId(),
        items: archiveItems,
      });
      const archiveName = `${sanitizeArchiveSegment(deps.activeGroupName, 'group')}.zip`;
      const url = URL.createObjectURL(archiveBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = archiveName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      void Promise.resolve()
        .then(() => deps.refreshProfile?.())
        .catch((error) => {
          debugLog('Failed to refresh profile after group PDF download quota event', error);
        });
    } catch (error) {
      if (isPdfDownloadLimitError(error)) {
        deps.setLoadError(formatPdfDownloadLimitMessage(error, { groupDownload: true }));
        void Promise.resolve()
          .then(() => deps.refreshProfile?.())
          .catch((refreshError) => {
            debugLog('Failed to refresh profile after group PDF download quota limit', refreshError);
          });
        debugLog('PDF download quota limit reached for group archive', error);
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to download this group.';
      deps.setLoadError(message);
      debugLog('Failed to download group archive', error);
    } finally {
      setDownloadGroupInProgress(false);
    }
  }, [deps]);

  return {
    downloadGroupInProgress,
    handleDownloadGroup,
  };
}
