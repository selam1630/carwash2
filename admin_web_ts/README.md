# Admin Web TS

TypeScript React admin app for backend admin operations.

## Included Pages
- Register Biker (Washer): `POST /auth/admin/register-washer`
- Register Sales: `POST /auth/admin/register-sales`
- Plan Management:
  - List plans: `GET /plans`
  - Create plan: `POST /plans`
  - Activate/Deactivate: `PATCH /plans/:id`
  - Delete plan: `DELETE /plans/:id`

## Authentication
- OTP login:
  - `POST /auth/send-otp`
  - `POST /auth/verify-otp`
- Or paste an admin access token manually.

## Run
1. `cp .env.example .env`
2. Set `VITE_API_BASE_URL` in `.env`
3. `npm install`
4. `npm run dev`

## Notes
- ADMIN role is required for all admin actions.
- Phone format expected: `+2519xxxxxxxx`.
