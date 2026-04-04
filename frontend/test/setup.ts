import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

const requiredFirebaseTestEnv: Record<string, string> = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test-project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project',
  VITE_FIREBASE_APP_ID: '1:1234567890:web:testapp',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
};

for (const [key, value] of Object.entries(requiredFirebaseTestEnv)) {
  const currentValue = process.env[key];
  if (typeof currentValue !== 'string' || !currentValue.trim()) {
    process.env[key] = value;
  }
  const metaEnv = import.meta.env as Record<string, string | undefined>;
  if (typeof metaEnv[key] !== 'string' || !metaEnv[key]?.trim()) {
    metaEnv[key] = process.env[key];
  }
}

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (!window.scrollTo) {
    window.scrollTo = () => {};
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16);
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id: number) => {
      window.clearTimeout(id);
    };
  }

  if (!window.ResizeObserver) {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as any).ResizeObserver = ResizeObserverMock;
    (globalThis as any).ResizeObserver = ResizeObserverMock;
  }

  if (!window.IntersectionObserver) {
    class IntersectionObserverMock {
      constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (window as any).IntersectionObserver = IntersectionObserverMock;
    (globalThis as any).IntersectionObserver = IntersectionObserverMock;
  }

  if (!window.MutationObserver) {
    class MutationObserverMock {
      constructor(_callback: MutationCallback) {}
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    (window as any).MutationObserver = MutationObserverMock;
    (globalThis as any).MutationObserver = MutationObserverMock;
  }

  if (typeof CSS !== 'undefined' && !CSS.escape) {
    (CSS as any).escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
}
