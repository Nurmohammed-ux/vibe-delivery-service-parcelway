export function loadShipmentRules(value) {
  if (!value) {
    return null;
  }

  let rules;
  try {
    rules = JSON.parse(value);
  } catch {
    throw new Error("SHIPMENT_RULES_JSON must contain valid JSON.");
  }

  if (
    !rules ||
    typeof rules !== "object" ||
    typeof rules.currency !== "string" ||
    !/^[A-Z]{3}$/.test(rules.currency) ||
    typeof rules.termsVersion !== "string" ||
    !rules.termsVersion.trim() ||
    typeof rules.termsText !== "string" ||
    !rules.termsText.trim() ||
    !Array.isArray(rules.supportedPostalCodes) ||
    rules.supportedPostalCodes.length === 0 ||
    !Array.isArray(rules.services) ||
    rules.services.length === 0
  ) {
    throw new Error(
      "SHIPMENT_RULES_JSON must define currency, terms, supportedPostalCodes, and services.",
    );
  }

  const postalCodesValid = rules.supportedPostalCodes.every(
    (code) => typeof code === "string" && code.trim().length > 0,
  );
  const allowedPostalCodes = new Set(
    rules.supportedPostalCodes
      .filter((code) => typeof code === "string")
      .map((code) => code.trim().toLowerCase()),
  );
  const servicesValid = rules.services.every(
    (service) =>
      isValidService(service) &&
      hasUniqueIds(service.pickupWindows) &&
      hasUniqueIds(service.deliveryWindows) &&
      (!service.supportedPostalCodes ||
        service.supportedPostalCodes.every((code) =>
          allowedPostalCodes.has(code.trim().toLowerCase()),
        )),
  );
  const serviceIds = servicesValid
    ? rules.services.map((service) => service.id)
    : [];
  if (
    !postalCodesValid ||
    !servicesValid ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    throw new Error(
      "SHIPMENT_RULES_JSON contains an invalid postal code or duplicate or invalid service rule.",
    );
  }

  return Object.freeze({
    currency: rules.currency,
    termsVersion: rules.termsVersion.trim(),
    termsText: rules.termsText.trim(),
    supportedPostalCodes: rules.supportedPostalCodes.map((code) =>
      code.trim().toLowerCase(),
    ),
    services: rules.services.map((service) => ({
      id: service.id,
      name: service.name.trim(),
      description: service.description.trim(),
      basePrice: service.basePrice,
      pricePerKg: service.pricePerKg,
      maxWeightKg: service.maxWeightKg,
      maxDimensionsCm: {
        length: service.maxDimensionsCm.length,
        width: service.maxDimensionsCm.width,
        height: service.maxDimensionsCm.height,
      },
      pickupWindows: service.pickupWindows.map(({ id, label }) => ({
        id,
        label: label.trim(),
      })),
      deliveryWindows: service.deliveryWindows.map(({ id, label }) => ({
        id,
        label: label.trim(),
      })),
      ...(service.supportedPostalCodes
        ? {
            supportedPostalCodes: service.supportedPostalCodes.map((code) =>
              code.trim().toLowerCase(),
            ),
          }
        : {}),
    })),
  });
}

export function isValidService(service) {
  return (
    service &&
    typeof service.id === "string" &&
    /^[a-zA-Z0-9_-]{1,40}$/.test(service.id) &&
    typeof service.name === "string" &&
    service.name.trim().length > 0 &&
    typeof service.description === "string" &&
    Number.isInteger(service.basePrice) &&
    service.basePrice >= 0 &&
    Number.isFinite(service.pricePerKg) &&
    service.pricePerKg >= 0 &&
    Number.isFinite(service.maxWeightKg) &&
    service.maxWeightKg > 0 &&
    service.maxDimensionsCm &&
    (service.supportedPostalCodes === undefined ||
      (Array.isArray(service.supportedPostalCodes) &&
        service.supportedPostalCodes.length > 0 &&
        service.supportedPostalCodes.every(
          (code) => typeof code === "string" && code.trim().length > 0,
        ))) &&
    ["length", "width", "height"].every(
      (dimension) =>
        Number.isFinite(service.maxDimensionsCm[dimension]) &&
        service.maxDimensionsCm[dimension] > 0,
    ) &&
    Array.isArray(service.pickupWindows) &&
    service.pickupWindows.length > 0 &&
    service.pickupWindows.every(isValidWindow) &&
    Array.isArray(service.deliveryWindows) &&
    service.deliveryWindows.length > 0 &&
    service.deliveryWindows.every(isValidWindow)
  );
}

function isValidWindow(window) {
  return (
    window &&
    typeof window.id === "string" &&
    /^[a-zA-Z0-9_-]{1,40}$/.test(window.id) &&
    typeof window.label === "string" &&
    window.label.trim().length > 0
  );
}

function hasUniqueIds(items) {
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length;
}
