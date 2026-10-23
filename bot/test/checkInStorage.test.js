const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("delivery atomically records separate check-in memory capped at twenty entries", async () => {
  const updates = [];
  const collection = {
    async createIndex() {},
    async updateOne(filter, update) {
      updates.push({ filter, update });
      return { matchedCount: 1 };
    },
  };
  const context = {
    module: { exports: {} },
    process: { env: { MONGODB_URI: "test" } },
    require(name) {
      assert.equal(name, "mongodb");
      return {
        ObjectId: class {},
        MongoClient: class {
          async connect() {}
          db() { return { collection: () => collection }; }
        },
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/database/characters.js"), "utf8"), context);
  const database = context.module.exports;
  await database.connectToDatabase();
  await database.recordCheckInDelivery("conversation", "A fresh check-in", "message-id");
  const { filter, update } = updates[0];
  assert.equal(filter._id, "conversation");
  assert.equal(filter.checkInStatus, "sending");
  assert.equal(update.$set.checkInPendingReply, true);
  assert.equal(update.$set.nextCheckInAt, null);
  const memory = update.$push.recentCheckIns;
  assert.equal(memory.$slice, -20);
  assert.equal(memory.$each[0].content, "A fresh check-in");
  assert.equal(memory.$each[0].messageId, "message-id");
  assert.ok(memory.$each[0].createdAt);
  assert.equal(update.$push.messages.$each[0].content, memory.$each[0].content);
  assert.equal(updates.length, 1);
});
