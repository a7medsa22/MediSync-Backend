export interface StorageFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
}

export interface IStorageService {
  upload(file: StorageFile, folder?: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl?(key: string, expiresIn?: number): Promise<string>;
}
