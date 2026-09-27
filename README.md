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
