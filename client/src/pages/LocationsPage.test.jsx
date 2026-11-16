import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationsPage } from "./LocationsPage.jsx";

const leafletMock = vi.hoisted(() => ({
  map: {
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
    getZoom: () => 7,
    setView: vi.fn(),
  },
  icon: vi.fn(() => ({})),
  latLngBounds: vi.fn((points) => points),
}));

vi.mock("leaflet", () => ({
  default: {
    icon: leafletMock.icon,
    latLngBounds: leafletMock.latLngBounds,
  },
}));

vi.mock("react-leaflet", async () => {
  const { createElement } = await import("react");
  return {
    MapContainer: ({ children }) => createElement("div", { "data-testid": "branch-map" }, children),
    Marker: ({ children, position }) =>
      createElement(
        "div",
        { "data-testid": "branch-marker", "data-position": JSON.stringify(position) },
        children,
      ),
    Popup: ({ children }) => createElement("div", null, children),
    TileLayer: () => null,
    useMap: () => leafletMock.map,
  };
});

describe("branch locations page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows all supplied locations and filters markers by region", () => {
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText((_, element) => element?.getAttribute("aria-live") === "polite"),
    ).toHaveTextContent("Showing 64 of 64");
    expect(screen.getAllByTestId("branch-marker")).toHaveLength(64);

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by region" }), {
      target: { value: "Rangpur" },
    });

    expect(
      screen.getByText((_, element) => element?.getAttribute("aria-live") === "polite"),
    ).toHaveTextContent("Showing 8 of 64");
    expect(screen.getAllByTestId("branch-marker")).toHaveLength(8);
    const locationList = screen.getByRole("complementary", { name: "Service locations" });
    expect(within(locationList).getAllByText(/district · Rangpur region/)).toHaveLength(8);
    expect(within(locationList).queryByText(/district · Dhaka region/)).not.toBeInTheDocument();
  });

  it("finds locations by covered area and focuses the selected map marker", () => {
    render(
      <MemoryRouter>
        <LocationsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search locations" }), {
      target: { value: "Uttara" },
    });

    expect(
      screen.getByText((_, element) => element?.getAttribute("aria-live") === "polite"),
    ).toHaveTextContent("Showing 1 of 64");
    expect(screen.getAllByTestId("branch-marker")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Dhaka district/ }));
    expect(leafletMock.map.flyTo).toHaveBeenCalledWith(
      [23.8103, 90.4125],
      9,
      { duration: 0.4 },
    );
  });
});
