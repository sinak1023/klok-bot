import "dotenv/config";
import { ethers } from "ethers";
import fetch from "node-fetch";
import crypto from "crypto";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Random questions for chat
const questions = [
  "What are the latest updates in Ethereum?",
  "How does proof of stake work?",
  "What are the best DeFi protocols?",
  "Explain smart contract security",
  "What is the current state of Layer 2 solutions?",
  "How do rollups work?",
  "What are the benefits of Web3?",
  "Explain blockchain interoperability",
  "What are the trending NFT projects?",
  "How does tokenomics work?",
  "What is the future of DAOs?",
  "Explain MEV in blockchain",
];

class KlokappBot {
  constructor(privateKey) {
    this.baseUrl = "https://api1-pp.klokapp.ai/v1";
    this.wallet = new ethers.Wallet(privateKey);
    this.sessionToken = null;
    this.running = true;
  }

  async start() {
    try {
      console.log("🔑 Wallet initialized:", this.wallet.address);

      while (this.running) {
        try {
          if (!this.sessionToken) {
            await this.connectWallet();
          }

          await this.performChats();

          console.log("😴 Bot is sleeping for 5 minutes...");
          await delay(5 * 60 * 1000);
        } catch (error) {
          console.error("❌ Session error:", error.message);
          console.log("🔄 Reconnecting in 1 minute...");
          this.sessionToken = null;
          await delay(60000);
        }
      }
    } catch (error) {
      console.error("❌ Critical error:", error);
      console.log("⚠️ Bot stopped. Please restart manually.");
    }
  }

  async connectWallet() {
    const headers = {
      accept: "*/*",
      "content-type": "application/json",
      origin: "https://klokapp.ai",
      referer: "https://klokapp.ai/",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    };

    const nonce = ethers.hexlify(ethers.randomBytes(48)).substring(2);
    const messageToSign = [
      `klokapp.ai wants you to sign in with your Ethereum account:`,
      this.wallet.address,
      ``,
      ``,
      `URI: https://klokapp.ai/`,
      `Version: 1`,
      `Chain ID: 1`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");

    console.log("📝 Signing authentication message...");
    const signature = await this.wallet.signMessage(messageToSign);

    const body = {
      signedMessage: signature,
      message: messageToSign,
      referral_code: null,
    };

    const res = await fetch(`${this.baseUrl}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Verify failed: ${res.status} - ${text}`);

    const data = JSON.parse(text);
    if (!data.session_token) throw new Error("No session_token returned");

    this.sessionToken = data.session_token;
    console.log("✅ Wallet connected.");
  }

  async sendMessage(threadId, message) {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "x-session-token": this.sessionToken,
        Origin: "https://klokapp.ai",
        Referer: "https://klokapp.ai/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
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
    });

    const text = await response.text();
    if (!response.ok) throw new Error(`Chat failed: ${response.status} - ${text}`);

    try {
      const data = JSON.parse(text);
      if (data.choices?.[0]?.message) return data.choices[0].message;
      if (data.message) return { content: data.message };
    } catch {}

    return { content: text };
  }

  async getUserLimits() {
    const response = await fetch(`${this.baseUrl}/rate-limit`, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "x-session-token": this.sessionToken,
        Origin: "https://klokapp.ai",
        Referer: "https://klokapp.ai/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Rate limit fetch failed: ${response.status} - ${text}`);
    }

    const data = await response.json();
    return {
      remainingMessages: data.remaining || 0,
      totalMessages: data.limit || 0,
      isPremium: data.limit > 10,
      resetTime: data.reset_time || null,
    };
  }

  async performChats() {
    console.log("🚀 Starting chat session...");
    let userLimits = await this.getUserLimits();

    if (userLimits.remainingMessages <= 0) {
      console.log("❌ No messages left. Waiting for reset...");
      return;
    }

    const count = Math.min(10, userLimits.remainingMessages);
    for (let i = 0; i < count; i++) {
      const question = questions[Math.floor(Math.random() * questions.length)];
      const threadId = crypto.randomUUID();

      console.log(`\n🧵 Chat ${i + 1}/${count} | Thread: ${threadId}`);
      console.log(`❓ Q: ${question}`);

      const response = await this.sendMessage(threadId, question);
      console.log(`✅ A: ${response.content.substring(0, 100)}...`);

      if (i < count - 1) {
        console.log(`⏳ Waiting 5 seconds...`);
        await delay(5000);
      }
    }

    console.log("🎉 All chats done!");
  }
}

export default KlokappBot;
