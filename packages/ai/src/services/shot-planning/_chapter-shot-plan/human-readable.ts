import type { ChapterShotPlan } from "./types";

export function buildHumanReadable(plan: Omit<ChapterShotPlan, "humanReadable">): string {
  const lines: string[] = [];
  const title = [plan.projectTitle, plan.chapterTitle].filter(Boolean).join(" — ");
  if (title) lines.push(`# Shot plan : ${title}`);
  lines.push("");
  lines.push(
    `Total panels : ${plan.distribution.totalPanels}  ·  ` +
      `héros ${Math.round(plan.distribution.heroLeadRatio * 100)}%  ·  ` +
      `coupes ${Math.round(plan.distribution.cutawayRatio * 100)}%  ·  ` +
      `décor ${plan.distribution.environmentPanels}  ·  ` +
      `PNJ ${plan.distribution.npcPanels}  ·  ` +
      `inserts ${plan.distribution.propInsertPanels}  ·  ` +
      `cadrages ${plan.distribution.uniqueShotTypes}`,
  );
  lines.push("");
  for (const entry of plan.entries) {
    const page = entry.pageNumber == null ? "p?" : `p${entry.pageNumber}`;
    lines.push(`${page}:#${String(entry.panelNumber).padStart(2, "0")} · ${entry.headline}`);
  }
  if (plan.reliability.blockers.length > 0) {
    lines.push("");
    lines.push("## Blocages (launch interdite)");
    for (const b of plan.reliability.blockers) {
      lines.push(`- [${b.code}] ${b.message}`);
    }
  }
  if (plan.reliability.warnings.length > 0) {
    lines.push("");
    lines.push("## Warnings (launch ok)");
    for (const w of plan.reliability.warnings) {
      lines.push(`- [${w.code}] ${w.message}`);
    }
  }
  return lines.join("\n");
}
