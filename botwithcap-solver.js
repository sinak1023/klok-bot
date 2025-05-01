import "dotenv/config";
import { ethers } from "ethers";
import fetch from "node-fetch";
import crypto from "crypto";
import fs from "fs/promises";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createWriteStream } from "fs";
import axios from "axios";

// تنظیم سیستم لاگ
const logStream = createWriteStream("bot.log", { flags: "a" });
console.log = (...args) => {
  logStream.write(`${new Date().toISOString()} - ${args.join(" ")}\n`);
  process.stdout.write(`${args.join(" ")}\n`);
};
console.error = (...args) => {
  logStream.write(`${new Date().toISOString()} - ERROR: ${args.join(" ")}\n`);
  process.stderr.write(`ERROR: ${args.join(" ")}\n`);
};

// تابع تاخیر
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// خواندن پراکسی‌ها از فایل proxy.txt
async function loadProxies() {
  try {
    const proxyData = await fs.readFile("proxy.txt", "utf-8");
    return proxyData
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.startsWith("http"));
  } catch (error) {
    console.error("❌ Error loading proxies:", error.message);
    return [];
  }
}

// تابع برای تولید سوال کریپتویی با جمینی
async function generateCryptoQuestion() {
  try {
    await delay(1000); // تأخیر برای جلوگیری از محدودیت نرخ
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = "Generate a short, specific question in English about cryptocurrency or blockchain technology.";
    const result = await model.generateContent(prompt);
    const question = result.response.text().trim();

    return question;
  } catch (error) {
    console.error("❌ Error generating question with Gemini:", error.message);
    return "What is the latest trend in cryptocurrency?"; // سوال پیش‌فرض
  }
}

class KlokappBot {
  constructor() {
    this.baseUrl = "https://api1-pp.klokapp.ai/v1";
    this.wallets = [];
    this.sessionTokens = new Map();
    this.running = true;
    this.proxies = [];
  }

  async initializeWallets() {
    const walletKeys = Object.keys(process.env)
      .filter((key) => key.startsWith("PRIVATE_KEY"))
      .map((key) => process.env[key])
      .filter((key) => key);

    if (walletKeys.length === 0) {
      throw new Error("No private keys found in .env");
    }

    this.wallets = [];
    walletKeys.forEach((key, index) => {
      try {
        if (!ethers.isHexString(key, 32)) {
          throw new Error(`Invalid private key format at index ${index + 1}`);
        }
        const wallet = new ethers.Wallet(key);
        this.wallets.push(wallet);
        console.log(`✅ Wallet ${index + 1} initialized: ${wallet.address}`);
      } catch (error) {
        console.error(`❌ Skipping key ${index + 1}: ${error.message}`);
      }
    });

    if (this.wallets.length === 0) {
      throw new Error("No valid wallets created");
    }

    console.log(`🔑 ${this.wallets.length} wallets initialized.`);
    this.proxies = await loadProxies();
    if (this.proxies.length < this.wallets.length) {
      console.warn(
        `⚠️ Warning: Only ${this.proxies.length} proxies available for ${this.wallets.length} wallets.`
      );
    }
  }

  async start() {
    try {
      await this.initializeWallets();
      console.log("🚀 Bot started with multi-wallet support.");

      while (this.running) {
        const startTime = Date.now();
        console.log(`\n🌟 New cycle started at ${new Date().toLocaleString()}`);

        // پردازش هر ولت فقط یک‌بار
        for (let i = 0; i < this.wallets.length; i++) {
          const wallet = this.wallets[i];
          const proxy = this.proxies[i % this.proxies.length] || null;
          console.log(`🔄 Processing wallet ${i + 1} of ${this.wallets.length}: ${wallet.address}`);

          try {
            if (!this.sessionTokens.has(wallet.address)) {
              await this.connectWallet(wallet, proxy);
            }
            await this.performChats(wallet, proxy);
            console.log(`✅ Wallet ${i + 1} completed successfully.`);
          } catch (error) {
            console.error(`❌ Error for wallet ${wallet.address}: ${error.message}`);
            this.sessionTokens.delete(wallet.address);
          }

          // تأخیر کوتاه بین ولت‌ها برای جلوگیری از فشار به API
          if (i < this.wallets.length - 1) {
            console.log(`😴 Sleeping for 30 seconds before next wallet...`);
            await delay(30 * 1000);
          }
        }

        // محاسبه زمان باقی‌مانده تا 24 ساعت
        const elapsedTime = Date.now() - startTime;
        const remainingTime = 24 * 60 * 60 * 1000 - elapsedTime;

        if (remainingTime > 0) {
          console.log(`⏰ Waiting ${Math.ceil(remainingTime / 1000 / 60)} minutes until next cycle...`);
          await delay(remainingTime);
        } else {
          console.log(`⚡ Cycle finished faster than expected. Starting next cycle immediately.`);
        }
      }
    } catch (error) {
      console.error("❌ Critical error:", error);
      console.log("⚠️ Bot stopped. Please restart manually.");
    }
  }

  async connectWallet(wallet, proxy) {
    try {
      const headers = {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.5",
        "cache-control": "no-cache",
        "content-type": "application/json",
        origin: "https://klokapp.ai",
        pragma: "no-cache",
        referer: "https://klokapp.ai/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      };

      console.log(`🤖 Generating reCAPTCHA token for wallet ${wallet.address}...`);
      const recaptchaToken = await this.getRecaptchaToken(proxy);
      console.log("✅ reCAPTCHA token generated:", recaptchaToken);

      const nonce = ethers.hexlify(ethers.randomBytes(48)).substring(2);
      const messageToSign = [
        `klokapp.ai wants you to sign in with your Ethereum account:`,
        wallet.address,
        ``,
        ``,
        `URI: https://klokapp.ai/`,
        `Version: 1`,
        `Chain ID: 1`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");

      console.log(`📝 Signing authentication message for wallet ${wallet.address}...`);
      const signature = await wallet.signMessage(messageToSign);

      const verifyBody = {
        signedMessage: signature,
        message: messageToSign,
        referral_code: null,
        recaptcha_token: recaptchaToken,
      };

      console.log(`🔐 Verifying wallet ${wallet.address}...`);
      const verifyResponse = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify(verifyBody),
        agent: proxy ? new (require("https-proxy-agent").HttpsProxyAgent)(proxy) : null,
      });

      const responseText = await verifyResponse.text();

      if (!verifyResponse.ok) {
        throw new Error(
          `Verification failed for wallet ${wallet.address}: ${verifyResponse.status} - ${responseText}`
        );
      }

      let verifyData;
      try {
        verifyData = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText}`);
      }

      if (!verifyData.session_token) {
        throw new Error("No session_token in verify response");
      }

      this.sessionTokens.set(wallet.address, verifyData.session_token);
      console.log(`✅ Wallet ${wallet.address} connected successfully!`);
    } catch (error) {
      console.error(`❌ Wallet connection error for ${wallet.address}:`, error.message);
      throw error;
    }
  }

  async getRecaptchaToken(proxy) {
    try {
      if (!process.env.CAPSOLVER_API_KEY) {
        throw new Error("CAPSOLVER_API_KEY is not defined in .env");
      }

      console.log("🤖 Obtaining reCAPTCHA token via Capsolver...");
      const apiKey = process.env.CAPSOLVER_API_KEY;

      const createTaskPayload = {
        clientKey: apiKey,
        task: {
          type: "ReCaptchaV3EnterpriseTaskProxyLess", // می‌تونی این رو به ReCaptchaV3TaskProxyLess تغییر بدی برای تست
          websiteURL: "https://klokapp.ai/",
          websiteKey: "6LcZrRMrAAAAAKllb4TLb1CWH2LR7iNOKmT7rt3L",
          isEnterprise: true,
        },
      };

      const createTaskResponse = await axios.post(
        "https://api.capsolver.com/createTask",
        createTaskPayload
      );

      if (createTaskResponse.data.errorId) {
        console.error("Capsolver error details:", createTaskResponse.data);
        throw new Error(
          `Capsolver error: ${createTaskResponse.data.errorDescription || "Unknown error"}`
        );
      }

      const taskId = createTaskResponse.data.taskId;
      if (!taskId) {
        throw new Error("Failed to create Capsolver task: No task ID returned");
      }

      console.log(`Capsolver task created with ID: ${taskId}, waiting for solution...`);

      let token = null;
      let maxAttempts = 30;
      let attempts = 0;

      while (attempts < maxAttempts) {
        await delay(2000);
        attempts++;
        console.log(`Checking Capsolver result (attempt ${attempts}/${maxAttempts})...`);

        const getResultPayload = {
          clientKey: apiKey,
          taskId: taskId,
        };

        const resultResponse = await axios.post(
          "https://api.capsolver.com/getTaskResult",
          getResultPayload
        );

        if (resultResponse.data.errorId) {
          console.error("Capsolver result error details:", resultResponse.data);
          throw new Error(
            `Capsolver error: ${resultResponse.data.errorDescription || "Unknown error"}`
          );
        }

        const status = resultResponse.data.status;
        if (status === "ready") {
          token = resultResponse.data.solution.gRecaptchaResponse;
          console.log("✅ reCAPTCHA token obtained successfully");
          return token;
        }

        if (status === "failed") {
          throw new Error(
            `Capsolver failed to solve the captcha: ${
              resultResponse.data.errorDescription || "Unknown error"
            }`
          );
        }
      }

      throw new Error("Timed out waiting for Capsolver solution");
    } catch (error) {
      console.error(`❌ Error obtaining reCAPTCHA token: ${error.message}`);
      if (error.response) {
        console.error("Capsolver response details:", error.response.data);
      }
      throw error;
    }
  }

  async sendMessage(wallet, threadId, message) {
    try {
      const sessionToken = this.sessionTokens.get(wallet.address);
      const proxy = this.proxies[this.wallets.indexOf(wallet) % this.proxies.length] || null;

      const response = await fetch(`${this.baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "x-session-token": sessionToken,
          Origin: "https://klokapp.ai",
          Referer: "https://klokapp.ai/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        body: JSON.stringify({
          id: threadId,
          title: "",
          messages: [{ role: "user", content: message }],
          sources: [],
          model: "llama-3.3-70b-instruct",
          created_at: new Date().toISOString(),
          language: "english",
        }),
        agent: proxy ? new (require("https-proxy-agent").HttpsProxyAgent)(proxy) : null,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Send message failed: ${response.status} - ${errorText}`
        );
      }

      const responseText = await response.text();

      try {
        const data = JSON.parse(responseText);
        if (
          data.choices &&
          data.choices.length > 0 &&
          data.choices[0].message
        ) {
          return data.choices[0].message;
        } else if (data.message) {
          return { content: data.message };
        }
      } catch (e) {}

      return { content: responseText };
    } catch (error) {
      console.error("❌ Send message error:", error.message);
      throw error;
    }
  }

  async getUserLimits(wallet) {
    try {
      const sessionToken = this.sessionTokens.get(wallet.address);
      const proxy = this.proxies[this.wallets.indexOf(wallet) % this.proxies.length] || null;

      const response = await fetch(`${this.baseUrl}/rate-limit`, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "x-session-token": sessionToken,
          Origin: "https://klokapp.ai",
          Referer: "https://klokapp.ai/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        agent: proxy ? new (require("https-proxy-agent").HttpsProxyAgent)(proxy) : null,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to get rate limits: ${response.status} - ${errorText}`
        );
      }

      const rateLimitData = await response.json();

      return {
        remainingMessages: rateLimitData.remaining || 0,
        totalMessages: rateLimitData.limit || 0,
        isPremium: rateLimitData.limit > 10,
        resetTime: rateLimitData.reset_time || null,
      };
    } catch (error) {
      console.error("❌ Error getting rate limits:", error.message);
      return {
        remainingMessages: 10,
        totalMessages: 10,
        isPremium: false,
        resetTime: null,
      };
    }
  }

  async performChats(wallet, proxy) {
    try {
      console.log(`🚀 Starting chat sessions for wallet ${wallet.address}...`);
      let userLimits = await this.getUserLimits(wallet);
      console.log(
        `👤 Account status: ${userLimits.isPremium ? "⭐ Premium" : "🔄 Free"}`
      );
      console.log(
        `💬 Available messages: ${userLimits.remainingMessages}/${userLimits.totalMessages}`
      );

      if (userLimits.resetTime) {
        const resetTime =
          typeof userLimits.resetTime === "number"
            ? new Date(Date.now() + userLimits.resetTime * 1000)
            : new Date(userLimits.resetTime);
        console.log(`⏰ Message limit resets at: ${resetTime.toLocaleString()}`);
      }

      let chatCount = Math.min(10, userLimits.remainingMessages);

      if (chatCount <= 0) {
        console.log(`❗ No chat messages remaining for wallet ${wallet.address}.`);
        return;
      }

      console.log(`🎯 Will perform ${chatCount} chat sessions for wallet ${wallet.address}.`);

      let completedChats = 0;

      while (completedChats < chatCount) {
        if (completedChats > 0) {
          userLimits = await this.getUserLimits(wallet);
          if (userLimits.remainingMessages <= 0) {
            console.log(`⛔ No more messages remaining for wallet ${wallet.address}.`);
            break;
          }
        }

        const threadId = crypto.randomUUID();
        console.log(
          `\n📝 Chat ${
            completedChats + 1
          }/${chatCount} started for wallet ${wallet.address}, Thread ID: ${threadId}`
        );

        const question = await generateCryptoQuestion();
        console.log(`🤖 Gemini-generated question: ${question}`);

        const response = await this.sendMessage(wallet, threadId, question);
        console.log(
          `✅ Response received: ${response.content.substring(0, 100)}...`
        );

        completedChats++;
        console.log(`📊 Progress: ${completedChats}/${chatCount} completed`);

        if (completedChats < chatCount) {
          console.log(`⏳ Waiting 5 seconds...`);
          await delay(5000);
        }
      }

      console.log(`\n🎉 All chat sessions completed for wallet ${wallet.address}!`);
      userLimits = await this.getUserLimits(wallet);
      console.log(`💬 Final remaining messages: ${userLimits.remainingMessages}`);
    } catch (error) {
      console.error(`❌ Chat session error for wallet ${wallet.address}:`, error.message);
      this.sessionTokens.delete(wallet.address);
      throw error;
    }
  }
}

const bot = new KlokappBot();
bot.start().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n👋 Bot is shutting down...");
  bot.running = false;
  setTimeout(() => process.exit(0), 1000);
});
