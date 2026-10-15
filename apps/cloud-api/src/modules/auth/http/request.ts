import { HttpRequest } from '../../../common/http/http-types';
import type { AuthContext } from '../domain/types';

/** A request that may have been authenticated by the {@link AuthGuard}. */
export interface AuthRequest extends HttpRequest {
  auth?: AuthContext;
}
