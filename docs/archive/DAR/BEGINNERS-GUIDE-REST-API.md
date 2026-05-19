# What Is a Versioned REST API? — Explained From Zero
## Understanding the Platform's API Structure for Someone Starting From Scratch

---

## Start Here: What Is an API?

Before anything else, we need to understand what an API is — because the REST API is the backbone of how every part of the BIM platform communicates.

### The restaurant analogy

Imagine you are in a restaurant.

- You (the customer) want food.
- The kitchen has the food and the ability to make it.
- You cannot walk into the kitchen and cook it yourself.
- Instead, there is a **waiter** who takes your order, brings it to the kitchen, and returns with your food.

An **API** (Application Programming Interface) is the waiter.

It is a defined set of requests you are allowed to make ("I would like the pasta"), the format those requests must be in ("please order from this menu, not freestyle"), and the responses you will get back ("here is your pasta" or "sorry, we are out of pasta").

In software:
- **You** are a client — a user's browser, a mobile app, a third-party integration
- **The kitchen** is the server — where the data lives and the business logic runs
- **The waiter** is the API — a set of defined endpoints you can call

Without an API, clients would need direct access to the database, which would be like letting restaurant customers walk into the kitchen and cook their own food. Chaotic, unsafe, and unmanageable.

---

## Chapter 1: What Is REST?

REST stands for **Representational State Transfer**. It is a set of conventions for how APIs should be designed.

The key idea: **everything is a resource, and you perform actions on resources using standard verbs.**

### Resources

A resource is a thing the system knows about. In the BIM platform:

| Resource | What it is |
|---|---|
| Project | A building project with a name, owner, and model |
| Element | A single BIM object: a wall, a column, a door |
| Member | A person who has access to a project |
| Version | A saved snapshot of a project at a point in time |
| Plugin | A software extension that adds features to the platform |
| AI Workflow | A task the AI is running (like critiquing a floor plan) |

Each resource has an **address** — called a URL (Uniform Resource Locator). You already know URLs: `https://www.google.com` is a URL. In an API, URLs identify resources:

```
https://platform.dar.com/api/v1/projects/abc-123
                                  ↑         ↑
                              the path    the specific project
```

### Verbs

REST uses the same verbs (called HTTP methods) for every kind of resource:

| Verb | What it does | Real-world equivalent |
|---|---|---|
| `GET` | Retrieve a resource or list | Reading a page in a book |
| `POST` | Create a new resource | Submitting a form |
| `PUT` | Replace an entire resource | Rewriting a page entirely |
| `PATCH` | Update part of a resource | Correcting one sentence on a page |
| `DELETE` | Remove a resource | Tearing out a page |

These verbs are not specific to this platform — they are standard across the entire internet. Every API you have ever used (Google Maps, Spotify, Instagram) uses these same verbs.

### A complete example

To get the details of project number `abc-123`:
```
GET https://platform.dar.com/api/v1/projects/abc-123
```

The server responds with something like:
```json
{
  "id": "abc-123",
  "name": "DAR - Riyadh Metro Extension",
  "created_at": "2025-01-15T09:00:00Z",
  "owner": { "id": "user-456", "name": "Ahmed Al-Rashid" },
  "state": "shared"
}
```

To create a new project:
```
POST https://platform.dar.com/api/v1/projects
Body: { "name": "DAR - New Hospital Wing" }
```

The server creates the project and responds with the new project's data including the ID it assigned to it.

---

## Chapter 2: What Does "Versioned" Mean? The `/v1/` in the URL

Look at every API URL in the platform — they all contain `/v1/` or `/api/v1/`:

```
/api/v1/projects
/api/v1/elements
/v1/ai/
```

This is called **API versioning**, and it solves a practical problem.

### The problem versioning solves

Imagine the platform is live and thousands of engineers are using it. Their tools (browser extensions, Revit add-ins, custom scripts) are making API calls and expecting specific responses.

Now the development team needs to change something — maybe the response format for a project needs to change, or a field needs to be renamed. If they just change it, every existing tool breaks immediately. All those engineers get errors.

**API versioning** solves this by giving each major version of the API its own address:

- `https://platform.dar.com/api/v1/projects` — the first version of the API
- `https://platform.dar.com/api/v2/projects` — a future version with breaking changes

When the team releases version 2, all old tools still work because they are calling `/api/v1/`. New tools can use `/api/v2/`. Both versions run simultaneously. Old tools are given a 12-month deprecation notice before `/api/v1/` is shut down.

This is standard practice. Every major platform API you have ever used — Stripe, Twilio, Salesforce — uses versioned URLs for exactly this reason.

In practice, most BIM platform work will stay on `/v1/` for years. The versioning is insurance, not something that changes frequently.

---

## Chapter 3: The Platform's Specific API Routes

Now let's go through each API route the platform exposes and explain what it does and why it exists as a separate path.

### Route 1: `/api/v1/` — The Core API

```
GET    /api/v1/projects               → list all my projects
POST   /api/v1/projects               → create a new project
GET    /api/v1/projects/{id}          → get one project's details
PATCH  /api/v1/projects/{id}          → update project name/settings
DELETE /api/v1/projects/{id}          → delete a project

GET    /api/v1/projects/{id}/elements → list all elements in a project
POST   /api/v1/projects/{id}/elements → create a new element
GET    /api/v1/projects/{id}/elements/{eid} → get one element
PATCH  /api/v1/projects/{id}/elements/{eid} → update element properties

GET    /api/v1/projects/{id}/members  → list who has access to a project
POST   /api/v1/projects/{id}/members  → invite someone to a project
PATCH  /api/v1/projects/{id}/members/{uid} → change someone's role
DELETE /api/v1/projects/{id}/members/{uid} → remove someone's access
```

This is the standard CRUD layer. CRUD stands for **Create, Read, Update, Delete** — the four operations you can perform on any piece of data.

**Why it requires authentication:** Every request to `/api/v1/` must include an identity token (called a JWT — more on this later). The server reads this token, identifies the user, looks up their role on the relevant project, and checks whether they are allowed to do what they are asking to do.

A viewer-level user can `GET` (read) project data but cannot `DELETE` or `POST` (write). An Appointing Party can do everything. This is enforced at the API level, not in the browser — a user cannot bypass it by modifying their browser.

**Why it has both `/api/` and `/v1/`:** The `/api/` prefix separates the API routes from the website routes (the React frontend). When a browser visits `https://platform.dar.com/`, it gets the web application. When it visits `https://platform.dar.com/api/v1/projects`, it gets structured data. The `/api/` prefix makes this distinction clear.

---

### Route 2: `/api/v1/families` — The Plugin and Family Marketplace

```
GET  /api/v1/families                → list available plugins and component families
GET  /api/v1/families/{publisher}/{slug} → get details of one plugin
POST /api/v1/families/{publisher}/{slug}/versions → publish a new version of a plugin
```

**What is a "family" in BIM?**

In BIM terminology (particularly Revit), a "family" is a reusable component definition. A door family defines the geometry, parameters, and behaviour of a type of door — once defined, it can be placed hundreds of times in the model. A window family, a column family, a structural bolt family — all are examples.

In the platform's context, this route covers both:
- **Component families:** Reusable BIM element definitions (parametric doors, custom column profiles, specific beam types used on DAR projects)
- **Plugins:** Software extensions that add features to the platform (a clash detection tool, a custom report generator, a site analysis overlay)

**Why this is a separate route from `/api/v1/`:**

The marketplace is a distinct system from project data. Projects belong to users and organizations — they are private. The marketplace is a catalogue — it can be read by anyone and is published to by vetted plugin developers. These are different access control models, so they are different routes.

The marketplace API includes publisher authentication: to publish a plugin, you must be a verified publisher. When a plugin is published, the server checks its cryptographic signature to ensure it has not been tampered with. This security model is separate from the project access control model.

---

### Route 3: `/v1/ai/` — The AI Public API

```
POST /v1/ai/invoke      → start an AI workflow (returns immediately with a job ID)
GET  /v1/ai/runs/{id}  → check the status of an AI job
GET  /v1/ai/usage      → see how many AI credits you have used this month
```

**Notice this is `/v1/ai/` not `/api/v1/ai/` — what is the difference?**

The AI API is intentionally separated from the main API for several reasons:

1. **Different rate limiting.** Regular API calls (reading project data) can be fast and cheap. AI calls are slow (an LLM takes 2–30 seconds) and expensive (each call costs money in LLM API fees). The AI route has a much stricter rate limiter: 20 requests per 15 minutes per user, versus 60 requests per minute for the regular API.

2. **Different metering.** Every AI call is metered — it records how many tokens were used, the cost in USD, the model used, and the workflow type. This creates an audit trail and enables cost attribution per project, per user, and per workflow. This infrastructure only exists on the AI route.

3. **Different latency expectations.** A `GET /api/v1/projects` should respond in under 100 milliseconds. A `POST /v1/ai/invoke` may take 30 seconds. Different routes can be configured with different timeout settings.

4. **Future separation.** As the platform grows, the AI layer may become its own independent service — a separate server dedicated to AI processing. Giving it its own URL prefix (`/v1/ai/`) means this extraction can happen without changing any client code.

**How the AI API works in practice:**

Unlike regular API calls where you get the result immediately, AI jobs are **asynchronous** — they take time, so the response is deferred.

Step 1: Start an AI job
```
POST /v1/ai/invoke
Body: {
  "workflow": "plan-critique",
  "projectId": "abc-123",
  "prompt": "Review the fire egress paths on level 3"
}

Response (immediate, within 200ms):
{
  "runId": "ai-run-789",
  "status": "queued"
}
```

Step 2: Wait for completion (the browser listens on a WebSocket connection rather than polling)
```
WebSocket event received:
{
  "type": "ai-workflow-complete",
  "runId": "ai-run-789",
  "result": {
    "issues": [
      { "severity": "high", "description": "Corridor width below minimum", "element": "corridor-45" },
      { "severity": "medium", "description": "Dead-end exceeds 9m", "element": "corridor-67" }
    ]
  }
}
```

This pattern — start a job, get an ID back immediately, receive the result via a separate channel — is called an **asynchronous job pattern**. It is used for any operation that takes more than a second or two, because browsers time out on slow HTTP requests.

**Why does it require auth AND quota checks?**

Auth (authentication) answers: "Who are you?"
Quota answers: "Are you allowed to do this many AI calls this month?"

Both checks happen before the AI call is made:
- If you are not logged in → rejected immediately with "not authenticated"
- If you are logged in but on the free plan and have used your 10 AI calls for the month → rejected with "quota exceeded"
- If you are authenticated and have quota remaining → the call proceeds, the cost is recorded, quota is decremented

This ensures no one accidentally runs up a £50,000 AI bill — and ensures costs are fairly attributed across the organization.

---

### Route 4: `/api/stripe/` — Payment Webhooks

```
POST /api/stripe/webhook  → Stripe sends payment events to this address
```

**This route is fundamentally different from the others.** It is not called by users or by the frontend application. It is called by **Stripe** — the payment processing company — to notify the platform when payment events happen.

### What is a webhook?

A regular API call: You ask for something, you get a response.
```
You → Server: "Get me project abc-123"
Server → You: { project data }
```

A webhook: Something happens externally, and the external system notifies you automatically.
```
Stripe → Platform server: "User xyz just paid for a Pro subscription"
Platform server: Updates the user's plan in the database
Stripe: (waiting for acknowledgement)
Platform server → Stripe: "Got it, thank you"
```

Webhooks are how the platform knows when:
- A payment succeeds → upgrade the user's plan
- A subscription is cancelled → downgrade the user's access
- A payment fails → warn the user and eventually suspend the account
- A refund is issued → record it

**Why is this at `/api/stripe/webhook` instead of `/api/v1/stripe/webhook`?**

Because Stripe calls this address, not the platform's own code. Stripe is told "send events to `https://platform.dar.com/api/stripe/webhook`" when the payment integration is configured. Once Stripe is configured, that URL cannot easily be changed without reconfiguring Stripe. Putting it outside the versioned `/v1/` path means the payment webhook URL is stable forever — it never needs to change even if the rest of the API is upgraded to v2.

**Why does this route not require user authentication?**

Because the request comes from Stripe, not from a user. Instead of a user JWT token, Stripe signs its webhook requests with a secret key. The platform verifies this signature to ensure the request genuinely came from Stripe and not from someone pretending to be Stripe. This is a different authentication mechanism than user authentication — designed for machine-to-machine communication rather than human-to-machine.

---

## Chapter 4: Authentication — How the API Knows Who You Are

Every request to `/api/v1/` and `/v1/ai/` must prove who you are. The mechanism is called a **JWT (JSON Web Token)**.

### What a JWT is

When you log into the platform (email + password, or Google/Microsoft sign-in), the server creates a JWT — a digitally signed piece of data that says:

```
"This token was issued by the platform at 2:00 PM on May 6, 2026.
 It certifies that the bearer is Alice Müller (user ID: user-123, email: alice@dar.com).
 This token expires at 2:00 PM on June 5, 2026.
 Signed by the server's secret key."
```

This token is given to Alice's browser and stored there. Every subsequent API request includes this token in a header:

```
GET /api/v1/projects
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoiYWxpY2VAZGFyLmNvbSJ9...
```

The server reads this token, verifies the digital signature (to ensure it has not been tampered with), checks it has not expired, and knows the request is from Alice.

**Key point:** The token is self-contained. The server does not need to query the database to verify the token — it just checks the signature. This makes authentication fast.

**What the token does NOT contain:** The token does not contain Alice's role (Viewer, Team Member, Appointing Party). Roles are looked up from the database on every request. This is intentional — if Alice is promoted from Viewer to Appointing Party, her existing token immediately reflects the new role (because the role comes from the database, not the token). If roles were in the token, she would need to log out and back in.

---

## Chapter 5: How All the Routes Work Together in Practice

Let's trace a realistic workflow — an engineer arriving at work and critiquing a floor plan with AI.

**Step 1:** Engineer opens the browser, goes to `platform.dar.com`
→ Browser downloads the React application (HTML, CSS, JavaScript)

**Step 2:** Engineer logs in
→ `POST /api/auth/signin` with email + password
→ Server responds with a JWT token
→ Browser stores the token

**Step 3:** Application loads the engineer's projects
→ `GET /api/v1/projects` (with JWT in header)
→ Server returns list of projects the engineer has access to

**Step 4:** Engineer opens a project
→ `GET /api/v1/projects/abc-123` (project metadata)
→ WebSocket connection established to sync server (Yjs CRDT — not the REST API)
→ Yjs syncs the live building model

**Step 5:** Engineer wants the AI to critique egress paths
→ `POST /v1/ai/invoke` with the workflow type and project context
→ Server checks authentication (valid JWT) ✓
→ Server checks quota (5 of 50 monthly calls used) ✓
→ Server enqueues the AI job, returns `{ runId: "ai-run-789" }`
→ Engineer continues working while AI runs in background

**Step 6:** AI completes
→ Server sends a WebSocket message to the engineer's browser with the results
→ Browser displays the AI critique results, highlighting affected elements in 3D

**Step 7 (background, not triggered by user):** DAR's subscription renews
→ Stripe sends `POST /api/stripe/webhook` with event type `invoice.paid`
→ Platform records the successful payment, renews the enterprise subscription

---

## Summary

| Route | Who calls it | What it does | Auth type |
|---|---|---|---|
| `/api/v1/` | The browser / user's tools | CRUD on projects, elements, members | JWT (user identity) |
| `/api/v1/families` | The browser / plugin developers | Plugin marketplace and BIM families | JWT (for writing); open for reading |
| `/v1/ai/` | The browser | AI workflows with metering and quotas | JWT + quota check |
| `/api/stripe/` | Stripe (a company) | Payment event notifications | Stripe signature (not JWT) |

The routes are not organized by technical category — they are organized by **who is calling them**, **what rate limits apply**, and **what authentication model is appropriate**. Each route is a distinct contract with a distinct audience.

---

*Document written for non-technical readers as a primer on REST API design in the context of the DAR enterprise BIM platform.*
