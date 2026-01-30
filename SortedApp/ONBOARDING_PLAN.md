# FairEnough Onboarding Redesign (Draft)

Status: Draft (initial spec)
Owner: Xavier / Codex
Last updated: 2026-01-30

## 1) Goals
- Reduce time-to-value to <2 minutes.
- Make joining/creating a house dead simple.
- Personalize flows without asking for unnecessary data.
- Create a “first win” loop (first chore/bill/event created + invite prompts).

## 2) Principles
- Ask only for data that improves the experience.
- Keep steps short, each with a clear CTA.
- Defer “nice to have” data until after house setup.
- Always allow skip on optional steps.
- Keep all steps resumable.

## 3) Data to Collect
Required:
- Name (already)
- House: join or create

Optional (high value):
- Avatar/photo
- Phone number (for reminders / push fallback)
- Preferred reminder time (quiet hours)
- Role intent: “Mostly manage chores” / “Split bills” / “Both”

Avoid unless truly needed:
- Gender, age, etc.

## 4) Proposed Flow (Screen-by-screen)

### Step 0: Welcome/Auth (existing)
Route: `/(auth)/index`
Actions: Apple / Google / Facebook / Email

### Step 1: Profile Setup (expanded)
Route: `/(auth)/complete-profile` (extended)
Fields:
- Full name (required)
- Photo (optional)
- Phone (optional)
- “Use FairEnough for” (Chores / Bills / Both)

CTA: “Continue”

### Step 2: House Choice
Route: `/(auth)/house-choice` (new)
Options:
- Join a house (invite code)
- Create a house

CTA: “Join” / “Create”

### Step 3A: Join House (focused)
Route: `/(auth)/house-join` (new)
Input:
- Invite code (6 chars)

CTA: “Join house”
Success: “Welcome to {House Name}”

### Step 3B: Create House (wizard)
Route: `/(auth)/house-create` (new, 3–4 steps)
Steps:
1) House basics
   - House name (required)
   - Emoji (optional)
   - Household size (optional)
2) Chore defaults
   - Rotation mode (Fair / Weekly Lock)
   - Avoid repeats toggle
   - Chore layout (Comfortable / Compact)
3) Finance defaults
   - Split style (Equal / Custom)
   - Default currency (auto)
4) Invite housemates (optional)
   - Show invite code
   - Copy / Share actions

CTA: “Create house”

### Step 4: Quick Start (first win)
Route: `/(auth)/quick-start` (new)
Checklist cards:
- Add a first chore (template)
- Add a bill (template)
- Add an event (template)
- Invite a housemate

CTA: “Finish”

## 5) UX Enhancements
- Stepper header (e.g., “Step 2 of 4”).
- Friendly microcopy (“You can skip this for now”).
- Progressive disclosure (optional fields hidden behind “Add more details”).
- Personalized wording based on selected intent (chores/bills/both).

## 6) Edge Cases
- Existing users with house: skip straight to tabs.
- Existing users without house: go to House Choice.
- Invite code deeplink: jump to House Join screen.
- Returning user mid-flow: resume last step.

## 7) Proposed Data Changes
User doc:
- `profileIncomplete` (already)
- `onboardingStep` (string enum) — for resuming flow
- `onboardingIntent` ("chores" | "bills" | "both")
- `phone` (already supported)

House doc:
- `choreDensity` ("comfortable" | "compact") — already added

## 8) Implementation Plan
Phase 1 (this week):
- Extend `complete-profile` with optional fields + intent selection.
- Add `house-choice` screen.
- Split `house-setup` into `house-join` + `house-create` wizard.
- Store `onboardingStep` in user doc.

Phase 2:
- Quick-start checklist (templates).
- Invite share flow.
- Deep link handling for invite codes.

Phase 3:
- Micro-tips in context (after first chore/bill/event).
- Add haptics + animations for transitions.

## 9) Open Questions
- Do we want phone verification or just store the number?
- Should “intent” alter default tabs or just shortcuts?
- Should “Quick Start” be skippable forever or re-openable?

