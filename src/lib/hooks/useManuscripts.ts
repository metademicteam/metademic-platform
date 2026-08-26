"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";

export interface ManuscriptFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  journalId?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

interface ManuscriptsResponse {
  data: unknown[];
  count: number;
  page: number;
  pageSize: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function useManuscripts(filters: ManuscriptFilters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.journalId) params.set("journalId", filters.journalId);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);

  const qs = params.toString();
  return useQuery<ManuscriptsResponse>({
    queryKey: ["manuscripts", filters],
    queryFn: () => fetchJson<ManuscriptsResponse>(`/api/manuscripts${qs ? `?${qs}` : ""}`),
    placeholderData: keepPreviousData,
  });
}

export function useManuscript(id: string, enabled = true) {
  return useQuery({
    queryKey: ["manuscript", id],
    queryFn: () => fetchJson<{ data: unknown }>(`/api/manuscripts/${id}`).then((r) => r.data),
    enabled: !!id && enabled,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateManuscript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<{ data: { id: string } }>("/api/manuscripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manuscripts"] });
    },
  });
}

export function useUpdateManuscript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      fetchJson<{ data: unknown }>(`/api/manuscripts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manuscripts"] });
      qc.invalidateQueries({ queryKey: ["manuscript", id] });
    },
  });
}

export function useSubmitManuscript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ data: unknown }>(`/api/manuscripts/${id}/submit`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manuscripts"] });
      qc.invalidateQueries({ queryKey: ["manuscript", id] });
    },
  });
}

export function useUploadManuscriptFile(manuscriptId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      fetchJson<{ data: unknown }>(`/api/manuscripts/${manuscriptId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manuscript", manuscriptId] });
    },
  });
}

export function useWithdrawManuscript(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<{ data: unknown }>(`/api/manuscripts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "withdrawn" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manuscript", id] });
      qc.invalidateQueries({ queryKey: ["manuscripts"] });
    },
  });
}
