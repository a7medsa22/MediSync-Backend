import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  BadRequestException,
  Query,
  Put,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ChatService } from './service/chat.service';
import { MessageService } from './message.service';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { UserRole } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GetMessagesDto, SendMessageDto } from './dto';
import { ApiAuth } from 'src/common/decorators/api-auth.decorator';
import type { AuthUser } from 'src/auth/interfaces/request-with-user.interface';

@Controller('chat')
@ApiAuth()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
  ) {}

  @Get('conversations')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get user conversations',
    description:
      'Retrieve all conversations for a user, including both active and inactive chats',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
  })
  async getConversations(@CurrentUser() user: AuthUser) {
    return this.chatService.getUserChats(user.sub, user.role);
  }

  @Post('connection/:connectionId')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get or create a chat',
    description:
      'Retrieve an existing chat or create a new one if it does not exist',
  })
  @ApiParam({ name: 'connectionId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Chat retrieved or created successfully',
  })
  @ApiResponse({ status: 404, description: 'Connection not found' })
  async getOrCreateChat(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const chat = await this.chatService.getOrCreateChat(connectionId);

    const hasAccess = await this.chatService.verifyUserAccess(
      chat.chatId,
      userId,
    );

    if (!hasAccess) {
      throw new BadRequestException('You do not have access to this chat');
    }

    return chat;
  }

  @Get(':chatId')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get chat details',
    description: 'Retrieve details of a specified chat',
  })
  @ApiParam({ name: 'chatId', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Chat details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async getChatDetails(
    @Param('chatId', ParseUUIDPipe) chatId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.chatService.getChatDetails(chatId, userId);
  }

  @Get(':chatId/messages')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get messages in a chat',
    description: 'Retrieve messages in a specified chat with pagination',
  })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async getMessages(
    @Param('chatId') chatId: string,
    @Query() query: GetMessagesDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.messageService.getMessages(chatId, userId, query);
  }

  @Post('messages')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Send a message',
    description: 'Send a message in a specified chat',
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Message sent successfully' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async sendMessage(
    @Body() dto: SendMessageDto,
    @CurrentUser('sub') userId: string,
  ) {
    const message = await this.messageService.sendMessage(
      dto.chatId,
      userId,
      dto.content,
      dto.messageType || 'TEXT',
    );
    // Update chat (lastMessage + timestamp)
    const chat = await this.chatService.getChatDetails(dto.chatId, userId);
    await this.chatService.updateConnectionLastMessage(
      chat.connectionId,
      message.createdAt,
      dto.content,
    );

    return message;
  }

  @Put('messages/:messageId/read')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Mark a message as read',
    description: 'Mark a specific message as read for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Message marked as read',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Message marked as read' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async markMessageAsRead(
    @Param('messageId') messageId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.messageService.markAsRead(messageId, userId);
  }

  @Put(':chatId/read-all')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Mark all messages in a chat as read',
    description:
      'Mark all messages in the specified chat as read for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'All messages marked as read',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'All messages marked as read' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Chat not found' })
  async markAllAsRead(
    @Param('chatId') chatId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.messageService.markAllAsRead(chatId, userId);
    await this.chatService.resetUnreadCount(chatId, userId);

    return { message: 'All messages marked as read' };
  }

  @Delete('messages/:messageId')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Delete a message',
    description: 'Delete a specific message by its ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Message deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Message deleted successfully' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.messageService.deleteMessage(messageId, userId);
  }

  @Get('unread/count')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get total unread message count for the current user',
    description:
      'Retrieve the total number of unread messages across all chats for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread message count retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 12 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.chatService.getUnreadCount(user.sub, user.role);
    return { count };
  }

  @Get(':chatId/unread/count')
  @Roles(UserRole.DOCTOR, UserRole.PATIENT)
  @ApiOperation({
    summary: 'Get unread message count for a specific chat',
    description:
      'Retrieve the number of unread messages in a specific chat for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread message count retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 5 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getChatUnreadCount(
    @Param('chatId') chatId: string,
    @CurrentUser('sub') userId: string,
  ) {
    const count = await this.messageService.getUnreadCount(chatId, userId);
    return { count };
  }
}
