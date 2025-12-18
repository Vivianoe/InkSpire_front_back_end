declare module 'msw/browser' {
  // Minimal ambient types to satisfy TS in this project
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function setupWorker(...handlers: any[]): any;
}


