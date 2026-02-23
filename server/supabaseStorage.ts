/**
 * Supabase Storage — File upload utility for coaching messages
 *
 * Uses Supabase Storage with the service role key to upload files
 * on behalf of authenticated users. Files are stored in the
 * "coaching-uploads" bucket with public read access.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠ Supabase Storage not configured — file uploads disabled");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const BUCKET = "coaching-uploads";

/**
 * Ensure the storage bucket exists (idempotent — safe to call on every boot)
 */
export async function ensureStorageBucket(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
  });
  // "already exists" is fine
  if (error && !error.message.includes("already exists")) {
    console.error("Failed to create storage bucket:", error.message);
  }
}

/**
 * Upload a file buffer to Supabase Storage
 * @returns Public URL of the uploaded file, or null on failure
 */
export async function uploadFile(
  userId: string,
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<string | null> {
  if (!supabase) {
    console.error("Supabase Storage not configured");
    return null;
  }

  // Sanitize filename and create unique path
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const safeName = originalName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 100);
  const timestamp = Date.now();
  const path = `${userId}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    console.error("Upload failed:", error.message);
    return null;
  }

  // Get public URL
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Check if storage is available
 */
export function isStorageConfigured(): boolean {
  return supabase !== null;
}
