import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "../api.js";
import { CourierWorkspacePage } from "./CourierWorkspacePage.jsx";

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("../api.js", () => ({
  apiGet: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    getAccessToken: authMocks.getAccessToken,
    authMode: "development-mock",
  }),
}));

const assignedShipment = {
  reference: "PW-COURIER-001",
  status: "booked",
  pickup: {
    name: "Casey Sender",
    phone: "+880170000001",
    line1: "1 Pickup Road",
    city: "Dhaka",
    postalCode: "1000",
  },
  recipient: {
    name: "Taylor Recipient",
    phone: "+880170000002",
    line1: "2 Delivery Lane",
    city: "Dhaka",
    postalCode: "1200",
  },
  pickupWindow: { label: "Morning" },
  deliveryWindow: { label: "Afternoon" },
  events: [{ status: "booked" }],
};

describe("courier workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue({ shipments: [assignedShipment] });
  });

  it("shows assigned stop details and does not claim that saved windows are due today", async () => {
    render(<CourierWorkspacePage />);

    expect(await screen.findByRole("heading", { name: "Assigned stops" })).toBeInTheDocument();
    expect(screen.getByText("Casey Sender")).toBeInTheDocument();
    expect(screen.getByText("1 Pickup Road")).toBeInTheDocument();
    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText(/not as confirmation that a stop is due today/i)).toBeInTheDocument();
  });

  it("keeps the stop incomplete and reports a network failure instead of claiming success", async () => {
    apiRequest.mockRejectedValue(new Error("The network is unavailable."));
    render(<CourierWorkspacePage />);

    fireEvent.click(await screen.findByRole("button", { name: "Arrived at pickup" }));

    expect(await screen.findByText("Action not confirmed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm pickup" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("/api/courier/shipments/PW-COURIER-001/actions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
        body: JSON.stringify({ action: "arrived" }),
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Saving update…")).not.toBeInTheDocument();
    });
  });

  it("requires starting the delivery leg before exposing delivery proof controls", async () => {
    apiGet.mockResolvedValue({
      shipments: [{ ...assignedShipment, status: "picked_up" }],
    });
    render(<CourierWorkspacePage />);

    expect(await screen.findByRole("button", { name: "Start delivery route" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark delivered" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report failed attempt" })).not.toBeInTheDocument();
  });
});
