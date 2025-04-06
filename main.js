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
  constructor() {
    this.baseUrl = "https://api1-pp.klokapp.ai/v1";
    this.wallet = null;
    this.sessionToken = null;
    this.running = true; // Flag to keep the script running
  }

  async start() {
    try {
      // Initial setup
      this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
      console.log("🔑 Wallet initialized:", this.wallet.address);

      // Run indefinitely
      while (this.running) {
        try {
          // Connect wallet if needed
          if (!this.sessionToken) {
            await this.connectWallet();
          }

          // Perform available chats
          await this.performChats();

          // After chats complete, wait for a short period before checking again
          console.log(
            "😴 Bot is sleeping for 5 minutes before checking for new messages..."
          );
          await delay(5 * 60 * 1000); // 5 minute default check interval
        } catch (error) {
          console.error("❌ Session error:", error.message);
          console.log("🔄 Reconnecting in 1 minute...");
          this.sessionToken = null; // Clear token to force reconnect
          await delay(60000); // Wait 1 minute before retry
        }
      }
    } catch (error) {
      console.error("❌ Critical error:", error);
      console.log(
        "⚠️ Bot has stopped due to a critical error. Please restart manually."
      );
    }
  }

  async connectWallet() {
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

      const verifyBody = {
        signedMessage: signature,
        message: messageToSign,
        referral_code: null,
      };

      console.log("🔐 Verifying wallet...");
      const verifyResponse = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify(verifyBody),
      });

      const responseText = await verifyResponse.text();

      if (!verifyResponse.ok) {
        throw new Error(
          `Verification failed: ${verifyResponse.status} - ${responseText}`
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

      this.sessionToken = verifyData.session_token;
      console.log("✅ Wallet connected successfully!");
    } catch (error) {
      console.error("❌ Wallet connection error:", error.message);
      throw error;
    }
  }

  async sendMessage(threadId, message) {
    try {
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
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
        body: JSON.stringify({
          id: threadId,
          title: "",
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          sources: [],
          model: "llama-3.3-70b-instruct",
          created_at: new Date().toISOString(),
          language: "english",
        }),
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

  async getUserLimits() {
    try {
      const response = await fetch(`${this.baseUrl}/rate-limit`, {
        method: "GET",
        headers: {
          Accept: "*/*",
          "x-session-token": this.sessionToken,
          Origin: "https://klokapp.ai",
          Referer: "https://klokapp.ai/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
          "sec-fetch-site": "same-site",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
        },
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

  async performChats() {
    try {
      console.log("🚀 Starting chat sessions...");

      let userLimits = await this.getUserLimits();
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

        console.log(
          `⏰ Message limit resets at: ${resetTime.toLocaleString()}`
        );

        const now = new Date();
        const timeUntilReset = resetTime - now;

        if (timeUntilReset > 0) {
          console.log(
            `⏳ Time until reset: ${Math.floor(timeUntilReset / 60000)} minutes`
          );
        }
      }

      let chatCount = Math.min(10, userLimits.remainingMessages);

      if (chatCount <= 0) {
        console.log("❗ No chat messages remaining. Will check again later.");

        return;
      }

      console.log(
        `🎯 Will perform ${chatCount} chat sessions based on remaining limit.`
      );

      let completedChats = 0;

      while (completedChats < chatCount) {
        if (completedChats > 0) {
          userLimits = await this.getUserLimits();
          if (userLimits.remainingMessages <= 0) {
            console.log(
              "⛔ No more messages remaining. Stopping chat sessions."
            );
            break;
          }
        }

        const threadId = crypto.randomUUID();
        console.log(
          `\n📝 Chat ${
            completedChats + 1
          }/${chatCount} started, Thread ID: ${threadId}`
        );

        const question =
          questions[Math.floor(Math.random() * questions.length)];
        console.log(`❓ Question: ${question}`);

        const response = await this.sendMessage(threadId, question);
        console.log(
          `✅ Response received: ${response.content.substring(0, 100)}...`
        );

        completedChats++;

        console.log(`📊 Progress: ${completedChats}/${chatCount} completed`);
        console.log(
          `💬 Remaining: ~${
            userLimits.remainingMessages - completedChats
          } messages`
        );

        if (completedChats < chatCount) {
          console.log(`⏳ Waiting 5 seconds before next chat...`);
          await delay(5000);
        }
      }

      console.log("\n🎉 All chat sessions completed!");

      userLimits = await this.getUserLimits();
      console.log(
        `💬 Final remaining messages: ${userLimits.remainingMessages}`
      );
    } catch (error) {
      console.error("❌ Chat session error:", error.message);
      throw error;
    }
  }
}

// Create and start the bot
const bot = new KlokappBot();
bot.start().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Bot is shutting down...");
  bot.running = false;
  setTimeout(() => process.exit(0), 1000);
});
