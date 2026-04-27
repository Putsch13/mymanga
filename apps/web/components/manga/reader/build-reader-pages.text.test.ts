/**
 * build-reader-pages.text.test.ts
 *
 * P1.18 — Tests pour la construction des pages avec texte.
 */

import { describe, it, expect } from "vitest";

interface PanelTextContract {
  hasText: boolean;
  dialogues: Array<{
    speakerId: string;
    speakerName?: string;
    text: string;
  }>;
  narration: string | null;
  sfx: string[];
  silenceReason: string | null;
}

interface ReaderPanel {
  panelId: string;
  panelNumber: number;
  imageUrl: string | null;
  imageStatus: "pending" | "completed" | "validated" | "failed";
  textContract: PanelTextContract | null;
}

interface ReaderPage {
  pageNumber: number;
  panels: ReaderPanel[];
}

function buildReaderPages(
  panels: ReaderPanel[],
  panelsPerPage: number = 4
): ReaderPage[] {
  const pages: ReaderPage[] = [];
  
  for (let i = 0; i < panels.length; i += panelsPerPage) {
    const pageNumber = Math.floor(i / panelsPerPage) + 1;
    const pagePanels = panels.slice(i, i + panelsPerPage);
    
    pages.push({
      pageNumber,
      panels: pagePanels,
    });
  }
  
  return pages;
}

function validateReaderPanel(panel: ReaderPanel): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!panel.imageUrl && panel.imageStatus === "completed") {
    errors.push("completed_panel_missing_image_url");
  }
  
  if (panel.textContract?.hasText && panel.textContract.dialogues.length === 0 && !panel.textContract.narration) {
    errors.push("has_text_but_no_content");
  }
  
  for (const dialogue of panel.textContract?.dialogues ?? []) {
    if (!dialogue.text || dialogue.text.trim() === "") {
      errors.push(`empty_dialogue_text:${dialogue.speakerId}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

function hasBlankTextAreas(pages: ReaderPage[]): boolean {
  for (const page of pages) {
    for (const panel of page.panels) {
      if (panel.textContract?.hasText) {
        const hasContent = 
          panel.textContract.dialogues.some((d) => d.text.trim().length > 0) ||
          (panel.textContract.narration?.trim().length ?? 0) > 0;
        
        if (!hasContent) {
          return true;
        }
      }
    }
  }
  return false;
}

describe("buildReaderPages", () => {
  it("should split panels into pages", () => {
    const panels: ReaderPanel[] = Array.from({ length: 10 }, (_, i) => ({
      panelId: `panel-${i + 1}`,
      panelNumber: i + 1,
      imageUrl: `/img/${i + 1}.png`,
      imageStatus: "completed",
      textContract: null,
    }));
    
    const pages = buildReaderPages(panels, 4);
    
    expect(pages).toHaveLength(3);
    expect(pages[0].panels).toHaveLength(4);
    expect(pages[1].panels).toHaveLength(4);
    expect(pages[2].panels).toHaveLength(2);
  });
  
  it("should preserve panel order", () => {
    const panels: ReaderPanel[] = Array.from({ length: 5 }, (_, i) => ({
      panelId: `panel-${i + 1}`,
      panelNumber: i + 1,
      imageUrl: `/img/${i + 1}.png`,
      imageStatus: "completed",
      textContract: null,
    }));
    
    const pages = buildReaderPages(panels, 2);
    
    expect(pages[0].panels[0].panelNumber).toBe(1);
    expect(pages[0].panels[1].panelNumber).toBe(2);
    expect(pages[1].panels[0].panelNumber).toBe(3);
  });
  
  it("should handle empty panels array", () => {
    const pages = buildReaderPages([], 4);
    expect(pages).toHaveLength(0);
  });
});

describe("validateReaderPanel", () => {
  it("should pass for valid panel with text", () => {
    const panel: ReaderPanel = {
      panelId: "p1",
      panelNumber: 1,
      imageUrl: "/img/1.png",
      imageStatus: "completed",
      textContract: {
        hasText: true,
        dialogues: [{ speakerId: "marius", text: "Hello!" }],
        narration: null,
        sfx: [],
        silenceReason: null,
      },
    };
    
    const result = validateReaderPanel(panel);
    expect(result.valid).toBe(true);
  });
  
  it("should fail for panel with hasText but no content", () => {
    const panel: ReaderPanel = {
      panelId: "p2",
      panelNumber: 2,
      imageUrl: "/img/2.png",
      imageStatus: "completed",
      textContract: {
        hasText: true,
        dialogues: [],
        narration: null,
        sfx: [],
        silenceReason: null,
      },
    };
    
    const result = validateReaderPanel(panel);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("has_text_but_no_content");
  });
  
  it("should fail for empty dialogue text", () => {
    const panel: ReaderPanel = {
      panelId: "p3",
      panelNumber: 3,
      imageUrl: "/img/3.png",
      imageStatus: "completed",
      textContract: {
        hasText: true,
        dialogues: [{ speakerId: "maya", text: "" }],
        narration: null,
        sfx: [],
        silenceReason: null,
      },
    };
    
    const result = validateReaderPanel(panel);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("empty_dialogue_text:maya");
  });
  
  it("should pass for silent panel with reason", () => {
    const panel: ReaderPanel = {
      panelId: "p4",
      panelNumber: 4,
      imageUrl: "/img/4.png",
      imageStatus: "completed",
      textContract: {
        hasText: false,
        dialogues: [],
        narration: null,
        sfx: [],
        silenceReason: "dramatic_pause",
      },
    };
    
    const result = validateReaderPanel(panel);
    expect(result.valid).toBe(true);
  });
});

describe("hasBlankTextAreas", () => {
  it("should detect blank text areas", () => {
    const pages: ReaderPage[] = [
      {
        pageNumber: 1,
        panels: [
          {
            panelId: "p1",
            panelNumber: 1,
            imageUrl: "/img/1.png",
            imageStatus: "completed",
            textContract: {
              hasText: true,
              dialogues: [{ speakerId: "a", text: "   " }],
              narration: null,
              sfx: [],
              silenceReason: null,
            },
          },
        ],
      },
    ];
    
    expect(hasBlankTextAreas(pages)).toBe(true);
  });
  
  it("should not flag panels without text contract", () => {
    const pages: ReaderPage[] = [
      {
        pageNumber: 1,
        panels: [
          {
            panelId: "p1",
            panelNumber: 1,
            imageUrl: "/img/1.png",
            imageStatus: "completed",
            textContract: null,
          },
        ],
      },
    ];
    
    expect(hasBlankTextAreas(pages)).toBe(false);
  });
  
  it("should not flag panels with hasText=false", () => {
    const pages: ReaderPage[] = [
      {
        pageNumber: 1,
        panels: [
          {
            panelId: "p1",
            panelNumber: 1,
            imageUrl: "/img/1.png",
            imageStatus: "completed",
            textContract: {
              hasText: false,
              dialogues: [],
              narration: null,
              sfx: [],
              silenceReason: "silent_moment",
            },
          },
        ],
      },
    ];
    
    expect(hasBlankTextAreas(pages)).toBe(false);
  });
  
  it("should pass for valid text content", () => {
    const pages: ReaderPage[] = [
      {
        pageNumber: 1,
        panels: [
          {
            panelId: "p1",
            panelNumber: 1,
            imageUrl: "/img/1.png",
            imageStatus: "completed",
            textContract: {
              hasText: true,
              dialogues: [{ speakerId: "hero", text: "Let's go!" }],
              narration: null,
              sfx: [],
              silenceReason: null,
            },
          },
        ],
      },
    ];
    
    expect(hasBlankTextAreas(pages)).toBe(false);
  });
});
