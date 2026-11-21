/**
 * Boundary to the Academy's central system (Core Engine).
 * Business logic depends only on this interface. Today it is backed by StubCoreEngineClient;
 * later an HttpCoreEngineClient can implement the same methods without touching services.
 */
export interface Academy {
  name: string;
  director: string;
  address: string;
}

export interface Group {
  id: string;
  name: string;
  courseName: string;
  startDate: string; // ISO date
  endDate: string;
  schedule: string;
  studentCount: number;
}

export interface Student {
  id: string;
  groupId: string;
  fullName: string;
  passport?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
}

export interface Staff {
  id: string;
  fullName: string;
  position: string;
  email?: string | null;
  phone?: string | null;
}

export interface Partner {
  id: string;
  name: string;
  taxId: string;
  address: string;
  email?: string | null;
  contactPerson?: string | null;
}

export interface CoreEngineClient {
  getAcademy(): Promise<Academy>;
  listGroups(): Promise<Group[]>;
  getGroup(id: string): Promise<Group | null>;
  listGroupStudents(groupId: string): Promise<Student[]>;
  getStudents(ids: string[]): Promise<Student[]>;
  listStaff(): Promise<Staff[]>;
  getStaff(ids: string[]): Promise<Staff[]>;
  listPartners(): Promise<Partner[]>;
  getPartners(ids: string[]): Promise<Partner[]>;
}
