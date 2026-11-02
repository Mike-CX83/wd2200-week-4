import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { createLogger } from './logger';

type Role = 'USER' | 'ADMIN';
interface User { id: string; email: string; passwordHash: string; role: Role }
interface Settings {
  jwtSecret: string;
  adminEmail: string;
  adminPassword: string;
  corsOrigin?: string;
  logDirectory?: string;
  silent?: boolean;
  rateLimitMax?: number;
}

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string,
    public details?: { field: string; message: string }[]) { super(message); }
}

export async function createApp(settings: Settings) {
  if (settings.jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  if (settings.adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.adminEmail)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  const logger = createLogger(settings.logDirectory ?? 'logs', settings.silent);
  const users = new Map<string, User>();
  const adminEmail = settings.adminEmail.trim().toLowerCase();
  users.set(adminEmail, { id: randomUUID(), email: adminEmail, passwordHash: await bcrypt.hash(settings.adminPassword, 12), role: 'ADMIN' });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: settings.corsOrigin ?? 'http://localhost:3000' }));
  app.use(morgan((tokens, req, res) => JSON.stringify({
    event: 'http_request',
    method: tokens.method(req, res),
    // Log the path only. Query strings can contain sensitive data.
    path: (req as Request).path,
    status: Number(tokens.status(req, res)),
    durationMs: Number(tokens['response-time'](req, res)),
  }), { stream: { write: line => logger.info(JSON.parse(line)) } }));
  const limitHandler = (_req: Request, _res: Response, next: NextFunction) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.'));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: settings.rateLimitMax ?? 100, standardHeaders: 'draft-8', legacyHeaders: false, handler: limitHandler }));
  app.use(express.json({ limit: '16kb' }));
  const credentials = [
    body('email').isString().bail().trim().isLength({ max: 254 }).isEmail().withMessage('A valid email address is required.').toLowerCase(),
    body('password').isString().bail().isLength({ min: 12 }).withMessage('Password must contain at least 12 characters.')
      .custom(value => Buffer.byteLength(value, 'utf8') <= 72).withMessage('Password must not exceed 72 UTF-8 bytes.'),
  ];
  const validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request data.',
        errors.array().map(e => ({ field: e.type === 'field' ? e.path : 'request', message: e.msg }))));
      return;
    }
    next();
  };
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
    if (!match) return next(new ApiError(401, 'UNAUTHORIZED', 'A valid Bearer token is required.'));
    try {
      const payload = jwt.verify(match[1], settings.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
      const user = users.get(typeof payload.email === 'string' ? payload.email : '');
      if (!user || user.id !== payload.sub || user.role !== payload.role) throw new Error('Invalid identity');
      res.locals.user = user;
      next();
    } catch { next(new ApiError(401, 'UNAUTHORIZED', 'The token is invalid or expired.')); }
  };
  const authorize = (role: Role) => (_req: Request, res: Response, next: NextFunction) => {
    if ((res.locals.user as User).role !== role) return next(new ApiError(403, 'FORBIDDEN', 'ADMIN role is required.'));
    next();
  };
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/auth/register', credentials,
    body('role').not().exists().withMessage('Roles cannot be assigned during registration.'), validate,
    async (req: Request, res: Response) => {
      const { email, password } = req.body;
      if (users.has(email)) throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
      const passwordHash = await bcrypt.hash(password, 12);
      // Recheck after the asynchronous hash to handle concurrent registrations.
      if (users.has(email)) throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
      const user: User = { id: randomUUID(), email, passwordHash, role: 'USER' };
      users.set(email, user);
      logger.info({ event: 'user_registered', userId: user.id });
      res.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
    });
  app.post('/auth/login', credentials, validate, async (req: Request, res: Response) => {
    const user = users.get(req.body.email);
    if (!user || !await bcrypt.compare(req.body.password, user.passwordHash)) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    const token = jwt.sign({ email: user.email, role: user.role }, settings.jwtSecret, {
      algorithm: 'HS256', subject: user.id, expiresIn: '1h',
    });
    logger.info({ event: 'login_succeeded', userId: user.id });
    res.json({ token, tokenType: 'Bearer', expiresIn: 3600 });
  });
  app.get('/profile', authenticate, (_req, res) => {
    const user: User = res.locals.user;
    res.json({ user: { id: user.id, email: user.email, role: user.role } });
  });
  app.get('/secure', authenticate, authorize('ADMIN'), (_req, res) => res.json({ message: 'Welcome to the secure ADMIN endpoint.', role: 'ADMIN' }));
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const parsed = error as { type?: string; status?: number };
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    if (error instanceof ApiError) ({ status, code, message } = error);
    else if (parsed?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON.'; }
    else if (parsed?.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds the size limit.'; }
    logger.log(status >= 500 ? 'error' : 'warn', { event: 'request_error', method: req.method, path: req.path, status, code });
    const details = error instanceof ApiError ? error.details : undefined;
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
  });
  return { app, logger };
}
