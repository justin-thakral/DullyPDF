export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

export type ImageFieldPayload = {
  imageDataUrl: string;
  imageMimeType: string;
  imageName: string;
};

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
