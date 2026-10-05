//This file contains functions for interacting with the characters collection in MongoDB.

const { MongoClient, ObjectId } = require("mongodb");

let mongoClient;
let charactersCollection;

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
    charactersCollection = collection;
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
    .limit(15)
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

module.exports = {
  connectToDatabase,
  saveCharacter,
  getCharactersByOwner,
  getCharacterById,
};