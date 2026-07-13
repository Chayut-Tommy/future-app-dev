import { Category } from '../types/models';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-salary', name: 'Salary', type: 'income', icon: 'cash' },
  { id: 'cat-side-hustle', name: 'Side income', type: 'income', icon: 'briefcase' },
  { id: 'cat-investment-income', name: 'Investment income', type: 'income', icon: 'trending-up' },
  { id: 'cat-rental-income', name: 'Rental income', type: 'income', icon: 'home' },
  { id: 'cat-gift', name: 'Gift', type: 'income', icon: 'gift' },
  { id: 'cat-bonus', name: 'Bonus', type: 'income', icon: 'gift' },
  { id: 'cat-other-income', name: 'Other income', type: 'income', icon: 'plus-circle' },

  // Split rather than combined (PRD ask): rent is a pure expense, while a
  // mortgage repayment also reduces a liability over time — they behave
  // differently for future Lulu intelligence, even though both are "housing".
  { id: 'cat-rent', name: 'Rent', type: 'expense', icon: 'home' },
  { id: 'cat-mortgage', name: 'Mortgage', type: 'expense', icon: 'home' },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', icon: 'shopping-cart' },
  { id: 'cat-dining', name: 'Dining out', type: 'expense', icon: 'coffee' },
  { id: 'cat-transport', name: 'Transport', type: 'expense', icon: 'car' },
  { id: 'cat-shopping', name: 'Shopping', type: 'expense', icon: 'bag' },
  { id: 'cat-travel', name: 'Travel', type: 'expense', icon: 'plane' },
  { id: 'cat-subscriptions', name: 'Subscriptions', type: 'expense', icon: 'repeat' },
  { id: 'cat-health', name: 'Health / gym', type: 'expense', icon: 'heart' },
  { id: 'cat-entertainment', name: 'Entertainment', type: 'expense', icon: 'film' },
  { id: 'cat-utilities', name: 'Utilities', type: 'expense', icon: 'zap' },
  { id: 'cat-insurance', name: 'Insurance', type: 'expense', icon: 'shield' },
  { id: 'cat-debt', name: 'Debt repayments', type: 'expense', icon: 'credit-card' },
  { id: 'cat-other-expense', name: 'Other', type: 'expense', icon: 'more-horizontal' },
];
