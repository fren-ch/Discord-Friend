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
    messages: [
      {
        role: "assistant",
        content: greeting,
        createdAt: now,
      },
    ],
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
  assistantReply,
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
            {
              role: "assistant",
              content: assistantReply,
              createdAt: now,
            },
          ],
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

module.exports = {
  connectToDatabase,
  saveCharacter,
  getCharactersByOwner,
  getCharacterById,
  getConversationsByCharacter,
  deleteCharacterAndConversations,
  createConversation,
  getConversationByCharacter,
  getConversationByThread,
  saveConversationExchange,
};
