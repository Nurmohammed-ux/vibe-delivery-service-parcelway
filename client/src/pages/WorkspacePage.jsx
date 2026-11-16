import { Link } from "react-router-dom";
import { CourierWorkspacePage } from "./CourierWorkspacePage.jsx";
import { DispatcherWorkspacePage } from "./DispatcherWorkspacePage.jsx";
import { AdminWorkspacePage } from "./AdminWorkspacePage.jsx";

const roleTitles = {
  customer: "Customer workspace",
  recipient: "Recipient workspace",
  courier: "Courier workspace",
  dispatcher: "Operations workspace",
  admin: "Administration",
};

const roleDescriptions = {
  customer: "Shipment booking and customer account tools will be added in a later phase.",
  recipient: "Verified recipient tracking and delivery preferences will be added in a later phase.",
  courier: "Assigned stops and proof-of-delivery tools will be added in a later phase.",
  dispatcher: "Shipment assignment and exception management will be added in a later phase.",
  admin: "User and service configuration tools will be added in a later phase.",
};

export function WorkspacePage({ role }) {
  if (role === "courier") return <CourierWorkspacePage />;
  if (role === "dispatcher") return <DispatcherWorkspacePage />;
  if (role === "admin") return <AdminWorkspacePage />;

  return (
    <section className="content-page">
      <span className="eyebrow">ROLE WORKSPACE · FOUNDATION ONLY</span>
      <h1>{roleTitles[role]}</h1>
      <p className="page-intro">{roleDescriptions[role]}</p>
      <div className="workspace-placeholder surface-card">
        <span className="workspace-icon" aria-hidden="true">✦</span>
        <div>
          <h2>Workspace shell is ready</h2>
          <p>
            Navigation and route access are in place. No shipment actions or
            business data are implemented yet.
          </p>
        </div>
      </div>
      <Link className="text-link back-link" to="/">Return to home</Link>
    </section>
  );
}
