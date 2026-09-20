import { config } from "../config";
import { sleep } from "../lib/dates";
import { answerQuestion } from "./answer";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string };
  };
};

const API = "https://api.telegram.org/bot";
const START_TEXT =
  "Call-analytic bot. Bugungi qo'ng'iroqlar bo'yicha savol bering.\n\nMasalan:\n• Bugun nechta odamda to'lov muammosi bo'ldi?\n• Bugun qaysi ilovada shikoyat ko'p?\n• Bugun tahlil qilingan qo'ng'iroqlar soni?";

let running = false;

function allowed(userId?: number): boolean {
  if (config.telegramAllowedUserIds.length === 0) {
    return true;
  }
  if (!userId) {
    return false;
  }
  return config.telegramAllowedUserIds.includes(String(userId));
}

async function telegram<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API}${config.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!payload.ok) {
    throw new Error(payload.description || `Telegram ${method} failed`);
  }
  return payload.result as T;
}

async function handleMessage(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  const text = message?.text?.trim();
  if (!message || !text) {
    return;
  }

  if (!allowed(message.from?.id)) {
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Sizga bu botdan foydalanish ruxsati yo'q.",
    });
    return;
  }

  if (text === "/start" || text === "/help") {
    await telegram("sendMessage", { chat_id: message.chat.id, text: START_TEXT });
    return;
  }

  await telegram("sendChatAction", { chat_id: message.chat.id, action: "typing" });
  try {
    const answer = await answerQuestion(text);
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: answer.slice(0, 4000),
    });
  } catch (error) {
    console.error("Telegram answer failed", error);
    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text: "Hozir javob bera olmadim. Birozdan keyin qayta urinib ko'ring.",
    });
  }
}

async function poll(): Promise<void> {
  let offset = 0;
  while (running) {
    try {
      const updates = await telegram<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleMessage(update);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Conflict") || message.includes("terminated by other getUpdates")) {
        console.error("Telegram polling conflict; another bot instance is running");
        await sleep(10_000);
        continue;
      }
      console.error("Telegram poll failed", error);
      await sleep(3000);
    }
  }
}

export function startTelegramBot(): void {
  if (!config.telegramBotToken) {
    console.log("Telegram bot skipped: TELEGRAM_BOT_TOKEN is empty");
    return;
  }
  if (running) {
    return;
  }
  running = true;
  console.log("Telegram bot polling started");
  void poll();
}
