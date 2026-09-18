import { prisma } from "../../lib/prisma";
import { config, webhookUrl } from "../../config";
import { verifyNewtelSignature } from "../../lib/newtel-signature";
import { collectOperatorCodes, findOperatorByCodes } from "../../lib/operators";
import { enqueueUnique } from "../../lib/queue";
import { processCall } from "../../agents/call-analytic/processor";
import { mapEventToCallPatch, shouldAnalyzeCall } from "./mapper";
import { asString, isRecord, NewtelEventData, NewtelWebhookPayload } from "./types";

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}

export function parseNewtelPayload(body: unknown): NewtelWebhookPayload {
  if (!isRecord(body)) {
    throw new Error("Webhook body must be a JSON object");
  }

  const data = isRecord(body.data) ? (body.data as NewtelEventData) : (body as NewtelEventData);
  const event = asString(body.event) ?? asString(data.event);
  const signature = asString(body.signature) ?? asString(data.signature);

  return { event, data, signature };
}

export async function ingestNewtelWebhook(body: unknown) {
  const payload = parseNewtelPayload(body);
  if (!payload.event) {
    throw new Error("Missing webhook event name");
  }

  const data = payload.data ?? {};
  const vpbxId = asString(data.vpbxId);
  let signatureValid = false;

  if (config.newtelWebhookKey) {
    if (!payload.signature) {
      const error = new Error("Missing webhook signature");
      (error as Error & { status: number }).status = 401;
      throw error;
    }
    signatureValid = verifyNewtelSignature({
      eventName: payload.event,
      data,
      signature: payload.signature,
      webhookKey: config.newtelWebhookKey,
    });
    if (!signatureValid) {
      const error = new Error("Invalid webhook signature");
      (error as Error & { status: number }).status = 401;
      throw error;
    }
  }

  const event = await prisma.webhookEvent.create({
    data: {
      eventName: payload.event,
      signature: payload.signature,
      signatureValid,
      vpbxId,
      payload: body as object,
    },
  });

  if (!vpbxId) {
    return {
      accepted: true,
      eventId: event.id,
      callId: null,
      queued: false,
      webhookUrl: webhookUrl(),
    };
  }

  const patch = compact(mapEventToCallPatch(payload.event, data));
  const operator = await findOperatorByCodes(
    collectOperatorCodes([
      patch.firstAnswer,
      patch.operatorNumber,
      data.firstAnswer,
      data.fisrtAnswer,
      data.activeNumber,
      data.internalClid,
      data.allAnswer,
    ]),
  );
  if (operator) {
    patch.operatorId = operator.id;
    patch.operatorNumber = operator.code;
  }

  const call = await prisma.call.upsert({
    where: { vpbxId },
    create: {
      vpbxId,
      ...patch,
    },
    update: patch,
  });

  await prisma.webhookEvent.update({
    where: { id: event.id },
    data: {
      callId: call.id,
      processedAt: new Date(),
    },
  });

  const queued = shouldAnalyzeCall(payload.event, data);
  if (queued) {
    enqueueUnique(`call:${call.id}`, () => processCall(call.id));
  }

  return {
    accepted: true,
    eventId: event.id,
    callId: call.id,
    vpbxId: call.vpbxId,
    status: call.status,
    queued,
    operator: operator
      ? { id: operator.id, name: operator.name, code: operator.code, app: operator.app.name }
      : null,
    webhookUrl: webhookUrl(),
  };
}
