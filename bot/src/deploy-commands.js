
// Load env variables from the .env file
const path = require("node:path");

// register slash commands with Discord API
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

// import discord tools
const {
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");

// 
const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
} = process.env;


// Define the /character command with its subcommands
const characterCommand = new SlashCommandBuilder()
  .setName("character")
  .setDescription("Create and manage your characters")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Create a new character")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("list")
      .setDescription("List your characters")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("view")
      .setDescription("View one of your characters")
      .addStringOption((option) =>
        option
          .setName("id")
          .setDescription("The character's ID")
          .setRequired(true)
      )
  );

// checks if the required env are set 
async function deployCommands() {
  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    throw new Error(
      "Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID in bot/.env"
    );
  }

// Create a new REST instance and set the bot token 
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  console.log("Registering the /character command...");

  // Sends PUT request to Discord API to register the /character command in the specified guild 
  await rest.post(
    Routes.applicationGuildCommands(
      DISCORD_CLIENT_ID,
      DISCORD_GUILD_ID
    ),
    { body: characterCommand.toJSON() }
  );

  console.log("Registered /character in your test server.");
}

deployCommands().catch((error) => {
  console.error("Command registration failed:", error.message);
  process.exitCode = 1;
});