/* Centralized, validated configuration.
   All environment access goes through here — no process.env scattered around.
   Invalid config fails fast at startup instead of causing weird runtime bugs. */

const path = require('path');
require('dotenv').config();
const { z } = require('zod');

const SERVER_ROOT = path.resolve(__dirname, '..', '..');

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    ALLOWED_ORIGINS: z
        .string()
        .default('http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000'),
    DB_PATH: z.string().min(1).default('./data/oopd.db'),
    // Optional for now; becomes required when auth (Phase 2) lands.
    JWT_SECRET: z.string().min(32).optional(),
    // Optional email (SMTP) — when all are set, real OTP emails are sent.
    // Leave unset in dev: the OTP is logged to the console instead.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().optional()
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

const env = parsed.data;

// Resolve the JWT secret. Required in production; in development we allow an
// insecure fallback so the app still runs, but warn loudly.
let jwtSecret = env.JWT_SECRET;
if (!jwtSecret) {
    if (env.NODE_ENV === 'production') {
        // eslint-disable-next-line no-console
        console.error('❌ JWT_SECRET is required in production. Set it in the environment.');
        process.exit(1);
    }
    jwtSecret = 'dev-only-insecure-secret-do-not-use-in-production';
    // eslint-disable-next-line no-console
    console.warn('⚠  JWT_SECRET not set — using an INSECURE dev secret. Add JWT_SECRET to server/.env');
}

// Email is only "configured" when host + user + pass are all present.
const smtpReady = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
if (!smtpReady) {
    // eslint-disable-next-line no-console
    console.warn('ℹ  SMTP not configured — OTP codes will be logged to the console (dev mode).');
}

const config = Object.freeze({
    nodeEnv: env.NODE_ENV,
    isProd: env.NODE_ENV === 'production',
    port: env.PORT,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
    dbPath: path.resolve(SERVER_ROOT, env.DB_PATH),
    jwtSecret,
    jwtExpiresIn: '7d',
    smtp: smtpReady
        ? { host: env.SMTP_HOST, port: env.SMTP_PORT || 587, user: env.SMTP_USER, pass: env.SMTP_PASS }
        : null,
    mailFrom: env.MAIL_FROM || env.SMTP_USER || 'O-OPD <no-reply@oopd.local>'
});

module.exports = { config };
