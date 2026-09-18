export type AgentDefinition = {
  id: string;
  name: string;
  task: string;
  status: "active" | "planned";
};

export const agents: AgentDefinition[] = [
  {
    id: "call-analytic",
    name: "Call Analytic Agent",
    task: "NewTel qo'ng'iroqlarini webhook orqali qabul qiladi, yozuvni gpt-4o-transcribe-diarize bilan matnga aylantiradi, operator-mijoz suhbatini tahlil qiladi va kunlik hisobot threadini yuritadi.",
    status: "active",
  },
];

export function listAgents(): AgentDefinition[] {
  return agents;
}
