// Creates a Stripe Checkout session from the bag.
// Prices are worked out HERE from the catalog, never taken from the browser.
// Netlify environment variables:
//   STRIPE_SECRET_KEY   (required)  sk_test_... while testing, sk_live_... when you go live
//   SHIPPING_CAD        (optional)  flat shipping under $75, default 12
//   FREE_SHIPPING_CAD   (optional)  free shipping from this subtotal, default 75
//   SHIP_COUNTRIES      (optional)  default "CA,US"
const CATALOG = {"paintings": ["Original Sin", "High Maintenance", "D.N.D", "Kiss You Later", "Don't Bother", "Collectables", "Safe Haven", "Devotion in Red", "With You As My Witness", "Fragile"], "printSizes": [["8 × 10 in", 3500], ["11 × 14 in", 5000], ["16 × 20 in", 12000]], "frames": [["Unframed", [0, 0, 0]], ["Modern Black Gallery", [13500, 18500, 26500]], ["Oak Veneer Gallery", [15500, 21500, 30500]], ["Black Accented Profile", [15500, 21500, 30500]], ["Antiqued Gold Profiled", [15500, 21500, 30500]], ["Antiqued Silver Profiled", [15500, 21500, 30500]], ["Walnut & Gold Profiled", [15500, 21500, 30500]]], "mats": ["Single mat", "Double mat"], "hoodies": {"h1": {"name": "Love Bite", "cols": ["Cream", "Black"]}, "h2": {"name": "Original Sin", "cols": ["Cream", "Black"]}, "h3": {"name": "D.N.D", "cols": ["Cream", "Black"]}, "h4": {"name": "Kiss You Later", "cols": ["Cream", "Black"]}}, "hoodieSizes": ["M", "L", "XL"], "hoodiePrice": 12000, "cardPrice": 1000, "products": {"s2": {"name": "Sticker 3-pack", "sizes": [["3 stickers", 800]], "pick": true}, "s3": {"name": "Sticker 7-pack", "sizes": [["7 stickers", 1500]], "pick": true}, "s4": {"name": "Handle With Care", "sizes": [["4 stickers", 1000]], "pick": false}, "s5": {"name": "Femme Fatale", "sizes": [["6 stickers", 1500]], "pick": false}, "sd0": {"name": "Original Sin", "sizes": [["1 sticker", 500]], "pick": false}, "sd1": {"name": "Fragile", "sizes": [["1 sticker", 500]], "pick": false}, "sd2": {"name": "Safe Haven", "sizes": [["1 sticker", 500]], "pick": false}, "sd3": {"name": "Devotion in Red", "sizes": [["1 sticker", 500]], "pick": false}, "sd4": {"name": "D.N.D", "sizes": [["1 sticker", 500]], "pick": false}, "sd5": {"name": "Kiss You Later", "sizes": [["1 sticker", 500]], "pick": false}, "sd6": {"name": "Heart", "sizes": [["1 sticker", 500]], "pick": false}, "sd7": {"name": "Eyeball", "sizes": [["1 sticker", 500]], "pick": false}, "sd8": {"name": "Gummy Bear", "sizes": [["1 sticker", 500]], "pick": false}, "sd9": {"name": "Write Off", "sizes": [["1 sticker", 500]], "pick": false}, "sd10": {"name": "High Maintenance", "sizes": [["1 sticker", 500]], "pick": false}, "sd11": {"name": "Don't Bother", "sizes": [["1 sticker", 500]], "pick": false}, "sd12": {"name": "With You As My Witness", "sizes": [["1 sticker", 500]], "pick": false}, "sd13": {"name": "RIRI Studios Logo", "sizes": [["1 sticker", 500]], "pick": false}, "b1": {"name": "Colouring Kit", "sizes": [["Book + pencil crayons", 1800]], "pick": false}, "m1": {"name": "Mystery Pack", "sizes": [["Card + original art + sticker", 2000]], "pick": false}}, "slots": {"print8": {"name": "8×10 print", "choices": ["Original Sin", "High Maintenance", "D.N.D", "Kiss You Later", "Don't Bother", "Collectables", "Safe Haven", "Devotion in Red", "With You As My Witness", "Fragile"]}, "print11": {"name": "11×14 print", "choices": ["Original Sin", "High Maintenance", "D.N.D", "Kiss You Later", "Don't Bother", "Collectables", "Safe Haven", "Devotion in Red", "With You As My Witness", "Fragile"]}, "sticker": {"name": "Sticker", "choices": ["Original Sin", "Fragile", "Safe Haven", "Devotion in Red", "D.N.D", "Kiss You Later", "Heart", "Eyeball", "Gummy Bear", "Write Off", "High Maintenance", "Don't Bother", "With You As My Witness", "RIRI Studios Logo"]}, "card": {"name": "Postcard (4 × 6)", "choices": ["Original Sin", "High Maintenance", "D.N.D", "Kiss You Later", "Don't Bother", "Collectables", "Safe Haven", "Devotion in Red", "With You As My Witness", "Fragile"]}, "pack7": {"name": "Sticker 7-pack", "choices": ["Riri's pick (7 assorted)", "Choose my own (note at checkout)"]}, "kit": {"name": "Colouring kit", "choices": ["Handle With Care & Femme Fatale"]}, "hoodie": {"name": "Hoodie", "choices": ["Love Bite", "Original Sin", "D.N.D", "Kiss You Later"]}, "hwc": {"name": "Handle With Care pack", "choices": ["4 stickers"]}, "ff": {"name": "Femme Fatale pack", "choices": ["6 stickers"]}}, "psize": {"print8": 0, "print11": 1}, "tiers": {"t1": {"name": "Small", "slots": ["print8", "sticker", "sticker", "card"], "price": 4800}, "t2": {"name": "Medium", "slots": ["print11", "print8", "pack7", "kit"], "price": 8200}, "t3": {"name": "Large", "slots": ["hoodie", "print11", "print8", "hwc", "ff", "kit"], "price": 18900}}};

const clean = (s, n = 200) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").slice(0, n).trim();
const int = (v) => Number.isInteger(v) ? v : (typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : NaN);
const inRange = (v, arr) => Number.isInteger(v) && v >= 0 && v < arr.length;
function fail(msg) { const e = new Error(msg); e.user = true; throw e; }

function priceItem(sku) {
  const C = CATALOG;
  if (!sku || typeof sku !== "object") fail("Something in your bag isn't recognised. Please remove it and add it again.");
  switch (sku.t) {
    case "print": {
      const i = int(sku.i), z = int(sku.size);
      if (!inRange(i, C.paintings) || !inRange(z, C.printSizes)) fail("A print in your bag isn't recognised.");
      return { name: `${C.paintings[i]} - fine art print`, desc: C.printSizes[z][0], amount: C.printSizes[z][1], is11: z === 1 };
    }
    case "frame": {
      const i = int(sku.i), z = int(sku.size), f = int(sku.fr), m = int(sku.mt);
      if (!inRange(i, C.paintings) || !inRange(z, C.printSizes) || !inRange(f, C.frames) || f === 0 || !inRange(m, C.mats)) fail("A framing choice in your bag isn't recognised.");
      return { name: `Framing - ${C.frames[f][0]}`, desc: `For ${C.paintings[i]} ${C.printSizes[z][0]} print, ${C.mats[m].toLowerCase()}`, amount: C.frames[f][1][z] };
    }
    case "hoodie": {
      const h = C.hoodies[sku.id];
      if (sku.col === "Creme") sku.col = "Cream";
      if (!h || !h.cols.includes(sku.col) || !inRange(int(sku.size), C.hoodieSizes)) fail("A hoodie in your bag isn't recognised.");
      return { name: `${h.name} hoodie`, desc: `${sku.col}, size ${C.hoodieSizes[int(sku.size)]}`, amount: C.hoodiePrice };
    }
    case "card": {
      const d = int(sku.design);
      if (!inRange(d, C.paintings)) fail("A card in your bag isn't recognised.");
      return { name: `Postcard - ${C.paintings[d]}`, desc: "4 x 6 in matte postcard", amount: C.cardPrice };
    }
    case "product": {
      const p = C.products[sku.id], z = int(sku.size || 0);
      if (!p || !inRange(z, p.sizes)) fail("Something in your bag isn't recognised.");
      const pick = p.pick ? clean(sku.pick, 300) : "";
      return { name: p.name, desc: [p.sizes[z][0], pick && `Designs: ${pick}`].filter(Boolean).join(" | "), amount: p.sizes[z][1] };
    }
    case "bundle": {
      const t = C.tiers[sku.id];
      if (!t || !Array.isArray(sku.sel) || sku.sel.length !== t.slots.length) fail("A bundle in your bag isn't recognised.");
      let amount = t.price; const parts = [];
      t.slots.forEach((k, idx) => {
        const S = C.slots[k], sel = sku.sel[idx] || {}, v = int(sel.v);
        if (!S || !inRange(v, S.choices)) fail("A bundle choice isn't recognised.");
        let line = S.choices.length > 1 ? `${S.name}: ${S.choices[v]}` : S.name;
        if (k === "hoodie") {
          const col = int(sel.col), sz = int(sel.sz);
          if (![0, 1].includes(col) || !inRange(sz, C.hoodieSizes)) fail("A bundle hoodie choice isn't recognised.");
          line += ` (${col ? "Black" : "Cream"}, ${C.hoodieSizes[sz]})`;
        }
        if (k in C.psize) {
          const fr = int(sel.fr || 0);
          if (!inRange(fr, C.frames)) fail("A bundle framing choice isn't recognised.");
          if (fr) { amount += C.frames[fr][1][C.psize[k]]; line += `, framed in ${C.frames[fr][0]}`; }
        }
        parts.push(line);
      });
      return { name: `${t.name} bundle`, desc: parts.join(" | "), amount };
    }
    default: fail("Something in your bag isn't recognised.");
  }
}

function buildLines(items) {
  if (!Array.isArray(items) || !items.length) fail("Your bag is empty.");
  if (items.length > 60) fail("That's a lot of items! Please split it into two orders.");
  const lines = [];
  for (const it of items) {
    const qty = int(it && it.qty);
    if (!(qty >= 1 && qty <= 50)) fail("Please check the quantities in your bag.");
    lines.push({ ...priceItem(it.sku), qty });
  }
  // 11x14 prints: 2 for $95 ($47.50 each for every pair)
  let pairUnits = Math.floor(lines.filter(l => l.is11).reduce((a, l) => a + l.qty, 0) / 2) * 2;
  const out = [];
  for (const l of lines) {
    if (l.is11 && pairUnits > 0) {
      const n = Math.min(l.qty, pairUnits); pairUnits -= n;
      out.push({ ...l, qty: n, amount: 4750, desc: `${l.desc} (2 for $95)` });
      if (l.qty - n > 0) out.push({ ...l, qty: l.qty - n });
    } else out.push(l);
  }
  return out;
}

exports.handler = async (event) => {
  const json = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: "Checkout isn't switched on yet (the Stripe key is missing in the site settings)." });
  let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }
  let lines; try { lines = buildLines(body.items); } catch (e) { return json(400, { error: e.user ? e.message : "Bad request" }); }

  const subtotal = lines.reduce((a, l) => a + l.amount * l.qty, 0);
  const freeFrom = Math.round(parseFloat(process.env.FREE_SHIPPING_CAD || "75") * 100);
  const flat = Math.round(parseFloat(process.env.SHIPPING_CAD || "12") * 100);
  const free = subtotal >= freeFrom;
  const origin = process.env.URL || `https://${(event.headers && (event.headers.host || event.headers.Host)) || ""}`;
  const countries = (process.env.SHIP_COUNTRIES || "CA,US").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  const p = new URLSearchParams();
  p.append("mode", "payment");
  p.append("success_url", `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);
  p.append("cancel_url", `${origin}/#shop`);
  p.append("allow_promotion_codes", "true");
  p.append("billing_address_collection", "auto");
  p.append("phone_number_collection[enabled]", "true");
  countries.forEach((c, i) => p.append(`shipping_address_collection[allowed_countries][${i}]`, c));
  p.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
  p.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(free ? 0 : flat));
  p.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "cad");
  p.append("shipping_options[0][shipping_rate_data][display_name]", free ? "Free shipping" : "Standard shipping");
  lines.forEach((l, i) => {
    p.append(`line_items[${i}][quantity]`, String(l.qty));
    p.append(`line_items[${i}][price_data][currency]`, "cad");
    p.append(`line_items[${i}][price_data][unit_amount]`, String(l.amount));
    p.append(`line_items[${i}][price_data][product_data][name]`, clean(l.name, 120));
    if (l.desc) p.append(`line_items[${i}][price_data][product_data][description]`, clean(l.desc, 480));
  });
  // full order details on the payment, so you know exactly what to pack
  lines.slice(0, 40).forEach((l, i) => p.append(`metadata[item_${String(i + 1).padStart(2, "0")}]`, clean(`${l.qty} x ${l.name}${l.desc ? " | " + l.desc : ""}`, 490)));

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString()
    });
    const d = await r.json();
    if (!r.ok) { console.error("Stripe error", d && d.error); return json(502, { error: "Checkout couldn't start. Please try again in a minute." }); }
    return json(200, { url: d.url });
  } catch (e) {
    console.error(e); return json(502, { error: "Checkout couldn't start. Please try again in a minute." });
  }
};
exports._test = { buildLines, priceItem };
