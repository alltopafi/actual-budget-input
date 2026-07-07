import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { 
  authMiddleware, 
  loginLimiter, 
  apiLimiter, 
  safeCompare, 
  AuthenticatedRequest 
} from './auth';
import { 
  initActual, 
  shutdownActual, 
  getAccounts, 
  getCategoryGroups, 
  getPayees, 
  createTransaction 
} from './actual';

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Enable CORS for development
if (config.NODE_ENV === 'development') {
  app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
  }));
}

// Apply API general rate limiter
app.use('/api', apiLimiter);

// ----------------------------------------------------
// Authentication Routes
// ----------------------------------------------------

/**
 * POST /api/auth/login
 * Verifies access password, sets HttpOnly auth cookie
 */
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const isValid = safeCompare(password, config.APP_PASSWORD);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { authenticated: true },
    config.JWT_SECRET,
    { expiresIn: '30d' }
  );

  // Set HttpOnly, SameSite=Strict secure cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });

  return res.json({ success: true, message: 'Logged in successfully' });
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie
 */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  return res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/status
 * Verifies current authentication status
 */
app.get('/api/auth/status', (req, res) => {
  const token = req.cookies?.auth_token;

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { authenticated: boolean };
    return res.json({ authenticated: decoded.authenticated });
  } catch {
    return res.json({ authenticated: false });
  }
});

// ----------------------------------------------------
// Budget Routes (Requires Authentication)
// ----------------------------------------------------

/**
 * GET /api/accounts
 * Returns non-closed accounts
 */
app.get('/api/accounts', authMiddleware, async (req, res) => {
  try {
    const accounts = await getAccounts();
    return res.json(accounts);
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch accounts from Actual Budget' });
  }
});

/**
 * GET /api/categories
 * Returns category groups with nested categories
 */
app.get('/api/categories', authMiddleware, async (req, res) => {
  try {
    const groups = await getCategoryGroups();
    return res.json(groups);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories from Actual Budget' });
  }
});

/**
 * GET /api/payees
 * Returns payees
 */
app.get('/api/payees', authMiddleware, async (req, res) => {
  try {
    const payees = await getPayees();
    return res.json(payees);
  } catch (error) {
    console.error('Error fetching payees:', error);
    return res.status(500).json({ error: 'Failed to fetch payees from Actual Budget' });
  }
});

/**
 * POST /api/transactions
 * Adds a new transaction to Actual Budget and syncs immediately
 */
app.post('/api/transactions', authMiddleware, async (req, res) => {
  const { accountId, date, amount, payeeId, payeeName, categoryId, notes } = req.body;

  // Validation
  if (!accountId) {
    return res.status(400).json({ error: 'Account ID is required' });
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date is required and must be in YYYY-MM-DD format' });
  }
  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'Amount is required and must be a valid number' });
  }
  if (!payeeId && !payeeName) {
    return res.status(400).json({ error: 'Either Payee ID or Payee Name is required' });
  }

  try {
    const result = await createTransaction(accountId, {
      date,
      amount: Number(amount),
      payeeId,
      payeeName,
      categoryId,
      notes
    });
    return res.json(result);
  } catch (error) {
    console.error('Error creating transaction:', error);
    return res.status(500).json({ 
      error: (error as Error).message || 'Failed to create transaction in Actual Budget' 
    });
  }
});

// ----------------------------------------------------
// Frontend Static Files (Production mode only)
// ----------------------------------------------------
const clientBuildPath = path.join(__dirname, '../../dist/client');

app.use(express.static(clientBuildPath));

// Serve index.html for SPA routes
app.get('*', (req, res, next) => {
  // If request is for an API endpoint that wasn't matched, skip
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      // If index.html doesn't exist (e.g. frontend not built yet), send a placeholder response
      res.status(200).send('Frontend bundle not found. Please build the client using "npm run build".');
    }
  });
});

// Start Server & Connect to Actual Budget API
const port = config.PORT;
app.listen(port, async () => {
  console.log(`Server running on port ${port} in ${config.NODE_ENV} mode`);
  
  try {
    await initActual();
  } catch (error) {
    console.error('CRITICAL: Actual Budget API failed to initialize during startup.');
    console.error('The server will continue to run, but budget operations will fail until resolved.');
  }
});

// Graceful Shutdown
const handleShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  await shutdownActual();
  process.exit(0);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
