import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  IStorageService,
  StorageFile,
  UploadResult,
} from './storage.interface';

/**
 * Production S3 storage service.
 * Uses AWS SDK v3 S3 client.
 * Falls back to local filesystem when S3 is not configured (dev/test).
 */
@Injectable()
export class S3StorageService implements IStorageService {
  private readonly bucket: string;
  private readonly region: string;
  private readonly useLocalFallback: boolean;
  private s3Client: any | null = null;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>(
      'S3_BUCKET',
      'medisync-records',
    );
    this.region = this.configService.get<string>('S3_REGION', 'us-east-1');
    this.useLocalFallback =
      !this.configService.get<string>('AWS_ACCESS_KEY_ID');
  }

  async upload(file: StorageFile, folder = 'records'): Promise<UploadResult> {
    const key = `${folder}/${Date.now()}-${this.sanitizeFileName(file.originalName)}`;

    if (this.useLocalFallback) {
      return this.localUpload(key, file);
    }

    try {
      const { S3Client, PutObjectCommand } = await this.getS3();
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimeType,
        ContentLength: file.size,
      });
      await this.s3Client!.send(command);

      return {
        key,
        url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
        bucket: this.bucket,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async download(key: string): Promise<Buffer> {
    if (this.useLocalFallback) {
      return this.localDownload(key);
    }

    try {
      const { S3Client, GetObjectCommand } = await this.getS3();
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.s3Client!.send(command);
      return await this.streamToBuffer(response.Body);
    } catch (error) {
      throw new InternalServerErrorException(
        `S3 download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    if (this.useLocalFallback) {
      await this.localDelete(key);
      return;
    }

    try {
      const { S3Client, DeleteObjectCommand } = await this.getS3();
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client!.send(command);
    } catch (error) {
      throw new InternalServerErrorException(
        `S3 delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (this.useLocalFallback) {
      return `/local-files/${key}`;
    }

    try {
      const { S3Client, GetObjectCommand } = await this.getS3();
      const { getSignedUrl: gsu } = await import(
        '@aws-sdk/s3-request-presigner'
      );
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return gsu(this.s3Client, command, { expiresIn });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async getS3(): Promise<{
    S3Client: any;
    PutObjectCommand: any;
    GetObjectCommand: any;
    DeleteObjectCommand: any;
  }> {
    if (!this.s3Client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId:
            this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.getOrThrow<string>(
            'AWS_SECRET_ACCESS_KEY',
          ),
        },
      });
    }
    return import('@aws-sdk/client-s3');
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // --- Local fallback for development ---
  private async localUpload(
    key: string,
    file: StorageFile,
  ): Promise<UploadResult> {
    const localDir = path.join(
      process.cwd(),
      'local-storage',
      path.dirname(key),
    );
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(
      path.join(process.cwd(), 'local-storage', key),
      file.buffer,
    );
    return {
      key,
      url: `/local-storage/${key}`,
      bucket: 'local',
    };
  }

  private async localDownload(key: string): Promise<Buffer> {
    return fs.readFile(path.join(process.cwd(), 'local-storage', key));
  }

  private async localDelete(key: string): Promise<void> {
    await fs
      .unlink(path.join(process.cwd(), 'local-storage', key))
      .catch(() => {});
  }
}
