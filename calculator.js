// Shared estimation logic for Vow & Co.
// Deterministic, rule-based estimates (not a real financial model) -
// used consistently across the homepage calculator, the wizard results
// screen, and the personalized dashboard.

const VOWCO = (function () {
  const BUDGET_WEIGHTS = [
    { key: 'venue', label: 'Venue & reception', pct: 0.35 },
    { key: 'catering', label: 'Catering', pct: 0.20 },
    { key: 'photography', label: 'Photography & film', pct: 0.10 },
    { key: 'flowers', label: 'Flowers', pct: 0.075 },
    { key: 'entertainment', label: 'Entertainment', pct: 0.075 },
    { key: 'attire', label: 'Attire', pct: 0.0625 },
    { key: 'other', label: 'Other', pct: 0.1375 }
  ];

  function formatCurrency(n) {
    n = Math.round(n);
    return '$' + n.toLocaleString('en-AU');
  }

  function budgetBreakdown(budget) {
    budget = Number(budget) || 0;
    return BUDGET_WEIGHTS.map(function (w) {
      return { key: w.key, label: w.label, amount: budget * w.pct };
    });
  }

  function monthsUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    if (isNaN(target.getTime())) return null;
    let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    if (target.getDate() < now.getDate()) months -= 1;
    return months;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((target - now) / 86400000);
    return diff;
  }

  function estimateTasks(guests) {
    guests = Number(guests) || 0;
    return Math.round(40 + guests / 15);
  }

  function estimateVendors(guests, budget) {
    guests = Number(guests) || 0;
    budget = Number(budget) || 0;
    return Math.round(80 + guests / 3 + budget / 7500);
  }

  function estimateVenueShortlist(budget) {
    budget = Number(budget) || 0;
    if (budget < 15000) return 4;
    if (budget < 30000) return 6;
    if (budget < 60000) return 8;
    return 10;
  }

  function formatDateLong(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  }

  return {
    BUDGET_WEIGHTS: BUDGET_WEIGHTS,
    formatCurrency: formatCurrency,
    budgetBreakdown: budgetBreakdown,
    monthsUntil: monthsUntil,
    daysUntil: daysUntil,
    estimateTasks: estimateTasks,
    estimateVendors: estimateVendors,
    estimateVenueShortlist: estimateVenueShortlist,
    formatDateLong: formatDateLong
  };
})();
