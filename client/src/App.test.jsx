import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.jsx";

vi.mock("./auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: null,
    authMode: "not-configured",
    signOut: vi.fn(),
  }),
}));

describe("application theme toggle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem("parcelway-theme");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });
  });

  it("uses the system dark preference when no theme has been saved", () => {
    window.matchMedia.mockReturnValue({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });

    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("uses the system preference initially and persists a user selection", () => {
    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    const themeToggle = screen.getByRole("button", { name: "Switch to dark mode" });
    expect(themeToggle.querySelector("svg")).toBeInTheDocument();
    expect(themeToggle.textContent.trim()).toBe("");
    fireEvent.click(themeToggle);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem("parcelway-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("places the mobile menu and icon-only theme toggle together after navigation", () => {
    render(<App />);

    const navigation = document.querySelector(".site-nav");
    const actions = document.querySelector(".header-actions");
    expect(navigation.nextElementSibling).toBe(actions);
    expect(actions.children[0]).toHaveClass("menu-toggle");
    expect(actions.children[1]).toHaveClass("theme-toggle");
  });

  it("restores a saved theme instead of replacing it with the system preference", () => {
    window.localStorage.setItem("parcelway-theme", "dark");
    render(<App />);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("explains that newsletter signup is unavailable without saving the entered address", () => {
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), {
      target: { value: "reader@example.test" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Newsletter signup" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Newsletter signup isn’t connected yet. No email was sent or saved.",
    );
    expect(window.localStorage.getItem("newsletter-email")).toBeNull();
  });
});
