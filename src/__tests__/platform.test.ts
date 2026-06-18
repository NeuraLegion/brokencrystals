import { describe, expect, it } from "vitest";
import { normalizeRemoteUrl } from "../platform.js";
import { detectScmProvider } from "../scm/detect.js";

describe("normalizeRemoteUrl", () => {
  it("converts scp-style SSH remotes to https", () => {
    expect(normalizeRemoteUrl("git@github.com:NeuraLegion/bright-agent.git")).toBe(
      "https://github.com/NeuraLegion/bright-agent",
    );
  });

  it("converts ssh:// remotes to https", () => {
    expect(normalizeRemoteUrl("ssh://git@github.com/NeuraLegion/bright-agent.git")).toBe(
      "https://github.com/NeuraLegion/bright-agent",
    );
  });

  it("strips the .git suffix from https remotes", () => {
    expect(normalizeRemoteUrl("https://github.com/NeuraLegion/bright-agent.git")).toBe(
      "https://github.com/NeuraLegion/bright-agent",
    );
  });

  it("passes through a clean https remote", () => {
    expect(normalizeRemoteUrl("https://github.com/NeuraLegion/bright-agent")).toBe(
      "https://github.com/NeuraLegion/bright-agent",
    );
  });

  it("produces a URL the SCM detector can parse (SSH → provider slug)", () => {
    const url = normalizeRemoteUrl("git@github.com:NeuraLegion/bright-agent.git");
    const { provider } = detectScmProvider(url);
    expect(provider.platformName).toBe("GitHub");
    expect(provider.repoSlug()).toBe("NeuraLegion/bright-agent");
  });
});
