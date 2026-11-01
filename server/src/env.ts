/** Provides required environment values and synthetic credentials for test mode. */

let mode: 'runtime' | 'test' = 'runtime';
const testValues: NodeJS.ProcessEnv = { OPENAI_API_KEY: 'test-key' };

// Selects runtime values or test credentials for this process.
export function setEnvMode(value: typeof mode) {
  mode = value;
}

// Reads a required value when needed, after environment loading and mode selection.
export function getEnv(name: string): string {
  const value = (
    mode === 'test' ? (testValues[name] ?? process.env[name]) : process.env[name]
  )?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
