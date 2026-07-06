import { describe, expect, it } from "vitest";

import { commands } from "../../src/discord/commands";

describe("discord commands", () => {
  it("registers the ping slash command", () => {
    expect(commands.map((command) => command.name)).toContain("ping");
  });
});
