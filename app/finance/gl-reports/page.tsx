'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/app/components/layout/AppShell';
import { useToast } from '@/app/components/ui/Toast';
import { Button } from '@/app/components/ui/Button';
import { Badge } from '@/app/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/app/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableCell } from '@/app/components/ui/Table';
import { Input } from '@/app/components/ui/Input';
import {
  getTrialBalance,
  getBalanceSheet,
  getProfitLossStatement,
  getLedgerReport,
  getGLAccounts,
} from '@/app/actions/gl-actions';
import {
  BarChart3,
  Scale,
  TrendingUp,
  BookOpen,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

type TabKey = 'trial-balance' | 'balance-sheet' | 'pnl' | 'ledger';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { key: 'trial-balance', label: 'Trial Balance', icon: <Scale className="h-4 w-4" /> },
  { key: 'balance-sheet', label: 'Balance Sheet', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'pnl', label: 'P&L Statement', icon: <TrendingUp className="h-4 w-4" /> },
  { key: 'ledger', label: 'Ledger Report', icon: <BookOpen className="h-4 w-4" /> },
];

function fmtAmt(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN');
}

export default function GLReportsPage() {
  const toast = useToast();

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [activeTab, setActiveTab] = useState<TabKey>('trial-balance');
  const [loading, setLoading] = useState(false);

  // Date filters
  const [asOfDate, setAsOfDate] = useState(today);
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);

  // Report data
  const [trialBalanceData, setTrialBalanceData] = useState<any>(null);
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null);
  const [plData, setPlData] = useState<any>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);

  // Ledger account selector
  const [glAccounts, setGlAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const orgId = typeof window !== 'undefined'
    ? localStorage.getItem('organizationId') || ''
    : '';

  // Load GL accounts for ledger dropdown once
  useEffect(() => {
    if (!orgId) return;
    getGLAccounts(orgId, { is_active: true }).then((res) => {
      if (res.success && res.accounts) {
        setGlAccounts(res.accounts);
        if (res.accounts.length > 0 && !selectedAccountId) {
          setSelectedAccountId(res.accounts[0].id);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const loadReport = useCallback(async () => {
    if (!orgId) {
      toast.error('Organization ID not found. Please re-login.');
      return;
    }
    setLoading(true);
    try {
      if (activeTab === 'trial-balance') {
        const res = await getTrialBalance(orgId, {
          as_of_date: asOfDate ? new Date(asOfDate) : undefined,
        });
        if (res.success) {
          setTrialBalanceData(res);
        } else {
          toast.error((res as any).error || 'Failed to load trial balance');
        }
      } else if (activeTab === 'balance-sheet') {
        const res = await getBalanceSheet(orgId, {
          as_of_date: asOfDate ? new Date(asOfDate) : undefined,
        });
        if (res.success) {
          setBalanceSheetData(res);
        } else {
          toast.error((res as any).error || 'Failed to load balance sheet');
        }
      } else if (activeTab === 'pnl') {
        const res = await getProfitLossStatement(orgId, {
          start_date: startDate ? new Date(startDate) : undefined,
          end_date: endDate ? new Date(endDate) : undefined,
        });
        if (res.success) {
          setPlData(res);
        } else {
          toast.error((res as any).error || 'Failed to load P&L statement');
        }
      } else if (activeTab === 'ledger') {
        if (!selectedAccountId) {
          toast.error('Please select an account.');
          setLoading(false);
          return;
        }
        const res = await getLedgerReport(selectedAccountId, {
          start_date: startDate ? new Date(startDate) : undefined,
          end_date: endDate ? new Date(endDate) : undefined,
        });
        if (res.success) {
          setLedgerData(res);
        } else {
          toast.error((res as any).error || 'Failed to load ledger report');
        }
      }
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, orgId, asOfDate, startDate, endDate, selectedAccountId, toast]);

  // Auto-load when tab changes
  useEffect(() => {
    if (orgId) loadReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const isAsOfReport = activeTab === 'trial-balance' || activeTab === 'balance-sheet';

  return (
    <AppShell
      pageTitle="GL Financial Reports"
      pageIcon={<BarChart3 className="h-5 w-5" />}
      onRefresh={loadReport}
      refreshing={loading}
    >
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition ${
                activeTab === tab.key
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-gray-500 hover:bg-gray-100 border border-transparent'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              {isAsOfReport ? (
                <div className="w-48">
                  <Input
                    label="As of Date"
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="w-48">
                    <Input
                      label="Start Date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="w-48">
                    <Input
                      label="End Date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}
              {activeTab === 'ledger' && (
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Account
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/15 focus:border-teal-500 transition-all duration-200 shadow-sm"
                  >
                    {glAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.account_code} – {acc.account_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Button onClick={loadReport} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate Report
              </Button>
            </div>
          </div>
        </Card>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          </div>
        )}

        {/* Report panels */}
        {!loading && activeTab === 'trial-balance' && (
          <TrialBalanceReport data={trialBalanceData} />
        )}
        {!loading && activeTab === 'balance-sheet' && (
          <BalanceSheetReport data={balanceSheetData} />
        )}
        {!loading && activeTab === 'pnl' && (
          <ProfitLossReport data={plData} />
        )}
        {!loading && activeTab === 'ledger' && (
          <LedgerReportPanel data={ledgerData} />
        )}
      </div>
    </AppShell>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalanceReport({ data }: { data: any }) {
  if (!data) {
    return <EmptyPrompt message="Set filters and click Generate Report to view the Trial Balance." />;
  }

  const rows: any[] = data.trial_balance || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>Trial Balance</CardTitle>
          <div className="flex items-center gap-2">
            {data.is_balanced ? (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1 inline" />
                Balanced
              </Badge>
            ) : (
              <Badge variant="danger">
                <XCircle className="h-3 w-3 mr-1 inline" />
                Out of Balance
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell header>Account Code</TableCell>
              <TableCell header>Account Name</TableCell>
              <TableCell header>Type</TableCell>
              <TableCell header>Debit Balance</TableCell>
              <TableCell header>Credit Balance</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell>
                  <span className="text-gray-400 text-sm">No accounts found.</span>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any, i: number) => (
                <TableRow key={i}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{row.account_code}</span>
                  </TableCell>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell>
                    <Badge variant="info">{row.account_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={row.debit > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}>
                      {row.debit > 0 ? fmtAmt(row.debit) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={row.credit > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}>
                      {row.credit > 0 ? fmtAmt(row.credit) : '—'}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
            {/* Totals row */}
            <TableRow>
              <TableCell header>{null}</TableCell>
              <TableCell header>
                <span className="font-bold text-gray-900">TOTAL</span>
              </TableCell>
              <TableCell header>{null}</TableCell>
              <TableCell header>
                <span className="font-bold text-gray-900">{fmtAmt(data.total_debit || 0)}</span>
              </TableCell>
              <TableCell header>
                <span className="font-bold text-gray-900">{fmtAmt(data.total_credit || 0)}</span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetReport({ data }: { data: any }) {
  if (!data) {
    return <EmptyPrompt message="Set filters and click Generate Report to view the Balance Sheet." />;
  }

  const bs = data.balance_sheet;

  return (
    <div className="space-y-5">
      {/* Balance equation status */}
      <div className="flex items-center gap-2">
        {bs.equation_balanced ? (
          <Badge variant="success">
            <CheckCircle className="h-3 w-3 mr-1 inline" />
            Equation Balanced
          </Badge>
        ) : (
          <Badge variant="warning">
            <AlertCircle className="h-3 w-3 mr-1 inline" />
            Equation Not Balanced
          </Badge>
        )}
      </div>

      {/* Assets */}
      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Account Code</TableCell>
                <TableCell header>Account Name</TableCell>
                <TableCell header>Balance</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bs.assets || []).map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{acc.account_code}</span>
                  </TableCell>
                  <TableCell>{acc.account_name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{fmtAmt(acc.balance)}</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell header>{null}</TableCell>
                <TableCell header>
                  <span className="font-bold text-gray-900">Total Assets</span>
                </TableCell>
                <TableCell header>
                  <span className="font-bold text-emerald-700">{fmtAmt(bs.total_assets || 0)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Liabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Liabilities</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Account Code</TableCell>
                <TableCell header>Account Name</TableCell>
                <TableCell header>Balance</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bs.liabilities || []).map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{acc.account_code}</span>
                  </TableCell>
                  <TableCell>{acc.account_name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{fmtAmt(acc.balance)}</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell header>{null}</TableCell>
                <TableCell header>
                  <span className="font-bold text-gray-900">Total Liabilities</span>
                </TableCell>
                <TableCell header>
                  <span className="font-bold text-rose-700">{fmtAmt(bs.total_liabilities || 0)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Equity */}
      <Card>
        <CardHeader>
          <CardTitle>Equity</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Account Code</TableCell>
                <TableCell header>Account Name</TableCell>
                <TableCell header>Balance</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bs.equity || []).map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{acc.account_code}</span>
                  </TableCell>
                  <TableCell>{acc.account_name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{fmtAmt(acc.balance)}</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell header>{null}</TableCell>
                <TableCell header>
                  <span className="font-bold text-gray-900">Total Equity</span>
                </TableCell>
                <TableCell header>
                  <span className="font-bold text-blue-700">{fmtAmt(bs.total_equity || 0)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Summary */}
      <Card>
        <div className="p-5 flex flex-wrap gap-6">
          <SummaryItem label="Total Assets" value={fmtAmt(bs.total_assets || 0)} color="emerald" />
          <SummaryItem label="Total Liabilities" value={fmtAmt(bs.total_liabilities || 0)} color="rose" />
          <SummaryItem label="Total Equity" value={fmtAmt(bs.total_equity || 0)} color="blue" />
          <SummaryItem
            label="Liabilities + Equity"
            value={fmtAmt((bs.total_liabilities || 0) + (bs.total_equity || 0))}
            color="gray"
          />
        </div>
      </Card>
    </div>
  );
}

// ─── P&L Statement ────────────────────────────────────────────────────────────

function ProfitLossReport({ data }: { data: any }) {
  if (!data) {
    return <EmptyPrompt message="Set date range and click Generate Report to view the P&L Statement." />;
  }

  const pl = data.profit_loss;
  const isProfit = pl.net_income >= 0;

  return (
    <div className="space-y-5">
      {/* Revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Account Code</TableCell>
                <TableCell header>Account Name</TableCell>
                <TableCell header>Amount</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pl.revenue_accounts || []).map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{acc.account_code}</span>
                  </TableCell>
                  <TableCell>{acc.account_name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{fmtAmt(acc.amount)}</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell header>{null}</TableCell>
                <TableCell header>
                  <span className="font-bold text-gray-900">Total Revenue</span>
                </TableCell>
                <TableCell header>
                  <span className="font-bold text-emerald-700">{fmtAmt(pl.total_revenue || 0)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Account Code</TableCell>
                <TableCell header>Account Name</TableCell>
                <TableCell header>Amount</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pl.expense_accounts || []).map((acc: any) => (
                <TableRow key={acc.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-gray-600">{acc.account_code}</span>
                  </TableCell>
                  <TableCell>{acc.account_name}</TableCell>
                  <TableCell>
                    <span className="font-semibold text-gray-900">{fmtAmt(acc.amount)}</span>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell header>{null}</TableCell>
                <TableCell header>
                  <span className="font-bold text-gray-900">Total Expenses</span>
                </TableCell>
                <TableCell header>
                  <span className="font-bold text-rose-700">{fmtAmt(pl.total_expenses || 0)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Net Profit/Loss */}
      <Card>
        <div className="p-5 flex flex-wrap items-center gap-6">
          <SummaryItem label="Total Revenue" value={fmtAmt(pl.total_revenue || 0)} color="emerald" />
          <SummaryItem label="Total Expenses" value={fmtAmt(pl.total_expenses || 0)} color="rose" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Net {isProfit ? 'Profit' : 'Loss'}
            </span>
            <span className={`text-2xl font-bold ${isProfit ? 'text-emerald-700' : 'text-rose-700'}`}>
              {fmtAmt(Math.abs(pl.net_income || 0))}
            </span>
            <Badge variant={isProfit ? 'success' : 'danger'}>
              {isProfit ? 'Profit' : 'Loss'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Ledger Report ────────────────────────────────────────────────────────────

function LedgerReportPanel({ data }: { data: any }) {
  if (!data) {
    return <EmptyPrompt message="Select an account, set date range, and click Generate Report to view the Ledger." />;
  }

  const transactions: any[] = data.transactions || [];

  return (
    <div className="space-y-5">
      {/* Account info */}
      <Card>
        <div className="p-4 flex flex-wrap gap-6">
          <SummaryItem label="Account" value={`${data.account?.account_code} – ${data.account?.account_name}`} color="gray" />
          <SummaryItem label="Opening Balance" value={fmtAmt(data.opening_balance || 0)} color="blue" />
          <SummaryItem label="Closing Balance" value={fmtAmt(data.closing_balance || 0)} color="emerald" />
        </div>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions ({transactions.length})</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableCell header>Date</TableCell>
                <TableCell header>Journal Number</TableCell>
                <TableCell header>Narration</TableCell>
                <TableCell header>Debit</TableCell>
                <TableCell header>Credit</TableCell>
                <TableCell header>Running Balance</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell>
                    <span className="text-gray-400 text-sm">No transactions in this period.</span>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="text-sm text-gray-600">{fmtDate(tx.date)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-gray-700">{tx.journal_number}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-gray-800">{tx.description || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className={tx.debit > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}>
                        {tx.debit > 0 ? fmtAmt(tx.debit) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={tx.credit > 0 ? 'font-semibold text-gray-900' : 'text-gray-400'}>
                        {tx.credit > 0 ? fmtAmt(tx.credit) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${tx.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {fmtAmt(tx.balance)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function EmptyPrompt({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
      <BarChart3 className="h-10 w-10" />
      <p className="text-sm font-medium text-center max-w-sm">{message}</p>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'emerald' | 'rose' | 'blue' | 'gray';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    blue: 'text-blue-700',
    gray: 'text-gray-900',
  };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <span className={`text-lg font-bold ${colorMap[color]}`}>{value}</span>
    </div>
  );
}
