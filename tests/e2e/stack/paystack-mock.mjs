/**
 * Paystack TEST DOUBLE for end-to-end tests. Implements the subset of Paystack's API used by
 * the adapter, with Paystack's response shapes, a hosted "checkout" page, and webhooks signed
 * with HMAC-SHA512 exactly like Paystack. It never moves money.
 */
import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import { PAYSTACK_TEST_SECRET } from "./keys.mjs";

export function startPaystackMock({ port, webhookUrl }) {
  const tx = new Map();
  const refunds = [];

  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const body = (req) =>
    new Promise((resolve) => {
      let s = "";
      req.on("data", (d) => (s += d));
      req.on("end", () => resolve(s));
    });
  const webhook = async (event, data) => {
    const raw = JSON.stringify({ event, data });
    const sig = createHmac("sha512", PAYSTACK_TEST_SECRET).update(raw).digest("hex");
    await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": sig }, body: raw }).catch(() => {});
  };
  const authed = (req) => req.headers.authorization === `Bearer ${PAYSTACK_TEST_SECRET}`;

  http
    .createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const p = url.pathname;

      // Hosted checkout page (what the guest's browser sees).
      let m = /^\/checkout\/([^/]+)$/.exec(p);
      if (m && req.method === "GET") {
        const t = tx.get(m[1]);
        if (!t) return json(res, 404, { status: false, message: "Transaction not found" });
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(`<!doctype html><title>Test checkout</title><main><h1>Test checkout</h1>
<p>Amount: <span id="amount">${t.amount}</span> ${t.currency}</p>
<form method="post" action="/checkout/${t.reference}/pay"><button>Pay with test M-Pesa</button></form>
<form method="post" action="/checkout/${t.reference}/fail"><button>Decline payment</button></form></main>`);
      }
      m = /^\/checkout\/([^/]+)\/(pay|fail)$/.exec(p);
      if (m && req.method === "POST") {
        const t = tx.get(m[1]);
        if (!t) return json(res, 404, { status: false });
        t.status = m[2] === "pay" ? "success" : "failed";
        t.paid_at = t.status === "success" ? new Date().toISOString() : null;
        if (t.status === "success") {
          // Deliver the webhook twice to exercise deduplication.
          const data = { id: t.id, reference: t.reference, status: "success", amount: t.amount, currency: t.currency, channel: "mobile_money", customer: { email: t.email } };
          await webhook("charge.success", data);
          await webhook("charge.success", data);
        }
        res.writeHead(302, { location: `${t.callback_url}?trxref=${t.reference}&reference=${t.reference}` });
        return res.end();
      }

      if (p === "/__mock/state") return json(res, 200, { transactions: [...tx.values()], refunds });
      if (!authed(req)) return json(res, 401, { status: false, message: "Invalid key" });

      if (p === "/transaction/initialize" && req.method === "POST") {
        const b = JSON.parse(await body(req));
        if (!Number.isInteger(b.amount) || b.amount <= 0) return json(res, 400, { status: false, message: "Invalid amount" });
        const t = { id: Math.floor(Math.random() * 1e9), reference: b.reference, amount: b.amount, currency: b.currency, email: b.email, callback_url: b.callback_url, status: "ongoing" };
        tx.set(b.reference, t);
        return json(res, 200, { status: true, message: "Authorization URL created", data: { authorization_url: `http://localhost:${port}/checkout/${b.reference}`, access_code: randomUUID(), reference: b.reference } });
      }
      m = /^\/transaction\/verify\/(.+)$/.exec(p);
      if (m && req.method === "GET") {
        const t = tx.get(decodeURIComponent(m[1]));
        if (!t) return json(res, 400, { status: false, message: "Transaction reference not found" });
        return json(res, 200, {
          status: true,
          message: "Verification successful",
          data: { id: t.id, reference: t.reference, status: t.status, amount: t.amount, currency: t.currency, channel: "mobile_money", fees: Math.round(t.amount * 0.015), paid_at: t.paid_at, gateway_response: t.status === "failed" ? "Declined" : "Approved" },
        });
      }
      if (p === "/refund" && req.method === "POST") {
        const b = JSON.parse(await body(req));
        const t = tx.get(b.transaction);
        if (!t || t.status !== "success") return json(res, 400, { status: false, message: "Transaction not refundable" });
        const r = { id: Math.floor(Math.random() * 1e9), transaction_reference: b.transaction, amount: b.amount, currency: b.currency, status: "pending" };
        refunds.push(r);
        setTimeout(() => webhook("refund.processed", { ...r, status: "processed" }), 300);
        return json(res, 200, { status: true, message: "Refund has been queued for processing", data: { ...r, transaction: { reference: b.transaction } } });
      }
      if (p === "/transferrecipient" && req.method === "POST") {
        return json(res, 201, { status: true, message: "Transfer recipient created successfully", data: { recipient_code: `RCP_test_${randomUUID().slice(0, 8)}` } });
      }
      if (p === "/transfer" && req.method === "POST") {
        const b = JSON.parse(await body(req));
        const code = `TRF_test_${randomUUID().slice(0, 8)}`;
        setTimeout(() => webhook("transfer.success", { reference: b.reference, transfer_code: code, status: "success", amount: b.amount, currency: b.currency }), 300);
        return json(res, 200, { status: true, message: "Transfer has been queued", data: { status: "pending", transfer_code: code, reference: b.reference } });
      }
      return json(res, 404, { status: false, message: "Not implemented in test double" });
    })
    .listen(port, "127.0.0.1", () => console.log(`paystack test double on ${port}`));
}
