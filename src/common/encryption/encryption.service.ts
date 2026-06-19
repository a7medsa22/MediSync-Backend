import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12; // Standard for GCM
  private readonly tagLength = 16;
  private localKey: Buffer;

  constructor(private configService: ConfigService) {
    const secret =
      this.configService.get<string>('ENCRYPTION_SALT') ||
      'default-super-secret-salt-32-bytes!!';
    this.localKey = crypto.scryptSync(secret, 'salt', 32);
  }

  private async getKey(keyId?: string): Promise<Buffer> {
    const provider = this.configService.get<string>('KMS_PROVIDER') || 'none';
    switch (provider) {
      case 'aws':
        return this.getAwsKey(keyId);
      case 'vault':
        return this.getVaultKey(keyId);
      default:
        return this.getLocalKey();
    }
  }

  private async getLocalKey(): Promise<Buffer> {
    return this.localKey;
  }

  private async getAwsKey(keyId?: string): Promise<Buffer> {
    // Mocking AWS KMS client ready for production integration
    return this.localKey;
  }

  private async getVaultKey(keyId?: string): Promise<Buffer> {
    // Mocking HashiCorp Vault ready for production integration
    return this.localKey;
  }

  async encryptFile(fileBuffer: Buffer): Promise<{
    encryptedData: Buffer;
    iv: string;
    authTag: string;
    keyId: string;
  }> {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const key = await this.getKey();
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      const encrypted = Buffer.concat([
        cipher.update(fileBuffer),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        keyId: 'local-dev-key-id',
      };
    } catch (error) {
      throw new InternalServerErrorException('File encryption failed');
    }
  }

  async decryptFile(
    encryptedData: Buffer,
    ivHex: string,
    authTagHex: string,
    keyId: string,
  ): Promise<Buffer> {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const key = await this.getKey(keyId);
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    } catch (error) {
      throw new InternalServerErrorException(
        'File decryption failed or file tampered with',
      );
    }
  }

  hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
