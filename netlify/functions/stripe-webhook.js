// When a paid order includes framing, emails the framer what to print, frame and ship,
// plus the customer's shipping address, with a copy to you.
// Stripe calls this automatically after every successful checkout.
// Netlify environment variables:
//   STRIPE_WEBHOOK_SECRET  (required)  whsec_... from the Stripe webhook you create
//   RESEND_API_KEY         (required)  re_... from resend.com (sends the email)
//   FRAMER_EMAIL           (optional)  default Sales@RiverosArt.com
//   ORDER_COPY_EMAIL       (optional)  default Arianna@riristudios.com (gets a copy, and replies go here)
//   ORDER_FROM_EMAIL       (optional)  default "RIRI Studios <orders@riristudios.com>" (domain must be verified in Resend)
const crypto = require("crypto");

const FRAMER = () => process.env.FRAMER_EMAIL || "Sales@RiverosArt.com";
const COPY = () => process.env.ORDER_COPY_EMAIL || "Arianna@riristudios.com";
const FROM = () => process.env.ORDER_FROM_EMAIL || "RIRI Studios <orders@riristudios.com>";
const FRAMED_SIZE = { "8 × 10": "12 × 14", "11 × 14": "15 × 18", "16 × 20": "20 × 24", "8×10": "12 × 14", "11×14": "15 × 18", "16×20": "20 × 24" };
const MAT_TEXT = { single: "Single mat: 2\" crystal white", double: "Double mat: 2\" crystal white over a 1/4\" black accent" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function verify(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(kv => kv.split("=")).filter(a => a.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3));
  const t = parseInt(parts.t, 10);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 600) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// Order lines are stored on the payment as "2 x Framing - Antiqued Gold Profiled | For D.N.D 11 × 14 in print, double mat"
// and bundle lines as "1 x Medium bundle | 11×14 print: Original Sin, framed in Antiqued Gold Profiled | ..."
function framedItems(metadata) {
  const out = [];
  Object.keys(metadata || {}).sort().forEach(k => {
    const v = String(metadata[k] || "");
    let m = v.match(/^(\d+) x Framing - (.+?) \| For (.+?) (\d+ × \d+) in print, (single|double) mat$/);
    if (m) { out.push({ qty: +m[1], frame: m[2], painting: m[3], size: m[4], mat: m[5], from: "Framed print" }); return; }
    m = v.match(/^(\d+) x (.+? bundle) \| (.+)$/);
    if (m) {
      m[3].split(" | ").forEach(seg => {
        const b = seg.match(/^(\d+×\d+) print: (.+?), framed in (.+)$/);
        if (b) out.push({ qty: +m[1], frame: b[3], painting: b[2], size: b[1].replace("×", " × "), mat: "single", from: m[2] });
      });
    }
  });
  return out;
}

function emailHtml(s, items, ship) {
  const a = (ship && ship.address) || {};
  const addr = [ship && ship.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(" "), a.country].filter(Boolean).map(esc).join("<br>");
  const cust = s.customer_details || {};
  const ref = String(s.id || "").slice(-8).toUpperCase();
  const rows = items.map(it => `<tr>
    <td style="padding:10px;border-bottom:1px solid #ddd"><b>${esc(it.painting)}</b><br><span style="color:#666">${esc(it.from)}</span></td>
    <td style="padding:10px;border-bottom:1px solid #ddd">${esc(it.size)} in print<br><span style="color:#666">${esc(FRAMED_SIZE[it.size] || "")} in framed</span></td>
    <td style="padding:10px;border-bottom:1px solid #ddd">${esc(it.frame)}</td>
    <td style="padding:10px;border-bottom:1px solid #ddd">${esc(MAT_TEXT[it.mat] || it.mat)}</td>
    <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center">${it.qty}</td></tr>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;max-width:720px">
  <p>Hello,</p>
  <p>A new framing order from <b>RIRI Studios</b> (order <b>${ref}</b>). Please <b>print, frame and ship</b> the following directly to the customer below.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr style="background:#f3efe8;text-align:left"><th style="padding:10px">Painting</th><th style="padding:10px">Size</th><th style="padding:10px">Frame</th><th style="padding:10px">Mat</th><th style="padding:10px">Qty</th></tr>
    ${rows}
  </table>
  <p>All pieces: fine art print on <b>Cold Press Bright</b> paper, framing acrylic, acid-free backing, hanging wire.</p>
  <p><b>Ship to:</b><br>${addr || "(no shipping address on the order, please reply and we'll send it)"}${cust.phone ? `<br>Phone: ${esc(cust.phone)}` : ""}</p>
  <p><b>Bill to:</b> RIRI Studios, ${esc(COPY())}</p>
  <p>Please reply to this email with any questions, the invoice and the tracking number once it ships.</p>
  <p>Thank you,<br>Arianna<br>RIRI Studios</p></div>`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
  const h = event.headers || {};
  if (!verify(raw, h["stripe-signature"] || h["Stripe-Signature"], process.env.STRIPE_WEBHOOK_SECRET)) return { statusCode: 400, body: "Bad signature" };
  let evt; try { evt = JSON.parse(raw); } catch { return { statusCode: 400, body: "Bad JSON" }; }
  if (evt.type !== "checkout.session.completed") return { statusCode: 200, body: "ignored" };
  const s = evt.data && evt.data.object || {};
  if (s.payment_status !== "paid") return { statusCode: 200, body: "not paid" };
  const items = framedItems(s.metadata);
  if (!items.length) return { statusCode: 200, body: "no framing in this order" };
  const ship = s.shipping_details || (s.collected_information && s.collected_information.shipping_details) || (s.customer_details && { name: s.customer_details.name, address: s.customer_details.address });
  if (!process.env.RESEND_API_KEY) { console.error("RESEND_API_KEY missing; framing email not sent for", s.id); return { statusCode: 500, body: "email not configured" }; }
  const ref = String(s.id || "").slice(-8).toUpperCase();
  const n = items.reduce((a, i) => a + i.qty, 0);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [FRAMER()], cc: [COPY()], reply_to: COPY(),
      subject: `RIRI Studios framing order ${ref}: ${n} framed print${n > 1 ? "s" : ""}`, html: emailHtml(s, items, ship) })
  });
  if (!r.ok) { console.error("Resend error", r.status, await r.text().catch(() => "")); return { statusCode: 502, body: "email failed" }; } // Stripe retries
  return { statusCode: 200, body: "framing email sent" };
};
exports._test = { verify, framedItems, emailHtml };
