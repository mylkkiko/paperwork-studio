import type { Academy, Group, Partner, Staff, Student } from './CoreEngineClient';

/** Demo data for the stub Core Engine. Emails go to Mailpit in dev, so any address is safe. */
export const academy: Academy = {
  name: 'Թվային հմտությունների ակադեմիա',
  director: 'Արմեն Սարգսյան',
  address: 'ք. Երևան, Աբովյան փ. 12',
};

export const DEMO_GROUP_ID = 'grp-web-2026-a';

export const groups: Omit<Group, 'studentCount'>[] = [
  {
    id: DEMO_GROUP_ID,
    name: 'ՎԾ-2026-Ա',
    courseName: 'Վեբ ծրագրավորման հիմունքներ',
    startDate: '2026-12-01',
    endDate: '2027-05-31',
    schedule: 'երկուշաբթի, չորեքշաբթի, ուրբաթ՝ 19:00–21:00',
  },
];

// [Armenian full name, latin slug for the email, street]
const people: [string, string, string][] = [
  ['Աննա Հակոբյան', 'anna.hakobyan', 'Կոմիտասի պող. 15, բն. 8'],
  ['Դավիթ Գրիգորյան', 'davit.grigoryan', 'Մաշտոցի պող. 42, բն. 17'],
  ['Մարիամ Պետրոսյան', 'mariam.petrosyan', 'Բաղրամյան պող. 7, բն. 3'],
  ['Արամ Մկրտչյան', 'aram.mkrtchyan', 'Թումանյան փ. 21, բն. 11'],
  ['Լիլիթ Ավետիսյան', 'lilit.avetisyan', 'Արշակունյաց պող. 30, բն. 54'],
  ['Տիգրան Սահակյան', 'tigran.sahakyan', 'Ազատության պող. 18, բն. 9'],
  ['Նարե Հովհաննիսյան', 'nare.hovhannisyan', 'Նալբանդյան փ. 5, բն. 2'],
  ['Գոռ Վարդանյան', 'gor.vardanyan', 'Տիգրան Մեծի պող. 64, բն. 40'],
  ['Սոնա Կարապետյան', 'sona.karapetyan', 'Հալաբյան փ. 33, բն. 71'],
  ['Հայկ Մարտիրոսյան', 'hayk.martirosyan', 'Բաբաջանյան փ. 12, բն. 25'],
  ['Էլեն Խաչատրյան', 'elen.khachatryan', 'Սայաթ-Նովայի պող. 9, բն. 6'],
  ['Վահե Սարգսյան', 'vahe.sargsyan', 'Վազգեն Սարգսյանի փ. 26, բն. 13'],
  ['Անի Գևորգյան', 'ani.gevorgyan', 'Դավիթաշենի 2-րդ թաղ. 14, բն. 33'],
  ['Կարեն Հարությունյան', 'karen.harutyunyan', 'Շիրազի փ. 47, բն. 19'],
  ['Մանե Ղազարյան', 'mane.ghazaryan', 'Աբովյան փ. 52, բն. 4'],
  ['Էրիկ Ստեփանյան', 'erik.stepanyan', 'Կորյունի փ. 19, բն. 22'],
  ['Գայանե Մանուկյան', 'gayane.manukyan', 'Անդրանիկի փ. 88, բն. 47'],
  ['Արման Աբրահամյան', 'arman.abrahamyan', 'Ծովակալ Իսակովի պող. 3, բն. 15'],
  ['Սիրանուշ Միքայելյան', 'siranush.mikayelyan', 'Արաբկիր 17-րդ փ. 6, բն. 1'],
  ['Նարեկ Զաքարյան', 'narek.zakaryan', 'Գյուլբենկյան փ. 37, բն. 58'],
  ['Տաթևիկ Բաղդասարյան', 'tatevik.baghdasaryan', 'Հրաչյա Քոչարի փ. 24, բն. 30'],
  ['Ռուբեն Ալեքսանյան', 'ruben.aleksanyan', 'Լենինգրադյան փ. 11, բն. 64'],
  ['Մերի Թորոսյան', 'meri.torosyan', 'Պուշկինի փ. 40, բն. 12'],
  ['Սամվել Դանիելյան', 'samvel.danielyan', 'Չարենցի փ. 59, բն. 7'],
];

export const students: Student[] = people.map(([fullName, slug, street], i) => {
  const n = i + 1;
  return {
    id: `stu-${String(n).padStart(3, '0')}`,
    groupId: DEMO_GROUP_ID,
    fullName,
    // Two students have gaps on purpose so the precheck step has something to report:
    //   #07 has no passport, #15 has no address.
    passport: n === 7 ? null : `AN${String(1_234_560 + n * 731).padStart(7, '0')}`,
    address: n === 15 ? null : `ք. Երևան, ${street}`,
    phone: `+374 9${n % 10} ${String(100 + n * 7).padStart(3, '0')} ${String(200 + n * 13).slice(-3)}`,
    email: `${slug}@student.academy.am`,
    birthDate: `${1995 + (n % 9)}-${String((n % 12) + 1).padStart(2, '0')}-${String((n % 27) + 1).padStart(2, '0')}`,
  };
});

export const staff: Staff[] = [
  { id: 'stf-001', fullName: 'Արմեն Սարգսյան', position: 'Տնօրեն', email: 'armen.sargsyan@academy.am', phone: '+374 10 545 001' },
  { id: 'stf-002', fullName: 'Լուսինե Աղաջանյան', position: 'Ուսումնական մասի վարիչ', email: 'lusine.aghajanyan@academy.am', phone: '+374 10 545 002' },
  { id: 'stf-003', fullName: 'Գարիկ Հովսեփյան', position: 'Դասախոս', email: 'garik.hovsepyan@academy.am', phone: '+374 10 545 003' },
  { id: 'stf-004', fullName: 'Քրիստինե Մելքոնյան', position: 'Հաշվապահ', email: 'kristine.melkonyan@academy.am', phone: '+374 10 545 004' },
  { id: 'stf-005', fullName: 'Վարդան Եղիազարյան', position: 'Համակարգող', email: 'vardan.yeghiazaryan@academy.am', phone: '+374 10 545 005' },
];

export const partners: Partner[] = [
  { id: 'prt-001', name: '«Կոդ Լաբ» ՍՊԸ', taxId: '02612345', address: 'ք. Երևան, Հալաբյան փ. 41', email: 'info@codelab.am', contactPerson: 'Հրանտ Պողոսյան' },
  { id: 'prt-002', name: '«Թեքնո Սփեյս» ՓԲԸ', taxId: '00487123', address: 'ք. Երևան, Ազատության պող. 24/17', email: 'office@technospace.am', contactPerson: 'Մարինե Ասատրյան' },
  { id: 'prt-003', name: '«Նոր Գիրք» հրատարակչություն', taxId: '01845566', address: 'ք. Գյումրի, Ռիժկովի փ. 8', email: 'books@norgirq.am', contactPerson: 'Անահիտ Վարոսյան' },
];
