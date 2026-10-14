const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");

let testEnv;

describe("Firestore Security Rules Suite", function () {
  this.timeout(10000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "medicare-test-project",
      firestore: {
        rules: fs.readFileSync(path.join(__dirname, "../firestore.rules"), "utf8"),
        host: "127.0.0.1",
        port: 8080
      }
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    if (testEnv) await testEnv.clearFirestore();
  });

  // Test a: User A cannot read or write User B's data
  it("a) User A cannot read or write User B's data", async () => {
    const alice = testEnv.authenticatedContext("alice");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("users").doc("bob").collection("medicines").doc("m1").set({
        name: "Aspirin"
      });
    });

    await assertFails(alice.firestore().collection("users").doc("bob").collection("medicines").doc("m1").get());
    await assertFails(alice.firestore().collection("users").doc("bob").collection("medicines").doc("m1").set({ name: "Hacked" }));
  });

  // Test b: Unauthenticated user cannot read or write anything
  it("b) Unauthenticated user cannot read or write anything", async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().collection("users").doc("alice").collection("medicines").doc("m1").get());
    await assertFails(unauth.firestore().collection("users").doc("alice").collection("medicines").doc("m1").set({ name: "Test" }));
  });

  // Test c: Pending caregiver cannot read patient data
  it("c) Pending caregiver cannot read patient data", async () => {
    const caregiver = testEnv.authenticatedContext("caregiver1");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").set({ name: "Paracetamol" });
      await context.firestore().collection("users").doc("patient1").collection("caregiverRequests").doc("caregiver1").set({
        status: "pending"
      });
    });

    await assertFails(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").get());
  });

  // Test d: Approved caregiver CAN read medicines but CANNOT write or delete
  it("d) Approved caregiver CAN read medicines but CANNOT write or delete", async () => {
    const caregiver = testEnv.authenticatedContext("caregiver1");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").set({ name: "Paracetamol" });
      await context.firestore().collection("users").doc("patient1").collection("authorizedCaregivers").doc("caregiver1").set({
        status: "approved"
      });
    });

    // Approved caregiver CAN read
    await assertSucceeds(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").get());

    // Approved caregiver CANNOT write or delete
    await assertFails(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").set({ name: "Tampered" }));
    await assertFails(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").delete());
  });

  // Test e: User cannot write to rateLimits docs or authorizedCaregivers
  it("e) User cannot write to rateLimits docs or authorizedCaregivers (server-only)", async () => {
    const alice = testEnv.authenticatedContext("alice");
    await assertFails(alice.firestore().collection("users").doc("alice").collection("rateLimits").doc("askGemini").set({ count: 0 }));
    await assertFails(alice.firestore().collection("users").doc("alice").collection("authorizedCaregivers").doc("caregiver1").set({ status: "approved" }));
  });

  // Test f: Revoked caregiver loses access immediately
  it("f) Revoked caregiver loses access immediately", async () => {
    const caregiver = testEnv.authenticatedContext("caregiver1");

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").set({ name: "Paracetamol" });
      await context.firestore().collection("users").doc("patient1").collection("authorizedCaregivers").doc("caregiver1").set({
        status: "approved"
      });
    });

    // Verified access while approved
    await assertSucceeds(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").get());

    // Revoke caregiver
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().collection("users").doc("patient1").collection("authorizedCaregivers").doc("caregiver1").delete();
    });

    // Access fails immediately
    await assertFails(caregiver.firestore().collection("users").doc("patient1").collection("medicines").doc("m1").get());
  });
});
