import { extractEncKey, getCacheKey } from "../src/lib/cache";

const testUrl =
  "https://sscexams.cbexams.com/CGLE2026jsdgheQchallengemshetsOct5/ViewCandResponse.aspx?EncKey=tgci650tgcimd";

console.log("Extracted EncKey:", extractEncKey(testUrl));
console.log("Cache Key:", getCacheKey(testUrl));

if (extractEncKey(testUrl) === "tgci650tgcimd") {
  console.log("✅ EncKey normalization verified!");
} else {
  console.error("❌ EncKey normalization failed!");
  process.exit(1);
}
