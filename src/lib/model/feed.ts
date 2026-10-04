import { createServerFn } from "@tanstack/react-start";
import { parseInput, runPull } from "./feed-core.server";
export type { PullResponse } from "./feed-core.server";

export const pullQuotes = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }) => runPull(data));
