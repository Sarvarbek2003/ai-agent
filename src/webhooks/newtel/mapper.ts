import { CallDirection, CallStatus, Prisma } from "@prisma/client";
import { unixToDate } from "../../lib/dates";
import { asNumber, asString, NewtelEventData, NewtelEventName } from "./types";

export type CallPatch = {
  vpbxId?: string;
  direction?: CallDirection;
  status?: CallStatus;
  customerNumber?: string;
  operatorNumber?: string;
  dnid?: string;
  clid?: string;
  firstAnswer?: string;
  allAnswer?: Prisma.InputJsonValue;
  durationSec?: number;
  ringDurationSec?: number;
  startedAt?: Date;
  endedAt?: Date;
  answeredAt?: Date;
  callRecordLink?: string;
};

const END_EVENTS = new Set(["inboundCallEnd", "outboundCallEnd"]);
const START_EVENTS = new Set(["inboundCallStart", "outboundCallStart"]);
const ANSWER_EVENTS = new Set(["inboundCallAnswer"]);

function normalizeStatus(status?: string): CallStatus | undefined {
  if (!status) {
    return undefined;
  }
  const value = status.toLowerCase().replace(/\s+/g, "_");
  if (value === "answered") {
    return CallStatus.answered;
  }
  if (value === "no_answer" || value === "noanswer") {
    return CallStatus.no_answer;
  }
  return undefined;
}

function directionFromEvent(eventName: NewtelEventName): CallDirection {
  if (eventName.startsWith("inbound")) {
    return CallDirection.inbound;
  }
  if (eventName.startsWith("outbound")) {
    return CallDirection.outbound;
  }
  return CallDirection.unknown;
}

export function mapEventToCallPatch(eventName: NewtelEventName, data: NewtelEventData): CallPatch {
  const vpbxId = asString(data.vpbxId);
  const firstAnswer = asString(data.firstAnswer) ?? asString(data.fisrtAnswer);
  const activeNumber = asString(data.activeNumber);
  const internalClid = asString(data.internalClid);
  const ringingNumber = asString(data.ringingNumber);
  const clid = asString(data.clid);
  const dnid = asString(data.dnid);
  const externalClid = asString(data.externalClid);
  const direction = directionFromEvent(eventName);
  const eventTime = unixToDate(data.time);
  const callStatus = normalizeStatus(asString(data.status));

  const patch: CallPatch = {
    vpbxId,
    dnid,
    clid,
    firstAnswer,
    callRecordLink: asString(data.callRecordLink),
    durationSec: asNumber(data.duration),
    ringDurationSec: asNumber(data.ringduration),
  };

  if (data.allAnswer !== undefined) {
    patch.allAnswer = data.allAnswer as Prisma.InputJsonValue;
  }

  if (direction !== CallDirection.unknown) {
    patch.direction = direction;
  }

  if (direction === CallDirection.inbound) {
    patch.customerNumber = clid;
    patch.operatorNumber = firstAnswer ?? activeNumber ?? ringingNumber;
  }

  if (direction === CallDirection.outbound) {
    patch.customerNumber = dnid;
    patch.operatorNumber = internalClid ?? ringingNumber;
    if (externalClid && !patch.clid) {
      patch.clid = externalClid;
    }
  }

  if (START_EVENTS.has(eventName)) {
    patch.status = CallStatus.ringing;
    patch.startedAt = eventTime;
  }

  if (ANSWER_EVENTS.has(eventName)) {
    patch.status = CallStatus.answered;
    patch.answeredAt = eventTime;
    patch.operatorNumber = activeNumber ?? patch.operatorNumber;
  }

  if (END_EVENTS.has(eventName)) {
    patch.endedAt = eventTime;
    if (callStatus === CallStatus.answered) {
      patch.status = CallStatus.awaiting_recording;
    } else if (callStatus === CallStatus.no_answer) {
      patch.status = CallStatus.no_answer;
    } else {
      patch.status = CallStatus.completed;
    }
  }

  if (eventName === "ringingStart" && !patch.status) {
    patch.status = CallStatus.ringing;
  }

  return patch;
}

export function shouldAnalyzeCall(eventName: NewtelEventName, data: NewtelEventData): boolean {
  if (!END_EVENTS.has(eventName)) {
    return false;
  }

  const status = asString(data.status)?.toLowerCase();
  const duration = asNumber(data.duration) ?? 0;
  return status === "answered" && duration > 0;
}
