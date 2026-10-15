# Phase 2 demo - Authentication and authorization

What to show that cookie sessions, CSRF, two-step verification, password flows
and the CASL role matrix work.

## 1. Clean install and full verification

```bash
pnpm install
pnpm verify
```

Expected: `pnpm verify` runs lint, typecheck (including tests), all test suites,
build and the offline check with no failures. Test counts at this phase:

| Package | Tests |
|---|---|
| `@cbt/exam-core` | 66 |
| `@cbt/shared-types` | 22 |
| `@cbt/cloud-api` | 77 |
| `@cbt/school-server` | 10 |

The cloud-api suite includes `src/modules/auth/auth.e2e.spec.ts` (14 tests) which
exercises every endpoint below against a real Nest application.

## 2. Start the API with a development account

Phase 2 keeps users in memory and has no registration endpoint, so a local
instance is seeded from `AUTH_DEV_SEED` (a JSON array; ignored in production):

```bash
AUTH_DEV_SEED='[{"email":"admin@school.ng","password":"TestPassword123!","role":"school_admin","fullName":"Ada Okafor","schoolCode":"GRA","schoolName":"Graceland College"}]' \
  pnpm --filter @cbt/cloud-api dev
```

Expected log line: `seeded 1 development account(s)`.

## 3. Routes are under `/api/v1`; `/health` stays at the root

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health          # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/health   # 404
```

## 4. Unauthenticated access is a `problem+json` 401

```bash
curl -s http://localhost:3000/api/v1/auth/me | jq
```

Expected:

```json
{
  "type": "https://docs.cbt.example/errors/auth-required",
  "title": "Authentication required",
  "status": 401,
  "code": "AUTH_REQUIRED",
  "detail": "...",
  "request_id": "01a0..."
}
```

## 5. Sign in sets an HttpOnly session cookie and a readable CSRF cookie

```bash
BASE=http://localhost:3000/api/v1
curl -s -c /tmp/cbt.txt -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@school.ng","password":"TestPassword123!"}' | jq
```

Expected: `200`, a `user` object (`role`, `full_name`, `school`, no
`must_change_password`) and a `csrf_token`. The cookie jar now holds:

- `cbt_session` - `HttpOnly; SameSite=Lax; Path=/` (never readable by JS)
- `cbt_csrf` - readable, equal to the returned `csrf_token`

`GET /auth/me` now works and returns the user, a licence block and the CSRF
token:

```bash
curl -s -b /tmp/cbt.txt $BASE/auth/me | jq
```

## 6. CSRF is enforced on state-changing requests

```bash
CSRF=$(awk '$6=="cbt_csrf"{print $7}' /tmp/cbt.txt)

# Missing header -> 403 FORBIDDEN (problem+json)
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/cbt.txt -X POST $BASE/auth/logout

# With the header -> 204, and the session is gone
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/cbt.txt -X POST $BASE/auth/logout \
  -H "X-CSRF-Token: $CSRF"
curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/cbt.txt $BASE/auth/me   # 401
```

## 7. Account lockout after five failed sign-ins

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"identifier":"admin@school.ng","password":"wrong"}'
done
```

Expected: `401` ×4, then `423` for the fifth and sixth attempts. The `423` body
has `"code": "ACCOUNT_LOCKED"` and a `locked_until` timestamp. The lock clears
after 15 minutes (`ACCOUNT_LOCKOUT_SECONDS`), and a correct password is refused
while locked.

## 8. Password reset (code is logged outside production)

```bash
curl -s -X POST $BASE/auth/password/forgot \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin@school.ng"}' | jq
```

Expected: `202` with a `challenge_id`. The server log shows
`password reset code issued for admin@school.ng code=NNNNNN`. A wrong code
returns `400 OTP_INVALID` with `attempts_left`; after five wrong codes the
challenge is dead. A correct code resets the password:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/auth/password/reset \
  -H 'Content-Type: application/json' \
  -d '{"challenge_id":"<id>","code":"<code>","new_password":"Even-Better-Passphrase-9"}'   # 204
```

An unknown identifier returns `202` too (no account enumeration) and sends
nothing.

## 9. Two-step verification (admins only)

```bash
curl -s -b /tmp/cbt.txt -X POST $BASE/auth/2fa/setup -H "X-CSRF-Token: $CSRF" | jq
```

Expected: `200` with `secret` and `otpauth_uri` (scan it, or feed the secret to
any TOTP tool). Confirm with a current code:

```bash
CODE=$(oathtool --totp -b "<secret>")
curl -s -b /tmp/cbt.txt -X POST $BASE/auth/2fa/enable \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d "{\"code\":\"$CODE\"}" | jq
```

Expected: `200` with ten `recovery_codes` (shown once; stored only as hashes).
The next sign-in without a code returns `401 TOTP_REQUIRED`; with a code (or a
recovery code) it succeeds. A `student` account gets `403 FORBIDDEN` from
`/auth/2fa/setup`.

## 10. Authorization matrix and session management

```bash
pnpm --filter @cbt/cloud-api test -- ability.factory
```

Expected: the CASL matrix from API spec section 19 - the platform owner manages
the platform but not school data, the school admin manages school data scoped to
its own `school_id`, teachers work in the question bank and release results but
not administer the school, parents only read released results/reports, students
and invigilators have no cloud abilities.

```bash
curl -s -b /tmp/cbt.txt $BASE/auth/sessions | jq
```

Expected: one row per live session with `device`, `ip`, `created_at`,
`last_seen_at` and `current: true` for this one. `DELETE /auth/sessions/{id}`
signed out another device immediately; changing the password revokes every
session except the current one.

## 11. Password policy is the API-spec rule

The policy is at least 10 characters, not a common password, and not equal to the
email or phone (API spec section 3). A violating password is rejected at the
schema or policy layer:

```bash
curl -s -b /tmp/cbt.txt -X POST $BASE/auth/password/change \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -d '{"current_password":"TestPassword123!","new_password":"password123"}' | jq
```

Expected: `422 VALIDATION_FAILED` with `errors: [{ "field": "new_password",
"code": "TOO_COMMON", ... }]`.
