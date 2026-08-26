"use client";

import * as React from "react";
import { Upload, X, FileText, Image as ImageIcon, AlertCircle, RotateCcw, Eye, Trash2, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  MAX_MANUSCRIPT_FILE_SIZE_BYTES,
  MAX_SUPPLEMENTARY_FILE_SIZE_BYTES,
  ALLOWED_MANUSCRIPT_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  type FileType,
} from "@/lib/constants";

export interface UploadedFile {
  id?: string;
  fileType: FileType;
  originalFilename: string;
  storageBucket: string;
  storagePath: string;
  mimeType?: string;
  fileSize?: number;
  checksum?: string;
  // Cloudinary fields
  publicId?: string;
  secureUrl?: string;
  resourceType?: string;
  format?: string;
  bytes?: number;
  metadata?: Record<string, unknown>;
}

const FILE_TYPE_OPTIONS: { value: FileType; label: string }[] = [
  { value: "manuscript", label: "Manuscript (PDF/DOCX)" },
  { value: "supplementary", label: "Supplementary" },
  { value: "figure", label: "Figure" },
  { value: "table", label: "Table" },
  { value: "cover_letter", label: "Cover Letter" },
  { value: "other", label: "Other" },
];

function getAllowedMimes(fileType: FileType): string[] {
  if (fileType === "figure") return ALLOWED_IMAGE_MIME_TYPES;
  if (fileType === "manuscript" || fileType === "clean_manuscript" || fileType === "tracked_changes") {
    return ALLOWED_MANUSCRIPT_MIME_TYPES;
  }
  return [...ALLOWED_MANUSCRIPT_MIME_TYPES, ...ALLOWED_IMAGE_MIME_TYPES, "application/zip", "application/x-zip-compressed", "text/csv"];
}

function getMaxSize(fileType: FileType): number {
  if (fileType === "figure" || fileType === "supplementary") return MAX_SUPPLEMENTARY_FILE_SIZE_BYTES;
  return MAX_MANUSCRIPT_FILE_SIZE_BYTES;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ManuscriptUpload({
  journalId,
  manuscriptId,
  version,
  files,
  onFilesChange,
  maxFiles = 20,
}: {
  journalId: string;
  manuscriptId: string;
  version: number;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
}) {
  const { toast } = useToast();
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState<Record<string, number>>({});
  const [errors, setErrors] = React.useState<string | null>(null);
  const [selectedType, setSelectedType] = React.useState<FileType>("manuscript");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function uploadOne(file: File, fileType: FileType): Promise<UploadedFile | null> {
    const allowed = getAllowedMimes(fileType);
    const maxSize = getMaxSize(fileType);

    if (file.size > maxSize) {
      toast({ title: `File too large: ${file.name} (${formatBytes(file.size)} > ${formatBytes(maxSize)})`, variant: "destructive" });
      return null;
    }
    if (allowed.length && file.type && !allowed.includes(file.type)) {
      // Allow if extension is pdf/docx even when mime is empty on some browsers
      const ext = file.name.split(".").pop()?.toLowerCase();
      const allowedExts = ["pdf", "docx", "doc", "txt", "zip", "csv", "png", "jpg", "jpeg", "tiff", "webp"];
      if (!ext || !allowedExts.includes(ext)) {
        toast({ title: `Invalid file type: ${file.name} (${file.type})`, variant: "destructive" });
        return null;
      }
    }

    const key = `${file.name}-${Date.now()}`;
    setUploading((prev) => ({ ...prev, [key]: 0 }));
    setErrors(null);

    try {
      // 1) Get signature from server
      const folder = `journals/${journalId}/manuscripts/${manuscriptId}/v${version}`;
      const sigRes = await fetch("/api/upload/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, fileType, filename: file.name }),
      });
      const sigJson = (await sigRes.json()) as {
        cloudName?: string;
        apiKey?: string;
        folder?: string;
        timestamp?: number;
        signature?: string;
        tags?: string;
        error?: string;
      };
      if (!sigRes.ok || !sigJson.signature) {
        throw new Error(sigJson.error || "Failed to get upload signature");
      }

      // 2) Upload to Cloudinary with XHR for progress
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sigJson.apiKey!);
      form.append("timestamp", String(sigJson.timestamp));
      form.append("signature", sigJson.signature);
      form.append("folder", sigJson.folder!);
      // Use resource_type auto; Cloudinary will detect
      // Include tags — MUST match exactly what the server signed,
      // otherwise Cloudinary rejects the signature (401).
      if (sigJson.tags) form.append("tags", sigJson.tags);

      const cloudName = sigJson.cloudName!;
      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

      const uploaded = await new Promise<UploadedFile>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploading((prev) => ({ ...prev, [key]: pct }));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText) as {
                public_id: string;
                secure_url: string;
                resource_type: string;
                format: string;
                bytes: number;
                original_filename?: string;
                etag?: string;
              };
              resolve({
                fileType,
                originalFilename: file.name,
                storageBucket: "cloudinary",
                storagePath: res.public_id,
                mimeType: file.type || undefined,
                fileSize: res.bytes ?? file.size,
                checksum: res.etag,
                publicId: res.public_id,
                secureUrl: res.secure_url,
                resourceType: res.resource_type,
                format: res.format,
                bytes: res.bytes,
                metadata: { cloudinary: res },
              });
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`Cloudinary upload failed: ${xhr.status} ${xhr.responseText.slice(0, 300)}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(form);
      });

      // 3) Persist metadata to our DB (manuscript_files)
      const metaRes = await fetch(`/api/manuscripts/${manuscriptId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: null, // server will resolve to current version or create one
          fileType: uploaded.fileType,
          originalFilename: uploaded.originalFilename,
          storageBucket: uploaded.storageBucket,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
          checksum: uploaded.checksum,
          metadata: uploaded.metadata ?? {},
          secureUrl: uploaded.secureUrl,
          publicId: uploaded.publicId,
          resourceType: uploaded.resourceType,
          format: uploaded.format,
          bytes: uploaded.bytes,
        }),
      });
      const metaJson = (await metaRes.json().catch(() => ({}))) as { error?: string; data?: { id: string } };
      if (!metaRes.ok) {
        // Still keep cloudinary file but warn
        console.warn("Failed to persist file metadata:", metaJson.error);
        toast({ title: `Uploaded to Cloudinary but metadata save failed: ${metaJson.error}`, variant: "destructive" });
      } else if (metaJson.data?.id) {
        uploaded.id = metaJson.data.id;
      }

      return uploaded;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErrors(msg);
      toast({ title: msg, variant: "destructive" });
      return null;
    } finally {
      setUploading((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (files.length + fileList.length > maxFiles) {
      toast({ title: `Too many files. Max ${maxFiles} allowed.`, variant: "destructive" });
      return;
    }
    const toUpload = Array.from(fileList);
    const results: UploadedFile[] = [];
    for (const f of toUpload) {
      const res = await uploadOne(f, selectedType);
      if (res) results.push(res);
    }
    if (results.length) {
      onFilesChange([...files, ...results]);
      toast({ title: `${results.length} file(s) uploaded`, variant: "success" });
    }
  }

  function removeFile(idx: number) {
    const next = files.filter((_, i) => i !== idx);
    onFilesChange(next);
  }

  const isUploading = Object.keys(uploading).length > 0;

  return (
    <div className="space-y-4">
      {/* Type selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm font-medium">File type:</span>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as FileType)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {FILE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Folder: journals/{journalId}/manuscripts/{manuscriptId}/v{version}/
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
          isUploading && "pointer-events-none opacity-60"
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Upload files â€” drag and drop or click to browse"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <p className="text-sm font-medium">Drag and drop files here, or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">
          Max {formatBytes(getMaxSize(selectedType))} per file â€¢ Allowed: {getAllowedMimes(selectedType).slice(0, 3).join(", ")}
          {getAllowedMimes(selectedType).length > 3 ? "â€¦" : ""}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            void handleFiles(e.target.files);
            // reset so same file can be re-selected
            if (e.target) e.target.value = "";
          }}
          accept={getAllowedMimes(selectedType).join(",")}
        />
      </div>

      {/* Progress */}
      {isUploading && (
        <div className="space-y-2">
          {Object.entries(uploading).map(([key, pct]) => (
            <div key={key} className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="flex-1 truncate">{key.split("-")[0]}</span>
              <span className="text-muted-foreground">{pct}%</span>
              <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {errors && (
        <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errors}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={() => setErrors(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* File list */}
      {files.length > 0 ? (
        <div className="grid gap-3">
          {files.map((f, idx) => (
            <Card key={`${f.storagePath}-${idx}`} className="overflow-hidden">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
                  {f.mimeType?.startsWith("image/") || f.fileType === "figure" ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.originalFilename}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="secondary" className="text-[11px]">
                      {f.fileType}
                    </Badge>
                    {f.fileSize && <span className="text-xs text-muted-foreground">{formatBytes(f.fileSize)}</span>}
                    {f.secureUrl && (
                      <a href={f.secureUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Preview
                      </a>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-1 font-mono">{f.storagePath}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFile(idx)} aria-label="Remove file">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">No files uploaded yet.</p>
      )}

      <p className="text-xs text-muted-foreground">
        Files are stored in Cloudinary under <code className="bg-muted px-1 py-0.5 rounded text-[11px]">journal/{journalId}/manuscripts/{manuscriptId}/v{version}/</code> and linked to version {version} immutably.
      </p>
    </div>
  );
}

