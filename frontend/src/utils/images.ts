import type { CSSProperties } from 'react';
import type { ImageColorMode } from '../types';

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';
export const DEFAULT_IMAGE_COLOR_MODE: ImageColorMode = 'original';

export const IMAGE_COLOR_MODE_OPTIONS: Array<{ value: ImageColorMode; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'grayscale', label: 'Grayscale' },
];

export type ImageFieldPayload = {
  imageDataUrl: string;
  imageMimeType: string;
  imageName: string;
};

export function normalizeImageColorMode(value: unknown): ImageColorMode {
  return value === 'grayscale' ? 'grayscale' : DEFAULT_IMAGE_COLOR_MODE;
}

export function imageColorModeLabel(value: unknown): string {
  const mode = normalizeImageColorMode(value);
  return IMAGE_COLOR_MODE_OPTIONS.find((entry) => entry.value === mode)?.label ?? 'Original';
}

export function imagePreviewStyleForColorMode(value: unknown): CSSProperties | undefined {
  return normalizeImageColorMode(value) === 'grayscale' ? { filter: 'grayscale(1)' } : undefined;
}

export function isSupportedImageFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === 'image/png' ||
    type === 'image/jpeg' ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  );
}

export function readImageFileAsDataUrl(file: File): Promise<ImageFieldPayload> {
  if (!isSupportedImageFile(file)) {
    return Promise.reject(new Error('Only PNG and JPEG images are supported.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read this image file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('Unable to read this image file.'));
        return;
      }
      resolve({
        imageDataUrl: result,
        imageMimeType: file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'),
        imageName: file.name || 'image',
      });
    };
    reader.readAsDataURL(file);
  });
}
