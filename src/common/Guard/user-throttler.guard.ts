import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authHeader = req.headers?.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const [, payloadB64] = token.split('.');
        if (payloadB64) {
          const payload = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
          ) as { sub?: string };
          if (payload?.sub) return payload.sub;
        }
      } catch {}
    }
    return req.ip ?? 'unknown';
  }
}
