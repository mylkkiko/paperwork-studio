import type { CoreEngineClient, Group } from './CoreEngineClient';
import * as data from './stub-data';

/**
 * In-memory Core Engine. Returns deep copies so callers can never mutate the "remote" data.
 * Tests can pass their own dataset (e.g. to simulate Core Engine data changing after generation).
 */
export class StubCoreEngineClient implements CoreEngineClient {
  constructor(private readonly ds: typeof data = data) {}

  private copy<T>(x: T): T {
    return structuredClone(x);
  }

  async getAcademy() {
    return this.copy(this.ds.academy);
  }

  async listGroups(): Promise<Group[]> {
    return this.ds.groups.map((g) => ({ ...g, studentCount: this.ds.students.filter((s) => s.groupId === g.id).length }));
  }

  async getGroup(id: string) {
    return (await this.listGroups()).find((g) => g.id === id) ?? null;
  }

  async listGroupStudents(groupId: string) {
    return this.copy(this.ds.students.filter((s) => s.groupId === groupId));
  }

  async getStudents(ids: string[]) {
    return this.copy(this.ds.students.filter((s) => ids.includes(s.id)));
  }

  async listStaff() {
    return this.copy(this.ds.staff);
  }

  async getStaff(ids: string[]) {
    return this.copy(this.ds.staff.filter((s) => ids.includes(s.id)));
  }

  async listPartners() {
    return this.copy(this.ds.partners);
  }

  async getPartners(ids: string[]) {
    return this.copy(this.ds.partners.filter((p) => ids.includes(p.id)));
  }
}
