import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

// Extend Vitest's expect with axe accessibility matchers
expect.extend(toHaveNoViolations);

// Mock window.matchMedia for tests that use media queries
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

// Mock AudioContext for sonification tests
export class MockAudioContext {
  state = 'running';
  currentTime = 0;

  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440, setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    };
  }

  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    };
  }

  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 2000 },
      Q: { value: 1 },
      connect: () => {},
      disconnect: () => {},
    };
  }

  createBufferSource() {
    const source = {
      buffer: null as unknown,
      onended: null as null | (() => void),
      connect: () => {},
      disconnect: () => {},
      start: (when?: number) => {
        source.startedAt = when;
      },
      stop: () => {},
      startedAt: undefined as number | undefined,
    };
    MockAudioContext.sources.push(source);
    return source;
  }

  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ duration: 31.7, length: data.byteLength, numberOfChannels: 2 });
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  static sources: Array<{ onended: null | (() => void); startedAt?: number; stop: () => void }> = [];

  get destination() {
    return {};
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: MockAudioContext,
});

// Mock localStorage for accessibility and view mode contexts
const localStorageMock = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
