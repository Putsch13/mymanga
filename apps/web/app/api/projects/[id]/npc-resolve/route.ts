import { NextRequest, NextResponse } from "next/server";
import { getAppUser } from "@/lib/auth/get-app-user";
import { NPC_ONTOLOGY } from "@manga-ai-studio/world";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ctx.params;

  const body = await req.json() as {
    rawDescription: string;
    universe?: string;
    tone?: string;
  };

  if (!body.rawDescription || body.rawDescription.length < 3) {
    return NextResponse.json({ error: "rawDescription required (min 3 chars)" }, { status: 400 });
  }

  const desc = body.rawDescription.toLowerCase();
  const universe = (body.universe ?? "fantasy").toLowerCase();
  const tone = (body.tone ?? "épique").toLowerCase();

  const scored = NPC_ONTOLOGY.map((entry) => {
    let score = 0;
    const targets = [...entry.tags, ...entry.universes, ...entry.tones, entry.label, entry.role ?? ""].map((s) => s.toLowerCase());
    for (const word of desc.split(/\s+/)) {
      if (word.length < 3) continue;
      for (const t of targets) {
        if (t.includes(word) || word.includes(t)) score++;
      }
    }
    if (entry.universes.some((u) => universe.includes(u.toLowerCase()))) score += 3;
    if (entry.tones.some((t) => tone.includes(t.toLowerCase()))) score += 2;
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    return NextResponse.json({
      strategy: "ai_generated",
      matchedEntries: [],
      confidence: 0,
      promptFragment: body.rawDescription,
      narrativeHook: "Un personnage intriguant : " + body.rawDescription,
    });
  }

  const best = scored[0]!.entry;
  return NextResponse.json({
    strategy: scored.length > 1 ? "catalog_blend" : "catalog_match",
    matchedEntries: scored.map((s) => s.entry),
    confidence: Math.min(scored[0]!.score / 10, 1),
    promptFragment: best.visualCues.slice(0, 3).join(", "),
    narrativeHook: best.interactionHooks[Math.floor(Math.random() * best.interactionHooks.length)] ?? "",
  });
}
