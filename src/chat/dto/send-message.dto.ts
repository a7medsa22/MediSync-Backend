import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 'chat-uuid' })
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({ example: 'Hello doctor!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000, { message: 'Message too long (max 5000 characters)' })
  content: string;

  @ApiProperty({ required: false, example: 'TEXT' })
  @IsOptional()
  @IsString()
  messageType?: string; // TEXT, SYSTEM
}
