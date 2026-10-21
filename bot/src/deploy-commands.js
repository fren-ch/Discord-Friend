
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
      .setName("chat")
      .setDescription("Chat with an existing character")
      .addStringOption((option) =>
        option
          .setName("character")
          .setDescription("Choose your character")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("view")
      .setDescription("View one of your characters")
      .addStringOption((option) =>
        option
          .setName("character")
          .setDescription("Choose your character")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("avatar")
      .setDescription("Change a saved character's profile picture")
      .addStringOption((option) =>
        option
          .setName("character")
          .setDescription("Choose your character")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete one of your characters")
      .addStringOption((option) =>
        option
          .setName("character")
          .setDescription("Choose the character to delete")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

// checks if the required env are set 
async function deployCommands() {
  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    throw new Error(
      "Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in bot/.env"
    );
  }

// Create a new REST instance and set the bot token 
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  console.log("Registered /character globally.");


  await rest.put(
    Routes.applicationCommands(DISCORD_CLIENT_ID),
    { body: [characterCommand.toJSON()] }
  );

  console.log("Registered /character in your test server.");
}

deployCommands().catch((error) => {
  console.error("Command registration failed:", error.message);
  process.exitCode = 1;
});
