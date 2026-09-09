import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

const ROLES = ["investigator", "supervisor", "analyst", "admin", "auditor"];

// Demo-only credentials (MVP seeding, Phase 9.2/17). Never reuse these
// values in a real deployment — they exist purely so login/AuthZ is
// testable end to end without a real onboarding flow.
const DEMO_USERS = [
  { username: "investigator1", displayName: "Priya Nair", roleNames: ["investigator"] },
  { username: "supervisor1", displayName: "Vikram Rao", roleNames: ["supervisor"] },
  { username: "admin1", displayName: "System Admin", roleNames: ["admin"] },
];
const DEMO_PASSWORD = "demo-pass-1234";

async function main() {
  for (const name of ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users: { id: string; username: string }[] = [];
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { username: u.username, displayName: u.displayName, passwordHash },
    });
    users.push(user);
    for (const roleName of u.roleNames) {
      const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
  }

  const demoCase = await prisma.case.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      title: "Demo Case — NCR Network",
      status: "open",
      sensitivity: "standard",
      createdById: users.find((u) => u.username === "admin1")!.id,
    },
  });

  const investigator = users.find((u) => u.username === "investigator1")!;
  const supervisor = users.find((u) => u.username === "supervisor1")!;
  for (const [user, accessLevel] of [
    [investigator, "contribute"],
    [supervisor, "manage"],
  ] as const) {
    await prisma.caseAssignment.upsert({
      where: { caseId_userId: { caseId: demoCase.id, userId: user.id } },
      update: {},
      create: { caseId: demoCase.id, userId: user.id, accessLevel, grantedById: users.find((u) => u.username === "admin1")!.id },
    });
  }

  console.log(`Seeded ${DEMO_USERS.length} demo users (password: "${DEMO_PASSWORD}") and 1 demo case.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
