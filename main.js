import fs from "fs";
import KlokappBot from "./bot.js";

// فایل اکانت‌ها رو بخون
const accountsData = fs.readFileSync("accounts.json", "utf-8");
const accounts = JSON.parse(accountsData);

// بررسی کن که حداقل یه اکانت داریم
if (!accounts.length) {
  console.error("❌ accounts.json خالیه!");
  process.exit(1);
}

// برای هر اکانت یه بات جدا راه بنداز
accounts.forEach((account, index) => {
  if (!account.private_key) {
    console.warn(`⚠️ Account ${index + 1} is missing private_key. Skipping.`);
    return;
  }

  console.log(`\n🚀 Starting bot ${index + 1} for wallet: ${account.private_key.slice(0, 10)}...`);

  const bot = new KlokappBot(account.private_key);

  bot.start().catch((err) => {
    console.error(`❌ Bot ${index + 1} error:`, err.message);
  });
});
