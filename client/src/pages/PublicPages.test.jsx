import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api.js";
import { PartnerSection } from "../components/PartnerSection.jsx";
import { BookingInfoPage, PricingPage, ServicesPage } from "./PublicPages.jsx";
import { TrackLookupForm } from "./TrackingPage.jsx";
import { WelcomePage } from "./WelcomePage.jsx";

vi.mock("../api.js", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ user: null }),
}));

describe("public delivery pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed tracking codes before calling the API", async () => {
    render(<TrackLookupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Tracking code" }), {
      target: { value: "bad code" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Track a parcel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use 6–40 letters or numbers; hyphens are allowed.",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("shows tracking as unavailable instead of inventing a shipment result", async () => {
    apiRequest.mockRejectedValue(
      Object.assign(new Error("Public tracking is not enabled."), {
        status: 503,
        code: "TRACKING_UNAVAILABLE",
      }),
    );
    render(<TrackLookupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Tracking code" }), {
      target: { value: "PKG-20261108" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Track a parcel" }));

    expect(await screen.findByText("Tracking isn’t available yet")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/public/tracking",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ trackingCode: "PKG-20261108" }),
      }),
    );
    expect(screen.queryByText(/delivered|in transit/i)).not.toBeInTheDocument();
  });

  it("locks the tracking code while a lookup is pending", async () => {
    let resolveTracking;
    apiRequest.mockReturnValue(new Promise((resolve) => {
      resolveTracking = resolve;
    }));
    render(<TrackLookupForm />);

    const input = screen.getByRole("textbox", { name: "Tracking code" });
    fireEvent.change(input, { target: { value: "PKG-20261108" } });
    fireEvent.submit(screen.getByRole("form", { name: "Track a parcel" }));

    expect(input).toBeDisabled();
    await act(async () => {
      resolveTracking({
        status: "booked",
        events: [],
        lastUpdatedAt: null,
        estimatedDelivery: null,
        updateState: "unavailable",
      });
    });
    expect(input).toBeEnabled();
    expect(await screen.findByText("Booked")).toBeInTheDocument();
  });

  it("renders only public status and event fields from a tracking response", async () => {
    apiRequest.mockResolvedValue({
      status: "in_transit",
      events: [
        {
          status: "picked_up",
          timestamp: "2026-11-08T10:00:00.000Z",
          recipientPhone: "+8801000000000",
        },
      ],
      lastUpdatedAt: "2026-11-08T10:00:00.000Z",
      estimatedDelivery: null,
      updateState: "recorded",
      recipientAddress: "Private address",
    });
    render(<TrackLookupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Tracking code" }), {
      target: { value: "PKG-20261108" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Track a parcel" }));

    expect(await screen.findByText("In transit")).toBeInTheDocument();
    expect(screen.getByText("Picked up")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/isn’t enough configured route data/)).toBeInTheDocument();
    expect(screen.queryByText("+8801000000000")).not.toBeInTheDocument();
    expect(screen.queryByText("Private address")).not.toBeInTheDocument();
  });

  it("explains when no tracking updates or defensible estimate are available", async () => {
    apiRequest.mockResolvedValue({
      status: "booked",
      events: [],
      lastUpdatedAt: null,
      estimatedDelivery: null,
      updateState: "unavailable",
    });
    render(<TrackLookupForm />);

    fireEvent.change(screen.getByRole("textbox", { name: "Tracking code" }), {
      target: { value: "PKG-20261108" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Track a parcel" }));

    expect(await screen.findByText("No updates recorded")).toBeInTheDocument();
    expect(screen.getByText("No valid shipment status events are available yet.")).toBeInTheDocument();
    expect(screen.getByText("Not available")).toBeInTheDocument();
  });

  it("routes the homepage booking CTA to sign-in with a clear payment boundary", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/book" element={<BookingInfoPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Book a delivery" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Book from your customer workspace." }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Sign in to book" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByText(/will not charge a payment method/)).toBeInTheDocument();
  });

  it("shows fictional pricing examples without presenting them as live quotes", () => {
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Sample delivery prices" }),
    ).toBeInTheDocument();
    expect(screen.getByText("৳60")).toBeInTheDocument();
    expect(screen.getByText("৳100")).toBeInTheDocument();
    expect(screen.getByText("৳130")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("all rates are fictional BDT examples");
    expect(screen.getByRole("link", { name: "Open booking" })).toHaveAttribute(
      "href",
      "/book",
    );
  });

  it("lets visitors compare clearly labeled sample service details", () => {
    render(
      <MemoryRouter>
        <ServicesPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Choose a delivery that fits your parcel." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/fictional examples for preview only/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "City Standard" })).toBeInTheDocument();
    expect(screen.getByText("Dhaka, Gazipur, and Narayanganj")).toBeInTheDocument();
    expect(screen.getByText("Up to 10 kg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Nationwide/ }));

    expect(screen.getByRole("button", { name: /Nationwide/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const details = screen.getByRole("region", { name: "Nationwide" });
    expect(within(details).getByRole("heading", { name: "Nationwide" })).toBeInTheDocument();
    expect(
      within(details).getByText("Dhaka, Chattogram, Sylhet, Khulna, and Rajshahi"),
    ).toBeInTheDocument();
    expect(within(details).getByText("2–3 business days")).toBeInTheDocument();
    expect(within(details).getByText("Saturday daytime")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore booking" })).toHaveAttribute(
      "href",
      "/book",
    );
  });

  it("changes hero banners while keeping the calls to action unchanged", async () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A clearer journey from pickup to doorstep.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next banner" }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Careful delivery starts with a clear handoff.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a delivery" })).toHaveAttribute(
      "href",
      "/book",
    );
    expect(screen.getByRole("link", { name: "Track a parcel" })).toHaveAttribute(
      "href",
      "/track",
    );
  });

  it("shows the delivery process as four ordered steps", () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    const process = screen.getByRole("list", { name: "Delivery process" });
    expect(within(process).getAllByRole("listitem")).toHaveLength(4);
    expect(process.querySelectorAll(".delivery-step-icon svg")).toHaveLength(4);
    expect(
      within(process)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Book your delivery",
      "Get booking details",
      "Hand over your parcel",
      "Confirm delivery",
    ]);
    expect(screen.getByText(/not every step is live yet/)).toBeInTheDocument();
  });

  it("shows a fictional testimonial carousel with right-to-left navigation", async () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    const section = screen.getByRole("region", { name: "Sample customer stories" });
    const activeTestimonial = within(section).getByRole("group", { name: "Slide 1 of 9" });
    expect(activeTestimonial).toHaveTextContent("Nadia Rahman");
    expect(within(activeTestimonial).getByText("Illustrative sample")).toBeInTheDocument();
    expect(within(section).getByText("Live tracking").parentElement).toHaveTextContent(
      "Not connected",
    );
    expect(
      within(section).queryByText(
        "Fictional demo testimonials; these are not real customer reviews.",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Pause testimonial autoplay" }),
    ).toBeInTheDocument();

    fireEvent.click(within(section).getByRole("button", { name: "Next testimonial" }));

    expect(
      await within(section).findByRole("group", { name: "Slide 2 of 9" }),
    ).toHaveTextContent("Imran Hossain");

    fireEvent.click(within(section).getByRole("button", { name: "Go to testimonial 9" }));

    expect(
      await within(section).findByRole("group", { name: "Slide 9 of 9" }),
    ).toHaveTextContent("Jannat Akter");
  });

  it("shows an honest partner empty state when no partners are configured", () => {
    render(<PartnerSection partners={[]} />);

    expect(screen.getByRole("heading", { name: "Sample partner brands" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No partners yet. Confirmed company names and logos will appear here.",
    );
    expect(screen.queryByRole("img", { name: /logo/i })).not.toBeInTheDocument();
  });

  it("shows fictional sample brands with a clear demo disclaimer", () => {
    render(<PartnerSection />);

    const firstBrand = within(
      screen.getByRole("region", { name: "Sample partner brands" }),
    ).getAllByRole("listitem")[0];
    expect(within(firstBrand).getByText("Morrow Market")).toBeInTheDocument();
    expect(within(firstBrand).getByRole("img", { name: "Morrow Market logo" })).toHaveAttribute(
      "src",
      "/partners/morrow-market.svg",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "Fictional demo brands for preview only; these are not real partners.",
    );
  });

  it("marquees all eight sample partner names and logos without controls", () => {
    render(<PartnerSection />);

    const section = screen.getByRole("region", { name: "Sample partner brands" });
    const brands = within(section).getAllByRole("listitem");
    expect(brands).toHaveLength(8);
    expect(within(brands[0]).getByRole("img", { name: "Morrow Market logo" })).toHaveAttribute(
      "src",
      "/partners/morrow-market.svg",
    );
    expect(within(brands[7]).getByText("Willowwhistle")).toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });
});
