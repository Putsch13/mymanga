import { serve } from "inngest/next";
import { inngest } from "@manga-ai-studio/workflow/inngest";
import { functions } from "@manga-ai-studio/workflow/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
