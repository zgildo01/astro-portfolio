import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadValidatedResume = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/resume/loadValidatedResume", () => ({
  loadValidatedResume: mockLoadValidatedResume
}));

import { loadResumeForBuild } from "../../../src/lib/resume/loadResumeForBuild";
import type { LoadedResume } from "../../../src/lib/resume/loadValidatedResume";

const loadedResume: LoadedResume = {
  resume: {
    schemaVersion: 1,
    name: "Example Engineer",
    headline: "Platform Engineer",
    contact: {},
    summary: "I build tools for teams.",
    experience: [],
    skills: []
  },
  sourceCommitSha: "a".repeat(40)
};

beforeEach(() => {
  mockLoadValidatedResume.mockReset();
  mockLoadValidatedResume.mockResolvedValue(loadedResume);
});

describe("loadResumeForBuild", () => {
  it("selects and trims the local vault path", async () => {
    const result = await loadResumeForBuild({
      vaultDir: "  ../Zeus-Vault  ",
      token: "  "
    });

    expect(mockLoadValidatedResume).toHaveBeenCalledExactlyOnceWith({
      mode: "local",
      checkoutPath: "../Zeus-Vault"
    });
    expect(result).toBe(loadedResume);
  });

  it("selects and trims the GitHub token", async () => {
    const result = await loadResumeForBuild({
      vaultDir: "  ",
      token: "  private-test-token  "
    });

    expect(mockLoadValidatedResume).toHaveBeenCalledExactlyOnceWith({
      mode: "github",
      token: "private-test-token"
    });
    expect(result).toBe(loadedResume);
  });

  it.each([{}, { vaultDir: "", token: "" }, { vaultDir: "  ", token: "\t" }])(
    "rejects missing or blank source inputs: %j",
    async (source) => {
      await expect(loadResumeForBuild(source)).rejects.toThrow(
        "Set RESUME_VAULT_DIR for a local resume build or RESUME_CONTENT_TOKEN for a hosted build."
      );
      expect(mockLoadValidatedResume).not.toHaveBeenCalled();
    }
  );

  it("rejects two configured sources before accessing either", async () => {
    await expect(
      loadResumeForBuild({
        vaultDir: "  ../Zeus-Vault  ",
        token: "  private-test-token  "
      })
    ).rejects.toThrow(
      "Choose one resume build source: RESUME_VAULT_DIR or RESUME_CONTENT_TOKEN."
    );
    expect(mockLoadValidatedResume).not.toHaveBeenCalled();
  });
});
