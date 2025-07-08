// @ts-nocheck
import { randomUUID } from "crypto";
import { Database } from "bun:sqlite";
import path from "path";
import Stripe from "stripe";
import { sendEmail as sendEmailSES } from "./email";

// Expect Stripe keys in .env (Bun automatically loads this file)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY) {
  throw new Error("Stripe keys missing. Please set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in your environment (.env file)");
}

// Initialise Stripe SDK
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

// Persistent SQLite database for purchases & download logs
const db = new Database(path.join(import.meta.dir, "purchases.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS purchases (
    customer_id TEXT PRIMARY KEY,
    email TEXT,
    token TEXT NOT NULL UNIQUE,
    ip TEXT,
    user_agent TEXT,
    claimed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT,
    customer_id TEXT,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    downloaded_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS redeem_links (
    token TEXT PRIMARY KEY,
    purchase_token TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    claimed INTEGER DEFAULT 0
  );
`);

// Ensure new column exists for legacy DBs
try { db.exec("ALTER TABLE redeem_links ADD COLUMN purchase_token TEXT"); } catch (_) {}

// 24 h validity for tokens & session cookies (in seconds)
const TOKEN_TTL = 60 * 60 * 24;

function getOrCreateToken(customerId: string, email: string | null, ip: string | null, ua: string | null): string {
  const now = Math.floor(Date.now() / 1000);
  const row = db
    .query<{ token: string; created_at: number }>(
      "SELECT token, created_at FROM purchases WHERE customer_id = ?",
    )
    .get(customerId);

  // If a non-expired token already exists, reuse it and just update contact details
  if (row && now - row.created_at < TOKEN_TTL) {
    db.run(
      "UPDATE purchases SET email = COALESCE(email, ?), ip = COALESCE(ip, ?), user_agent = COALESCE(user_agent, ?) WHERE customer_id = ?",
      email,
      ip,
      ua,
      customerId,
    );
    return row.token;
  }

  // Otherwise create (or replace) a fresh token that will be valid for the next 24 h
  const token = randomUUID();
  db.run(
    "INSERT OR REPLACE INTO purchases (customer_id, email, token, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, strftime('%s','now'))",
    customerId,
    email,
    token,
    ip,
    ua,
  );
  return token;
}

function tokenIsValid(rawToken: string): boolean {
  const token = decodeURIComponent(rawToken.trim());
  const row = db
    .query<{ created_at: number }>("SELECT created_at FROM purchases WHERE token = ?")
    .get(token);
  if (!row) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - row.created_at <= TOKEN_TTL;
}

function recordDownload(token: string, ip: string | null, ua: string | null) {
  const purchase = db.query<{ customer_id: string; email: string }>("SELECT customer_id, email FROM purchases WHERE token = ?").get(token);
  db.run(
    "INSERT INTO downloads (token, customer_id, email, ip, user_agent) VALUES (?, ?, ?, ?, ?)",
    token,
    purchase?.customer_id ?? null,
    purchase?.email ?? null,
    ip,
    ua,
  );
}

// Mock executable to download – replace with real path when available
const DOWNLOAD_PATH = path.join(import.meta.dir, "dbpill.zip");
const DOWNLOAD_PATHS = {
  mac: path.join(import.meta.dir, "dbpill-mac.zip"),
  "linux-x86": path.join(import.meta.dir, "dbpill-linux-x86.zip"),
  "linux-aarch64": path.join(import.meta.dir, "dbpill-linux-aarch64.zip"),
  windows: path.join(import.meta.dir, "dbpill-windows.zip"),
} as const;

function notFound() {
  return new Response("Not found", { status: 404 });
}

// Parse a named cookie out of the request
function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const [k, v] = c.trim().split("=");
    if (k === name) return decodeURIComponent(v ?? "");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Re-use common HTML layout (head, header, footer) extracted once from index.html
// so that other pages (e.g. downloads.html) don't have to redefine them.
// ---------------------------------------------------------------------------
const INDEX_HTML_PATH = path.join(import.meta.dir, "client", "index.html");
// Lazily-initialised cache for the extracted layout fragments
let HEAD_HTML: string | null = null;
let HEADER_HTML: string | null = null;
let FOOTER_HTML: string | null = null;
let POST_FOOTER_HTML: string | null = null;

async function ensureLayoutLoaded() {
  if (HEAD_HTML && HEADER_HTML && FOOTER_HTML && POST_FOOTER_HTML) return;
  const indexHtml = await Bun.file(INDEX_HTML_PATH).text();

  // Extract <head>…</head>
  HEAD_HTML = (indexHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i) || [""])[0];
  // Extract the visual site header (section with class="header")
  HEADER_HTML = (indexHtml.match(/<section[^>]*class=["'][^"']*header[^"']*["'][^>]*>[\s\S]*?<\/section>/i) || [""])[0];
  // Extract <footer>…</footer>
  FOOTER_HTML = (indexHtml.match(/<footer[\s\S]*?<\/footer>/i) || [""])[0];
  // Anything that comes after </footer> (scripts & closing tags)
  const splitFooter = indexHtml.split(/<\/footer>/i);
  POST_FOOTER_HTML = splitFooter.length > 1 ? splitFooter[1] : "";
}

function renderWithLayout(content: string): string {
  if (!HEAD_HTML || !HEADER_HTML || !FOOTER_HTML || !POST_FOOTER_HTML) {
    throw new Error("Layout not loaded – call ensureLayoutLoaded() first");
  }
  let html = `<!doctype html>
<html lang="en">
${HEAD_HTML}
<body>
${HEADER_HTML}
<main>
${content}
</main>
${FOOTER_HTML}${POST_FOOTER_HTML}`;
  // Inject publishable key placeholder (present in index.html script block)
  html = html.replace(/__STRIPE_PUBLISHABLE_KEY__/g, STRIPE_PUBLISHABLE_KEY);
  return html;
}

// ---------------------------------------------------------------------------
// Email sending placeholder – replace with real implementation later
// ---------------------------------------------------------------------------
function sendEmail(to: string, subject: string, body: string) {
  return sendEmailSES(to, subject, body);
}

// ---------------------------------------------------------------------------
// Helper: create a single-use redeem link token tied to a purchase token
// ---------------------------------------------------------------------------
function createRedeemToken(purchaseToken: string): string {
  // Invalidate any existing redeem links for this purchase token
  db.run("UPDATE redeem_links SET claimed = 1 WHERE purchase_token = ?", purchaseToken);

  const token = randomUUID();
  db.run(
    "INSERT INTO redeem_links (token, purchase_token) VALUES (?, ?)",
    token,
    purchaseToken,
  );
  return token;
}

function redeemTokenIsValid(token: string): boolean {
  const row = db
    .query<{ created_at: number; claimed: number }>(
      "SELECT created_at, claimed FROM redeem_links WHERE token = ?",
    )
    .get(token);
  if (!row) return false;
  if (Number(row.claimed) === 1) return false;
  const now = Math.floor(Date.now() / 1000);
  return now - row.created_at <= TOKEN_TTL;
}

const port = Number(process.env.PORT || 3001);
Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // --- API: Create Checkout Session ------------------------------------
    if (req.method === "POST" && url.pathname === "/create-checkout-session") {
      // --------------------------------------------------------------
      // 1) If this browser already owns the product (valid cookie) skip checkout
      // --------------------------------------------------------------
      const existingToken = getCookie(req, "download_token");
      if (existingToken && tokenIsValid(existingToken)) {
        return new Response(JSON.stringify({ alreadyOwned: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const host = url.origin; // e.g. http://localhost:3000

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 10000, // $100.00 in cents
              product_data: { name: "dbpill standalone executable" },
            },
            quantity: 1,
          },
        ],
        success_url: `${host}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${host}/cancel`,
      });

      // Persist a cookie that ties this browser to the Stripe session
      const headers = {
        "Content-Type": "application/json",
        "Set-Cookie": `checkout_session_id=${session.id}; Max-Age=${TOKEN_TTL}; Path=/; HttpOnly; SameSite=Lax`,
      } as const;
      return new Response(JSON.stringify({ id: session.id }), { headers });
    }

    // --- Success page after Stripe checkout ------------------------------
    if (url.pathname === "/success") {
      const sessionId = url.searchParams.get("session_id");
      if (!sessionId) return new Response("Missing session ID", { status: 400 });

      // Check that the browser previously initiated this checkout session
      const cookieSessionId = getCookie(req, "checkout_session_id");
      if (cookieSessionId !== sessionId) {
        return new Response("Invalid session context. Please start checkout from this browser.", { status: 403 });
      }

      // Verify payment on server side
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        return new Response("Payment not completed", { status: 400 });
      }

      // Mark as consumed so the link can't be used again later
      const customerId = session.customer as string; // guaranteed because we request payment details
      const email = (session.customer_details && session.customer_details.email) ? session.customer_details.email : null;
      const ip = req.headers.get("x-forwarded-for") || null;
      const ua = req.headers.get("user-agent") || null;
      const token = getOrCreateToken(customerId, email, ip, ua);

      // Build downloads page using shared layout (header, footer, etc.)
      await ensureLayoutLoaded();

      const downloadPagePath = path.join(import.meta.dir, "client", "downloads.html");
      const rawDownloadsHtml = await Bun.file(downloadPagePath).text();
      // Grab only the inner <body>… content from downloads.html
      const bodyMatch = rawDownloadsHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let downloadsContent = bodyMatch ? bodyMatch[1].trim() : rawDownloadsHtml;
      downloadsContent = downloadsContent.replace(/__PURCHASE_EMAIL__/g, email ?? "your email");

      const finalHtml = renderWithLayout(downloadsContent);

      const headers = {
        "Content-Type": "text/html",
        // Session cookie restricted to this browser, expires after 24 h
        "Set-Cookie": `download_token=${token}; Max-Age=${TOKEN_TTL}; Path=/; HttpOnly; SameSite=Strict`,
      } as const;
      return new Response(finalHtml, { headers });
    }

    // --- Protected download route (cookie-only) ---------------------------
    if (url.pathname === "/download") {
      const token = getCookie(req, "download_token");
      if (!token) return new Response("Unauthorized", { status: 403 });
      if (!tokenIsValid(token)) return new Response("Invalid or expired download link", { status: 404 });
      const ip = req.headers.get("x-forwarded-for") || null;
      const ua = req.headers.get("user-agent") || null;
      recordDownload(token, ip, ua);

      const file = Bun.file(DOWNLOAD_PATH);
      if (!(await file.exists())) return notFound();

      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": "attachment; filename=\"dbpill.zip\"",
        },
      });
    }

    // --- Platform-specific download routes ------------------------------
    const platformMatch = url.pathname.match(/^\/download\/(mac|linux-x86|linux-aarch64|windows)$/);
    if (platformMatch) {
      const token = getCookie(req, "download_token");
      if (!token) return new Response("Unauthorized", { status: 403 });
      if (!tokenIsValid(token)) return new Response("Invalid or expired download link", { status: 404 });
      const ip = req.headers.get("x-forwarded-for") || null;
      const ua = req.headers.get("user-agent") || null;
      recordDownload(token, ip, ua);

      const platform = platformMatch[1] as keyof typeof DOWNLOAD_PATHS;
      const filePath = DOWNLOAD_PATHS[platform];
      const file = Bun.file(filePath);
      if (!(await file.exists())) return notFound();

      return new Response(file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename=\"dbpill-${platform}.zip\"`,
        },
      });
    }

    // --- Static file & SPA index.html ------------------------------------
    // Serve index.html with public key injected
    if (url.pathname === "/" || url.pathname === "/index.html") {
      let html = await Bun.file(path.join(import.meta.dir, "client", "index.html")).text();
      html = html.replace(/__STRIPE_PUBLISHABLE_KEY__/g, STRIPE_PUBLISHABLE_KEY);
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    // --- Direct downloads page for returning customers ------------------
    if (url.pathname === "/downloads") {
      const token = getCookie(req, "download_token");
      if (!token || !tokenIsValid(token)) {
        return new Response("Unauthorized", { status: 403 });
      }

      // Fetch purchase info to personalise email
      const purchaseRow = db.query<{ email: string }>(
        "SELECT email FROM purchases WHERE token = ?",
      ).get(token);
      const purchaseEmail = purchaseRow?.email ?? null;

      await ensureLayoutLoaded();
      const downloadPagePath = path.join(import.meta.dir, "client", "downloads.html");
      const rawDownloadsHtml = await Bun.file(downloadPagePath).text();
      const bodyMatch = rawDownloadsHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      let downloadsContent = bodyMatch ? bodyMatch[1].trim() : rawDownloadsHtml;
      downloadsContent = downloadsContent.replace(/__PURCHASE_EMAIL__/g, purchaseEmail ?? "your email");

      const finalHtml = renderWithLayout(downloadsContent);
      return new Response(finalHtml, { headers: { "Content-Type": "text/html" } });
    }

    // --- Redeem download via email ------------------------------------
    if (req.method === "POST" && url.pathname === "/redeem") {
      let payload: { email?: string } = {};
      try {
        payload = await req.json();
      } catch (_) {}
      const emailInput = (payload.email || "").trim().toLowerCase();
      if (!emailInput) {
        return new Response("Missing email", { status: 400 });
      }

      // Look up most recent purchase for this email (case-insensitive)
      const purchaseRow = db
        .query<{ customer_id: string; token: string; created_at: number }>(
          "SELECT customer_id, token, created_at FROM purchases WHERE email = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 1",
        )
        .get(emailInput);

      if (!purchaseRow) {
        return new Response("Purchase not found", { status: 404 });
      }

      // Create a brand-new redeem link tied to this purchase token
      const redeemToken = createRedeemToken(purchaseRow.token);

      // Email single-use link
      const link = `${url.origin}/claim/${redeemToken}`;
      try {
        await sendEmail(
          emailInput,
          "Your dbpill download is ready",
          `Hi there!\n\nThank you for purchasing dbpill. Click the link below to access your downloads:\n${link}\n\nThe link is valid for 24 hours.\n\nCheers,\n- dbpill.com`,
        );
      } catch (err) {
        console.error("[REDEEM] Failed to send email:", err);
        return new Response("Failed to send email. Please try again later.", { status: 500 });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Claim download link route -------------------------------------
    const claimMatch = url.pathname.match(/^\/claim\/([0-9a-fA-F-]+)\/?$/);
    if (claimMatch) {
      const redeemToken = decodeURIComponent(claimMatch[1]);

      // Validate redeem link
      if (!redeemTokenIsValid(redeemToken)) {
        return new Response("Invalid or expired link", { status: 404 });
      }

      // Fetch the redeem record to get the associated purchase token
      const redeemRow = db
        .query<{ purchase_token: string }>("SELECT purchase_token FROM redeem_links WHERE token = ?")
        .get(redeemToken);

      if (!redeemRow) {
        return new Response("Invalid link", { status: 404 });
      }

      const purchaseTokenFromLink = redeemRow.purchase_token;

      const ip = req.headers.get("x-forwarded-for") || null;
      const ua = req.headers.get("user-agent") || null;

      // Ensure purchase token is still valid; if expired create a fresh one via purchase row ownership
      let activePurchaseToken = purchaseTokenFromLink;
      if (!tokenIsValid(activePurchaseToken)) {
        // Find purchase row by token to get customer_id
        const pr = db.query<{ customer_id: string; email: string }>("SELECT customer_id, email FROM purchases WHERE token = ?").get(purchaseTokenFromLink);
        activePurchaseToken = getOrCreateToken(pr?.customer_id ?? randomUUID(), pr?.email ?? null, ip, ua);
      }

      // Mark the current redeem token as claimed and invalidate others tied to same purchase
      db.run("UPDATE redeem_links SET claimed = 1 WHERE purchase_token = ?", purchaseTokenFromLink);

      // Set download cookie and redirect to downloads page
      const headers = {
        Location: "/downloads",
        "Set-Cookie": `download_token=${activePurchaseToken}; Max-Age=${TOKEN_TTL}; Path=/; HttpOnly; SameSite=Strict`,
      } as const;
      return new Response(null, { status: 302, headers });
    }

    // Serve other static assets in /client
    const staticPath = path.join(import.meta.dir, "client", decodeURIComponent(url.pathname));
    if (await Bun.file(staticPath).exists()) {
      return new Response(Bun.file(staticPath));
    }

    return notFound();
  },
});

console.log("➡  dbpill landing site running on http://localhost:", port);
