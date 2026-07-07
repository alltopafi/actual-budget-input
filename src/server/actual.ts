import * as api from '@actual-app/api';
import { config } from './config';
import fs from 'fs';
import path from 'path';

let isInitialized = false;

export async function initActual() {
  if (isInitialized) return;

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(config.ACTUAL_DATA_DIR)) {
      fs.mkdirSync(config.ACTUAL_DATA_DIR, { recursive: true });
    }

    console.log('Connecting to Actual Budget server:', config.ACTUAL_SERVER_URL);
    await api.init({
      dataDir: config.ACTUAL_DATA_DIR,
      serverURL: config.ACTUAL_SERVER_URL,
      password: config.ACTUAL_SERVER_PASSWORD,
    });

    console.log('Downloading budget with Sync ID:', config.ACTUAL_BUDGET_SYNC_ID);
    await api.downloadBudget(config.ACTUAL_BUDGET_SYNC_ID);

    isInitialized = true;
    console.log('Actual Budget API initialized successfully!');
  } catch (error) {
    console.error('Failed to initialize Actual Budget API:', error);
    throw error;
  }
}

export async function ensureConnected() {
  if (!isInitialized) {
    await initActual();
  }
}

export async function shutdownActual() {
  if (isInitialized) {
    try {
      await api.shutdown();
      isInitialized = false;
      console.log('Actual Budget API shut down successfully.');
    } catch (error) {
      console.error('Error shutting down Actual Budget API:', error);
    }
  }
}

export async function getAccounts() {
  await ensureConnected();
  const accounts = await api.getAccounts();
  // Return only non-closed accounts
  return accounts.filter((a: any) => !a.closed);
}

export async function getCategoryGroups() {
  await ensureConnected();
  const groups = await api.getCategoryGroups();
  // Filter out hidden groups and hidden categories
  return groups
    .filter((g: any) => !g.hidden)
    .map((g: any) => ({
      ...g,
      categories: g.categories ? g.categories.filter((c: any) => !c.hidden) : []
    }));
}

export async function getPayees() {
  await ensureConnected();
  const payees = await api.getPayees();
  // Filter out transfer payees if desired, or return them all.
  // We'll return them all but front-end can mark transfers or filter them.
  return payees;
}

export async function createTransaction(accountId: string, data: {
  date: string;
  amount: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  notes?: string;
}) {
  await ensureConnected();

  // Convert decimal to integer cents (e.g., 10.50 -> 1050)
  const amountCents = Math.round(data.amount * 100);

  // Sync first to get the latest state from the server
  try {
    console.log('Syncing before transaction add...');
    await api.sync();
  } catch (err) {
    console.warn('Sync before transaction failed, proceeding anyway:', err);
  }

  const transactionObj: any = {
    date: data.date,
    amount: amountCents,
    notes: data.notes || '',
  };

  // Set category
  if (data.categoryId) {
    transactionObj.category = data.categoryId;
  }

  // Set payee: payeeId takes precedence, then payeeName
  if (data.payeeId) {
    transactionObj.payee = data.payeeId;
  } else if (data.payeeName) {
    transactionObj.payee_name = data.payeeName;
  }

  console.log(`Adding transaction to account ${accountId}:`, transactionObj);
  
  // Add transactions locally (runs transfers and learns categories rules)
  await api.addTransactions(accountId, [transactionObj], { runTransfers: true, learnCategories: true });

  // Sync changes back to the Actual server
  try {
    console.log('Syncing after transaction add...');
    await api.sync();
  } catch (err) {
    console.error('Sync after transaction failed (transaction is added locally):', err);
    throw new Error('Transaction was added locally but server sync failed: ' + (err as Error).message);
  }

  // Trigger optional webhook notification in the background
  if (config.TRANSACTION_WEBHOOK_URL) {
    (async () => {
      try {
        let accountName = 'Unknown Account';
        try {
          const accounts = await getAccounts();
          const acc = accounts.find((a: any) => a.id === accountId);
          if (acc) accountName = acc.name;
        } catch (e) {
          console.warn('Failed to resolve account name for webhook:', e);
        }

        let categoryName = 'No Category / Outflow';
        if (data.categoryId) {
          try {
            const groups = await getCategoryGroups();
            for (const group of groups) {
              const cat = group.categories?.find((c: any) => c.id === data.categoryId);
              if (cat) {
                categoryName = `${group.name} - ${cat.name}`;
                break;
              }
            }
          } catch (e) {
            console.warn('Failed to resolve category name for webhook:', e);
          }
        }

        let payeeName = data.payeeName || 'Unknown Payee';
        if (data.payeeId) {
          try {
            const payees = await getPayees();
            const p = payees.find((payee: any) => payee.id === data.payeeId);
            if (p) payeeName = p.name;
          } catch (e) {
            console.warn('Failed to resolve payee name for webhook:', e);
          }
        }

        console.log('Sending transaction webhook to:', config.TRANSACTION_WEBHOOK_URL);
        const response = await (globalThis as any).fetch(config.TRANSACTION_WEBHOOK_URL!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            accountId,
            accountName,
            date: data.date,
            amount: data.amount,
            amountCents,
            payeeId: data.payeeId,
            payeeName,
            categoryId: data.categoryId,
            categoryName,
            notes: data.notes || ""
          })
        });

        if (!response.ok) {
          console.error(`Webhook error: received status ${response.status}`);
        } else {
          console.log('Webhook sent successfully');
        }
      } catch (err) {
        console.error('Failed to send transaction webhook:', err);
      }
    })();
  }

  return { success: true };
}
