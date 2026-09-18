import { CallStatus, Prisma } from "@prisma/client";
import { config } from "../../config";
import { prisma } from "../../lib/prisma";
import { analyzeTranscript } from "./analyze";
import { appendCallToDailyThread } from "./daily-thread";
import { downloadRecording } from "./recording";
import { transcribeCallRecording } from "./transcribe";

export async function processCall(callId: string, options?: { force?: boolean }): Promise<void> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    include: { transcript: true, analysis: true },
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

    const recording = await downloadRecording({
      url: call.callRecordLink,
      vpbxId: call.vpbxId,
    });

    await prisma.call.update({
      where: { id: call.id },
      data: {
        recordingPath: recording.filePath,
        recordingMimeType: recording.mimeType,
      },
    });

    const transcript = await transcribeCallRecording(recording.filePath);
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

    const { result, responseId } = await analyzeTranscript(call, savedTranscript);
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
