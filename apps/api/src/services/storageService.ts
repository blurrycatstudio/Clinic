import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { env, isR2Configured } from "../config/env.js"
import { ExternalServiceError } from "../lib/errors.js"

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

export const storageService = {
  /** Uploads a PDF and returns its public URL. Requires R2_* env vars + a public bucket/custom domain (R2_PUBLIC_URL). */
  async uploadPdf(key: string, buffer: Buffer): Promise<string> {
    return storageService.uploadFile(key, buffer, "application/pdf")
  },

  /** Uploads an arbitrary file and returns its public URL. Requires R2_* env vars + a public bucket/custom domain (R2_PUBLIC_URL). */
  async uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!isR2Configured) {
      throw new ExternalServiceError("Cloudflare R2", "Storage isn't configured yet — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL.")
    }
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
  },
}
