import type { Upload as TusUpload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

/**
 * One file to storage with progress (1.28.0, for wallpapers): Supabase's
 * resumable uploads (tus), the way video uploads already go. Survives a
 * dropped connection (it retries where it stopped) and can be cancelled.
 * The file name must be new (no overwriting).
 */

/** Supabase's resumable uploads go in 6 MB pieces. */
const CHUNK = 6 * 1024 * 1024;

export type UploadFailure = "session" | "too-large" | "type" | "forbidden" | "bucket" | "network" | "cancelled";
export class UploadError extends Error {
  constructor(public kind: UploadFailure, message: string) {
    super(message);
  }
}

export type UploadJob = {
  /** Resolves once the whole file is stored; rejects with an UploadError. */
  done: Promise<void>;
  cancel: () => void;
};

function failure(err: unknown): UploadError {
  const msg = String((err as Error)?.message ?? err ?? "");
  if (/413|too large|maximum|exceed/i.test(msg)) return new UploadError("too-large", msg);
  if (/415|mime|content type|not supported/i.test(msg)) return new UploadError("type", msg);
  if (/bucket not found|404/i.test(msg)) return new UploadError("bucket", msg);
  if (/401|jwt|expired/i.test(msg)) return new UploadError("session", msg);
  if (/403|row-level|policy|unauthori[sz]ed/i.test(msg)) return new UploadError("forbidden", msg);
  return new UploadError("network", msg);
}

export async function startUpload({
  bucket,
  path,
  file,
  contentType,
  cacheControl = "31536000",
  onProgress,
}: {
  bucket: string;
  path: string;
  file: Blob;
  contentType: string;
  cacheControl?: string;
  /** 0–1. */
  onProgress?: (share: number) => void;
}): Promise<UploadJob> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new UploadError("session", "No session");
  let Upload: typeof TusUpload;
  try {
    ({ Upload } = await import("tus-js-client"));
  } catch {
    throw new UploadError("network", "The uploader didn't load");
  }

  let upload: TusUpload | null = null;
  let settle: { resolve: () => void; reject: (e: UploadError) => void } | null = null;
  const done = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
  upload = new Upload(file, {
    endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
    retryDelays: [0, 1500, 4000, 8000],
    headers: { authorization: `Bearer ${session.access_token}`, "x-upsert": "false" },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: CHUNK,
    metadata: { bucketName: bucket, objectName: path, contentType, cacheControl },
    onProgress: (sent, total) => onProgress?.(total ? Math.min(1, sent / total) : 0),
    onError: (err) => settle?.reject(failure(err)),
    onSuccess: () => {
      onProgress?.(1);
      settle?.resolve();
    },
  });
  upload.start();
  return {
    done,
    cancel: () => {
      void upload?.abort(true);
      settle?.reject(new UploadError("cancelled", "Cancelled"));
    },
  };
}
