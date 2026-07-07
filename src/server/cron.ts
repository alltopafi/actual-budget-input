import cron from 'node-cron';
import * as api from '@actual-app/api';
import { config } from './config';
import { ensureConnected, getAccounts, getCategoryGroups, getPayees } from './actual';

/**
 * Initializes the scheduled budget reporting cron job
 */
export function initCron() {
  const cronExpression = config.REPORT_CRON || '0 20 * * *';
  const timezone = config.REPORT_TIMEZONE || 'America/Chicago';

  console.log(`Scheduling budget report cron: "${cronExpression}" in timezone "${timezone}"`);

  cron.schedule(cronExpression, async () => {
    console.log('Running scheduled budget report...');
    try {
      await runBudgetReport();
    } catch (error) {
      console.error('Failed to run scheduled budget report:', error);
    }
  }, {
    timezone
  });
}

/**
 * Generates the budget report, prints it locally with terminal colors,
 * and sends it to the configured webhook destination.
 */
export async function runBudgetReport() {
  await ensureConnected();

  // Get current month in YYYY-MM format (local server time)
  const now = new Date();
  const year = now.getFullYear();
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonth = `${year}-${monthStr}`;

  console.log(`Generating daily budget report for ${currentMonth}...`);
  const budgetData = await api.getBudgetMonth(currentMonth);

  if (!budgetData || !budgetData.categoryGroups) {
    throw new Error(`No budget data returned for month ${currentMonth}`);
  }

  // Format month name (e.g. July 2026)
  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  let textReport = `📊 **Budget Report for ${monthName}**\n\n`;
  let consoleReport = `\x1b[1m📊 Budget Report for ${monthName}\x1b[0m\n\n`;

  let totalExpensesBudgeted = 0;
  let totalExpensesSpent = 0;

  for (const group of budgetData.categoryGroups as any[]) {
    // Filter out hidden groups and check for categories
    if (group.hidden || !group.categories || group.categories.length === 0) {
      continue;
    }

    // Skip income group for expense reporting
    if (group.is_income) {
      continue;
    }

    let groupText = `**${group.name}**\n`;
    let groupConsole = `\x1b[1m\x1b[36m${group.name}\x1b[0m\n`;
    let hasVisibleCategories = false;

    for (const cat of group.categories) {
      if (cat.hidden) continue;
      hasVisibleCategories = true;

      const budgeted = (cat.budgeted || 0) / 100;
      const spent = (cat.spent || 0) / 100;
      const balance = (cat.balance || 0) / 100;

      // Accumulate totals
      totalExpensesBudgeted += budgeted;
      totalExpensesSpent += spent;

      // In Actual Budget, spent is negative for expenses.
      // If balance < 0, it means we spent more than budgeted.
      const isOverspent = balance < 0;
      const emoji = isOverspent ? '🔴' : '🟢';
      const statusColorConsole = isOverspent ? '\x1b[31m' : '\x1b[32m'; // Red or Green

      const absSpent = Math.abs(spent);

      groupText += `${emoji} ${cat.name}: Spent $${absSpent.toFixed(2)} of $${budgeted.toFixed(2)} (Remaining: ${balance >= 0 ? '+' : ''}$${balance.toFixed(2)})\n`;
      groupConsole += `  ${statusColorConsole}${emoji}\x1b[0m ${cat.name}: Spent $${absSpent.toFixed(2)} of $${budgeted.toFixed(2)} (Remaining: ${balance >= 0 ? '+' : ''}$${balance.toFixed(2)})\n`;
    }

    if (hasVisibleCategories) {
      textReport += groupText + '\n';
      consoleReport += groupConsole + '\n';
    }
  }

  // Calculate totals
  const totalBalance = totalExpensesBudgeted + totalExpensesSpent;
  const isTotalOverspent = totalBalance < 0;
  const totalEmoji = isTotalOverspent ? '🔴' : '🟢';
  const totalColorConsole = isTotalOverspent ? '\x1b[31m' : '\x1b[32m';

  const totalAbsSpent = Math.abs(totalExpensesSpent);

  const totalsText = `-----------------------------------------\n` +
    `**TOTAL EXPENSES**\n` +
    `${totalEmoji} Spent $${totalAbsSpent.toFixed(2)} of $${totalExpensesBudgeted.toFixed(2)} (Remaining: ${totalBalance >= 0 ? '+' : ''}$${totalBalance.toFixed(2)})`;

  const totalsConsole = `-----------------------------------------\n` +
    `\x1b[1mTOTAL EXPENSES\x1b[0m\n` +
    `  ${totalColorConsole}${totalEmoji}\x1b[0m Spent $${totalAbsSpent.toFixed(2)} of $${totalExpensesBudgeted.toFixed(2)} (Remaining: ${totalBalance >= 0 ? '+' : ''}$${totalBalance.toFixed(2)})`;

  textReport += totalsText;
  consoleReport += totalsConsole;

  // Print report to container log
  console.log(consoleReport);

  // Send to webhook if configured
  if (config.TRANSACTION_WEBHOOK_URL) {
    console.log('Sending budget report to webhook:', config.TRANSACTION_WEBHOOK_URL);
    try {
      // Send both text (Slack/generic) and content (Discord) to support all common webhooks out-of-the-box
      const response = await (globalThis as any).fetch(config.TRANSACTION_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: textReport,
          content: textReport
        })
      });

      if (!response.ok) {
        console.error(`Report webhook failed with status ${response.status}`);
      } else {
        console.log('Report webhook sent successfully.');
      }
    } catch (err) {
      console.error('Failed to send report webhook:', err);
    }
  }
}
