/**
 * PortAgent constants — tool metadata and input schemas for sf_assign_port and sf_check_port.
 */

export const ASSIGN_PORT_NAME = "sf_assign_port";

export const ASSIGN_PORT_DESCRIPTION =
  "Assign a port via portman (if available) or find a free one. Never hardcode 3000.";

export const CHECK_PORT_NAME = "sf_check_port";

export const CHECK_PORT_DESCRIPTION =
  "Check if a specific port is in use and what process owns it.";

export const TOOL_TIER = "TIER1" as const;

export const ASSIGN_PORT_SCHEMA = {
  type: "object" as const,
  properties: {
    appName: { type: "string", description: "Application name for registration" },
  },
  required: ["appName"],
};

export const CHECK_PORT_SCHEMA = {
  type: "object" as const,
  properties: {
    port: { type: "number", description: "Port number to check" },
  },
  required: ["port"],
};
