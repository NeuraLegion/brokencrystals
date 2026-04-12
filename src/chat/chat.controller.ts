import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { API_DESC_CHAT_QUESTION } from './chat.controller.api.desc';
import { ChatMessage } from './api/ChatMessage';

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

@Controller('/api/chat')
@ApiTags('Chat controller')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('/query')
  @ApiOperation({ description: API_DESC_CHAT_QUESTION })
  @ApiBody({
    description: 'A list of user messages comprising the conversation so far',
    type: [ChatMessage]
  })
  @ApiOkResponse({
    description: 'Chatbot answer',
    type: String
  })
  async query(@Body() messages: ChatMessage[]): Promise<string> {
    try {
      if (!Array.isArray(messages)) {
        throw new HttpException(
          'Invalid chat request body',
          HttpStatus.BAD_REQUEST
        );
      }

      if (messages.length === 0) {
        throw new HttpException(
          'At least one message is required',
          HttpStatus.BAD_REQUEST
        );
      }

      if (messages.length > MAX_MESSAGES) {
        throw new HttpException(
          `Too many messages. Maximum allowed is ${MAX_MESSAGES}`,
          HttpStatus.BAD_REQUEST
        );
      }

      const sanitizedMessages = messages.map((message, index) => {
        if (!message || typeof message !== 'object') {
          throw new HttpException(
            `Invalid message at index ${index}`,
            HttpStatus.BAD_REQUEST
          );
        }

        if (message.role !== 'user') {
          throw new HttpException(
            'Only user messages are allowed in this endpoint',
            HttpStatus.BAD_REQUEST
          );
        }

        if (typeof message.content !== 'string') {
          throw new HttpException(
            `Invalid message content at index ${index}`,
            HttpStatus.BAD_REQUEST
          );
        }

        const trimmedContent = message.content
          .replace(DISALLOWED_CONTROL_CHARS, ' ')
          .trim();

        if (!trimmedContent) {
          throw new HttpException(
            `Message content at index ${index} cannot be empty`,
            HttpStatus.BAD_REQUEST
          );
        }

        if (trimmedContent.length > MAX_MESSAGE_LENGTH) {
          throw new HttpException(
            `Message content at index ${index} exceeds maximum length of ${MAX_MESSAGE_LENGTH}`,
            HttpStatus.BAD_REQUEST
          );
        }

        const sanitizedMessage = new ChatMessage();
        sanitizedMessage.role = 'user';
        sanitizedMessage.content = trimmedContent;
        return sanitizedMessage;
      });

      return await this.chatService.query(sanitizedMessages);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        `Chat API response error: ${err}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
