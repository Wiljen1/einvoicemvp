# Chat UI

The main chat is designed to feel close to a future Slackbot interaction while still running locally.

## Conversation Layout

Each submitted question creates one conversation turn:

1. A `You` message bubble shows the submitted question.
2. A `Knowledge Bot` message appears underneath.
3. While running, the bot message shows inline processing status.
4. When complete, the same bot turn shows the final answer.
5. Supporting details stay collapsed in a thread-style details section.

The chat does not show the old generic placeholder:

```text
Assistant
Ask a question about the approved document source.
```

Instead, the header is compact:

```text
Knowledge Bot
Ask a question based on the indexed document source.
```

## Inline Processing

The chat uses the existing async endpoints:

- `POST /api/chat/start`
- `GET /api/chat/status/:sessionId`
- `POST /api/chat/cancel/:sessionId`

Processing is displayed inline inside the bot reply, not as a large separate status card.

Typical step labels:

- Checking local Codex
- Checking indexed database
- Checking guardrails and similar questions
- Searching indexed database
- Preparing context
- Asking local Codex
- Formatting answer
- Completed

The inline status includes a small spinner, progress percentage, and cancel button when a request is running.

## Thread Details

The answer stays visible by default. Supporting details are collapsed behind:

```text
Show sources and confidence
```

Thread details include:

- source references
- source snippets
- confidence score and level
- whether Codex was used
- whether the answer was reused
- response time
- similarity score when available
- low-confidence or stale-index warnings

## Answer Labels

The bot answer shows a small label so users can understand how it was produced:

- `Answered with Codex using indexed documents`
- `Reused from a similar previous question`
- `Answered with local placeholder using indexed documents`
- `No supported answer found in indexed documents`

When an answer is reused, the user can run a fresh search from that same conversation turn.

## Safety Behavior

Chat remains database-backed:

- It searches SQLite `DocumentChunk` records.
- It does not scan folders during chat.
- It does not OCR during chat.
- It does not use excluded documents as sources.
- It does not browse the internet.

The Slack-style UI is only a presentation change over the same local-first chat flow.
