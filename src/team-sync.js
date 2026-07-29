import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  randomBytes,
  sign,
  verify
} from "node:crypto";
import { canonicalStringify, deepFreezeJson, sha256 } from "./canonical.js";
import { readEvents, verifyStore } from "./store.js";
import { loadWorkspace } from "./workspace.js";

const ROLES = new Set(["owner", "maintainer", "reader"]);

function boundedText(value, label, maximum = 256) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    throw new TypeError(`${label} must be a non-empty string up to ${maximum} characters.`);
  }
  return value.trim();
}

function normalizeMembers(members) {
  if (!Array.isArray(members) || members.length < 1 || members.length > 500) {
    throw new TypeError("members must contain 1 to 500 entries.");
  }
  const ids = new Set();
  const normalized = members.map((member, index) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      throw new TypeError(`members[${index}] must be an object.`);
    }
    const unknown = Object.keys(member).filter((key) => !["id", "role", "publicKey"].includes(key));
    if (unknown.length > 0) throw new TypeError(`members[${index}] contains unknown field(s): ${unknown.join(", ")}.`);
    const id = boundedText(member.id, `members[${index}].id`);
    if (ids.has(id)) throw new TypeError("members cannot contain duplicate ids.");
    ids.add(id);
    if (!ROLES.has(member.role)) throw new TypeError(`members[${index}].role is invalid.`);
    return {
      id,
      role: member.role,
      publicKey: member.publicKey === undefined ? null : boundedText(member.publicKey, `members[${index}].publicKey`, 16_384)
    };
  });
  if (!normalized.some((member) => member.role === "owner")) throw new TypeError("members must include at least one owner.");
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

export function createTeamManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("team manifest input must be an object.");
  const unknown = Object.keys(input).filter((key) => !["workspaceId", "teamId", "members", "github"].includes(key));
  if (unknown.length > 0) throw new TypeError(`team manifest contains unknown field(s): ${unknown.join(", ")}.`);
  const base = {
    schemaVersion: "qarinah.team-manifest.v1",
    workspaceId: boundedText(input.workspaceId, "workspaceId", 64),
    teamId: boundedText(input.teamId, "teamId", 256),
    members: normalizeMembers(input.members),
    github: input.github === undefined || input.github === null
      ? null
      : {
          organization: boundedText(input.github.organization, "github.organization"),
          repository: boundedText(input.github.repository, "github.repository")
        }
  };
  return deepFreezeJson({ ...base, manifestHash: sha256(canonicalStringify(base)) });
}

function encryptionKey(value) {
  const key = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value ?? []);
  if (key.length !== 32) throw new TypeError("key must contain exactly 32 bytes.");
  return key;
}

function permittedMember(manifest, memberId, write = false) {
  const member = manifest.members.find((candidate) => candidate.id === memberId);
  if (!member || (write && member.role === "reader")) throw new TypeError("The member is not authorized for this operation.");
  return member;
}

export async function createEncryptedSyncBundle(options) {
  const workspace = await loadWorkspace(options.cwd ?? process.cwd());
  const manifest = createTeamManifest(options.manifest);
  if (manifest.workspaceId !== workspace.config.workspaceId) throw new TypeError("Team manifest workspaceId does not match the workspace.");
  permittedMember(manifest, options.memberId, false);
  const events = await readEvents(workspace, { updateCheckpoint: false });
  const payload = Buffer.from(canonicalStringify({
    schemaVersion: "qarinah.sync-payload.v1",
    workspaceId: workspace.config.workspaceId,
    teamManifest: manifest,
    events
  }), "utf8");
  const key = encryptionKey(options.key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(manifest.manifestHash, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return deepFreezeJson({
    schemaVersion: "qarinah.encrypted-sync-bundle.v1",
    algorithm: "AES-256-GCM",
    workspaceId: workspace.config.workspaceId,
    teamManifestHash: manifest.manifestHash,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64")
  });
}

export function decryptEncryptedSyncBundle(bundle, options) {
  if (bundle?.schemaVersion !== "qarinah.encrypted-sync-bundle.v1" || bundle.algorithm !== "AES-256-GCM") {
    throw new TypeError("Unsupported encrypted sync bundle.");
  }
  const manifest = createTeamManifest(options.manifest);
  if (manifest.manifestHash !== bundle.teamManifestHash || manifest.workspaceId !== bundle.workspaceId) {
    throw new TypeError("Encrypted sync bundle authority does not match the team manifest.");
  }
  permittedMember(manifest, options.memberId, false);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(options.key), Buffer.from(bundle.nonce, "base64"));
  decipher.setAAD(Buffer.from(manifest.manifestHash, "utf8"));
  decipher.setAuthTag(Buffer.from(bundle.authenticationTag, "base64"));
  const payload = Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, "base64")),
    decipher.final()
  ]);
  return deepFreezeJson(JSON.parse(payload.toString("utf8")));
}

export async function createSignedCheckpoint(options) {
  const store = await verifyStore(options.cwd ?? process.cwd(), { updateCheckpoint: false });
  const checkpoint = {
    schemaVersion: "qarinah.signed-checkpoint.v1",
    workspaceId: store.workspaceId,
    eventCount: store.eventCount,
    headHash: store.headHash,
    signer: boundedText(options.signer, "signer"),
    createdAt: (options.clock?.() ?? new Date()).toISOString()
  };
  const payload = Buffer.from(canonicalStringify(checkpoint), "utf8");
  const privateKey = options.privateKey instanceof KeyObject
    ? options.privateKey
    : createPrivateKey(options.privateKey);
  const signature = sign(null, payload, privateKey).toString("base64");
  return deepFreezeJson({
    ...checkpoint,
    publicKey: createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString(),
    signature
  });
}

export function verifySignedCheckpoint(checkpoint, publicKey = checkpoint?.publicKey) {
  if (checkpoint?.schemaVersion !== "qarinah.signed-checkpoint.v1") return false;
  const { signature, publicKey: embeddedPublicKey, ...payload } = checkpoint;
  if (typeof signature !== "string" || typeof publicKey !== "string" || embeddedPublicKey !== publicKey) return false;
  return verify(
    null,
    Buffer.from(canonicalStringify(payload), "utf8"),
    createPublicKey(publicKey),
    Buffer.from(signature, "base64")
  );
}
