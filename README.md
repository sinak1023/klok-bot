# KlokappAI Testnet Bot

A Node.js bot for automated participation in the KlokappAI testnet.

## Overview

This bot helps automate interactions with the KlokappAI platform by:
- Connecting to the KlokappAI API using an Ethereum wallet
- Automatically sending chat messages
- Managing rate limits
- Rotating between different crypto/blockchain related questions

## Prerequisites

- Node.js 16.0.0 or higher
- An Ethereum private key

# First register
https://klokapp.ai?referral_code=R3ZDBNE9

## Installation

1. Clone the repository:
    ```
    git clone https://github.com/mesamirh/KlokappAi-Testnet-Bot.git
    cd KlokappAi-Testnet-Bot
    ```

2. Install dependencies:
    ```
    npm install
    ```

3. Create a `.env` file in the project root with your Ethereum private key:
    ```
    PRIVATE_KEY=your_private_key_here
    ```

## Usage

Start the bot:
```
npm start
```

The bot will:
1. Connect your wallet to KlokappAI
2. Check available message limits
3. Send chat messages until reaching the limit
4. Wait for the rate limit to reset before continuing



## Configuration

You can modify the `questions` array in `main.js` to customize the messages sent by the bot.

## Disclaimer

This bot is for educational purposes only. Use at your own risk and in compliance with KlokappAI's terms of service.
