/**
 * Mutation receipts, held in memory for the moment between two screens.
 *
 * WHY THIS EXISTS AT ALL. The screen that mutates navigates away immediately —
 * saving pushes you to the list, removing pushes you to the list — so the
 * confirmation has to outlive a route change. React state cannot: the
 * destination remounts, and its state is empty on arrival. That is a real
 * constraint, and the first solution to it was to put the message in the route
 * params.
 *
 * WHY NOT THE URL. `?saved=Fish&showing=Fish` is wrong in three separate ways,
 * and the third is the one that matters:
 *
 *   1. It is visible. A user reads their address bar.
 *   2. It is shareable and bookmarkable. A link to "Saved Fish." is a link to a
 *      claim about someone else's device, and it re-fires the message for
 *      whoever opens it.
 *   3. IT NEVER ENDS. A route param is not an event; it is state, and nothing
 *      clears it. The notice sat there until the next navigation — which is
 *      exactly the bug: "Saved Fish. Showing it now." stayed on screen forever.
 *
 * A receipt is an EVENT — it happens once, it is read, it goes. Modelling it as
 * state was the category error, and no amount of clearing logic would have
 * fixed it, because the URL is the wrong place to keep something that expires.
 *
 * `select` stays in the URL, and that is not an inconsistency: which place the
 * detail pane shows is genuinely state. It is true as long as the URL is true,
 * it survives a reload, and it means something to share.
 *
 * PRIVACY. Place names never leave the device today, and a place name in the
 * URL is the one way that could quietly stop being true — address bars land in
 * screenshots, in browser history, in referrer headers. Nothing here is
 * persisted or transmitted; the store is dropped on reload.
 */

export type Toast = {
  id: number;
  text: string;
};

/** How long a receipt stays up. */
export const TOAST_MS = 5000;

let queue: Toast[] = [];
let listeners: ((t: Toast[]) => void)[] = [];
let seq = 0;

function emit() {
  // A fresh array each time: the host holds this in state, and mutating in
  // place would not re-render.
  const snapshot = [...queue];
  for (const fn of listeners) fn(snapshot);
}

export function toast(text: string): void {
  if (!text) return;
  queue.push({ id: ++seq, text });
  emit();
}

export function dismissToast(id: number): void {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) emit();
}

export function subscribeToasts(fn: (t: Toast[]) => void): () => void {
  listeners.push(fn);
  // Immediately, so a host mounting AFTER the toast was queued still sees it.
  // This is the whole point: the message is emitted by the screen being left,
  // and read by a host on the screen being entered.
  fn([...queue]);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** Tests only — module state outlives a test otherwise. */
export function resetToasts(): void {
  queue = [];
  listeners = [];
  seq = 0;
}
