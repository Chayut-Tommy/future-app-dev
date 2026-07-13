import { brand } from './brand';

export type LearningCategory = 'beginner' | 'financial_learning' | 'property' | 'economy' | 'saving_strategy' | 'retirement' | 'tax' | 'debt';

export interface LearningCard {
  id: string;
  title: string;
  /** One short, curiosity-driving line shown on the card itself. */
  hook: string;
  /** Fuller explanation, shown only after tapping (PRD ask: cards create
   * curiosity, detail appears on tap — not a wall of text upfront). */
  body: string;
  readMinutes: number;
  category: LearningCategory;
}

// Static for Phase 1A — the full Lulu Discover experience (live trending
// ETFs/stocks, Market Pulse, personalised Investment Match) needs a
// licensed market-data provider that isn't wired up yet (PRD §19 Appendix).
export const LEARNING_CARDS: LearningCard[] = [
  {
    id: 'what-is-an-etf',
    title: 'What is an ETF?',
    hook: 'One purchase, instant diversification.',
    body: "An ETF bundles lots of investments into one, so you're not betting on just one company.",
    readMinutes: 2,
    category: 'beginner',
  },
  {
    id: 'how-to-start-investing',
    title: 'How do I start investing?',
    hook: "Smaller than you think — here's where to begin.",
    body: 'Most people start with a diversified fund like an ETF, investing a little consistently rather than trying to time the market.',
    readMinutes: 2,
    category: 'beginner',
  },
  {
    id: 'shares-vs-property',
    title: 'Shares vs property',
    hook: 'Two very different ways to build wealth.',
    body: 'Shares are easier to buy in small amounts and diversify; property usually needs more capital and comes with borrowing built in. Neither is automatically better.',
    readMinutes: 2,
    category: 'beginner',
  },
  {
    id: 'why-diversification-matters',
    title: 'Why diversification matters',
    hook: "Don't put all your eggs in one basket.",
    body: 'Spreading money across different assets reduces how much any single one performing badly can hurt you.',
    readMinutes: 2,
    category: 'beginner',
  },
  {
    id: 'compound-growth',
    title: 'How does compound growth work?',
    hook: 'Small savings can become big over time.',
    body: 'Compound growth means you earn returns on your returns, not just your original amount — the longer money stays invested, the bigger the snowball.',
    readMinutes: 2,
    category: 'beginner',
  },
  {
    id: 'dividend-investing',
    title: 'Understanding dividend investing',
    hook: 'Get paid just for holding shares.',
    body: "Some companies share profits with shareholders as regular cash payments called dividends — income on top of any share-price growth.",
    readMinutes: 2,
    category: 'financial_learning',
  },
  {
    id: 'understanding-index-funds',
    title: 'Understanding index funds',
    hook: 'One fund, hundreds of companies.',
    body: 'An index fund tracks a whole market index rather than picking individual stocks — low effort, broad exposure.',
    readMinutes: 2,
    category: 'financial_learning',
  },
  {
    id: 'dollar-cost-averaging',
    title: 'Dollar-cost averaging',
    hook: 'Investing the same amount, on repeat.',
    body: 'Investing a fixed amount on a regular schedule smooths out price ups and downs, rather than trying to time the perfect moment.',
    readMinutes: 2,
    category: 'financial_learning',
  },
  {
    id: 'markets-this-week',
    title: 'What moved markets this week?',
    hook: `Coming soon — ${brand.name} will summarise the week for you.`,
    body: `Once live market data is connected, ${brand.name} will explain the week's biggest moves in plain English, not just numbers.`,
    readMinutes: 2,
    category: 'economy',
  },
  {
    id: 'property-vs-shares',
    title: 'Property vs. shares',
    hook: 'Two different paths to wealth.',
    body: "Property is typically less liquid with borrowing built in; shares are easier to buy and sell in small amounts. Neither is automatically the \"better\" one.",
    readMinutes: 2,
    category: 'property',
  },
  {
    id: 'home-deposit-basics',
    title: 'What is a home deposit?',
    hook: 'The upfront chunk that unlocks a home loan.',
    body: "A deposit is the portion of a property's price you pay upfront in cash — the rest is borrowed. A bigger deposit usually means better loan terms and less interest paid overall.",
    readMinutes: 2,
    category: 'property',
  },
  {
    id: 'loan-to-value-ratio',
    title: 'Understanding loan-to-value ratio',
    hook: 'One ratio lenders care about a lot.',
    body: "LVR compares how much you're borrowing to the property's value — a lower LVR (bigger deposit) usually means better rates and can avoid extra insurance costs.",
    readMinutes: 2,
    category: 'property',
  },
  {
    id: '50-30-20-method',
    title: '50/30/20 Rule',
    hook: 'Spend smarter by balancing needs, fun and future you.',
    body: 'Roughly 50% of income to needs, 30% to wants, and 20% to savings and debt repayment — a simple split, no spreadsheet required.',
    readMinutes: 2,
    category: 'saving_strategy',
  },
  {
    id: 'pay-yourself-first',
    title: 'Pay yourself first',
    hook: 'Save before you spend, not after.',
    body: "Set your savings aside the moment you get paid, then spend what's left — instead of hoping something's left over at the end of the month.",
    readMinutes: 1,
    category: 'saving_strategy',
  },
  {
    id: 'how-super-works',
    title: 'How retirement accounts work',
    hook: 'Your money, invested for decades, mostly on autopilot.',
    body: 'Contributions to a retirement/super account get invested and grow over the long term, usually with tax advantages designed to reward long-term saving.',
    readMinutes: 2,
    category: 'retirement',
  },
  {
    id: 'why-contribute-early',
    title: 'Why contributing early matters',
    hook: 'Time beats timing — start earlier, not bigger.',
    body: 'Contributions made in your 20s and 30s have decades longer to compound than the same amount contributed later.',
    readMinutes: 2,
    category: 'retirement',
  },
  {
    id: 'deductible-records',
    title: 'Keep records year-round',
    hook: 'Save receipts as you go, not at tax time.',
    body: 'Keeping records for work-related or deductible expenses as they happen is far easier than reconstructing them months later.',
    readMinutes: 2,
    category: 'tax',
  },
  {
    id: 'avalanche-vs-snowball',
    title: 'Avalanche vs. snowball',
    hook: 'Two proven ways to pay off multiple debts.',
    body: 'Avalanche pays the highest-interest debt first (saves the most money); snowball pays the smallest balance first (builds momentum from quick wins). Both work — pick the one you\'ll actually stick with.',
    readMinutes: 2,
    category: 'debt',
  },
  {
    id: 'minimum-payments-cost-more',
    title: 'Why minimum payments cost more',
    hook: 'The slowest, most expensive way to pay off debt.',
    body: 'Paying only the minimum stretches out interest charges for years. Even a small amount extra each month can cut the total interest paid significantly.',
    readMinutes: 2,
    category: 'debt',
  },
  {
    id: 'good-debt-vs-bad-debt',
    title: 'Is all debt bad?',
    hook: 'Not all debt is created equal.',
    body: 'Debt used to buy an appreciating asset or increase earning power (like a mortgage or education) behaves differently to high-interest debt used for things that lose value fast.',
    readMinutes: 2,
    category: 'debt',
  },
  {
    id: 'debt-to-income',
    title: 'What is debt-to-income ratio?',
    hook: 'One number lenders (and you) should watch.',
    body: 'It compares your monthly debt repayments to your monthly income — a lower ratio generally means more breathing room and better borrowing terms.',
    readMinutes: 2,
    category: 'debt',
  },
];

export function learningCardsByCategory(category: LearningCategory): LearningCard[] {
  return LEARNING_CARDS.filter((c) => c.category === category);
}

// Deterministic "lesson of the day" — same card all day for everyone,
// rotates daily, no backend needed.
export function getDailyLearningCard(date: Date = new Date()): LearningCard {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return LEARNING_CARDS[dayOfYear % LEARNING_CARDS.length];
}
