export interface VercelRequest {
  method?: string;
  body?: unknown;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}

export interface VercelResponse {
  json(body: unknown): void;
  redirect(url: string): void;
  setHeader(name: string, value: string | string[]): void;
  status(statusCode: number): VercelResponse;
}
