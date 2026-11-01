import type { DeviceRole } from "../generated/prisma/enums.js";

declare global {
  namespace Express {
    interface AuthenticatedDevice {
      id: string;
      role: DeviceRole;
    }

    interface Request {
      /** Set by authenticate after the access token is verified. */
      device?: AuthenticatedDevice;
      /** Set by validate, parsed, typed input. Controllers read only from here. */
      validated: {
        body: unknown;
        query: unknown;
        params: unknown;
      };
    }
  }
}

export {};
