import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActiveUserData } from '../Interface/active-user-data.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveUserData => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as ActiveUserData;
  },
);
