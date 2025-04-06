import "dotenv/config";
import { ethers } from "ethers";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";
import crypto from "crypto";

// Fix __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Delay utility
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// File paths
const privateKeyFilePath = path.join(__dirname, "private-keys.txt");
const proxyFilePath = path.join(__dirname, "proxy.txt");
const questionsFilePath = path.join(__dirname, "questions.txt");

// Load data from files
function loadPrivateKeys() {
  return fs.readFileSync(privateKeyFilePath, "utf-8")
    .split("\n").map(k => k.trim()).filter(Boolean);
}

function loadProxies() {
  return fs.readFileSync(proxyFilePath, "utf-8")
    .split("\n").map(p => p.trim()).filter(Boolean);
}

function loadQuestions() {
  return fs.readFileSync(questionsFilePath, "utf-8")
    .split("\n").map(q => q.trim()).filter(Boolean);
}

// Bot class
class KlokappBot {
  constructor(privateKey, proxyUrl, walletIndex, totalWallets) {
    this.baseUrl = "https://api1-pp.klokapp.ai/v1";
    this.wallet = new ethers.Wallet(privateKey);
    this.sessionToken = null;
    this.walletIndex = walletIndex;
    this.totalWallets = totalWallets;
    this.proxyUrl = proxyUrl;
    this.agent = new HttpsProxyAgent(this.proxyUrl);
  }

  async start() {
    try {
      console.log(`\n🔑 Wallet ${this.walletIndex + 1}/${this.totalWallets}: ${this.wallet.address}`);
      this.sessionToken = null;
      await this.connectWallet();

      const userLimits = await this.getUserLimits();
      console.log(`💬 Available messages: ${userLimits.remainingMessages}/${userLimits.totalMessages}`);

      if (userLimits.remainingMessages <= 0) {
        console.log("⛔ No messages remaining. Skipping...");
        return;
      }

      await this.performChats();
    } catch (error) {
      console.error("❌ Critical error:", error.message);
    }
  }

  async connectWallet() {
    try {
      console.log("🔐 Connecting wallet...");

      const nonce = ethers.hexlify(ethers.randomBytes(48)).substring(2);
      const messageToSign = [
        "klokapp.ai wants you to sign in with your Ethereum account:",
        this.wallet.address,
        "",
        "",
        "URI: https://klokapp.ai/",
        "Version: 1",
        "Chain ID: 1",
        `Nonce: ${nonce}`,
        `Issued At: ${new Date().toISOString()}`
      ].join("\n");

      const signature = await this.wallet.signMessage(messageToSign);

      const response = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          Origin: "https://klokapp.ai",
          Referer: "https://klokapp.ai/",
        },
        body: JSON.stringify({ signedMessage: signature, message: messageToSign, referral_code: null }),
        agent: this.agent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Verification failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (!data.session_token) {
        throw new Error("No session_token returned.");
      }

      this.sessionToken = data.session_token;
      console.log("✅ Wallet connected successfully.");
    } catch (error) {
      console.error("❌ Wallet connection error:", error.message);
      throw error;
    }
  }

  async getUserLimits() {
    try {
      const response = await fetch(`${this.baseUrl}/rate-limit`, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "x-session-token": this.sessionToken,
          Origin: "https://klokapp.ai",
          Referer: "https://klokapp.ai/",
        },
        agent: this.agent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get rate limits: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return {
        remainingMessages: data.remaining || 0,
        totalMessages: data.limit || 0,
        isPremium: data.limit > 10,
        resetTime: data.reset_time || null,
      };
    } catch (error) {
      console.error("❌ Failed to fetch user limits:", error.message);
      return {
        remainingMessages: 0,
        totalMessages: 0,
        isPremium: false,
        resetTime: null,
      };
    }
  }

  async performChats() {
    try {
      const questions = loadQuestions();
      console.log("💬 Starting chat session...");

      let userLimits = await this.getUserLimits();
      const chatCount = Math.min(10, userLimits.remainingMessages);

      if (chatCount <= 0) {
        console.log("⚠️ No chats to perform.");
        return;
      }

      let completed = 0;

      while (completed < chatCount) {
        userLimits = await this.getUserLimits();
        if (userLimits.remainingMessages <= 0) {
          console.log("⛔ Out of messages.");
          break;
        }

        const threadId = crypto.randomUUID();
        const question = questions[Math.floor(Math.random() * questions.length)];

        console.log(`\n📨 Chat ${completed + 1}/${chatCount} - Thread ID: ${threadId}`);
        console.log(`❓ Question: ${question}`);

        // Simulate sending the question (here you'd add the actual API request to send it)
        completed++;
        console.log(`✅ Progress: ${completed}/${chatCount}`);
        console.log(`💬 Messages left (est.): ${userLimits.remainingMessages - completed}`);

        if (completed < chatCount) {
          console.log(`⏳ Waiting 5 seconds before next chat...`);
          await delay(5000);
        }
      }

      console.log("🎉 Chat session complete.");
    } catch (error) {
      console.error("❌ Error during chats:", error.message);
    }
  }
}

// Main bot runner
async function runBots() {
  const privateKeys = loadPrivateKeys();
  const proxies = loadProxies();

  if (privateKeys.length !== proxies.length) {
    console.error("❌ Number of private keys and proxies must match.");
    return;
  }

  console.log(`🔢 Total wallets: ${privateKeys.length}`);

  for (let i = 0; i < privateKeys.length; i++) {
    console.log(`🚀 Running bot ${i + 1}/${privateKeys.length} using proxy ${proxies[i]}`);
    const bot = new KlokappBot(privateKeys[i], proxies[i], i, privateKeys.length);
    await bot.start();

    console.log(`✅ Wallet ${i + 1} done.`);
    console.log(`⏳ Waiting 60 seconds before next wallet...`);
    await delay(60000);
  }

  console.log("🔁 All wallets processed. Restarting in 24 hours...");
  await delay(24 * 60 * 60 * 1000);
}

runBots();
