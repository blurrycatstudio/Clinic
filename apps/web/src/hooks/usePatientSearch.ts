import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"

export type ApiPatientSummary = {
  id: string
  full_name: string
  phone_e164: string
}

export function usePatientSearch(search: string) {
  return useQuery({
    queryKey: ["patients-search", search],
    queryFn: () => api.get<{ rows: ApiPatientSummary[]; count: number }>(`/patients?limit=50${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`),
    staleTime: 30_000,
  })
}
