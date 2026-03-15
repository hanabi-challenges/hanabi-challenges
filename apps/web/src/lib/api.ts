// src/lib/api.ts
const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, withJsonHeaders(init));

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore JSON parse errors; body stays null
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, body);
  }

  // If JSON parsing failed above, body will be null and this will throw,
  // but for our use case we expect JSON from the API.
  return body as T;
}

export async function getJsonAuth<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...withJsonHeaders(init),
    headers: {
      ...withJsonHeaders(init).headers,
      Authorization: `Bearer ${token}`,
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore JSON parse errors; body stays null
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, body);
  }

  return body as T;
}

export async function postJsonAuth<T>(
  path: string,
  token: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    ...withJsonHeaders(init),
    headers: {
      ...withJsonHeaders(init).headers,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, parsed);
  }

  return parsed as T;
}

export async function putJsonAuth<T>(
  path: string,
  token: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    ...withJsonHeaders(init),
    headers: {
      ...withJsonHeaders(init).headers,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, parsed);
  }

  return parsed as T;
}

export async function patchJsonAuth<T>(
  path: string,
  token: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    ...withJsonHeaders(init),
    headers: {
      ...withJsonHeaders(init).headers,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, parsed);
  }

  return parsed as T;
}

export async function deleteJsonAuth<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    ...withJsonHeaders(init),
    headers: {
      ...withJsonHeaders(init).headers,
      Authorization: `Bearer ${token}`,
    },
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new ApiError(`Request failed with status ${res.status}`, res.status, parsed);
  }

  return parsed as T;
}

function withJsonHeaders(init?: RequestInit): RequestInit {
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  };
}
