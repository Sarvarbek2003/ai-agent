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
    task: "NewTel qo'ng'iroqlarini webhook orqali qabul qiladi, yozuvni transkripsiya qiladi, kiruvchi va chiquvchi file_search tool orqali mezon fayllariga qarab JSON baholaydi va kunlik hisobot yuritadi.",
    status: "active",
  },
];

export function listAgents(): AgentDefinition[] {
  return agents;
}
