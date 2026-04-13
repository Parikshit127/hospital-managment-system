'use server';

import { prisma } from '@/backend/db';

// ============================================
// BUDGET MANAGEMENT
// ============================================

export async function createBudget(data: {
  organizationId: string;
  budget_name: string;
  budget_year: number;
  budget_period: string;
  start_date: Date;
  end_date: Date;
  notes?: string;
  budget_lines: Array<{
    department?: string;
    cost_center?: string;
    account_id?: string;
    expense_category_id?: number;
    line_description: string;
    budget_amount: number;
    alert_threshold?: number;
  }>;
}) {
  try {
    const totalBudget = data.budget_lines.reduce(
      (sum: number, line: any) => sum + line.budget_amount, 0
    );

    const budget = await prisma.budgetMaster.create({
      data: {
        organizationId: data.organizationId,
        budget_name: data.budget_name,
        budget_year: data.budget_year,
        budget_period: data.budget_period,
        start_date: data.start_date,
        end_date: data.end_date,
        total_budget: totalBudget,
        notes: data.notes,
        budget_lines: {
          create: data.budget_lines.map((line: any) => ({
            organizationId: data.organizationId,
            department: line.department,
            cost_center: line.cost_center,
            account_id: line.account_id,
            expense_category_id: line.expense_category_id,
            line_description: line.line_description,
            budget_amount: line.budget_amount,
            alert_threshold: line.alert_threshold || 90,
          })),
        },
      },
      include: {
        budget_lines: true,
      },
    });

    return { success: true, budget };
  } catch (error: any) {
    console.error('Create budget error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateBudget(
  id: string,
  data: {
    budget_name?: string;
    notes?: string;
    start_date?: Date;
    end_date?: Date;
  }
) {
  try {
    const budget = await prisma.budgetMaster.update({
      where: { id },
      data,
    });

    return { success: true, budget };
  } catch (error: any) {
    console.error('Update budget error:', error);
    return { success: false, error: error.message };
  }
}

export async function approveBudget(id: string, approvedBy: string) {
  try {
    const budget = await prisma.budgetMaster.update({
      where: { id },
      data: {
        status: 'Approved',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });

    return { success: true, budget };
  } catch (error: any) {
    console.error('Approve budget error:', error);
    return { success: false, error: error.message };
  }
}

export async function activateBudget(id: string) {
  try {
    const budget = await prisma.budgetMaster.update({
      where: { id },
      data: { status: 'Active' },
    });

    return { success: true, budget };
  } catch (error: any) {
    console.error('Activate budget error:', error);
    return { success: false, error: error.message };
  }
}

export async function closeBudget(id: string) {
  try {
    const budget = await prisma.budgetMaster.update({
      where: { id },
      data: { status: 'Closed' },
    });

    return { success: true, budget };
  } catch (error: any) {
    console.error('Close budget error:', error);
    return { success: false, error: error.message };
  }
}

export async function getBudgets(
  organizationId: string,
  filters?: { status?: string; budget_year?: number }
) {
  try {
    const budgets = await prisma.budgetMaster.findMany({
      where: {
        organizationId,
        ...(filters?.status && { status: filters.status }),
        ...(filters?.budget_year && { budget_year: filters.budget_year }),
      },
      include: {
        _count: {
          select: { budget_lines: true, revisions: true },
        },
      },
      orderBy: [{ budget_year: 'desc' }, { budget_name: 'asc' }],
    });

    return { success: true, budgets };
  } catch (error: any) {
    console.error('Get budgets error:', error);
    return { success: false, error: error.message };
  }
}

export async function getBudgetDetails(id: string) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id },
      include: {
        budget_lines: {
          include: {
            gl_account: true,
            expense_category: true,
            alerts: {
              where: { is_acknowledged: false },
              orderBy: { alert_date: 'desc' },
              take: 5,
            },
          },
          orderBy: { department: 'asc' },
        },
        revisions: {
          orderBy: { revision_number: 'desc' },
        },
      },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    return { success: true, budget };
  } catch (error: any) {
    console.error('Get budget details error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// BUDGET LINE MANAGEMENT
// ============================================

export async function updateBudgetLine(
  id: string,
  data: {
    line_description?: string;
    budget_amount?: number;
    alert_threshold?: number;
  }
) {
  try {
    const line = await prisma.budgetLine.update({
      where: { id },
      data,
    });

    // Recalculate master totals
    await recalculateBudgetTotals(line.budget_master_id);

    return { success: true, line };
  } catch (error: any) {
    console.error('Update budget line error:', error);
    return { success: false, error: error.message };
  }
}

export async function lockBudgetLine(id: string) {
  try {
    const line = await prisma.budgetLine.update({
      where: { id },
      data: { is_locked: true },
    });

    return { success: true, line };
  } catch (error: any) {
    console.error('Lock budget line error:', error);
    return { success: false, error: error.message };
  }
}

export async function addBudgetLine(data: {
  organizationId: string;
  budget_master_id: string;
  department?: string;
  cost_center?: string;
  account_id?: string;
  expense_category_id?: number;
  line_description: string;
  budget_amount: number;
  alert_threshold?: number;
}) {
  try {
    const line = await prisma.budgetLine.create({
      data: {
        organizationId: data.organizationId,
        budget_master_id: data.budget_master_id,
        department: data.department,
        cost_center: data.cost_center,
        account_id: data.account_id,
        expense_category_id: data.expense_category_id,
        line_description: data.line_description,
        budget_amount: data.budget_amount,
        alert_threshold: data.alert_threshold || 90,
      },
    });

    await recalculateBudgetTotals(data.budget_master_id);

    return { success: true, line };
  } catch (error: any) {
    console.error('Add budget line error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// BUDGET REVISION
// ============================================

export async function createBudgetRevision(data: {
  organizationId: string;
  budget_master_id: string;
  reason: string;
  revised_by?: string;
  line_changes: Array<{
    line_id: string;
    new_budget_amount: number;
  }>;
}) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id: data.budget_master_id },
      include: { revisions: { orderBy: { revision_number: 'desc' }, take: 1 } },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    const previousTotal = parseFloat(budget.total_budget.toString());
    const revisionNumber = budget.revisions.length > 0
      ? budget.revisions[0].revision_number + 1
      : 1;

    // Apply line changes
    for (const change of data.line_changes) {
      await prisma.budgetLine.update({
        where: { id: change.line_id },
        data: { budget_amount: change.new_budget_amount },
      });
    }

    // Recalculate totals
    await recalculateBudgetTotals(data.budget_master_id);

    // Get new total
    const updatedBudget = await prisma.budgetMaster.findUnique({
      where: { id: data.budget_master_id },
    });
    const revisedTotal = parseFloat(updatedBudget!.total_budget.toString());

    // Create revision record
    const revision = await prisma.budgetRevision.create({
      data: {
        organizationId: data.organizationId,
        budget_master_id: data.budget_master_id,
        revision_number: revisionNumber,
        revision_date: new Date(),
        revised_by: data.revised_by,
        reason: data.reason,
        previous_total: previousTotal,
        revised_total: revisedTotal,
        variance: revisedTotal - previousTotal,
      },
    });

    // Update budget status
    await prisma.budgetMaster.update({
      where: { id: data.budget_master_id },
      data: { status: 'Revised' },
    });

    return { success: true, revision };
  } catch (error: any) {
    console.error('Create budget revision error:', error);
    return { success: false, error: error.message };
  }
}

export async function approveBudgetRevision(revisionId: string, approvedBy: string) {
  try {
    const revision = await prisma.budgetRevision.update({
      where: { id: revisionId },
      data: {
        status: 'Approved',
        approved_by: approvedBy,
        approved_at: new Date(),
      },
    });

    // Reactivate budget
    await prisma.budgetMaster.update({
      where: { id: revision.budget_master_id },
      data: { status: 'Active' },
    });

    return { success: true, revision };
  } catch (error: any) {
    console.error('Approve budget revision error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// ACTUAL TRACKING FROM EXPENSES
// ============================================

/**
 * Sync an approved expense to the matching budget line.
 * Matches by department + expense_category_id within the active budget period.
 */
export async function syncExpenseToBudget(expenseId: number, organizationId: string) {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { category: true },
    });

    if (!expense || expense.status !== 'Approved') {
      return { success: false, error: 'Expense not found or not approved' };
    }

    const now = new Date();

    // Find active budget for this period
    const activeBudget = await prisma.budgetMaster.findFirst({
      where: {
        organizationId,
        status: { in: ['Active', 'Approved'] },
        start_date: { lte: now },
        end_date: { gte: now },
      },
    });

    if (!activeBudget) {
      return { success: false, error: 'No active budget found for current period' };
    }

    // Find matching budget line by expense category
    const budgetLine = await prisma.budgetLine.findFirst({
      where: {
        budget_master_id: activeBudget.id,
        expense_category_id: expense.category_id,
      },
    });

    if (!budgetLine) {
      return { success: false, error: 'No matching budget line found' };
    }

    const expenseAmount = parseFloat(expense.total_amount.toString());
    const newActual = parseFloat(budgetLine.actual_amount.toString()) + expenseAmount;
    const budgetAmount = parseFloat(budgetLine.budget_amount.toString());
    const variance = budgetAmount - newActual;
    const variancePercentage = budgetAmount > 0
      ? ((newActual / budgetAmount) * 100)
      : 0;

    // Update budget line actuals
    await prisma.budgetLine.update({
      where: { id: budgetLine.id },
      data: {
        actual_amount: newActual,
        variance: variance,
        variance_percentage: Math.round(variancePercentage * 100) / 100,
      },
    });

    // Recalculate master totals
    await recalculateBudgetTotals(activeBudget.id);

    // Check threshold and create alert if needed
    const threshold = parseFloat(budgetLine.alert_threshold.toString());
    if (variancePercentage >= threshold) {
      await createBudgetAlert(
        organizationId,
        budgetLine.id,
        variancePercentage >= 100 ? 'Overrun' : 'Threshold',
        budgetAmount,
        newActual,
        variancePercentage
      );
    }

    return { success: true, budget_line_id: budgetLine.id };
  } catch (error: any) {
    console.error('Sync expense to budget error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update actuals for all lines in a budget from the expenses table.
 */
export async function updateActuals(budgetId: string) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id: budgetId },
      include: { budget_lines: true },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    for (const line of budget.budget_lines) {
      // Sum approved expenses matching this budget line's category within budget period
      const expenses = await prisma.expense.findMany({
        where: {
          organizationId: budget.organizationId,
          status: 'Approved',
          ...(line.expense_category_id && { category_id: line.expense_category_id }),
          created_at: {
            gte: budget.start_date,
            lte: budget.end_date,
          },
        },
      });

      const actualAmount = expenses.reduce(
        (sum: number, e: any) => sum + parseFloat(e.total_amount.toString()), 0
      );

      const budgetAmount = parseFloat(line.budget_amount.toString());
      const variance = budgetAmount - actualAmount;
      const variancePercentage = budgetAmount > 0
        ? ((actualAmount / budgetAmount) * 100)
        : 0;

      await prisma.budgetLine.update({
        where: { id: line.id },
        data: {
          actual_amount: actualAmount,
          variance: variance,
          variance_percentage: Math.round(variancePercentage * 100) / 100,
        },
      });
    }

    await recalculateBudgetTotals(budgetId);

    return { success: true };
  } catch (error: any) {
    console.error('Update actuals error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// BUDGET ALERTS
// ============================================

async function createBudgetAlert(
  organizationId: string,
  budgetLineId: string,
  alertType: string,
  budgetAmount: number,
  actualAmount: number,
  percentageConsumed: number
) {
  const message = alertType === 'Overrun'
    ? `Budget overrun: ${percentageConsumed.toFixed(1)}% consumed (${actualAmount.toFixed(2)} of ${budgetAmount.toFixed(2)})`
    : alertType === 'Threshold'
    ? `Budget threshold breached: ${percentageConsumed.toFixed(1)}% consumed (${actualAmount.toFixed(2)} of ${budgetAmount.toFixed(2)})`
    : `Budget underutilization: only ${percentageConsumed.toFixed(1)}% consumed`;

  // Check if similar unacknowledged alert already exists
  const existing = await prisma.budgetAlert.findFirst({
    where: {
      budget_line_id: budgetLineId,
      alert_type: alertType,
      is_acknowledged: false,
    },
  });

  if (existing) {
    // Update existing alert with latest figures
    await prisma.budgetAlert.update({
      where: { id: existing.id },
      data: {
        actual_amount: actualAmount,
        percentage_consumed: percentageConsumed,
        message,
        alert_date: new Date(),
      },
    });
    return;
  }

  await prisma.budgetAlert.create({
    data: {
      organizationId,
      budget_line_id: budgetLineId,
      alert_type: alertType,
      alert_date: new Date(),
      budget_amount: budgetAmount,
      actual_amount: actualAmount,
      percentage_consumed: percentageConsumed,
      message,
    },
  });
}

export async function checkBudgetThresholds(budgetId: string) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id: budgetId },
      include: { budget_lines: true },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    let alertsCreated = 0;

    for (const line of budget.budget_lines) {
      const budgetAmount = parseFloat(line.budget_amount.toString());
      const actualAmount = parseFloat(line.actual_amount.toString());

      if (budgetAmount <= 0) continue;

      const percentageConsumed = (actualAmount / budgetAmount) * 100;
      const threshold = parseFloat(line.alert_threshold.toString());

      if (percentageConsumed >= 100) {
        await createBudgetAlert(
          budget.organizationId,
          line.id,
          'Overrun',
          budgetAmount,
          actualAmount,
          percentageConsumed
        );
        alertsCreated++;
      } else if (percentageConsumed >= threshold) {
        await createBudgetAlert(
          budget.organizationId,
          line.id,
          'Threshold',
          budgetAmount,
          actualAmount,
          percentageConsumed
        );
        alertsCreated++;
      }
    }

    return { success: true, alerts_created: alertsCreated };
  } catch (error: any) {
    console.error('Check budget thresholds error:', error);
    return { success: false, error: error.message };
  }
}

export async function getBudgetAlerts(
  organizationId: string,
  filters?: { is_acknowledged?: boolean; budget_line_id?: string }
) {
  try {
    const alerts = await prisma.budgetAlert.findMany({
      where: {
        organizationId,
        ...(filters?.is_acknowledged !== undefined && {
          is_acknowledged: filters.is_acknowledged,
        }),
        ...(filters?.budget_line_id && {
          budget_line_id: filters.budget_line_id,
        }),
      },
      include: {
        budget_line: {
          include: {
            budget_master: { select: { budget_name: true, budget_year: true } },
          },
        },
      },
      orderBy: { alert_date: 'desc' },
    });

    return { success: true, alerts };
  } catch (error: any) {
    console.error('Get budget alerts error:', error);
    return { success: false, error: error.message };
  }
}

export async function acknowledgeBudgetAlert(alertId: string, acknowledgedBy: string) {
  try {
    const alert = await prisma.budgetAlert.update({
      where: { id: alertId },
      data: {
        is_acknowledged: true,
        acknowledged_by: acknowledgedBy,
        acknowledged_at: new Date(),
      },
    });

    return { success: true, alert };
  } catch (error: any) {
    console.error('Acknowledge budget alert error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// REPORTS
// ============================================

export async function getBudgetVarianceReport(budgetId: string) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id: budgetId },
      include: {
        budget_lines: {
          include: {
            gl_account: true,
            expense_category: true,
          },
          orderBy: { department: 'asc' },
        },
      },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    const lines = budget.budget_lines.map((line: any) => ({
      id: line.id,
      department: line.department,
      description: line.line_description,
      account: line.gl_account?.account_name,
      category: line.expense_category?.name,
      budget_amount: parseFloat(line.budget_amount.toString()),
      actual_amount: parseFloat(line.actual_amount.toString()),
      variance: parseFloat(line.variance.toString()),
      variance_percentage: parseFloat(line.variance_percentage.toString()),
      status: parseFloat(line.variance_percentage.toString()) >= 100
        ? 'Overrun'
        : parseFloat(line.variance_percentage.toString()) >= parseFloat(line.alert_threshold.toString())
        ? 'Warning'
        : 'On Track',
    }));

    const summary = {
      budget_name: budget.budget_name,
      budget_year: budget.budget_year,
      total_budget: parseFloat(budget.total_budget.toString()),
      total_actual: parseFloat(budget.total_actual.toString()),
      total_variance: parseFloat(budget.total_variance.toString()),
      variance_percentage: parseFloat(budget.variance_percentage.toString()),
      lines_on_track: lines.filter((l: any) => l.status === 'On Track').length,
      lines_warning: lines.filter((l: any) => l.status === 'Warning').length,
      lines_overrun: lines.filter((l: any) => l.status === 'Overrun').length,
    };

    return { success: true, lines, summary };
  } catch (error: any) {
    console.error('Get budget variance report error:', error);
    return { success: false, error: error.message };
  }
}

export async function getDepartmentVarianceReport(budgetId: string, department: string) {
  try {
    const lines = await prisma.budgetLine.findMany({
      where: {
        budget_master_id: budgetId,
        department,
      },
      include: {
        gl_account: true,
        expense_category: true,
        alerts: {
          where: { is_acknowledged: false },
        },
      },
    });

    const summary = {
      department,
      total_budget: lines.reduce((s: number, l: any) => s + parseFloat(l.budget_amount.toString()), 0),
      total_actual: lines.reduce((s: number, l: any) => s + parseFloat(l.actual_amount.toString()), 0),
      total_variance: lines.reduce((s: number, l: any) => s + parseFloat(l.variance.toString()), 0),
      active_alerts: lines.reduce((s: number, l: any) => s + l.alerts.length, 0),
    };

    return { success: true, lines, summary };
  } catch (error: any) {
    console.error('Get department variance report error:', error);
    return { success: false, error: error.message };
  }
}

export async function getBudgetSummary(organizationId: string, budgetYear: number) {
  try {
    const budgets = await prisma.budgetMaster.findMany({
      where: {
        organizationId,
        budget_year: budgetYear,
      },
      include: {
        budget_lines: true,
        _count: { select: { revisions: true } },
      },
    });

    const summary = budgets.map((b: any) => ({
      id: b.id,
      budget_name: b.budget_name,
      status: b.status,
      total_budget: parseFloat(b.total_budget.toString()),
      total_actual: parseFloat(b.total_actual.toString()),
      utilization: b.total_budget > 0
        ? Math.round((parseFloat(b.total_actual.toString()) / parseFloat(b.total_budget.toString())) * 10000) / 100
        : 0,
      lines_count: b.budget_lines.length,
      revisions_count: b._count.revisions,
    }));

    return { success: true, summary };
  } catch (error: any) {
    console.error('Get budget summary error:', error);
    return { success: false, error: error.message };
  }
}

export async function getBudgetUtilizationReport(budgetId: string) {
  try {
    const budget = await prisma.budgetMaster.findUnique({
      where: { id: budgetId },
      include: {
        budget_lines: {
          include: { expense_category: true },
        },
      },
    });

    if (!budget) {
      return { success: false, error: 'Budget not found' };
    }

    // Group by department
    const byDepartment = budget.budget_lines.reduce((acc: any, line: any) => {
      const dept = line.department || 'Unassigned';
      if (!acc[dept]) {
        acc[dept] = { budget: 0, actual: 0, lines: 0 };
      }
      acc[dept].budget += parseFloat(line.budget_amount.toString());
      acc[dept].actual += parseFloat(line.actual_amount.toString());
      acc[dept].lines++;
      return acc;
    }, {});

    // Calculate utilization per department
    for (const dept in byDepartment) {
      byDepartment[dept].utilization = byDepartment[dept].budget > 0
        ? Math.round((byDepartment[dept].actual / byDepartment[dept].budget) * 10000) / 100
        : 0;
      byDepartment[dept].variance = byDepartment[dept].budget - byDepartment[dept].actual;
    }

    return { success: true, by_department: byDepartment };
  } catch (error: any) {
    console.error('Get budget utilization report error:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function recalculateBudgetTotals(budgetMasterId: string) {
  const lines = await prisma.budgetLine.findMany({
    where: { budget_master_id: budgetMasterId },
  });

  const totalBudget = lines.reduce(
    (sum: number, l: any) => sum + parseFloat(l.budget_amount.toString()), 0
  );
  const totalActual = lines.reduce(
    (sum: number, l: any) => sum + parseFloat(l.actual_amount.toString()), 0
  );
  const totalVariance = totalBudget - totalActual;
  const variancePercentage = totalBudget > 0
    ? Math.round((totalActual / totalBudget) * 10000) / 100
    : 0;

  await prisma.budgetMaster.update({
    where: { id: budgetMasterId },
    data: {
      total_budget: totalBudget,
      total_actual: totalActual,
      total_variance: totalVariance,
      variance_percentage: variancePercentage,
    },
  });
}
