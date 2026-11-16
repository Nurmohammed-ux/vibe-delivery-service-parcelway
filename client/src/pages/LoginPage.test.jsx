import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage.jsx";

const authState = vi.hoisted(() => ({
  register: vi.fn(),
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  refresh: vi.fn(),
  refreshAuthSetup: vi.fn(),
  authSetup: null,
  user: null,
}));

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({
    ...authState,
    status: "ready",
    user: authState.user,
    authMode: "firebase",
    authSetup: authState.authSetup || { status: "ready" },
    error: null,
  }),
}));

function renderLoginPage(initialEntries = ["/login"]) {
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<CurrentRoute />} />
        <Route path="/app/shipments/:reference" element={<CurrentRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

function CurrentRoute() {
  const { pathname, search, hash } = useLocation();
  return <p>Current route: {pathname}{search}{hash}</p>;
}

function switchToRegistration() {
  fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
}

describe("Firebase account access page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.authSetup = null;
    authState.user = null;
  });

  it("returns a customer to the private route requested before sign-in", async () => {
    authState.signIn.mockImplementation(async () => {
      authState.user = { role: "customer", homePath: "/app" };
    });
    renderLoginPage([{
      pathname: "/login",
      state: {
        from: {
          pathname: "/app/shipments/PKG-20261112",
          search: "?tab=events",
          hash: "#latest",
        },
      },
    }]);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "casey@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText(
        "Current route: /app/shipments/PKG-20261112?tab=events#latest",
      ),
    ).toBeInTheDocument();
  });

  it("sends a signed-in customer without a prior route to the customer homepage", () => {
    authState.user = { role: "customer", homePath: "/app" };
    renderLoginPage();

    expect(screen.getByText("Current route: /app")).toBeInTheDocument();
  });

  it("registers with email and password without accepting a role from the form", async () => {
    authState.register.mockResolvedValue(undefined);
    renderLoginPage();
    switchToRegistration();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Casey Customer" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "casey@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(authState.register).toHaveBeenCalledWith({
        displayName: "Casey Customer",
        email: "casey@example.test",
        password: "correct-horse",
      });
    });
  });

  it("supports Google sign-in and shows provider errors", async () => {
    authState.signInWithGoogle.mockRejectedValue(
      Object.assign(new Error("Google sign-in disabled"), {
        code: "auth/operation-not-allowed",
      }),
    );
    renderLoginPage();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enable this sign-in method in Firebase Authentication settings.",
    );
  });

  it("requires valid email and password values before registration", async () => {
    renderLoginPage();
    switchToRegistration();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Casey Customer" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 6 characters.")).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
  });

  it("requires every registration field", async () => {
    renderLoginPage();
    switchToRegistration();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(authState.register).not.toHaveBeenCalled();
  });

  it("toggles password visibility accessibly", () => {
    renderLoginPage();

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveAttribute("placeholder", "Enter your password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("defaults to sign-in and lets new customers switch to registration", async () => {
    renderLoginPage();

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));

    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "casey@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(authState.signIn).toHaveBeenCalledWith({
        email: "casey@example.test",
        password: "correct-horse",
      });
    });
  });

  it("does not allow account creation until server profile storage is ready", () => {
    authState.authSetup = {
      status: "incomplete",
      database: "not_configured",
      firebaseAuthentication: "not_configured",
      firebaseProjectIdConfigured: true,
    };
    renderLoginPage();

    expect(
      screen.getByRole("heading", { name: "Finish server setup first" }),
    ).toBeInTheDocument();
    expect(screen.getByText("GOOGLE_APPLICATION_CREDENTIALS")).toBeInTheDocument();
    expect(screen.getByText("MONGODB_URI")).toBeInTheDocument();
    expect(screen.queryByText("FIREBASE_PROJECT_ID")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });
});
