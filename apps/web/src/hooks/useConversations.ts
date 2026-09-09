import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { isSupabaseConfigured } from "@/lib/supabaseClient"

export type ApiConversation = {
  id: string
  patient_id: string | null
  wa_phone_e164: string
  wa_profile_name: string | null
  language: "en" | "es" | null
  status: "active" | "closed" | "escalated"
  last_message_at: string
  created_at: string
  patients: { full_name: string } | null
}

export type ApiMessage = {
  id: string
  conversation_id: string
  wa_message_id: string | null
  direction: "inbound" | "outbound"
  message_type: string
  body: string | null
  template_name: string | null
  status: string | null
  created_at: string
}

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<{ rows: ApiConversation[]; count: number }>("/conversations?limit=100"),
    enabled: isSupabaseConfigured,
    refetchInterval: 15_000,
  })
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversation-messages", conversationId],
    queryFn: () => api.get<{ messages: ApiMessage[] }>(`/conversations/${conversationId}/messages`),
    enabled: isSupabaseConfigured && Boolean(conversationId),
    refetchInterval: 8_000,
  })
}

export function useSendMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (text: string) => api.post(`/conversations/${conversationId}/messages`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", conversationId] })
      queryClient.invalidateQueries({ queryKey: ["conversations"] })
    },
  })
}
