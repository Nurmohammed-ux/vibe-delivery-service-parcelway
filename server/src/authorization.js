import { supportedRoles } from "./config.js";

const roleHomePaths = {
  customer: "/app",
  recipient: "/recipient",
  courier: "/courier",
  dispatcher: "/ops",
  admin: "/admin",
};

export function isSupportedRole(role) {
  return supportedRoles.includes(role);
}

export function getRoleHomePath(role) {
  return roleHomePaths[role];
}

export function canAccessShipment(user, shipment) {
  if (!user || !shipment) {
    return false;
  }

  switch (user.role) {
    case "customer":
      return shipment.customerId === user.id;
    case "recipient":
      return shipment.recipientId === user.id;
    case "courier":
      return shipment.courierId === user.id;
    case "dispatcher":
      return true;
    default:
      return false;
  }
}

export function canAssignCourier(user) {
  return user?.role === "dispatcher";
}
