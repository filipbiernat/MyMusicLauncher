export type LogEntry = {
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
};

type Listener = (entries: LogEntry[]) => void;

const MAX_ENTRIES = 50;
let entries: LogEntry[] = [];
let listeners: Listener[] = [];

function notify() {
  listeners.forEach((l) => l([...entries]));
}

export const EventLog = {
  add(message: string, type: LogEntry['type'] = 'info') {
    const entry: LogEntry = { timestamp: new Date(), message, type };
    entries = [entry, ...entries].slice(0, MAX_ENTRIES);
    notify();
    console.log(`[EventLog] [${type.toUpperCase()}] ${message}`);
  },

  info(message: string) {
    this.add(message, 'info');
  },

  success(message: string) {
    this.add(message, 'success');
  },

  error(message: string) {
    this.add(message, 'error');
  },

  warning(message: string) {
    this.add(message, 'warning');
  },

  getEntries(): LogEntry[] {
    return [...entries];
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  clear() {
    entries = [];
    notify();
  },
};
