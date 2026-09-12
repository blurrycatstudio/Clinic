import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { env, isR2Configured } from "../config/env.js"
import { supabase } from "../config/supabase.js"
import { ExternalServiceError } from "../lib/errors.js"

const SUPABASE_BUCKET = "clinic-files"

let client: S3Client | null = null
function getClient(): S3Client {
  if (client) return client
  client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  })
  return client
}

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    )
  } catch (err) {
    throw new ExternalServiceError("Cloudflare R2", err instanceof Error ? err.message : String(err))
  }
  return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`
}

/** Falls back to a public bucket in the same Supabase project so uploads work without a separate Cloudflare account. */
async function uploadToSupabase(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, buffer, { contentType, upsert: true })
  if (error) throw new ExternalServiceError("Supabase Storage", error.message)
  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key)
  return data.publicUrl
}

export const storageService = {
  /** Uploads a PDF and returns its public URL. */
  async uploadPdf(key: string, buffer: Buffer): Promise<string> {
    return storageService.uploadFile(key, buffer, "application/pdf")
  },

  /**
   * Uploads an arbitrary file and returns its public URL. Uses Cloudflare R2
   * when R2_* env vars are set; otherwise falls back to the "clinic-files"
   * bucket in the project's own Supabase Storage (already provisioned via
   * supabase/migrations/0011_storage_bucket.sql), so prescriptions and patient
   * documents work out of the box without a separate Cloudflare account.
   */
  async uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (isR2Configured) return uploadToR2(key, buffer, contentType)
    return uploadToSupabase(key, buffer, contentType)
  },
}
