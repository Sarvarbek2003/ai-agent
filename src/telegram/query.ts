import { Prisma } from "@prisma/client";
import { config } from "../config";
import { localDateKey, localDateRange } from "../lib/dates";
import { prisma } from "../lib/prisma";
import { matchKnownAppName } from "../lib/slug";

export type AnalyticsQuery = {
  date?: string;
  dateTo?: string;
  appName?: string;
  operatorName?: string;
  operatorCode?: string;
  search?: string;
};

function validDate(value?: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  return value;
}

export async function queryCallAnalytics(input: AnalyticsQuery) {
  const date = validDate(input.date) ?? localDateKey();
  const dateTo = validDate(input.dateTo) ?? date;
  const createdAt = localDateRange(date, dateTo);
  const apps = await prisma.app.findMany({
    select: { id: true, name: true, slug: true },
  });
  const matchedApp = input.appName ? matchKnownAppName(input.appName, apps) : undefined;

  const analysisWhere: Prisma.CallAnalysisWhereInput = {};
  if (input.operatorName) {
    analysisWhere.operatorName = { contains: input.operatorName, mode: "insensitive" };
  }
  if (input.operatorCode) {
    analysisWhere.operatorCode = input.operatorCode;
  }
  if (matchedApp) {
    analysisWhere.OR = [
      { appName: { contains: matchedApp.name, mode: "insensitive" } },
      { call: { appId: matchedApp.id } },
    ];
  } else if (input.appName) {
    analysisWhere.appName = { contains: input.appName, mode: "insensitive" };
  }
  if (input.search?.trim()) {
    const search = input.search.trim();
    const searchFilter: Prisma.CallAnalysisWhereInput[] = [
      { title: { contains: search, mode: "insensitive" } },
      { overallComment: { contains: search, mode: "insensitive" } },
    ];
    analysisWhere.AND = [...(Array.isArray(analysisWhere.AND) ? analysisWhere.AND : []), { OR: searchFilter }];
  }

  const where: Prisma.CallAnalysisWhereInput = {
    ...analysisWhere,
    call: { createdAt },
  };

  const [totalCalls, analyzedCount, matching, byApp, scoreAgg, examples] = await Promise.all([
    prisma.call.count({ where: { createdAt } }),
    prisma.callAnalysis.count({ where: { call: { createdAt } } }),
    prisma.callAnalysis.findMany({
      where,
      select: {
        title: true,
        overallComment: true,
        criteria: true,
        appName: true,
        operatorName: true,
        operatorCode: true,
        score: true,
        percentage: true,
        totalScore: true,
        maxScore: true,
        call: { select: { customerNumber: true } },
      },
    }),
    prisma.callAnalysis.groupBy({
      by: ["appName"],
      where,
      _count: { _all: true },
    }),
    prisma.callAnalysis.aggregate({
      where,
      _avg: { score: true, percentage: true },
    }),
    prisma.callAnalysis.findMany({
      where,
      select: {
        title: true,
        overallComment: true,
        criteria: true,
        appName: true,
        operatorName: true,
        operatorCode: true,
        score: true,
        percentage: true,
        totalScore: true,
        maxScore: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const uniqueCustomers = new Set(
    matching.map((row) => row.call.customerNumber).filter((item): item is string => Boolean(item)),
  );

  return {
    timezone: config.timezone,
    date,
    dateTo,
    filters: {
      appName: matchedApp?.name ?? input.appName ?? null,
      operatorName: input.operatorName ?? null,
      operatorCode: input.operatorCode ?? null,
      search: input.search ?? null,
    },
    totalCalls,
    analyzedCalls: analyzedCount,
    matchingCalls: matching.length,
    uniqueCustomers: uniqueCustomers.size,
    averageScore: scoreAgg._avg.score === null ? null : Number(scoreAgg._avg.score.toFixed(1)),
    averagePercentage:
      scoreAgg._avg.percentage === null ? null : Number(scoreAgg._avg.percentage.toFixed(1)),
    byApp: byApp
      .map((row) => ({ appName: row.appName ?? "unknown", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    examples,
  };
}
