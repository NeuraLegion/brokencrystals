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

const MAX_MESSAGE_LENGTH = 2000;
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DISALLOWED_PROMPT_BOUNDARY_CHARS = /[`$<>]/g;
const DISALLOWED_INSTRUCTION_PATTERNS = [
  /\bignore\s+previous\s+instructions\b/i,
  /\bignore\s+all\s+previous\s+instructions\b/i,
  /\breveal\s+system\s+prompt\b/i,
  /\bdisregard\s+the\s+above\b/i,
  /\byou\s+are\s+now\b/i,
  /\bassistant:\s*/i,
  /\bsystem:\s*/i,
  /\bdeveloper:\s*/i,
  /\btool:\s*/i,
  /\bfunction:\s*/i
];

@Controller('/api/chat')
@ApiTags('Chat controller')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('/query')
  @ApiOperation({ description: API_DESC_CHAT_QUESTION })
  @ApiBody({
    description: 'A single user message to send to the assistant',
    schema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', maxLength: MAX_MESSAGE_LENGTH }
      }
    }
  })
  @ApiOkResponse({
    description: 'Chatbot answer',
    type: String
  })
  async query(
    @Body() body: { content?: unknown }
  ): Promise<string> {
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpException(
          'Invalid chat request body',
          HttpStatus.BAD_REQUEST
        );
      }

      if (typeof body.content !== 'string') {
        throw new HttpException(
          'Message content must be a string',
          HttpStatus.BAD_REQUEST
        );
      }

      const normalizedContent = body.content
        .replace(DISALLOWED_CONTROL_CHARS, ' ')
        .replace(DISALLOWED_PROMPT_BOUNDARY_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!normalizedContent) {
        throw new HttpException(
          'Message content cannot be empty',
          HttpStatus.BAD_REQUEST
        );
      }

      if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
        throw new HttpException(
          `Message content exceeds maximum length of ${MAX_MESSAGE_LENGTH}`,
          HttpStatus.BAD_REQUEST
        );
      }

      for (const pattern of DISALLOWED_INSTRUCTION_PATTERNS) {
        if (pattern.test(normalizedContent)) {
          throw new HttpException(
            'Message content contains unsupported instruction-like text',
            HttpStatus.BAD_REQUEST
          );
        }
      }

      return await this.chatService.query(normalizedContent);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }

      throw new HttpException(
        'Chat API response error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
