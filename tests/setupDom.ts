/**
 * Lightweight in-memory DOM mock for Node.js / Vitest testing
 * Provides EventTarget, postMessage, CustomEvent, and global document/navigator/window.
 */

export class MockWindow {
  private listeners: Record<string, Array<(event: unknown) => void>> = {};
  public modelContext?: unknown;

  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: { type: string; detail?: unknown }): boolean {
    const list = this.listeners[event.type] || [];
    for (const fn of list) {
      fn(event);
    }
    return true;
  }

  postMessage(data: unknown, _origin?: string) {
    // Asynchronous dispatch simulating browser postMessage turn
    setTimeout(() => {
      const event = {
        type: 'message',
        data,
        source: this,
      };
      this.dispatchEvent(event);
    }, 0);
  }
}

export function setupMockDom() {
  const mockWin = new MockWindow();
  const mockDoc = {
    modelContext: undefined,
  };
  const mockNav = {
    modelContext: undefined,
  };

  class MockCustomEvent {
    public type: string;
    public detail?: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }

  Object.defineProperty(globalThis, 'window', {
    value: mockWin,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'document', {
    value: mockDoc,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'navigator', {
    value: mockNav,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'CustomEvent', {
    value: MockCustomEvent,
    configurable: true,
    writable: true,
  });

  return { mockWin, mockDoc, mockNav };
}
