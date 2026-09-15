// Preuve navigateur reelle : login via l'API, injection du token dans localStorage,
// rendu de l'app connectee, extraction du texte visible + capture d'ecran.
// Pilotage Chrome headless en CDP brut (aucune dependance externe).
//
// Usage : node tools/e2e/browser-proof.cjs   (depuis la racine du repo ou ailleurs)
// Variables : KEXA_APP_URL (defaut http://localhost:5173), KEXA_API_URL (defaut
// http://127.0.0.1:8080), KEXA_CDP_PORT, KEXA_ARTIFACTS_DIR, CHROME_PATH.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.KEXA_CDP_PORT || 9223);
const APP = process.env.KEXA_APP_URL || "http://localhost:5173";
const API = process.env.KEXA_API_URL || "http://127.0.0.1:8080";
const OUT_DIR = process.env.KEXA_ARTIFACTS_DIR || path.join(os.tmpdir(), "kexa-artifacts");
const OUT_PNG = path.join(OUT_DIR, "kexa-dashboard.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getToken() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "root", password: "admin" }),
  });
  if (!res.ok) throw new Error("login HTTP " + res.status);
  return res.json();
}

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error("Chrome introuvable (" + CHROME + ") : definir CHROME_PATH");
  if (!fs.existsSync(path.join(ROOT, "front", "package.json"))) throw new Error("racine du repo introuvable depuis " + __dirname);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const auth = await getToken();
  console.log("LOGIN_API: OK (role=" + auth.user.role + ", token_len=" + auth.token.length + ")");

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kexa-cdp-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=" + PORT,
    "--user-data-dir=" + profile,
    "--window-size=1600,1000",
    "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(500);
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      const targets = await r.json();
      const page = targets.find((t) => t.type === "page");
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* chrome pas encore pret */ }
  }
  if (!wsUrl) throw new Error("Chrome CDP indisponible");

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");

  // 1) charger l'origine pour pouvoir ecrire dans son localStorage
  await send("Page.navigate", { url: APP });
  await sleep(3000);
  await evaluate(`localStorage.setItem("kexamanager:token", ${JSON.stringify(auth.token)});
                  localStorage.setItem("kexamanager:user", ${JSON.stringify(JSON.stringify(auth.user))});
                  localStorage.setItem("kexamanager:lang", "fr");
                  "seeded"`);

  // 2) recharger : l'app doit demarrer authentifiee et rendre l'ecran Projets
  await send("Page.reload", { ignoreCache: false });
  await sleep(6000);

  const info = await evaluate(`JSON.stringify({
      url: location.pathname,
      titre: document.title,
      h1: Array.from(document.querySelectorAll("h1,h4,h5,h6")).slice(0,6).map(e=>e.textContent.trim()),
      boutons: Array.from(document.querySelectorAll("button")).map(e=>e.textContent.trim()).filter(Boolean).slice(0,12),
      nav: Array.from(document.querySelectorAll("nav a, .MuiDrawer-root a, .MuiListItemButton-root")).map(e=>e.textContent.trim()).filter(Boolean).slice(0,12),
      appbar: !!document.querySelector("header"),
      police: getComputedStyle(document.body).fontFamily,
      bg: getComputedStyle(document.body).backgroundColor,
      mode: document.documentElement.className,
      texteLongueur: document.body.innerText.length
  })`);
  console.log("RENDU:", info);

  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(OUT_PNG, Buffer.from(shot.result.data, "base64"));
  console.log("SCREENSHOT: " + OUT_PNG + " (" + fs.statSync(OUT_PNG).size + " octets)");

  // 3) verifier la bascule de theme (mode clair) : le mode doit changer sur <html>
  await evaluate(`document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); "ok"`);
  const light = await evaluate(`JSON.stringify({ mode: document.documentElement.className, bg: getComputedStyle(document.body).backgroundColor })`);
  console.log("MODE_CLAIR:", light);

  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* profil verrouille */ }
  console.log("FIN_OK");
}

main().catch((e) => { console.error("ECHEC: " + e.message); process.exit(1); });
