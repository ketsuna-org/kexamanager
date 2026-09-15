// Passe en revue chaque route de l'app dans un vrai navigateur et capture une preuve par ecran.
//
// Usage : node tools/e2e/route-sweep.cjs   (depuis la racine du repo ou ailleurs)
// Variables : KEXA_APP_URL (defaut http://localhost:5173), KEXA_API_URL (defaut
// http://127.0.0.1:8080), KEXA_CDP_PORT, KEXA_ARTIFACTS_DIR, CHROME_PATH,
// KEXA_PROJECT_ID (projet selectionne dans le localStorage, defaut 1).
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.KEXA_CDP_PORT || 9225);
const APP = process.env.KEXA_APP_URL || "http://localhost:5173";
const API = process.env.KEXA_API_URL || "http://127.0.0.1:8080";
const PROJECT_ID = process.env.KEXA_PROJECT_ID || "1";
const ROUTES = ["/projects", "/buckets", "/s3", "/cluster", "/nodes", "/blocks", "/workers", "/apps", "/manager", "/adminTokens"];
const DIR = path.join(process.env.KEXA_ARTIFACTS_DIR || path.join(os.tmpdir(), "kexa-artifacts"), "route-sweep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error("Chrome introuvable (" + CHROME + ") : definir CHROME_PATH");
  if (!fs.existsSync(path.join(ROOT, "front", "package.json"))) throw new Error("racine du repo introuvable depuis " + __dirname);
  fs.mkdirSync(DIR, { recursive: true });
  const auth = await (await fetch(`${API}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "root", password: "admin" }),
  })).json();

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kexa-cdp3-"));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + PORT, "--user-data-dir=" + profile, "--window-size=1600,1000", "about:blank"], { stdio: "ignore" });

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
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("CONSOLE " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push("LOG " + String(m.params.entry.text).slice(0, 160));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Page.navigate", { url: APP });
  await sleep(3500);
  await evaluate(`localStorage.setItem("kexamanager:token", ${JSON.stringify(auth.token)});
                  localStorage.setItem("kexamanager:user", ${JSON.stringify(JSON.stringify(auth.user))});
                  localStorage.setItem("kexamanager:selectedProject", ${JSON.stringify(PROJECT_ID)});`);

  for (const route of ROUTES) {
    errors.length = 0;
    await send("Page.navigate", { url: APP + route });
    await sleep(5000);
    const info = JSON.parse(await evaluate(`JSON.stringify({
      chemin: location.pathname,
      titre: (document.querySelector("h1,h4")||{}).textContent || null,
      texte: document.body.innerText.replace(/\\n+/g," ").slice(0,150),
      tableaux: document.querySelectorAll("table").length,
      lignes: document.querySelectorAll("tbody tr").length,
      recherche: !!document.querySelector('input[type="search"], input[placeholder*="echerch" i], input[placeholder*="earch" i]'),
      pagination: !!document.querySelector(".MuiTablePagination-root"),
      selecteurProjet: !!document.querySelector(".MuiSelect-select"),
      vide: document.querySelectorAll("svg").length
    })`));
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = path.join(DIR, route.replace(/\//g, "_") + ".png");
    fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    console.log(`${route.padEnd(12)} | ${String(info.titre).slice(0, 26).padEnd(26)} | tables=${info.tableaux} lignes=${String(info.lignes).padStart(3)} recherche=${info.recherche ? "O" : "N"} pagination=${info.pagination ? "O" : "N"} | erreurs=${errors.length}` + (errors.length ? " -> " + errors[0] : ""));
  }
  console.log("CAPTURES: " + DIR);
  ws.close(); chrome.kill();
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* verrou */ }
}

main().catch((e) => { console.error("ECHEC: " + e.message); process.exit(1); });
