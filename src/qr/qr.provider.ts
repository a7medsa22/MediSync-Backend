import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class QrProvider {
  constructor(private readonly config: ConfigService) {}
  // ==================== PRIVATE HELPER METHODS ====================

  /**
   * Generate unique token with signature
   * Format: MDS_doctorId_randomString
   */
  generateToken(doctorId: string): string {
    const randomPart = crypto.randomBytes(24).toString('base64url'); // Generate 32 char random string
    const baseToken = `${this.config.get('QR_TOKEN_PREFIX')}${doctorId}_${randomPart}`;
    return baseToken;
  }

  /**
   * Verify token format
   */
  verifyTokenFormat(token: string): boolean {
    const regex = new RegExp(
      `^${this.config.get('QR_TOKEN_PREFIX')}[a-f0-9-]{36}_[a-zA-Z0-9_-]{32}$`,
    );

    return regex.test(token);
  }

  /**
   * Verify token signature (optional extra security)
   */
  verifyTokenSignature(token: string, doctorId: string): boolean {
    // Extract doctor ID from token
    const parts = token.split('_');
    if (parts.length !== 3) return false;

    const tokenDoctorId = parts[1];
    return tokenDoctorId === doctorId;
  }

  /**
   * Generate QR Code as Base64 image
   */
  async generateQrCodeImage(token: string): Promise<string> {
    try {
      // Generate QR with high error correction
      const qrImage = await QRCode.toDataURL(token, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return qrImage;
    } catch (error) {
      throw new BadRequestException('Failed to generate QR Code image');
    }
  }

  /**
   * Generate HMAC signature for extra security (optional)
   */
  generateSignature(data: string): string {
    const TOKEN_SECRET = this.config.get('QR_TOKEN_PREFIX');
    return crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('hex')
      .substring(0, 16);
  }
}
