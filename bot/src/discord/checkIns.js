const { ChannelType } = require("discord.js");
const {
  claimCheckIn,
  getDueCheckIns,
  getCharacterById,
  getConversationByThread,
  markCheckInFailure,
  recordCheckInDelivery,
  recoverStaleCheckIns,
} = require("../database/characters");
const { generateCharacterCheckIn } = require("../ai/gemini");
const { sendCharacterMessage } = require("./characterWebhooks");
const { DEFAULT_AVATAR_URL } = require("../ai/characterAvatar");
const { getNextCheckInAt } = require("../ai/checkInPolicy");

// Set false to disable all proactive character check-ins.
const CHECK_INS_ENABLED = true;
const CHECK_IN_INTERVAL_MS = 60_000;
const CHECK_IN_BATCH_SIZE = 10;
const STALE_CHECK_IN_MS = 10 * 60 * 1000;

async function processDueCheckIns(client) {
  const now = new Date();
  const due = await getDueCheckIns(now, CHECK_IN_BATCH_SIZE);

  for (const candidate of due) {
    const conversation = await claimCheckIn(candidate._id, new Date());
    if (!conversation) continue;

    let stage = "loadCharacter";
    try {
      const character = await getCharacterById(
        conversation.characterId.toString(),
        conversation.ownerUserId
      );
      if (!character) {
        throw new Error("Character profile for check-in is unavailable");
      }

      stage = "loadThread";
      const guild = await client.guilds.fetch(conversation.guildId);
      const thread = await guild.channels.fetch(conversation.threadId);
      if (!thread || thread.type !== ChannelType.PrivateThread) {
        throw new Error("Character check-in thread is unavailable");
      }
      if (thread.archived) await thread.setArchived(false);
      await thread.members.add(conversation.ownerUserId);

      stage = "generate";
      const content = await generateCharacterCheckIn(
        character,
        conversation.messages || []
      );

      // A user message or pause request during generation cancels this check-in.
      const current = await getConversationByThread(conversation.threadId, conversation.ownerUserId);
      if (!current || current.checkInStatus !== "sending" ||
          !current.nextCheckInAt ||
          current.checkInAttemptedAt?.getTime() !== conversation.checkInAttemptedAt?.getTime()) continue;

      stage = "send";
      const sent = await sendCharacterMessage(thread, {
        username: character.name,
        avatarURL: character.avatarUrl || DEFAULT_AVATAR_URL,
        content,
      });

      stage = "record";
      await recordCheckInDelivery(conversation._id, content, sent.id);
    } catch (error) {
      const uncertain = stage === "send" || stage === "record";
      const status = Number(error.status);
      const definitelyRejected = status >= 400 && status < 500 && status !== 408;
      const mayHaveDelivered = uncertain && !definitelyRejected;
      try {
        await markCheckInFailure(conversation._id, {
          uncertain: mayHaveDelivered,
          retryAt: mayHaveDelivered ? null : getNextCheckInAt(),
        });
      } catch (markError) {
        console.error("Could not save character check-in failure:", {
          conversationId: conversation._id.toString(),
          code: markError.code,
        });
      }
      console.error("Character check-in failed:", {
        conversationId: conversation._id.toString(),
        stage,
        code: error.code,
        status: error.status,
      });
    }
  }
}

async function startCheckInScheduler(client) {
  if (!CHECK_INS_ENABLED) return null;

  const run = async () => {
    try {
      await recoverStaleCheckIns(new Date(Date.now() - STALE_CHECK_IN_MS));
      await processDueCheckIns(client);
    } catch (error) {
      console.error("Character check-in scheduler failed:", error);
    }
  };

  await run();
  const timer = setInterval(run, CHECK_IN_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = {
  CHECK_INS_ENABLED,
  getNextCheckInAt,
  startCheckInScheduler,
};
