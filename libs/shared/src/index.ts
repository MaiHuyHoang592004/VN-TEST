/**
 * @gwprint/shared — the isomorphic layer.
 *
 * Pure types, constants and logic that BOTH the server and the browser need,
 * with ZERO dependencies. Nothing here may import from @gwprint/db,
 * @gwprint/auth or an app: the arrow points shared ← db ← auth ← apps.
 *
 * The test: if adding an import here would break a browser bundle, it doesn't
 * belong in this package.
 */
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  USER_ROLES,
  permissionsFor,
  can,
  scopeFor,
  type Permission,
  type Scope,
  type SessionUser,
  type UserRole,
} from "./access/permissions.ts";

export {
  driveFileUrl,
  driveFolderListUrl,
  driveThumbnailUrl,
  parseDriveUrl,
  parseFolderEntries,
  pickArtworkFile,
  type DriveEntry,
  type DriveRef,
} from "./drive/folder.ts";
