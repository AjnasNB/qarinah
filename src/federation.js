import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { compileContext } from "./compiler.js";
import { loadWorkspace } from "./workspace.js";

export async function compileFederatedContext(query, options = {}) {
  if (typeof query !== "string" || query.length > 4_096) {
    throw new TypeError("query must be a string up to 4096 characters.");
  }
  if (!Array.isArray(options.workspaces) || options.workspaces.length < 1 || options.workspaces.length > 32) {
    throw new TypeError("workspaces must contain 1 to 32 explicit workspace descriptors.");
  }
  const seen = new Set();
  const packs = [];
  for (const [index, descriptor] of options.workspaces.entries()) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError(`workspaces[${index}] must be an object.`);
    }
    const unknown = Object.keys(descriptor).filter((key) => !["cwd", "authority", "maxChars", "limit"].includes(key));
    if (unknown.length > 0) throw new TypeError(`workspaces[${index}] contains unknown field(s): ${unknown.join(", ")}.`);
    if (typeof descriptor.cwd !== "string" || descriptor.cwd.trim() === "") {
      throw new TypeError(`workspaces[${index}].cwd must be an explicit path.`);
    }
    if (typeof descriptor.authority !== "string" || descriptor.authority.trim() === "" || descriptor.authority.length > 256) {
      throw new TypeError(`workspaces[${index}].authority must be a non-empty string up to 256 characters.`);
    }
    const workspace = await loadWorkspace(descriptor.cwd);
    if (seen.has(workspace.config.workspaceId)) throw new TypeError("workspaces cannot contain the same workspace more than once.");
    seen.add(workspace.config.workspaceId);
    const pack = await compileContext(query, {
      cwd: workspace.root,
      maxChars: descriptor.maxChars ?? options.maxChars,
      limit: descriptor.limit ?? options.limit,
      minimumCoverage: options.minimumCoverage ?? "any",
      rebuild: options.rebuild,
      updateCheckpoint: options.updateCheckpoint
    });
    packs.push({
      authority: descriptor.authority,
      workspaceId: workspace.config.workspaceId,
      pack
    });
  }
  const base = {
    schemaVersion: "qarinah.federated-context.v1",
    query,
    authorityBoundary: "separate-packs",
    workspaces: packs
  };
  return deepFreezeJson({ ...base, manifestHash: sha256(canonicalStringify(base)) });
}
