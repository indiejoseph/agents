import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RequestContext } from "@mastra/core/request-context";
import {
	LocalFilesystem,
	LocalSandbox,
	Workspace,
} from "@mastra/core/workspace";

const PORT = process.env.PORT || "4111";
const WORKSPACE_PATH = process.env.AGENT_WORKSPACE as string;

function collectSkillPaths(): string[] {
  const candidates = [
    path.join(WORKSPACE_PATH, ".agents", "skills"), // Mastra marketplace installs here
    path.join(WORKSPACE_PATH, ".claude", "skills"), // Claude Code compatible
    path.join(os.homedir(), ".claude", "skills"), // user-global
    path.join(os.homedir(), "skills"), // user-global
  ];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const p of candidates) {
    try {
      const real = fs.realpathSync(p);
      if (!seen.has(real) && fs.statSync(real).isDirectory()) {
        seen.add(real);
        paths.push(real);
      }
    } catch {
      /* doesn't exist yet — skip */
    }
  }
  return paths;
}

/** Pre-computed at startup; exported for sync-skills-bin route */
export const skillPaths = collectSkillPaths();

export function getDynamicWorkspace({
  requestContext: _requestContext,
}: {
  requestContext: RequestContext;
}) {
  console.log("[workspace] Loading workspace configuration...");
  console.log(`[workspace] WORKSPACE_PATH: ${WORKSPACE_PATH}`);
  console.log(`[workspace] skills_path: ${JSON.stringify(skillPaths)}`);

  const detection = LocalSandbox.detectIsolation();

  return new Workspace({
    id: "agent-workspace",
    name: "Agent Workspace",
    filesystem: new LocalFilesystem({
      basePath: WORKSPACE_PATH,
      allowedPaths: skillPaths,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: WORKSPACE_PATH,
      env: {
        PATH: `${WORKSPACE_PATH}/.bin:${process.env.PATH}`,
        HOME: WORKSPACE_PATH,
        PORT: PORT,
        GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD || "",
        AGENT_GOOGLE_ACCOUNT: process.env.AGENT_GOOGLE_ACCOUNT || "",
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH && {
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        }),
      },
      isolation: detection.available ? detection.backend : "none",
      nativeSandbox: {
        allowNetwork: true,
        allowSystemBinaries: true,
        readWritePaths: [WORKSPACE_PATH, ...skillPaths],
      },
    }),
    ...(skillPaths.length > 0 ? { skills: skillPaths } : {}),
    bm25: true,
  });
}