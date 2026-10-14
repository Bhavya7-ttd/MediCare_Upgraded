const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");

let testEnv;

describe("Storage Security Rules Suite", function () {
  this.timeout(10000);

  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "medicare-test-project",
      storage: {
        rules: fs.readFileSync(path.join(__dirname, "../storage.rules"), "utf8"),
        host: "127.0.0.1",
        port: 9199
      }
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    if (testEnv) await testEnv.clearStorage();
  });

  it("User can upload JPEG prescription < 5MB to own folder", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const buffer = Buffer.alloc(1024 * 1024); // 1 MB
    await assertSucceeds(alice.storage().ref("prescriptions/alice/prescription.jpg").put(buffer, { contentType: "image/jpeg" }));
  });

  it("User cannot upload file > 5MB", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const buffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
    await assertFails(alice.storage().ref("prescriptions/alice/large.jpg").put(buffer, { contentType: "image/jpeg" }));
  });

  it("User cannot upload invalid MIME types (e.g. executable/text)", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const buffer = Buffer.from("malicious script");
    await assertFails(alice.storage().ref("prescriptions/alice/script.exe").put(buffer, { contentType: "application/x-msdownload" }));
  });

  it("User A cannot read or write User B's storage files", async () => {
    const alice = testEnv.authenticatedContext("alice");
    const buffer = Buffer.alloc(1024);
    await assertFails(alice.storage().ref("prescriptions/bob/stolen.jpg").put(buffer, { contentType: "image/jpeg" }));
    await assertFails(alice.storage().ref("prescriptions/bob/doc.pdf").getDownloadURL());
  });
});
