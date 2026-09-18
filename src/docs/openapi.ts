import { webhookUrl } from "../config";

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "AI Agent API",
    version: "1.0.0",
    description:
      "Custom AI agents. First agent: call-analytic — NewTel webhooks, gpt-4o-transcribe-diarize, structured call analysis, and a daily OpenAI thread for end-of-day reports.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Health" },
    { name: "Agents" },
    { name: "Webhooks" },
    { name: "Calls" },
    { name: "Reports" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    database: { type: "string" },
                    webhookUrl: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/agents": {
      get: {
        tags: ["Agents"],
        summary: "List custom agents and their tasks",
        responses: {
          "200": { description: "Agent catalog" },
        },
      },
    },
    "/webhooks/newtel": {
      get: {
        tags: ["Webhooks"],
        summary: "Public NewTel webhook URL and setup instructions",
        responses: {
          "200": {
            description: "Webhook configuration",
            content: {
              "application/json": {
                example: {
                  source: "newtel",
                  method: "POST",
                  url: webhookUrl(),
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Webhooks"],
        summary: "Receive NewTel VPBX webhook events",
        description:
          "Stores every event. When inboundCallEnd or outboundCallEnd arrives with status=answered, the call recording is downloaded, transcribed with gpt-4o-transcribe-diarize, analyzed, saved to the database, and appended to the daily OpenAI thread.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewtelWebhook" },
              examples: {
                inboundCallEnd: {
                  value: {
                    event: "inboundCallEnd",
                    signature: "sha1-hex",
                    data: {
                      vpbxId: "call-123",
                      time: 1758190000,
                      dnid: "712345678",
                      clid: "998901234567",
                      status: "answered",
                      duration: 95,
                      ringduration: 8,
                      firstAnswer: "101",
                      allAnswer: ["101"],
                      callRecordLink: "https://records.new-tel.net/file.mp3",
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Event stored; analysis queued when the call ended answered" },
          "401": { description: "Invalid signature" },
        },
      },
    },
    "/calls": {
      get: {
        tags: ["Calls"],
        summary: "List stored calls",
        parameters: [
          { name: "date", in: "query", schema: { type: "string", example: "2026-09-18" } },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "ringing",
                "in_progress",
                "answered",
                "no_answer",
                "completed",
                "awaiting_recording",
                "transcribing",
                "analyzing",
                "analyzed",
                "skipped",
                "failed",
              ],
            },
          },
          { name: "operatorNumber", in: "query", schema: { type: "string" } },
          { name: "customerNumber", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        ],
        responses: { "200": { description: "Paginated calls" } },
      },
    },
    "/calls/{id}": {
      get: {
        tags: ["Calls"],
        summary: "Get one call with webhook events, transcript, and analysis",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Internal call id or NewTel vpbxId",
          },
        ],
        responses: {
          "200": { description: "Call details" },
          "404": { description: "Not found" },
        },
      },
    },
    "/calls/{id}/reprocess": {
      post: {
        tags: ["Calls"],
        summary: "Re-run transcription and analysis for a call",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "202": { description: "Reprocess queued" },
          "404": { description: "Not found" },
        },
      },
    },
    "/reports/daily": {
      get: {
        tags: ["Reports"],
        summary: "Get the stored daily report if it was already generated",
        parameters: [
          { name: "date", in: "query", schema: { type: "string", example: "2026-09-18" } },
        ],
        responses: {
          "200": { description: "Stored daily thread and report" },
          "404": { description: "Thread not found" },
        },
      },
      post: {
        tags: ["Reports"],
        summary: "Ask the daily OpenAI thread for an end-of-day report",
        description:
          "Does not read call rows from the database. The model answers from the daily conversation thread that collected every analyzed call during the day.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  date: { type: "string", example: "2026-09-18" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Report generated from the OpenAI thread" },
          "404": { description: "No thread for that date" },
        },
      },
    },
    "/reports/daily/thread": {
      get: {
        tags: ["Reports"],
        summary: "Get today's OpenAI conversation thread id",
        parameters: [
          { name: "date", in: "query", schema: { type: "string" } },
          { name: "create", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Daily thread" } },
      },
    },
  },
  components: {
    schemas: {
      NewtelWebhook: {
        type: "object",
        required: ["event", "data"],
        properties: {
          event: {
            type: "string",
            enum: [
              "inboundCallStart",
              "inboundCallEnd",
              "outboundCallStart",
              "outboundCallEnd",
              "ringingStart",
              "ringingEnd",
              "inboundCallAnswer",
            ],
          },
          signature: { type: "string" },
          data: {
            type: "object",
            properties: {
              vpbxId: { type: "string" },
              time: { type: "integer" },
              callRecordLink: { type: "string" },
              dnid: { type: "string" },
              clid: { type: "string" },
              status: { type: "string", enum: ["answered", "no answer"] },
              duration: { type: "integer" },
              ringduration: { type: "integer" },
              firstAnswer: { type: "string" },
              allAnswer: { type: "array", items: { type: "string" } },
              externalClid: { type: "string" },
              internalClid: { type: "string" },
              ringingNumber: { type: "string" },
              activeNumber: { type: "string" },
            },
          },
        },
      },
      CallAnalysis: {
        type: "object",
        properties: {
          customerMainProblem: { type: "string" },
          problemCategory: { type: "string" },
          customerEmotionalState: { type: "string" },
          operatorCommunicationQuality: { type: "string" },
          operatorUnderstoodCustomer: { type: "string", enum: ["yes", "no", "unknown"] },
          customerUnderstoodOperator: { type: "string", enum: ["yes", "no", "unknown"] },
          problemResolved: { type: "string", enum: ["yes", "no", "partial", "unknown"] },
          summary: { type: "string" },
          internalNote: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
};
