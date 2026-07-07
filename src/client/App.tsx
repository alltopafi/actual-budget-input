import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  Tag, 
  User, 
  FileText, 
  ChevronDown, 
  RefreshCw 
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  is_income: boolean;
  hidden: boolean;
  group_id: string;
}

interface CategoryGroup {
  id: string;
  name: string;
  is_income: boolean;
  hidden: boolean;
  categories: Category[];
}

interface Account {
  id: string;
  name: string;
  closed: boolean;
  offbudget: boolean;
  type: string;
}

interface Payee {
  id: string;
  name: string;
  transfer_acct?: string | null;
}

interface ToastMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

export default function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // App Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form input states
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [amountType, setAmountType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [payeeInput, setPayeeInput] = useState('');
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPayeeDropdown, setShowPayeeDropdown] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const payeeDropdownRef = useRef<HTMLDivElement>(null);

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Fetch app data when authenticated
  useEffect(() => {
    if (isAuthenticated === true) {
      fetchData();
    }
  }, [isAuthenticated]);

  // Click away listener for payee autocomplete
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (payeeDropdownRef.current && !payeeDropdownRef.current.contains(event.target as Node)) {
        setShowPayeeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.authenticated);
    } catch {
      setIsAuthenticated(false);
    }
  };

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast(prev => prev && prev.text === text ? null : prev);
    }, 5000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setAuthLoading(true);
    setToast(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (res.ok) {
        setIsAuthenticated(true);
        setPassword('');
      } else {
        showToast('error', data.error || 'Login failed');
      }
    } catch (err) {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setIsAuthenticated(false);
      // Reset caches
      setAccounts([]);
      setCategoryGroups([]);
      setPayees([]);
    } catch {
      showToast('error', 'Logout failed');
    }
  };

  const fetchData = async () => {
    setLoadingData(true);
    try {
      const [accountsRes, categoriesRes, payeesRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/categories'),
        fetch('/api/payees')
      ]);

      if (accountsRes.status === 401 || categoriesRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      const accountsData = await accountsRes.json();
      const categoriesData = await categoriesRes.json();
      const payeesData = await payeesRes.json();

      setAccounts(accountsData);
      setCategoryGroups(categoriesData);
      setPayees(payeesData);

      // Pre-select account (use last saved or first available)
      const lastAccountId = localStorage.getItem('last_account_id');
      if (lastAccountId && accountsData.some((a: Account) => a.id === lastAccountId)) {
        setAccountId(lastAccountId);
      } else if (accountsData.length > 0) {
        setAccountId(accountsData[0].id);
      }
    } catch (err) {
      showToast('error', 'Failed to retrieve data from Actual Budget. Refresh to retry.');
    } finally {
      setLoadingData(false);
    }
  };

  const handlePayeeSelect = (payee: Payee) => {
    setPayeeInput(payee.name);
    setSelectedPayeeId(payee.id);
    setShowPayeeDropdown(false);
  };

  const handlePayeeInputChange = (val: string) => {
    setPayeeInput(val);
    
    // Check if the typed value matches an existing payee exactly (case insensitive)
    const match = payees.find(p => p.name.toLowerCase() === val.trim().toLowerCase());
    if (match) {
      setSelectedPayeeId(match.id);
    } else {
      setSelectedPayeeId(undefined); // Treat as custom/new payee
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId) {
      showToast('error', 'Please select an account');
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      showToast('error', 'Please enter a valid amount greater than 0');
      return;
    }
    if (!payeeInput.trim()) {
      showToast('error', 'Please enter or select a payee');
      return;
    }

    setIsSubmitting(true);
    setToast(null);

    // Save account ID to local storage for quick access next time
    localStorage.setItem('last_account_id', accountId);

    // Convert to signed amount based on toggle (outflows are negative in Actual Budget)
    const finalAmount = amountType === 'expense' ? -Math.abs(Number(amount)) : Math.abs(Number(amount));

    try {
      const payload: any = {
        accountId,
        date,
        amount: finalAmount,
        notes
      };

      if (selectedPayeeId) {
        payload.payeeId = selectedPayeeId;
      } else {
        payload.payeeName = payeeInput.trim();
      }

      if (categoryId) {
        payload.categoryId = categoryId;
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Auth-CSRF': '1' // Enforce anti-CSRF check on backend
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        showToast('success', 'Transaction added and synced successfully!');
        // Reset form inputs (preserve account ID)
        setAmount('');
        setPayeeInput('');
        setSelectedPayeeId(undefined);
        setNotes('');
        setCategoryId('');
        setDate(new Date().toISOString().split('T')[0]);
        // Refresh payees in background (if a new one was added)
        fetch('/api/payees')
          .then(r => r.json())
          .then(data => setPayees(data))
          .catch(() => {});
      } else {
        showToast('error', data.error || 'Failed to add transaction');
      }
    } catch (err) {
      showToast('error', 'Network error occurred while submitting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter payees list for autocomplete
  const filteredPayees = payeeInput.trim() === ''
    ? payees.slice(0, 10) // Show first 10 when empty
    : payees.filter(p => p.name.toLowerCase().includes(payeeInput.toLowerCase())).slice(0, 15);

  // Authentication Loading Spinner
  if (isAuthenticated === null) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <RefreshCw className="spinner" style={{ width: '32px', height: '32px', marginRight: 0, color: 'var(--color-primary)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Securing connection...</p>
      </div>
    );
  }

  // 1. Login View
  if (isAuthenticated === false) {
    return (
      <div className="glass-card">
        <div className="app-header">
          <div style={{ display: 'inline-flex', padding: '12px', background: 'var(--color-primary-glow)', borderRadius: '16px', marginBottom: '16px', color: 'var(--color-primary)' }}>
            <Lock size={28} />
          </div>
          <h1>Quick Input Login</h1>
          <p>Access your Actual Budget inputs securely</p>
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`}>
            <AlertCircle size={18} className="toast-icon" />
            <span>{toast.text}</span>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label" htmlFor="password">Access Password</label>
            <input 
              className="form-input"
              type="password"
              id="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={authLoading}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={authLoading}>
            {authLoading ? (
              <>
                <div className="spinner" />
                Validating...
              </>
            ) : 'Unlock Wallet'}
          </button>
        </form>
      </div>
    );
  }

  // 2. Main Transaction Form View
  return (
    <div>
      <div className="logout-btn-container">
        <button className="logout-link" onClick={handleLogout}>
          <LogOut size={16} />
          Log Out
        </button>
      </div>

      <div className="glass-card">
        <div className="app-header" style={{ marginBottom: '20px' }}>
          <h1>Add Transaction</h1>
          <p>Instantly push a transaction to Actual Budget</p>
        </div>

        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.type === 'success' ? (
              <CheckCircle2 size={18} className="toast-icon" />
            ) : (
              <AlertCircle size={18} className="toast-icon" />
            )}
            <span>{toast.text}</span>
          </div>
        )}

        {loadingData ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: '12px' }}>
            <RefreshCw className="spinner" style={{ width: '28px', height: '28px', marginRight: 0, color: 'var(--color-primary)' }} />
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Syncing with Actual Budget...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Account Selection */}
            <div className="form-group">
              <label className="form-label" htmlFor="account">Account</label>
              <select 
                className="form-input"
                id="account"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                required
              >
                <option value="" disabled>Select Budget Account</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.offbudget ? '(Off-budget)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Date and Amount Row */}
            <div className="form-row">
              {/* Date */}
              <div className="form-group">
                <label className="form-label" htmlFor="date">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} /> Date
                  </span>
                </label>
                <input 
                  className="form-input"
                  type="date"
                  id="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>

              {/* Amount */}
              <div className="form-group">
                <label className="form-label" htmlFor="amount">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <DollarSign size={13} /> Amount
                  </span>
                </label>
                <div className="amount-wrapper">
                  <span className="amount-symbol">$</span>
                  <input 
                    className="form-input amount-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    id="amount"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Expense vs Income Switch */}
            <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'rgba(10, 15, 28, 0.4)', borderRadius: '12px', padding: '4px', border: '1px solid var(--surface-border)', marginBottom: '20px' }}>
              <button
                type="button"
                style={{
                  padding: '8px',
                  border: 'none',
                  borderRadius: '8px',
                  background: amountType === 'expense' ? 'var(--color-danger-bg)' : 'transparent',
                  color: amountType === 'expense' ? '#fca5a5' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s, color 0.2s'
                }}
                onClick={() => setAmountType('expense')}
              >
                Expense (-)
              </button>
              <button
                type="button"
                style={{
                  padding: '8px',
                  border: 'none',
                  borderRadius: '8px',
                  background: amountType === 'income' ? 'var(--color-success-bg)' : 'transparent',
                  color: amountType === 'income' ? '#a7f3d0' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s, color 0.2s'
                }}
                onClick={() => setAmountType('income')}
              >
                Income (+)
              </button>
            </div>

            {/* Searchable Payee Input (Autocomplete Combobox) */}
            <div className="form-group" ref={payeeDropdownRef}>
              <label className="form-label" htmlFor="payee">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <User size={13} /> Payee
                </span>
              </label>
              <div className="combobox-container">
                <div style={{ position: 'relative' }}>
                  <input 
                    className="form-input"
                    type="text"
                    id="payee"
                    value={payeeInput}
                    onChange={e => handlePayeeInputChange(e.target.value)}
                    onFocus={() => setShowPayeeDropdown(true)}
                    placeholder="Enter or select payee"
                    autoComplete="off"
                    required
                  />
                  <ChevronDown 
                    size={16} 
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', cursor: 'pointer', pointerEvents: 'none' }} 
                  />
                </div>

                {showPayeeDropdown && filteredPayees.length > 0 && (
                  <div className="combobox-options">
                    {filteredPayees.map(p => {
                      const isTransfer = p.transfer_acct !== null && p.transfer_acct !== undefined;
                      return (
                        <div 
                          key={p.id} 
                          className={`combobox-option ${selectedPayeeId === p.id ? 'selected' : ''}`}
                          onClick={() => handlePayeeSelect(p)}
                        >
                          <span>{p.name}</span>
                          {isTransfer && <span className="combobox-option-badge">Transfer</span>}
                        </div>
                      );
                    })}
                    {payeeInput.trim() !== '' && !payees.some(p => p.name.toLowerCase() === payeeInput.trim().toLowerCase()) && (
                      <div 
                        className="combobox-option"
                        style={{ color: '#a5b4fc', borderTop: '1px solid var(--surface-border)' }}
                        onClick={() => setShowPayeeDropdown(false)}
                      >
                        Create New Payee: "{payeeInput.trim()}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Category Dropdown */}
            <div className="form-group">
              <label className="form-label" htmlFor="category">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Tag size={13} /> Category
                </span>
              </label>
              <select 
                className="form-input"
                id="category"
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
              >
                <option value="">No Category / Outflow</option>
                {categoryGroups.map(group => (
                  <optgroup key={group.id} label={group.name}>
                    {group.categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Notes / Description */}
            <div className="form-group">
              <label className="form-label" htmlFor="notes">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FileText size={13} /> Notes
                </span>
              </label>
              <textarea 
                className="form-input"
                id="notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Description of transaction"
              />
            </div>

            {/* Submit Button */}
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="spinner" />
                  Syncing with Actual...
                </>
              ) : 'Submit Transaction'}
            </button>

            {/* Refresh Budget Cache */}
            <button 
              className="btn btn-secondary" 
              type="button" 
              onClick={fetchData}
              disabled={isSubmitting || loadingData}
            >
              <RefreshCw size={14} style={{ marginRight: '6px' }} />
              Sync Categories/Payees
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
