# CLOUDINARY

## Config

`src/lib/cloudinary.ts` (`server-only`):

```ts
import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, // your cloud name
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET, // never to browser
});
```

Central utils: `uploadManuscript`, `uploadSupplementaryFile`, `uploadJournalLogo`, `uploadArticleAsset`, `deleteAsset`, `createSignedUploadParams`, `buildCloudinaryUrl`. All use `cloudinary.uploader` server-side or signed params.

## Upload Flow

1. Browser requests `POST /api/upload/signature` with `{ folder, publicId? }` — server validates folder via allowlist `journals/{id}/manuscripts/{id}/v{n}(/supplementary)` and returns `{ cloudName, apiKey, timestamp, signature, folder, tags }` (no secret).
2. Browser uploads directly to Cloudinary via `XMLHttpRequest` with progress, or via `fetch` to `https://api.cloudinary.com/v1_1/{cloudName}/auto/upload` with `signature`.
3. On success, browser POSTs metadata to `POST /api/manuscripts/[id]/files` which inserts `manuscript_files` with `storage_bucket="cloudinary"`, `storage_path=public_id`, `metadata={secure_url, resource_type, format, bytes}`.
4. Files are organized: `journal/{journalId}/manuscripts/{manuscriptId}/v{n}/` and `…/v{n}/supplementary`.

## Validation

`ManuscriptUpload.tsx`: drag-drop, progress (XHR), MIME/size checks (`MAX_MANUSCRIPT_FILE_SIZE 50MB`, supplementary 100MB), preview via `secure_url`, replace/delete/retry.

## Security

- Never expose `CLOUDINARY_API_SECRET` in client; use `POST /api/upload/signature`.
- `next.config.ts` `images.remotePatterns` allows `res.cloudinary.com`.

## Env

`CLOUDINARY_CLOUD_NAME=<your-cloud-name>`, `CLOUDINARY_API_KEY=<your-api-key>`, `CLOUDINARY_API_SECRET=<your-secret>` (in `.env.local`, not committed).
