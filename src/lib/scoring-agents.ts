import { CallDirection, ScoringAgent } from "@prisma/client";
import { prisma } from "./prisma";
import { slugify } from "./slug";

export async function uniqueAgentSlug(name: string, excludeId?: string): Promise<string> {
  let base: string;
  try {
    base = slugify(name);
  } catch {
    base = `agent-${Date.now().toString(36)}`;
  }
  for (let i = 0; i < 20; i += 1) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await prisma.scoringAgent.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) {
      return slug;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function getActiveScoringAgent(): Promise<ScoringAgent | null> {
  return prisma.scoringAgent.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function setActiveScoringAgent(id: string): Promise<ScoringAgent> {
  await prisma.scoringAgent.updateMany({
    where: { isActive: true, NOT: { id } },
    data: { isActive: false },
  });
  return prisma.scoringAgent.update({
    where: { id },
    data: { isActive: true },
  });
}

export function criteriaForCall(agent: ScoringAgent, direction: CallDirection): string {
  if (direction === CallDirection.outbound) {
    return agent.outboundCriteriaText;
  }
  return agent.inboundCriteriaText;
}

export function serializeScoringAgent(agent: ScoringAgent, options?: { includeText?: boolean }) {
  return {
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    isActive: agent.isActive,
    inboundCriteriaFileName: agent.inboundCriteriaFileName,
    outboundCriteriaFileName: agent.outboundCriteriaFileName,
    inboundCriteriaText: options?.includeText ? agent.inboundCriteriaText : undefined,
    outboundCriteriaText: options?.includeText ? agent.outboundCriteriaText : undefined,
    inboundVectorStoreId: agent.openaiInboundVectorStoreId,
    outboundVectorStoreId: agent.openaiOutboundVectorStoreId,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}
