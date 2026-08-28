/**
 * Adapter — bridges the existing security module (securityLayer) into the
 * harness PolicyEngine. The PolicyEngine adds the risk model and autonomy
 * model on top of the existing read/write permission check.
 *
 * This adapter re-exports the PolicyEngine and provides a convenience
 * function to wire the existing securityLayer into it.
 */
export { PolicyEngine, policyEngine } from '../policyEngine.js';
export type { PolicyEngineOptions } from '../policyEngine.js';

import { securityLayer } from '../../security/securityLayer.js';
import { identityPermissions } from '../../identity-permissions/identityPermissions.js';
import { PolicyEngine } from '../policyEngine.js';

/**
 * Create a PolicyEngine wired to the existing securityLayer +
 * identityPermissions singletons. The PolicyEngine already delegates to
 * these singletons internally; this function returns a configured instance
 * with sensible defaults.
 */
export function createWiredPolicyEngine(): PolicyEngine {
  // The PolicyEngine imports securityLayer + identityPermissions internally,
  // so we just return a default-configured instance. This function exists
  // as an explicit wiring point for future dependency injection.
  void securityLayer;
  void identityPermissions;
  return new PolicyEngine();
}
