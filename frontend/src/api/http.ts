import { API_BASE_URL } from "./config";

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  status: number;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  try {
    const opts: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      signal,
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE_URL}${path}`, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: text || `HTTP ${res.status}`, status: res.status };
    }
    const data: T = await res.json();
    return { data, error: null, status: res.status };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { data: null, error: "Aborted", status: 0 };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, status: 0 };
  }
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  return request<T>("GET", path, undefined, signal);
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  return request<T>("POST", path, body, signal);
}

export function apiPut<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>("DELETE", path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return request<T>("PATCH", path, body);
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      body: formData,
      // Do NOT set Content-Type — browser sets multipart boundary automatically
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: text || `HTTP ${res.status}`, status: res.status };
    }
    const data: T = await res.json();
    return { data, error: null, status: res.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message, status: 0 };
  }
}

export async function apiDownloadBlob(
  path: string,
): Promise<{ blob: Blob | null; error: string | null; filename?: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { blob: null, error: text || `HTTP ${res.status}` };
    }
    const blob = await res.blob();
    // Try to extract filename from Content-Disposition header
    const disposition = res.headers.get("Content-Disposition");
    let filename: string | undefined;
    if (disposition) {
      const match = disposition.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
      if (match?.[2]) filename = match[2];
    }
    return { blob, error: null, filename };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { blob: null, error: message };
  }
}
