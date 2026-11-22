/** Signature-table filters <-> URL params <-> API query. */
export interface SignatureFilters {
  groupId: string;
  templateId: string;
  versionId: string;
  status: string;
  olderVersion: boolean;
}

export function filtersFromParams(p: URLSearchParams): SignatureFilters {
  return {
    groupId: p.get('groupId') ?? '',
    templateId: p.get('templateId') ?? '',
    versionId: p.get('versionId') ?? '',
    status: p.get('status') ?? '',
    olderVersion: p.get('olderVersion') === '1',
  };
}

/** Query string for /signatures/table and /signatures/export. */
export function filtersToQuery(f: SignatureFilters) {
  return { groupId: f.groupId, templateId: f.templateId, versionId: f.versionId, status: f.status, olderVersion: f.olderVersion ? 'true' : undefined };
}
