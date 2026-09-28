import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: apiMock }));

const signOutMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({ auth: { signOut: signOutMock } }),
}));

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

import { DataRightsCard } from "../DataRightsCard";

describe("DataRightsCard", () => {
  beforeEach(() => {
    apiMock.mockReset();
    signOutMock.mockReset().mockResolvedValue({ error: null });
    pushMock.mockReset();
    apiMock.mockResolvedValue({ data: { tables: {} } });
  });

  it("offers a download before offering a delete", () => {
    render(<DataRightsCard />);
    expect(screen.getByRole("button", { name: /download my data/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /delete my account/i })).toBeTruthy();
    // The irreversible action must not be one click away.
    expect(screen.queryByRole("button", { name: /permanently delete/i })).toBeNull();
  });

  it("keeps the delete button inert until the exact word is typed", async () => {
    render(<DataRightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    const field = screen.getByLabelText(/type/i) as HTMLInputElement;
    const confirm = screen.getByRole("button", { name: /permanently delete/i });

    expect(confirm.hasAttribute("disabled")).toBe(true);

    // Wrong case, trailing space, and a substring must all stay inert.
    for (const wrong of ["delete", "DELET", "DELETE ", "xDELETE"]) {
      fireEvent.change(field, { target: { value: wrong } });
      expect(confirm.hasAttribute("disabled")).toBe(true);
    }

    fireEvent.change(field, { target: { value: "DELETE" } });
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(false));
  });

  it("warns that deletion cannot be undone", () => {
    render(<DataRightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
  });

  it("sends DELETE with a serialised confirmation, signs out, and leaves", async () => {
    render(<DataRightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));

    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const [path, init] = apiMock.mock.calls[0];
    expect(path).toBe("/account");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBe('{"confirm":"DELETE"}');
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("does not sign the user out when the erase fails", async () => {
    apiMock.mockRejectedValueOnce(new Error("Erasure incomplete."));
    render(<DataRightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));

    await screen.findByRole("alert");
    expect(signOutMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("surfaces the export failure instead of claiming success", async () => {
    apiMock.mockRejectedValueOnce(new Error("Could not export your data"));
    render(<DataRightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /download my data/i }));
    await screen.findByRole("alert");
    expect(screen.getByText(/could not export your data/i)).toBeTruthy();
  });
});
