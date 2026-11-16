import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiRequest } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ErrorState, LoadingState, Notice } from "../components/Feedback.jsx";

const roleOptions = ["customer", "recipient", "courier", "dispatcher", "admin"];
const weekDays = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];
const tabs = [
  ["settings", "Business settings"],
  ["users", "Users and roles"],
  ["audit", "Audit history"],
  ["integrations", "System status"],
];

export function AdminWorkspacePage() {
  const { getAccessToken, authMode } = useAuth();
  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState(null);
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState(null);
  const [users, setUsers] = useState([]);
  const [roleDrafts, setRoleDrafts] = useState({});
  const [auditEvents, setAuditEvents] = useState([]);
  const [integrations, setIntegrations] = useState(null);
  const [saving, setSaving] = useState(false);

  const requestHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAccessToken]);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await requestHeaders();
      const results = await Promise.all([
        apiGet("/api/admin/settings", { headers }),
        apiGet("/api/admin/users", { headers }),
        apiGet("/api/admin/audit", { headers }),
        apiGet("/api/admin/integrations", { headers }),
      ]);
      const [settingsResult, usersResult, auditResult, integrationsResult] = results;
      setSettings(settingsResult.settings);
      setSource(settingsResult.source);
      setDraft(makeDraft(settingsResult.settings));
      setUsers(usersResult.users);
      setRoleDrafts(Object.fromEntries(usersResult.users.map((user) => [user.id, user.role])));
      setAuditEvents(auditResult.events);
      setIntegrations(integrationsResult);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setLoading(false);
    }
  }, [requestHeaders]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  async function saveSettings(event) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      const result = await apiRequest("/api/admin/settings", {
        method: "PUT",
        headers: await requestHeaders(),
        body: JSON.stringify({
          currency: draft.currency,
          serviceAreas: draft.serviceAreasText
            .split(",")
            .map((area) => area.trim())
            .filter(Boolean),
          services: draft.services,
          operatingHours: {
            days: draft.days,
            opensAt: draft.opensAt,
            closesAt: draft.closesAt,
          },
        }),
      });
      setSettings(result.settings);
      setSource(result.source);
      setDraft(makeDraft(result.settings));
      setNotice("Business settings saved. Coverage and pricing apply to new bookings; existing shipments are unchanged.");
      const audit = await apiGet("/api/admin/audit", { headers: await requestHeaders() });
      setAuditEvents(audit.events);
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSaving(false);
    }
  }

  async function saveRole(user) {
    const role = roleDrafts[user.id];
    if (role === user.role) return;
    setError(null);
    setNotice("");
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: "PATCH",
        headers: await requestHeaders(),
        body: JSON.stringify({ role }),
      });
      setNotice(`${user.displayName || user.email} is now assigned the ${role} role. Access changes immediately.`);
      await loadAdminData();
    } catch (requestError) {
      setError(requestError);
    }
  }

  return (
    <section className="content-page admin-page">
      <header className="admin-heading">
        <div>
          <span className="eyebrow">ADMINISTRATOR WORKSPACE</span>
          <h1>Business settings</h1>
          <p className="page-intro">
            Manage service rules and account access. Sensitive changes are recorded in the audit history.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={loadAdminData}>
          Refresh
        </button>
        <Link className="btn btn-secondary" to="/ops">Open operations</Link>
      </header>

      {authMode === "development-mock" ? (
        <Notice tone="warning">
          Development-only mock identity. Do not use this mode for real account or business changes.
        </Notice>
      ) : null}
      {error ? <ErrorState title="Administrator action failed" message={error.message} /> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <nav className="admin-tabs" aria-label="Administrator sections">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={`admin-tab${activeTab === id ? " admin-tab-active" : ""}`}
            type="button"
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? <LoadingState label="Loading administrator data" /> : null}
      {!loading && activeTab === "settings" ? (
        <BusinessSettings
          draft={draft}
          source={source}
          configured={Boolean(settings?.rules)}
          saving={saving}
          onSave={saveSettings}
          onChange={setDraft}
        />
      ) : null}
      {!loading && activeTab === "users" ? (
        <UserManagement
          users={users}
          roleDrafts={roleDrafts}
          onRoleChange={(id, role) => setRoleDrafts((current) => ({ ...current, [id]: role }))}
          onSave={saveRole}
        />
      ) : null}
      {!loading && activeTab === "audit" ? <AuditHistory events={auditEvents} /> : null}
      {!loading && activeTab === "integrations" ? <IntegrationStatus integrations={integrations} /> : null}
    </section>
  );
}

function BusinessSettings({ draft, source, configured, saving, onSave, onChange }) {
  if (!configured || !draft) {
    return (
      <section className="surface-card admin-card">
        <h2>Service rules are not configured</h2>
        <p>
          Add valid <code>SHIPMENT_RULES_JSON</code> on the server before managing coverage or pricing.
          This avoids publishing invented business rules.
        </p>
      </section>
    );
  }

  const update = (values) => onChange((current) => ({ ...current, ...values }));
  const updateService = (index, values) => {
    const services = draft.services.map((service, serviceIndex) =>
      serviceIndex === index ? { ...service, ...values } : service,
    );
    update({ services });
  };

  return (
    <form className="admin-settings-form" onSubmit={onSave}>
      <div className="admin-connection-note">
        Settings currently loaded from {source === "database" ? "the database" : "server environment"}.
        Saving makes coverage and service pricing live for new bookings.
      </div>
      <section className="surface-card admin-card">
        <div className="admin-section-heading">
          <div>
            <span className="eyebrow">COVERAGE AND HOURS</span>
            <h2>Service areas</h2>
          </div>
          <span className="admin-live-tag">Booking connected</span>
        </div>
        <label className="auth-field">
          Postal codes
          <input
            value={draft.serviceAreasText}
            onChange={(event) => update({ serviceAreasText: event.target.value })}
            aria-label="Service area postal codes"
            required
          />
          <small>Comma-separated. Coverage applies to pickup and recipient postal codes.</small>
        </label>
        <h3>Operating hours</h3>
        <div className="admin-days">
          {weekDays.map(([day, label]) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={draft.days.includes(day)}
                onChange={(event) =>
                  update({
                    days: event.target.checked
                      ? [...draft.days, day]
                      : draft.days.filter((value) => value !== day),
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="admin-inline-fields">
          <label className="auth-field">Opens at<input type="time" value={draft.opensAt} onChange={(event) => update({ opensAt: event.target.value })} required /></label>
          <label className="auth-field">Closes at<input type="time" value={draft.closesAt} onChange={(event) => update({ closesAt: event.target.value })} required /></label>
        </div>
        <p className="admin-placeholder-note">Operating hours are recorded but are not yet enforced by booking availability.</p>
      </section>

      <section className="surface-card admin-card">
        <div className="admin-section-heading">
          <div>
            <span className="eyebrow">SERVICE LEVELS AND PRICING</span>
            <h2>Delivery options</h2>
          </div>
          <label className="auth-field admin-currency">
            Currency
            <input maxLength="3" value={draft.currency} onChange={(event) => update({ currency: event.target.value.toUpperCase() })} required />
          </label>
        </div>
        {draft.services.map((service, index) => (
          <fieldset className="admin-service-row" key={service.id}>
            <legend>{service.name}</legend>
            <div className="admin-service-grid">
              <label className="auth-field">Name<input value={service.name} onChange={(event) => updateService(index, { name: event.target.value })} required /></label>
              <label className="auth-field">Base price<input type="number" min="0" step="1" value={service.basePrice} onChange={(event) => updateService(index, { basePrice: Number(event.target.value) })} required /></label>
              <label className="auth-field">Price per kg<input type="number" min="0" step="0.01" value={service.pricePerKg} onChange={(event) => updateService(index, { pricePerKg: Number(event.target.value) })} required /></label>
              <label className="auth-field">Max weight (kg)<input type="number" min="0.1" step="0.1" value={service.maxWeightKg} onChange={(event) => updateService(index, { maxWeightKg: Number(event.target.value) })} required /></label>
              <label className="auth-field">Max dimensions (cm)<span className="admin-dimension-inputs">
                {["length", "width", "height"].map((dimension) => (
                  <input key={dimension} aria-label={`${service.name} max ${dimension}`} type="number" min="0.1" step="0.1" value={service.maxDimensionsCm[dimension]} onChange={(event) => updateService(index, { maxDimensionsCm: { ...service.maxDimensionsCm, [dimension]: Number(event.target.value) } })} required />
                ))}
              </span></label>
            </div>
            <p className="admin-service-description">{service.description}</p>
          </fieldset>
        ))}
        <p className="admin-impact-note">
          Price, coverage, and parcel-limit changes affect new bookings only. Existing shipments retain their confirmed terms and price.
        </p>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving settings…" : "Validate and save settings"}
        </button>
      </section>
    </form>
  );
}

function UserManagement({ users, roleDrafts, onRoleChange, onSave }) {
  return (
    <section className="surface-card admin-card">
      <div className="admin-section-heading">
        <div>
          <span className="eyebrow">ACCOUNT ACCESS</span>
          <h2>Users and roles</h2>
        </div>
        <span className="admin-placeholder-note">Accounts are provisioned by Firebase sign-up.</span>
      </div>
      <p className="admin-impact-note">Role changes take effect immediately. The current and final administrator accounts are protected from demotion.</p>
      {users.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Change role</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.displayName || "Unnamed account"}</strong><small>{user.email}</small></td>
                  <td><span className="role-pill">{user.role}</span></td>
                  <td className="admin-role-action">
                    <select aria-label={`Role for ${user.displayName || user.email}`} value={roleDrafts[user.id] || user.role} onChange={(event) => onRoleChange(user.id, event.target.value)}>
                      {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                    <button className="btn btn-secondary" type="button" disabled={roleDrafts[user.id] === user.role} onClick={() => onSave(user)}>Save role</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>No registered accounts were found.</p>}
    </section>
  );
}

function AuditHistory({ events }) {
  return (
    <section className="surface-card admin-card">
      <span className="eyebrow">SENSITIVE CHANGES AND OPERATIONS</span>
      <h2>Audit history</h2>
      <p>Recent role assignments, business settings changes, and dispatcher actions.</p>
      {events.length ? (
        <ol className="admin-audit-list">
          {events.map((event, index) => (
            <li key={`${event.type}-${event.timestamp}-${index}`}>
              <div><strong>{humanize(event.type || event.action)}</strong><time dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleString()}</time></div>
              <p>
                {event.actorName || event.actorId || "System"}
                {event.targetName ? ` · ${event.targetName}` : ""}
                {event.previousRole ? ` · ${event.previousRole} → ${event.role}` : ""}
                {event.targetId && !event.targetName ? ` · ${event.targetId}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : <p>No audit events have been recorded.</p>}
    </section>
  );
}

function IntegrationStatus({ integrations }) {
  if (!integrations) return null;
  const descriptions = {
    database: "MongoDB storage",
    firebaseAuthentication: "Firebase authentication",
    shipmentRules: "Booking rules",
    notifications: "Notification provider",
  };
  return (
    <section className="surface-card admin-card">
      <span className="eyebrow">CONNECTED SERVICES</span>
      <h2>System status</h2>
      <p>Configuration values and secret contents are never displayed here.</p>
      <p className="admin-placeholder-note">
        Notification delivery is provider-managed; templates and credentials are not editable in this app.
        Operating hours are saved but are not yet enforced by booking availability.
      </p>
      <ul className="admin-integrations">
        {Object.entries(descriptions).map(([key, label]) => (
          <li key={key}>
            <span>{label}</span>
            <span className={`integration-status integration-${integrations[key]}`}>
              {humanize(integrations[key])}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function makeDraft(settings) {
  if (!settings?.rules) return null;
  return {
    currency: settings.rules.currency,
    serviceAreasText: settings.rules.supportedPostalCodes.join(", "),
    services: settings.rules.services.map((service) => ({ ...service })),
    days: settings.operatingHours?.days || [],
    opensAt: settings.operatingHours?.opensAt || "",
    closesAt: settings.operatingHours?.closesAt || "",
  };
}

function humanize(value = "") {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
