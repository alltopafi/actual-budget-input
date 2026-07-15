import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load .env file
dotenv.config();

export interface Config {
  PORT: number;
  NODE_ENV: string;
  APP_PASSWORD: string;
  JWT_SECRET: string;
  ACTUAL_SERVER_URL: string;
  ACTUAL_SERVER_PASSWORD: string;
  ACTUAL_BUDGET_SYNC_ID: string;
  ACTUAL_DATA_DIR: string;
  TRANSACTION_WEBHOOK_URL?: string;
  API_KEY?: string;
}

const requiredEnv = [
  'APP_PASSWORD',
  'ACTUAL_SERVER_URL',
  'ACTUAL_SERVER_PASSWORD',
  'ACTUAL_BUDGET_SYNC_ID'
];

const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please create a .env file based on .env.example');
  process.exit(1);
}

// Generate a random JWT secret if not specified
const jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET was not provided. A random secret has been generated.');
  console.warn('Sessions will be invalidated if the server restarts.');
}

export const config: Config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_PASSWORD: process.env.APP_PASSWORD!,
  JWT_SECRET: jwtSecret,
  ACTUAL_SERVER_URL: process.env.ACTUAL_SERVER_URL!,
  ACTUAL_SERVER_PASSWORD: process.env.ACTUAL_SERVER_PASSWORD!,
  ACTUAL_BUDGET_SYNC_ID: process.env.ACTUAL_BUDGET_SYNC_ID!,
  ACTUAL_DATA_DIR: process.env.ACTUAL_DATA_DIR || path.join(process.cwd(), 'data'),
  TRANSACTION_WEBHOOK_URL: process.env.TRANSACTION_WEBHOOK_URL,
  API_KEY: process.env.API_KEY
};
