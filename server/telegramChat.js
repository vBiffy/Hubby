import { pathToFileURL } from 'node:url';

// Only messages written here are shown. Telegram URLs and raw errors may contain tokens.
export async function listTelegramChats(token, fetcher = fetch) {
  token = (token || '').trim();
  if (!token) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is missing. Add it to .env in the project folder, not .env.example.',
    );
  }
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN has an invalid format. Copy only the token from BotFather into .env.',
    );
  }
  let response;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout: 0, allowed_updates: ['message'] }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Cannot reach Telegram. Check your internet, firewall, or VPN and retry.');
  }
  if ([401, 404].includes(response.status)) {
    throw new Error(
      'Telegram rejected the bot token. Check it against BotFather or obtain a new token.',
    );
  }
  if (response.status === 409) {
    throw new Error(
      'Telegram reports a webhook or polling conflict. Stop other apps using this bot or create a dedicated bot.',
    );
  }
  if (response.status === 429) {
    throw new Error('Telegram rate limit reached. Wait a minute, then run the command again.');
  }
  if (!response.ok) {
    throw new Error(`Telegram returned HTTP ${response.status}. Try again later.`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Telegram returned an unreadable response. Check your connection and retry.');
  }
  if (data.ok !== true || !Array.isArray(data.result)) {
    throw new Error('Telegram could not list updates. Verify your bot setup and try again.');
  }
  const chats = new Map();
  for (const update of data.result) {
    const chat = update.message?.chat;
    if (chat && Number.isSafeInteger(chat.id)) chats.set(chat.id, chat.type);
  }
  return chats;
}

// Importable for fake-provider tests; direct execution reads the server environment.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chats = await listTelegramChats(process.env.TELEGRAM_BOT_TOKEN);
    if (!chats.size) {
      console.log('No chats found. Press Start or send hello to your bot, then retry.');
    } else {
      for (const [id, type] of chats) console.log(`Chat ID: ${id} (${type})`);
      console.log('Use the ID of your intended chat as TELEGRAM_CHAT_ID in .env.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
