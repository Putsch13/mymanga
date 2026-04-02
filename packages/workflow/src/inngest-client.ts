import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "manga-ai-studio",
  name: "Manga AI Studio",
  // En v4, le mode par défaut est "cloud". En dev local, on bascule sur le Dev Server.
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production",
});
