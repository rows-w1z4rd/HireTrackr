# HireTrack — Constitution
> The final product vision, technical blueprint, and operating model.
> This document defines what HireTrack is, what it will become, and exactly how every system works.
> Version 1.0 | April 2026 | Updated as the product evolves.

---

## 0. The Core Promise

HireTrack is a free Chrome extension that lets job seekers save listings, track applications on a Kanban board, store CVs, and write outreach emails — entirely on their own device, no account needed, no data sent anywhere, no cost ever for the base product.

The paid tiers (Pro, Team) add value on top. They never take away what made it trustworthy.

**The moat is not the code. The moat is:**
1. The only job tracker that natively covers 300+ regional job boards in 7 languages including Arabic
2. Complete privacy — verifiable because the code is open source
3. Being the free option that works better than the paid competition (Huntr $13/mo, Teal $9/mo)
4. Trust built through consistency: every review answered, every bug fixed fast, no dark patterns

---

## 1. Who This Is For

**Primary user:** A job seeker applying to 10–60 jobs across multiple platforms simultaneously. They lose track of where they applied, what stage they're in, and whether they followed up. HireTrack solves that without asking for an account.

**Secondary user:** A Moroccan, French, or Gulf-region job seeker that English-language tools ignore. Their job boards (Rekrute, Bayt, Emploi.ma, Akhtaboot, Wuzzuf) are not in Huntr's job detection. They are in HireTrack's.

**Pro user:** The same person after 2–3 weeks of active job hunting. They've hit one of the Free limits, or they've lost data once and want backup, or they just want the AI cover letter tool that saves them 30 minutes per application.

**Team user:** A career coach, university career center, or bootcamp program managing 5–15 job seekers at once. They pay once for the whole group and get a shared dashboard.

---

## 2. Product Tiers — Final Definition

### Free — Forever, No Account

**Philosophy:** The free tier must be genuinely useful on its own. Users who stay free forever are still worth having — they're word of mouth, reviews, and GitHub stars. Never make them feel like they're using a trial.

**What's included:**
- Save unlimited jobs from any supported job board
- Full 5-stage Kanban pipeline (Saved / Applied / Interview / Offer / Rejected)
- Drag and drop between stages
- Status history per job (automatic)
- CV Vault — store up to **3 CVs** locally on device (files in IndexedDB, no size limit)
- Email templates — up to **5 templates** with `{{company}}`, `{{role}}`, `{{name}}` placeholders
- Text snippets — up to **10 snippets**
- Export all jobs as CSV — one click, always free, always will be
- Import jobs from CSV (restore from backup)
- Job detection across 300+ job boards in 7 languages
- Search and filter jobs (by status, title, company)
- Follow-up reminder date field (local only — fires a browser notification via `chrome.alarms`)
- First-run onboarding screen
- Keyboard shortcuts

**Why these limits specifically:**
3 CVs covers 95% of people doing one job search — a general CV, a tailored version, a one-pager. 5 templates handles: initial application, follow-up, thank you after interview, referral request, rejection reply. 10 snippets covers a personal bio, a skills paragraph, a salary line, and custom blocks. Anyone maxing all three limits simultaneously is a power user who's getting daily real value — that person should upgrade. The limits are discovery moments, not punishments.

**What the free tier does NOT have:**
- Cloud backup (data lives only on this device and this browser)
- CV cloud backup (if Chrome is wiped, the files are gone)
- Cross-device sync
- AI features
- Pipeline analytics charts
- Unlimited templates/snippets/CVs

---

### Pro — $4/month or $35/year

**Philosophy:** The price is low enough that an active job seeker doesn't think twice. Lower than one coffee. Way lower than competitors. The value delivered — especially AI and cloud backup — is worth 5–10x the price, which means almost no churn once someone subscribes.

**Everything in Free, plus:**

**Unlimited Everything**
- Unlimited CVs, email templates, text snippets

**Cloud Backup and Sync**
- Every job save, status change, and note edit syncs silently to the cloud in the background
- CV files (actual PDFs) are backed up to cloud storage — not just metadata
- If Chrome is wiped, computer reset, or extension reinstalled on a new device: log in once, everything restores automatically
- Works across devices — use HireTrack at home and at work with the same data

**Follow-up Reminders (enhanced)**
- Set reminder date per job with custom note
- Extension badge shows number of overdue follow-ups
- Reminder history per job

**AI Writing Tools — 20 requests/month**
- **Cover letter draft:** Paste the job description. Receive a tailored draft that matches the role's language and requirements. You edit it — it's a starting point, not a finished product.
- **Interview prep:** "What questions should I expect for a Senior Designer role at Figma?" Returns a structured list with suggested answers tailored to the company.
- **Job fit check:** Paste your CV text and the job description. Returns a plain-English assessment of how well you match, which requirements you satisfy, and what gaps exist.
- **Email rewrite:** Paste a draft follow-up email. Returns a more professional version with the same intent.

**Pipeline Analytics**
- Application funnel: what % of saved jobs get applied to, what % of applications get an interview, what % of interviews get an offer
- Average time spent in each stage (how long do you typically sit in "Applied" before hearing back?)
- Monthly application volume chart (are you applying consistently?)

**CV Preview**
- Open any stored CV directly in a new tab as a readable PDF — currently CVs are stored but never viewable

---

### Team — $12/month (up to 5 users) / $20/month (up to 15 users)

**Philosophy:** B2B pricing. One career coach with 15 clients is worth more than 15 individual Pro subscriptions ($60/month vs $60/month — same revenue, but one paying customer, lower churn risk, expandable relationship).

**Who this is for:** Career coaches, university career centers, bootcamp cohorts. Not random groups of job seekers.

**Everything in Pro for every member, plus:**

**Admin Dashboard**
- Admin sees all members' pipeline stage counts in a single read-only view
- See who has interviews this week, who has been stuck in Applied for 2+ weeks, who received offers
- Admin cannot read members' notes or see their CV content — only stage-level summary data

**Shared Resource Library**
- Admin pushes email templates to all members ("use this follow-up this week")
- Shared snippet library that admin maintains, visible to all members
- Members keep their own private templates and snippets on top of shared ones

**Team Job Board (closed group only)**
- Admin posts job listings to the group: "I found this listing, worth applying"
- Members see a "Recommended" tab in their popup with one-click save to their own pipeline
- This is closed and invite-only — not a public feed, which avoids moderation problems

**Team Management**
- Invite members by email
- Remove members, transfer admin role
- Member cap enforced by plan (5 or 15)

**Cohort Export**
- Admin exports the entire group's pipeline data as one combined CSV — useful for university reporting or bootcamp tracking

---

## 3. Payment System — How It Works

### The Provider: Stripe

Stripe is the payment infrastructure. It handles credit card processing, subscription billing, invoicing, and compliance. You don't touch payment card data — ever. Stripe handles everything and pays you the remainder after fees.

**Why Stripe and not alternatives:**
- Stripe has no monthly fee. You only pay when someone pays you.
- Stripe's basic fee is **2.9% + $0.30 per transaction**. On a $4/month payment: Stripe keeps $0.42, you keep $3.58. On a $35/year payment: Stripe keeps $1.32, you keep $33.68.
- Stripe supports subscriptions natively — recurring monthly or yearly billing without any code for the billing logic itself
- Stripe has a free testing environment — you can test the entire payment flow without real money
- Stripe is accepted from Morocco via international card (Visa/Mastercard) — you need a Stripe account in a supported country or use a provider like Paddle that handles this for you (see note below)

**Morocco note on Stripe:** Stripe does not directly support Morocco as a payout country as of 2026. Your options:
1. **Paddle** — acts as a reseller (Merchant of Record). They process payments on your behalf worldwide, handle VAT/tax, and pay you. Fee is slightly higher (~5%) but no country restriction. Best option if you're operating from Morocco.
2. **Stripe via an entity in a supported country** — if you have a French or other EU entity, use that. Not available to everyone.
3. **Lemon Squeezy** — similar to Paddle, handles taxes globally, Morocco-friendly. 5% + $0.50 per transaction.

For simplicity at launch, **Paddle or Lemon Squeezy** is the practical recommendation. The difference in fees is ~$0.20 per transaction — not worth the complexity of a foreign entity.

### How the Payment Flow Works

**Step 1 — User hits a limit:**
The popup detects the user has 3 CVs uploaded and tries to add a 4th. Instead of an error, it shows an upgrade prompt: "You've reached the Free limit. Upgrade to Pro for unlimited CVs + cloud backup." One button: "Upgrade — $4/month."

**Step 2 — Checkout:**
The button opens a new tab pointing to a Paddle/Lemon Squeezy checkout page you've configured. The user enters their email and card. They never leave to a third-party domain that looks sketchy — Paddle/Lemon Squeezy checkout is trusted and handles everything.

**Step 3 — Webhook:**
After payment succeeds, Paddle sends a webhook (an automatic notification) to your Supabase Edge Function. The Edge Function records in your Supabase database: "user with this email is now Pro, subscription started, valid until X date."

**Step 4 — Unlocking:**
When the extension next checks the user's subscription status (on startup or login), it queries Supabase, confirms Pro status, and unlocks Pro features. This check happens silently in the background — the user just sees the limits are gone.

**Step 5 — Renewal:**
Paddle handles recurring billing automatically every month or year. If a payment fails, Paddle retries and notifies the user. You don't write any of this logic.

**Step 6 — Cancellation:**
Paddle provides a customer portal link where users can cancel. If they cancel, the webhook fires again, Supabase updates the user's status to Free, and Pro features lock on their next extension startup.

### Subscription Management in Supabase

```sql
-- users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free', -- 'free' | 'pro' | 'team'
  plan_expires_at TIMESTAMPTZ,
  paddle_customer_id TEXT,
  team_id UUID REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

When the extension checks subscription status, it calls a Supabase Edge Function (not the database directly — API keys stay server-side). The function returns: `{ plan: "pro", validUntil: "2027-04-01" }`.

---

## 4. AI System — How It Works

### The Provider: Claude Haiku (Anthropic API)

You call Anthropic's API. You pay per token (units of text). You don't host anything.

**What "tokens" means:** Think of tokens as word-chunks. 1,000 tokens ≈ 750 words. A job description is roughly 400–600 tokens. A generated cover letter is roughly 300–500 tokens. One cover letter generation = input (~500 tokens) + output (~400 tokens) = ~900 tokens total.

**Claude Haiku pricing:**
- Input: $0.25 per million tokens
- Output: $1.25 per million tokens
- One cover letter generation: ~$0.00075 (less than one tenth of a cent)
- One Pro user using all 20 monthly AI requests: ~$0.015 (one and a half cents)
- 1,000 Pro users all using 20 requests/month: **~$15/month**
- Revenue from 1,000 Pro users: **$4,000/month**

The math is not close. AI is not a cost problem at this scale.

### The Architecture

The user's browser never calls the Anthropic API directly. That would expose your API key to anyone who inspects the extension's network requests. Instead:

```
User clicks "Draft cover letter"
        ↓
Extension sends job description to YOUR Supabase Edge Function
        ↓
Edge Function checks: is this user Pro? Do they have remaining AI requests this month?
        ↓  (if yes)
Edge Function calls Claude Haiku API with the prompt
        ↓
Claude returns the draft
        ↓
Edge Function returns the draft to the extension + decrements the user's AI counter
        ↓
User sees the draft in the popup
```

The Anthropic API key lives only in the Edge Function's environment variables — never in the extension code, never in the database, never visible to users.

### Rate Limiting

Each Pro user gets 20 AI requests per calendar month. Tracked in Supabase:

```sql
CREATE TABLE ai_usage (
  user_id UUID REFERENCES users(id),
  month TEXT, -- "2026-04" format
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
```

When the Edge Function receives a request, it checks `ai_usage` for the current month. If count >= 20, it returns an error: "You've used your 20 monthly AI requests. Resets on [date]." Otherwise it increments the counter and proceeds.

### The Prompts

Cover letter prompt structure:
```
You are a professional job application writer. Write a cover letter for this role.
Keep it under 300 words. Use a professional but not stiff tone. Do not start with "I am writing to apply."

JOB DESCRIPTION:
[job description pasted by user]

APPLICANT BACKGROUND (optional):
[user's notes about themselves, if provided]

Return only the cover letter text with no preamble or explanation.
```

Interview prep prompt structure:
```
You are a career coach preparing a candidate for an interview.
List the 8 most likely interview questions for this role, with a suggested answer direction for each.
Be specific to the role and company, not generic.

ROLE: [title] at [company]
JOB DESCRIPTION: [job description]

Format as: Q: [question] / A: [suggested approach]
```

---

## 5. Cloud Infrastructure — How It Works

### The Provider: Supabase

Supabase is a backend-as-a-service built on top of PostgreSQL (a standard, reliable database). It gives you: a database, file storage, user authentication, and serverless functions — all in one place, all with a generous free tier.

**Why Supabase:**
- Free tier is genuinely useful: 500MB database, 1GB file storage, 50,000 monthly API requests, 2 Edge Function instances
- Pro plan is $25/month when you outgrow free — by which point you have hundreds of paying users
- Postgres is the most reliable, battle-tested open source database in existence
- Supabase is GDPR-compliant out of the box (you can choose EU data region)
- No vendor lock-in — it's standard Postgres, you can migrate anywhere

**Free tier limits in context:**
- 500MB database: A job entry is ~500 bytes. 500MB = 1,000,000 job entries. You will not hit this.
- 1GB file storage: Average CV PDF is ~500KB. 1GB = 2,000 CVs. You'll hit this with ~600 Pro users storing 3 CVs each. That's when you upgrade to $25/month — well within profit.
- 50,000 API requests/month: Each sync of a job is 1 request. A Pro user saving 10 jobs and updating them 5 times each = 150 requests/month. 50,000 ÷ 150 = ~330 Pro users before you upgrade. Manageable.

### Database Schema

```sql
-- Users and subscriptions
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  paddle_customer_id TEXT,
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

-- Jobs (synced from extension for Pro users)
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,           -- same ID as in chrome.storage
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT,
  url TEXT,
  status TEXT DEFAULT 'saved',
  cv_id TEXT,
  emailed BOOLEAN DEFAULT false,
  notes TEXT,
  saved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  status_history JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- CV metadata (file is in Supabase Storage)
CREATE TABLE cvs (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  filename TEXT,
  storage_path TEXT,             -- path in Supabase Storage bucket
  uploaded_at TIMESTAMPTZ,
  size_bytes INTEGER
);

-- Templates
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  subject TEXT,
  body TEXT,
  is_shared BOOLEAN DEFAULT false,   -- true = pushed by team admin
  team_id UUID
);

-- Snippets
CREATE TABLE snippets (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  label TEXT,
  content TEXT,
  is_shared BOOLEAN DEFAULT false,
  team_id UUID
);

-- AI usage tracking
CREATE TABLE ai_usage (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  month TEXT,    -- "2026-04"
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- Teams (Team plan)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  admin_id UUID REFERENCES users(id),
  plan TEXT DEFAULT 'team_5',    -- 'team_5' | 'team_15'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reminders
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ,
  note TEXT,
  fired BOOLEAN DEFAULT false
);
```

**Row Level Security (RLS):** Supabase lets you add policies so that users can only read and write their own rows. A user cannot access another user's jobs, even if they know the ID. This is set at the database level — not just the application level.

```sql
-- Example RLS policy on jobs table
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own jobs"
  ON jobs FOR ALL
  USING (user_id = auth.uid());
```

### Authentication

**How it works:** When a user clicks "Upgrade" or "Sign In" in the Pro version, the extension calls `chrome.identity.getAuthToken()`, which triggers a Google OAuth popup. The user signs in with Google. Chrome returns an OAuth token. The extension passes that token to Supabase Auth, which validates it with Google and creates/retrieves the user's account. From that point, all API calls include the user's session token automatically.

**The user never types a username or password.** It's one click with their Google account. No email confirmation, no password reset flows to build.

```js
// In the extension
const token = await chrome.identity.getAuthToken({ interactive: true });
const { data, error } = await supabase.auth.signInWithIdToken({
  provider: 'google',
  token: token
});
```

### File Storage (CVs)

Supabase Storage works like a simple file system. Each CV is stored at a path like `cvs/{user_id}/{cv_id}.pdf`. The extension uploads the file once when the user first connects to Pro. After that, it only needs the path to retrieve it.

```js
// Upload
const { data } = await supabase.storage
  .from('cvs')
  .upload(`${userId}/${cvId}.pdf`, fileBlob);

// Retrieve (generates a temporary URL valid for 60 seconds)
const { data } = await supabase.storage
  .from('cvs')
  .createSignedUrl(`${userId}/${cvId}.pdf`, 60);
```

### Edge Functions

Supabase Edge Functions are small serverless JavaScript functions that run on Supabase's infrastructure. They run on-demand, cost nothing on the free tier, and are the only place your API keys (Anthropic, Paddle) should ever exist.

You'll need two Edge Functions:
1. `ai-generate` — receives AI requests from the extension, validates Pro status, calls Claude, returns result
2. `payment-webhook` — receives subscription events from Paddle, updates user plan in the database

---

## 6. Local Storage Architecture

### Two Storage Systems, Two Different Jobs

**`chrome.storage.local`** — Chrome's key-value store for extension data. Think of it as a small notebook the extension can write to. Limit: 10MB total. Survives browser restarts. Does NOT survive Chrome uninstall or profile wipe. Synchronous-ish access with a callback/promise API.

**`IndexedDB`** — The browser's built-in database for larger data. Think of it as a proper filing cabinet. No meaningful size limit (browsers allow gigabytes). Also survives browser restarts but NOT Chrome uninstall. Accessed via an async API.

### What Goes Where

| Data | Storage | Why |
|---|---|---|
| Job objects | `chrome.storage.local` | Small (~500 bytes each), fast access, fits thousands |
| Templates | `chrome.storage.local` | Small text, fast access |
| Snippets | `chrome.storage.local` | Small text, fast access |
| CV metadata (name, filename, id) | `chrome.storage.local` | Tiny, needs to be listed quickly in the popup |
| CV file data (the actual PDF) | `IndexedDB` | Can be megabytes — wrong place for chrome.storage |
| User session / Pro status | `chrome.storage.local` | Needs fast access on every popup open |

### Why This Matters (The 10MB Problem)

A single PDF in the format the current code uses (base64 encoded) is 1.5–2.7MB. `chrome.storage.local` has a 10MB **total** limit across everything. Three CVs stored in the current way = 4.5–8.1MB, leaving almost nothing for the rest. The fourth CV save silently fails — no error, no warning, the user just loses their data.

Moving CV files to IndexedDB is not a Pro feature. It's a correctness fix that must happen before launch.

### IndexedDB Access Pattern

```js
// Open the database (done once on startup)
function openCVStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('HireTrackCVs', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e);
  });
}

// Store a CV file
async function saveCVFile(id, blob) {
  const db = await openCVStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id, blob });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// Retrieve a CV file
async function getCVFile(id) {
  const db = await openCVStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = reject;
  });
}
```

---

## 7. Open Source and Code Protection

### The Position: Open Source with Non-Commercial License

The code is visible to any user who installs the extension regardless. Chrome extensions are just files on the user's computer. GitHub makes it easier to find, which benefits you (trust, contributions, stars) without actually giving up anything you weren't already giving up.

**License: Business Source License (BSL 1.1)**
- Anyone can read, run, fork, and modify the code
- Anyone can contribute improvements back
- **No one can use the code commercially** (resell it, build a product on it, white-label it) without your written permission
- After 4 years, it converts to MIT (standard open source) — this is the BSL design
- You retain all commercial rights
- Free to host on GitHub

**What this means practically:** Someone can fork HireTrack, add features for personal use, and share their fork for free. They cannot launch "HireTrack Pro Clone" and charge for it. The clause that matters is commercial use, and BSL makes that a legally enforceable restriction.

**Minification for Web Store builds:**
Run the published `.js` files through Terser before submitting to the Chrome Web Store. This changes variable names to `a`, `b`, `c` and removes all comments and whitespace. It doesn't make the code unreadable forever, but it stops casual copying and makes it clear the GitHub version is the canonical one.

---

## 8. Distribution and Growth

### Pre-Launch (Before Publishing)
- Chrome Web Store listing: Keywords — "job tracker", "application tracker", "kanban job search", "free job tracker chrome extension", "suivi de candidatures", "تتبع الوظائف". Screenshots of the dark Kanban board. Honest description.
- GitHub repo: BSL license, README with screenshots and install instructions, clear contribution guide.
- Privacy policy: Single paragraph on GitHub Pages. Required by Chrome Web Store. "All data stored on your device. Nothing collected. Nothing sent anywhere."

### Launch Week
- **Product Hunt:** Post Tuesday–Thursday. Tell the real story ("I was applying to 40 jobs and losing track"). Your network drives the first two hours of upvotes. After that the Product Hunt feed takes over.
- **Reddit — story-first format:** r/jobs, r/cscareerquestions, r/Morocco, r/digitalnomad, r/remotework. 2–3 paragraphs of the problem and story before the link. Posts that lead with a link get removed by moderators or ignored. Posts that tell a human story get upvoted and stay up.
- **LinkedIn + X/Twitter:** One post with the Kanban screenshot. Hashtags: `#buildinpublic` `#jobsearch` `#chrome` `#opensource`. Tag 3–5 career coaches. One reshare from a coach with 5,000 followers reaches exactly the right audience.
- **Facebook / WhatsApp / Telegram:** Moroccan developer groups, expat communities, French job seeker groups. These communities are large, active, and underserved by English-language tools. This is a genuine advantage — use it.

### Month 2+
- YouTube Shorts / TikTok: 30-second screen recording. "I track 50 job applications for free with this Chrome extension." This format spreads without an existing audience.
- Dev.to / Hashnode article: "How I built a multilingual job detection engine for a Chrome extension." Developers read this, share it, star the repo.
- Reply to every Chrome Web Store review. Every one. Publicly, specifically. People read the replies before installing. A developer who responds is a developer whose extension will still work next year.
- Direct message to career bloggers: "I made a free tool your readers might find useful." Short, no pressure. Free tools are easy to recommend.

### Growth Milestones
| Users | How you get there |
|---|---|
| 0 → 100 | Personal network + the first Reddit post that lands |
| 100 → 1,000 | Word of mouth, Reddit karma from genuine posts, GitHub stars |
| 1,000 → 10,000 | One YouTuber, one blogger, or a Chrome Web Store editorial feature |
| 10,000+ | Network effects, brand, possibly press |

---

## 9. Legal and Compliance

| Topic | What to do | Cost |
|---|---|---|
| Chrome Web Store privacy policy | One paragraph on GitHub Pages: "Data stored locally only. Nothing collected." | $0 |
| Pro privacy policy addition | Add one sentence: "Pro users' data syncs to a secure cloud database and can be deleted on request." | $0 |
| GDPR (European users) | Free tier: exempt — no server processing. Pro tier: Supabase is GDPR-compliant. Choose EU data region in Supabase settings. | $0 |
| Morocco loi 09-08 | Free tier: no personal data leaves device, exempt. Pro tier: you become a data processor — keep data in EU region, allow deletion requests. | $0 |
| GitHub open source license | Business Source License 1.1 (BSL). Copy the template from mariadb.com/bsl11. | $0 |
| Trademark search | Search "HireTrack" on Google + WIPO trademark database (wipogold.wipo.int). 10 minutes. | $0 |
| Chrome Web Store permissions disclosure | In your Store listing, explain why you need `activeTab`, `scripting`, `tabs`, `alarms`. One sentence each. | $0 |
| Payment taxes (Pro/Team) | Paddle and Lemon Squeezy handle VAT/sales tax collection automatically as Merchant of Record. You receive net amount. | $0 extra |

---

## 10. Full Tech Stack and Cost Model

### Free Tier
| Layer | Technology | Cost |
|---|---|---|
| Job/template/snippet storage | `chrome.storage.local` | $0 |
| CV file storage | `IndexedDB` (browser built-in) | $0 |
| Reminders | `chrome.alarms` (Chrome built-in) | $0 |
| Fonts | Google Fonts CDN | $0 |
| Extension hosting | None (runs locally) | $0 |
| Distribution | Chrome Web Store (one-time) | $5 |
| Code hosting | GitHub | $0 |
| Privacy policy hosting | GitHub Pages | $0 |

**Total recurring cost: $0/month. One-time cost: $5.**

### Pro Tier (added on top of Free)
| Layer | Technology | Cost | Threshold |
|---|---|---|---|
| Cloud database | Supabase Postgres | $0 → $25/month | Free until ~500 Pro users |
| CV cloud storage | Supabase Storage | Included in Supabase plan | — |
| Authentication | Supabase Auth + `chrome.identity` | $0 | Always free |
| Serverless functions | Supabase Edge Functions | $0 | Free tier: 2M invocations/month |
| AI model | Claude Haiku (Anthropic API) | ~$0.001/request | ~$0.02/Pro user/month |
| Payment processing | Paddle or Lemon Squeezy | ~5% per transaction | Only when revenue exists |

**Monthly cost at 100 Pro users:** ~$2 (AI) + $0 (Supabase free) = **$2/month**
**Monthly revenue at 100 Pro users:** ~$400/month
**Monthly cost at 500 Pro users:** ~$10 (AI) + $25 (Supabase Pro) = **$35/month**
**Monthly revenue at 500 Pro users:** ~$2,000/month

### The Rule: Never pay before you earn
Supabase free tier holds until ~400 Pro users. Anthropic charges only when requests happen. Paddle charges only when payments happen. The infrastructure cost curve is completely flat until you have real revenue — then it's still tiny relative to what you're making.

---

## 11. Roadmap

### Phase 1 — Fix and Ship (Weeks 1–2)
All bugs from the Reforms document fixed. Extension published to Chrome Web Store. GitHub repo open.

### Phase 2 — Traction (Weeks 3–8)
Product Hunt. Reddit. LinkedIn. Community outreach. Respond to everything. Aim: 100 real users and honest feedback.

### Phase 3 — Polish (Months 2–3)
Auto-extraction via `content.js`. CV preview. Keyboard shortcuts. Dark/light mode toggle. Aim: 500 active users.

### Phase 4 — Pro Launch (Months 3–5, only after 300+ active free users)
Supabase setup. Google Auth. Cloud sync. CV backup. Stripe/Paddle integration. AI writing tools. Analytics. Upgrade prompts at limits. Aim: first 50 paying Pro users.

### Phase 5 — Team Plan (Month 6+, only after 50+ Pro subscribers)
Admin dashboard. Shared resources. Team job board. Cohort export. Outreach to career coaches and universities.

### Phase 6 — Scale (Month 9+)
Firefox port. Sponsored job board integrations at 5,000+ users.
