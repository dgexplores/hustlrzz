import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadJson, downloadMarkdown } from "../download";

describe("downloadJson", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createdAnchors: HTMLAnchorElement[];
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:test-url");
    revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    createdAnchors = [];
    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") createdAnchors.push(el as HTMLAnchorElement);
      return el;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an application/json blob with pretty-printed payload", async () => {
    const data = { score: 90, strengths: ["clarity"] };

    downloadJson("report.json", data);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(JSON.stringify(data, null, 2));
  });

  it("clicks an anchor with the filename and revokes the object URL", () => {
    downloadJson("session-abc.json", { ok: true });

    expect(createdAnchors).toHaveLength(1);
    const anchor = createdAnchors[0];
    expect(anchor.download).toBe("session-abc.json");
    expect(anchor.href).toBe("blob:test-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });

  it("downloadMarkdown creates a text/markdown blob with the raw markdown body", async () => {
    const md = "# Interview Report\n\n| Area | Score |\n| --- | --- |\n| communication | 85/100 |\n";

    downloadMarkdown("report.md", md);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/markdown");
    expect(await blob.text()).toBe(md);
    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0].download).toBe("report.md");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});
