import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';

const settings = { jwtSecret: 'test-only-secret-with-at-least-32-characters', adminEmail: 'admin@example.com', adminPassword: 'TestOnlyAdminPassword123!', rateLimitMax: 1000 };
let service: Awaited<ReturnType<typeof createApp>>;
let directory: string;
let userToken: string;
let adminToken: string;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wd2200-tests-'));
  service = await createApp({ ...settings, logDirectory: directory });
});
after(async () => {
  if (!service.logger.writableEnded) await new Promise<void>(resolve => { service.logger.on('finish', resolve); service.logger.end(); });
  await rm(directory, { recursive: true, force: true });
});

test('health responds with security headers', async () => {
  const result = await request(service.app).get('/health').expect(200);
  assert.equal(result.body.status, 'ok');
  assert.ok(result.headers['content-security-policy']);
  assert.equal(result.headers['x-powered-by'], undefined);
});
test('invalid registration is rejected without echoing passwords', async () => {
  const result = await request(service.app).post('/auth/register').send({ email: 'invalid', password: 'short' }).expect(400);
  assert.equal(result.body.error.code, 'VALIDATION_ERROR');
  assert.ok(!JSON.stringify(result.body).includes('short'));
});
test('registration cannot grant ADMIN', async () => {
  await request(service.app).post('/auth/register').send({ email: 'attacker@example.com', password: 'ValidPassword123!', role: 'ADMIN' }).expect(400);
});
test('registration creates USER and never returns password hash', async () => {
  const result = await request(service.app).post('/auth/register').send({ email: 'USER@example.com', password: 'ValidPassword123!' }).expect(201);
  assert.equal(result.body.user.role, 'USER');
  assert.equal(result.body.user.email, 'user@example.com');
  assert.equal(result.body.user.passwordHash, undefined);
});
test('duplicate emails are rejected', async () => {
  await request(service.app).post('/auth/register').send({ email: 'user@example.com', password: 'ValidPassword123!' }).expect(409);
});
test('wrong password and unknown account have consistent errors', async () => {
  for (const email of ['user@example.com', 'absent@example.com']) {
    const result = await request(service.app).post('/auth/login').send({ email, password: 'WrongPassword123!' }).expect(401);
    assert.equal(result.body.error.code, 'INVALID_CREDENTIALS');
  }
});
test('USER login issues an expiring JWT and profile works', async () => {
  const result = await request(service.app).post('/auth/login').send({ email: 'user@example.com', password: 'ValidPassword123!' }).expect(200);
  userToken = result.body.token;
  const payload = jwt.verify(userToken, settings.jwtSecret) as jwt.JwtPayload;
  assert.equal(payload.role, 'USER');
  assert.equal(payload.exp! - payload.iat!, 3600);
  const profile = await request(service.app).get('/profile').set('Authorization', `Bearer ${userToken}`).expect(200);
  assert.equal(profile.body.user.role, 'USER');
});
test('secure endpoint rejects missing, malformed, forged, and expired tokens', async () => {
  await request(service.app).get('/secure').expect(401);
  const expired = jwt.sign({ email: settings.adminEmail, role: 'ADMIN' }, settings.jwtSecret, { expiresIn: -1, issuer: 'wd2200-api', audience: 'wd2200-client' });
  const forged = jwt.sign({ email: settings.adminEmail, role: 'ADMIN' }, 'a-different-secret');
  for (const token of ['invalid', expired, forged]) await request(service.app).get('/secure').set('Authorization', `Bearer ${token}`).expect(401);
});
test('authenticated USER cannot access ADMIN endpoint', async () => {
  const result = await request(service.app).get('/secure').set('Authorization', `Bearer ${userToken}`).expect(403);
  assert.equal(result.body.error.code, 'FORBIDDEN');
});
test('ADMIN login and secure endpoint succeed', async () => {
  const result = await request(service.app).post('/auth/login').send({ email: settings.adminEmail, password: settings.adminPassword }).expect(200);
  adminToken = result.body.token;
  const secure = await request(service.app).get('/secure').set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.equal(secure.body.role, 'ADMIN');
});
test('invalid JSON, oversized bodies and missing routes use structured errors', async () => {
  const malformed = await request(service.app).post('/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const large = await request(service.app).post('/auth/login').send({ padding: 'x'.repeat(20000) }).expect(413);
  assert.equal(large.body.error.code, 'PAYLOAD_TOO_LARGE');
  const missing = await request(service.app).get('/missing').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');
});
test('UTF-8 passwords exceeding bcrypt limit are rejected', async () => {
  await request(service.app).post('/auth/register').send({ email: 'unicode@example.com', password: '😀'.repeat(19) }).expect(400);
});
test('concurrent registrations do not overwrite an account', async () => {
  const responses = await Promise.all([1, 2].map(() => request(service.app).post('/auth/register').send({ email: 'race@example.com', password: 'ValidPassword123!' })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
});
test('rate limiter returns a consistent 429 response', async () => {
  const limited = await createApp({ ...settings, rateLimitMax: 1, logDirectory: directory, silent: true });
  await request(limited.app).get('/health').expect(200);
  const response = await request(limited.app).get('/health').expect(429);
  assert.equal(response.body.error.code, 'RATE_LIMITED');
  assert.ok(response.headers['retry-after']);
  limited.logger.end();
});
test('HTTP requests are logged without tokens, passwords, or query strings', async () => {
  await request(service.app).get('/health?private=do-not-log').expect(200);
  // Wait for the actual transport to flush by ending it, rather than guessing a delay.
  await new Promise<void>(resolve => { service.logger.on('finish', resolve); service.logger.end(); });
  const logs = await readFile(join(directory, 'combined.log'), 'utf8');
  assert.ok(logs.includes('http_request'));
  assert.ok(logs.includes('FORBIDDEN'));
  assert.ok(logs.includes('VALIDATION_ERROR'));
  assert.ok(!logs.includes('ValidPassword123!'));
  assert.ok(!logs.includes(adminToken));
  assert.ok(!logs.includes('do-not-log'));
});
