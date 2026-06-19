import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dumpPanelDebugArtifacts } from "./panel-debug-dump";

describe("dumpPanelDebugArtifacts", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.MYMANGA_PANEL_DEBUG_DUMP_DIR = prev.MYMANGA_PANEL_DEBUG_DUMP_DIR;
    process.env.MYMANGA_PANEL_DEBUG_DUMP = prev.MYMANGA_PANEL_DEBUG_DUMP;
  });

  it("ne fait rien sans MYMANGA_PANEL_DEBUG_DUMP_DIR ni MYMANGA_PANEL_DEBUG_DUMP", async () => {
    delete process.env.MYMANGA_PANEL_DEBUG_DUMP_DIR;
    delete process.env.MYMANGA_PANEL_DEBUG_DUMP;
    await expect(
      dumpPanelDebugArtifacts({
        chapterId: "c1",
        panelId: "p1",
        phase: "pre_generate",
        prompt: { positive: "x", negative: "y" },
      }),
    ).resolves.toBeUndefined();
  });

  it("écrit un JSON quand MYMANGA_PANEL_DEBUG_DUMP_DIR est défini", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mymanga-panel-dump-"));
    process.env.MYMANGA_PANEL_DEBUG_DUMP_DIR = dir;
    delete process.env.MYMANGA_PANEL_DEBUG_DUMP;

    await dumpPanelDebugArtifacts({
      chapterId: "ch-a",
      panelId: "panel-1",
      phase: "post_success",
      blueprint: { panelId: "panel-1", renderMode: "hero_closeup" },
      renderSpec: { panelId: "panel-1", panelPurpose: "hero_focus" },
      prompt: { positive: "hello", negative: "no text" },
      providerPayload: { route: "x" },
      outputUrl: "https://example.com/out.png",
    });

    const chapterDir = path.join(dir, "ch-a", "panel-1");
    const files = await readdir(chapterDir);
    expect(files.some((f) => f.startsWith("post_success-"))).toBe(true);
    const jsonPath = path.join(chapterDir, files.find((f) => f.endsWith(".json"))!);
    const raw = await readFile(jsonPath, "utf8");
    await dumpPanelDebugArtifacts({
      chapterId: "ch-b",
      panelId: "panel-2",
      phase: "post_success",
      renderDebug: { panelId: "panel-2", finalStatus: "passed", attemptCount: 1 },
    });
    const chapterDirB = path.join(dir, "ch-b", "panel-2");
    const filesB = await readdir(chapterDirB);
    const jsonPathB = path.join(chapterDirB, filesB.find((f) => f.endsWith(".json"))!);
    const rawB = await readFile(jsonPathB, "utf8");
    const jb = JSON.parse(rawB) as { renderDebug: { finalStatus: string } };
    expect(jb.renderDebug.finalStatus).toBe("passed");

    const j = JSON.parse(raw) as { phase: string; prompt: { positive: string }; outputUrl: string };
    expect(j.phase).toBe("post_success");
    expect(j.prompt.positive).toBe("hello");
    expect(j.outputUrl).toBe("https://example.com/out.png");

    await rm(dir, { recursive: true, force: true });
  });
});
