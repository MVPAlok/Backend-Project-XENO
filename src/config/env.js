import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters long'
  }),
  JWT_REFRESH_SECRET: z.string().min(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters long'
  }),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().or(z.literal('')),
  SMTP_PASS: z.string().optional().or(z.literal('')),
  SMTP_FROM: z.string().email().default('noreply@xeno-saas.com'),
  CORS_ORIGIN: z.string().optional().default('*'),
});

let env;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingKeys = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join('\n');
    console.error('❌ Invalid Environment Variables Configuration:\n' + missingKeys);
    process.exit(1);
  }
  throw error;
}

export default env;
export { env };
