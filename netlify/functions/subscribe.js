// Adds a newsletter sign-up (footer or pop-up) to your Mailchimp audience.
// Netlify environment variables:
//   MAILCHIMP_API_KEY       (required)  looks like abc123...-us21
//   MAILCHIMP_AUDIENCE_ID   (required)  looks like a1b2c3d4e5
//   MAILCHIMP_DOUBLE_OPTIN  (optional)  "true" sends a confirm email first
const crypto = require("crypto");
exports.handler = async (event) => {
  const json = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const key = process.env.MAILCHIMP_API_KEY, list = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!key || !list || !key.includes("-")) return json(500, { error: "Sign-up isn't switched on yet." });
  let email = "";
  try { email = String(JSON.parse(event.body || "{}").email || "").trim().toLowerCase(); } catch { return json(400, { error: "Bad request" }); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return json(400, { error: "Please enter a valid email address." });
  const dc = key.split("-").pop();
  const hash = crypto.createHash("md5").update(email).digest("hex");
  const doubleOptIn = String(process.env.MAILCHIMP_DOUBLE_OPTIN || "").toLowerCase() === "true";
  try {
    const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(list)}/members/${hash}`, {
      method: "PUT",
      headers: { Authorization: "Basic " + Buffer.from("riri:" + key).toString("base64"), "Content-Type": "application/json" },
      body: JSON.stringify({ email_address: email, status_if_new: doubleOptIn ? "pending" : "subscribed" })
    });
    if (r.ok) return json(200, { ok: true, pending: doubleOptIn });
    const d = await r.json().catch(() => ({}));
    console.error("Mailchimp error", d && (d.title || d.detail));
    if (d && /forgotten|compliance/i.test(String(d.title) + String(d.detail))) return json(400, { error: "This email can't be re-added automatically. Please contact us." });
    return json(502, { error: "That didn't go through. Please try again." });
  } catch (e) { console.error(e); return json(502, { error: "That didn't go through. Please try again." }); }
};
