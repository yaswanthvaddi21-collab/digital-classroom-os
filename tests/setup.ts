import { afterEach } from 'vitest';

// Only DOM tests (`// @vitest-environment jsdom`) need these.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
  // jsdom does not implement layout APIs that editors call.
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}
