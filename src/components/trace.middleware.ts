import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    if (req.method === 'TRACE') {
      const trace = req['trace-supported'];

      if (req['trace-supported']) {
        res.header('trace-supported', trace);
      }

      res.send();
    } else {
      next();
    }
  }
}
