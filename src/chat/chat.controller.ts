import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  BadRequestException,
  Logger,
  Post
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { API_DESC_CHAT_QUESTION } from './chat.controller.api.desc';
import { ChatMessage } from './api/ChatMessage';

@Controller('/api/chat')
@ApiTags('Chat controller')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);
  private static readonly MAX_MESSAGES = 20;
  private static readonly MAX_CONTENT_LENGTH = 4000;

  constructor(private readonly chatService: ChatService) {}

  private validateMessages(messages: ChatMessage[]): ChatMessage[] {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestException('messages must be a non-empty array');
    }

    if (messages.length > ChatController.MAX_MESSAGES) {
      throw new BadRequestException(`messages must not contain more than ${ChatController.MAX_MESSAGES} items`);
    }

    return messages.map((message, index) => {
      if (!message || typeof message !== 'object') {
        throw new BadRequestException(`messages[${index}] must be an object`);
      }

      if (message.role !== 'user') {
        throw new BadRequestException(`messages[${index}].role must be user`);
      }

      if (typeof message.content !== 'string') {
        throw new BadRequestException(`messages[${index}].content must be a string`);
      }

      const content = message.content.trim();

      if (!content) {
        throw new BadRequestException(`messages[${index}].content must not be empty`);
      }

      if (content.length > ChatController.MAX_CONTENT_LENGTH) {
        throw new BadRequestException(
          `messages[${index}].content must not exceed ${ChatController.MAX_CONTENT_LENGTH} characters`
        );
      }

      return {
        role: 'user',
        content
      };
    });
  }

  @Post('/query')
  @ApiOperation({ description: API_DESC_CHAT_QUESTION })
  @ApiBody({
    description: 'A list of messages comprising the conversation so far',
    type: [ChatMessage]
  })
  @ApiOkResponse({
    description: 'Chatbot answer',
    type: String
  })
  async query(@Body() messages: ChatMessage[]): Promise<string> {
    try {
      return await this.chatService.query(this.validateMessages(messages));
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }

      this.logger.error('Chat API request failed', err instanceof Error ? err.stack : String(err));
      throw new HttpException(
        'Chat API request failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
