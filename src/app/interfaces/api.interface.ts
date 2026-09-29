export interface ApiAuth {
  token: () => Promise<string | undefined>;
  onUnauthorized: () => void;
}
