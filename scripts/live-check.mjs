// Read-only check against the real API (spends nothing). Needs
// VIRTNUMBER_API_USER and VIRTNUMBER_API_TOKEN in the environment.
//   node scripts/live-check.mjs
import { Virtnumber, VirtnumberError } from "../dist/esm/index.js";

const vn = new Virtnumber();
const show = (label, value) => console.log(label.padEnd(16), JSON.stringify(value).slice(0, 160));
const tryShow = async (label, fn) => {
  try {
    show(label, await fn());
  } catch (err) {
    show(label + " ERR", err instanceof VirtnumberError ? { status: err.status, title: err.title, detail: err.detail } : String(err));
  }
};

show("balance", await vn.balance.get());
const countries = await vn.countries.list();
show("countries", countries.map((c) => c.countryid));
const pricing = await vn.pricing.list({ countryId: "GB" });
show("pricing GB", pricing[0]?.plans);
const send = await vn.pricing.send();
show("send-pricing", send.map((s) => `${s.countryid}:${s.destinations.length}`));
await tryShow("numbers", () => vn.numbers.list());

try {
  await vn.messages.list({ number: "10000000000" });
} catch (err) {
  show("foreign number", err instanceof VirtnumberError ? { status: err.status, title: err.title } : String(err));
}
try {
  await vn.numbers.buy({ planId: 999999, countryId: "GB", idempotencyKey: "live-check-bad-plan" });
} catch (err) {
  show("bad plan", err instanceof VirtnumberError ? { status: err.status, title: err.title } : String(err));
}
