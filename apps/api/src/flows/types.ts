import type { ClinicSettings, ConversationContext } from "@clinic/shared"

export type FlowReply = {
  text?: string
  buttons?: { id: string; title: string }[]
  location?: { latitude: number; longitude: number; name?: string; address?: string }
}

export type FlowResult = {
  context: ConversationContext
  reply: FlowReply
}

export type FlowParams = {
  text: string
  buttonId: string | null
  context: ConversationContext
  settings: ClinicSettings
}

export type FlowHandler = (params: FlowParams) => Promise<FlowResult>
