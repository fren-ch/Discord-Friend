//This file contains functions for interacting with the characters collection in MongoDB.

const { MongoClient, ObjectId } = require("mongodb");

let mongoClient;
let charactersCollection;
let conversationsCollection;

async function connectToDatabase() {
  if (charactersCollection) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI in bot/.env");
  }

  mongoClient = new MongoClient(uri);

  try {
    await mongoClient.connect();

    const database = mongoClient.db(
      process.env.MONGODB_DATABASE || "discord_friend"
    );

    const collection = database.collection("characters");
    await collection.createIndex({ ownerUserId: 1, createdAt: -1 });

    // Create a unique index on the threadId field in the conversations collection
    const conversations = database.collection("conversations");

    await conversations.createIndex(
      { threadId: 1 },
      { unique: true }
    );


    await conversations.createIndex(
    { ownerUserId: 1, characterId: 1, guildId: 1 },
    {
      unique: true,
      name: "one_conversation_per_user_character_guild",
    }
  );

    await conversations.createIndex({ nextCheckInAt: 1 });

    charactersCollection = collection;
    conversationsCollection = conversations;


  } catch (error) {
    await mongoClient.close();
    mongoClient = undefined;
    throw error;
  }
}

function getCollection() {
  if (!charactersCollection) {
    throw new Error("MongoDB has not been connected");
  }

  return charactersCollection;
}

async function saveCharacter(character) {
  const now = new Date();
  const document = {
    ...character,
    createdAt: now,
    updatedAt: now,
  };

  const result = await getCollection().insertOne(document);
  return { ...document, _id: result.insertedId };
}

async function getCharactersByOwner(ownerUserId) {
  return getCollection()
    .find({ ownerUserId })
    .sort({ createdAt: -1 })
    .toArray();
}

async function getCharacterById(id, ownerUserId) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return getCollection().findOne({
    _id: new ObjectId(id),
    ownerUserId,
  });
}

async function updateCharacterAvatar(id, ownerUserId, avatarUrl) {
  if (!ObjectId.isValid(id)) return false;
  const result = await getCollection().updateOne(
    { _id: new ObjectId(id), ownerUserId },
    { $set: { avatarUrl, updatedAt: new Date() } }
  );
  return result.matchedCount === 1;
}

async function getConversationsByCharacter(ownerUserId, characterId) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  return conversationsCollection
    .find({ ownerUserId, characterId })
    .project({ threadId: 1, guildId: 1 })
    .toArray();
}

async function deleteCharacterAndConversations(id, ownerUserId) {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  const characterId = new ObjectId(id);
  const result = await getCollection().deleteOne({
    _id: characterId,
    ownerUserId,
  });

  if (result.deletedCount !== 1) {
    return false;
  }

  await conversationsCollection.deleteMany({ ownerUserId, characterId });
  return true;
}


// This function creates a new conversation document in the conversations collection
async function createConversation({
  threadId,
  guildId,
  ownerUserId,
  characterId,
  greeting,
  nextCheckInAt,
}) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  const now = new Date();

  const conversation = {
    threadId,
    guildId,
    ownerUserId,
    characterId,
    messages: [],
    greetingDelivery: {
      text: greeting,
      status: "pending",
      attemptedAt: null,
      messageId: null,
    },
    nextCheckInAt,
    checkInStatus: "pending",
    checkInPendingReply: false,
    createdAt: now,
    updatedAt: now,
  };

  const result = await conversationsCollection.insertOne(conversation);

  return { ...conversation, _id: result.insertedId };
}


async function getConversationByCharacter({
  ownerUserId,
  characterId,
  guildId,
}) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  return conversationsCollection.findOne(
    {
      ownerUserId,
      characterId,
      guildId,
    },
    {
      sort: { createdAt: -1 },
    }
  );
}

async function getConversationByThread(threadId, ownerUserId) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  return conversationsCollection.findOne({
    threadId,
    ownerUserId,
  });
}



async function saveConversationExchange({
  conversationId,
  ownerUserId,
  userMessage,
  assistantReplies,
  userCreatedAt,
}) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }

  const now = new Date();

  const result = await conversationsCollection.updateOne(
    {
      _id: conversationId,
      ownerUserId,
    },
    {

      $push: {
        messages: {
          $each: [
            {
              role: "user",
              content: userMessage,
              createdAt: userCreatedAt,
            },
            ...assistantReplies.map((content) => ({
              role: "assistant",
              content,
              createdAt: now,
            })),
          ],
          $slice: -250,
        },
      },
      $set: {
        updatedAt: now,
      },
    }
  );

  if (result.matchedCount !== 1) {
    throw new Error("Could not find the conversation to save");
  }
}

async function recordCheckInActivity(threadId, ownerUserId, nextCheckInAt) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  const result = await conversationsCollection.updateOne(
    { threadId, ownerUserId },
    {
      $set: {
        nextCheckInAt,
        checkInStatus: "pending",
        checkInPendingReply: false,
        updatedAt: new Date(),
      },
    }
  );
  if (result.matchedCount !== 1) {
    throw new Error("Could not update character check-in activity");
  }
}

async function getDueCheckIns(now, limit = 10) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  return conversationsCollection
    .find({
      nextCheckInAt: { $type: "date", $lte: now },
      "greetingDelivery.status": "sent",
      checkInPendingReply: { $ne: true },
      checkInStatus: { $ne: "sending" },
    })
    .sort({ nextCheckInAt: 1 })
    .limit(limit)
    .toArray();
}

async function claimCheckIn(conversationId, now) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  return conversationsCollection.findOneAndUpdate(
    {
      _id: conversationId,
      nextCheckInAt: { $type: "date", $lte: now },
      "greetingDelivery.status": "sent",
      checkInPendingReply: { $ne: true },
      checkInStatus: { $ne: "sending" },
    },
    {
      $set: {
        checkInStatus: "sending",
        checkInAttemptedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );
}

async function recordCheckInDelivery(conversationId, content, messageId) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  const now = new Date();
  const result = await conversationsCollection.updateOne(
    { _id: conversationId, checkInStatus: "sending" },
    {
      $set: {
        checkInStatus: "sent",
        checkInPendingReply: true,
        nextCheckInAt: null,
        checkInMessageId: messageId,
        updatedAt: now,
      },
      $push: {
        messages: {
          $each: [{ role: "assistant", content, createdAt: now }],
          $slice: -250,
        },
      },
    }
  );
  if (result.matchedCount !== 1) {
    throw new Error("Could not record character check-in delivery");
  }
}

async function markCheckInFailure(conversationId, { uncertain, retryAt }) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  const result = await conversationsCollection.updateOne(
    { _id: conversationId, checkInStatus: "sending" },
    {
      $set: {
        checkInStatus: uncertain ? "uncertain" : "failed",
        checkInPendingReply: uncertain,
        nextCheckInAt: retryAt,
        updatedAt: new Date(),
      },
    }
  );
  if (result.matchedCount !== 1) {
    throw new Error("Could not record character check-in failure");
  }
}

async function recoverStaleCheckIns(staleBefore) {
  if (!conversationsCollection) {
    throw new Error("MongoDB has not been connected");
  }
  await conversationsCollection.updateMany(
    {
      checkInStatus: "sending",
      checkInAttemptedAt: { $lt: staleBefore },
    },
    {
      $set: {
        checkInStatus: "uncertain",
        checkInPendingReply: true,
        nextCheckInAt: null,
        updatedAt: new Date(),
      },
    }
  );
}


async function claimGreetingDelivery(conversationId, ownerUserId) {
  if (!conversationsCollection) throw new Error("MongoDB has not been connected");
  return conversationsCollection.findOneAndUpdate(
    {
      _id: conversationId,
      ownerUserId,
      "greetingDelivery.status": { $in: ["pending", "failed"] },
    },
    { $set: {
      "greetingDelivery.status": "sending",
      "greetingDelivery.attemptedAt": new Date(),
      updatedAt: new Date(),
    } },
    { returnDocument: "after" }
  );
}

async function recordGreetingDelivery(conversationId, ownerUserId, messageId) {
  if (!conversationsCollection) throw new Error("MongoDB has not been connected");
  const conversation = await conversationsCollection.findOne({
    _id: conversationId, ownerUserId,
  });
  if (!conversation?.greetingDelivery) {
    throw new Error("Conversation greeting state is unavailable");
  }
  if (conversation.greetingDelivery.status === "sent") return;
  const now = new Date();
  const result = await conversationsCollection.updateOne(
    { _id: conversationId, ownerUserId, "greetingDelivery.status": { $ne: "sent" } },
    {
      $set: {
        "greetingDelivery.status": "sent",
        "greetingDelivery.messageId": messageId,
        updatedAt: now,
      },
      $push: { messages: {
        $each: [{
          role: "assistant",
          content: conversation.greetingDelivery.text,
          createdAt: conversation.createdAt,
        }],
        $position: 0,
        $slice: -250,
      } },
    }
  );
  if (result.matchedCount !== 1) {
    const latest = await conversationsCollection.findOne({ _id: conversationId, ownerUserId });
    if (latest?.greetingDelivery?.status !== "sent") {
      throw new Error("Could not record greeting delivery");
    }
  }
}

async function markGreetingFailure(conversationId, ownerUserId, status) {
  if (!conversationsCollection) throw new Error("MongoDB has not been connected");
  if (!["failed", "uncertain"].includes(status)) throw new Error("Invalid greeting status");
  await conversationsCollection.updateOne(
    { _id: conversationId, ownerUserId, "greetingDelivery.status": "sending" },
    { $set: { "greetingDelivery.status": status, updatedAt: new Date() } }
  );
}


let databaseClosing;

function closeDatabase() {
  if (databaseClosing) return databaseClosing;
  const client = mongoClient;
  if (!client) return Promise.resolve();

  databaseClosing = Promise.resolve().then(() => client.close()).finally(() => {
    if (mongoClient === client) {
      mongoClient = undefined;
      charactersCollection = undefined;
      conversationsCollection = undefined;
    }
    databaseClosing = undefined;
  });
  return databaseClosing;
}

module.exports = {
  closeDatabase,
  claimCheckIn,
  claimGreetingDelivery,
  getDueCheckIns,
  recordGreetingDelivery,
  recordCheckInActivity,
  recordCheckInDelivery,
  markGreetingFailure,
  markCheckInFailure,
  recoverStaleCheckIns,
  connectToDatabase,
  saveCharacter,
  updateCharacterAvatar,
  getCharactersByOwner,
  getCharacterById,
  getConversationsByCharacter,
  deleteCharacterAndConversations,
  createConversation,
  getConversationByCharacter,
  getConversationByThread,
  saveConversationExchange,
};
