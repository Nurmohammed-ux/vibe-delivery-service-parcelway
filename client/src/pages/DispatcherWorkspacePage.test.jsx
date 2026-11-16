import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "../api.js";
import { DispatcherWorkspacePage } from "./DispatcherWorkspacePage.jsx";

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
    user: { id: "dispatcher-1", role: "dispatcher" },
  }),
}));

const shipment = {
  reference: "PW-DISPATCH-UI-001",
  status: "booked",
  service: { id: "standard", name: "Standard" },
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
  events: [{ status: "booked", timestamp: "2026-11-10T09:00:00.000Z" }],
};

function configureApi() {
  apiGet.mockImplementation(async (path) => {
    if (path === "/api/dispatcher/overview") {
      return {
        counts: {
          total: 1,
          booked: 1,
          assigned: 0,
          picked_up: 0,
          in_transit: 0,
          exception: 0,
          delivered: 0,
          unassigned: 1,
        },
        exceptions: [],
      };
    }
    if (path === "/api/dispatcher/couriers") {
      return {
        couriers: [{ id: "courier-1", displayName: "Courier One" }],
        capacityRulesConfigured: false,
      };
    }
    if (path === "/api/dispatcher/dispatchers") {
      return {
        dispatchers: [{ id: "dispatcher-1", displayName: "Dispatcher One" }],
      };
    }
    if (path.startsWith("/api/dispatcher/shipments")) {
      return { shipments: [shipment] };
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
}

describe("dispatcher operations workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureApi();
  });

  it("keeps the shipment board visible while reviewing and confirming assignment", async () => {
    apiRequest.mockResolvedValue({
      shipment: { ...shipment, courierId: "courier-1" },
      duplicate: false,
    });
    render(<DispatcherWorkspacePage />);

    fireEvent.click(await screen.findByRole("button", { name: /PW-DISPATCH-UI-001/ }));
    expect(await screen.findByRole("heading", { name: "Courier assignment" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Assign courier"), {
      target: { value: "courier-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review assignment" }));

    expect(screen.getByRole("group", { name: "Confirm courier assignment" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /PW-DISPATCH-UI-001/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    await screen.findByText("Courier assignment saved.");

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/dispatcher/shipments/PW-DISPATCH-UI-001/assignment",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
          body: JSON.stringify({
            courierId: "courier-1",
            expectedCourierId: null,
          }),
        }),
      );
    });
  });
});
