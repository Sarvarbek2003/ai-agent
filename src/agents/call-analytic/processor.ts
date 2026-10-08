import { Call, CallStatus, Prisma, Transcript } from "@prisma/client";
import { config } from "../../config";
import { getRecordingObject } from "../../lib/minio";
import { collectOperatorCodes, findOperatorByCodes, OperatorWithApp } from "../../lib/operators";
import { prisma } from "../../lib/prisma";
import { isAutoAnalysisEnabled } from "../../lib/settings";
import { analyzeTranscript } from "./analyze";
import { appendCallToDailyThread } from "./daily-thread";
import { downloadAndStoreRecording } from "./recording";
import { transcribeCallRecording } from "./transcribe";

type LoadedCall = Call & {
  transcript: Transcript | null;
  operator: OperatorWithApp | null;
  app: { id: string; name: string; slug: string } | null;
};

export async function processCall(
  callId: string,
  options?: { force?: boolean; fromTranscript?: boolean; storeRecordingOnly?: boolean },
): Promise<void> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { transcript: true, analysis: true, operator: { include: { app: true } }, app: true },
  });

  if (!call) {
    return;
  }

  if (!options?.force && call.status === CallStatus.analyzed) {
    return;
  }

  const autoAnalysisEnabled = await isAutoAnalysisEnabled();
  const runPipeline = Boolean(options?.force || autoAnalysisEnabled);

  if (options?.storeRecordingOnly) {
    try {
      if (!call.recordingObjectKey) {
        await ensureStoredRecording(call);
      }
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.transcribing, failedReason: null },
      });
    } catch (error) {
      await markFailed(call.id, error);
      throw error;
    }
    return;
  }

  if (options?.fromTranscript) {
    if (!runPipeline) {
      return;
    }
    if (call.status === CallStatus.failed) {
      return;
    }
    if (!call.transcript) {
      return;
    }

    try {
      await analyzeSavedTranscript(call, call.transcript);
    } catch (error) {
      await markFailed(call.id, error);
      throw error;
    }
    return;
  }

  try {
    const audio = await ensureStoredRecording(call);
    if (!runPipeline) {
      await prisma.call.update({
        where: { id: call.id },
        data: { status: CallStatus.transcribing, failedReason: null },
      });
      return;
    }

    await prisma.call.update({
      where: { id: call.id },
      data: { status: CallStatus.transcribing, failedReason: null },
    });

    const transcript = await transcribeCallRecording(audio.body, audio.fileName);
    const savedTranscript = await prisma.transcript.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        model: config.transcribeModel,
        durationSec: transcript.duration,
        fullText: transcript.text,
        segments: transcript.segments as Prisma.InputJsonValue,
        rawResponse: transcript.raw as Prisma.InputJsonValue,
      },
      update: {
        model: config.transcribeModel,
        durationSec: transcript.duration,
        fullText: transcript.text,
        segments: transcript.segments as Prisma.InputJsonValue,
        rawResponse: transcript.raw as Prisma.InputJsonValue,
      },
    });

    await analyzeSavedTranscript({ ...call, transcript: savedTranscript }, savedTranscript);
  } catch (error) {
    await markFailed(call.id, error);
    throw error;
  }
}

function fileNameFromObjectKey(objectKey: string, vpbxId: string): string {
  const part = objectKey.split("/").pop();
  return part && part.includes(".") ? part : `${vpbxId}.mp3`;
}

async function loadStoredAudio(call: Call): Promise<{ body: Buffer; fileName: string } | null> {
  if (!call.recordingObjectKey) {
    return null;
  }
  try {
    return {
      body: await getRecordingObject(call.recordingObjectKey),
      fileName: fileNameFromObjectKey(call.recordingObjectKey, call.vpbxId),
    };
  } catch (error) {
    console.error("Failed to load call recording from MinIO", call.recordingObjectKey, error);
    return null;
  }
}

async function ensureStoredRecording(call: Call): Promise<{ body: Buffer; fileName: string }> {
  const stored = await loadStoredAudio(call);
  if (stored) {
    return stored;
  }

  if (!call.callRecordLink) {
    throw new Error("Call ended without a recording link");
  }

  await prisma.call.update({
    where: { id: call.id },
    data: { status: CallStatus.transcribing, failedReason: null },
  });

  const recording = await downloadAndStoreRecording({
    url: call.callRecordLink,
    vpbxId: call.vpbxId,
  });

  await prisma.call.update({
    where: { id: call.id },
    data: {
      recordingBucket: recording.bucket,
      recordingObjectKey: recording.objectKey,
      recordingUrl: recording.url,
      recordingMimeType: recording.mimeType,
      recordingSizeBytes: recording.sizeBytes,
    },
  });
  call.recordingObjectKey = recording.objectKey;

  return { body: recording.body, fileName: recording.fileName };
}

async function analyzeSavedTranscript(call: LoadedCall, transcript: Transcript): Promise<void> {
  await prisma.call.update({
    where: { id: call.id },
    data: { status: CallStatus.analyzing },
  });

  const operator =
    call.operator ??
    (await findOperatorByCodes(
      collectOperatorCodes([call.firstAnswer, call.operatorNumber, call.allAnswer]),
    ));
  if (operator && !call.operatorId) {
    await prisma.call.update({
      where: { id: call.id },
      data: { operatorId: operator.id, operatorNumber: operator.code },
    });
    call.operatorId = operator.id;
    call.operatorNumber = operator.code;
  }
  if (operator) {
    call.operator = operator;
  }

  const { result, raw, responseId, promptId, scoringAgentId, model } = await analyzeTranscript(call, transcript, {
    operator,
    appName: call.app?.name ?? operator?.app.name,
  });
  const analysis = await prisma.callAnalysis.upsert({
    where: { callId: call.id },
    create: {
      callId: call.id,
      model,
      openaiResponseId: responseId,
      analysisPromptId: promptId,
      scoringAgentId,
      rawJson: raw as Prisma.InputJsonValue,
      title: result.title,
      criteria: result.criteria as unknown as Prisma.InputJsonValue,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      overallComment: result.overallComment,
      score: result.score,
      operatorName: result.operatorName,
      operatorCode: result.operatorCode,
      appName: result.appName,
    },
    update: {
      model,
      openaiResponseId: responseId,
      analysisPromptId: promptId,
      scoringAgentId,
      rawJson: raw as Prisma.InputJsonValue,
      title: result.title,
      criteria: result.criteria as unknown as Prisma.InputJsonValue,
      totalScore: result.totalScore,
      maxScore: result.maxScore,
      percentage: result.percentage,
      overallComment: result.overallComment,
      score: result.score,
      operatorName: result.operatorName,
      operatorCode: result.operatorCode,
      appName: result.appName,
    },
  });

  if (!call.appId && operator) {
    await prisma.call.update({
      where: { id: call.id },
      data: { appId: operator.appId },
    });
  }

  try {
    const thread = await appendCallToDailyThread({
      call,
      analysis,
    });
    await prisma.callAnalysis.update({
      where: { id: analysis.id },
      data: { dailyThreadId: thread.id },
    });
  } catch (error) {
    console.error("Failed to append call to daily OpenAI thread", error);
  }

  await prisma.call.update({
    where: { id: call.id },
    data: {
      status: CallStatus.analyzed,
      failedReason: null,
    },
  });
}

async function markFailed(callId: string, error: unknown): Promise<void> {
  await prisma.call.update({
    where: { id: callId },
    data: {
      status: CallStatus.failed,
      failedReason: error instanceof Error ? error.message : String(error),
    },
  });
}
