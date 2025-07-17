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

// Read version from main app package.json
const mainPackageJson = JSON.parse(await Bun.file(path.join(import.meta.dir, "..", "package.json")).text());
const APP_VERSION = mainPackageJson.version;

// S3 URLs for secure downloads
const S3_DOWNLOAD_URLS = {
  "macos-arm64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-darwin-arm64.zip`,
  "macos-x64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-darwin-x64.zip`,
  "windows-x64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-win-x64.zip`,
  "windows-arm64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-win-arm64.zip`,
  "linux-x64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-linux-x64.tar.gz`,
  "linux-arm64": `https://dbpill-releases.s3.us-west-1.amazonaws.com/dbpill-${APP_VERSION}-linux-arm64.tar.gz`,
} as const;

// Helper function to stream file from S3
async function streamFromS3(url: string, filename: string, req: Request): Promise<Response> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch from S3: ${response.status} ${response.statusText}`);
      return new Response("Download temporarily unavailable", { status: 503 });
    }

    const contentType = filename.endsWith('.tar.gz') ? 'application/gzip' : 'application/zip';
    
    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error(`Error streaming from S3:`, error);
    return new Response("Download failed", { status: 500 });
  }
}

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
  // Inject publishable key and version placeholders (present in index.html)
  html = html.replace(/__STRIPE_PUBLISHABLE_KEY__/g, STRIPE_PUBLISHABLE_KEY);
  html = html.replace(/__APP_VERSION__/g, APP_VERSION);
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
        // Ensure a Stripe Customer object is always created, even when the amount is $0
        customer_creation: "always",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: 0, // $100.00 in cents
              product_data: { name: "dbpill standalone executable" },
            },
            quantity: 1,
          },
        ],
        success_url: `${host}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${host}/`,
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

      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        return new Response("Payment not completed", { status: 400 });
      }

      // Ensure we have a Stripe Customer ID. For paid sessions `session.customer` is set automatically.
      // For $0 / no-payment sessions, Checkout might skip customer creation, so we create one manually.
      let customerId = session.customer as string | null;

      // Verify that the referenced customer really exists (Stripe might return
      // a stale ID for no-cost checkouts). If retrieval fails, we’ll create a
      // fresh customer below.
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (_) {
          customerId = null;
        }
      }
      // Prefer the email from customer_details; fall back to the top-level customer_email that Checkout sets for free sessions.
      const email = session.customer_details?.email ?? (session.customer_email as string | null) ?? null;

      if (!customerId) {
        // Create a lightweight customer so we can still track licences/downloads later on.
        const newCustomer = await stripe.customers.create({ email: email ?? undefined });
        customerId = newCustomer.id;
      } else if (email) {
        // Make sure the existing customer record has the collected email (Stripe omits it for some $0 sessions).
        await stripe.customers.update(customerId, { email });
      }

      // Final verification & debug: retrieve the customer to ensure persistence
      try {
        await stripe.customers.retrieve(customerId);
      } catch (_) {
        // As a recovery step, create a fresh Customer so we don’t break the flow
        const fallback = await stripe.customers.create({ email: email ?? undefined });
        customerId = fallback.id;
      }
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
      downloadsContent = downloadsContent.replace(/__PURCHASE_EMAIL__/g, email ?? "anon user");

      const finalHtml = renderWithLayout(downloadsContent);

      const headers = {
        "Content-Type": "text/html",
        // Session cookie restricted to this browser, expires after 24 h
        "Set-Cookie": `download_token=${token}; Max-Age=${TOKEN_TTL}; Path=/; HttpOnly; SameSite=Strict`,
      } as const;
      return new Response(finalHtml, { headers });
    }

    // --- Protected download routes (stream from S3) ----------------------
    const downloadMatch = url.pathname.match(/^\/download\/(macos-arm64|macos-x64|windows-x64|windows-arm64|linux-x64|linux-arm64)$/);
    if (downloadMatch) {
      const token = getCookie(req, "download_token");
      if (!token) return new Response("Unauthorized", { status: 403 });
      if (!tokenIsValid(token)) return new Response("Invalid or expired download link", { status: 404 });
      
      const platform = downloadMatch[1] as keyof typeof S3_DOWNLOAD_URLS;
      const s3Url = S3_DOWNLOAD_URLS[platform];
      if (!s3Url) return notFound();

      const ip = req.headers.get("x-forwarded-for") || null;
      const ua = req.headers.get("user-agent") || null;
      recordDownload(token, ip, ua);

      // Extract filename from S3 URL
      const filename = s3Url.split('/').pop() || `dbpill-${platform}`;
      
      return streamFromS3(s3Url, filename, req);
    }

    // --- Static file & SPA index.html ------------------------------------
    // Serve index.html with public key and version injected
    if (url.pathname === "/" || url.pathname === "/index.html") {
      let html = await Bun.file(path.join(import.meta.dir, "client", "index.html")).text();
      html = html.replace(/__STRIPE_PUBLISHABLE_KEY__/g, STRIPE_PUBLISHABLE_KEY);
      html = html.replace(/__APP_VERSION__/g, APP_VERSION);
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
      downloadsContent = downloadsContent.replace(/__PURCHASE_EMAIL__/g, purchaseEmail ?? "anon user");

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

    // --- Generate free redeem token ------------------------------------
    if (url.pathname === "/generate_redeem_token") {
      // Create an anonymous purchase token that isn’t tied to Stripe or an email.
      // This is useful for giving out complimentary download links.
      const customerId = `free-${randomUUID()}`;
      const purchaseToken = getOrCreateToken(customerId, null, null, null);
      const redeemToken = createRedeemToken(purchaseToken);
      const link = `${url.origin}/claim/${redeemToken}`;
      return new Response(JSON.stringify({ link }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Claim download link route -------------------------------------
    const claimMatch = url.pathname.match(/^\/claim\/([0-9a-fA-F-]+)\/?$/);
    if (claimMatch) {
      const redeemToken = decodeURIComponent(claimMatch[1]);

      // When the request is a POST we actually consume the redeem link and
      // grant access. A GET simply renders a confirmation page so that email
      // / chat link previewers do not prematurely consume the single-use link.
      if (req.method === "POST") {
        // Validate redeem link
        if (!redeemTokenIsValid(redeemToken)) {
          return new Response("Invalid or expired link", { status: 404 });
        }

        // Fetch the redeem record to get the associated purchase token
        const redeemRow = db
          .query<{ purchase_token: string }>(
            "SELECT purchase_token FROM redeem_links WHERE token = ?",
          )
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
          const pr = db
            .query<{ customer_id: string; email: string }>(
              "SELECT customer_id, email FROM purchases WHERE token = ?",
            )
            .get(purchaseTokenFromLink);
          activePurchaseToken = getOrCreateToken(
            pr?.customer_id ?? randomUUID(),
            pr?.email ?? null,
            ip,
            ua,
          );
        }

        // Mark the current redeem token as claimed and invalidate others tied to same purchase
        db.run(
          "UPDATE redeem_links SET claimed = 1 WHERE purchase_token = ?",
          purchaseTokenFromLink,
        );

        // Set download cookie and redirect to downloads page
        const headers = {
          Location: "/downloads",
          "Set-Cookie": `download_token=${activePurchaseToken}; Max-Age=${TOKEN_TTL}; Path=/; HttpOnly; SameSite=Strict`,
        } as const;
        return new Response(null, { status: 302, headers });
      }

      // For GET/HEAD requests, render a confirmation page without consuming the link
      // If the user already has an active download session (valid cookie), simply redirect
      // them to the downloads page instead of showing an "invalid/expired" message.
      const existingToken = getCookie(req, "download_token");
      if (!redeemTokenIsValid(redeemToken) && existingToken && tokenIsValid(existingToken)) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/downloads" },
        });
      }

      await ensureLayoutLoaded();

      let bodyHtml: string;
      if (!redeemTokenIsValid(redeemToken)) {
        bodyHtml = `<section style="text-align:center;padding:3rem 1rem;">
  <h2>Link invalid or expired</h2>
  <p>The link you followed is no longer valid. You can request a new one from your purchase email.</p>
</section>`;
      } else {
        bodyHtml = `<section style="text-align:center;padding:3rem 1rem;">
  <h2>Confirm download access</h2>
  <p>Click the button below to access your dbpill downloads.</p>
  <form method="POST" action="/claim/${redeemToken}">
    <button type="submit" style="margin-top:1.5rem;padding:0.75rem 2rem;font-size:1rem;cursor:pointer;">Access downloads</button>
  </form>
</section>`;
      }

      const html = renderWithLayout(bodyHtml);
      const statusCode = bodyHtml.includes("Link invalid") ? 404 : 200;
      return new Response(html, {
        status: statusCode,
        headers: { "Content-Type": "text/html" },
      });
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
