# PricePilot - Product Pricing & Profit Optimizer

> A comprehensive product pricing and profit optimization tool built with Next.js 16. Calculate optimal prices, analyze margins, and make data-driven pricing decisions — all stored locally in your browser.

![PricePilot Dashboard](https://img.shields.io/badge/Next.js-16-black?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?style=flat-square) ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Features

### 📊 Dashboard
- At-a-glance summary of all products, margins, and profitability
- Profitability distribution pie chart (Healthy / High Margin / Low Margin / Loss-making)
- Existing vs Recommended margin comparison bar chart by category
- Price recommendation distribution chart (Increase / Decrease / Review)
- Top improvement opportunities table
- Highest-risk products table

### 📦 Product Management
- Full product table with search, category/brand/channel filters, and status tabs
- Sortable columns: Product, SKU, Category, Cost, Existing Price, Recommended, Profit, Margin, Markup, Status
- Product detail drawer with complete cost breakdown, fee analysis, and pricing recommendations
- Add/Edit/Delete products with inline validation
- Bulk actions (select multiple, delete, export)

### 📥 Import Products
- 5-step import wizard: Upload → Preview → Column Mapping → Data Cleaning → Confirmation
- Support for Excel (.xlsx) and CSV files
- Automatic column detection and smart mapping
- Data cleaning with validation and error highlighting
- Bulk import with progress tracking

### 📏 Pricing Rules
- Multi-level pricing rules: Global, Category, Brand, Channel, Product-specific
- Priority resolution system (Product > Channel > Brand > Category > Global)
- Configurable marketplace commission, payment gateway fees, tax rates, return rates
- Fixed transaction fee support
- Rounding rules: No rounding, Nearest whole, Nearest 5, Nearest 10, End-in-99, End-in-95

### 🧮 Price Simulator
- Real-time "what-if" pricing calculator for hypothetical products
- Input: Purchase cost, shipping, packaging, other costs, commissions, tax, return rate, target margin
- Live results: Total landed cost, break-even price, net profit, margin, markup, total fees
- Recommended prices: Minimum Safe, Balanced, Premium, Break-even
- Profitability meter (Loss → Low → Acceptable → Good → Excellent)
- Save as Scenario or Create Product directly

### 💾 Saved Scenarios
- Save and compare multiple pricing scenarios
- Side-by-side comparison of different product configurations
- Load scenarios back into the simulator for adjustments

### 📤 Export
- Export product data to Excel (.xlsx) or CSV
- Choose which columns to include
- Filter by category, brand, status before export
- Share pricing data with stakeholders

### ⚙️ Settings
- Business information: Name, default currency, country, tax treatment
- Pricing defaults: Default margin targets, costs, and fees
- Fee configuration: Marketplace commission, payment gateway, GST/VAT, return rate
- Data management: Reset all data, clear products, export/import full application data
- All data stored locally in your browser — nothing is sent to any server

### 🆕 New Features (v0.2)
- **Toast Notifications**: Real-time feedback on all key actions (add, approve, delete, import, save)
- **Keyboard Shortcuts**: Press `?` or `Ctrl+/` to view 14 keyboard shortcuts (Ctrl+N, Ctrl+I, Ctrl+E, Ctrl+S, Ctrl+R, 1-8 for view navigation)
- **Quick Price Override**: Click any product's existing price in the table to edit it inline
- **Recently Viewed Products**: Dashboard tracks your last 5 viewed products for quick access
- **Enhanced Dashboard Insights**: Top 5 Most/Least Profitable products and Price Changes Summary
- **CSV Template Download**: Download a pre-formatted import template from the Import page

### 🆕 New Features (v0.3)
- **Product Comparison Drawer**: Select 2 products and compare them side-by-side with highlighted differences
- **Dashboard Quick Actions Toolbar**: Add Product, Import Data, Recalculate All, Approve All Recommendations
- **Product Tags/Notes System**: Add custom tags to products for filtering, plus notes for organization
- **Dashboard Chart Click-through**: Click pie chart segments to navigate to filtered products page
- **Custom Scrollbar**: Polished scrollbar styling for Chrome/Safari/Firefox with dark mode
- **Mobile Dark Sidebar**: Mobile navigation now matches dark emerald desktop theme
- **Page Transitions**: Smooth fade-in animations when switching between views
- **Footer Stats Bar**: Shows product count, average margin, and needs-review count
- **Print-friendly Styles**: Clean professional print output (hides navigation elements)
- **Enhanced Dashboard Empty State**: Animated icons, gradient backgrounds, decorative patterns

### 🆕 New Features (v0.4)
- **Dark Mode Toggle**: Light/dark/system theme modes, fully functional with persistent settings
- **Animated Recalculation Overlay**: Shows spinner and progress when recalculating all products
- **Cost Breakdown Area Chart**: Stacked area chart showing cost composition by category
- **Export Progress Indicator**: Animated progress bar during file download with completion message
- **Product Health Score**: 0-100 score summarizing margin health, cost coverage, and price alignment
- **Loading Skeletons**: Emerald-tinted skeleton placeholders on dashboard during initial load
- **Sidebar Notification Badges**: Red badge for loss-making products, amber badge for inactive rules
- **Background Noise Pattern**: Subtle SVG noise overlay for depth
- **Custom Shadow Variants**: Soft, modern shadow styles (.shadow-soft, .shadow-soft-emerald)
- **Onboarding Illustrations**: Decorative CSS building/storefront/calculator shapes behind each step
- **Footer Version Indicator**: Shows v0.3 version number and enhanced stats section

## Pricing Calculation Engine

### Break-Even Formula
```
breakEvenPrice = (totalLandedCost + fixedTransactionFee) / (1 - totalPercentageFees - marginTarget)
```

This correctly accounts for percentage fees being charged on the selling price (not cost).

### Margin & Markup
- **Margin** = (Selling Price - Total Landed Cost - All Fees) / Selling Price × 100
- **Markup** = (Selling Price - Total Landed Cost) / Total Landed Cost × 100

### Pricing Status Classification
| Status | Condition |
|--------|-----------|
| **High margin** | Margin ≥ 50% |
| **Healthy** | Margin 25–50% |
| **Low margin** | Margin 10–25% |
| **Loss-making** | Margin < 0% |
| **Missing cost** | No cost data available |
| **Needs review** | Borderline or conflicting signals |

### Recommended Prices
- **Minimum Safe**: Break-even price + small buffer
- **Balanced**: Target margin-based price
- **Premium**: Higher margin target for premium positioning

### Rounding Rules
- No rounding, Nearest whole number, Nearest 5, Nearest 10, End-in-99, End-in-95

### Health Score (0-100)
Each product receives a health score summarizing overall pricing health:
- **Margin Health** (0-40): Loss-making=0, Below break-even=10, Low margin=20, Healthy=30, High margin=40
- **Cost Coverage** (0-30): Based on how much margin covers costs (30 if margin > 25%)
- **Price Alignment** (0-30): How close current price is to recommended (30 if within 5%)

## Supported Currencies

| Currency | Code | Symbol |
|----------|------|--------|
| Indian Rupee | INR | ₹ |
| British Pound | GBP | £ |
| US Dollar | USD | $ |
| Euro | EUR | € |
| UAE Dirham | AED | د.إ |

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com/)
- **State Management**: [Zustand](https://zustand.docs.pmnd.rs/)
- **Charts**: [Recharts](https://recharts.org/)
- **Excel I/O**: [xlsx](https://sheetjs.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Storage**: localStorage (versioned schema with auto-save)

## Getting Started

### Prerequisites
- Node.js 18+ or Bun
- npm, yarn, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/<username>/pricepilot.git
cd pricepilot

# Install dependencies
bun install

# Start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### First Run

1. Complete the 3-step onboarding wizard (Business Name, Currency, Default Fees)
2. The dashboard loads with 12 sample products for demonstration
3. Explore all features — your data persists in localStorage

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main entry point (single-page app)
│   ├── layout.tsx                  # Root layout with providers
│   └── globals.css                 # Global styles
├── components/
│   ├── pricepilot/
│   │   ├── app-shell.tsx           # Main layout with sidebar navigation
│   │   ├── onboarding-flow.tsx     # 3-step onboarding wizard
│   │   ├── dashboard-page.tsx      # Dashboard with charts & summaries
│   │   ├── products-page.tsx       # Product table with filters
│   │   ├── product-detail-drawer.tsx # Product detail slide-out
│   │   ├── import-flow.tsx         # 5-step import wizard
│   │   ├── pricing-rules-page.tsx  # Pricing rules management
│   │   ├── price-simulator.tsx     # What-if pricing calculator
│   │   ├── scenarios-page.tsx      # Saved scenarios
│   │   ├── export-page.tsx         # Data export
│   │   ├── settings-page.tsx       # Business & pricing settings
│   │   ├── status-badge.tsx        # Pricing status indicator
│   │   ├── keyboard-shortcuts.tsx   # Keyboard shortcuts overlay
│   │   ├── add-product-dialog.tsx  # Add/edit product dialog
│   │   ├── product-comparison-drawer.tsx # Compare 2 products side-by-side
│   │   └── help-section.tsx        # Help & documentation
│   └── ui/                         # shadcn/ui components
├── lib/
│   └── pricepilot/
│       ├── types.ts                # TypeScript types & factory functions
│       ├── calculations.ts         # Pricing calculation engine
│       ├── pricing-engine.ts       # Advanced price outcome calculator
│       ├── recommendations.ts      # Multi-mode recommendation engine
│       ├── resolve-rule.ts         # Pricing rule priority resolver
│       ├── storage.ts              # Versioned localStorage system
│       ├── formatting.ts           # Currency & number formatting
│       ├── sample-data.ts          # 12 sample products & rules
│       ├── validation.ts           # Input validation
│       └── excel.ts                # Excel/CSV import & export
└── store/
    └── pricepilot-store.ts         # Zustand state management
```

## Data Privacy

All data is stored **locally in your browser** using localStorage. No data is ever sent to any server. Your product information, pricing strategies, and business settings remain completely private.

## License

MIT License — feel free to use, modify, and distribute.
