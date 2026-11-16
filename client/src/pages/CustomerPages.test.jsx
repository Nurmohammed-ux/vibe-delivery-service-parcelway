import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiRequest } from "../api.js";
import { ShipmentBookingPage } from "./CustomerPages.jsx";

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

const bookingOptions = {
  currency: "BDT",
  rulesVersion: "configured-rules-version",
  termsVersion: "draft-terms-1",
  termsText: "Demo terms only.",
  services: [{
    id: "standard",
    name: "Standard",
    description: "Configured demo service",
    basePrice: 100,
    pricePerKg: 25,
    maxWeightKg: 10,
    maxDimensionsCm: { length: 60, width: 50, height: 40 },
    pickupWindows: [{ id: "morning", label: "Morning" }],
    deliveryWindows: [{ id: "afternoon", label: "Afternoon" }],
  }],
};

function renderBooking() {
  render(
    <MemoryRouter>
      <ShipmentBookingPage />
    </MemoryRouter>,
  );
}

describe("customer shipment booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGet.mockResolvedValue(bookingOptions);
  });

  it("shows a quote calculated from configured service rates before confirmation", async () => {
    renderBooking();
    await screen.findByText("Pickup and delivery contacts");

    for (const [label, values] of [
      ["Full name *", ["Casey Sender", "Taylor Recipient"]],
      ["Phone *", ["+880 1700-000001", "+880 1700-000002"]],
      ["Street address *", ["1 Pickup Road", "2 Delivery Lane"]],
      ["City *", ["Dhaka", "Dhaka"]],
      ["Postal code *", ["1000", "1200"]],
    ]) {
      screen.getAllByLabelText(label).forEach((input, index) => {
        fireEvent.change(input, { target: { value: values[index] } });
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "Continue to parcel" }));
    fireEvent.change(screen.getByLabelText("Weight (kg) *"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Length (cm) *"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Width (cm) *"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Height (cm) *"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Contents declaration/), {
      target: { value: "Books" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to service" }));

    expect(await screen.findByText("Standard")).toBeInTheDocument();
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText("Service fee")).toBeInTheDocument();
    expect(screen.getByText("Weight charge")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("only offers services that cover both entered postal codes", async () => {
    apiGet.mockResolvedValue({
      ...bookingOptions,
      supportedPostalCodes: ["1000", "1200", "2000"],
      services: [
        {
          ...bookingOptions.services[0],
          supportedPostalCodes: ["1000", "1200"],
        },
        {
          ...bookingOptions.services[0],
          id: "nationwide",
          name: "Nationwide",
        },
      ],
    });
    renderBooking();
    await screen.findByText("Pickup and delivery contacts");

    for (const [label, values] of [
      ["Full name *", ["Casey Sender", "Taylor Recipient"]],
      ["Phone *", ["+880 1700-000001", "+880 1700-000002"]],
      ["Street address *", ["1 Pickup Road", "2 Delivery Lane"]],
      ["City *", ["Dhaka", "Rajshahi"]],
      ["Postal code *", ["2000", "2000"]],
    ]) {
      screen.getAllByLabelText(label).forEach((input, index) => {
        fireEvent.change(input, { target: { value: values[index] } });
      });
    }

    fireEvent.click(screen.getByRole("button", { name: "Continue to parcel" }));
    fireEvent.change(screen.getByLabelText("Weight (kg) *"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Length (cm) *"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("Width (cm) *"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("Height (cm) *"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Contents declaration/), {
      target: { value: "Books" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to service" }));

    expect(await screen.findByRole("radio", { name: /Nationwide/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Standard/ })).not.toBeInTheDocument();
  });

  it("shows a recoverable unavailable state when service rules are not configured", async () => {
    apiGet.mockRejectedValue(
      Object.assign(new Error("Booking is unavailable until service rules are configured."), {
        status: 503,
        code: "BOOKING_NOT_CONFIGURED",
      }),
    );
    renderBooking();

    expect(
      await screen.findByRole("heading", { name: "Booking rules are not configured" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
