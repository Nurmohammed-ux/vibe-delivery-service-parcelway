export function sendPublicAuthError(response, error) {
  if (
    error?.isPublicAuthError === true &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599 &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,60}$/.test(error.code) &&
    typeof error.message === "string"
  ) {
    return response.status(error.status).json({
      error: error.message,
      code: error.code,
    });
  }

  return response.status(503).json({
    error: "The authentication or account service is temporarily unavailable.",
    code: "AUTH_UNAVAILABLE",
  });
}
