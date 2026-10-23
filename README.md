# BoardRoom — Board Meeting Management

A secure, self-hosted system for managing Board of Directors meetings: agendas, board papers, minutes, action points, and email distribution — treating each meeting as a distinct, auditable event in the company minute book.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, TipTap rich-text editor for minutes |
| Backend | C# / .NET 8 Web API, EF Core |
| Database | PostgreSQL 16 (jsonb audit details) |
| File storage | Local filesystem in a dedicated Docker volume outside the web root (`FileStorageService` is the single seam — swap in a MinIO/S3 implementation later without touching controllers) |
| Email | Any SMTP endpoint: self-hosted Postal, or a transactional API's SMTP interface (Postmark, SES, Mailgun) |
| Deployment | Docker & Docker Compose, with a nightly backup sidecar |

## Quick start

```bash
cp .env.example .env      # set DB_PASSWORD, JWT_KEY, APP_BASE_URL (SMTP lives in-app per company)
docker compose up --build
```

Open http://localhost:8088 and either register a new company from the login page ("Register a new company" creates the Company plus its first Admin membership — using an email that already exists adds the company to that account as another workspace after a password check), or sign in with a seeded **Demo Company Ltd** account (`ChangeMe!123` for all — change immediately): `admin@example.com` (Admin), `secretary@example.com` (Secretary), `user@example.com` (User). An external contact **John Smith** and a scheduled hybrid **Q3 Board Meeting** (`BRD-2026-09-15-REG`, Boardroom A + Zoom link, four agenda items) are seeded so every screen has data.

> Upgrading a dev instance from an earlier build? `EnsureCreated()` doesn't migrate an existing schema — reset with `docker compose down -v` (or generate EF migrations for real data).

## Multi-company accounts, visibility and contacts

**One identity, many workspaces.** A `User` is a global identity (unique email + password). Role (`Admin` / `Secretary` / `User`), job title and status (`Active` / `Suspended` / `Fired`) live on `CompanyMemberships` — the same person can be Admin of one company and a plain member of another. Sign-in is two-step: `POST /api/auth/login` verifies credentials and returns the account's workspaces plus a 10-minute select token; `POST /api/auth/token` (bearer: select token, or the current workspace token when switching) validates the active membership and issues the 10-hour workspace JWT with `role` and `companyId` claims. One workspace → straight to the dashboard; several → a chooser, and a header dropdown switches companies later without signing out.

**Status enforcement mid-session.** A middleware interceptor re-checks the membership status on every authenticated request. Suspend or fire a member and their next click returns 401 with "Your account is suspended." / "Your account is fired." — stale JWTs don't help.

**Company registration & invites.** `POST /api/auth/register` creates the Company and an Admin membership; if the email already exists, the password is verified first and the company attaches to the existing identity. `POST /api/users` (Secretary/Admin) likewise adds an existing account to the company without any "email exists" conflict, or creates the identity (password ≥ 8) when new.

**Strict meeting visibility.** Named attendees see a meeting; the company's Admins and Secretaries additionally have management oversight of all company meetings. Everyone else gets 404 (not 403), so they cannot even confirm a meeting exists. Creators are auto-added as attendees against self-lockout.

**External contacts.** `ExternalContacts` is its own per-company table (full CRUD at `/api/contacts`, management page at `/contacts`). Contacts appear in the unified directory (`GET /api/auth/users`, `isContact: true`) and attendee pickers, receive every system email — invites with `.ics`, paper distributions, finalized-minutes links — through their own personal secure links (`MeetingAttendee`/`SecureLinkToken` reference *either* a `UserId` or a `ContactId`), and can never sign in: no password exists for a contact.

**Meeting modes.** Every meeting is `Physical`, `Online` or `Hybrid` — the forms show location and/or video-link fields accordingly, the emails render a mode-aware venue line, and the `.ics` `LOCATION` maps to the address, the link, or both.

## How the workflows map to the code

**Meeting invites** — The secretary creates a meeting (Dashboard → New meeting). A date-based docket code is generated: `BRD-2026-07-15-REG` / `-SPC` / `-AGM`, with `-2`, `-3`… appended on same-day collisions (`MeetingsController.GenerateCodeAsync`). "Send invites" requires **at least one agenda item** (otherwise 400: *"Cannot send invites. A meeting must have at least one agenda item defined before invitations can be sent."*), flips status to Scheduled and raises `MeetingScheduled`; every attendee — registered or contact — gets an individual email with the agenda, date/time, mode-aware venue line, personalized secure workspace link, and an `.ics` attachment (`IcsService`). Editing a scheduled meeting re-raises the event as an update automatically, and the **Email updates to board** button (`POST /api/meetings/{id}/send-updates`, Scheduled meetings only, same agenda rule) re-sends revised notices + updated `.ics` (SEQUENCE bump) on demand. In the workspace, paper titles and filenames are click-to-download through the authenticated `GET /api/papers/{id}/download` endpoint (attendees + management, audit-logged), and the Minutes tab has **Print Minutes** — a formal print stylesheet renders company name, meeting metadata, attendee list, the minutes body and an action-point appendix while hiding all screen UI.

**Board papers** — Uploads are chunked (5 MB chunks via `uploads/start → chunks/{i} → complete`), assembled server-side with a SHA-256 recorded per version. Re-uploading to an existing paper creates version *n+1*, and the UI prompts *"Would you like to email the updated paper to the board now?"*. The **Distribute papers** button raises `PapersDistributed`: each attendee receives a summary email with secure download links for the latest versions — links are personal to the recipient, and downloads are audit-logged with user, version, and IP.

**Minutes** — TipTap editor with agenda-item insertion and an **+ Action point** button that turns selected text into an action (assignee must be a registered user — enforced server-side). **Finalize** locks the minutes permanently (further writes return 409) and automatically raises `MinutesFinalized`, emailing all attendees a read-only link plus a summary of new action points.

**Notifications** — An in-process event bus (`ChannelEventBus` + `EventDispatcherService`) decouples HTTP requests from SMTP. The six triggers:

1. `MeetingScheduled` (create/update) → all attendees, with `.ics`
2. `PapersDistributed` → all attendees or a selected subset
3. `MinutesFinalized` → all attendees, automatic on status change
4. `ActionPointAssigned` → the assignee
5. `ActionPointDueSoon` → assignee at 3 days and 1 day before deadline (`ActionPointReminderService`, hourly idempotent sweep)
6. `ActionPointCompleted` → the meeting chair(s) plus the company's Admins/Secretaries

Swapping the bus for RabbitMQ/SQS later requires changing only `IEventBus`'s registration.

**Backups & audit** — The `backup` service runs nightly `pg_dump` + a tarball of the file store with 14-day retention. `AuditLog` records logins, meeting/paper/minutes lifecycle events, every email (recipient, links, timestamp — mirrored in `EmailLog`), every secure-link access, and every paper download.

## Security & deliverability checklist

**Per-company mail transport.** There is no global SMTP config: `SmtpEmailService` resolves the owning company's `CompanyMailSettings` row at send time (password encrypted with ASP.NET Data Protection; keys persisted alongside the file store). Admins manage it at `/mail-settings` — including a **Send test email** live handshake before saving. No active settings → the send is skipped and logged `Skipped`, never silently lost.

**Individual emails, never BCC.** One message per recipient (user or contact) so each contains that person's own secure link and Reply-All is impossible by construction.

**Secure links.** 256-bit random tokens; only the SHA-256 hash is stored (`SecureLinkService`), so a database leak can't be replayed. Links expire (default 30 days, `App:SecureLinkLifetimeDays`), are revocable, and every access is counted and audit-logged.

**No content in email.** Templates carry metadata only — meeting name, code, date, paper titles/versions, action descriptions — never minutes text or documents. Papers travel only as authenticated downloads.

**DNS you must configure for the sending domain** (whether Postal or a transactional API):

- **SPF** — `TXT @ "v=spf1 include:<your-provider-or-postal-host> ~all"`
- **DKIM** — publish the selector record your provider gives you (Postal: shown under the mail server's DNS tab); verify with `dig <selector>._domainkey.yourdomain.com TXT`
- **DMARC** — start with `TXT _dmarc "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"` and move to `p=reject` once reports are clean
- Set a matching **Return-Path/bounce domain** and **PTR** record if self-hosting Postal
- Warm up the domain: board packs are bursty; a fresh domain sending 12 identical-looking emails in a minute is a spam signature. Use a subdomain like `mail.yourdomain.com` reserved for these notifications.

**Other hardening in place / recommended:**

- Files stored outside the web root; path-traversal guard in `FileStorageService.OpenRead`
- BCrypt password hashing (min 8 chars); JWT auth with role-based authorization (Secretary/Admin for management endpoints, Admin-only mail settings); self-lockout guards (admins cannot suspend, fire or demote themselves); per-request membership status enforcement
- Finalized minutes are immutable at the API layer, not just the UI
- Terminate TLS in front of nginx (Caddy/Traefik/ALB) — secure links must only ever travel over HTTPS
- Rotate `JWT_KEY` and DB credentials via `.env`; never commit `.env`

## Development notes

- Schema is created via `EnsureCreated()` on first run for a fast start. Before production, generate proper EF migrations (`dotnet ef migrations add Init`) and switch `Program.cs` to `db.Database.Migrate()`.
- **Upgrading an existing dev database:** this release adds `Companies` and new columns on `Users`/`Meetings`. `EnsureCreated()` does not alter existing schemas — on a dev instance, reset the volume (`docker compose down -v`) or apply EF migrations before starting the new build.
- Swagger UI is available at `/swagger` in Development.
- Frontend dev: `cd frontend && npm install && npm run dev` (proxies `/api` to `localhost:8080`); backend dev: `cd backend && dotnet run`.
