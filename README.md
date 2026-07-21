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
cp .env.example .env      # set DB_PASSWORD, JWT_KEY, SMTP + APP_BASE_URL
docker compose up --build
```

Open http://localhost:8088 and either register a new company from the login page ("Register a new company" creates the Company plus its first Admin account), or sign in with the seeded account `secretary@example.com` / `ChangeMe!123` under the seeded "Demo Company Ltd" (change immediately; an `admin@example.com` account is also seeded).

## Multi-tenancy, visibility and contacts

**Companies.** Every user and every meeting belongs to a Company. Self-service sign-up (`POST /api/auth/register`, anonymous) creates the company and its first Admin in one step. The JWT carries a `companyId` claim, and every directory query, meeting mutation and attendee validation is scoped to it — users of one company can never see or reference another company's people or meetings.

**Strict meeting visibility.** A signed-in user can list or open a meeting **only if they are a named attendee** — being in the owning company is necessary but not sufficient. Non-attendees receive 404 (not 403), so they cannot even confirm a meeting exists. To prevent self-lockout under this rule, the creator is automatically added as an attendee if they didn't tick themselves.

**External contacts.** `POST /api/users/contacts` (Secretary/Admin; "Add contact" on the dashboard) inserts a User row with a **null password hash**: contacts appear in the attendee picker (badged "contact"), receive every system email — invites with `.ics`, paper distributions, finalized-minutes links — and can open their personal secure links, but the login endpoint rejects any account without a password hash, so they can never sign in.

## How the workflows map to the code

**Meeting invites** — The secretary creates a meeting (Dashboard → New meeting). A date-based docket code is generated: `BRD-2026-07-15-REG` / `-SPC` / `-AGM`, with `-2`, `-3`… appended on same-day collisions (`MeetingsController.GenerateCodeAsync`). "Send invites" flips status to Scheduled and raises `MeetingScheduled`; every attendee gets an individual email with the agenda, date/time, a personalized secure workspace link, and an `.ics` attachment (`IcsService`). Updating a scheduled meeting re-raises the event as an update (SEQUENCE bump in the `.ics`).

**Board papers** — Uploads are chunked (5 MB chunks via `uploads/start → chunks/{i} → complete`), assembled server-side with a SHA-256 recorded per version. Re-uploading to an existing paper creates version *n+1*, and the UI prompts *"Would you like to email the updated paper to the board now?"*. The **Distribute papers** button raises `PapersDistributed`: each attendee receives a summary email with secure download links for the latest versions — links are personal to the recipient, and downloads are audit-logged with user, version, and IP.

**Minutes** — TipTap editor with agenda-item insertion and an **+ Action point** button that turns selected text into an action (assignee must be a registered user — enforced server-side). **Finalize** locks the minutes permanently (further writes return 409) and automatically raises `MinutesFinalized`, emailing all attendees a read-only link plus a summary of new action points.

**Notifications** — An in-process event bus (`ChannelEventBus` + `EventDispatcherService`) decouples HTTP requests from SMTP. The six triggers:

1. `MeetingScheduled` (create/update) → all attendees, with `.ics`
2. `PapersDistributed` → all attendees or a selected subset
3. `MinutesFinalized` → all attendees, automatic on status change
4. `ActionPointAssigned` → the assignee
5. `ActionPointDueSoon` → assignee at 3 days and 1 day before deadline (`ActionPointReminderService`, hourly idempotent sweep)
6. `ActionPointCompleted` → the meeting chair(s) and secretary

Swapping the bus for RabbitMQ/SQS later requires changing only `IEventBus`'s registration.

**Backups & audit** — The `backup` service runs nightly `pg_dump` + a tarball of the file store with 14-day retention. `AuditLog` records logins, meeting/paper/minutes lifecycle events, every email (recipient, links, timestamp — mirrored in `EmailLog`), every secure-link access, and every paper download.

## Security & deliverability checklist

**Individual emails, never BCC.** `SmtpEmailService` sends one message per recipient so each contains that person's own secure link and Reply-All is impossible by construction.

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
- BCrypt password hashing; JWT auth with role-based authorization (Secretary/Admin for management endpoints)
- Finalized minutes are immutable at the API layer, not just the UI
- Terminate TLS in front of nginx (Caddy/Traefik/ALB) — secure links must only ever travel over HTTPS
- Rotate `JWT_KEY` and DB credentials via `.env`; never commit `.env`

## Development notes

- Schema is created via `EnsureCreated()` on first run for a fast start. Before production, generate proper EF migrations (`dotnet ef migrations add Init`) and switch `Program.cs` to `db.Database.Migrate()`.
- **Upgrading an existing dev database:** this release adds `Companies` and new columns on `Users`/`Meetings`. `EnsureCreated()` does not alter existing schemas — on a dev instance, reset the volume (`docker compose down -v`) or apply EF migrations before starting the new build.
- Swagger UI is available at `/swagger` in Development.
- Frontend dev: `cd frontend && npm install && npm run dev` (proxies `/api` to `localhost:8080`); backend dev: `cd backend && dotnet run`.
