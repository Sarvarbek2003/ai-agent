import { CallStatus, Prisma } from "@prisma/client";
import { config } from "../../config";
import { collectOperatorCodes, findOperatorByCodes } from "../../lib/operators";
import { matchKnownAppName } from "../../lib/slug";
import { prisma } from "../../lib/prisma";
import { analyzeTranscript } from "./analyze";
import { appendCallToDailyThread } from "./daily-thread";
import { downloadAndStoreRecording } from "./recording";
import { transcribeCallRecording } from "./transcribe";

export async function processCall(callId: string, options?: { force?: boolean }): Promise<void> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { transcript: true, analysis: true, operator: { include: { app: true } } },
  });

  if (!call) {
    return;
  }

  if (!options?.force && call.status === CallStatus.analyzed) {
    return;
  }

  if (!call.callRecordLink) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: CallStatus.failed,
        failedReason: "Call ended without a recording link",
      },
    });
    return;
  }

  try {
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

    const transcript = await transcribeCallRecording(recording.body, recording.fileName);
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

    const apps = await prisma.app.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });

    const { result, responseId } = await analyzeTranscript(call, savedTranscript, {
      operator,
      apps,
    });
    const analysis = await prisma.callAnalysis.upsert({
      where: { callId: call.id },
      create: {
        callId: call.id,
        model: config.analysisModel,
        openaiResponseId: responseId,
        rawJson: result,
        ...result,
      },
      update: {
        model: config.analysisModel,
        openaiResponseId: responseId,
        rawJson: result,
        ...result,
      },
    });

    const matchedApp = matchKnownAppName(result.appName, apps);
    if (matchedApp) {
      await prisma.call.update({
        where: { id: call.id },
        data: { appId: matchedApp.id },
      });
    }

    try {
      const thread = await appendCallToDailyThread({
        call,
        transcript: savedTranscript,
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
  } catch (error) {
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: CallStatus.failed,
        failedReason: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
