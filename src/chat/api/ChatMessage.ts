import { ApiProperty } from '@nestjs/swagger';

export class ChatMessage {
  @ApiProperty({
    description: 'The role of the message author. Only user messages are accepted from clients.',
    enum: ['user']
  })
  role: 'user';

  @ApiProperty({
    description: 'The contents of the message'
  })
  content: string;
}
