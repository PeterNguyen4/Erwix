import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";

describe("api client 401-refresh retry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the JSON body on a plain successful request", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 1, username: "trader", email: "t@example.com", role: "user" }), { status: 200 })
    );

    const user = await api.me();
    expect(user.username).toBe("trader");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries once after a successful silent refresh on 401", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 })) // initial call
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // refresh call
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 1, username: "trader", email: "t@example.com", role: "user" }), { status: 200 })
      ); // retried call

    const user = await api.me();
    expect(user.username).toBe("trader");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toContain("/api/users/refresh");
  });

  it("does not retry a second time if the retried request also 401s", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })) // refresh succeeds
      .mockResolvedValueOnce(new Response("still unauthorized", { status: 401 })); // retry still fails

    await expect(api.me()).rejects.toThrow("401");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry when the refresh call itself fails", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 })); // refresh fails too

    await expect(api.me()).rejects.toThrow("401");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("propagates a non-401 error without attempting a refresh", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(new Response("server exploded", { status: 500 }));

    await expect(api.me()).rejects.toThrow("500");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
