export type FileBucket = "pdf" | "image" | "other"

export type ApiPatientDocument = {
  id: string
  patient_id: string
  name: string
  mime_type: string
  size_bytes: number
  url: string
  created_at: string
  patients: { full_name: string; phone_e164: string } | null
}

export function bucketFor(mimeType: string): FileBucket {
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType.startsWith("image/")) return "image"
  return "other"
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
