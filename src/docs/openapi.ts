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
    { name: "Apps" },
    { name: "Operators" },
    { name: "Webhooks" },
    { name: "Calls" },
    { name: "Reports" },
    { name: "Settings" },
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
                    minio: { type: "string" },
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
    "/apps": {
      get: {
        tags: ["Apps"],
        summary: "List apps such as MilliyPay, AnjirPay, Migsend",
        parameters: [
          { name: "includeOperators", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "Apps" } },
      },
      post: {
        tags: ["Apps"],
        summary: "Create an app",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "MilliyPay" },
                  slug: { type: "string", example: "milliy-pay" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/apps/{id}": {
      get: {
        tags: ["Apps"],
        summary: "Get an app with its operators",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "App" } },
      },
      patch: {
        tags: ["Apps"],
        summary: "Update an app",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  slug: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Apps"],
        summary: "Delete an app that has no operators",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" } },
      },
    },
    "/operators": {
      get: {
        tags: ["Operators"],
        summary: "List operators with name, code, and app",
        parameters: [
          { name: "appId", in: "query", schema: { type: "string" } },
          { name: "code", in: "query", schema: { type: "string", example: "103" } },
        ],
        responses: { "200": { description: "Operators" } },
      },
      post: {
        tags: ["Operators"],
        summary: "Create an operator. code is the NewTel firstAnswer/allAnswer extension, e.g. 103",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "code", "appId"],
                properties: {
                  name: { type: "string", example: "Dilshod" },
                  code: { type: "string", example: "103" },
                  appId: { type: "string", example: "milliy-pay" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" } },
      },
    },
    "/operators/{id}": {
      get: {
        tags: ["Operators"],
        summary: "Get operator by id or code",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Operator" } },
      },
      patch: {
        tags: ["Operators"],
        summary: "Update operator name, code, or app",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  code: { type: "string" },
                  appId: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" } },
      },
      delete: {
        tags: ["Operators"],
        summary: "Delete an operator",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "204": { description: "Deleted" } },
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
          "Stores every event. When inboundCallEnd or outboundCallEnd arrives with status=answered, the call recording is downloaded, stored in MinIO, transcribed with gpt-4o-transcribe-diarize, analyzed, saved to the database, and appended to the daily OpenAI thread.",
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
          { name: "operatorCode", in: "query", schema: { type: "string", example: "103" } },
          { name: "appId", in: "query", schema: { type: "string", example: "milliy-pay" }, description: "App id, slug, or name. Matches transcript appName, not only operator catalog." },
          { name: "app", in: "query", schema: { type: "string", example: "MilliyPay" } },
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
    "/calls/{id}/recording": {
      get: {
        tags: ["Calls"],
        summary: "Get a temporary MinIO URL for the stored call recording",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Presigned recording URL" },
          "404": { description: "Call or recording not found" },
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
    "/settings": {
      get: {
        tags: ["Settings"],
        summary: "List analysis prompts and the active prompt",
        responses: { "200": { description: "Settings" } },
      },
      patch: {
        tags: ["Settings"],
        summary: "Switch the active analysis prompt without changing prompt text",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["activeAnalysisPromptId"],
                properties: {
                  activeAnalysisPromptId: {
                    type: "string",
                    enum: ["structured", "uzbek-brief"],
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated settings" } },
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
          operatorName: { type: "string" },
          operatorCode: { type: "string" },
          appName: { type: "string" },
          summary: { type: "string" },
          internalNote: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
};
