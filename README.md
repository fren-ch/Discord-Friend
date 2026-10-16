#TODO

- fix avatar
- gemini is really slow so either replace it with a faster model or find a way to improve the code so its faster













# Discord AI Social Agent

An experimental AI-powered social agent designed to participate naturally in Discord conversations.

Unlike traditional chatbots that simply respond whenever they receive a command, this project focuses on creating an AI character that behaves more like a member of a group chat. The agent can maintain a consistent personality, remember previous conversations, decide when it should speak, and generate context-aware responses.

The long-term goal is to explore how LLM-powered agents can behave naturally in real-time social environments.

---

## Features

### AI-Generated Conversations

Messages are generated using a Large Language Model while taking recent conversation history into account.

Instead of treating each message independently, the agent builds conversational context before generating a response.

Example:

```text
Andy: anyone playing valorant tonight?

Friend: probably around 9

AI: yeah i'll probably be around then
```

Rather than responding like a traditional assistant:

```text
Certainly! I would be happy to play Valorant with you at 9 PM.
```

---

### Dynamic Response Decisions

The AI does not need to respond to every message.

Before generating a response, the system evaluates whether the agent should participate in the conversation.

Possible signals include:

- Was the agent directly mentioned?
- Is someone asking a question?
- Is the agent already part of the conversation?
- How long has it been since the agent last spoke?
- Is the current topic relevant to the agent?
- How active is the conversation?
- Would responding interrupt another conversation?

Example decision:

```json
{
  "mentioned": false,
  "questionAsked": true,
  "activeConversation": true,
  "topicRelevant": true,
  "messagesSinceLastResponse": 4,
  "responseProbability": 0.82
}
```

---

### Configurable Personality

Each AI character can have its own personality configuration.

Example:

```json
{
  "name": "Milo",
  "personality": [
    "casual",
    "sarcastic",
    "friendly"
  ],
  "interests": [
    "gaming",
    "technology",
    "music"
  ],
  "messageStyle": {
    "averageLength": "short",
    "usesEmojis": false,
    "capitalization": "casual"
  }
}
```

The personality layer can influence:

- vocabulary
- humor
- interests
- response length
- emoji usage
- capitalization
- conversational style

---

## Conversation Memory

The agent can maintain memory across conversations.

### Short-Term Memory

Stores recent conversation messages so the AI understands what people are currently discussing.

```text
User A: are we still meeting tomorrow?

User B: yeah probably around 2

AI: 2 works for me
```

### Long-Term Memory

Important information can optionally be stored for later conversations.

Examples:

```text
User prefers playing support in Valorant.

User has class on Monday mornings.

The group normally plays games on Friday nights.
```

Instead of sending every previous message to the LLM, relevant memories can be retrieved when needed.

---

## Architecture

```text
Discord
   │
   ▼
Message Listener
   │
   ▼
Conversation Manager
   │
   ├──► Short-Term Memory
   │
   ├──► Long-Term Memory
   │
   ▼
Response Decision Engine
   │
   ├── Ignore
   │
   └── Respond
          │
          ▼
     Context Builder
          │
          ├── Personality
          ├── Memories
          ├── Recent Messages
          └── User Context
          │
          ▼
        LLM
          │
          ▼
 Natural Response Processing
          │
          ▼
       Discord
```

---

## Project Structure

```text
discord-ai-social-agent/
│
├── src/
│   │
│   ├── discord/
│   │   ├── client.js
│   │   ├── messageHandler.js
│   │   └── events/
│   │
│   ├── agent/
│   │   ├── agent.js
│   │   ├── shouldRespond.js
│   │   ├── contextBuilder.js
│   │   └── personality.js
│   │
│   ├── llm/
│   │   ├── provider.js
│   │   └── generateResponse.js
│   │
│   ├── memory/
│   │   ├── shortTermMemory.js
│   │   ├── longTermMemory.js
│   │   └── retrieval.js
│   │
│   ├── database/
│   │   └── database.js
│   │
│   └── utils/
│       └── helpers.js
│
├── config/
│   └── persona.json
│
├── tests/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Technology Stack

### Backend

- Node.js
- JavaScript
- Discord.js

### AI

- Large Language Model API
- Prompt engineering
- Context management
- Optional embedding-based memory retrieval

### Database

Initial implementation:

- SQLite

Possible future implementations:

- PostgreSQL
- Supabase
- MongoDB
- Vector database

### Future Dashboard

A React + Vite dashboard could be added for managing characters and viewing the agent's state.

---

## Response Pipeline

When a Discord message is received, the system follows several steps.

```text
1. Receive message
        ↓
2. Store message
        ↓
3. Analyze conversation
        ↓
4. Decide whether to respond
        ↓
5. Retrieve relevant memories
        ↓
6. Build LLM context
        ↓
7. Generate response
        ↓
8. Apply personality/style
        ↓
9. Send response
```

---

## Example

Conversation:

```text
Andy:
anyone getting on tonight

Alex:
maybe after dinner

AI:
what time

Alex:
probably like 8:30

AI:
yeah i'll be on
```

Internally:

```text
Incoming message
        ↓
Agent currently participating? YES
        ↓
Message relevant? YES
        ↓
Should respond? YES
        ↓
Retrieve recent conversation
        ↓
Apply personality
        ↓
Generate short response
```

---

# Roadmap

## Phase 1 — Discord Foundation

Create the basic Discord integration.

- [ ] Initialize Node.js project
- [ ] Install Discord.js
- [ ] Create Discord client
- [ ] Listen for incoming messages
- [ ] Send messages
- [ ] Add environment variable configuration
- [ ] Ignore messages generated by the agent itself

---

## Phase 2 — LLM Integration

Connect the Discord message system to an LLM.

- [ ] Create LLM provider module
- [ ] Send Discord messages to the model
- [ ] Generate responses
- [ ] Handle API errors
- [ ] Add response-length limits
- [ ] Add conversation context

---

## Phase 3 — Personality System

Create configurable AI characters.

- [ ] Add `persona.json`
- [ ] Character name
- [ ] Character description
- [ ] Personality traits
- [ ] Interests
- [ ] Speaking style
- [ ] Response length
- [ ] Emoji preferences

Example:

```json
{
  "name": "Milo",
  "description": "A college student who likes gaming and technology.",
  "traits": [
    "friendly",
    "casual",
    "sarcastic"
  ],
  "interests": [
    "Valorant",
    "AI",
    "music"
  ]
}
```

---

## Phase 4 — Short-Term Memory

Give the agent awareness of recent conversations.

- [ ] Store recent channel messages
- [ ] Track conversation participants
- [ ] Pass recent messages into the LLM
- [ ] Limit context length
- [ ] Remove outdated messages

---

## Phase 5 — Response Decision Engine

Allow the AI to decide when it should participate.

- [ ] Detect direct mentions
- [ ] Detect questions
- [ ] Track active conversations
- [ ] Calculate topic relevance
- [ ] Track time since previous response
- [ ] Generate response probability
- [ ] Allow agent to ignore conversations

Possible interface:

```js
const decision = await shouldRespond({
  message,
  recentMessages,
  currentConversation,
  personality
});

if (!decision.respond) {
  return;
}

await generateResponse();
```

---

## Phase 6 — Long-Term Memory

Allow the AI to remember useful information over time.

- [ ] Create memory database
- [ ] Extract important information from conversations
- [ ] Store user-related memories
- [ ] Retrieve relevant memories
- [ ] Add memory expiration
- [ ] Allow memories to be updated

Example:

```json
{
  "user": "Andy",
  "memory": "Usually plays Valorant around 9 PM.",
  "importance": 0.7
}
```

---

## Phase 7 — Natural Interaction

Improve conversational realism.

- [ ] Typing indicators
- [ ] Variable response delays
- [ ] Reactions
- [ ] Reply-to-message support
- [ ] Different message lengths
- [ ] Avoid repetitive responses
- [ ] Conversation cooldowns

---

## Phase 8 — Multiple Characters

Support multiple AI personalities.

```text
characters/
├── milo.json
├── luna.json
└── kai.json
```

Each character could have separate:

- personalities
- memories
- interests
- speaking styles
- conversation histories

---

## Phase 9 — Character Dashboard

Create a React dashboard for managing agents.

Potential features:

```text
Dashboard
│
├── Characters
├── Personality Editor
├── Memory Viewer
├── Conversation History
├── Agent Settings
└── Usage Analytics
```

Possible stack:

- React
- Vite
- Tailwind CSS
- Express
- SQLite/PostgreSQL

---

## Phase 10 — Advanced Agent Behavior

Possible future experiments:

- sentiment awareness
- topic tracking
- relationship modeling
- conversation summaries
- semantic memory search
- RAG-based memories
- voice channel support
- image understanding
- GIF/reaction selection
- tool usage
- web search
- multiple LLM providers

---

# Design Goals

The project focuses on four main ideas.

### Natural Conversation

Responses should sound appropriate for casual group conversations rather than like formal AI assistant responses.

### Selective Participation

The agent should understand that sometimes the most natural response is no response at all.

### Persistent Personality

The agent should maintain recognizable personality traits across conversations.

### Contextual Memory

Previous interactions should influence future conversations without requiring the entire conversation history to be sent to the model.

---

# Possible Research Questions

This project can also be used to experiment with questions such as:

- How should an AI decide when to join a group conversation?
- How much conversation history is necessary for natural responses?
- How should long-term memories be selected?
- How can personality consistency be measured?
- When should old memories be forgotten?
- How can repetitive LLM behavior be reduced?
- How should an AI distinguish conversations directed toward it from conversations between other users?

---

# Safety and Platform Notes

Discord provides official bot accounts and APIs for automated applications. Automating regular Discord user accounts may violate Discord's platform rules and can result in account restrictions or termination.

The core social-agent architecture in this repository is therefore designed to remain independent from any specific account type or chat platform.

Platform-specific integrations should follow the applicable platform's API rules and terms.

---

# Future Platform Support

Because the AI logic is separated from the Discord integration, additional adapters could eventually be added.

```text
Social Agent Core
        │
        ├── Discord Adapter
        ├── Web Chat Adapter
        ├── Slack Adapter
        └── Custom Chat Adapter
```

This allows the conversational agent, personality system, and memory architecture to remain reusable.

---

# Status

🚧 **Early Development**

Current focus:

```text
Phase 1 — Discord Foundation
```

---

# License

This project is intended for educational and experimental use.

License to be determined.

---

## Current Implementation (October 2026)

This section describes what is implemented in the repository today. The architecture, response pipeline, and roadmap above describe the longer-term project vision; they should not be read as features that are already implemented.

### Character Profiles

The bot currently registers a guild-scoped `/character` command with these subcommands:

- `/character create` opens a two-step form for a character's name, optional franchise/source, personality, backstory, speaking style, and greeting. The name is the only required field. Supplying the franchise/source helps Gemini identify the right character and find a matching avatar.
- `/character list` privately lists up to 15 profiles owned by the user, including their IDs.
- `/character view` privately displays a profile when its ID belongs to the user.
- `/character delete` lets you choose an owned profile by name, then asks for confirmation before deleting it, its saved conversation history, and its Discord chat threads.

Each saved MongoDB document includes `ownerUserId`, the form fields, `createdAt`, and `updatedAt`. MongoDB adds the document `_id`. Profiles are filtered by the invoking Discord user's ID for list and view operations.

The database defaults to `discord_friend`, and the collection is `characters`. The MongoDB driver creates an index on `ownerUserId` and `createdAt` during startup.

### Setup and Run

Requirements: Node.js 20.19 or newer, a Discord bot application, and a MongoDB database. MongoDB Atlas is supported.

Create `bot/.env` with your own values:

```dotenv
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_GUILD_ID=your_test_server_id
MONGODB_URI=mongodb+srv://database_user:url_encoded_password@your_atlas_host/?retryWrites=true&w=majority&appName=your_cluster
MONGODB_DATABASE=discord_friend
```

The token and application ID must belong to the same Discord application. The guild ID is copied from the test Discord server with Developer Mode enabled. In the Discord Developer Portal, invite the bot with the `bot` and `applications.commands` scopes. The current message listener also uses the privileged Message Content intent.

For MongoDB Atlas, create a database user under **Database Access**, allow the bot computer's IP under **Network Access**, and copy the Node.js URI from **Connect → Drivers**. Use the database user's credentials, not your Atlas website login. For an `mongodb+srv://` connection string, use the hostname exactly as Atlas provides it and do not add a port. URL-encode special characters in the password.

From the repository root:

```powershell
Set-Location bot
npm install
npm start
```

The start script registers the guild command, connects to MongoDB, then logs the bot in. Leave the terminal running while testing. Press **Ctrl+C** to stop it. In the configured Discord server, try `/character create`, then `/character list`, then `/character view` with an ID from the list. `/character delete` lets you search for a character by name and shows a confirmation prompt before permanently removing the profile, saved history, and threads.

### Inspecting Data in VS Code

Install the MongoDB for VS Code extension, choose **Add Connection**, and connect to the same Atlas cluster. Browse the `discord_friend` database and `characters` collection. Keep the URI private; do not commit it or post it in chat.

### Security and Development Notes

- `bot/.env` and `bot/node_modules/` are ignored by Git. Keep `bot/package-lock.json` tracked for repeatable installs.
- Check `git status` before committing and stage only files intended for the update. Never commit `.env` or paste tokens and database URIs into logs or screenshots.
- If a credential has been exposed, reset it in Discord or Atlas. Removing a secret in a later commit does not remove it from Git history.
- The current plain-message listener is a development placeholder: it logs message text and gives a fixed reply to `hello`. It does not save chat messages. Review or remove this behavior before using the bot with other people.

### Current Limitations

- LLM integration is not implemented. Character data is not yet sent to a model.
- Profiles cannot yet be edited through Discord commands.
- Conversation history is stored, but long-term memory is not implemented.
- Automated tests and production deployment are not configured.

The next planned step is to load a selected character profile from MongoDB and include its relevant traits in an LLM prompt. Before storing or sending conversation history, define user consent, privacy, and retention rules.








## Run the Bot and Add It to Other Servers

The bot runs as one hosted process and can serve multiple Discord servers.
Server owners only need an installation link; they do not need your code,
API keys, database credentials, or webhook URLs.

### 1. Configure the Discord Application

Open https://discord.com/developers/applications and select your application.

Under **Bot**:

- Enable **Message Content Intent**.
- Enable **Public Bot** if other people should be able to install it.
- Leave **Requires OAuth2 Code Grant** disabled for this basic installation flow.

Under **Installation**:

- Enable **Guild Install**.
- Select **Discord Provided Link**.
- Configure the Guild Install scopes:
  - `bot`
  - `applications.commands`

Give the bot these permissions:

- View Channels
- Send Messages
- Send Messages in Threads
- Read Message History
- Create Private Threads
- Manage Webhooks
- Embed Links

Channel permission overrides must also allow the bot to perform these actions.
Users need permission to use application commands in the selected channel.

### 2. Configure the Bot Host

Use a host that supports a continuously running Node.js process.

For a service connected to this repository, configure:

- Root directory: `bot`
- Install command: `npm install`
- Start command: `npm start`
- Running instances: `1`
- Node.js: `22`

Add these environment variables through the hosting dashboard:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id

MONGODB_URI=your_mongodb_connection_string
MONGODB_DATABASE=discord_friend

GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.5-flash-lite
BRAVE_SEARCH_API_KEY=your_brave_search_key
```

Allow the hosting service to connect to MongoDB Atlas using its Network Access
settings.

Do not commit or distribute a populated `.env` file.
The per-channel webhook implementation does not require
`CHARACTER_WEBHOOK_URL`.

### 3. Start the Bot

For local testing, run from the repository root:

```bash
cd bot
npm install
npm start
```

The current start script registers the global commands and then starts the bot.

Check the logs for:

```text
Logged in as ...
```

Keep the process running. After the hosted copy works, stop your local copy
to prevent duplicate replies.

### 4. Install the Bot in a Server

Copy the installation link from the application's **Installation** page.

Open the link, select **Add to server**, choose a server you are authorized
to manage, and approve the requested permissions.

The same installation link can be used for other servers. Registering global
commands does not automatically install the bot into a server.

### 5. Create a Character and Chat

In a regular server text channel:

1. Run `/character create`.
2. Enter the name and any optional character details, then click **Continue** for the remaining fields.
3. Run `/character chat` and select the saved character.
4. Open the private thread created by the bot.
5. Send a message inside that thread.

The bot creates or reuses its webhook in the parent text channel.
Character greetings and replies use the character's saved name and avatar. If
you leave the greeting blank, the bot generates a short greeting from the
character's personality, backstory, and speaking style when their first chat
opens. A greeting you enter yourself is used as-is.

Characters can also send one occasional, low-pressure check-in in their
existing private thread after a random 2–48 hours without user activity. A
character waits for the user to reply before sending another check-in. The
feature is enabled by default; set `CHECK_INS_ENABLED` to `false` in
`bot/src/discord/checkIns.js` to turn off all automatic check-ins. Existing
conversations receive a check-in schedule after the user next sends a message.

No manual webhook setup is required from server owners.

### Troubleshooting

- **No `/character` command:** Confirm the application is installed with the
  correct scopes, global registration succeeded, and channel command permissions
  allow access. Refresh Discord if necessary.
- **Bot is offline:** Check the hosting logs and confirm the process is running.
- **Thread creation fails:** Check Create Private Threads and channel access.
- **Webhook creation fails:** Check Manage Webhooks in the parent channel.
- **Ordinary messages receive no response:** Check Message Content Intent,
  thread membership, and the runtime logs.
- **Orange avatar:** Check the `Avatar lookup failed:` message. The character
  may already have a fallback avatar saved.