export const MODULE_ID = "hero-engine";
export const API_VERSION = "2.1.0";
export const SOCKET_NAME = `module.${MODULE_ID}`;

/** Settings keys (world scope). */
export const SETTINGS = {
  dawnHour: "dawnHour",
  adjudicationQueue: "adjudicationQueue",
  pendingOps: "pendingOps",
  backupEvidence: "backupEvidence",
  theme: "theme",
  clientTheme: "clientTheme",
  worldConfigPrefix: "config.", // + pluginId
} as const;

/** Flag paths under flags["hero-engine"] on Actors/Items. */
export const FLAGS = {
  mechanics: "mechanics", // { [pluginId]: InstanceState } on the state document
  attachments: "attachments", // on the ACTOR: { [pluginId]: { itemUuid?: string } }
  overrides: "overrides", // { [pluginId]: Record<string, unknown> } on the state document
} as const;

export const AUDIT_CAP = 50;
