import { ApiProperty } from '@nestjs/swagger';

export class ChatMessage {
  @ApiProperty({
    description: 'The role of the message author. Public API accepts user messages only.',
    enum: ['user']
  })
  role: 'user';

  @ApiProperty({
    description: 'The contents of the message'
  })
  content: string;
}
