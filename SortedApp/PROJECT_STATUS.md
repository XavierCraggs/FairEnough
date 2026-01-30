# FairEnough - Current State and Roadmap

This document summarizes what is implemented today (based on the codebase),
what is partially implemented, and what remains planned. It is meant as a
single reference point for product + engineering.

Last updated: 2026-01-26

---

## 1) Core Architecture

- **Client**: React Native (Expo), Expo Router with stack + tabs.
- **Backend**: Firebase (Auth, Firestore, Storage, Functions).
- **Payments**: RevenueCat (House Pass subscription).
- **Push**: Expo notifications (client) + Firebase Function (server sender).

Key files:
- `app/_layout.tsx`, `app/(tabs)/_layout.tsx`
- `api/firebase.js`
- `functions/index.js`

---

## 2) Implemented Features (Shipping)

### Authentication
- Email/password sign up, login, reset.
- Social auth flows wired for Apple/Google/Facebook (requires env IDs).
- Real-time user profile sync in Firestore.

Files:
- `services/authService.ts`
- `contexts/AuthContext.tsx`
- `app/(auth)/*`

### House Management
- Create house, join by invite code, leave house.
- Invite code uniqueness & validation.
- Free-tier member cap enforced (8 members).

Files:
- `services/houseService.ts`
- `app/(auth)/house-setup.tsx`

### Chores
- Create/edit/delete chores.
- Recurrence (daily/weekly/monthly/one-time).
- Assigned user + due dates.
- Chore completion with points (transactional).
- Fairness calculation (rolling 28 days).
- Auto-assign due chores based on fairness.
- Overdue detection + Alfred nudges.
- UI: filters, templates, density toggles, edit modal, end series.

Files:
- `services/choreService.ts`
- `utils/choreAssignment.ts`
- `app/(tabs)/chores.tsx`

### Finance
- Transactions with equal/custom splits.
- Payer-only edit, participant confirm.
- Contest flow with reason + notes.
- Settlements and simplified debts.
- Debt summary and urgency indicators.
- UI: receipt cards, split editor, contest modal.

Files:
- `services/financeService.ts`
- `utils/finance.ts`
- `app/(tabs)/finance.tsx`

### Calendar
- Event create/edit/delete.
- Recurrence + optional end date.
- Calendar grid + list view.

Files:
- `services/calendarService.ts`
- `app/(tabs)/calendar.tsx`

### Alfred (Mediator)
- In-app notifications stream with read/unread.
- Message templates by event type.
- Dashboard “Alfred inbox” + nudge modal.
- Push notifications sent on new Alfred messages (server function).

Files:
- `services/notificationService.ts`
- `hooks/useAlfred.ts`
- `app/(tabs)/index.tsx`
- `functions/index.js`

### Settings / Profile
- Profile editing (name, email, photo).
- House info, invite copy.
- Premium CTA + purchase/restore/manage.
- Admin tools to seed test data.
- Theme + appearance selection.

Files:
- `app/(tabs)/settings.tsx`
- `services/profileService.ts`
- `services/premiumService.ts`
- `constants/AppColors.ts`

---

## 3) Premium Foundations (Partially Implemented)

✅ RevenueCat client integration + House Pass purchase/restore.
✅ RevenueCat webhook updates `isPremium` on house.
✅ Free-tier member cap enforced.

⚠️ Feature gating for premium features is not fully enforced in UI or services.

Files:
- `services/premiumService.ts`
- `functions/index.js`
- `services/houseService.ts`

---

## 4) Known Gaps / Not Implemented Yet

- **Calendar sync** (Google/Apple) - placeholder note only.
- **Receipt OCR** for bills.
- **Custom Alfred nudges** (premium) beyond current free-text nudge.
- **Analytics exports / advanced analytics**.
- **Firestore security rules** for production hardening.
- **Global cooldowns for Alfred nudges** (partial only for overdue).
- **Edit flows** are in place for chores/calendar; finance edit exists but could use polish.
- **Offline handling and edge-case QA**.

Reference:
- `TRD.md`

---

## 5) Data Model Snapshot (From Code)

House
- `houseId`, `name`, `inviteCode`, `members[]`, `isPremium`, `choreWeights`, timestamps

User
- `uid`, `name`, `email`, `houseId`, `totalPoints`, `photoUrl`, `expoPushToken`

Chore
- `title`, `points`, `assignedTo`, `frequency`, `status`
- `lastCompletedBy`, `lastCompletedAt`, `nextDueAt`, `totalCompletions`

Transaction
- `payerId`, `amount`, `description`, `splitWith[]`
- `splitAmounts?`, `confirmedBy[]`, `contestedBy[]`, `contestNotes`

Calendar Event
- `title`, `startDate`, `recurrence`, `createdBy`, timestamps

Notification
- `type`, `message`, `metadata`, `triggeredBy`, `readBy[]`

Files:
- `services/*.ts`

---

## 6) Suggested Next Milestones (Aligned to Current Code)

1) **Security & Stability**
   - Firestore rules for house data + notifications.
   - QA for auth edge cases and offline handling.

2) **Premium Gating & First Premium Feature**
   - Gate premium-only features in UI/services.
   - Add first premium feature (e.g., calendar sync or receipt OCR stub flow).

3) **Automation**
   - Scheduled rotation / auto-assign logic server-side (Cloud Functions).
   - Global cooldowns for Alfred nudges.

4) **Polish**
   - Accessibility pass.
   - Loading/error state improvements.
   - More robust settings for theme & account.

5) **Test Feedback**
   - Multiple house support (premium only)
   - Allow repeat button on cho     re roation doesnt work
   - Light purple theme (or more in general)
   - Selectable profiles in setting (show email and details)
   - General house to-do list
   - log in with apple (user not found - was able to update details afterwards to fix account should have just not been able to login or get to join house screen if no user details)

6) **Onboarding Redesign (Drafted)**
   - See `ONBOARDING_PLAN.md` for the new flow proposal (profile → house choice → join/create → quick start).
