import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resume: vi.fn(), work: vi.fn() }));

vi.mock("../../../src/lib/resume/loadResumeForBuild", () => ({
  loadResumeForBuild: mocks.resume
}));
vi.mock("../../../src/lib/work/loadWorkForBuild", () => ({
  loadWorkForBuild: mocks.work
}));

const firstSha = "a".repeat(40);
const secondSha = "b".repeat(40);

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
  mocks.resume.mockReset().mockResolvedValue({
    resume: { name: "Example Engineer" },
    sourceCommitSha: firstSha
  });
  mocks.work.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadPortfolioForBuild", () => {
  it("shares one branch resolution and exact content revision across concurrent build pages", async () => {
    const { loadPortfolioForBuild } =
      await import("../../../src/lib/content/loadPortfolioForBuild");
    const source = { vaultDir: " ../Zeus-Vault " };
    const first = loadPortfolioForBuild(source);
    const second = loadPortfolioForBuild({ vaultDir: "../Zeus-Vault" });

    expect(first).toBe(second);
    const result = await first;
    expect(result.sourceCommitSha).toBe(firstSha);
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith({
      vaultDir: "../Zeus-Vault",
      token: undefined
    });
    expect(mocks.work).toHaveBeenCalledExactlyOnceWith({
      vaultDir: "../Zeus-Vault",
      token: undefined,
      sourceCommitSha: firstSha
    });
  });

  it("rejects a failed work source instead of falling back to embedded content", async () => {
    mocks.work.mockRejectedValue(new Error("Invalid published case study."));
    const { loadPortfolioForBuild } =
      await import("../../../src/lib/content/loadPortfolioForBuild");
    await expect(
      loadPortfolioForBuild({ token: "synthetic-test-token" })
    ).rejects.toThrow("Invalid published case study.");
  });

  it("does not read work content after a failed resume/source resolution", async () => {
    mocks.resume.mockRejectedValue(new Error("Source unavailable."));
    const { loadPortfolioForBuild } =
      await import("../../../src/lib/content/loadPortfolioForBuild");
    await expect(
      loadPortfolioForBuild({ vaultDir: "../missing-vault" })
    ).rejects.toThrow("Source unavailable.");
    expect(mocks.work).not.toHaveBeenCalled();
  });

  it("prevents source changes within a production build", async () => {
    const { loadPortfolioForBuild } =
      await import("../../../src/lib/content/loadPortfolioForBuild");
    await loadPortfolioForBuild({ vaultDir: "../Zeus-Vault" });
    expect(() => loadPortfolioForBuild({ token: "private-new-token" })).toThrow(
      "must remain consistent"
    );
    expect(mocks.resume).toHaveBeenCalledTimes(1);
  });

  it("reloads committed content for development requests", async () => {
    vi.stubEnv("PROD", false);
    mocks.resume
      .mockResolvedValueOnce({ resume: {}, sourceCommitSha: firstSha })
      .mockResolvedValueOnce({ resume: {}, sourceCommitSha: secondSha });
    const { loadPortfolioForBuild } =
      await import("../../../src/lib/content/loadPortfolioForBuild");
    expect(
      (await loadPortfolioForBuild({ vaultDir: "../Zeus-Vault" }))
        .sourceCommitSha
    ).toBe(firstSha);
    expect(
      (await loadPortfolioForBuild({ vaultDir: "../Zeus-Vault" }))
        .sourceCommitSha
    ).toBe(secondSha);
    expect(
      mocks.work.mock.calls.map(([source]) => source.sourceCommitSha)
    ).toEqual([firstSha, secondSha]);
  });
});
