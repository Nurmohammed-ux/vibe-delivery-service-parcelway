import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspacePage } from "./WorkspacePage.jsx";

vi.mock("./DispatcherWorkspacePage.jsx", () => ({
  DispatcherWorkspacePage: () => <div>Operations workspace</div>,
}));
vi.mock("./AdminWorkspacePage.jsx", () => ({
  AdminWorkspacePage: () => <div>Administrator settings</div>,
}));

describe("role workspaces", () => {
  it("uses the administrator workspace for admin accounts", () => {
    render(<WorkspacePage role="admin" />);

    expect(screen.getByText("Administrator settings")).toBeInTheDocument();
  });
});
