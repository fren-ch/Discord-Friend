
//This file conneccts Discord and route connections


require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  // Don't let the bot respond to itself
  if (message.author.bot) {
    return;
  }

  console.log(`${message.author.username}: ${message.content}`);

  if (message.content.toLowerCase() === "hello") {
    message.reply("gay");
  }
});

client.login(process.env.DISCORD_TOKEN);