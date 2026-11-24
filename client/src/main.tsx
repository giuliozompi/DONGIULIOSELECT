import { createRoot } from "react-dom/client";
import { prepareTelegramSdk } from "./lib/telegram-bootstrap";
import "./index.css";

async function start() {
  const root = document.getElementById("root")!;
  const hasPublicContent = root.querySelector('[data-discovery-content]') !== null;
  try {
    await prepareTelegramSdk();
    const { default: App, loadStorefront } = await import("./App");
    // Keep the readable initial page in view while the interactive storefront downloads.
    if (hasPublicContent) await loadStorefront();
    createRoot(root).render(<App />);
  } catch {
    // Keep a failed Mini App launch explicit; an ordinary website can retain its initial content.
    if (!hasPublicContent) root.replaceChildren();
    const message = document.createElement('p');
    message.textContent = 'Не удалось загрузить приложение. Проверьте соединение и повторите попытку.';
    message.setAttribute('role', 'alert');
    const retry = document.createElement('button');
    retry.textContent = 'Повторить';
    retry.onclick = () => window.location.reload();
    const website = document.createElement('a');
    website.textContent = 'Открыть сайт';
    website.href = '/web';
    if (!hasPublicContent) root.className = 'min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center';
    retry.className = 'rounded-md bg-amber-700 px-4 py-2 text-white';
    website.className = 'underline';
    root.append(message, retry, website);
  }
}
void start();
