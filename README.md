# WD2200 Week 4.1: Build a Secure API Endpoint

## Run locally

Requires Node.js 20 or newer.

```sh
cd code/start
npm ci
cp .env.example .env
npm run build
npm start
```

Before running the app, fill in `.env`: set a random JWT_SECRET of at least 32 characters and an ADMIN_PASSWORD of at least 12 characters. Use ADMIN_EMAIL and ADMIN_PASSWORD for administrator login. Do not commit `.env`.

## Endpoints

| Method | Path | Access |
| --- | --- | --- |
| GET | `/health` | Public |
| POST | `/auth/register` | Public; creates a USER |
| POST | `/auth/login` | Public; returns a one-hour JWT |
| GET | `/profile` | Authenticated user |
| GET | `/secure` | ADMIN only |

Registration and login accept JSON containing `email` and `password`. Passwords must contain at least 12 characters and no more than 72 UTF-8 bytes. Send the login token as `Authorization: Bearer <token>`. A USER receives 403 from `/secure`; an ADMIN receives 200. Missing or invalid tokens receive 401.

Users are stored in memory and reset when the server restarts. Passwords are hashed with bcrypt. The API uses Helmet, rate limits, express-validator, CORS, Morgan, Winston, and structured error responses. Logs are written to the console and `code/start/logs/`; credentials and tokens are excluded.

## Verification

With the server running, use cURL or Postman:

1. `GET /health` should return 200.
2. `POST /auth/register` with `{ "email": "user@example.com", "password": "ExamplePassword123!" }` should return 201 and role USER.
3. `POST /auth/login` with the same body should return 200 and a JWT.
4. `GET /profile` with the USER Bearer token should return 200 and role USER.
5. `GET /secure` without a token should return 401; with the USER token, 403.
6. Log in using the ADMIN credentials in the local `.env`. `GET /secure` with that token should return 200.
7. Register with an invalid email or short password: expect 400 with field messages. Confirm `request_error` and HTTP request entries in `logs/combined.log`.

Example public request: `curl -i http://localhost:3000/health`.
For protected requests use `Authorization: Bearer <token>` locally. Keep passwords and tokens out of screenshots.


Run `npm test` from `code/start`. The local build and all 15 integration tests passed.

Actual local screenshots are saved in `screenshots/`:

- `01-api-startup.png`: API startup.
- `02-authentication-and-roles.png`: registration, login, USER/ADMIN access, and invalid input.
- `03-request-and-error-logs.png`: HTTP request and error logs.

The app uses an in-memory user store; users reset when the server restarts. Keep `.env`, dependencies, build output and runtime logs out of the repository.
