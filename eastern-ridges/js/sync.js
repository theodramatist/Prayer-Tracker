// The public edition keeps everything on the device: there is no sync.
export const SYNC_AVAILABLE = false;
export const LFF_FILE = null;

export class SyncManager {
  constructor() {
    this.status = { state: 'off' };
  }

  get enabled() { return false; }

  get repo() { return ''; }

  onChange() { return () => {}; }

  schedule() {}

  sync() { return Promise.resolve(); }

  disconnect() {}
}
