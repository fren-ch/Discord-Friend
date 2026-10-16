const { ChannelType } = require("discord.js");
const {
  createConversation,
  getConversationByCharacter,
  getConversationByThread,
  claimGreetingDelivery,
  recordGreetingDelivery,
  markGreetingFailure,
} = require("../database/characters");
const { sendCharacterMessage } = require("../discord/characterWebhooks");
const { DEFAULT_AVATAR_URL } = require("../ai/characterAvatar");

class ChatSetupError extends Error {}

async function removeNewThread(thread) {
  try {
    await thread.delete("Clean up failed character chat setup");
    return true;
  } catch (error) {
    console.error("Chat cleanup failed:", { threadId: thread.id, code: error.code });
    return false;
  }
}

// Check actual messages before recovering a send whose outcome is unknown.
async function findDeliveredGreeting(thread, conversation) {
  const hooks = await thread.parent.fetchWebhooks();
  const owned = new Set(hooks.filter(hook =>
    hook.owner?.id === thread.client.user.id
  ).keys());
  const messages = await thread.messages.fetch({ limit: 100 });
  return messages.find(message =>
    owned.has(message.webhookId) &&
    message.content === conversation.greetingDelivery.text
  );
}

async function ensureGreeting(thread, conversation, character, ownerUserId) {
  const delivery = conversation.greetingDelivery;
  // Older records have no delivery state. Leave them unchanged.
  if (!delivery || delivery.status === "sent") return null;

  try {
    if (delivery.status === "sending" || delivery.status === "uncertain") {
      const existing = await findDeliveredGreeting(thread, conversation);
      if (existing) {
        await recordGreetingDelivery(conversation._id, ownerUserId, existing.id);
        return null;
      }
      // Absence from recent history does not prove that a timed-out send failed.
      return "I couldn't confirm greeting delivery. I won't resend it automatically. You can still chat here; ask the bot owner to check the logs.";
    }

    const claimed = await claimGreetingDelivery(conversation._id, ownerUserId);
    if (!claimed) {
      return "Greeting setup is already in progress. Run /character chat again shortly.";
    }

    let sent;
    try {
      sent = await sendCharacterMessage(thread, {
        username: character.name,
        avatarURL: character.avatarUrl || DEFAULT_AVATAR_URL,
        content: delivery.text,
      });
    } catch (error) {
      const status = Number(error.status);
      const definitelyRejected =
        (status >= 400 && status < 500 && status !== 408) ||
        error.message === "I need Manage Webhooks permission in the chat's parent channel.";
      await markGreetingFailure(
        conversation._id, ownerUserId,
        definitelyRejected ? "failed" : "uncertain"
      ).catch(() => {});
      console.error("Greeting send failed:", {
        threadId: thread.id, status: error.status, code: error.code,
      });
      return definitelyRejected
        ? "The greeting couldn't be delivered. Check the bot's channel permissions, then run /character chat again. Your conversation is saved."
        : "Greeting delivery couldn't be confirmed. Your conversation is saved; run /character chat again to check delivery without blindly resending.";
    }

    await recordGreetingDelivery(conversation._id, ownerUserId, sent.id);
    return null;
  } catch (error) {
    console.error("Greeting recovery needs attention:", {
      threadId: thread.id, code: error.code,
    });
    return "Your thread is available, but greeting setup couldn't be confirmed. Run /character chat again to retry recovery.";
  }
}

async function openCharacterChat(interaction, character) {
  const ownerUserId = interaction.user.id;
  let conversation = await getConversationByCharacter({
    ownerUserId,
    characterId: character._id,
    guildId: interaction.guildId,
  });
  let thread;
  const resumed = Boolean(conversation);

  if (conversation) {
    try {
      thread = await interaction.guild.channels.fetch(conversation.threadId);
    } catch (error) {
      if (Number(error.code) !== 10003) throw error;
    }
    if (!thread || thread.type !== ChannelType.PrivateThread) {
      throw new ChatSetupError("Your saved thread is unavailable. Your conversation data is still saved; ask the bot owner to help recover it.");
    }
    if (thread.archived) await thread.setArchived(false);
    await thread.members.add(ownerUserId);
  } else {
    const greeting = character.greeting?.trim() ||
      `Hi! I'm ${character.name}. What would you like to talk about?`;
    thread = await interaction.channel.threads.create({
      name: `Chat with ${character.name}`.slice(0, 100),
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 1440,
      invitable: false,
    });

    try {
      await thread.members.add(ownerUserId);
    } catch (error) {
      const cleaned = await removeNewThread(thread);
      throw new ChatSetupError(cleaned
        ? "I couldn't add you to the chat. The new thread was removed. Check permissions and try again."
        : `I couldn't finish setup or remove the new thread <#${thread.id}>. Ask the bot owner to clean it up.`);
    }

    try {
      conversation = await createConversation({
        threadId: thread.id,
        guildId: interaction.guildId,
        ownerUserId,
        characterId: character._id,
        greeting,
      });
    } catch (error) {
      // A lost database acknowledgement can look like a failed insert.
      let confirmed;
      try {
        confirmed = await getConversationByThread(thread.id, ownerUserId);
      } catch {}
      if (confirmed) {
        conversation = confirmed;
      } else if ([11000, 121].includes(Number(error.code))) {
        // Duplicate-key and validation errors definitively reject this insert.
        const cleaned = await removeNewThread(thread);
        throw new ChatSetupError(cleaned
          ? "The database rejected this conversation. The new thread was removed. Please contact the bot owner."
          : `The database rejected setup and cleanup failed for <#${thread.id}>. Contact the bot owner.`);
      } else {
        // Do not delete a thread when its database save may have succeeded.
        console.error("Conversation save outcome uncertain:", {
          threadId: thread.id, ownerUserId, code: error.code,
        });
        throw new ChatSetupError(`I couldn't confirm the database save for <#${thread.id}>. The thread was kept to protect any saved data. Contact the bot owner before opening another chat.`);
      }
    }
  }

  const warning = await ensureGreeting(thread, conversation, character, ownerUserId);
  return { thread, resumed, warning };
}

module.exports = { openCharacterChat, ChatSetupError };
