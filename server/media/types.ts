import type { S3Config } from "@/lib/config-schemas";

export type MediaKind = "image/" | "application/pdf";

export type MediaConfigInput = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  pathPrefix: string;
  cacheControl: string;
  forcePathStyle: boolean;
};

export type MediaListQuery = {
  keyword?: string;
  mimeType?: MediaKind;
  path?: string;
  page?: number;
  pageSize?: number;
};

export type MediaItem = {
  id: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  fileSize: number;
  fileKey: string;
  url: string;
  path: string | null;
  metadataJson: string | null;
  uploadedAt: Date;
};

export type MediaListResult = { items: MediaItem[]; total: number; page: number; pageSize: number };
export type Storage = { config: S3Config; client: import("aws4fetch").AwsClient };
