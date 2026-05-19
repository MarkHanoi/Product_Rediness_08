/**
 * Builds an `IfcOwnerHistory` chain (Person + Organization + Application)
 * shared by every owned IFC entity in the export.
 */

import * as WebIFC from 'web-ifc';
import type { IfcAPI } from 'web-ifc';

import { label, identifier, writeEntity, type EntityRef } from './api/webifc-helpers.js';
import type { ProjectMeta } from './types.js';

export interface OwnerHistoryRefs {
  ownerHistory: EntityRef;
  application: EntityRef;
  personAndOrganization: EntityRef;
}

export function buildOwnerHistory(
  api: IfcAPI,
  modelId: number,
  meta: ProjectMeta,
  timestamp: number,
): OwnerHistoryRefs {
  const personName = meta.personName ?? 'PRYZM User';
  const orgName = meta.organizationName ?? 'PRYZM';
  const appName = meta.applicationName ?? 'PRYZM';
  const appId = meta.applicationIdentifier ?? 'PRYZM-2';
  const appVer = meta.applicationVersion ?? '2.0.0';

  const person = writeEntity(
    api,
    modelId,
    WebIFC.IFCPERSON,
    null, // Identification
    label(api, modelId, personName), // FamilyName
    null, // GivenName
    null, // MiddleNames
    null, // PrefixTitles
    null, // SuffixTitles
    null, // Roles
    null, // Addresses
  );

  const organization = writeEntity(
    api,
    modelId,
    WebIFC.IFCORGANIZATION,
    null, // Identification
    label(api, modelId, orgName), // Name
    null, // Description
    null, // Roles
    null, // Addresses
  );

  const personAndOrganization = writeEntity(
    api,
    modelId,
    WebIFC.IFCPERSONANDORGANIZATION,
    person,
    organization,
    null, // Roles
  );

  const application = writeEntity(
    api,
    modelId,
    WebIFC.IFCAPPLICATION,
    organization,
    label(api, modelId, appVer), // Version
    label(api, modelId, appName), // ApplicationFullName
    identifier(api, modelId, appId), // ApplicationIdentifier
  );

  const ownerHistory = writeEntity(
    api,
    modelId,
    WebIFC.IFCOWNERHISTORY,
    personAndOrganization,
    application,
    null, // State (IfcStateEnum)
    // `IfcChangeActionEnum` is not re-exported through `web-ifc-api`'s public root
    // (declared only in ifc-schema.d.ts). Use the string literal directly — web-ifc
    // accepts `'NOCHANGE'` for backward compatibility.
    'NOCHANGE' as unknown, // ChangeAction (IfcStateEnum)
    timestamp, // LastModifiedDate
    personAndOrganization, // LastModifyingUser
    application, // LastModifyingApplication
    timestamp, // CreationDate
  );

  return { ownerHistory, application, personAndOrganization };
}
