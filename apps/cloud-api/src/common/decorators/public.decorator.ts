import { SetMetadata } from '@nestjs/common';

/** Metadata key marking a route as reachable without a session. */
export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Marks a route (or controller) as public, so the global authentication guard
 * lets it through. Login, password reset and health checks use it.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
