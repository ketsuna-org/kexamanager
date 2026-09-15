// Preuve navigateur du chemin cluster-wide : projet Garage (id 2, admin mock) sur /buckets.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9226;
const APP = "http://localhost:5173";
const PROJECT_ID = process.env.KEXA_PROJECT_ID || "2";
const OUT = path.join(process.env.LOCALAPPDATA, "Temp", "kexa-artifacts", `buckets-p${PROJECT_ID}.png`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const auth = await (await fetch("http://127.0.0.1:8080/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "root", password: "admin" }),
  })).json();

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kexa-cdp4-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "--window-size=1700,1100", "about:blank"], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(500);
    try {
      const t = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
      const p = t.find((x) => x.type === "page");
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch { /* pas pret */ }
  }
  if (!wsUrl) throw new Error("CDP indisponible");

  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const errors = [];
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") errors.push("EXCEPTION " + (m.params.exceptionDetails.exception?.description || "").split("\n")[0]);
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("CONSOLE " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 180));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable");
  await send("Page.navigate", { url: APP });
  await sleep(3000);
  await evaluate(`localStorage.setItem("kexamanager:token", ${JSON.stringify(auth.token)});
                  localStorage.setItem("kexamanager:user", ${JSON.stringify(JSON.stringify(auth.user))});
                  localStorage.setItem("kexamanager:selectedProject", ${JSON.stringify(PROJECT_ID)});`);
  await send("Page.navigate", { url: APP + "/buckets" });
  await sleep(7000);

  const info = await evaluate(`JSON.stringify({
    chemin: location.pathname + location.search,
    titre: (document.querySelector("h1,h4")||{}).textContent || null,
    entetes: Array.from(document.querySelectorAll("thead th")).map(e=>e.textContent.trim()),
    lignes: document.querySelectorAll("tbody tr").length,
    premiere: Array.from(document.querySelectorAll("tbody tr")[0]?.querySelectorAll("td")||[]).map(e=>e.textContent.trim().slice(0,20)),
    barresQuota: document.querySelectorAll(".MuiLinearProgress-root").length,
    panneauUsage: document.body.innerText.includes("Usage du stockage"),
    badges: Array.from(document.querySelectorAll(".MuiChip-label")).map(e=>e.textContent.trim()).slice(0,4),
    alerte: (document.querySelector('[role=\\"alert\\"]')||{}).innerText?.slice(0,120) || null,
    texte: document.body.innerText.replace(/\\n+/g," | ").slice(0,300)
  })`);
  console.log("RENDU /buckets (projet " + PROJECT_ID + "):", info);

  const shot = await send("Page.captureScreenshot", { format: "png", fullPage: true });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, "base64"));
  console.log("SCREENSHOT: " + OUT + " (" + fs.statSync(OUT).size + " octets)");
  console.log("ERREURS JS: " + errors.length + (errors.length ? " -> " + errors.slice(0, 3).join(" ;; ") : ""));

  ws.close(); chrome.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* verrou */ }
}

main().catch((e) => { console.error("ECHEC: " + e.message); process.exit(1); });
