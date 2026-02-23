# Design System for Avani Enterprise Hospital OS

## 1. Visual Identity
- **Theme**: Professional, Clean, Trustworthy (Medical/Enterprise).
- **Primary Color**: Teal-600 (`#0d9488`) for actions, buttons, and active states.
- **Background**: Slate-50 (`#f8fafc`) for app background, White (`#ffffff`) for cards/panels.
- **Alerts**: Red-500 (`#ef4444`) for critical notifications, "Low Stock", or "Admit" actions.
- **Success**: Green-500 (`#22c55e`) for completion messages.
- **Text**: Slate-900 (Headings), Slate-600 (Body), Slate-400 (Muted).

## 2. Typography
- **Font**: Inter (or system sans-serif).
- **Headings**: Bold, clear hierarchy.
- **Body**: Clean, legible, 14px-16px base size.

## 3. UI Components
- **Cards**: White bg, subtle shadow (`shadow-sm`), rounded-lg borders (`border-slate-200`).
- **Buttons**:
  - Primary: `bg-teal-600 text-white hover:bg-teal-700 rounded-md px-4 py-2`.
  - Secondary: `border border-slate-300 text-slate-700 hover:bg-slate-50`.
  - Danger: `bg-red-500 text-white hover:bg-red-600`.
- **Inputs**: `border-slate-300 focus:ring-teal-500 focus:border-teal-500 rounded-md`.
- **Navigation**: Sidebar or Topbar using `bg-white border-b border-slate-200`. Uses Lucide icons.

## 4. Layout Patterns
- **Dashboard**: Sidebar navigation + Main Content Area with Grid of Cards or Data Tables.
- **Split View**: Left List / Right Details (used for Doctor's Console).
- **Forms**: Clean vertical rhythm, labeled inputs, clear primary action at bottom right.
- **Modals**: Centered, backdrop blur, clear title and close action.

## 6. Design System Notes for Stitch Generation
(Copy this block into prompts)
**DESIGN SYSTEM:**
- Use **Tailwind CSS**.
- **Colors**: Slate-50 bg, White cards, Teal-600 primary, Red-500 alerts.
- **Typography**: Clean sans-serif (Inter).
- **Components**: Rounded-lg cards with `shadow-sm`.
- **Icons**: Use `lucide-react` imports (e.g., `import { Stethoscope } from 'lucide-react'`).
- **Layout**: Responsive, mobile-friendly but desktop-first for hospital functionality.
