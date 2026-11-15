import { test as base } from '@playwright/test';

export * from '@playwright/test';

/**
 * Playwright's Firefox driver (Juggler) cancels every file picker the moment it opens, then sets the files the test
 * chose (see FilePickerOverride in its TargetRegistry.js and _filePickerShown in its PageAgent.js). Firefox fires the
 * input's 'cancel' event at that moment, which a real picker fires only when the user chooses nothing, so the app's
 * pickers would give up before the test's file arrives. In Firefox runs, 'cancel' listeners on file inputs are not
 * registered; every picker in a test gets files (or none, through a 'change' event), as with a real user. The app is
 * unchanged, and its cancel handling is covered by the unit tests.
 */
function ignoreDriverFilePickerCancel() {
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (type === 'cancel' && this instanceof HTMLInputElement && this.type === 'file') return;
    return add.call(this, type, listener, options);
  };
}

/** The test function every spec uses: Playwright's, with the Firefox file-picker fix above. */
export const test = base.extend({
  context: async ({ context, browserName }, use) => {
    if (browserName === 'firefox') await context.addInitScript(ignoreDriverFilePickerCancel);
    await use(context);
  },
});
