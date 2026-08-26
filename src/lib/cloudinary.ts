import "server-only";

import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from "cloudinary";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  // Do not throw at import time during build if env is missing on client;
  // we throw lazily inside helpers so `next build` without env still types-checks.
  // Server runtime will surface the error.
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

export { cloudinary };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  format: string;
  bytes: number;
  originalFilename: string;
  width?: number;
  height?: number;
  checksum?: string;
}

export interface UploadOptions {
  folder: string;
  resourceType?: "image" | "raw" | "video" | "auto";
  publicId?: string;
  overwrite?: boolean;
  tags?: string[];
  context?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toResult(
  res: UploadApiResponse,
  fallbackFilename?: string,
): CloudinaryUploadResult {
  return {
    publicId: res.public_id,
    secureUrl: res.secure_url,
    resourceType: res.resource_type,
    format: res.format,
    bytes: res.bytes,
    originalFilename: res.original_filename ?? fallbackFilename ?? res.public_id,
    width: res.width,
    height: res.height,
    checksum: res.etag,
  };
}

function assertConfigured(): void {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error(
      "Cloudinary is not configured. Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.",
    );
  }
}

async function uploadBuffer(
  buffer: Buffer,
  options: UploadOptions & { filename?: string },
): Promise<CloudinaryUploadResult> {
  assertConfigured();

  const uploadOptions: UploadApiOptions = {
    folder: options.folder,
    resource_type: options.resourceType ?? "auto",
    public_id: options.publicId,
    overwrite: options.overwrite ?? false,
    tags: options.tags,
    context: options.context
      ? Object.entries(options.context)
          .map(([k, v]) => `${k}=${v}`)
          .join("|")
      : undefined,
  };

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed with empty result"));
          return;
        }
        resolve(toResult(result, options.filename));
      },
    );
    stream.end(buffer);
  });
}

// ---------------------------------------------------------------------------
// Public API — central upload helpers
// ---------------------------------------------------------------------------

/**
 * Upload a manuscript file (PDF/docx) to Cloudinary.
 * Folder: journals/{journalId}/manuscripts/{manuscriptId}/v{version}
 */
export async function uploadManuscript(
  buffer: Buffer,
  params: {
    journalId: string;
    manuscriptId: string;
    version: number;
    filename: string;
  },
): Promise<CloudinaryUploadResult> {
  return uploadBuffer(buffer, {
    folder: `journals/${params.journalId}/manuscripts/${params.manuscriptId}/v${params.version}`,
    resourceType: "raw",
    filename: params.filename,
    tags: ["manuscript", `journal:${params.journalId}`],
  });
}

/**
 * Upload a supplementary file.
 */
export async function uploadSupplementaryFile(
  buffer: Buffer,
  params: {
    journalId: string;
    manuscriptId: string;
    version: number;
    filename: string;
  },
): Promise<CloudinaryUploadResult> {
  return uploadBuffer(buffer, {
    folder: `journals/${params.journalId}/manuscripts/${params.manuscriptId}/v${params.version}/supplementary`,
    resourceType: "auto",
    filename: params.filename,
    tags: ["supplementary", `journal:${params.journalId}`],
  });
}

/**
 * Upload a journal logo (image).
 */
export async function uploadJournalLogo(
  buffer: Buffer,
  params: { journalId: string; filename: string },
): Promise<CloudinaryUploadResult> {
  return uploadBuffer(buffer, {
    folder: `journals/${params.journalId}/branding`,
    resourceType: "image",
    filename: params.filename,
    overwrite: true,
    tags: ["journal_logo"],
  });
}

/**
 * Upload a published article asset (PDF/figure/table).
 */
export async function uploadArticleAsset(
  buffer: Buffer,
  params: {
    journalId: string;
    articleId: string;
    filename: string;
    resourceType?: "image" | "raw" | "auto";
  },
): Promise<CloudinaryUploadResult> {
  return uploadBuffer(buffer, {
    folder: `journals/${params.journalId}/articles/${params.articleId}`,
    resourceType: params.resourceType ?? "auto",
    filename: params.filename,
    tags: ["article_asset", `journal:${params.journalId}`],
  });
}

/**
 * Delete an asset by public_id.
 */
export async function deleteAsset(
  publicId: string,
  resourceType: "image" | "raw" | "video" = "image",
): Promise<void> {
  assertConfigured();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
}

/**
 * Generate a signed upload payload for direct browser uploads.
 * The signature is computed server-side and returned to the client.
 */
export function createSignedUploadParams(params: {
  folder: string;
  publicId?: string;
  tags?: string[];
}): {
  cloudName: string;
  apiKey: string;
  folder: string;
  timestamp: number;
  signature: string;
  publicId?: string;
  tags?: string;
} {
  assertConfigured();
  const timestamp = Math.round(Date.now() / 1000);

  const toSign: Record<string, string> = {
    folder: params.folder,
    timestamp: String(timestamp),
  };
  if (params.publicId) toSign.public_id = params.publicId;
  if (params.tags?.length) toSign.tags = params.tags.join(",");

  const signature = cloudinary.utils.api_sign_request(toSign, API_SECRET!);

  return {
    cloudName: CLOUD_NAME!,
    apiKey: API_KEY!,
    folder: params.folder,
    timestamp,
    signature,
    publicId: params.publicId,
    tags: params.tags?.join(","),
  };
}

/**
 * Build a Cloudinary URL with transformations, e.g. thumbnails.
 */
export function buildCloudinaryUrl(
  publicId: string,
  transform?: string,
): string {
  const base = `https://res.cloudinary.com/${CLOUD_NAME ?? "demo"}`;
  if (transform) {
    return `${base}/image/upload/${transform}/${publicId}`;
  }
  return `${base}/image/upload/${publicId}`;
}
