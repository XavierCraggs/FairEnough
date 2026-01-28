# FairEnough - Technical Requirements and Roadmap

## Project Vision
FairEnough is a low-friction sharehouse management app that uses a neutral "AI Butler" (Alfred) to mediate chores and finances, reducing social friction through automation and anonymity.

## 1) Architecture and Stack
- Platform: React Native (Expo)
- Backend: Firebase
  - Auth: Email (done), Apple/Google (stubs in authService)
  - Firestore: real-time data (chores, bills, calendar, notifications)
  - Cloud Functions (planned): push sender + scheduled jobs
  - Push: Expo Notifications client setup done; server sender needed
- Design: Soft Butler theme (ButlerBlue #4A6572, background #F8FAF9)

## 2) Data Model (Current)
House
- houseId, name, inviteCode, members[], isPremium, choreWeights, createdAt, updatedAt

User
- uid, name, email, houseId, totalPoints, expoPushToken

Chore
- choreId, title, description, points, assignedTo, frequency, status
- lastCompletedBy, lastCompletedAt, totalCompletions
- createdBy, createdAt, updatedAt

Transaction
- transactionId, payerId, payerName, amount, description, splitWith[], confirmedBy[]
- createdAt, updatedAt

Calendar Event
- eventId, title, description, startDate
- recurrence { frequency, interval, endDate }
- createdBy, createdByName, createdAt, updatedAt

Notification
- notificationId, type, message, metadata, triggeredBy, readBy[]
- createdAt, updatedAt

## 3) Functional Requirements (Status)
A) Chores and Fairness
- Fairness calculation + dashboard summary: Done
- Assign/complete chores with permission guard: Done
- Overdue nudges via Alfred: Done (daily check on chores load)
- Swipe-to-complete: Not yet

B) Finance
- Debt simplification: Done
- Confirmation loop: Done
- Transaction aging visuals (urgent over time): Done
- Receipt OCR (premium): Not yet
- Due dates (optional): Not yet

C) Alfred (Mediator)
- Anonymous nudges: Done
- Alfred dialogue engine with variants: Done
- In-app feed + history modal: Done
- System triggers: bill added, chore assigned/completed, overdue: Done
- Rate limiting across all types: Partial (overdue only)
- Custom nudges (premium): Not yet

D) Calendar
- Shared events + recurrence + end date: Done
- List + calendar grid view: Done
- Calendar sync (premium): Not yet

E) Settings
- House details + invite code copy: Done
- Account summary + premium CTA: Done
- Profile editing / house settings: Partial

## 4) Navigation
Tabs: Dashboard, Chores, Finance, Calendar, Settings (Done)
Dashboard highlights: Alfred Briefing card + fairness summary (Done)

## 5) Monetization (Planned)
House Pass: $3.99/month (shared)
Premium features:
- Calendar sync (Google/Apple)
- Custom Alfred nudges
- Receipt OCR for bills
- Advanced analytics exports
- Ad-free experience (if ads introduced)

## 6) Production Readiness Gaps
- Firestore rules: add rules for notifications/events (console)
- Push pipeline: Cloud Function to send Expo push on new notifications
- Edit flows: finance + calendar update UI
- Global cooldowns for nudges
- QA: offline handling, edge cases, stress tests, accessibility pass

## 7) Roadmap (Milestones)
Milestone 1: Security and Stability (1-2 days)
- Add Firestore rules for notifications/events
- Validate metadata and tighten read/update access
- QA pass for new Calendar + Alfred flows

Milestone 2: Push Notifications (2-4 days)
- Cloud Function sender for Expo pushes
- Device token management and cleanup
- Dev build/TestFlight verification

Milestone 3: Edit and Polish (2-3 days)
- Edit calendar events
- Edit finance transactions
- UI polish for Finance/Dashboard/Calendar

Milestone 4: Premium Foundations (3-5 days)
- Premium gating UI + stored isPremium checks
- Stub calendar sync and receipt OCR screens
- Analytics summary screen placeholder

## 8) Immediate Next Steps
1) Add Firestore rules for notifications/events
2) Build Cloud Function push sender
3) Implement edit flows for finance and calendar
