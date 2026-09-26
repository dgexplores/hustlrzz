import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../button";

describe("Button", () => {
  it("renders and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    const btn = screen.getByRole("button", { name: "Save" });
    btn.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>
    );

    screen.getByRole("button", { name: "Save" }).click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each([
    ["default", undefined, "h-11"],
    ["small", "sm", "h-11"],
    ["icon", "icon", "h-11"],
  ] as const)("keeps the %s size touch-friendly", (_name, size, expectedClass) => {
    render(<Button size={size}>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" }).className).toContain(expectedClass);
  });

  it("keeps icon buttons square and touch-friendly", () => {
    render(<Button size="icon">Save</Button>);

    const className = screen.getByRole("button", { name: "Save" }).className;
    expect(className).toContain("h-11");
    expect(className).toContain("w-11");
  });
});
