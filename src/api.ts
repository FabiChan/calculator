export interface CalculationRequest {
  a: number;
  b?: number;
  op: string;
}

export interface CalculationResponse {
  result: number;
  expression: string;
  error?: string;
}

export interface HistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/+$/,
  "",
);

export class ApiError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  let payload: unknown;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : undefined;
    throw new ApiError(
      typeof error === "string"
        ? error
        : text || `Request failed (${response.status})`,
      response.status,
    );
  }

  if (text && payload === undefined) {
    throw new ApiError("The Go API returned invalid JSON", response.status);
  }

  return payload as T;
}

export function calculate(
  calculation: CalculationRequest,
): Promise<CalculationResponse> {
  return request<CalculationResponse>(`${API_BASE_URL}/api/v1/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(calculation),
  });
}

export function getHistory(): Promise<HistoryItem[]> {
  return request<HistoryItem[]>(`${API_BASE_URL}/api/v1/history`);
}

export function clearHistory(): Promise<void> {
  return request<void>(`${API_BASE_URL}/api/v1/history/clear`, {
    method: "DELETE",
  });
}
