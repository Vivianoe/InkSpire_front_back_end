// Ambient module declaration to satisfy TypeScript include settings
declare module 'msw/browser' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function setupWorker(...handlers: any[]): any;
}


