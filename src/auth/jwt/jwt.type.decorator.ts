import { CustomDecorator, SetMetadata } from '@nestjs/common';
import { JwtProcessorType } from '../auth.service';

export const JwTypeMetadataField = 'jwtType';

export const JwtType = (type: JwtProcessorType): CustomDecorator<string> =>
  SetMetadata(JwTypeMetadataField, type);
