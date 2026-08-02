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
  const nodeIds = new Set();
  const packs = [];
  for (const [index, descriptor] of options.workspaces.entries()) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      throw new TypeError(`workspaces[${index}] must be an object.`);
    }
    const unknown = Object.keys(descriptor).filter((key) => ![
      "cwd", "authority", "repositoryId", "authorityScopes", "maxChars", "limit"
    ].includes(key));
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
    const repositoryId = descriptor.repositoryId ?? workspace.config.workspaceId;
    if (typeof repositoryId !== "string" || repositoryId.trim() === "" || repositoryId.length > 256) {
      throw new TypeError(`workspaces[${index}].repositoryId must be a non-empty string up to 256 characters.`);
    }
    if (nodeIds.has(repositoryId)) throw new TypeError("workspaces cannot share a repositoryId.");
    nodeIds.add(repositoryId);
    const authorityScopes = descriptor.authorityScopes ?? [];
    if (!Array.isArray(authorityScopes) || authorityScopes.length > 64
      || authorityScopes.some((value) => typeof value !== "string" || value.trim() === "" || value.length > 256)) {
      throw new TypeError(`workspaces[${index}].authorityScopes must contain at most 64 non-empty strings.`);
    }
    const pack = await compileContext(query, {
      cwd: workspace.root,
      maxChars: descriptor.maxChars ?? options.maxChars,
      limit: descriptor.limit ?? options.limit,
      minimumCoverage: options.minimumCoverage ?? "any",
      rebuild: options.rebuild,
      updateCheckpoint: options.updateCheckpoint,
      authorityScopes,
      repositoryIds: [repositoryId]
    });
    packs.push({
      authority: descriptor.authority,
      repositoryId,
      workspaceId: workspace.config.workspaceId,
      pack
    });
  }
  const relationships = options.relationships ?? [];
  const relationTypes = new Set(["depends_on", "documents", "deploys", "shares_contract", "owned_by", "references"]);
  if (!Array.isArray(relationships) || relationships.length > 256) {
    throw new TypeError("relationships must contain at most 256 typed repository edges.");
  }
  const repositoryGraph = relationships.map((relationship, index) => {
    if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
      throw new TypeError(`relationships[${index}] must be an object.`);
    }
    const unknown = Object.keys(relationship).filter((key) => !["from", "to", "type"].includes(key));
    if (unknown.length) throw new TypeError(`relationships[${index}] contains unknown field(s): ${unknown.join(", ")}.`);
    if (!nodeIds.has(relationship.from) || !nodeIds.has(relationship.to)) {
      throw new TypeError(`relationships[${index}] must reference declared repositoryId values.`);
    }
    if (!relationTypes.has(relationship.type)) throw new TypeError(`relationships[${index}].type is invalid.`);
    return { from: relationship.from, to: relationship.to, type: relationship.type };
  });
  const base = {
    schemaVersion: "qarinah.federated-context.v1",
    query,
    authorityBoundary: "separate-packs",
    workspaces: packs,
    repositoryGraph
  };
  return deepFreezeJson({ ...base, manifestHash: sha256(canonicalStringify(base)) });
}
