const {
  ChannelType,
  PermissionFlagsBits,
  WebhookType,
} = require("discord.js");

// Prevent simultaneous requests from creating duplicate webhooks.
const pendingWebhooks = new Map();

async function getCharacterWebhook(channel) {
  if (channel.type !== ChannelType.GuildText) {
    throw new Error(
      "Character chats require a regular server text channel."
    );
  }

  if (pendingWebhooks.has(channel.id)) {
    return pendingWebhooks.get(channel.id);
  }

  const task = (async () => {
    const me =
      channel.guild.members.me ||
      await channel.guild.members.fetchMe();

    if (
      !channel.permissionsFor(me)?.has(
        PermissionFlagsBits.ManageWebhooks
      )
    ) {
      throw new Error(
        "I need Manage Webhooks permission in the chat's parent channel."
      );
    }

    // Find this bot's existing webhook in this channel.
    const webhooks = await channel.fetchWebhooks();

    const existing = webhooks.find((webhook) =>
      webhook.type === WebhookType.Incoming &&
      webhook.owner?.id === channel.client.user.id &&
      webhook.name === "Character Chat" &&
      webhook.channelId === channel.id &&
      webhook.token
    );

    return existing || await channel.createWebhook({
      name: "Character Chat",
      reason: "Send character replies in this channel's threads",
    });
  })();

  pendingWebhooks.set(channel.id, task);

  try {
    return await task;
  } finally {
    pendingWebhooks.delete(channel.id);
  }
}

async function sendCharacterMessage(thread, options) {
  const parent = await thread.guild.channels.fetch(thread.parentId);

  if (!parent) {
    throw new Error("The chat's parent channel is unavailable.");
  }

  const payload = {
    ...options,
    threadId: thread.id,
    allowedMentions: { parse: [] },
  };

  const webhook = await getCharacterWebhook(parent);

  try {
    return await webhook.send(payload);
  } catch (error) {
    // Discord error 10015 means the webhook no longer exists.
    // Find or create its replacement and retry once.
    if (Number(error.code) !== 10015) {
      throw error;
    }

    const replacement = await getCharacterWebhook(parent);
    return replacement.send(payload);
  }
}

module.exports = { sendCharacterMessage };